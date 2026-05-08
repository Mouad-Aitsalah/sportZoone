const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { Prisma } = require("@prisma/client");
const prisma = require("../config/prisma");
const { createHttpError } = require("../utils/httpError");
const { validateSchema } = require("../utils/validation");
const {
  loginSchema,
  customerCreateSchema,
  customerCreditPaymentSchema,
  salePaymentSchema,
  saleCreateSchema,
  refundCreateSchema,
  stockEntrySchema,
  stockCorrectionSchema,
} = require("../utils/validationSchemas");
const { isEmailConfigured } = require("../services/emailService");
const {
  getReportStatus,
  setReportStatus,
} = require("../services/reportSettings");
const {
  getOrganisationIdFromUser,
  withOrganisation,
  ensureEmployeeStoreAccess,
  ensureEmployeeCashRegisterAccess,
} = require("../utils/organisationScope");
const {
  COMPTE_TYPES,
  buildNextNumeroClient,
  buildNextNumeroCompte,
  compteInclude,
  toApiCustomerFromCompte,
  toApiSupplierFromCompte,
  resolveCustomerCompte,
  getCompteById,
} = require("../services/compteService");
const {
  ensureOpenCashSession,
  recalculateCashSessionMetrics,
} = require("../services/cashSessionService");
const {
  buildAnnualDocumentNumber,
} = require("../services/annualSequenceService");
const {
  buildProductVariantKey,
  getVariantColor,
  getVariantLabel,
  getVariantSize,
  sumVariantStock,
  toApiVariant,
} = require("../services/productVariantService");

const isBlankString = (value) => typeof value === "string" && value.trim() === "";

const normalizeRequiredString = (value) => String(value || "").trim();

const normalizeOptionalString = (value) => {
  if (value === undefined || value === null) {
    return null;
  }

  const normalizedValue = String(value).trim();
  return normalizedValue === "" ? null : normalizedValue;
};

const parseIntegerWithMin = (value, min) => {
  if (value === undefined || value === null || isBlankString(value)) {
    return NaN;
  }

  const parsedValue = Number(value);
  return Number.isInteger(parsedValue) && parsedValue >= min ? parsedValue : NaN;
};

const parsePositiveInteger = (value) => parseIntegerWithMin(value, 1);

const parseNonNegativeInteger = (value) => parseIntegerWithMin(value, 0);

const parseOptionalPositiveInteger = (value) => {
  if (value === undefined || value === null || isBlankString(value)) {
    return null;
  }

  return parsePositiveInteger(value);
};

const PAYMENT_METHOD_ALIASES = {
  cash: "cash",
  card: "card",
  credit: "credit",
  transfer: "transfer",
  bank_transfer: "transfer",
  "bank-transfer": "transfer",
  mobile_money: "mobile_money",
  "mobile-money": "mobile_money",
  mobilemoney: "mobile_money",
  partial: "partial",
  partial_payment: "partial",
  "partial-payment": "partial",
  paiement_partiel: "partial",
  "paiement-partiel": "partial",
  other: "other",
};

const SALE_TOTAL_TOLERANCE = new Prisma.Decimal("0.01");

const getPaginationParams = (query) => {
  const rawPage = query.page;
  const rawLimit = query.limit;

  const page =
    rawPage === undefined || rawPage === null || isBlankString(rawPage)
      ? 1
      : parsePositiveInteger(rawPage);
  const limit =
    rawLimit === undefined || rawLimit === null || isBlankString(rawLimit)
      ? 20
      : parsePositiveInteger(rawLimit);

  if (Number.isNaN(page) || Number.isNaN(limit)) {
    throw createHttpError(400, "page and limit must be valid positive integers.");
  }

  return {
    page,
    limit,
    skip: (page - 1) * limit,
  };
};

const buildPaginatedResponse = ({ data, page, limit, total }) => ({
  data,
  pagination: {
    page,
    limit,
    total,
    totalPages: total === 0 ? 0 : Math.ceil(total / limit),
  },
});

const logControllerDuration = (route, startedAt, metadata = {}) => {
  console.info(`[perf] ${route}`, {
    durationMs: Date.now() - startedAt,
    ...metadata,
  });
};

const withTimedStep = async (label, callback) => {
  console.time(label);

  try {
    return await callback();
  } finally {
    console.timeEnd(label);
  }
};

const runTimedStep = (label, callback) => {
  console.time(label);

  try {
    return callback();
  } finally {
    console.timeEnd(label);
  }
};

const saleCustomerCompteSelect = {
  id: true,
  nom: true,
  clientSource: {
    select: {
      id: true,
      nom: true,
      numeroClient: true,
      credit: true,
    },
  },
};

const normalizePaymentMethod = (value) => {
  const normalizedValue = normalizeRequiredString(value).toLowerCase();
  return PAYMENT_METHOD_ALIASES[normalizedValue] || null;
};

const createToken = (user) =>
  jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      organisationId: user.organisationId,
      pointDeVenteId: user.pointDeVenteId,
      caisseId: user.caisseId,
    },
    process.env.JWT_SECRET,
    {
      expiresIn: process.env.JWT_EXPIRES_IN || "7d",
    }
  );

const mapRoleToApi = (role) => {
  if (role === "SUPER_ADMIN") {
    return "super_admin";
  }

  if (role === "ADMIN_GLOBAL") {
    return "admin_global";
  }

  return role === "ADMIN" ? "admin" : "employe";
};

const decimalToNumber = (value) => {
  if (value instanceof Prisma.Decimal) {
    return Number(value.toString());
  }

  if (typeof value === "string") {
    return Number(value);
  }

  return Number(value || 0);
};

const toApiUser = (user) => ({
  id: user.id,
  name: user.nom,
  email: user.email,
  role: mapRoleToApi(user.role),
  organisationId: user.organisationId,
  organisationName: user.organisation?.name || null,
  storeId: user.pointDeVenteId,
  storeName: user.pointDeVente ? user.pointDeVente.nom : null,
  cashRegisterId: user.caisseId,
  cashRegisterName: user.caisse ? user.caisse.nom : null,
});

const toApiCashRegister = (caisse) => ({
  id: caisse.id,
  name: caisse.nom,
  code: caisse.code,
  organisationId: caisse.organisationId,
  storeId: caisse.pointDeVenteId,
  storeName: caisse.pointDeVente ? caisse.pointDeVente.nom : null,
  isActive: caisse.estActive,
});

const buildEmptySalesStats = () => ({
  quantitySold: 0,
  revenue: 0,
  ticketsCount: 0,
});

const toApiProduct = (product, salesStats = null) => {
  const normalizedSalesStats = salesStats || buildEmptySalesStats();
  const variants = (product.variantes || []).map((variant) => {
    const variantStats =
      normalizedSalesStats.variantStats?.get(variant.id) || buildEmptySalesStats();

    return {
      ...toApiVariant(variant, product),
      quantitySold: Number(variantStats.quantitySold || 0),
      revenue: Number(variantStats.revenue || 0),
      ticketsCount: Number(variantStats.ticketsCount || 0),
    };
  });
  const activeVariants = variants.filter((variant) => variant.active);

  return {
  id: product.id,
  name: product.nom,
  barcode: product.codeBarres,
  organisationId: product.organisationId,
  categoryId: product.categorieProduit?.id || product.categorieId || null,
  categoryCode: product.categorieProduit?.code || null,
  category: product.categorieProduit?.nom || product.categorie,
  categoryFullName: product.categorieProduit?.nomComplet || product.categorie,
  purchasePrice: decimalToNumber(product.prixAchat),
  salePrice: decimalToNumber(product.prixVente),
  vatRate: decimalToNumber(product.tauxTVA),
  tauxTVA: decimalToNumber(product.tauxTVA),
  retailPrice: decimalToNumber(product.prixDetail),
  prixDetail: decimalToNumber(product.prixDetail),
  wholesalePrice: decimalToNumber(product.prixGros),
  prixGros: decimalToNumber(product.prixGros),
  miniWholesalePrice: decimalToNumber(product.prixMiniGros),
  prixMiniGros: decimalToNumber(product.prixMiniGros),
  compteId: product.fournisseur?.compte?.id || product.fournisseurId,
  supplierCompteId: product.fournisseur?.compte?.id || product.fournisseurId,
  supplierId: product.fournisseur?.compte?.id || product.fournisseurId,
  supplierName:
    product.fournisseur?.compte?.nom || product.fournisseur?.nom || null,
  active: product.estActif,
  stock:
    product.stock !== undefined && product.stock !== null
      ? Number(product.stock)
      : sumVariantStock(variants),
  minimumThreshold: Number(product.seuilMinimum || 0),
  quantitySold: Number(normalizedSalesStats.quantitySold || 0),
  revenue: Number(normalizedSalesStats.revenue || 0),
  ticketsCount: Number(normalizedSalesStats.ticketsCount || 0),
  hasMultipleVariants: activeVariants.length > 1,
  variants,
  };
};

const buildVariantSummary = (variant, product = null) => ({
  id: variant?.id || null,
  size: getVariantSize(variant),
  color: getVariantColor(variant),
  label: getVariantLabel(variant),
  barcode: variant?.codeBarres || null,
  salePrice:
    variant?.prixVente === null || variant?.prixVente === undefined
      ? variant?.salePrice === null || variant?.salePrice === undefined
        ? decimalToNumber(product?.prixVente ?? product?.prixDetail)
        : Number(variant.salePrice)
      : decimalToNumber(variant.prixVente),
  purchasePrice:
    variant?.prixAchat === null || variant?.prixAchat === undefined
      ? variant?.purchasePrice === null || variant?.purchasePrice === undefined
        ? decimalToNumber(product?.prixAchat)
        : Number(variant.purchasePrice)
      : decimalToNumber(variant.prixAchat),
  stock: Number(variant?.quantiteStock ?? variant?.stock ?? 0),
  minimumThreshold: Number(variant?.seuilMinimum ?? product?.seuilMinimum ?? 0),
  active:
    variant?.actif === undefined && variant?.active === undefined
      ? true
      : Boolean(variant?.actif ?? variant?.active),
});

const toApiCustomer = (compte) => toApiCustomerFromCompte(compte);

const buildCustomerSummary = (compte) => toApiCustomerFromCompte(compte);

const toApiCustomerPayment = (paiement) => ({
  id: paiement.id,
  date: paiement.createdAt,
  amount: decimalToNumber(paiement.montant),
  note: paiement.note || "",
});

const getDecimalValue = (value) => {
  if (value instanceof Prisma.Decimal) {
    return value;
  }

  if (value === undefined || value === null || value === "") {
    return new Prisma.Decimal(0);
  }

  return new Prisma.Decimal(value);
};

const getLinePurchasePrice = (line) => {
  if (line?.variante?.prixAchat !== undefined && line?.variante?.prixAchat !== null) {
    return getDecimalValue(line.variante.prixAchat);
  }

  return getDecimalValue(line?.produit?.prixAchat);
};

const getLineTotalPurchase = (line) => {
  const purchasePrice = getLinePurchasePrice(line);
  const quantity = getDecimalValue(line?.quantite).abs();
  const subtotal = getDecimalValue(line?.sousTotal);
  const totalPurchase = purchasePrice.times(quantity);

  return subtotal.lessThan(0) ? totalPurchase.mul(-1) : totalPurchase;
};

const getLineNetProfit = (line) => {
  const unitSalePrice = getDecimalValue(line?.prixUnitaire).abs();
  const purchasePrice = getLinePurchasePrice(line);
  const quantity = getDecimalValue(line?.quantite).abs();
  const subtotal = getDecimalValue(line?.sousTotal);
  const grossMargin = unitSalePrice.minus(purchasePrice).times(quantity);

  return subtotal.lessThan(0) ? grossMargin.mul(-1) : grossMargin;
};

const getStockStatusMeta = (quantity, minimumThreshold) => {
  if (quantity === 0) {
    return {
      status: "Rupture",
      isLowStock: true,
      severity: "critical",
    };
  }

  if (quantity <= minimumThreshold) {
    return {
      status: "Stock faible",
      isLowStock: true,
      severity: "warning",
    };
  }

  return {
    status: "Disponible",
    isLowStock: false,
    severity: "normal",
  };
};

const toApiStock = (stock, options = {}) => {
  const { includeFinancialFields = true } = options;
  const minimumThreshold =
    stock.minimumThreshold ??
    stock.variante?.seuilMinimum ??
    stock.produit?.seuilMinimum ??
    0;
  const quantity =
    stock.quantity ?? stock.quantite ?? stock.variante?.quantiteStock ?? 0;
  const purchasePrice =
    stock.purchasePrice ??
    stock.variante?.prixAchat ??
    stock.produit?.prixAchat ??
    0;
  const statusMeta = getStockStatusMeta(quantity, minimumThreshold);
  const variantSize = stock.variantSize ?? getVariantSize(stock.variante);
  const variantColor = stock.variantColor ?? getVariantColor(stock.variante);
  const variantLabel =
    stock.variantLabel ?? (stock.variante ? getVariantLabel(stock.variante) : null);

  const apiStock = {
    id: stock.id,
    productId: stock.productId ?? stock.produitId,
    productName: stock.productName ?? stock.produit?.nom ?? "",
    variantId: stock.variantId ?? stock.varianteId ?? stock.variante?.id ?? null,
    variantSize,
    variantColor,
    variantLabel,
    barcode: stock.barcode ?? stock.produit?.codeBarres ?? "",
    storeId: stock.storeId ?? stock.pointDeVenteId,
    storeName: stock.storeName ?? stock.pointDeVente?.nom ?? "",
    quantity,
    minimumThreshold,
    status: statusMeta.status,
    isLowStock: statusMeta.isLowStock,
    severity: statusMeta.severity,
  };

  if (includeFinancialFields) {
    apiStock.purchasePrice = decimalToNumber(purchasePrice);
  }

  return apiStock;
};

const buildReturnedQuantitiesMap = (retours = []) => {
  const returnedQuantities = new Map();

  for (const retour of retours) {
    returnedQuantities.set(
      retour.produitId,
      (returnedQuantities.get(retour.produitId) || 0) + retour.quantite
    );
  }

  return returnedQuantities;
};

const buildReturnedVariantQuantitiesMap = (retours = []) => {
  const returnedQuantities = new Map();

  for (const retour of retours) {
    const key = buildProductVariantKey(retour.produitId, retour.varianteId);
    returnedQuantities.set(key, (returnedQuantities.get(key) || 0) + retour.quantite);
  }

  return returnedQuantities;
};

const getStartOfDay = (date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);

const getEndOfDay = (date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);

const getStartOfWeek = (date) => {
  const start = getStartOfDay(date);
  const day = start.getDay();
  const diff = day === 0 ? -6 : 1 - day;

  start.setDate(start.getDate() + diff);
  return start;
};

const getEndOfWeek = (date) => {
  const end = getStartOfWeek(date);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
};

const getStartOfMonth = (date) =>
  new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);

const getEndOfMonth = (date) =>
  new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);

