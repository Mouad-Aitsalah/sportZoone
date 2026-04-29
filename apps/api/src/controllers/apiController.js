const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { Prisma } = require("@prisma/client");
const { randomBytes } = require("crypto");
const prisma = require("../config/prisma");
const { createHttpError } = require("../utils/httpError");
const { validateSchema } = require("../utils/validation");
const {
  loginSchema,
  customerCreateSchema,
  customerCreditPaymentSchema,
  saleCreateSchema,
  stockEntrySchema,
  stockCorrectionSchema,
} = require("../utils/validationSchemas");
const { isEmailConfigured } = require("../services/emailService");
const {
  getReportStatus,
  setReportStatus,
} = require("../services/reportSettings");

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
      pointDeVenteId: user.pointDeVenteId,
      caisseId: user.caisseId,
    },
    process.env.JWT_SECRET,
    {
      expiresIn: process.env.JWT_EXPIRES_IN || "7d",
    }
  );

const mapRoleToApi = (role) => (role === "ADMIN" ? "admin" : "employe");

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
  storeId: user.pointDeVenteId,
  storeName: user.pointDeVente ? user.pointDeVente.nom : null,
  cashRegisterId: user.caisseId,
  cashRegisterName: user.caisse ? user.caisse.nom : null,
});

const toApiCashRegister = (caisse) => ({
  id: caisse.id,
  name: caisse.nom,
  code: caisse.code,
  storeId: caisse.pointDeVenteId,
  storeName: caisse.pointDeVente ? caisse.pointDeVente.nom : null,
  isActive: caisse.estActive,
});

const toApiProduct = (product) => ({
  id: product.id,
  name: product.nom,
  barcode: product.codeBarres,
  category: product.categorie,
  purchasePrice: decimalToNumber(product.prixAchat),
  salePrice: decimalToNumber(product.prixVente),
  supplierId: product.fournisseurId,
  supplierName: product.fournisseur ? product.fournisseur.nom : null,
  active: product.estActif,
});

const toApiCustomer = (client) => ({
  id: client.id,
  customerNumber: client.numeroClient,
  name: client.nom,
  phone: client.telephone,
  email: client.email,
  credit: decimalToNumber(client.credit),
  active: client.estActif,
});

const buildCustomerSummary = (client) => {
  const ventes = client.ventes || [];
  const totalPurchases = ventes.reduce(
    (total, vente) => total.plus(vente.total),
    new Prisma.Decimal(0)
  );

  return {
    ...toApiCustomer(client),
    totalPurchases: decimalToNumber(totalPurchases),
    salesCount:
      client._count?.ventes !== undefined ? client._count.ventes : ventes.length,
  };
};

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

