const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { Prisma } = require("@prisma/client");
const { randomBytes } = require("crypto");
const prisma = require("../config/prisma");
const { createHttpError } = require("../utils/httpError");

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
    },
    process.env.JWT_SECRET,
    {
      expiresIn: process.env.JWT_EXPIRES_IN || "7d",
    }
  );

const mapRoleToApi = (role) => (role === "ADMIN" ? "admin" : "employee");

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

const toApiStock = (stock) => ({
  id: stock.id,
  productId: stock.produitId,
  productName: stock.produit.nom,
  barcode: stock.produit.codeBarres,
  storeId: stock.pointDeVenteId,
  storeName: stock.pointDeVente.nom,
  quantity: stock.quantite,
  minimumThreshold: stock.produit.seuilMinimum,
});

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

const getEmployeeStoreId = (user) => {
  if (user.role !== "EMPLOYE") {
    return null;
  }

  return user.pointDeVenteId || null;
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

const login = async (req, res) => {
  const email = normalizeRequiredString(req.body.email).toLowerCase();
  const password = String(req.body.password || "");

  if (!email || !password.trim()) {
    throw createHttpError(400, "email and password are required.");
  }

  if (!process.env.JWT_SECRET) {
    throw createHttpError(500, "JWT_SECRET is missing in the configuration.");
  }

  const user = await prisma.utilisateur.findUnique({
    where: { email },
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

  const where =
    req.user.role === "ADMIN"
      ? {}
      : {
          pointDeVenteId: employeeStoreId,
        };

  const [total, stocks] = await Promise.all([
    prisma.stock.count({ where }),
    prisma.stock.findMany({
      where,
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
      orderBy: {
        updatedAt: "desc",
      },
      skip,
      take: limit,
    }),
  ]);

  return res.status(200).json(
    buildPaginatedResponse({
      data: stocks.map(toApiStock),
      page,
      limit,
      total,
    })
  );
};

const stockIn = async (req, res) => {
  const productId = parsePositiveInteger(req.body.productId);
  const storeId = parsePositiveInteger(req.body.storeId);
  const quantity = parsePositiveInteger(req.body.quantity);
  const reason = normalizeOptionalString(req.body.reason);

  if (Number.isNaN(productId) || Number.isNaN(storeId) || Number.isNaN(quantity)) {
    throw createHttpError(
      400,
      "productId, storeId and quantity must be valid positive integers."
    );
  }

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
  const productId = parsePositiveInteger(req.body.productId);
  const storeId = parsePositiveInteger(req.body.storeId);
  const quantity = parseNonNegativeInteger(req.body.quantity);
  const reason = normalizeOptionalString(req.body.reason);

  if (Number.isNaN(productId) || Number.isNaN(storeId) || Number.isNaN(quantity)) {
    throw createHttpError(
      400,
      "productId and storeId must be valid positive integers, and quantity must be an integer >= 0."
    );
  }

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
  console.log("HIT /api/sales");
  console.log("SALES BODY:", req.body);
  console.log("SALES CONTENT-TYPE:", req.headers["content-type"]);
  console.log("SALES storeId:", req.body?.storeId);
  console.log("SALES pointDeVenteId:", req.body?.pointDeVenteId);

  if (req.query.debug === "true") {
    return res.status(200).json({
      receivedBody: req.body,
      contentType: req.headers["content-type"],
      storeId: req.body?.storeId,
      pointDeVenteId: req.body?.pointDeVenteId,
    });
  }

  if (isEmptyRequestBody(req.body)) {
    throw createHttpError(400, "Request body is empty", "BAD_REQUEST");
  }

  const storeId = validatePositiveInteger(
    getAliasedValue(req.body, "storeId", "pointDeVenteId"),
    "storeId"
  );
  const userId = validatePositiveInteger(
    getAliasedValue(req.body, "userId", "utilisateurId"),
    "userId"
  );
  const items = normalizeSaleItems(req.body.items);
  let frontendTotal;

  if (typeof req.body.paymentMethod !== "string" || isBlankString(req.body.paymentMethod)) {
    throw createHttpError(400, "paymentMethod must be a non-empty string", "BAD_REQUEST");
  }

  const paymentMethod = normalizePaymentMethod(req.body.paymentMethod);

  if (!paymentMethod) {
    throw createHttpError(
      400,
      "paymentMethod must be one of: cash, card, transfer, mobile_money, other.",
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

  if (
    req.user.role === "EMPLOYE" &&
    (req.user.id !== userId || req.user.pointDeVenteId !== storeId)
  ) {
    throw createHttpError(
      403,
      "Employees can only create sales for themselves in their own store."
    );
  }

  const sale = await prisma.$transaction(async (tx) => {
    const pointDeVente = await tx.pointDeVente.findUnique({
      where: { id: storeId },
      select: { id: true },
    });

    if (!pointDeVente) {
      throw createHttpError(404, "Store not found.");
    }

    const utilisateur = await tx.utilisateur.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        estActif: true,
        pointDeVenteId: true,
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

    const createdSale = await tx.vente.create({
      data: {
        numeroTicket: generateTicketNumber(storeId),
        total,
        paymentMethod,
        pointDeVenteId: storeId,
        utilisateurId: userId,
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

    return tx.vente.findUnique({
      where: { id: createdSale.id },
      select: {
        id: true,
        numeroTicket: true,
        total: true,
        paymentMethod: true,
        createdAt: true,
      },
    });
  });

  return res.status(201).json({
    id: sale.id,
    ticketNumber: sale.numeroTicket,
    total: decimalToNumber(sale.total),
    paymentMethod: sale.paymentMethod,
    status: "completed",
    createdAt: sale.createdAt,
  });
};

const getSales = async (req, res) => {
  const { page, limit, skip } = getPaginationParams(req.query);
  const [total, sales] = await Promise.all([
    prisma.vente.count(),
    prisma.vente.findMany({
      include: {
        pointDeVente: {
          select: {
            nom: true,
          },
        },
        utilisateur: {
          select: {
            nom: true,
          },
        },
        lignes: {
          orderBy: {
            id: "asc",
          },
          include: {
            produit: {
              select: {
                nom: true,
              },
            },
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
      data: sales.map((sale) => ({
        id: sale.id,
        ticketNumber: sale.numeroTicket,
        date: sale.dateVente,
        paymentMethod: sale.paymentMethod,
        storeName: sale.pointDeVente ? sale.pointDeVente.nom : "",
        cashierName: sale.utilisateur ? sale.utilisateur.nom : "",
        itemsCount: sale.lignes.reduce((totalItems, ligne) => totalItems + ligne.quantite, 0),
        total: decimalToNumber(sale.total),
        syncStatus: "synced",
        items: sale.lignes.map((ligne) => ({
          productName: ligne.produit ? ligne.produit.nom : "",
          quantity: ligne.quantite,
          unitPrice: decimalToNumber(ligne.prixUnitaire),
          subtotal: decimalToNumber(ligne.sousTotal),
        })),
      })),
      page,
      limit,
      total,
    })
  );
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
  const salesByStoreMap = new Map();
  const topProductsMap = new Map();

  for (const sale of sales) {
    revenue = revenue.plus(sale.total);

    const storeKey = sale.pointDeVente ? sale.pointDeVente.id : 0;
    const existingStore = salesByStoreMap.get(storeKey) || {
      storeName: sale.pointDeVente ? sale.pointDeVente.nom : "",
      revenue: new Prisma.Decimal(0),
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
      };

      existingProduct.quantitySold += ligne.quantite;
      existingProduct.revenue = existingProduct.revenue.plus(ligne.sousTotal);
      topProductsMap.set(productKey, existingProduct);
    }
  }

  const salesByStore = Array.from(salesByStoreMap.values())
    .map((store) => ({
      storeName: store.storeName,
      revenue: decimalToNumber(store.revenue),
      salesCount: store.salesCount,
    }))
    .sort((a, b) => b.revenue - a.revenue);

  const topProducts = Array.from(topProductsMap.values())
    .map((product) => ({
      productName: product.productName,
      quantitySold: product.quantitySold,
      revenue: decimalToNumber(product.revenue),
    }))
    .sort((a, b) => b.quantitySold - a.quantitySold)
    .slice(0, 10);

  return res.status(200).json({
    revenue: decimalToNumber(revenue),
    salesCount: sales.length,
    averageBasket:
      sales.length > 0 ? decimalToNumber(revenue.div(sales.length)) : 0,
    bestStore: salesByStore.length > 0 ? salesByStore[0].storeName : "",
    salesByStore,
    topProducts,
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
      status: user.estActif ? "active" : "inactive",
    }))
  );
};

const getStores = async (req, res) => {
  const todayStart = getStartOfDay(new Date());
  const todayEnd = getEndOfDay(new Date());

  const [stores, todaySales] = await Promise.all([
    prisma.pointDeVente.findMany({
      include: {
        _count: {
          select: {
            utilisateurs: true,
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
      todayRevenue: decimalToNumber(
        revenueByStore.get(store.id) || new Prisma.Decimal(0)
      ),
      status: "active",
    }))
  );
};

module.exports = {
  login,
  getProducts,
  getProductByBarcode,
  getStocks,
  stockIn,
  stockCorrection,
  createSale,
  getSales,
  getSuppliers,
  getReports,
  getUsers,
  getStores,
};