const getDateRange = (period) => {
  const now = new Date();

  if (period === "day") {
    return {
      startDate: getStartOfDay(now),
      endDate: getEndOfDay(now),
    };
  }

  if (period === "week") {
    return {
      startDate: getStartOfWeek(now),
      endDate: getEndOfWeek(now),
    };
  }

  if (period === "month") {
    return {
      startDate: getStartOfMonth(now),
      endDate: getEndOfMonth(now),
    };
  }

  return null;
};

const getAnalyticsDateRange = (period) => {
  const now = new Date();
  const endDate = getEndOfDay(now);

  if (period === "week") {
    const startDate = getStartOfDay(new Date(now));
    startDate.setDate(startDate.getDate() - 6);

    return {
      startDate,
      endDate,
    };
  }

  if (period === "month") {
    return {
      startDate: getStartOfMonth(now),
      endDate,
    };
  }

  return null;
};

const formatAnalyticsDateKey = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

const formatAnalyticsLabel = (date, period) => {
  if (period === "week") {
    return date.toLocaleDateString("fr-MA", {
      weekday: "short",
    });
  }

  return date.toLocaleDateString("fr-MA", {
    day: "2-digit",
    month: "2-digit",
  });
};

const buildAnalyticsBuckets = (period, startDate, endDate) => {
  const buckets = [];
  const cursor = new Date(startDate);

  while (cursor <= endDate) {
    buckets.push({
      key: formatAnalyticsDateKey(cursor),
      label: formatAnalyticsLabel(cursor, period),
    });
    cursor.setDate(cursor.getDate() + 1);
  }

  return buckets;
};

const getEmployeeStoreId = (user) => {
  if (user.role !== "EMPLOYE") {
    return null;
  }

  return user.pointDeVenteId || null;
};

const getEmployeeCashRegisterId = (user) => {
  if (user.role !== "EMPLOYE") {
    return null;
  }

  return user.caisseId || null;
};

const getPrimaryStore = async (organisationId, db = prisma) =>
  db.pointDeVente.findFirst({
    where: {
      organisationId,
    },
    select: {
      id: true,
      nom: true,
    },
    orderBy: [{ id: "asc" }],
  });

const getPrimaryCashRegister = async (organisationId, pointDeVenteId, db = prisma) =>
  db.caisse.findFirst({
    where: {
      organisationId,
      ...(pointDeVenteId ? { pointDeVenteId } : {}),
    },
    select: {
      id: true,
      nom: true,
      pointDeVenteId: true,
      estActive: true,
    },
    orderBy: [{ id: "asc" }],
  });

const getSingleStoreContext = async (organisationId, db = prisma) => {
  const store = await getPrimaryStore(organisationId, db);
  const cashRegister = store
    ? await getPrimaryCashRegister(organisationId, store.id, db)
    : null;

  return { store, cashRegister };
};

const getDefaultCustomer = async (user, db = prisma) => {
  const defaultCustomer = await db.client.findFirst({
    where: {
      organisationId: getOrganisationIdFromUser(user),
      numeroClient: 1,
    },
  });

  if (!defaultCustomer) {
    throw createHttpError(
      500,
      'Default customer "Client inconnu" is missing. Run the database seed again.'
    );
  }

  return defaultCustomer;
};

const getDefaultCustomerCompte = async (user, db = prisma) => {
  const organisationId = getOrganisationIdFromUser(user);
  const defaultCustomer = await getDefaultCustomer(user, db);
  const defaultCompte = await db.compte.findFirst({
    where: {
      organisationId,
      type: COMPTE_TYPES.CLIENT,
      clientSourceId: defaultCustomer.id,
    },
    include: {
      clientSource: true,
    },
  });

  if (!defaultCompte) {
    throw createHttpError(
      500,
      'Le compte par defaut "Client inconnu" est manquant.'
    );
  }

  return defaultCompte;
};

const ensureProductAndStoreExist = async (user, produitId, pointDeVenteId) => {
  const organisationId = getOrganisationIdFromUser(user);
  const [produit, pointDeVente] = await Promise.all([
    prisma.produit.findUnique({
      where: {
        id: produitId,
      },
      select: {
        id: true,
        organisationId: true,
        estActif: true,
      },
    }),
    prisma.pointDeVente.findUnique({
      where: {
        id: pointDeVenteId,
      },
      select: {
        id: true,
        organisationId: true,
      },
    }),
  ]);

  if (!produit || produit.organisationId !== organisationId) {
    throw createHttpError(404, "Product not found.");
  }

  if (!produit.estActif) {
    throw createHttpError(400, "Product is inactive.");
  }

  if (!pointDeVente || pointDeVente.organisationId !== organisationId) {
    throw createHttpError(404, "Store not found.");
  }
};

const ensureVariantForProduct = async (organisationId, produitId, varianteId) => {
  const variant = await prisma.produitVariante.findFirst({
    where: {
      organisationId,
      produitId,
      id: varianteId,
    },
  });

  if (!variant) {
    throw createHttpError(404, "Product variant not found.");
  }

  return variant;
};

const isEmptyRequestBody = (body) =>
  !body ||
  (typeof body === "object" &&
    !Array.isArray(body) &&
    Object.keys(body).length === 0);

const parseRequiredNumber = (value, message) => {
  if (
    value === undefined ||
    value === null ||
    isBlankString(value) ||
    (typeof value !== "number" && typeof value !== "string")
  ) {
    throw createHttpError(400, message, "BAD_REQUEST");
  }

  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    throw createHttpError(400, message, "BAD_REQUEST");
  }

  return numericValue;
};

const validatePositiveInteger = (value, fieldName) => {
  const message = `${fieldName} must be a positive integer`;
  const numericValue = parseRequiredNumber(value, message);

  if (!Number.isInteger(numericValue) || numericValue <= 0) {
    throw createHttpError(400, message, "BAD_REQUEST");
  }

  return numericValue;
};

const validatePositiveNumber = (value, fieldName) => {
  const message = `${fieldName} must be a positive number`;
  const numericValue = parseRequiredNumber(value, message);

  if (numericValue <= 0) {
    throw createHttpError(400, message, "BAD_REQUEST");
  }

  return numericValue;
};

const validateNonNegativeNumber = (value, fieldName) => {
  const message = `${fieldName} must be a number greater than or equal to 0`;
  const numericValue = parseRequiredNumber(value, message);

  if (numericValue < 0) {
    throw createHttpError(400, message, "BAD_REQUEST");
  }

  return numericValue;
};

const getAliasedValue = (source, primaryField, aliasField) =>
  source?.[primaryField] !== undefined ? source[primaryField] : source?.[aliasField];

const normalizeSaleItems = (items) => {
  if (items === undefined || items === null) {
    throw createHttpError(400, "items is required", "BAD_REQUEST");
  }

  if (!Array.isArray(items)) {
    throw createHttpError(400, "items must be an array", "BAD_REQUEST");
  }

  if (items.length === 0) {
    throw createHttpError(400, "items cannot be empty", "BAD_REQUEST");
  }

  const groupedItems = new Map();

  for (const item of items) {
    const productId = validatePositiveInteger(
      getAliasedValue(item, "productId", "produitId"),
      "productId"
    );
    const rawVariantId = getAliasedValue(item, "variantId", "varianteId");
    const variantId =
      rawVariantId === undefined || rawVariantId === null || isBlankString(rawVariantId)
        ? null
        : validatePositiveInteger(rawVariantId, "variantId");
    const quantity = validatePositiveNumber(
      getAliasedValue(item, "quantity", "quantite"),
      "quantity"
    );
    const unitPrice = validatePositiveNumber(
      getAliasedValue(item, "unitPrice", "prixUnitaire"),
      "unitPrice"
    );

    const itemKey = `${buildProductVariantKey(productId, variantId)}:${unitPrice}`;
    const existingItem = groupedItems.get(itemKey);

    groupedItems.set(itemKey, {
      productId,
      variantId,
      quantity: (existingItem?.quantity || 0) + quantity,
      unitPrice,
    });
  }

  return Array.from(groupedItems.values());
};

const normalizeReturnItems = (items) => {
  if (items === undefined || items === null) {
    throw createHttpError(400, "items is required", "BAD_REQUEST");
  }

  if (!Array.isArray(items)) {
    throw createHttpError(400, "items must be an array", "BAD_REQUEST");
  }

  if (items.length === 0) {
    throw createHttpError(400, "items cannot be empty", "BAD_REQUEST");
  }

  const groupedItems = new Map();

  for (const item of items) {
    const productId = validatePositiveInteger(
      getAliasedValue(item, "productId", "produitId"),
      "productId"
    );
    const rawVariantId = getAliasedValue(item, "variantId", "varianteId");
    const variantId =
      rawVariantId === undefined || rawVariantId === null || isBlankString(rawVariantId)
        ? null
        : validatePositiveInteger(rawVariantId, "variantId");
    const quantity = validatePositiveNumber(
      getAliasedValue(item, "quantity", "quantite"),
      "quantity"
    );

    const itemKey = buildProductVariantKey(productId, variantId);
    const existingItem = groupedItems.get(itemKey);

    groupedItems.set(itemKey, {
      productId,
      variantId,
      quantity: (existingItem?.quantity || 0) + quantity,
    });
  }

  return Array.from(groupedItems.values());
};

const normalizeRefundItems = (items) => {
  if (items === undefined || items === null) {
    throw createHttpError(400, "items is required", "BAD_REQUEST");
  }

  if (!Array.isArray(items) || items.length === 0) {
    throw createHttpError(400, "items must be a non-empty array", "BAD_REQUEST");
  }

  const groupedItems = new Map();

  for (const item of items) {
    const productId = validatePositiveInteger(
      getAliasedValue(item, "productId", "produitId"),
      "productId"
    );
    const rawVariantId = getAliasedValue(item, "variantId", "varianteId");
    const variantId =
      rawVariantId === undefined || rawVariantId === null || isBlankString(rawVariantId)
        ? null
        : validatePositiveInteger(rawVariantId, "variantId");
    const quantity = validatePositiveNumber(
      getAliasedValue(item, "quantity", "quantite"),
      "quantity"
    );
    const rawUnitPrice = getAliasedValue(item, "unitPrice", "prixUnitaire");
    const unitPrice =
      rawUnitPrice === undefined
        ? null
        : validateNonNegativeNumber(rawUnitPrice, "unitPrice");
    const itemKey = buildProductVariantKey(productId, variantId);
    const existingItem = groupedItems.get(itemKey);

    groupedItems.set(itemKey, {
      productId,
      variantId,
      quantity: (existingItem?.quantity || 0) + quantity,
      unitPrice: unitPrice ?? existingItem?.unitPrice ?? null,
    });
  }

  return Array.from(groupedItems.values());
};

const extractCityFromAddress = (address) => {
  if (!address) {
    return "";
  }

  const parts = String(address)
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  return parts.length > 1 ? parts[parts.length - 1] : "";
};

const createStockMovement = async (
  db,
  { organisationId, productId, storeId, quantity, type, reason = null }
) =>
  db.stockMovement.create({
    data: {
      organisationId,
      produitId: productId,
      pointDeVenteId: storeId,
      quantite: quantity,
      type,
      reason: normalizeOptionalString(reason),
    },
  });

const restoreStockForProduct = async (
  db,
  {
    organisationId,
    productId,
    variantId = null,
    storeId,
    quantity,
    type,
    reason = null,
  }
) => {
  if (variantId) {
    await db.produitVariante.update({
      where: {
        id: variantId,
      },
      data: {
        quantiteStock: {
          increment: quantity,
        },
      },
    });
  }

  await db.stock.upsert({
    where: {
      organisationId_produitId_pointDeVenteId: {
        organisationId,
        produitId: productId,
        pointDeVenteId: storeId,
      },
    },
    update: {
      quantite: {
        increment: quantity,
      },
    },
    create: {
      organisationId,
      produitId: productId,
      pointDeVenteId: storeId,
      quantite: quantity,
    },
  });

  await createStockMovement(db, {
    organisationId,
    productId,
    storeId,
    quantity,
    type,
    reason,
  });
};

const syncAggregateStockForProduct = async (db, organisationId, productId, storeId) => {
  const variantAggregate = await db.produitVariante.aggregate({
    where: {
      organisationId,
      produitId: productId,
    },
    _sum: {
      quantiteStock: true,
    },
  });

  await db.stock.upsert({
    where: {
      organisationId_produitId_pointDeVenteId: {
        organisationId,
        produitId: productId,
        pointDeVenteId: storeId,
      },
    },
    update: {
      quantite: variantAggregate._sum.quantiteStock || 0,
    },
    create: {
      organisationId,
      produitId: productId,
      pointDeVenteId: storeId,
      quantite: variantAggregate._sum.quantiteStock || 0,
    },
  });
};

const adjustVariantAndAggregateStock = async (
  db,
  { organisationId, productId, variantId, storeId, quantityDelta, reason, type }
) => {
  await db.produitVariante.update({
    where: {
      id: variantId,
    },
    data: {
      quantiteStock:
        quantityDelta >= 0
          ? {
              increment: quantityDelta,
            }
          : {
              decrement: Math.abs(quantityDelta),
            },
    },
  });

  await syncAggregateStockForProduct(db, organisationId, productId, storeId);

  await createStockMovement(db, {
    organisationId,
    productId,
    storeId,
    quantity: quantityDelta,
    type,
    reason,
  });
};

const ensureResolvedVariant = ({
  item,
  product,
  variantsByProductId,
}) => {
  if (item.variantId) {
    const variant = (variantsByProductId.get(item.productId) || []).find(
      (candidate) => candidate.id === item.variantId
    );

    if (!variant) {
      throw createHttpError(
        400,
        `Variant ${item.variantId} is invalid for product ${product.nom}.`
      );
    }

    return variant;
  }

  const activeVariants = (variantsByProductId.get(item.productId) || []).filter(
    (variant) => variant.actif
  );

  if (activeVariants.length !== 1) {
    throw createHttpError(
      400,
      `A variant selection is required for product ${product.nom}.`
    );
  }

  return activeVariants[0];
};

const login = async (req, res) => {
  const { email: validatedEmail, password } = validateSchema(loginSchema, {
    email: req.body.email,
    password: req.body.password,
  });
  const email = validatedEmail.toLowerCase();

  if (!process.env.JWT_SECRET) {
    throw createHttpError(500, "JWT_SECRET is missing in the configuration.");
  }

  const user = await prisma.utilisateur.findUnique({
    where: { email },
    include: {
      organisation: {
        select: {
          name: true,
        },
      },
      pointDeVente: {
        select: {
          nom: true,
        },
      },
      caisse: {
        select: {
          nom: true,
        },
      },
    },
  });

  if (!user) {
    throw createHttpError(401, "Invalid email or password.", "INVALID_CREDENTIALS");
  }

  if (!user.estActif) {
    throw createHttpError(403, "This account is disabled.", "ACCOUNT_DISABLED");
  }

  const isPasswordValid = await bcrypt.compare(password, user.motDePasse);

  if (!isPasswordValid) {
    throw createHttpError(401, "Invalid email or password.", "INVALID_CREDENTIALS");
  }

  if (false) {
    if (false) {
      await ensureLoginApprovalRequest(user);

      return res.status(403).json({ message: "Access denied." });
    }

    throw createHttpError(
      403,
      "Votre accès a été refusé par l'administrateur.",
      "FORBIDDEN"
    );
  }

  return res.status(200).json({
    token: createToken(user),
    user: toApiUser(user),
  });
};