const getLineNetProfit = (line) => {
  const unitSalePrice = getDecimalValue(line.prixUnitaire);
  const purchasePrice = getDecimalValue(line.produit?.prixAchat);
  const quantity = new Prisma.Decimal(line.quantite || 0);

  return unitSalePrice.minus(purchasePrice).times(quantity);
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

const toApiStock = (stock) => {
  const minimumThreshold =
    stock.minimumThreshold ?? stock.produit?.seuilMinimum ?? 0;
  const quantity = stock.quantity ?? stock.quantite ?? 0;
  const statusMeta = getStockStatusMeta(quantity, minimumThreshold);

  return {
    id: stock.id,
    productId: stock.productId ?? stock.produitId,
    productName: stock.productName ?? stock.produit?.nom ?? "",
    barcode: stock.barcode ?? stock.produit?.codeBarres ?? "",
    storeId: stock.storeId ?? stock.pointDeVenteId,
    storeName: stock.storeName ?? stock.pointDeVente?.nom ?? "",
    quantity,
    minimumThreshold,
    status: statusMeta.status,
    isLowStock: statusMeta.isLowStock,
    severity: statusMeta.severity,
  };
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

const getDefaultCustomer = async (db = prisma) => {
  const defaultCustomer = await db.client.findUnique({
    where: {
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

const ensureProductAndStoreExist = async (produitId, pointDeVenteId) => {
  const [produit, pointDeVente] = await Promise.all([
    prisma.produit.findUnique({
      where: { id: produitId },
      select: {
        id: true,
        estActif: true,
      },
    }),
    prisma.pointDeVente.findUnique({
      where: { id: pointDeVenteId },
      select: {
        id: true,
      },
    }),
  ]);

  if (!produit) {
    throw createHttpError(404, "Product not found.");
  }

  if (!produit.estActif) {
    throw createHttpError(400, "Product is inactive.");
  }

  if (!pointDeVente) {
    throw createHttpError(404, "Store not found.");
  }
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
    const quantity = validatePositiveInteger(
      getAliasedValue(item, "quantity", "quantite"),
      "quantity"
    );

    validateNonNegativeNumber(
      getAliasedValue(item, "unitPrice", "prixUnitaire"),
      "unitPrice"
    );

    groupedItems.set(productId, (groupedItems.get(productId) || 0) + quantity);
  }

  return Array.from(groupedItems.entries()).map(([productId, quantity]) => ({
    productId,
    quantity,
  }));
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
    const quantity = validatePositiveInteger(
      getAliasedValue(item, "quantity", "quantite"),
      "quantity"
    );

    groupedItems.set(productId, (groupedItems.get(productId) || 0) + quantity);
  }

  return Array.from(groupedItems.entries()).map(([productId, quantity]) => ({
    productId,
    quantity,
  }));
};

const generateTicketNumber = (storeId) => {
  const now = new Date();
  const datePart = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("");
  const timePart = [
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0"),
  ].join("");
  const randomPart = randomBytes(2).toString("hex").toUpperCase();

  return `TCK-${storeId}-${datePart}${timePart}-${randomPart}`;
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
  { productId, storeId, quantity, type, reason = null }
) =>
  db.stockMovement.create({
    data: {
      produitId: productId,
      pointDeVenteId: storeId,
      quantite: quantity,
      type,
      reason: normalizeOptionalString(reason),
    },
  });

const restoreStockForProduct = async (
  db,
  { productId, storeId, quantity, type, reason = null }
) => {
  await db.stock.upsert({
    where: {
      produitId_pointDeVenteId: {
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
      produitId: productId,
      pointDeVenteId: storeId,
      quantite: quantity,
    },
  });

  await createStockMovement(db, {
    productId,
    storeId,
    quantity,
    type,
    reason,
  });
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
  const { page, limit, skip } = getPaginationParams(req.query);
  const [total, products] = await Promise.all([
    prisma.produit.count(),
    prisma.produit.findMany({
      include: {
        fournisseur: {
          select: {
            nom: true,
          },
        },
      },
      orderBy: {
        id: "desc",
      },
      skip,
      take: limit,
    }),
  ]);

  return res.status(200).json(
    buildPaginatedResponse({
      data: products.map(toApiProduct),
      page,
      limit,
      total,
    })
  );
};

const getProductByBarcode = async (req, res) => {
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
  }

  const product = await prisma.produit.findUnique({
    where: { codeBarres: barcode },
    select: {
      id: true,
      nom: true,
      codeBarres: true,
      prixVente: true,
      estActif: true,
    },
  });

  if (!product || !product.estActif) {
    throw createHttpError(404, "Product not found.");
  }

  if (storeId) {
    const store = await prisma.pointDeVente.findUnique({
      where: { id: storeId },
      select: { id: true },
    });

    if (!store) {
      throw createHttpError(404, "Store not found.");
    }
  }

  const stockAggregation = await prisma.stock.aggregate({
    where: {
      produitId: product.id,
      ...(storeId ? { pointDeVenteId: storeId } : {}),
    },
    _sum: {
      quantite: true,
    },
  });

  return res.status(200).json({
    id: product.id,
    name: product.nom,
    barcode: product.codeBarres,
    salePrice: decimalToNumber(product.prixVente),
    stock: stockAggregation._sum.quantite || 0,
  });
};

const getStocks = async (req, res) => {
  const employeeStoreId = getEmployeeStoreId(req.user);
  const { page, limit, skip } = getPaginationParams(req.query);

  if (req.user.role === "EMPLOYE" && !employeeStoreId) {
    throw createHttpError(403, "Employee is not assigned to a store.");
  }

  const storesWhere =
    req.user.role === "ADMIN"
      ? {}
      : {
          id: employeeStoreId,
        };

  const [products, stores, stockRows] = await Promise.all([
    prisma.produit.findMany({
      select: {
        id: true,
        nom: true,
        codeBarres: true,
        seuilMinimum: true,
      },
      orderBy: [{ nom: "asc" }, { id: "asc" }],
    }),
    prisma.pointDeVente.findMany({
      where: storesWhere,
      select: {
        id: true,
        nom: true,
      },
      orderBy: [{ nom: "asc" }, { id: "asc" }],
    }),
    prisma.stock.findMany({
      where:
        req.user.role === "ADMIN"
          ? {}
          : {
              pointDeVenteId: employeeStoreId,
            },
      select: {
        id: true,
        produitId: true,
        pointDeVenteId: true,
        quantite: true,
      },
    }),
  ]);

  const stockByProductAndStore = new Map(
    stockRows.map((stock) => [
      `${stock.produitId}-${stock.pointDeVenteId}`,
      stock,
    ])
  );

  const allStockRows = [];

  for (const store of stores) {
    for (const product of products) {
      const stockKey = `${product.id}-${store.id}`;
      const existingStock = stockByProductAndStore.get(stockKey);

      allStockRows.push(
        toApiStock({
          id: existingStock?.id || `virtual-${product.id}-${store.id}`,
          productId: product.id,
          productName: product.nom,
          barcode: product.codeBarres,
          storeId: store.id,
          storeName: store.nom,
          quantity: existingStock?.quantite ?? 0,
          minimumThreshold: product.seuilMinimum,
        })
      );
    }
  }

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
  const employeeStoreId = getEmployeeStoreId(req.user);

  if (req.user.role === "EMPLOYE" && !employeeStoreId) {
    throw createHttpError(403, "Employee is not assigned to a store.");
  }

  const [products, stores, stockRows] = await Promise.all([
    prisma.produit.findMany({
      select: {
        id: true,
        nom: true,
        seuilMinimum: true,
      },
    }),
    prisma.pointDeVente.findMany({
      where:
        req.user.role === "EMPLOYE"
          ? {
              id: employeeStoreId,
            }
          : {},
      select: {
        id: true,
        nom: true,
      },
    }),
    prisma.stock.findMany({
      where:
        req.user.role === "EMPLOYE"
          ? {
              pointDeVenteId: employeeStoreId,
            }
          : {},
      select: {
        id: true,
        produitId: true,
        pointDeVenteId: true,
        quantite: true,
      },
    }),
  ]);

  const stockByProductAndStore = new Map(
    stockRows.map((stock) => [
      `${stock.produitId}-${stock.pointDeVenteId}`,
      stock,
    ])
  );

  const lowStockItems = [];

  for (const store of stores) {
    for (const product of products) {
      const existingStock = stockByProductAndStore.get(`${product.id}-${store.id}`);
      const quantity = existingStock?.quantite ?? 0;
      const statusMeta = getStockStatusMeta(quantity, product.seuilMinimum);

      if (!statusMeta.isLowStock) {
        continue;
      }

      lowStockItems.push({
        id: existingStock?.id || `virtual-${product.id}-${store.id}`,
        produitId: product.id,
        produitNom: product.nom,
        magasin: store.nom,
        magasinId: store.id,
        quantite: quantity,
        seuilMinimum: product.seuilMinimum,
        isLowStock: true,
        severity: statusMeta.severity,
        status: statusMeta.status,
      });
    }
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
  const parsedInput = validateSchema(stockEntrySchema, {
    productId: req.body.productId,
    storeId: req.body.storeId,
    quantity: req.body.quantity,
    reason: req.body.reason,
  });
  const productId = parsePositiveInteger(parsedInput.productId);
  const storeId = parsePositiveInteger(parsedInput.storeId);
  const quantity = parsePositiveInteger(parsedInput.quantity);
  const reason = normalizeOptionalString(parsedInput.reason);

  await ensureProductAndStoreExist(productId, storeId);

  const stock = await prisma.stock.upsert({
    where: {
      produitId_pointDeVenteId: {
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
      produitId: productId,
      pointDeVenteId: storeId,
      quantite: quantity,
    },
    include: {
      produit: {
        select: {
          nom: true,
          codeBarres: true,
          seuilMinimum: true,
        },
      },
      pointDeVente: {
        select: {
          nom: true,
        },
      },
    },
  });

  await createStockMovement(prisma, {
    productId,
    storeId,
    quantity,
    type: "IN",
    reason,
  });

  return res.status(200).json(toApiStock(stock));
};

const stockCorrection = async (req, res) => {
  const parsedInput = validateSchema(stockCorrectionSchema, {
    productId: req.body.productId,
    storeId: req.body.storeId,
    quantity: req.body.quantity,
    reason: req.body.reason,
  });
  const productId = parsePositiveInteger(parsedInput.productId);
  const storeId = parsePositiveInteger(parsedInput.storeId);
  const quantity = parseNonNegativeInteger(parsedInput.quantity);
  const reason = normalizeOptionalString(parsedInput.reason);

  await ensureProductAndStoreExist(productId, storeId);

  const stock = await prisma.$transaction(async (tx) => {
    const existingStock = await tx.stock.findUnique({
      where: {
        produitId_pointDeVenteId: {
          produitId: productId,
          pointDeVenteId: storeId,
        },
      },
      select: {
        quantite: true,
      },
    });

    const previousQuantity = existingStock ? existingStock.quantite : 0;
    const quantityDelta = quantity - previousQuantity;

    const updatedStock = await tx.stock.upsert({
      where: {
        produitId_pointDeVenteId: {
          produitId: productId,
          pointDeVenteId: storeId,
        },
      },
      update: {
        quantite: quantity,
      },
      create: {
        produitId: productId,
        pointDeVenteId: storeId,
        quantite: quantity,
      },
      include: {
        produit: {
          select: {
            nom: true,
            codeBarres: true,
            seuilMinimum: true,
          },
        },
        pointDeVente: {
          select: {
            nom: true,
          },
        },
      },
    });

    await createStockMovement(tx, {
      productId,
      storeId,
      quantity: quantityDelta,
      type: "CORRECTION",
      reason,
    });

    return updatedStock;
  });

  return res.status(200).json(toApiStock(stock));
};

const createSale = async (req, res) => {
  if (isEmptyRequestBody(req.body)) {
    throw createHttpError(400, "Request body is empty", "BAD_REQUEST");
  }

  validateSchema(saleCreateSchema, {
    storeId: getAliasedValue(req.body, "storeId", "pointDeVenteId"),
    cashRegisterId: getAliasedValue(req.body, "cashRegisterId", "caisseId"),
    userId: getAliasedValue(req.body, "userId", "utilisateurId"),
    customerId: getAliasedValue(req.body, "customerId", "clientId"),
    paymentMethod: req.body.paymentMethod,
    total: req.body.total,
    items: Array.isArray(req.body.items)
      ? req.body.items.map((item) => ({
          productId: getAliasedValue(item, "productId", "produitId"),
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
  const storeId = isEmployee ? employeeStoreId : requestedStoreId;
  const cashRegisterId = isEmployee ? employeeCashRegisterId : requestedCashRegisterId;
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
      "paymentMethod must be one of: cash, card, credit.",
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

  try {
    const sale = await prisma.$transaction(async (tx) => {
    const customer =
      requestedCustomerId !== null
        ? await tx.client.findUnique({
            where: {
              id: requestedCustomerId,
            },
          })
        : await getDefaultCustomer(tx);

    if (!customer) {
      throw createHttpError(404, "Customer not found.");
    }

    const pointDeVente = await tx.pointDeVente.findUnique({
      where: { id: storeId },
      select: { id: true },
    });

    if (!pointDeVente) {
      throw createHttpError(404, "Store not found.");
    }

    const caisse = await tx.caisse.findUnique({
      where: { id: cashRegisterId },
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

    const utilisateur = await tx.utilisateur.findUnique({
      where: { id: userId },
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
      throw createHttpError(400, "Cannot create a sale with an inactive user.");
    }

    if (utilisateur.role === "EMPLOYE" && utilisateur.pointDeVenteId !== storeId) {
      throw createHttpError(400, "This employee does not belong to the selected store.");
    }

    if (utilisateur.role === "EMPLOYE" && utilisateur.caisseId !== cashRegisterId) {
      throw createHttpError(
        400,
        "This employee does not belong to the selected cash register."
      );
    }

    const productIds = items.map((item) => item.productId);
    const produits = await tx.produit.findMany({
      where: {
        id: {
          in: productIds,
        },
      },
      select: {
        id: true,
        nom: true,
        prixVente: true,
        estActif: true,
      },
    });

    if (produits.length !== productIds.length) {
      const foundProductIds = new Set(produits.map((produit) => produit.id));
      const missingProductIds = productIds.filter((id) => !foundProductIds.has(id));

      throw createHttpError(
        404,
        `Products not found: ${missingProductIds.join(", ")}.`
      );
    }

    const stocks = await tx.stock.findMany({
      where: {
        pointDeVenteId: storeId,
        produitId: {
          in: productIds,
        },
      },
      select: {
        produitId: true,
        quantite: true,
      },
    });

    const productMap = new Map(produits.map((produit) => [produit.id, produit]));
    const stockMap = new Map(stocks.map((stock) => [stock.produitId, stock]));

    const lignesData = [];
    let total = new Prisma.Decimal(0);

    for (const item of items) {
      const produit = productMap.get(item.productId);
      const stock = stockMap.get(item.productId);

      if (!produit.estActif) {
        throw createHttpError(400, `Product ${produit.nom} is inactive.`);
      }

      if (!stock) {
        throw createHttpError(
          400,
          `No stock found for product ${produit.nom} in the selected store.`
        );
      }

      if (stock.quantite < item.quantity) {
        throw createHttpError(400, `Insufficient stock for product ${produit.nom}.`);
      }

      const prixUnitaire = new Prisma.Decimal(produit.prixVente);
      const sousTotal = prixUnitaire.mul(item.quantity);

      total = total.plus(sousTotal);

      lignesData.push({
        produitId: item.productId,
        quantite: item.quantity,
        prixUnitaire,
        sousTotal,
      });
    }

    const totalDifference = total.minus(frontendTotal).abs();

    if (totalDifference.greaterThan(SALE_TOTAL_TOLERANCE)) {
      throw createHttpError(
        400,
        `Provided total (${frontendTotal.toFixed(2)}) does not match calculated total (${total.toFixed(2)}).`
      );
    }

    if (paymentMethod === "credit" && customer.numeroClient === 1) {
      throw createHttpError(
        400,
        'Credit payment is not allowed for "Client inconnu".'
      );
    }

    const createdSale = await tx.vente.create({
      data: {
        numeroTicket: generateTicketNumber(storeId),
        total,
        paymentMethod,
        status: "completed",
        pointDeVenteId: storeId,
        caisseId: cashRegisterId,
        utilisateurId: userId,
        clientId: customer.id,
        lignes: {
          create: lignesData,
        },
      },
      select: {
        id: true,
        numeroTicket: true,
      },
    });

    for (const item of items) {
      const produit = productMap.get(item.productId);

      const updatedStock = await tx.stock.updateMany({
        where: {
          produitId: item.productId,
          pointDeVenteId: storeId,
          quantite: {
            gte: item.quantity,
          },
        },
        data: {
          quantite: {
            decrement: item.quantity,
          },
        },
      });

      if (updatedStock.count === 0) {
        throw createHttpError(400, `Insufficient stock for product ${produit.nom}.`);
      }

      await createStockMovement(tx, {
        productId: item.productId,
        storeId,
        quantity: -item.quantity,
        type: "SALE",
        reason: `Sale ${createdSale.numeroTicket}`,
      });
    }

    if (paymentMethod === "credit") {
      await tx.client.update({
        where: {
          id: customer.id,
        },
        data: {
          credit: {
            increment: total,
          },
        },
      });
    }

    return tx.vente.findUnique({
      where: { id: createdSale.id },
      select: {
        id: true,
        numeroTicket: true,
        total: true,
        paymentMethod: true,
        status: true,
        createdAt: true,
        pointDeVenteId: true,
        caisseId: true,
        utilisateurId: true,
        clientId: true,
        client: true,
      },
    });
    });

    return res.status(201).json({
      id: sale.id,
      ticketNumber: sale.numeroTicket,
      storeId: sale.pointDeVenteId,
      cashRegisterId: sale.caisseId,
      userId: sale.utilisateurId,
      customerId: sale.clientId,
      customerNumber: sale.client ? sale.client.numeroClient : null,
      customerName: sale.client ? sale.client.nom : null,
      customerCredit: sale.client ? decimalToNumber(sale.client.credit) : 0,
      total: decimalToNumber(sale.total),
      paymentMethod: sale.paymentMethod,
      status: sale.status,
      createdAt: sale.createdAt,
    });
  } catch (error) {
    throw error;
  }
};

const getSales = async (req, res) => {
  const requestedPaymentMethod = normalizeOptionalString(req.query.paymentMethod);
  const paymentMethodFilter = requestedPaymentMethod
    ? normalizePaymentMethod(requestedPaymentMethod)
    : null;

  if (requestedPaymentMethod && !paymentMethodFilter) {
    throw createHttpError(400, "paymentMethod must be one of: cash, card, credit.");
  }

  const where = {
    ...(req.user.role === "EMPLOYE"
      ? {
          utilisateurId: req.user.id,
        }
      : {}),
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
      include: {
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
        client: true,
        lignes: {
          orderBy: {
            id: "asc",
          },
          include: {
            produit: {
              select: {
                id: true,
                nom: true,
              },
            },
          },
        },
        retours: {
          select: {
            id: true,
            produitId: true,
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
        const returnedQuantities = buildReturnedQuantitiesMap(sale.retours);

        return {
          id: sale.id,
          ticketNumber: sale.numeroTicket,
          date: sale.dateVente,
          paymentMethod: sale.paymentMethod,
          status: sale.status,
          storeId: sale.pointDeVenteId,
          storeName: sale.pointDeVente ? sale.pointDeVente.nom : "",
          cashRegisterId: sale.caisseId,
          cashRegisterName: sale.caisse ? sale.caisse.nom : "",
          userId: sale.utilisateurId,
          cashierName: sale.utilisateur ? sale.utilisateur.nom : "",
          customerId: sale.clientId || 1,
          customerNumber: sale.client ? sale.client.numeroClient : 1,
          customerName: sale.client ? sale.client.nom : "Client inconnu",
          customerCredit: sale.client ? decimalToNumber(sale.client.credit) : 0,
          itemsCount: sale.lignes.reduce(
            (totalItems, ligne) => totalItems + ligne.quantite,
            0
          ),
          total: decimalToNumber(sale.total),
          returns: sale.retours.map((retour) => ({
            id: retour.id,
            produitId: retour.produitId,
            quantity: retour.quantite,
            reason: retour.raison,
            createdAt: retour.createdAt,
          })),
          items: sale.lignes.map((ligne) => {
            const returnedQuantity = returnedQuantities.get(ligne.produitId) || 0;

            return {
              productId: ligne.produitId,
              productName: ligne.produit ? ligne.produit.nom : "",
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
  const saleId = parsePositiveInteger(req.params.id);

  if (Number.isNaN(saleId)) {
    throw createHttpError(400, "sale id must be a valid positive integer.");
  }

  const sale = await prisma.$transaction(async (tx) => {
    const existingSale = await tx.vente.findUnique({
      where: { id: saleId },
      include: {
        lignes: {
          select: {
            produitId: true,
            quantite: true,
          },
        },
        retours: {
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
        productId: ligne.produitId,
        storeId: existingSale.pointDeVenteId,
        quantity: ligne.quantite,
        type: "CANCEL",
        reason: `Sale cancelled ${existingSale.numeroTicket}`,
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

  const items = normalizeReturnItems(req.body.items);
  const reason = normalizeOptionalString(req.body.reason);

  const sale = await prisma.$transaction(async (tx) => {
    const existingSale = await tx.vente.findUnique({
      where: { id: saleId },
      include: {
        lignes: {
          select: {
            produitId: true,
            quantite: true,
          },
        },
        retours: {
          select: {
            produitId: true,
            quantite: true,
          },
        },
      },
    });

    if (!existingSale) {
      throw createHttpError(404, "Sale not found.");
    }

    if (req.user.role === "EMPLOYE" && existingSale.utilisateurId !== req.user.id) {
      throw createHttpError(403, "Employees can only return their own sales.");
    }

    if (existingSale.status === "cancelled") {
      throw createHttpError(400, "A cancelled sale cannot be returned.");
    }

    if (existingSale.status === "refunded") {
      throw createHttpError(400, "This sale is already fully refunded.");
    }

    const soldQuantities = new Map(
      existingSale.lignes.map((ligne) => [ligne.produitId, ligne.quantite])
    );
    const returnedQuantities = buildReturnedQuantitiesMap(existingSale.retours);

    for (const item of items) {
      const soldQuantity = soldQuantities.get(item.productId);

      if (!soldQuantity) {
        throw createHttpError(
          400,
          `Product ${item.productId} is not part of this sale.`
        );
      }

      const alreadyReturnedQuantity = returnedQuantities.get(item.productId) || 0;
      const remainingQuantity = soldQuantity - alreadyReturnedQuantity;

      if (item.quantity > remainingQuantity) {
        throw createHttpError(
          400,
          `Return quantity exceeds remaining sold quantity for product ${item.productId}.`
        );
      }
    }

    for (const item of items) {
      await tx.retour.create({
        data: {
          venteId: existingSale.id,
          produitId: item.productId,
          quantite: item.quantity,
          raison: reason,
        },
      });

      await restoreStockForProduct(tx, {
        productId: item.productId,
        storeId: existingSale.pointDeVenteId,
        quantity: item.quantity,
        type: "RETURN",
        reason: reason || `Sale return ${existingSale.numeroTicket}`,
      });

      returnedQuantities.set(
        item.productId,
        (returnedQuantities.get(item.productId) || 0) + item.quantity
      );
    }

    const isFullyReturned = existingSale.lignes.every((ligne) => {
      const returnedQuantity = returnedQuantities.get(ligne.produitId) || 0;
      return returnedQuantity >= ligne.quantite;
    });

    return tx.vente.update({
      where: { id: saleId },
      data: {
        status: isFullyReturned ? "refunded" : existingSale.status,
      },
      select: {
        id: true,
        numeroTicket: true,
        status: true,
      },
    });
  });

  return res.status(200).json({
    message: "Sale return processed successfully.",
    sale,
  });
};

const getCustomers = async (req, res) => {
  const search = normalizeRequiredString(req.query.search || "");
  const numericSearch = Number(search);
  const where = search
    ? {
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
          ...(!Number.isNaN(numericSearch) && Number.isInteger(numericSearch)
            ? [
                {
                  numeroClient: numericSearch,
                },
              ]
            : []),
        ],
      }
    : {};

  const customers = await prisma.client.findMany({
    where,
    include: {
      ventes: {
        select: {
          total: true,
        },
      },
      _count: {
        select: {
          ventes: true,
        },
      },
    },
    orderBy: [{ numeroClient: "asc" }, { id: "asc" }],
  });

  return res.status(200).json(customers.map(buildCustomerSummary));
};

const createCustomer = async (req, res) => {
  try {
    const parsedInput = validateSchema(customerCreateSchema, {
      name: req.body.name || req.body.nom,
      phone: req.body.phone || req.body.telephone,
      email: req.body.email,
    });
    const nom = normalizeRequiredString(parsedInput.name);
    const telephone = normalizeOptionalString(parsedInput.phone);
    const email = normalizeOptionalString(parsedInput.email);

    const newCustomer = await prisma.$transaction(async (tx) => {
      await getDefaultCustomer(tx);

      const lastCustomer = await tx.client.findFirst({
        where: {
          numeroClient: {
            gt: 1,
          },
        },
        orderBy: {
          numeroClient: "desc",
        },
        select: {
          numeroClient: true,
        },
      });

      const nextNumero = lastCustomer ? lastCustomer.numeroClient + 1 : 2;

      if (nextNumero <= 1) {
        throw createHttpError(
          500,
          'Invalid customer numbering. Customer number #1 is reserved for "Client inconnu".'
        );
      }

      return tx.client.create({
        data: {
          numeroClient: nextNumero,
          nom: nom.trim(),
          telephone: telephone || null,
          email: email || null,
          credit: 0,
          estActif: true,
        },
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
  const customerId = parsePositiveInteger(req.params.id);

  if (Number.isNaN(customerId)) {
    throw createHttpError(400, "customer id must be a valid positive integer.");
  }

  const customer = await prisma.client.findUnique({
    where: {
      id: customerId,
    },
  });

  if (!customer) {
    throw createHttpError(404, "Customer not found.");
  }

  return res.status(200).json({
    customerId: customer.id,
    customerNumber: customer.numeroClient,
    name: customer.nom,
    credit: decimalToNumber(customer.credit),
  });
};

const getCustomerById = async (req, res) => {
  const customerId = parsePositiveInteger(req.params.id);

  if (Number.isNaN(customerId)) {
    throw createHttpError(400, "customer id must be a valid positive integer.");
  }

  const customer = await prisma.client.findUnique({
    where: {
      id: customerId,
    },
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
  });

  if (!customer) {
    throw createHttpError(404, "Customer not found.");
  }

  return res.status(200).json({
    ...buildCustomerSummary(customer),
    paymentHistory: (customer.paiements || []).map(toApiCustomerPayment),
  });
};

const getCustomerSales = async (req, res) => {
  const customerId = parsePositiveInteger(req.params.id);

  if (Number.isNaN(customerId)) {
    throw createHttpError(400, "customer id must be a valid positive integer.");
  }

  const customer = await prisma.client.findUnique({
    where: {
      id: customerId,
    },
    select: {
      id: true,
    },
  });

  if (!customer) {
    throw createHttpError(404, "Customer not found.");
  }

  const sales = await prisma.vente.findMany({
    where: {
      clientId: customerId,
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
    const customer = await tx.client.findUnique({
      where: {
        id: customerId,
      },
    });

    if (!customer) {
      throw createHttpError(404, "Customer not found.");
    }

    if (new Prisma.Decimal(customer.credit).lessThan(amount)) {
      throw createHttpError(
        400,
        "amount cannot be greater than the current customer credit."
      );
    }

    await tx.paiementClient.create({
      data: {
        clientId: customer.id,
        montant: amount,
        note: note || "Paiement credit",
      },
    });

    return tx.client.update({
      where: {
        id: customer.id,
      },
      data: {
        credit: {
          decrement: amount,
        },
      },
      include: {
        ventes: {
          select: {
            total: true,
          },
        },
        _count: {
          select: {
            ventes: true,
          },
        },
      },
    });
  });

  return res.status(200).json({
    message: "Customer credit updated successfully.",
    customer: buildCustomerSummary(updatedCustomer),
  });
};

const deleteCustomer = async (req, res) => {
  const customerId = parsePositiveInteger(req.params.id);

  if (Number.isNaN(customerId)) {
    throw createHttpError(400, "customer id must be a valid positive integer.");
  }

  const customer = await prisma.client.findUnique({
    where: {
      id: customerId,
    },
    include: {
      _count: {
        select: {
          ventes: true,
        },
      },
    },
  });

  if (!customer) {
    throw createHttpError(404, "Customer not found.");
  }

  if (customer.numeroClient === 1) {
    throw createHttpError(
      400,
      "Le client inconnu ne peut pas etre supprime."
    );
  }

  if (customer._count.ventes > 0) {
    const disabledCustomer = await prisma.client.update({
      where: {
        id: customer.id,
      },
      data: {
        estActif: false,
      },
    });

    return res.status(200).json({
      message: "Client desactive avec succes.",
      customer: toApiCustomer(disabledCustomer),
    });
  }

  await prisma.client.delete({
    where: {
      id: customer.id,
    },
  });

  return res.status(200).json({
    message: "Client supprime avec succes.",
  });
};

const getSuppliers = async (req, res) => {
  const suppliers = await prisma.fournisseur.findMany({
    include: {
      _count: {
        select: {
          produits: true,
        },
      },
    },
    orderBy: {
      id: "desc",
    },
  });

  return res.status(200).json(
    suppliers.map((supplier) => ({
      id: supplier.id,
      name: supplier.nom,
      phone: supplier.telephone,
      email: supplier.email,
      address: supplier.adresse,
      productsCount: supplier._count.produits,
    }))
  );
};

const getReports = async (req, res) => {
  const period = normalizeRequiredString(req.query.period).toLowerCase();
  const range = getDateRange(period);

  if (!range) {
    throw createHttpError(400, "period must be one of: day, week, month.");
  }

  const sales = await prisma.vente.findMany({
    where: {
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
  const period = normalizeRequiredString(req.query.period || "week").toLowerCase();
  const range = getAnalyticsDateRange(period);

  if (!range) {
    throw createHttpError(400, "period must be one of: week, month.");
  }

  const [stores, sales] = await Promise.all([
    prisma.pointDeVente.findMany({
      select: {
        id: true,
        nom: true,
      },
      orderBy: [{ nom: "asc" }, { id: "asc" }],
    }),
    prisma.vente.findMany({
      where: {
        status: "completed",
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
                categorie: true,
              },
            },
          },
        },
      },
      orderBy: {
        dateVente: "asc",
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

    const saleDateKey = formatAnalyticsDateKey(sale.dateVente);
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
      const productCategory = ligne.produit?.categorie || "Sans categorie";
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
  const users = await prisma.utilisateur.findMany({
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
  const employeeStoreId = getEmployeeStoreId(req.user);
  const todayStart = getStartOfDay(new Date());
  const todayEnd = getEndOfDay(new Date());

  if (req.user.role === "EMPLOYE" && !employeeStoreId) {
    throw createHttpError(403, "Employee is not assigned to a store.");
  }

  const [stores, todaySales] = await Promise.all([
    prisma.pointDeVente.findMany({
      where:
        req.user.role === "EMPLOYE" && employeeStoreId
          ? {
              id: employeeStoreId,
            }
          : {},
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
        dateVente: {
          gte: todayStart,
          lte: todayEnd,
        },
        ...(req.user.role === "EMPLOYE" && employeeStoreId
          ? {
              pointDeVenteId: employeeStoreId,
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
          pointDeVenteId: storeId,
        }
      : {},
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
  cancelSale,
  returnSale,
};