const getProducts = async (req, res) => {
  const startedAt = Date.now();
  const organisationId = getOrganisationIdFromUser(req.user);
  const productView = normalizeOptionalString(req.query.view)?.toLowerCase() || "default";
  const includeSalesStats =
    productView !== "pos" && String(req.query.includeSalesStats || "").toLowerCase() !== "false";
  const { page, limit, skip } = getPaginationParams(req.query);
  const productSelect = {
    id: true,
    nom: true,
    codeBarres: true,
    organisationId: true,
    categorie: true,
    categorieId: true,
    fournisseurId: true,
    prixAchat: true,
    prixVente: true,
    tauxTVA: true,
    prixDetail: true,
    prixGros: true,
    prixMiniGros: true,
    seuilMinimum: true,
    estActif: true,
    ...(productView === "pos"
      ? {}
      : {
          categorieProduit: {
            select: {
              id: true,
              code: true,
              nom: true,
              nomComplet: true,
            },
          },
          fournisseur: {
            select: {
              nom: true,
              compte: {
                select: {
                  id: true,
                  nom: true,
                },
              },
            },
          },
        }),
    variantes: {
      orderBy: [{ id: "asc" }],
      select: {
        id: true,
        taille: true,
        couleur: true,
        codeBarres: true,
        prixAchat: true,
        prixVente: true,
        quantiteStock: true,
        seuilMinimum: true,
        actif: true,
      },
    },
  };
  try {
    const [total, products] = await Promise.all([
      prisma.produit.count({
        where: {
          organisationId,
        },
      }),
      prisma.produit.findMany({
        where: {
          organisationId,
        },
        select: productSelect,
        orderBy: {
          id: "desc",
        },
        skip,
        take: limit,
      }),
    ]);

    const productIds = products.map((product) => product.id);
    const salesStatsByProductId = new Map();

    if (includeSalesStats && productIds.length > 0) {
      const saleLines = await prisma.venteLigne.findMany({
        where: {
          organisationId,
          produitId: {
            in: productIds,
          },
          vente: {
            organisationId,
            status: {
              notIn: ["cancelled", "refunded"],
            },
            total: {
              gt: 0,
            },
          },
        },
        select: {
          produitId: true,
          varianteId: true,
          venteId: true,
          quantite: true,
          sousTotal: true,
        },
      });

      for (const line of saleLines) {
        const productId = line.produitId;
        const variantId = line.varianteId || null;
        const productStats =
          salesStatsByProductId.get(productId) ||
          {
            ...buildEmptySalesStats(),
            ticketIds: new Set(),
            variantStats: new Map(),
          };

        productStats.quantitySold += Number(line.quantite || 0);
        productStats.revenue += decimalToNumber(line.sousTotal || 0);
        productStats.ticketIds.add(line.venteId);
        productStats.ticketsCount = productStats.ticketIds.size;

        if (variantId) {
          const variantStats =
            productStats.variantStats.get(variantId) ||
            {
              ...buildEmptySalesStats(),
              ticketIds: new Set(),
            };

          variantStats.quantitySold += Number(line.quantite || 0);
          variantStats.revenue += decimalToNumber(line.sousTotal || 0);
          variantStats.ticketIds.add(line.venteId);
          variantStats.ticketsCount = variantStats.ticketIds.size;
          productStats.variantStats.set(variantId, variantStats);
        }

        salesStatsByProductId.set(productId, productStats);
      }
    }

    return res.status(200).json(
      buildPaginatedResponse({
        data: products.map((product) =>
          toApiProduct(product, salesStatsByProductId.get(product.id))
        ),
        page,
        limit,
        total,
      })
    );
  } finally {
    logControllerDuration("GET /api/products", startedAt, {
      organisationId,
      page,
      limit,
      view: productView,
      includeSalesStats,
    });
  }
};

const getProductSales = async (req, res) => {
  const organisationId = getOrganisationIdFromUser(req.user);
  const productId = parsePositiveInteger(req.params.id);

  if (Number.isNaN(productId)) {
    throw createHttpError(400, "product id must be a valid positive integer.");
  }

  const product = await prisma.produit.findFirst({
    where: {
      id: productId,
      organisationId,
    },
    select: {
      id: true,
      nom: true,
    },
  });

  if (!product) {
    throw createHttpError(404, "Product not found.");
  }

  const saleLines = await prisma.venteLigne.findMany({
    where: {
      organisationId,
      produitId: productId,
      vente: {
        organisationId,
        status: {
          not: "cancelled",
        },
      },
    },
    include: {
      vente: {
        select: {
          id: true,
          numeroTicket: true,
          dateVente: true,
          status: true,
          paymentStatus: true,
          paymentMethod: true,
          total: true,
          client: {
            select: {
              id: true,
              numeroClient: true,
              nom: true,
              compte: {
                select: {
                  id: true,
                  nom: true,
                },
              },
            },
          },
        },
      },
      variante: {
        select: {
          id: true,
          taille: true,
          couleur: true,
          codeBarres: true,
        },
      },
    },
    orderBy: [
      {
        vente: {
          dateVente: "desc",
        },
      },
      {
        id: "desc",
      },
    ],
  });

  return res.status(200).json({
    data: saleLines.map((line) => {
      const lineTotal = decimalToNumber(line.sousTotal);
      const quantity = Number(line.quantite || 0);
      const total = decimalToNumber(line.vente?.total);
      const type = total < 0 || lineTotal < 0 || quantity < 0 ? "refund" : "sale";

      return {
        id: line.id,
        saleId: line.venteId,
        productId,
        productName: product.nom,
        variantId: line.varianteId,
        variantLabel: line.variante ? getVariantLabel(line.variante) : null,
        variant: line.variante ? buildVariantSummary(line.variante) : null,
        ticketNumber: line.vente?.numeroTicket || "",
        date: line.vente?.dateVente || null,
        customerId: line.vente?.client?.compte?.id || line.vente?.client?.id || null,
        customerNumber: line.vente?.client?.numeroClient || null,
        customerName:
          line.vente?.client?.compte?.nom ||
          line.vente?.client?.nom ||
          "Client inconnu",
        quantity,
        unitPrice: decimalToNumber(line.prixUnitaire),
        lineTotal,
        total,
        status: line.vente?.status || null,
        paymentStatus: line.vente?.paymentStatus || null,
        paymentMethod: line.vente?.paymentMethod || null,
        type,
      };
    }),
  });
};

const getProductByBarcode = async (req, res) => {
  const organisationId = getOrganisationIdFromUser(req.user);
  const barcode = normalizeRequiredString(req.params.barcode);

  if (!barcode) {
    throw createHttpError(400, "barcode is required.");
  }

  let storeId = parseOptionalPositiveInteger(req.query.storeId);

  if (Number.isNaN(storeId)) {
    throw createHttpError(400, "storeId must be a valid positive integer.");
  }

  if (req.user.role === "EMPLOYE") {
    const employeeStoreId = getEmployeeStoreId(req.user);

    if (!employeeStoreId) {
      throw createHttpError(403, "Employee is not assigned to a store.");
    }

    storeId = employeeStoreId;
  } else if (!storeId) {
    storeId = (await getPrimaryStore(organisationId))?.id || null;
  }

  if (storeId) {
    const store = await prisma.pointDeVente.findUnique({
      where: {
        id: storeId,
      },
      select: { id: true, organisationId: true },
    });

    if (!store || store.organisationId !== organisationId) {
      throw createHttpError(404, "Store not found.");
    }
  }

  const matchedVariant = await prisma.produitVariante.findFirst({
    where: {
      organisationId,
      codeBarres: barcode,
      actif: true,
    },
    include: {
      produit: {
        include: {
          categorieProduit: {
            select: {
              id: true,
              code: true,
              nom: true,
              nomComplet: true,
            },
          },
          fournisseur: {
            select: {
              nom: true,
              compte: {
                select: {
                  id: true,
                  nom: true,
                },
              },
            },
          },
          variantes: {
            orderBy: [{ id: "asc" }],
          },
        },
      },
    },
  });

  const product = matchedVariant
    ? matchedVariant.produit
    : await prisma.produit.findFirst({
        where: {
          organisationId,
          codeBarres: barcode,
          estActif: true,
        },
        include: {
          categorieProduit: {
            select: {
              id: true,
              code: true,
              nom: true,
              nomComplet: true,
            },
          },
          fournisseur: {
            select: {
              nom: true,
              compte: {
                select: {
                  id: true,
                  nom: true,
                },
              },
            },
          },
          variantes: {
            orderBy: [{ id: "asc" }],
          },
        },
      });

  if (!product || !product.estActif) {
    throw createHttpError(404, "Product not found.");
  }

  const apiProduct = toApiProduct(product);
  const activeVariants = apiProduct.variants.filter((variant) => variant.active);
  const selectedVariant = matchedVariant
    ? apiProduct.variants.find((variant) => variant.id === matchedVariant.id) || null
    : activeVariants.length === 1
    ? activeVariants[0]
    : null;

  return res.status(200).json({
    ...apiProduct,
    requiresVariantSelection: !selectedVariant && activeVariants.length > 1,
    selectedVariant,
    scannedBarcode: barcode,
    salePrice: selectedVariant?.salePrice ?? apiProduct.salePrice,
    stock: selectedVariant?.stock ?? apiProduct.stock,
  });
};

const getStocks = async (req, res) => {
  const organisationId = getOrganisationIdFromUser(req.user);
  const employeeStoreId = getEmployeeStoreId(req.user);
  const { page, limit, skip } = getPaginationParams(req.query);
  const includeFinancialFields = req.user.role === "ADMIN";
  const primaryStore =
    req.user.role === "ADMIN" ? await getPrimaryStore(organisationId) : null;

  if (req.user.role === "EMPLOYE" && !employeeStoreId) {
    throw createHttpError(403, "Employee is not assigned to a store.");
  }

  const store = req.user.role === "ADMIN"
    ? primaryStore ||
      (await prisma.pointDeVente.findFirst({
        where: { organisationId },
        select: { id: true, nom: true },
        orderBy: { id: "asc" },
      }))
    : await prisma.pointDeVente.findFirst({
        where: {
          organisationId,
          id: employeeStoreId,
        },
        select: { id: true, nom: true },
      });

  const variantRows = await prisma.produitVariante.findMany({
    where: {
      organisationId,
      produit: {
        estActif: true,
      },
    },
    include: {
      produit: {
        select: {
          id: true,
          nom: true,
          codeBarres: true,
          seuilMinimum: true,
          prixAchat: true,
        },
      },
    },
    orderBy: [{ produit: { nom: "asc" } }, { id: "asc" }],
  });

  const allStockRows = variantRows.map((variant) =>
    toApiStock({
      id: variant.id,
      productId: variant.produitId,
      productName: variant.produit?.nom || "",
      variantId: variant.id,
      variantSize: getVariantSize(variant),
      variantColor: getVariantColor(variant),
      variantLabel: getVariantLabel(variant),
      barcode: variant.codeBarres || variant.produit?.codeBarres || "",
      storeId: store?.id || null,
      storeName: store?.nom || "",
      quantity: variant.quantiteStock,
      purchasePrice:
        variant.prixAchat === null || variant.prixAchat === undefined
          ? variant.produit?.prixAchat ?? 0
          : variant.prixAchat,
      minimumThreshold: variant.seuilMinimum ?? variant.produit?.seuilMinimum ?? 0,
    }, { includeFinancialFields })
  );

  const total = allStockRows.length;
  const stocks = allStockRows.slice(skip, skip + limit);

  return res.status(200).json(
    buildPaginatedResponse({
      data: stocks,
      page,
      limit,
      total,
    })
  );
};

const getStockAlerts = async (req, res) => {
  const organisationId = getOrganisationIdFromUser(req.user);
  const employeeStoreId = getEmployeeStoreId(req.user);
  const primaryStore =
    req.user.role === "ADMIN" ? await getPrimaryStore(organisationId) : null;

  if (req.user.role === "EMPLOYE" && !employeeStoreId) {
    throw createHttpError(403, "Employee is not assigned to a store.");
  }

  const store = req.user.role === "EMPLOYE"
    ? await prisma.pointDeVente.findFirst({
        where: {
          organisationId,
          id: employeeStoreId,
        },
        select: { id: true, nom: true },
      })
    : primaryStore ||
      (await prisma.pointDeVente.findFirst({
        where: { organisationId },
        select: { id: true, nom: true },
        orderBy: { id: "asc" },
      }));
  const variants = await prisma.produitVariante.findMany({
    where: {
      organisationId,
      actif: true,
      produit: {
        estActif: true,
      },
    },
    include: {
      produit: {
        select: {
          id: true,
          nom: true,
          seuilMinimum: true,
        },
      },
    },
  });

  const lowStockItems = [];

  for (const variant of variants) {
    const quantity = Number(variant.quantiteStock || 0);
    const minimumThreshold = Number(
      variant.seuilMinimum ?? variant.produit?.seuilMinimum ?? 0
    );
    const statusMeta = getStockStatusMeta(quantity, minimumThreshold);

    if (!statusMeta.isLowStock) {
      continue;
    }

    lowStockItems.push({
      id: variant.id,
      produitId: variant.produitId,
      produitNom: variant.produit?.nom || "",
      taille: getVariantSize(variant),
      couleur: getVariantColor(variant),
      variante: getVariantLabel(variant),
      magasin: store?.nom || "",
      magasinId: store?.id || null,
      quantite: quantity,
      seuilMinimum: minimumThreshold,
      isLowStock: true,
      severity: statusMeta.severity,
      status: statusMeta.status,
    });
  }

  lowStockItems.sort((a, b) => {
    if (a.quantite !== b.quantite) {
      return a.quantite - b.quantite;
    }

    return a.produitNom.localeCompare(b.produitNom, "fr");
  });

  return res.status(200).json(
    lowStockItems
  );
};

const stockIn = async (req, res) => {
  const organisationId = getOrganisationIdFromUser(req.user);
  const parsedInput = validateSchema(stockEntrySchema, {
    productId: req.body.productId,
    variantId: req.body.variantId,
    storeId: req.body.storeId,
    quantity: req.body.quantity,
    reason: req.body.reason,
  });
  const productId = parsePositiveInteger(parsedInput.productId);
  const variantId = parseOptionalPositiveInteger(parsedInput.variantId);
  const storeId = parsePositiveInteger(parsedInput.storeId);
  const quantity = parsePositiveInteger(parsedInput.quantity);
  const reason = normalizeOptionalString(parsedInput.reason);

  await ensureProductAndStoreExist(req.user, productId, storeId);
  if (Number.isNaN(variantId) || variantId === null) {
    throw createHttpError(400, "variantId must be a valid positive integer.");
  }

  const variant = await ensureVariantForProduct(organisationId, productId, variantId);

  await prisma.$transaction(async (tx) => {
    await adjustVariantAndAggregateStock(tx, {
      organisationId,
      productId,
      variantId,
      storeId,
      quantityDelta: quantity,
      type: "IN",
      reason: reason || `Entree stock ${variant.taille || ""} ${variant.couleur || ""}`.trim(),
    });
  });

  const updatedVariant = await prisma.produitVariante.findUnique({
    where: {
      id: variantId,
    },
    include: {
      produit: {
        select: {
          nom: true,
          codeBarres: true,
          seuilMinimum: true,
        },
      },
    },
  });

  return res.status(200).json(
    toApiStock({
      id: updatedVariant.id,
      productId,
      productName: updatedVariant.produit?.nom || "",
      variantId,
      variantSize: getVariantSize(updatedVariant),
      variantColor: getVariantColor(updatedVariant),
      variantLabel: getVariantLabel(updatedVariant),
      barcode: updatedVariant.codeBarres || updatedVariant.produit?.codeBarres || "",
      storeId,
      storeName: (await prisma.pointDeVente.findUnique({
        where: { id: storeId },
        select: { nom: true },
      }))?.nom || "",
      quantity: updatedVariant.quantiteStock,
      minimumThreshold:
        updatedVariant.seuilMinimum ?? updatedVariant.produit?.seuilMinimum ?? 0,
    })
  );
};

const stockCorrection = async (req, res) => {
  const organisationId = getOrganisationIdFromUser(req.user);
  const parsedInput = validateSchema(stockCorrectionSchema, {
    productId: req.body.productId,
    variantId: req.body.variantId,
    storeId: req.body.storeId,
    quantity: req.body.quantity,
    reason: req.body.reason,
  });
  const productId = parsePositiveInteger(parsedInput.productId);
  const variantId = parseOptionalPositiveInteger(parsedInput.variantId);
  const storeId = parsePositiveInteger(parsedInput.storeId);
  const quantity = parseNonNegativeInteger(parsedInput.quantity);
  const reason = normalizeOptionalString(parsedInput.reason);

  await ensureProductAndStoreExist(req.user, productId, storeId);
  if (Number.isNaN(variantId) || variantId === null) {
    throw createHttpError(400, "variantId must be a valid positive integer.");
  }

  const stock = await prisma.$transaction(async (tx) => {
    const existingVariant = await tx.produitVariante.findFirst({
      where: {
        organisationId,
        produitId: productId,
        id: variantId,
      },
    });

    if (!existingVariant) {
      throw createHttpError(404, "Product variant not found.");
    }

    const quantityDelta = quantity - Number(existingVariant.quantiteStock || 0);

    await tx.produitVariante.update({
      where: {
        id: variantId,
      },
      data: {
        quantiteStock: quantity,
      },
    });

    await syncAggregateStockForProduct(tx, organisationId, productId, storeId);

    await createStockMovement(tx, {
      organisationId,
      productId,
      storeId,
      quantity: quantityDelta,
      type: "CORRECTION",
      reason: reason || `Correction stock ${getVariantLabel(existingVariant)}`,
    });

    return tx.produitVariante.findUnique({
      where: {
        id: variantId,
      },
      include: {
        produit: {
          select: {
            nom: true,
            codeBarres: true,
            seuilMinimum: true,
          },
        },
      },
    });
  });

  return res.status(200).json(
    toApiStock({
      id: stock.id,
      productId,
      productName: stock.produit?.nom || "",
      variantId,
      variantSize: getVariantSize(stock),
      variantColor: getVariantColor(stock),
      variantLabel: getVariantLabel(stock),
      barcode: stock.codeBarres || stock.produit?.codeBarres || "",
      storeId,
      storeName: (await prisma.pointDeVente.findUnique({
        where: { id: storeId },
        select: { nom: true },
      }))?.nom || "",
      quantity: stock.quantiteStock,
      minimumThreshold: stock.seuilMinimum ?? stock.produit?.seuilMinimum ?? 0,
    })
  );
};

const createSale = async (req, res) => {
  const organisationId = getOrganisationIdFromUser(req.user);
  if (isEmptyRequestBody(req.body)) {
    throw createHttpError(400, "Request body is empty", "BAD_REQUEST");
  }

  validateSchema(saleCreateSchema, {
    storeId: getAliasedValue(req.body, "storeId", "pointDeVenteId"),
    cashRegisterId: getAliasedValue(req.body, "cashRegisterId", "caisseId"),
    userId: getAliasedValue(req.body, "userId", "utilisateurId"),
    customerId: getAliasedValue(req.body, "customerId", "clientId"),
    paymentMethod: req.body.paymentMethod,
    paidAmount: getAliasedValue(req.body, "paidAmount", "montantPaye"),
    remainingAmount: getAliasedValue(req.body, "remainingAmount", "resteAPayer"),
    total: req.body.total,
    items: Array.isArray(req.body.items)
      ? req.body.items.map((item) => ({
          productId: getAliasedValue(item, "productId", "produitId"),
          variantId: getAliasedValue(item, "variantId", "varianteId"),
          quantity: getAliasedValue(item, "quantity", "quantite"),
          unitPrice: getAliasedValue(item, "unitPrice", "prixUnitaire"),
        }))
      : req.body.items,
  });

  const requestedStoreId = parseOptionalPositiveInteger(
    getAliasedValue(req.body, "storeId", "pointDeVenteId")
  );
  const requestedCashRegisterId = parseOptionalPositiveInteger(
    getAliasedValue(req.body, "cashRegisterId", "caisseId")
  );
  const requestedUserId = parseOptionalPositiveInteger(
    getAliasedValue(req.body, "userId", "utilisateurId")
  );
  const requestedCustomerId = parseOptionalPositiveInteger(
    getAliasedValue(req.body, "customerId", "clientId")
  );
  const requestedPaidAmount = getAliasedValue(req.body, "paidAmount", "montantPaye");
  const requestedRemainingAmount = getAliasedValue(
    req.body,
    "remainingAmount",
    "resteAPayer"
  );
  const items = normalizeSaleItems(req.body.items);
  let frontendTotal;

  if (Number.isNaN(requestedStoreId)) {
    throw createHttpError(400, "storeId must be a valid positive integer.", "BAD_REQUEST");
  }

  if (Number.isNaN(requestedCashRegisterId)) {
    throw createHttpError(
      400,
      "cashRegisterId must be a valid positive integer.",
      "BAD_REQUEST"
    );
  }

  if (Number.isNaN(requestedUserId)) {
    throw createHttpError(400, "userId must be a valid positive integer.", "BAD_REQUEST");
  }

  if (Number.isNaN(requestedCustomerId)) {
    throw createHttpError(
      400,
      "customerId must be a valid positive integer.",
      "BAD_REQUEST"
    );
  }

  const isEmployee = req.user.role === "EMPLOYE";
  const employeeStoreId = getEmployeeStoreId(req.user);
  const employeeCashRegisterId = getEmployeeCashRegisterId(req.user);
  const singleStoreContext = !isEmployee
    ? await getSingleStoreContext(organisationId)
    : null;
  const storeId = isEmployee
    ? employeeStoreId
    : requestedStoreId || singleStoreContext?.store?.id || null;
  const cashRegisterId = isEmployee
    ? employeeCashRegisterId
    : requestedCashRegisterId || singleStoreContext?.cashRegister?.id || null;
  const userId = req.user.id;

  if (!storeId) {
    throw createHttpError(
      400,
      isEmployee
        ? "Authenticated employee is not assigned to a store."
        : "storeId is required for admin sales.",
      "BAD_REQUEST"
    );
  }

  if (!cashRegisterId) {
    throw createHttpError(
      400,
      isEmployee
        ? "Authenticated employee is not assigned to a cash register."
        : "cashRegisterId is required for admin sales.",
      "BAD_REQUEST"
    );
  }

  if (requestedUserId && requestedUserId !== req.user.id) {
    throw createHttpError(
      403,
      "The authenticated user must match the sale userId."
    );
  }

  if (typeof req.body.paymentMethod !== "string" || isBlankString(req.body.paymentMethod)) {
    throw createHttpError(
      400,
      "paymentMethod must be a non-empty string",
      "BAD_REQUEST"
    );
  }

  const paymentMethod = normalizePaymentMethod(req.body.paymentMethod);

  if (!paymentMethod) {
    throw createHttpError(
      400,
      "paymentMethod must be one of: cash, card, credit, partial.",
      "BAD_REQUEST"
    );
  }

  if (req.body.total === undefined || req.body.total === null || isBlankString(req.body.total)) {
    throw createHttpError(400, "total is required.", "BAD_REQUEST");
  }

  const total = validateNonNegativeNumber(req.body.total, "total");

  try {
    frontendTotal = new Prisma.Decimal(total);
  } catch (error) {
    throw createHttpError(400, "total must be a valid number.", "BAD_REQUEST");
  }

  if (isEmployee && (!employeeStoreId || !employeeCashRegisterId)) {
    throw createHttpError(
      403,
      "Employees can only create sales when assigned to both a store and a cash register."
    );
  }

  let sale = null;
  const startedAt = Date.now();
  const requestTimerLabel = `[createSale][org:${organisationId}][user:${userId}][${startedAt}] total`;

  try {
    console.time(requestTimerLabel);
    const saleTimestamp = new Date();

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const attemptTimerLabel = `${requestTimerLabel} attempt:${attempt + 1}`;

      try {
        console.time(attemptTimerLabel);

        const numeroTicket = await withTimedStep(
          `${attemptTimerLabel} ticket-number`,
          async () =>
            buildAnnualDocumentNumber({
              tx: prisma,
              model: "vente",
              field: "numeroTicket",
              date: saleTimestamp,
            })
        );

        sale = await prisma.$transaction(
          async (tx) => {
            const productIds = [...new Set(items.map((item) => item.productId))];

            const [customerCompte, caisse, produits] = await withTimedStep(
              `${attemptTimerLabel} load-context`,
              async () =>
                Promise.all([
                  requestedCustomerId !== null
                    ? tx.compte.findFirst({
                        where: {
                          organisationId,
                          id: requestedCustomerId,
                          type: COMPTE_TYPES.CLIENT,
                        },
                        select: saleCustomerCompteSelect,
                      })
                    : getDefaultCustomerCompte(req.user, tx),
                  tx.caisse.findFirst({
                    where: {
                      organisationId,
                      id: cashRegisterId,
                    },
                    select: {
                      id: true,
                      code: true,
                      pointDeVenteId: true,
                      estActive: true,
                    },
                  }),
                  tx.produit.findMany({
                    where: {
                      organisationId,
                      id: {
                        in: productIds,
                      },
                    },
                    select: {
                      id: true,
                      nom: true,
                      seuilMinimum: true,
                      estActif: true,
                      variantes: {
                        orderBy: [{ id: "asc" }],
                        select: {
                          id: true,
                          produitId: true,
                          taille: true,
                          couleur: true,
                          codeBarres: true,
                          prixVente: true,
                          quantiteStock: true,
                          seuilMinimum: true,
                          actif: true,
                        },
                      },
                    },
                  }),
                ])
            );

            if (!customerCompte?.clientSource) {
              throw createHttpError(404, "Client introuvable.");
            }

            if (!caisse) {
              throw createHttpError(404, "Cash register not found.");
            }

            if (caisse.pointDeVenteId !== storeId) {
              throw createHttpError(
                400,
                "The selected cash register does not belong to the selected store."
              );
            }

            if (!caisse.estActive) {
              throw createHttpError(400, "The selected cash register is inactive.");
            }

            if (produits.length !== productIds.length) {
              const foundProductIds = new Set(produits.map((produit) => produit.id));
              const missingProductIds = productIds.filter((id) => !foundProductIds.has(id));

              throw createHttpError(
                404,
                `Products not found: ${missingProductIds.join(", ")}.`
              );
            }

            const customer = customerCompte.clientSource;
            const productMap = new Map(produits.map((produit) => [produit.id, produit]));
            const variantsByProductId = new Map(
              produits.map((produit) => [produit.id, produit.variantes || []])
            );
            const nextStockByProductId = new Map(
              produits.map((produit) => [
                produit.id,
                (produit.variantes || []).reduce(
                  (sum, variant) => sum + Number(variant.quantiteStock || 0),
                  0
                ),
              ])
            );

            const lignesData = [];
            let computedTotal = new Prisma.Decimal(0);

            for (const item of items) {
              const produit = productMap.get(item.productId);

              if (!produit.estActif) {
                throw createHttpError(400, `Product ${produit.nom} is inactive.`);
              }

              const variant = ensureResolvedVariant({
                item,
                product: produit,
                variantsByProductId,
              });

              if (!variant.actif) {
                throw createHttpError(
                  400,
                  `Variant ${getVariantLabel(variant)} is inactive for product ${produit.nom}.`
                );
              }

              if (Number(variant.quantiteStock || 0) < item.quantity) {
                throw createHttpError(
                  400,
                  `Insufficient stock for ${produit.nom} / ${getVariantLabel(variant)}.`
                );
              }

              const prixUnitaire = new Prisma.Decimal(item.unitPrice);
              const sousTotal = prixUnitaire.mul(item.quantity);

              computedTotal = computedTotal.plus(sousTotal);
              nextStockByProductId.set(
                item.productId,
                Number(nextStockByProductId.get(item.productId) || 0) - Number(item.quantity || 0)
              );

              lignesData.push({
                organisationId,
                produitId: item.productId,
                varianteId: variant.id,
                quantite: item.quantity,
                prixUnitaire,
                sousTotal,
                variant,
              });
            }

            const totalDifference = computedTotal.minus(frontendTotal).abs();

            if (totalDifference.greaterThan(SALE_TOTAL_TOLERANCE)) {
              throw createHttpError(
                400,
                `Provided total (${frontendTotal.toFixed(2)}) does not match calculated total (${computedTotal.toFixed(2)}).`
              );
            }

            let computedPaidAmount = frontendTotal;
            let computedRemainingAmount = new Prisma.Decimal(0);
            let computedPaymentStatus = "PAID";

            if (paymentMethod === "credit" && customer.numeroClient === 1) {
              throw createHttpError(
                400,
                'Credit payment is not allowed for "Client inconnu".'
              );
            }

            if (paymentMethod === "partial") {
              if (
                requestedPaidAmount === undefined ||
                requestedPaidAmount === null ||
                isBlankString(requestedPaidAmount)
              ) {
                throw createHttpError(
                  400,
                  "paidAmount is required for partial payment.",
                  "BAD_REQUEST"
                );
              }

              let parsedPaidAmount;

              try {
                parsedPaidAmount = new Prisma.Decimal(
                  validateNonNegativeNumber(requestedPaidAmount, "paidAmount")
                );
              } catch (error) {
                throw createHttpError(
                  400,
                  "paidAmount must be a valid number.",
                  "BAD_REQUEST"
                );
              }

              if (parsedPaidAmount.lessThanOrEqualTo(0)) {
                throw createHttpError(
                  400,
                  "paidAmount must be greater than 0 for partial payment.",
                  "BAD_REQUEST"
                );
              }

              if (parsedPaidAmount.greaterThanOrEqualTo(computedTotal)) {
                throw createHttpError(
                  400,
                  "paidAmount must be lower than total for partial payment.",
                  "BAD_REQUEST"
                );
              }

              const expectedRemainingAmount = computedTotal.minus(parsedPaidAmount);

              if (
                requestedRemainingAmount !== undefined &&
                requestedRemainingAmount !== null &&
                !isBlankString(requestedRemainingAmount)
              ) {
                let parsedRemainingAmount;

                try {
                  parsedRemainingAmount = new Prisma.Decimal(
                    validateNonNegativeNumber(requestedRemainingAmount, "remainingAmount")
                  );
                } catch (error) {
                  throw createHttpError(
                    400,
                    "remainingAmount must be a valid number.",
                    "BAD_REQUEST"
                  );
                }

                if (
                  parsedRemainingAmount.minus(expectedRemainingAmount).abs().greaterThan(
                    SALE_TOTAL_TOLERANCE
                  )
                ) {
                  throw createHttpError(
                    400,
                    "remainingAmount does not match total minus paidAmount.",
                    "BAD_REQUEST"
                  );
                }
              }

              computedPaidAmount = parsedPaidAmount;
              computedRemainingAmount = expectedRemainingAmount;
              computedPaymentStatus = "PARTIALLY_PAID";
            } else if (paymentMethod === "credit") {
              computedPaidAmount = new Prisma.Decimal(0);
              computedRemainingAmount = computedTotal;
              computedPaymentStatus = "CREDIT";
            }

            const sessionCaisse = await withTimedStep(
              `${attemptTimerLabel} resolve-session`,
              async () =>
                ensureOpenCashSession(tx, {
                  organisationId,
                  caisseId: cashRegisterId,
                  pointDeVenteId: storeId,
                  utilisateurId: userId,
                  cashRegisterCode: caisse.code,
                  date: saleTimestamp,
                })
            );

            const createdSale = await withTimedStep(
              `${attemptTimerLabel} create-sale`,
              async () =>
                tx.vente.create({
                  data: {
                    organisationId,
                    numeroTicket,
                    total: computedTotal,
                    paymentMethod,
                    paidAmount: computedPaidAmount,
                    remainingAmount: computedRemainingAmount,
                    paymentStatus: computedPaymentStatus,
                    status: "completed",
                    pointDeVenteId: storeId,
                    caisseId: cashRegisterId,
                    utilisateurId: userId,
                    clientId: customer.id,
                    sessionCaisseId: sessionCaisse.id,
                  },
                  select: {
                    id: true,
                    numeroTicket: true,
                    total: true,
                    paymentMethod: true,
                    paidAmount: true,
                    remainingAmount: true,
                    paymentStatus: true,
                    status: true,
                    createdAt: true,
                    pointDeVenteId: true,
                    caisseId: true,
                    utilisateurId: true,
                    sessionCaisseId: true,
                  },
                })
            );

            await withTimedStep(`${attemptTimerLabel} create-lines`, async () =>
              tx.venteLigne.createMany({
                data: lignesData.map(({ variant, ...line }) => ({
                  ...line,
                  venteId: createdSale.id,
                })),
              })
            );

            await withTimedStep(`${attemptTimerLabel} update-stock`, async () => {
              for (const line of lignesData) {
                await tx.produitVariante.update({
                  where: {
                    id: line.varianteId,
                  },
                  data: {
                    quantiteStock: {
                      decrement: Math.abs(line.quantite),
                    },
                  },
                });
              }

              for (const [productId, nextQuantity] of nextStockByProductId.entries()) {
                await tx.stock.upsert({
                  where: {
                    organisationId_produitId_pointDeVenteId: {
                      organisationId,
                      produitId: productId,
                      pointDeVenteId: storeId,
                    },
                  },
                  update: {
                    quantite: nextQuantity,
                  },
                  create: {
                    organisationId,
                    produitId: productId,
                    pointDeVenteId: storeId,
                    quantite: nextQuantity,
                  },
                });
              }

              await tx.stockMovement.createMany({
                data: lignesData.map((line) => ({
                  organisationId,
                  produitId: line.produitId,
                  pointDeVenteId: storeId,
                  quantite: -Math.abs(line.quantite),
                  type: "SALE",
                  reason: normalizeOptionalString(
                    `Sale ${createdSale.numeroTicket} - ${getVariantLabel(line.variant)}`
                  ),
                })),
              });
            });

            await withTimedStep(`${attemptTimerLabel} create-payment`, async () => {
              if (paymentMethod !== "credit") {
                return null;
              }

              return tx.client.update({
                where: {
                  id: customer.id,
                },
                data: {
                  credit: {
                    increment: computedTotal,
                  },
                },
              });
            });

            await withTimedStep(`${attemptTimerLabel} update-session`, async () =>
              tx.sessionCaisse.update({
                where: {
                  id: sessionCaisse.id,
                },
                data: {
                  totalVentes: {
                    increment: computedTotal,
                  },
                  nombreTickets: {
                    increment: 1,
                  },
                },
              })
            );

            return runTimedStep(`${attemptTimerLabel} fetch-ticket-final`, () => ({
              id: createdSale.id,
              numeroTicket: createdSale.numeroTicket,
              pointDeVenteId: createdSale.pointDeVenteId,
              caisseId: createdSale.caisseId,
              utilisateurId: createdSale.utilisateurId,
              clientId: customerCompte.id,
              customerNumber: customer.numeroClient,
              customerName: customerCompte.nom || customer.nom || null,
              customerCredit:
                paymentMethod === "credit"
                  ? decimalToNumber(new Prisma.Decimal(customer.credit || 0).plus(computedTotal))
                  : decimalToNumber(customer.credit || 0),
              total: createdSale.total,
              paymentMethod: createdSale.paymentMethod,
              paidAmount: createdSale.paidAmount,
              remainingAmount: createdSale.remainingAmount,
              paymentStatus: createdSale.paymentStatus,
              status: createdSale.status,
              createdAt: createdSale.createdAt,
              sessionCaisseId: createdSale.sessionCaisseId,
              sessionNumber: sessionCaisse.numeroSession,
              sessionStatus: sessionCaisse.statut,
            }));
          },
          {
            maxWait: 10000,
            timeout: 20000,
          }
        );
        break;
      } catch (error) {
        if ((error.code === "P2002" || error.code === "P2028") && attempt < 2) {
          continue;
        }

        throw error;
      } finally {
        console.timeEnd(attemptTimerLabel);
      }
    }

    return res.status(201).json({
      id: sale.id,
      ticketNumber: sale.numeroTicket,
      storeId: sale.pointDeVenteId,
      cashRegisterId: sale.caisseId,
      userId: sale.utilisateurId,
      customerId: sale.clientId,
      customerNumber: sale.customerNumber,
      customerName: sale.customerName,
      customerCredit: sale.customerCredit,
      total: decimalToNumber(sale.total),
      paymentMethod: sale.paymentMethod,
      paidAmount: decimalToNumber(sale.paidAmount),
      remainingAmount: decimalToNumber(sale.remainingAmount),
      paymentStatus: sale.paymentStatus,
      status: sale.status,
      createdAt: sale.createdAt,
      sessionId: sale.sessionCaisseId,
      sessionNumber: sale.sessionNumber,
      sessionStatus: sale.sessionStatus,
    });
  } catch (error) {
    console.error("Create sale error:", {
      message: error.message,
      code: error.code || error.errorCode || null,
      status: error.status || error.statusCode || null,
      details: error.details || null,
    });
    throw error;
  } finally {
    console.timeEnd(requestTimerLabel);
    logControllerDuration("POST /api/sales", startedAt, {
      organisationId,
      storeId,
      cashRegisterId,
      userId,
      itemsCount: items.length,
      saleId: sale?.id || null,
    });
  }
};

const getSales = async (req, res) => {
  const organisationId = getOrganisationIdFromUser(req.user);
  const requestedPaymentMethod = normalizeOptionalString(req.query.paymentMethod);
  const paymentMethodFilter = requestedPaymentMethod
    ? normalizePaymentMethod(requestedPaymentMethod)
    : null;
  const singleStoreContext =
    req.user.role === "ADMIN" ? await getSingleStoreContext(organisationId) : null;

  if (requestedPaymentMethod && !paymentMethodFilter) {
    throw createHttpError(
      400,
      "paymentMethod must be one of: cash, card, credit, partial."
    );
  }

  const where = {
    organisationId,
    ...(req.user.role === "EMPLOYE"
      ? {
          utilisateurId: req.user.id,
        }
      : {
          ...(singleStoreContext?.store?.id
            ? { pointDeVenteId: singleStoreContext.store.id }
            : {}),
          ...(singleStoreContext?.cashRegister?.id
            ? { caisseId: singleStoreContext.cashRegister.id }
            : {}),
        }),
    ...(paymentMethodFilter
      ? {
          paymentMethod: paymentMethodFilter,
        }
      : {}),
  };
  const { page, limit, skip } = getPaginationParams(req.query);
  const [total, sales] = await Promise.all([
    prisma.vente.count({ where }),
    prisma.vente.findMany({
      where,
      select: {
        id: true,
        numeroTicket: true,
        dateVente: true,
        paymentMethod: true,
        paidAmount: true,
        remainingAmount: true,
        paymentStatus: true,
        status: true,
        total: true,
        pointDeVenteId: true,
        caisseId: true,
        utilisateurId: true,
        clientId: true,
        sessionCaisseId: true,
        pointDeVente: {
          select: {
            id: true,
            nom: true,
          },
        },
        caisse: {
          select: {
            id: true,
            nom: true,
          },
        },
        utilisateur: {
          select: {
            id: true,
            nom: true,
          },
        },
        client: {
          select: {
            id: true,
            numeroClient: true,
            nom: true,
            credit: true,
            compte: {
              select: {
                id: true,
                nom: true,
              },
            },
          },
        },
        sessionCaisse: {
          select: {
            id: true,
            numeroSession: true,
            statut: true,
            dateOuverture: true,
            dateFermeture: true,
          },
        },
        lignes: {
          orderBy: {
            id: "asc",
          },
          select: {
            produitId: true,
            varianteId: true,
            quantite: true,
            prixUnitaire: true,
            sousTotal: true,
            produit: {
              select: {
                id: true,
                nom: true,
                prixAchat: true,
              },
            },
            variante: {
              select: {
                id: true,
                taille: true,
                couleur: true,
                prixAchat: true,
              },
            },
          },
        },
        retours: {
          select: {
            id: true,
            produitId: true,
            varianteId: true,
            quantite: true,
            raison: true,
            createdAt: true,
          },
        },
      },
      orderBy: {
        dateVente: "desc",
      },
      skip,
      take: limit,
    }),
  ]);

  return res.status(200).json(
    buildPaginatedResponse({
      data: sales.map((sale) => {
        const returnedQuantities = buildReturnedVariantQuantitiesMap(sale.retours);
        const total = decimalToNumber(sale.total);
        const type = total < 0 ? "refund" : "sale";
        const totalPurchase = sale.lignes.reduce(
          (sum, ligne) => sum.plus(getLineTotalPurchase(ligne)),
          new Prisma.Decimal(0)
        );
        const net = sale.lignes.reduce(
          (sum, ligne) => sum.plus(getLineNetProfit(ligne)),
          new Prisma.Decimal(0)
        );

        return {
          id: sale.id,
          ticketNumber: sale.numeroTicket,
          date: sale.dateVente,
          type,
          paymentMethod: sale.paymentMethod,
          paidAmount: decimalToNumber(sale.paidAmount),
          remainingAmount: decimalToNumber(sale.remainingAmount),
          paymentStatus: sale.paymentStatus,
          status: sale.status,
          storeId: sale.pointDeVenteId,
          storeName: sale.pointDeVente ? sale.pointDeVente.nom : "",
          cashRegisterId: sale.caisseId,
          cashRegisterName: sale.caisse ? sale.caisse.nom : "",
          userId: sale.utilisateurId,
          cashierName: sale.utilisateur ? sale.utilisateur.nom : "",
          customerId: sale.client?.compte?.id || sale.clientId || 1,
          customerNumber: sale.client ? sale.client.numeroClient : 1,
          customerName:
            sale.client?.compte?.nom || sale.client?.nom || "Client inconnu",
          customerCredit: sale.client ? decimalToNumber(sale.client.credit) : 0,
          sessionId: sale.sessionCaisseId,
          sessionNumber: sale.sessionCaisse?.numeroSession || null,
          sessionStatus: sale.sessionCaisse?.statut || null,
          sessionOpenedAt: sale.sessionCaisse?.dateOuverture || null,
          sessionClosedAt: sale.sessionCaisse?.dateFermeture || null,
          itemsCount: sale.lignes.reduce(
            (totalItems, ligne) => totalItems + ligne.quantite,
            0
          ),
          total,
          totalPurchase: decimalToNumber(totalPurchase),
          net: decimalToNumber(net),
          returns: sale.retours.map((retour) => ({
            id: retour.id,
            produitId: retour.produitId,
            varianteId: retour.varianteId,
            quantity: retour.quantite,
            reason: retour.raison,
            createdAt: retour.createdAt,
          })),
          items: sale.lignes.map((ligne) => {
            const returnedQuantity =
              returnedQuantities.get(
                buildProductVariantKey(ligne.produitId, ligne.varianteId)
              ) || 0;

            return {
              productId: ligne.produitId,
              variantId: ligne.varianteId,
              productName: ligne.produit ? ligne.produit.nom : "",
              purchasePrice:
                ligne.variante?.prixAchat === null || ligne.variante?.prixAchat === undefined
                  ? decimalToNumber(ligne.produit?.prixAchat)
                  : decimalToNumber(ligne.variante.prixAchat),
              variant: ligne.variante
                ? buildVariantSummary(ligne.variante)
                : null,
              variantSize: ligne.variante ? getVariantSize(ligne.variante) : null,
              variantColor: ligne.variante ? getVariantColor(ligne.variante) : null,
              variantLabel: ligne.variante ? getVariantLabel(ligne.variante) : null,
              quantity: ligne.quantite,
              returnedQuantity,
              remainingReturnQuantity: Math.max(ligne.quantite - returnedQuantity, 0),
              unitPrice: decimalToNumber(ligne.prixUnitaire),
              subtotal: decimalToNumber(ligne.sousTotal),
            };
          }),
        };
      }),
      page,
      limit,
      total,
    })
  );
};

const cancelSale = async (req, res) => {
  const organisationId = getOrganisationIdFromUser(req.user);
  const saleId = parsePositiveInteger(req.params.id);

  if (Number.isNaN(saleId)) {
    throw createHttpError(400, "sale id must be a valid positive integer.");
  }

  const sale = await prisma.$transaction(async (tx) => {
    const existingSale = await tx.vente.findFirst({
      where: {
        organisationId,
        id: saleId,
      },
      include: {
        lignes: {
          select: {
            produitId: true,
            varianteId: true,
            quantite: true,
            prixUnitaire: true,
          },
        },
        retours: {
          select: {
            id: true,
          },
        },
        sessionCaisse: {
          select: {
            id: true,
          },
        },
      },
    });

    if (!existingSale) {
      throw createHttpError(404, "Sale not found.");
    }

    if (existingSale.status === "cancelled") {
      throw createHttpError(400, "This sale is already cancelled.");
    }

    if (existingSale.status === "refunded") {
      throw createHttpError(400, "A refunded sale cannot be cancelled.");
    }

    if (existingSale.retours.length > 0) {
      throw createHttpError(
        400,
        "A sale with existing returns cannot be cancelled."
      );
    }

    for (const ligne of existingSale.lignes) {
      await restoreStockForProduct(tx, {
        organisationId,
        productId: ligne.produitId,
        variantId: ligne.varianteId,
        storeId: existingSale.pointDeVenteId,
        quantity: ligne.quantite,
        type: "CANCEL",
        reason: `Sale cancelled ${existingSale.numeroTicket}`,
      });
    }

    if (existingSale.sessionCaisse?.id) {
      await recalculateCashSessionMetrics(tx, {
        organisationId,
        sessionId: existingSale.sessionCaisse.id,
      });
    }

    return tx.vente.update({
      where: { id: saleId },
      data: {
        status: "cancelled",
      },
      select: {
        id: true,
        numeroTicket: true,
        status: true,
      },
    });
  });

  return res.status(200).json({
    message: "Sale cancelled successfully.",
    sale,
  });
};

const returnSale = async (req, res) => {
  const saleId = parsePositiveInteger(req.params.id);

  if (Number.isNaN(saleId)) {
    throw createHttpError(400, "sale id must be a valid positive integer.");
  }

  req.body = {
    ...(req.body && typeof req.body === "object" ? req.body : {}),
    saleId,
    venteId: saleId,
    reason: req.body?.reason ?? req.body?.motif,
    motif: req.body?.motif ?? req.body?.reason,
  };

  return createRefund(req, res);
};

const createRefund = async (req, res) => {
  const organisationId = getOrganisationIdFromUser(req.user);

  validateSchema(refundCreateSchema, {
    saleId: getAliasedValue(req.body, "saleId", "venteId"),
    customerId: getAliasedValue(req.body, "customerId", "clientId"),
    paymentMethod: req.body.paymentMethod,
    items: Array.isArray(req.body.items)
      ? req.body.items.map((item) => ({
          productId: getAliasedValue(item, "productId", "produitId"),
          variantId: getAliasedValue(item, "variantId", "varianteId"),
          quantity: getAliasedValue(item, "quantity", "quantite"),
          unitPrice: getAliasedValue(item, "unitPrice", "prixUnitaire"),
        }))
      : req.body.items,
    reason: req.body.reason ?? req.body.motif,
  });

  const requestedSaleId = parseOptionalPositiveInteger(
    getAliasedValue(req.body, "saleId", "venteId")
  );
  const requestedCustomerId = parseOptionalPositiveInteger(
    getAliasedValue(req.body, "customerId", "clientId")
  );

  if (Number.isNaN(requestedSaleId)) {
    throw createHttpError(400, "saleId must be a valid positive integer.");
  }

  if (Number.isNaN(requestedCustomerId)) {
    throw createHttpError(400, "customerId must be a valid positive integer.");
  }

  const items = normalizeRefundItems(req.body.items);
  const reason = normalizeOptionalString(req.body.reason ?? req.body.motif);
  const requestedPaymentMethod = normalizeOptionalString(req.body.paymentMethod);
  const fallbackPaymentMethod = requestedPaymentMethod
    ? normalizePaymentMethod(requestedPaymentMethod)
    : "cash";
  const isEmployee = req.user.role === "EMPLOYE";
  const employeeStoreId = getEmployeeStoreId(req.user);
  const employeeCashRegisterId = getEmployeeCashRegisterId(req.user);
  const singleStoreContext = !isEmployee
    ? await getSingleStoreContext(organisationId)
    : null;
  const fallbackStoreId = isEmployee
    ? employeeStoreId
    : singleStoreContext?.store?.id || null;
  const fallbackCashRegisterId = isEmployee
    ? employeeCashRegisterId
    : singleStoreContext?.cashRegister?.id || null;
  const userId = req.user.id;

  if (requestedPaymentMethod && !fallbackPaymentMethod) {
    throw createHttpError(
      400,
      "paymentMethod must be one of: cash, card, credit, partial, transfer, mobile_money."
    );
  }

  console.info("REFUND START", {
    organisationId,
    saleId: requestedSaleId,
    requestedCustomerId,
    requestedPaymentMethod,
    items,
    reason,
    userId,
  });

  if (isEmployee && (!employeeStoreId || !employeeCashRegisterId)) {
    throw createHttpError(
      403,
      "Employees can only create refunds when assigned to both a store and a cash register."
    );
  }

  if (!fallbackStoreId) {
    throw createHttpError(400, "No default store found for the refund.");
  }

  if (!fallbackCashRegisterId) {
    throw createHttpError(400, "No default cash register found for the refund.");
  }

  const refundResult = await prisma.$transaction(async (tx) => {
    let linkedSale = null;
    let soldQuantities = new Map();
    let returnedQuantities = new Map();
    let saleItemsByLineKey = new Map();
    let paymentMethod = fallbackPaymentMethod;

    if (requestedSaleId) {
      linkedSale = await tx.vente.findFirst({
        where: {
          organisationId,
          id: requestedSaleId,
        },
        include: {
          lignes: {
            select: {
              produitId: true,
              varianteId: true,
              quantite: true,
              prixUnitaire: true,
            },
          },
          retours: {
            select: {
              produitId: true,
              varianteId: true,
              quantite: true,
            },
          },
        },
      });

      if (!linkedSale) {
        throw createHttpError(404, "Sale not found.");
      }

      console.info("REFUND original sale found", {
        saleId: linkedSale.id,
        ticketNumber: linkedSale.numeroTicket,
        total: decimalToNumber(linkedSale.total),
        paymentMethod: linkedSale.paymentMethod,
      });

      if (linkedSale.status === "cancelled") {
        throw createHttpError(400, "A cancelled sale cannot be refunded.");
      }

      if (!requestedPaymentMethod) {
        paymentMethod = normalizePaymentMethod(linkedSale.paymentMethod) || fallbackPaymentMethod;
      }

      soldQuantities = new Map(
        linkedSale.lignes.map((ligne) => [
          buildProductVariantKey(ligne.produitId, ligne.varianteId),
          ligne.quantite,
        ])
      );
      returnedQuantities = buildReturnedVariantQuantitiesMap(linkedSale.retours);
      saleItemsByLineKey = new Map(
        linkedSale.lignes.map((ligne) => [
          buildProductVariantKey(ligne.produitId, ligne.varianteId),
          ligne,
        ])
      );
    }

    const productIds = [...new Set(items.map((item) => item.productId))];
    const produits = await tx.produit.findMany({
      where: {
        organisationId,
        id: {
          in: productIds,
        },
      },
      select: {
        id: true,
        nom: true,
        prixVente: true,
        prixAchat: true,
        prixDetail: true,
        estActif: true,
      },
    });

    if (produits.length !== productIds.length) {
      const foundProductIds = new Set(produits.map((produit) => produit.id));
      const missingProductIds = productIds.filter((id) => !foundProductIds.has(id));
      throw createHttpError(404, `Products not found: ${missingProductIds.join(", ")}.`);
    }

    const productMap = new Map(produits.map((produit) => [produit.id, produit]));
    const variants = await tx.produitVariante.findMany({
      where: {
        organisationId,
        produitId: { in: productIds },
      },
    });
    const variantsByProductId = variants.reduce((map, variant) => {
      const currentVariants = map.get(variant.produitId) || [];
      currentVariants.push(variant);
      map.set(variant.produitId, currentVariants);
      return map;
    }, new Map());
    const createdRefunds = [];
    const lignesData = [];
    const storeId = linkedSale?.pointDeVenteId || fallbackStoreId;
    let refundTotal = new Prisma.Decimal(0);

    const pointDeVente = await tx.pointDeVente.findFirst({
      where: {
        organisationId,
        id: storeId,
      },
      select: {
        id: true,
      },
    });

    if (!pointDeVente) {
      throw createHttpError(404, "Store not found.");
    }

    const caisse = await tx.caisse.findFirst({
      where: {
        organisationId,
        id: fallbackCashRegisterId,
      },
      select: {
        id: true,
        nom: true,
        code: true,
        pointDeVenteId: true,
        estActive: true,
      },
    });

    if (!caisse) {
      throw createHttpError(404, "Cash register not found.");
    }

    if (caisse.pointDeVenteId !== storeId) {
      throw createHttpError(
        400,
        "The selected cash register does not belong to the selected store."
      );
    }

    if (!caisse.estActive) {
      throw createHttpError(400, "The selected cash register is inactive.");
    }

    const utilisateur = await tx.utilisateur.findFirst({
      where: {
        organisationId,
        id: userId,
      },
      select: {
        id: true,
        role: true,
        estActif: true,
        pointDeVenteId: true,
        caisseId: true,
      },
    });

    if (!utilisateur) {
      throw createHttpError(404, "User not found.");
    }

    if (!utilisateur.estActif) {
      throw createHttpError(400, "Cannot create a refund with an inactive user.");
    }

    if (utilisateur.role === "EMPLOYE" && utilisateur.pointDeVenteId !== storeId) {
      throw createHttpError(400, "This employee does not belong to the selected store.");
    }

    if (
      utilisateur.role === "EMPLOYE" &&
      utilisateur.caisseId !== fallbackCashRegisterId
    ) {
      throw createHttpError(
        400,
        "This employee does not belong to the selected cash register."
      );
    }

    let customerId = linkedSale?.clientId || null;

    if (requestedCustomerId !== null) {
      const customerCompte = await resolveCustomerCompte(
        tx,
        organisationId,
        requestedCustomerId
      );
      customerId = customerCompte.clientSource.id;
    } else if (!customerId) {
      const defaultCustomerCompte = await getDefaultCustomerCompte(req.user, tx);
      customerId = defaultCustomerCompte.clientSource.id;
    }

    const sessionCaisse = await ensureOpenCashSession(tx, {
      organisationId,
      caisseId: fallbackCashRegisterId,
      pointDeVenteId: storeId,
      utilisateurId: userId,
      cashRegisterCode: caisse.code,
      date: new Date(),
    });

    for (const item of items) {
      const product = productMap.get(item.productId);
      const variant = ensureResolvedVariant({
        item,
        product,
        variantsByProductId,
      });
      const itemKey = buildProductVariantKey(item.productId, variant.id);
      let unitPriceValue = item.unitPrice;

      if (linkedSale) {
        const soldQuantity = soldQuantities.get(itemKey);

        if (!soldQuantity) {
          throw createHttpError(
            400,
            `Product ${item.productId} is not part of this sale.`
          );
        }

        const alreadyReturnedQuantity = returnedQuantities.get(itemKey) || 0;
        const remainingQuantity = soldQuantity - alreadyReturnedQuantity;

        if (item.quantity > remainingQuantity) {
          throw createHttpError(
            400,
            `Refund quantity exceeds remaining sold quantity for product ${item.productId}.`
          );
        }

        const saleItem = saleItemsByLineKey.get(itemKey);
        if (unitPriceValue === null || unitPriceValue === undefined) {
          unitPriceValue = decimalToNumber(saleItem?.prixUnitaire ?? product.prixVente);
        }
      } else if (unitPriceValue === null || unitPriceValue === undefined) {
        unitPriceValue = decimalToNumber(
          variant.prixVente ?? product.prixVente ?? product.prixDetail
        );
      }

      const lineUnitPrice = new Prisma.Decimal(unitPriceValue);
      const lineTotal = lineUnitPrice.mul(item.quantity);

      console.info("REFUND lines", {
        saleId: linkedSale?.id || null,
        productId: item.productId,
        variantId: variant.id,
        quantity: item.quantity,
        unitPrice: decimalToNumber(lineUnitPrice),
        lineTotal: decimalToNumber(lineTotal),
      });

      refundTotal = refundTotal.plus(lineTotal);
      lignesData.push({
        organisationId,
        produitId: item.productId,
        varianteId: variant.id,
        quantite: item.quantity,
        prixUnitaire: lineUnitPrice.mul(-1),
        sousTotal: lineTotal.mul(-1),
      });

      const numero = await buildAnnualDocumentNumber({
        tx,
        model: "retour",
        field: "numero",
        where: {
          organisationId,
        },
        date: new Date(),
      });

      const refund = await tx.retour.create({
        data: {
          organisationId,
          numero,
          venteId: linkedSale?.id || null,
          produitId: item.productId,
          varianteId: variant.id,
          quantite: item.quantity,
          montant: lineTotal,
          raison: reason,
        },
      });

      await restoreStockForProduct(tx, {
        organisationId,
        productId: item.productId,
        variantId: variant.id,
        storeId,
        quantity: item.quantity,
        type: "RETURN",
        reason:
          reason || `Remboursement ${numero} - ${product.nom} / ${getVariantLabel(variant)}`,
      });

      console.info("REFUND stock increased", {
        productId: item.productId,
        variantId: variant.id,
        storeId,
        quantity: item.quantity,
      });

      if (linkedSale) {
        returnedQuantities.set(itemKey, (returnedQuantities.get(itemKey) || 0) + item.quantity);
      }

      createdRefunds.push({
        id: refund.id,
        numero: refund.numero,
        venteId: refund.venteId,
        produitId: refund.produitId,
        varianteId: refund.varianteId,
        quantite: refund.quantite,
        montant: decimalToNumber(refund.montant),
        motif: refund.raison,
        createdAt: refund.createdAt,
      });
    }

    const negativeRefundTotal = refundTotal.mul(-1);
    const numeroTicket = await buildAnnualDocumentNumber({
      tx,
      model: "vente",
      field: "numeroTicket",
      date: new Date(),
    });
    const refundSale = await tx.vente.create({
      data: {
        organisationId,
        numeroTicket,
        total: negativeRefundTotal,
        paymentMethod,
        paidAmount: new Prisma.Decimal(0),
        remainingAmount: new Prisma.Decimal(0),
        paymentStatus: "REFUNDED",
        status: "refunded",
        pointDeVenteId: storeId,
        caisseId: fallbackCashRegisterId,
        utilisateurId: userId,
        clientId: customerId,
        sessionCaisseId: sessionCaisse.id,
        lignes: {
          create: lignesData,
        },
      },
      select: {
        id: true,
        numeroTicket: true,
        total: true,
        paymentMethod: true,
        paidAmount: true,
        remainingAmount: true,
        paymentStatus: true,
        status: true,
        createdAt: true,
      },
    });

    console.info("REFUND new refund sale created", {
      refundSaleId: refundSale.id,
      ticketNumber: refundSale.numeroTicket,
      total: decimalToNumber(refundSale.total),
      linkedSaleId: linkedSale?.id || null,
    });

    await tx.sessionCaisse.update({
      where: {
        id: sessionCaisse.id,
      },
      data: {
        totalVentes: {
          increment: negativeRefundTotal,
        },
        nombreTickets: {
          increment: 1,
        },
      },
    });

    if (linkedSale) {
      const isFullyReturned = linkedSale.lignes.every((ligne) => {
        const returnedQuantity =
          returnedQuantities.get(buildProductVariantKey(ligne.produitId, ligne.varianteId)) ||
          0;
        return returnedQuantity >= ligne.quantite;
      });

      await tx.vente.update({
        where: { id: linkedSale.id },
        data: {
          status: isFullyReturned ? "refunded" : linkedSale.status,
        },
      });
    }

    return {
      refundSale: {
        id: refundSale.id,
        ticketNumber: refundSale.numeroTicket,
        total: decimalToNumber(refundSale.total),
        paymentMethod: refundSale.paymentMethod,
        paidAmount: decimalToNumber(refundSale.paidAmount),
        remainingAmount: decimalToNumber(refundSale.remainingAmount),
        paymentStatus: refundSale.paymentStatus,
        status: refundSale.status,
        createdAt: refundSale.createdAt,
      },
      refunds: createdRefunds,
      originalSale: linkedSale
        ? {
            id: linkedSale.id,
            ticketNumber: linkedSale.numeroTicket,
          }
        : null,
    };
  });

  return res.status(201).json({
    success: true,
    message: "Refund processed successfully.",
    refund: refundResult.refunds[0] || null,
    sale: refundResult.refundSale,
    refundSale: refundResult.refundSale,
    refunds: refundResult.refunds,
    originalSale: refundResult.originalSale,
  });
};

const getCustomers = async (req, res) => {
  const organisationId = getOrganisationIdFromUser(req.user);
  const search = normalizeRequiredString(req.query.search || "");
  const numericSearch = Number(search);
  const where = search
    ? {
        organisationId,
        type: COMPTE_TYPES.CLIENT,
        OR: [
          {
            nom: {
              contains: search,
              mode: "insensitive",
            },
          },
          {
            telephone: {
              contains: search,
              mode: "insensitive",
            },
          },
          {
            email: {
              contains: search,
              mode: "insensitive",
            },
          },
          {
            numeroCompte: {
              contains: search,
              mode: "insensitive",
            },
          },
          ...(!Number.isNaN(numericSearch) && Number.isInteger(numericSearch)
            ? [
                {
                  clientSource: {
                    numeroClient: numericSearch,
                  },
                },
              ]
            : []),
        ],
      }
    : {
        organisationId,
        type: COMPTE_TYPES.CLIENT,
      };

  const customers = await prisma.compte.findMany({
    where,
    include: compteInclude,
    orderBy: [{ id: "asc" }],
  });

  return res.status(200).json(customers.map(buildCustomerSummary));
};

const createCustomer = async (req, res) => {
  try {
    const organisationId = getOrganisationIdFromUser(req.user);
    const parsedInput = validateSchema(customerCreateSchema, {
      name: req.body.name || req.body.nom,
      phone: req.body.phone || req.body.telephone,
      email: req.body.email,
      address: req.body.address || req.body.adresse,
    });
    const nom = normalizeRequiredString(parsedInput.name);
    const telephone = normalizeOptionalString(parsedInput.phone);
    const email = normalizeOptionalString(parsedInput.email);
    const adresse = normalizeOptionalString(parsedInput.address);

    const newCustomer = await prisma.$transaction(async (tx) => {
      await getDefaultCustomerCompte(req.user, tx);
      const nextNumero = await buildNextNumeroClient(tx, organisationId);
      const numeroCompte = await buildNextNumeroCompte(
        tx,
        organisationId,
        COMPTE_TYPES.CLIENT
      );

      if (nextNumero <= 1) {
        throw createHttpError(
          500,
          'Invalid customer numbering. Customer number #1 is reserved for "Client inconnu".'
        );
      }

      const client = await tx.client.create({
        data: {
          organisationId,
          numeroClient: nextNumero,
          nom: nom.trim(),
          telephone: telephone || null,
          email: email || null,
          credit: 0,
          estActif: true,
        },
      });

      return tx.compte.create({
        data: {
          organisationId,
          numeroCompte,
          type: COMPTE_TYPES.CLIENT,
          nom: nom.trim(),
          telephone: telephone || null,
          email: email || null,
          adresse: adresse || null,
          actif: true,
          clientSourceId: client.id,
        },
        include: compteInclude,
      });
    });

    return res.status(201).json({
      success: true,
      data: toApiCustomer(newCustomer),
    });
  } catch (error) {
    console.error("createCustomer failed:", error);
    throw error;
  }
};

const getCustomerCredit = async (req, res) => {
  const organisationId = getOrganisationIdFromUser(req.user);
  const customerId = parsePositiveInteger(req.params.id);

  if (Number.isNaN(customerId)) {
    throw createHttpError(400, "customer id must be a valid positive integer.");
  }

  const customer = await resolveCustomerCompte(prisma, organisationId, customerId);

  if (!customer) {
    throw createHttpError(404, "Customer not found.");
  }

  return res.status(200).json({
    customerId: customer.id,
    customerNumber: customer.clientSource.numeroClient,
    name: customer.nom,
    credit: decimalToNumber(customer.clientSource.credit),
  });
};

const getCustomerById = async (req, res) => {
  const organisationId = getOrganisationIdFromUser(req.user);
  const customerId = parsePositiveInteger(req.params.id);

  if (Number.isNaN(customerId)) {
    throw createHttpError(400, "customer id must be a valid positive integer.");
  }

  const customer = await prisma.compte.findFirst({
    where: {
      organisationId,
      id: customerId,
      type: COMPTE_TYPES.CLIENT,
    },
    include: {
      clientSource: {
        include: {
          ventes: {
            select: {
              total: true,
            },
          },
          paiements: {
            orderBy: {
              createdAt: "desc",
            },
          },
          _count: {
            select: {
              ventes: true,
            },
          },
        },
      },
    },
  });

  if (!customer) {
    throw createHttpError(404, "Customer not found.");
  }

  return res.status(200).json({
    ...buildCustomerSummary(customer),
    paymentHistory: (customer.clientSource?.paiements || []).map(toApiCustomerPayment),
  });
};

const getCustomerSales = async (req, res) => {
  const organisationId = getOrganisationIdFromUser(req.user);
  const customerId = parsePositiveInteger(req.params.id);

  if (Number.isNaN(customerId)) {
    throw createHttpError(400, "customer id must be a valid positive integer.");
  }

  const customer = await resolveCustomerCompte(prisma, organisationId, customerId);

  const sales = await prisma.vente.findMany({
    where: {
      organisationId,
      clientId: customer.clientSource.id,
    },
    include: {
      pointDeVente: {
        select: {
          nom: true,
        },
      },
      caisse: {
        select: {
          nom: true,
        },
      },
    },
    orderBy: {
      dateVente: "desc",
    },
  });

  return res.status(200).json(
    sales.map((sale) => ({
      id: sale.id,
      ticketNumber: sale.numeroTicket,
      date: sale.dateVente,
      storeName: sale.pointDeVente ? sale.pointDeVente.nom : "",
      cashRegisterName: sale.caisse ? sale.caisse.nom : "",
      total: decimalToNumber(sale.total),
      paymentMethod: sale.paymentMethod,
      status: sale.status,
    }))
  );
};

const payCustomerCredit = async (req, res) => {
  const organisationId = getOrganisationIdFromUser(req.user);
  const customerId = parsePositiveInteger(req.params.id);

  if (Number.isNaN(customerId)) {
    throw createHttpError(400, "customer id must be a valid positive integer.");
  }

  const parsedInput = validateSchema(customerCreditPaymentSchema, {
    amount: req.body.amount,
    note: req.body.note,
  });

  const amount = new Prisma.Decimal(parsedInput.amount);
  const note = normalizeOptionalString(parsedInput.note);

  const updatedCustomer = await prisma.$transaction(async (tx) => {
    const customer = await resolveCustomerCompte(tx, organisationId, customerId);

    if (new Prisma.Decimal(customer.clientSource.credit).lessThan(amount)) {
      throw createHttpError(
        400,
        "amount cannot be greater than the current customer credit."
      );
    }

    await tx.paiementClient.create({
      data: {
        organisationId,
        clientId: customer.clientSource.id,
        montant: amount,
        note: note || "Paiement credit",
      },
    });

    await tx.client.update({
      where: {
        id: customer.clientSource.id,
      },
      data: {
        credit: {
          decrement: amount,
        },
      },
    });

    return tx.compte.findFirst({
      where: {
        organisationId,
        id: customer.id,
        type: COMPTE_TYPES.CLIENT,
      },
      include: compteInclude,
    });
  });

  return res.status(200).json({
    message: "Customer credit updated successfully.",
    customer: buildCustomerSummary(updatedCustomer),
  });
};

const addSalePayment = async (req, res) => {
  const organisationId = getOrganisationIdFromUser(req.user);
  const saleId = parsePositiveInteger(req.params.id);

  if (Number.isNaN(saleId)) {
    throw createHttpError(400, "sale id must be a valid positive integer.");
  }

  const parsedInput = validateSchema(salePaymentSchema, {
    amount: req.body.amount,
    paymentMethod: req.body.paymentMethod,
    note: req.body.note,
  });

  const paymentMethod = normalizePaymentMethod(parsedInput.paymentMethod);
  const note = normalizeOptionalString(parsedInput.note);

  if (!["cash", "card"].includes(paymentMethod)) {
    throw createHttpError(400, "paymentMethod must be one of: cash, card.");
  }

  const amount = new Prisma.Decimal(parsedInput.amount);

  const result = await prisma.$transaction(async (tx) => {
    const sale = await tx.vente.findFirst({
      where: {
        organisationId,
        id: saleId,
      },
      include: {
        client: {
          include: {
            compte: true,
          },
        },
      },
    });

    if (!sale) {
      throw createHttpError(404, "Sale not found.");
    }

    if (sale.status === "cancelled") {
      throw createHttpError(400, "A cancelled sale cannot receive a payment.");
    }

    if (sale.status === "refunded" || new Prisma.Decimal(sale.total).lessThan(0)) {
      throw createHttpError(400, "A refund cannot receive a payment.");
    }

    if (!["partial", "credit"].includes(sale.paymentMethod)) {
      throw createHttpError(
        400,
        "Only partial or credit sales can receive an additional payment."
      );
    }

    const currentPaidAmount = new Prisma.Decimal(sale.paidAmount || 0);
    const currentRemainingAmount = new Prisma.Decimal(sale.remainingAmount || 0);

    if (currentRemainingAmount.lessThanOrEqualTo(0)) {
      throw createHttpError(400, "This sale is already fully paid.");
    }

    if (amount.greaterThan(currentRemainingAmount)) {
      throw createHttpError(
        400,
        "amount cannot be greater than the remaining amount."
      );
    }

    if (sale.paymentMethod === "credit" && sale.client) {
      const customerCredit = new Prisma.Decimal(sale.client.credit || 0);

      if (customerCredit.lessThan(amount)) {
        throw createHttpError(
          400,
          "amount cannot be greater than the current customer credit."
        );
      }

      await tx.client.update({
        where: {
          id: sale.client.id,
        },
        data: {
          credit: {
            decrement: amount,
          },
        },
      });
    }

    const nextPaidAmount = currentPaidAmount.plus(amount);
    const nextRemainingAmount = currentRemainingAmount.minus(amount);
    const nextPaymentStatus = nextRemainingAmount.equals(0)
      ? "PAID"
      : "PARTIALLY_PAID";

    const updatedSale = await tx.vente.update({
      where: {
        id: sale.id,
      },
      data: {
        paidAmount: nextPaidAmount,
        remainingAmount: nextRemainingAmount,
        paymentStatus: nextPaymentStatus,
      },
      include: {
        client: {
          include: {
            compte: true,
          },
        },
      },
    });

    const payment = sale.clientId
      ? await tx.paiementClient.create({
          data: {
            organisationId,
            clientId: sale.clientId,
            montant: amount,
            note:
              note ||
              `Paiement ${paymentMethod === "card" ? "carte" : "especes"} sur ticket ${sale.numeroTicket}`,
          },
        })
      : null;

    return {
      sale: updatedSale,
      payment,
    };
  });

  return res.status(200).json({
    success: true,
    message: "Sale payment added successfully.",
    sale: {
      id: result.sale.id,
      ticketNumber: result.sale.numeroTicket,
      total: decimalToNumber(result.sale.total),
      paymentMethod: result.sale.paymentMethod,
      paidAmount: decimalToNumber(result.sale.paidAmount),
      remainingAmount: decimalToNumber(result.sale.remainingAmount),
      paymentStatus: result.sale.paymentStatus,
      status: result.sale.status,
      customerId: result.sale.client?.compte?.id || result.sale.clientId,
      customerName: result.sale.client?.compte?.nom || result.sale.client?.nom || null,
    },
    payment: result.payment ? toApiCustomerPayment(result.payment) : null,
  });
};

const deleteCustomer = async (req, res) => {
  const organisationId = getOrganisationIdFromUser(req.user);
  const customerId = parsePositiveInteger(req.params.id);

  if (Number.isNaN(customerId)) {
    throw createHttpError(400, "customer id must be a valid positive integer.");
  }

  const customer = await prisma.compte.findFirst({
    where: {
      organisationId,
      id: customerId,
      type: COMPTE_TYPES.CLIENT,
    },
    include: compteInclude,
  });

  if (!customer || !customer.clientSource) {
    throw createHttpError(404, "Customer not found.");
  }

  if (customer.clientSource.numeroClient === 1) {
    throw createHttpError(
      400,
      "Le client inconnu ne peut pas etre supprime."
    );
  }

  if ((customer.clientSource._count?.ventes || 0) > 0) {
    await prisma.$transaction([
      prisma.client.update({
        where: {
          id: customer.clientSource.id,
        },
        data: {
          estActif: false,
        },
      }),
      prisma.compte.update({
        where: {
          id: customer.id,
        },
        data: {
          actif: false,
        },
      }),
    ]);

    return res.status(200).json({
      message: "Client desactive avec succes.",
      customer: {
        ...buildCustomerSummary(customer),
        active: false,
      },
    });
  }

  await prisma.$transaction(async (tx) => {
    await tx.compte.delete({
      where: {
        id: customer.id,
      },
    });
    await tx.client.delete({
      where: {
        id: customer.clientSource.id,
      },
    });
  });

  return res.status(200).json({
    message: "Client supprime avec succes.",
  });
};

const getSuppliers = async (req, res) => {
  const organisationId = getOrganisationIdFromUser(req.user);
  const suppliers = await prisma.compte.findMany({
    where: {
      organisationId,
      type: COMPTE_TYPES.FOURNISSEUR,
    },
    include: compteInclude,
    orderBy: {
      id: "desc",
    },
  });

  return res.status(200).json(suppliers.map(toApiSupplierFromCompte));
};

const getReports = async (req, res) => {
  const organisationId = getOrganisationIdFromUser(req.user);
  const period = normalizeRequiredString(req.query.period).toLowerCase();
  const range = getDateRange(period);

  if (!range) {
    throw createHttpError(400, "period must be one of: day, week, month.");
  }

  const sales = await prisma.vente.findMany({
    where: {
      organisationId,
      dateVente: {
        gte: range.startDate,
        lte: range.endDate,
      },
    },
    include: {
      pointDeVente: {
        select: {
          id: true,
          nom: true,
        },
      },
      lignes: {
        include: {
          produit: {
            select: {
              id: true,
              nom: true,
              prixAchat: true,
            },
          },
        },
      },
    },
    orderBy: {
      dateVente: "desc",
    },
  });

  let revenue = new Prisma.Decimal(0);
  let netProfit = new Prisma.Decimal(0);
  const salesByStoreMap = new Map();
  const topProductsMap = new Map();

  for (const sale of sales) {
    revenue = revenue.plus(sale.total);

    const storeKey = sale.pointDeVente ? sale.pointDeVente.id : 0;
    const existingStore = salesByStoreMap.get(storeKey) || {
      storeName: sale.pointDeVente ? sale.pointDeVente.nom : "",
      revenue: new Prisma.Decimal(0),
      netProfit: new Prisma.Decimal(0),
      salesCount: 0,
    };

    existingStore.revenue = existingStore.revenue.plus(sale.total);
    existingStore.salesCount += 1;
    salesByStoreMap.set(storeKey, existingStore);

    for (const ligne of sale.lignes) {
      const productKey = ligne.produit ? ligne.produit.id : ligne.produitId;
      const existingProduct = topProductsMap.get(productKey) || {
        productName: ligne.produit ? ligne.produit.nom : "",
        quantitySold: 0,
        revenue: new Prisma.Decimal(0),
        netProfit: new Prisma.Decimal(0),
      };
      const lineNetProfit = getLineNetProfit(ligne);

      existingProduct.quantitySold += ligne.quantite;
      existingProduct.revenue = existingProduct.revenue.plus(ligne.sousTotal);
      existingProduct.netProfit = existingProduct.netProfit.plus(lineNetProfit);
      existingStore.netProfit = existingStore.netProfit.plus(lineNetProfit);
      netProfit = netProfit.plus(lineNetProfit);
      topProductsMap.set(productKey, existingProduct);
    }
  }

  const salesByStore = Array.from(salesByStoreMap.values())
    .map((store) => ({
      storeName: store.storeName,
      revenue: decimalToNumber(store.revenue),
      netProfit: decimalToNumber(store.netProfit),
      salesCount: store.salesCount,
    }))
    .sort((a, b) => b.revenue - a.revenue);

  const topProducts = Array.from(topProductsMap.values())
    .map((product) => ({
      productName: product.productName,
      quantitySold: product.quantitySold,
      revenue: decimalToNumber(product.revenue),
      netProfit: decimalToNumber(product.netProfit),
    }))
    .sort((a, b) => b.quantitySold - a.quantitySold)
    .slice(0, 10);

  return res.status(200).json({
    revenue: decimalToNumber(revenue),
    netProfit: decimalToNumber(netProfit),
    salesCount: sales.length,
    averageBasket:
      sales.length > 0 ? decimalToNumber(revenue.div(sales.length)) : 0,
    bestStore: salesByStore.length > 0 ? salesByStore[0].storeName : "",
    salesByStore,
    topProducts,
  });
};

const getAnalytics = async (req, res) => {
  const organisationId = getOrganisationIdFromUser(req.user);
  const period = normalizeRequiredString(req.query.period || "week").toLowerCase();
  const range = getAnalyticsDateRange(period);
  const primaryStore = await getPrimaryStore(organisationId);

  if (!range) {
    throw createHttpError(400, "period must be one of: week, month.");
  }

  const [stores, sales] = await Promise.all([
    prisma.pointDeVente.findMany({
      where: {
        organisationId,
        ...(primaryStore?.id ? { id: primaryStore.id } : {}),
      },
      select: {
        id: true,
        nom: true,
      },
      orderBy: [{ nom: "asc" }, { id: "asc" }],
    }),
    prisma.vente.findMany({
      where: {
        organisationId,
        status: "completed",
        ...(primaryStore?.id ? { pointDeVenteId: primaryStore.id } : {}),
        createdAt: {
          gte: range.startDate,
          lte: range.endDate,
        },
      },
      select: {
        id: true,
        total: true,
        createdAt: true,
        pointDeVente: {
          select: {
            id: true,
            nom: true,
          },
        },
        lignes: {
          select: {
            produitId: true,
            quantite: true,
            sousTotal: true,
            produit: {
              select: {
                id: true,
                nom: true,
                categorie: true,
                categorieProduit: {
                  select: {
                    nom: true,
                    nomComplet: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: "asc",
      },
    }),
  ]);

  const hasSales = sales.length > 0;
  const evolutionBuckets = buildAnalyticsBuckets(
    period,
    range.startDate,
    range.endDate
  );
  const salesEvolutionMap = new Map(
    evolutionBuckets.map((bucket) => [bucket.key, new Prisma.Decimal(0)])
  );
  const salesByStoreMap = new Map(
    stores.map((store) => [
      store.id,
      {
        store: store.nom,
        ventes: new Prisma.Decimal(0),
      },
    ])
  );
  const topProductsMap = new Map();
  const categoryDistributionMap = new Map();
  let totalRevenue = new Prisma.Decimal(0);

  for (const sale of sales) {
    totalRevenue = totalRevenue.plus(sale.total);

    const saleDateKey = formatAnalyticsDateKey(sale.createdAt);
    const existingDailyRevenue =
      salesEvolutionMap.get(saleDateKey) || new Prisma.Decimal(0);
    salesEvolutionMap.set(saleDateKey, existingDailyRevenue.plus(sale.total));

    if (sale.pointDeVente) {
      const existingStore =
        salesByStoreMap.get(sale.pointDeVente.id) || {
          store: sale.pointDeVente.nom,
          ventes: new Prisma.Decimal(0),
        };

      existingStore.ventes = existingStore.ventes.plus(sale.total);
      salesByStoreMap.set(sale.pointDeVente.id, existingStore);
    }

    for (const ligne of sale.lignes) {
      const productId = ligne.produit?.id || ligne.produitId;
      const productName = ligne.produit?.nom || "Produit";
      const productCategory =
        ligne.produit?.categorieProduit?.nom ||
        ligne.produit?.categorieProduit?.nomComplet ||
        ligne.produit?.categorie ||
        "Sans categorie";
      const existingProduct = topProductsMap.get(productId) || {
        name: productName,
        quantite: 0,
      };
      const existingCategoryRevenue =
        categoryDistributionMap.get(productCategory) || new Prisma.Decimal(0);

      existingProduct.quantite += ligne.quantite;
      topProductsMap.set(productId, existingProduct);
      categoryDistributionMap.set(
        productCategory,
        existingCategoryRevenue.plus(ligne.sousTotal)
      );
    }
  }

  const salesEvolution = hasSales
    ? evolutionBuckets.map((bucket) => ({
        date: bucket.label,
        ventes: decimalToNumber(salesEvolutionMap.get(bucket.key)),
      }))
    : [];

  const salesByStore = hasSales
    ? Array.from(salesByStoreMap.values())
        .map((store) => ({
          store: store.store,
          ventes: decimalToNumber(store.ventes),
        }))
        .sort((left, right) => {
          if (right.ventes !== left.ventes) {
            return right.ventes - left.ventes;
          }

          return left.store.localeCompare(right.store);
        })
    : [];

  const topProducts = hasSales
    ? Array.from(topProductsMap.values())
        .sort((left, right) => right.quantite - left.quantite)
        .slice(0, 10)
    : [];

  const salesDistribution = hasSales
    ? Array.from(categoryDistributionMap.entries())
        .map(([name, revenue]) => ({
          name,
          revenue: decimalToNumber(revenue),
          value:
            totalRevenue.gt(0)
              ? Number(
                  revenue
                    .div(totalRevenue)
                    .times(100)
                    .toDecimalPlaces(2)
                    .toString()
                )
              : 0,
        }))
        .sort((left, right) => right.revenue - left.revenue)
    : [];

  const bestStore = salesByStore[0] || null;

  return res.status(200).json({
    period,
    hasSales,
    revenue: decimalToNumber(totalRevenue),
    salesCount: sales.length,
    averageBasket:
      sales.length > 0 ? decimalToNumber(totalRevenue.div(sales.length)) : 0,
    bestStore: bestStore
      ? {
          name: bestStore.store,
          revenue: bestStore.ventes,
        }
      : null,
    topProduct: topProducts[0] || null,
    categoriesTracked: salesDistribution.length,
    salesEvolution,
    salesByStore,
    topProducts,
    salesDistribution,
  });
};

const getUsers = async (req, res) => {
  const organisationId = getOrganisationIdFromUser(req.user);
  const { store, cashRegister } = await getSingleStoreContext(organisationId);
  const users = await prisma.utilisateur.findMany({
    where: {
      organisationId,
      ...(store?.id && cashRegister?.id
        ? {
            OR: [
              { role: "ADMIN" },
              {
                pointDeVenteId: store.id,
                caisseId: cashRegister.id,
              },
            ],
          }
        : {}),
    },
    include: {
      pointDeVente: {
        select: {
          nom: true,
        },
      },
      caisse: {
        select: {
          nom: true,
        },
      },
    },
    orderBy: {
      id: "desc",
    },
  });

  return res.status(200).json(
    users.map((user) => ({
      id: user.id,
      name: user.nom,
      email: user.email,
      role: mapRoleToApi(user.role),
      storeId: user.pointDeVenteId,
      storeName: user.pointDeVente ? user.pointDeVente.nom : null,
      cashRegisterId: user.caisseId,
      cashRegisterName: user.caisse ? user.caisse.nom : null,
      status: user.estActif ? "active" : "inactive",
    }))
  );
};

const getStores = async (req, res) => {
  const organisationId = getOrganisationIdFromUser(req.user);
  const employeeStoreId = getEmployeeStoreId(req.user);
  const todayStart = getStartOfDay(new Date());
  const todayEnd = getEndOfDay(new Date());
  const primaryStore =
    req.user.role === "ADMIN" ? await getPrimaryStore(organisationId) : null;

  if (req.user.role === "EMPLOYE" && !employeeStoreId) {
    throw createHttpError(403, "Employee is not assigned to a store.");
  }

  const [stores, todaySales] = await Promise.all([
    prisma.pointDeVente.findMany({
      where:
        req.user.role === "EMPLOYE" && employeeStoreId
          ? {
              organisationId,
              id: employeeStoreId,
            }
          : {
              organisationId,
              ...(primaryStore?.id ? { id: primaryStore.id } : {}),
            },
      include: {
        _count: {
          select: {
            utilisateurs: true,
            caisses: true,
          },
        },
      },
      orderBy: {
        id: "desc",
      },
    }),
    prisma.vente.findMany({
      where: {
        organisationId,
        dateVente: {
          gte: todayStart,
          lte: todayEnd,
        },
        ...(req.user.role === "EMPLOYE" && employeeStoreId
          ? {
              pointDeVenteId: employeeStoreId,
            }
          : primaryStore?.id
            ? {
                pointDeVenteId: primaryStore.id,
              }
            : {}),
      },
      select: {
        pointDeVenteId: true,
        total: true,
      },
    }),
  ]);

  const revenueByStore = new Map();

  for (const sale of todaySales) {
    const currentRevenue =
      revenueByStore.get(sale.pointDeVenteId) || new Prisma.Decimal(0);
    revenueByStore.set(sale.pointDeVenteId, currentRevenue.plus(sale.total));
  }

  return res.status(200).json(
    stores.map((store) => ({
      id: store.id,
      name: store.nom,
      city: extractCityFromAddress(store.adresse),
      address: store.adresse || "",
      usersCount: store._count.utilisateurs,
      cashRegistersCount: store._count.caisses,
      todayRevenue: decimalToNumber(
        revenueByStore.get(store.id) || new Prisma.Decimal(0)
      ),
      status: "active",
    }))
  );
};

const getAutoReportStatus = async (req, res) =>
  res.status(200).json({
    isActive: getReportStatus(),
  });

const toggleAutoReportStatus = async (req, res) => {
  const { isActive } = req.body || {};

  if (typeof isActive !== "boolean") {
    throw createHttpError(400, "isActive must be a boolean.");
  }

  if (isActive && !isEmailConfigured()) {
    throw createHttpError(
      400,
      "Configuration email manquante. Renseignez EMAIL_USER et EMAIL_PASS avant activation."
    );
  }

  return res.status(200).json({
    isActive: setReportStatus(isActive),
  });
};

const getCashRegisters = async (req, res) => {
  const organisationId = getOrganisationIdFromUser(req.user);
  const requestedStoreId = parseOptionalPositiveInteger(req.query.storeId);
  const employeeStoreId = getEmployeeStoreId(req.user);

  if (Number.isNaN(requestedStoreId)) {
    throw createHttpError(400, "storeId must be a valid positive integer.");
  }

  if (req.user.role === "EMPLOYE" && !employeeStoreId) {
    throw createHttpError(403, "Employee is not assigned to a store.");
  }

  const storeId = req.user.role === "EMPLOYE" ? employeeStoreId : requestedStoreId;
  const cashRegisters = await prisma.caisse.findMany({
    where: storeId
      ? {
          organisationId,
          pointDeVenteId: storeId,
        }
      : {
          organisationId,
        },
    include: {
      pointDeVente: {
        select: {
          nom: true,
        },
      },
    },
    orderBy: [{ pointDeVenteId: "asc" }, { id: "asc" }],
  });

  return res.status(200).json(cashRegisters.map(toApiCashRegister));
};

module.exports = {
  login,
  getProducts,
  getProductSales,
  getProductByBarcode,
  getStocks,
  getStockAlerts,
  stockIn,
  stockCorrection,
  createSale,
  getSales,
  getCustomers,
  createCustomer,
  getCustomerById,
  getCustomerSales,
  payCustomerCredit,
  addSalePayment,
  deleteCustomer,
  getCustomerCredit,
  getSuppliers,
  getReports,
  getAnalytics,
  getAutoReportStatus,
  toggleAutoReportStatus,
  getUsers,
  getStores,
  getCashRegisters,
  createRefund,
  cancelSale,
  returnSale,
};
