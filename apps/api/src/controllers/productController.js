const path = require("path");
const XLSX = require("xlsx");
const prisma = require("../config/prisma");
const { validateSchema } = require("../utils/validation");
const { getOrganisationIdFromUser } = require("../utils/organisationScope");
const {
  ensureDefaultSupplierCompte,
  resolveSupplierCompte,
} = require("../services/compteService");
const {
  productCreateSchema,
  productUpdateSchema,
} = require("../utils/validationSchemas");
const {
  buildVariantValuesText,
  DEFAULT_VARIANT_SIZE,
  decimalToNumber,
  getVariantColor,
  getVariantLabel,
  getVariantSize,
  getVariantValuesText,
  normalizeVariantText,
  sumVariantStock,
  toApiVariant,
} = require("../services/productVariantService");

const PRODUCT_BARCODE_CONFLICT_MESSAGE =
  "Ce code-barres est deja utilise par un autre produit";
const VARIANT_BARCODE_CONFLICT_MESSAGE =
  "Ce code-barres de variante est deja utilise";
const IMPORT_DEFAULT_VARIANT_COLOR = "Standard";
const DEFAULT_IMPORT_CATEGORY_NAME = "Autre";
const PRODUCT_IMPORT_REQUIRED_HEADERS = [
  { label: "nom", keys: ["nom"] },
  { label: "prixAchat/cout", keys: ["prixachat", "cout"] },
  { label: "prixVente", keys: ["prixvente"] },
  { label: "stock/quantiteDisponible", keys: ["stock", "quantitedisponible"] },
];
const VARIANT_COLOR_KEYS = ["couleur", "color", "col"];

const parseId = (value) => {
  const parsedValue = Number(value);
  return Number.isInteger(parsedValue) && parsedValue > 0 ? parsedValue : null;
};

const normalizeRequiredString = (value) => String(value || "").trim();

const normalizeImportHeader = (value) => normalizeRequiredString(value).toLowerCase();
const normalizeLooseImportKey = (value) =>
  normalizeImportHeader(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const normalizeImportNumberString = (value) =>
  normalizeRequiredString(value).replace(/\s+/g, "").replace(",", ".");

const parseImportNumber = (value) => {
  const normalizedValue = normalizeImportNumberString(value);

  if (!normalizedValue) {
    return NaN;
  }

  const parsedValue = Number(normalizedValue);
  return Number.isFinite(parsedValue) ? parsedValue : NaN;
};

const buildImportCategoryCode = (name, usedCodes) => {
  const normalizedBase = normalizeRequiredString(name)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "")
    .toUpperCase();
  const baseCode = normalizedBase.slice(0, 10) || "CAT";
  let candidate = baseCode;
  let suffix = 1;

  while (usedCodes.has(candidate)) {
    const suffixValue = String(suffix);
    candidate = `${baseCode.slice(0, Math.max(1, 10 - suffixValue.length))}${suffixValue}`;
    suffix += 1;
  }

  return candidate;
};

const parseOptionalPositiveInteger = (value) => {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value === "string" && value.trim() === "") {
    return null;
  }

  const parsedValue = Number(value);
  return Number.isInteger(parsedValue) && parsedValue > 0 ? parsedValue : NaN;
};

const parseOptionalNonNegativeInteger = (value) => {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value === "string" && value.trim() === "") {
    return null;
  }

  const parsedValue = Number(value);
  return Number.isInteger(parsedValue) && parsedValue >= 0 ? parsedValue : NaN;
};

const parseOptionalQuantity = (value) => {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value === "string" && value.trim() === "") {
    return null;
  }

  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) ? parsedValue : NaN;
};

const parseRequiredNumber = (value) => {
  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) ? parsedValue : NaN;
};

const parseOptionalNonNegativeNumber = (value) => {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value === "string" && value.trim() === "") {
    return null;
  }

  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) && parsedValue >= 0 ? parsedValue : NaN;
};

const normalizeInitialStocks = (value) => {
  if (value === undefined || value === null || value === "") {
    return [];
  }

  if (!Array.isArray(value)) {
    return null;
  }

  return value.map((entry) => ({
    storeId: parseOptionalPositiveInteger(entry?.storeId),
    quantity:
      entry?.quantity === undefined
        ? 0
        : parseOptionalQuantity(entry?.quantity),
  }));
};

const parseOptionalBoolean = (value, defaultValue = true) => {
  if (value === undefined) {
    return defaultValue;
  }

  if (typeof value === "boolean") {
    return value;
  }

  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  return null;
};

const buildImportRowMap = (row) =>
  new Map(
    Object.entries(row || {}).map(([key, value]) => [normalizeImportHeader(key), value])
  );

const getImportRowValue = (row, keys = []) => {
  for (const key of keys) {
    if (row.has(key)) {
      return row.get(key);
    }
  }

  return "";
};

const extractVariantFieldsFromValuesText = (rawValue) => {
  const valeursVariante = normalizeRequiredString(rawValue);

  if (!valeursVariante) {
    return {
      valeursVariante: null,
      taille: null,
      couleur: null,
    };
  }

  const segments = valeursVariante
    .split("/")
    .map((segment) => normalizeRequiredString(segment))
    .filter(Boolean);
  let taille = null;
  let couleur = null;

  for (const segment of segments) {
    const separatorIndex = segment.indexOf(":");
    const key =
      separatorIndex >= 0
        ? normalizeLooseImportKey(segment.slice(0, separatorIndex))
        : "";
    const value = normalizeRequiredString(
      separatorIndex >= 0 ? segment.slice(separatorIndex + 1) : segment
    );

    if (!value) {
      continue;
    }

    if (key && VARIANT_COLOR_KEYS.some((candidate) => key.includes(candidate))) {
      if (!couleur) {
        couleur = value;
      }
      continue;
    }

    if (!taille) {
      taille = value;
    }
  }

  return {
    valeursVariante,
    taille,
    couleur,
  };
};

const validateImportHeaders = (rows) => {
  const headers = new Set(
    rows.flatMap((row) => Object.keys(row || {}).map((key) => normalizeImportHeader(key)))
  );
  const missingHeaders = PRODUCT_IMPORT_REQUIRED_HEADERS.filter(
    ({ keys }) => !keys.some((key) => headers.has(key))
  ).map(({ label }) => label);

  if (missingHeaders.length > 0) {
    throw {
      status: 400,
      message: `Colonnes manquantes dans le fichier import: ${missingHeaders.join(", ")}.`,
    };
  }
};

const parseProductImportRows = (file) => {
  const extension = path.extname(file?.originalname || "").toLowerCase();

  if (![".xlsx", ".csv"].includes(extension)) {
    throw {
      status: 400,
      message: "Seuls les fichiers .xlsx et .csv sont acceptes.",
    };
  }

  let workbook;

  try {
    workbook = XLSX.read(file.buffer, { type: "buffer" });
  } catch (error) {
    throw {
      status: 400,
      message: "Impossible de lire le fichier d'import.",
    };
  }

  const firstSheetName = workbook.SheetNames[0];

  if (!firstSheetName) {
    throw {
      status: 400,
      message: "Le fichier d'import ne contient aucune feuille exploitable.",
    };
  }

  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheetName], {
    defval: "",
    raw: false,
  });

  if (!rows.length) {
    throw {
      status: 400,
      message: "Le fichier d'import ne contient aucune ligne.",
    };
  }

  validateImportHeaders(rows);
  return rows;
};

const normalizeImportProductRow = (rawRow) => {
  const row = buildImportRowMap(rawRow);
  const nom = normalizeRequiredString(row.get("nom"));
  const codeBarres = normalizeRequiredString(row.get("codebarres"));
  const rawCategorie = getImportRowValue(row, ["categorie"]);
  const categorieNom =
    rawCategorie?.trim() || "Autre";
  const categorie = normalizeRequiredString(categorieNom || DEFAULT_IMPORT_CATEGORY_NAME);
  const parsedVariantFields = extractVariantFieldsFromValuesText(
    getImportRowValue(row, ["valeursvariante"])
  );
  const taille = normalizeVariantText(
    getImportRowValue(row, ["taille"]),
    parsedVariantFields.taille || DEFAULT_VARIANT_SIZE
  );
  const couleur =
    normalizeVariantText(
      getImportRowValue(row, ["couleur"]),
      parsedVariantFields.couleur || IMPORT_DEFAULT_VARIANT_COLOR
    ) || IMPORT_DEFAULT_VARIANT_COLOR;
  const valeursVariante =
    parsedVariantFields.valeursVariante ||
    buildVariantValuesText({
      taille,
      couleur,
    });
  const prixAchat = parseImportNumber(getImportRowValue(row, ["prixachat", "cout"]));
  const prixVente = parseImportNumber(row.get("prixvente"));
  const stock = parseImportNumber(
    getImportRowValue(row, ["stock", "quantitedisponible"])
  );

  if (!nom) {
    throw {
      status: 400,
      message: "Le nom du produit est obligatoire.",
    };
  }

  if (Number.isNaN(prixAchat) || prixAchat < 0) {
    throw {
      status: 400,
      message: "prixAchat/cout doit etre un nombre valide.",
    };
  }

  if (Number.isNaN(prixVente) || prixVente < 0) {
    throw {
      status: 400,
      message: "prixVente doit etre un nombre valide.",
    };
  }

  if (Number.isNaN(stock)) {
    throw {
      status: 400,
      message: "stock doit etre un nombre valide.",
    };
  }

  return {
    nom,
    nomKey: nom.toLowerCase(),
    codeBarres: codeBarres || null,
    categorie,
    categorieKey: categorie.toLowerCase(),
    taille,
    couleur,
    valeursVariante,
    prixAchat,
    prixVente,
    stock,
  };
};

const ensureImportCategory = async (
  tx,
  organisationId,
  categoryName,
  categoriesByName,
  usedCategoryCodes
) => {
  const categoryKey = normalizeRequiredString(categoryName).toLowerCase();
  const existingCategory = categoriesByName.get(categoryKey);

  if (existingCategory) {
    return {
      category: existingCategory,
      created: false,
    };
  }

  const nextCode = buildImportCategoryCode(categoryName, usedCategoryCodes);

  try {
    const category = await tx.categorieProduit.create({
      data: {
        organisationId,
        code: nextCode,
        nom: categoryName,
        nomComplet: categoryName,
        actif: true,
      },
    });

    return {
      category,
      created: true,
    };
  } catch (error) {
    if (error?.code === "P2002") {
      const category = await tx.categorieProduit.findFirst({
        where: {
          organisationId,
          nom: categoryName,
        },
      });

      if (category) {
        return {
          category,
          created: false,
        };
      }
    }

    throw error;
  }
};

const productInclude = {
  categorieProduit: {
    select: {
      id: true,
      code: true,
      nom: true,
      nomComplet: true,
      actif: true,
    },
  },
  fournisseur: {
    select: {
      id: true,
      nom: true,
      email: true,
      telephone: true,
      compte: {
        select: {
          id: true,
          nom: true,
          numeroCompte: true,
        },
      },
    },
  },
  variantes: {
    orderBy: [{ id: "asc" }],
  },
  stocks: {
    select: {
      quantite: true,
    },
  },
};

const sumProductStocks = (stocks = []) =>
  stocks.reduce((total, stock) => total + Number(stock?.quantite || 0), 0);

const mapProductToResponse = (product) => {
  const variants = (product.variantes || []).map((variant) =>
    toApiVariant(variant, product)
  );
  const stockFromRows = Array.isArray(product.stocks) ? sumProductStocks(product.stocks) : null;

  return {
    id: product.id,
    name: product.nom,
    barcode: product.codeBarres,
    codeBarres: product.codeBarres,
    organisationId: product.organisationId,
    categoryId: product.categorieProduit?.id || product.categorieId || null,
    categoryCode: product.categorieProduit?.code || null,
    category: product.categorieProduit?.nom || product.categorie,
    categoryFullName: product.categorieProduit?.nomComplet || product.categorie,
    purchasePrice: decimalToNumber(product.prixAchat),
    salePrice: decimalToNumber(product.prixVente),
    vatRate: decimalToNumber(product.tauxTVA),
    retailPrice: decimalToNumber(product.prixDetail),
    minimumThreshold: Number(product.seuilMinimum || 0),
    supplierId: product.fournisseur?.compte?.id || product.fournisseurId || null,
    supplierName:
      product.fournisseur?.compte?.nom || product.fournisseur?.nom || null,
    active: product.estActif,
    stock: stockFromRows === null ? sumVariantStock(variants) : stockFromRows,
    hasMultipleVariants: variants.filter((variant) => variant.active).length > 1,
    variants,
  };
};

const buildVariantSignature = (size, color, valuesText = null) => {
  const normalizedValuesText = normalizeRequiredString(valuesText).toLowerCase();

  if (normalizedValuesText) {
    return `values::${normalizedValuesText}`;
  }

  return `${String(size || DEFAULT_VARIANT_SIZE).toLowerCase()}::${String(
    color || ""
  ).toLowerCase()}`;
};

const normalizeVariantsInput = ({
  variants,
  defaultPurchasePrice,
  defaultSalePrice,
  defaultThreshold,
  initialQuantity = 0,
}) => {
  const sourceVariants = Array.isArray(variants) && variants.length > 0
    ? variants
      : [
        {
          taille: DEFAULT_VARIANT_SIZE,
          couleur: null,
          valeursVariante: buildVariantValuesText(DEFAULT_VARIANT_SIZE, null),
          codeBarres: null,
          prixAchat: defaultPurchasePrice,
          prixVente: defaultSalePrice,
          quantiteStock: initialQuantity,
          seuilMinimum: defaultThreshold,
          actif: true,
        },
      ];

  const seenBarcodes = new Set();
  const seenSignatures = new Set();

  return sourceVariants.map((variant, index) => {
    const parsedVariantId = parseOptionalPositiveInteger(variant?.id);
    const size = normalizeVariantText(variant?.taille, DEFAULT_VARIANT_SIZE);
    const color = normalizeVariantText(variant?.couleur, null);
    const valuesText =
      getVariantValuesText(variant) || buildVariantValuesText(size, color);
    const barcode = normalizeVariantText(variant?.codeBarres, null);
    const purchasePrice =
      variant?.prixAchat === undefined
        ? defaultPurchasePrice
        : parseOptionalNonNegativeNumber(variant?.prixAchat);
    const salePrice =
      variant?.prixVente === undefined
        ? defaultSalePrice
        : parseOptionalNonNegativeNumber(variant?.prixVente);
    const stockQuantity =
      variant?.quantiteStock === undefined
        ? 0
        : parseOptionalQuantity(variant?.quantiteStock);
    const minimumThreshold =
      variant?.seuilMinimum === undefined
        ? defaultThreshold
        : parseOptionalNonNegativeInteger(variant?.seuilMinimum);
    const active = parseOptionalBoolean(variant?.actif, true);

    if (Number.isNaN(parsedVariantId)) {
      throw {
        status: 400,
        message: "Chaque id de variante doit etre un entier valide.",
      };
    }

    if (
      Number.isNaN(purchasePrice) ||
      Number.isNaN(salePrice) ||
      Number.isNaN(stockQuantity) ||
      Number.isNaN(minimumThreshold)
    ) {
      throw {
        status: 400,
        message:
          "Chaque variante doit contenir des prix, un stock et un seuil minimum valides.",
      };
    }

    if (active === null) {
      throw {
        status: 400,
        message: "Le statut actif de chaque variante doit etre true ou false.",
      };
    }

    if (barcode) {
      const normalizedBarcode = barcode.toLowerCase();

      if (seenBarcodes.has(normalizedBarcode)) {
        throw {
          status: 409,
          message: VARIANT_BARCODE_CONFLICT_MESSAGE,
        };
      }

      seenBarcodes.add(normalizedBarcode);
    }

    const signature = buildVariantSignature(size, color, valuesText);

    if (seenSignatures.has(signature)) {
      throw {
        status: 400,
        message: "Chaque combinaison taille / couleur doit etre unique.",
      };
    }

    seenSignatures.add(signature);

    return {
      id: parsedVariantId,
      order: index,
      taille: size,
      couleur: color,
      valeursVariante: valuesText,
      codeBarres: barcode,
      prixAchat: purchasePrice,
      prixVente: salePrice,
      quantiteStock: stockQuantity,
      seuilMinimum: minimumThreshold,
      actif: active,
      signature,
    };
  });
};

const ensureUniqueProductBarcode = async (organisationId, barcode, excludeProductId = null) => {
  const existingProduct = await prisma.produit.findFirst({
    where: {
      organisationId,
      codeBarres: barcode,
      ...(excludeProductId ? { id: { not: excludeProductId } } : {}),
    },
  });

  if (existingProduct) {
    throw {
      status: 409,
      message: PRODUCT_BARCODE_CONFLICT_MESSAGE,
    };
  }

  const existingVariant = await prisma.produitVariante.findFirst({
    where: {
      organisationId,
      codeBarres: barcode,
      ...(excludeProductId ? { produitId: { not: excludeProductId } } : {}),
    },
    select: {
      id: true,
    },
  });

  if (existingVariant) {
    throw {
      status: 409,
      message: PRODUCT_BARCODE_CONFLICT_MESSAGE,
    };
  }
};

const ensureUniqueVariantBarcodes = async (
  organisationId,
  variants,
  excludeProductId = null
) => {
  const barcodes = variants
    .map((variant) => variant.codeBarres)
    .filter(Boolean);

  if (!barcodes.length) {
    return;
  }

  const conflictingVariants = await prisma.produitVariante.findMany({
    where: {
      organisationId,
      codeBarres: {
        in: barcodes,
      },
      ...(excludeProductId ? { produitId: { not: excludeProductId } } : {}),
    },
    select: {
      id: true,
      codeBarres: true,
      produitId: true,
    },
  });

  if (conflictingVariants.length > 0) {
    throw {
      status: 409,
      message: VARIANT_BARCODE_CONFLICT_MESSAGE,
    };
  }

  const conflictingProducts = await prisma.produit.findMany({
    where: {
      organisationId,
      codeBarres: {
        in: barcodes,
      },
      ...(excludeProductId ? { id: { not: excludeProductId } } : {}),
    },
    select: {
      id: true,
      codeBarres: true,
    },
  });

  if (conflictingProducts.length > 0) {
    throw {
      status: 409,
      message: VARIANT_BARCODE_CONFLICT_MESSAGE,
    };
  }
};

const loadUsedBarcodes = async (organisationId, excludeProductId = null) => {
  const [products, variants] = await Promise.all([
    prisma.produit.findMany({
      where: {
        organisationId,
        ...(excludeProductId ? { id: { not: excludeProductId } } : {}),
      },
      select: {
        codeBarres: true,
      },
    }),
    prisma.produitVariante.findMany({
      where: {
        organisationId,
        ...(excludeProductId ? { produitId: { not: excludeProductId } } : {}),
        codeBarres: {
          not: null,
        },
      },
      select: {
        codeBarres: true,
      },
    }),
  ]);

  return new Set(
    [...products, ...variants]
      .map((entry) => normalizeRequiredString(entry.codeBarres).toLowerCase())
      .filter(Boolean)
  );
};

const syncAggregateProductStock = async (
  tx,
  organisationId,
  productId,
  pointsDeVente,
  quantitiesByStoreId
) => {
  await tx.stock.createMany({
    data: pointsDeVente.map((pointDeVente) => ({
      organisationId,
      produitId: productId,
      pointDeVenteId: pointDeVente.id,
      quantite: quantitiesByStoreId.get(pointDeVente.id) ?? 0,
    })),
    skipDuplicates: true,
  });

  await Promise.all(
    pointsDeVente.map((pointDeVente) =>
      tx.stock.updateMany({
        where: {
          organisationId,
          produitId: productId,
          pointDeVenteId: pointDeVente.id,
        },
        data: {
          quantite: quantitiesByStoreId.get(pointDeVente.id) ?? 0,
        },
      })
    )
  );
};

const buildQuantityByStoreId = (pointsDeVente = [], entries = []) => {
  const quantityByStoreId = new Map(
    pointsDeVente.map((pointDeVente) => [pointDeVente.id, 0])
  );

  entries.forEach((entry) => {
    if (!quantityByStoreId.has(entry.storeId)) {
      return;
    }

    quantityByStoreId.set(entry.storeId, Number(entry.quantity || 0));
  });

  return quantityByStoreId;
};

const getAllProducts = async (req, res) => {
  try {
    const organisationId = getOrganisationIdFromUser(req.user);
    const produits = await prisma.produit.findMany({
      where: {
        organisationId,
      },
      include: productInclude,
      orderBy: {
        id: "desc",
      },
    });

    return res.status(200).json({
      products: produits.map(mapProductToResponse),
    });
  } catch (error) {
    console.error("Get products error:", error);
    return res.status(500).json({
      message: "Erreur serveur lors de la recuperation des produits.",
    });
  }
};

const getProductById = async (req, res) => {
  try {
    const organisationId = getOrganisationIdFromUser(req.user);
    const productId = parseId(req.params.id);

    if (!productId) {
      return res.status(400).json({
        message: "ID produit invalide.",
      });
    }

    const produit = await prisma.produit.findFirst({
      where: {
        organisationId,
        id: productId,
      },
      include: productInclude,
    });

    if (!produit) {
      return res.status(404).json({
        message: "Produit introuvable.",
      });
    }

    return res.status(200).json({
      product: mapProductToResponse(produit),
    });
  } catch (error) {
    console.error("Get product by id error:", error);
    return res.status(500).json({
      message: "Erreur serveur lors de la recuperation du produit.",
    });
  }
};

const createProduct = async (req, res) => {
  try {
    const organisationId = getOrganisationIdFromUser(req.user);
    const {
      codeBarres,
      nom,
      categorieId,
      prixAchat,
      prixVente,
      tauxTVA,
      prixDetail,
      seuilMinimum,
      estActif,
      fournisseurId,
      compteId,
      fournisseurCompteId,
      initialStocks,
      variants,
    } = validateSchema(productCreateSchema, req.body);
    const providedCodeBarres = normalizeRequiredString(codeBarres);
    const normalizedNom = normalizeRequiredString(nom);
    const parsedCategorieId = parseOptionalPositiveInteger(categorieId);
    const parsedPrixAchat = parseRequiredNumber(prixAchat);
    const parsedPrixVente =
      prixVente === undefined ? parseRequiredNumber(prixDetail) : parseRequiredNumber(prixVente);
    const parsedTauxTVA =
      tauxTVA === undefined ? 0 : parseOptionalNonNegativeNumber(tauxTVA);
    const parsedPrixDetail =
      prixDetail === undefined ? parsedPrixVente : parseOptionalNonNegativeNumber(prixDetail);
    const parsedSeuilMinimum =
      seuilMinimum === undefined ? 0 : parseOptionalNonNegativeInteger(seuilMinimum);
    const parsedEstActif = parseOptionalBoolean(estActif, true);
    const parsedFournisseurId = parseOptionalPositiveInteger(
      compteId ?? fournisseurCompteId ?? fournisseurId
    );
    const normalizedInitialStocks = normalizeInitialStocks(initialStocks);

    if (!normalizedNom) {
      return res.status(400).json({
        message: "Le nom du produit est obligatoire.",
      });
    }

    if (Number.isNaN(parsedCategorieId) || parsedCategorieId === null) {
      return res.status(400).json({
        message: "categorieId doit etre un entier valide.",
      });
    }

    if (
      Number.isNaN(parsedPrixAchat) ||
      Number.isNaN(parsedPrixVente) ||
      Number.isNaN(parsedTauxTVA) ||
      Number.isNaN(parsedPrixDetail) ||
      Number.isNaN(parsedSeuilMinimum)
    ) {
      return res.status(400).json({
          message:
            "Les prix, la TVA et le seuil minimum doivent contenir des valeurs valides.",
      });
    }

    if (parsedEstActif === null) {
      return res.status(400).json({
        message: "estActif doit etre true ou false.",
      });
    }

    if (Number.isNaN(parsedFournisseurId)) {
      return res.status(400).json({
        message: "fournisseurId doit etre un entier valide.",
      });
    }

    if (normalizedInitialStocks === null) {
      return res.status(400).json({
        message: "initialStocks doit etre un tableau valide.",
      });
    }

    if (
      normalizedInitialStocks.some(
          (entry) =>
            Number.isNaN(entry.storeId) ||
            entry.storeId === null ||
            Number.isNaN(entry.quantity) ||
            entry.quantity === null
        )
      ) {
        return res.status(400).json({
          message:
            "Chaque stock initial doit contenir un storeId valide et une quantite valide.",
        });
      }

    const totalInitialQuantity = normalizedInitialStocks.reduce(
      (sum, entry) => sum + Number(entry.quantity || 0),
      0
    );
    let normalizedCodeBarres = providedCodeBarres;

    if (normalizedCodeBarres) {
      await ensureUniqueProductBarcode(organisationId, normalizedCodeBarres);
    } else {
      normalizedCodeBarres = null;
    }

    const normalizedVariants =
      Array.isArray(variants) && variants.length > 0
        ? normalizeVariantsInput({
            variants,
            defaultPurchasePrice: parsedPrixAchat,
            defaultSalePrice: parsedPrixDetail,
            defaultThreshold: parsedSeuilMinimum,
            initialQuantity: totalInitialQuantity,
          })
        : [];
    await ensureUniqueVariantBarcodes(organisationId, normalizedVariants);

    if (parsedFournisseurId) {
      try {
        await resolveSupplierCompte(prisma, organisationId, parsedFournisseurId);
      } catch (error) {
        return res.status(error.status || 404).json({
          message: error.message || "Fournisseur introuvable.",
        });
      }
    }

    const produit = await prisma.$transaction(async (tx) => {
      const supplierCompte = parsedFournisseurId
        ? await resolveSupplierCompte(tx, organisationId, parsedFournisseurId)
        : await ensureDefaultSupplierCompte(tx, organisationId);
      const legacySupplierId = supplierCompte.fournisseurSource.id;

      const [pointsDeVente, category] = await Promise.all([
        tx.pointDeVente.findMany({
          where: {
            organisationId,
          },
          select: {
            id: true,
          },
          orderBy: {
            id: "asc",
          },
        }),
        tx.categorieProduit.findFirst({
          where: {
            organisationId,
            id: parsedCategorieId,
            actif: true,
          },
          select: {
            id: true,
            nom: true,
          },
        }),
      ]);

      if (!category) {
        throw {
          status: 404,
          message: "Categorie produit introuvable.",
        };
      }

      const requestedStoreIds = normalizedInitialStocks.map((entry) => entry.storeId);
      const existingStoreIds = new Set(pointsDeVente.map((pointDeVente) => pointDeVente.id));
      const missingStoreIds = requestedStoreIds.filter((storeId) => !existingStoreIds.has(storeId));

      if (missingStoreIds.length > 0) {
        throw {
          status: 404,
          message: `Points de vente introuvables pour les stocks initiaux: ${missingStoreIds.join(
            ", "
          )}.`,
        };
      }

      const produitCree = await tx.produit.create({
        data: {
          organisationId,
          codeBarres: normalizedCodeBarres,
          nom: normalizedNom,
          categorieId: category.id,
          categorie: category.nom,
          prixAchat: parsedPrixAchat,
          prixVente: parsedPrixVente,
          tauxTVA: parsedTauxTVA,
          prixDetail: parsedPrixDetail,
          prixGros: parsedPrixDetail,
          prixMiniGros: parsedPrixDetail,
          seuilMinimum: parsedSeuilMinimum,
          estActif: parsedEstActif,
          fournisseurId: legacySupplierId,
        },
      });

      if (normalizedVariants.length > 0) {
        await tx.produitVariante.createMany({
          data: normalizedVariants.map((variant) => ({
            organisationId,
            produitId: produitCree.id,
            taille: variant.taille,
            couleur: variant.couleur,
            valeursVariante: variant.valeursVariante,
            codeBarres: variant.codeBarres,
            prixAchat: variant.prixAchat,
            prixVente: variant.prixVente,
            quantiteStock: variant.quantiteStock,
            seuilMinimum: variant.seuilMinimum,
            actif: variant.actif,
          })),
        });
      }

      const quantityByStoreId =
        normalizedVariants.length > 0
          ? buildQuantityByStoreId(pointsDeVente, [
              {
                storeId: pointsDeVente[0]?.id,
                quantity: normalizedVariants.reduce(
                  (sum, variant) => sum + Number(variant.quantiteStock || 0),
                  0
                ),
              },
            ])
          : buildQuantityByStoreId(pointsDeVente, normalizedInitialStocks);

      await syncAggregateProductStock(
        tx,
        organisationId,
        produitCree.id,
        pointsDeVente,
        quantityByStoreId
      );

      return tx.produit.findUnique({
        where: { id: produitCree.id },
        include: productInclude,
      });
    });

    return res.status(201).json({
      message: "Produit cree avec succes.",
      product: mapProductToResponse(produit),
    });
  } catch (error) {
    if (error?.status) {
      return res.status(error.status).json({
        message: error.message,
      });
    }

    if (
      error?.code === "P2002" &&
      Array.isArray(error?.meta?.target) &&
      error.meta.target.includes("codeBarres")
    ) {
      return res.status(409).json({
        message:
          error?.meta?.modelName === "ProduitVariante"
            ? VARIANT_BARCODE_CONFLICT_MESSAGE
            : PRODUCT_BARCODE_CONFLICT_MESSAGE,
      });
    }

    console.error("Create product error:", error);
    return res.status(500).json({
      message: "Erreur serveur lors de la creation du produit.",
    });
  }
};

const updateProduct = async (req, res) => {
  try {
    const organisationId = getOrganisationIdFromUser(req.user);
    const productId = parseId(req.params.id);

    if (!productId) {
      return res.status(400).json({
        message: "ID produit invalide.",
      });
    }

    const existingProduct = await prisma.produit.findFirst({
      where: {
        organisationId,
        id: productId,
      },
      include: productInclude,
    });

    if (!existingProduct) {
      return res.status(404).json({
        message: "Produit introuvable.",
      });
    }

    const {
      codeBarres,
      nom,
      categorieId,
      prixAchat,
      prixVente,
      tauxTVA,
      prixDetail,
      seuilMinimum,
      estActif,
      fournisseurId,
      compteId,
      fournisseurCompteId,
      variants,
    } = validateSchema(productUpdateSchema, req.body);

    const data = {};
    let nextSupplierCompteId = null;
    let shouldUseDefaultSupplier = false;

    if (codeBarres !== undefined) {
      const normalizedCodeBarres = normalizeRequiredString(codeBarres);
      data.codeBarres = normalizedCodeBarres || null;
    }

    if (nom !== undefined) {
      const normalizedNom = normalizeRequiredString(nom);

      if (!normalizedNom) {
        return res.status(400).json({
          message: "nom ne peut pas etre vide.",
        });
      }

      data.nom = normalizedNom;
    }

    if (categorieId !== undefined) {
      const parsedCategorieId = parseOptionalPositiveInteger(categorieId);

      if (Number.isNaN(parsedCategorieId) || parsedCategorieId === null) {
        return res.status(400).json({
          message: "categorieId doit etre un entier valide.",
        });
      }

      const category = await prisma.categorieProduit.findFirst({
        where: {
          organisationId,
          id: parsedCategorieId,
          actif: true,
        },
        select: {
          id: true,
          nom: true,
        },
      });

      if (!category) {
        return res.status(404).json({
          message: "Categorie produit introuvable.",
        });
      }

      data.categorieId = category.id;
      data.categorie = category.nom;
    }

    if (prixAchat !== undefined) {
      const parsedPrixAchat = parseRequiredNumber(prixAchat);

      if (Number.isNaN(parsedPrixAchat)) {
        return res.status(400).json({
          message: "prixAchat doit etre un nombre valide.",
        });
      }

      data.prixAchat = parsedPrixAchat;
    }

    if (prixVente !== undefined) {
      const parsedPrixVente = parseRequiredNumber(prixVente);

      if (Number.isNaN(parsedPrixVente)) {
        return res.status(400).json({
          message: "prixVente doit etre un nombre valide.",
        });
      }

      data.prixVente = parsedPrixVente;
    }

    if (tauxTVA !== undefined) {
      const parsedTauxTVA = parseOptionalNonNegativeNumber(tauxTVA);

      if (Number.isNaN(parsedTauxTVA) || parsedTauxTVA === null) {
        return res.status(400).json({
          message: "tauxTVA doit etre un nombre superieur ou egal a 0.",
        });
      }

      data.tauxTVA = parsedTauxTVA;
    }

    if (prixDetail !== undefined) {
      const parsedPrixDetail = parseOptionalNonNegativeNumber(prixDetail);

      if (Number.isNaN(parsedPrixDetail) || parsedPrixDetail === null) {
        return res.status(400).json({
          message: "prixDetail doit etre un nombre superieur ou egal a 0.",
        });
      }

      data.prixDetail = parsedPrixDetail;
    }

    if (seuilMinimum !== undefined) {
      const parsedSeuilMinimum = parseOptionalNonNegativeInteger(seuilMinimum);

      if (Number.isNaN(parsedSeuilMinimum) || parsedSeuilMinimum === null) {
        return res.status(400).json({
          message: "seuilMinimum doit etre un entier positif ou egal a 0.",
        });
      }

      data.seuilMinimum = parsedSeuilMinimum;
    }

    if (estActif !== undefined) {
      const parsedEstActif = parseOptionalBoolean(estActif);

      if (parsedEstActif === null) {
        return res.status(400).json({
          message: "estActif doit etre true ou false.",
        });
      }

      data.estActif = parsedEstActif;
    }

    if (
      fournisseurId !== undefined ||
      compteId !== undefined ||
      fournisseurCompteId !== undefined
    ) {
      const parsedFournisseurId = parseOptionalPositiveInteger(
        compteId ?? fournisseurCompteId ?? fournisseurId
      );

      if (Number.isNaN(parsedFournisseurId)) {
        return res.status(400).json({
          message: "fournisseurId doit etre un entier valide.",
        });
      }

      if (parsedFournisseurId) {
        try {
          await resolveSupplierCompte(prisma, organisationId, parsedFournisseurId);
          nextSupplierCompteId = parsedFournisseurId;
        } catch (error) {
          return res.status(error.status || 404).json({
            message: error.message || "Fournisseur introuvable.",
          });
        }
      } else {
        shouldUseDefaultSupplier = true;
      }
    }

    const nextBarcode = Object.prototype.hasOwnProperty.call(data, "codeBarres")
      ? data.codeBarres
      : existingProduct.codeBarres;

    if (nextBarcode) {
      await ensureUniqueProductBarcode(organisationId, nextBarcode, productId);
    }

    const nextVariantsInput =
      variants === undefined
        ? null
        : variants.length === 0
          ? []
          : normalizeVariantsInput({
              variants,
              defaultPurchasePrice:
                data.prixAchat !== undefined
                  ? data.prixAchat
                  : decimalToNumber(existingProduct.prixAchat),
              defaultSalePrice:
                data.prixDetail !== undefined
                  ? data.prixDetail
                  : decimalToNumber(existingProduct.prixDetail),
              defaultThreshold:
                data.seuilMinimum !== undefined
                  ? data.seuilMinimum
                  : Number(existingProduct.seuilMinimum || 0),
              initialQuantity: existingProduct.variantes.reduce(
                (sum, variant) => sum + Number(variant.quantiteStock || 0),
                0
              ),
            });
    const nextVariants = nextVariantsInput;

    if (nextVariants) {
      await ensureUniqueVariantBarcodes(organisationId, nextVariants, productId);
    }

    const produit = await prisma.$transaction(async (tx) => {
      if (shouldUseDefaultSupplier) {
        const supplierCompte = await ensureDefaultSupplierCompte(tx, organisationId);
        data.fournisseurId = supplierCompte.fournisseurSource.id;
      } else if (nextSupplierCompteId) {
        const supplierCompte = await resolveSupplierCompte(
          tx,
          organisationId,
          nextSupplierCompteId
        );
        data.fournisseurId = supplierCompte.fournisseurSource.id;
      }

      if (nextVariants) {
        const existingVariantMap = new Map(
          existingProduct.variantes.map((variant) => [variant.id, variant])
        );
        const payloadVariantIds = new Set(
          nextVariants.map((variant) => variant.id).filter(Boolean)
        );

        for (const variant of nextVariants) {
          if (variant.id && existingVariantMap.has(variant.id)) {
            await tx.produitVariante.update({
              where: { id: variant.id },
              data: {
                taille: variant.taille,
                couleur: variant.couleur,
                valeursVariante: variant.valeursVariante,
                codeBarres: variant.codeBarres,
                prixAchat: variant.prixAchat,
                prixVente: variant.prixVente,
                quantiteStock: variant.quantiteStock,
                seuilMinimum: variant.seuilMinimum,
                actif: variant.actif,
              },
            });
          } else {
            await tx.produitVariante.create({
              data: {
                organisationId,
                produitId: productId,
                taille: variant.taille,
                couleur: variant.couleur,
                valeursVariante: variant.valeursVariante,
                codeBarres: variant.codeBarres,
                prixAchat: variant.prixAchat,
                prixVente: variant.prixVente,
                quantiteStock: variant.quantiteStock,
                seuilMinimum: variant.seuilMinimum,
                actif: variant.actif,
              },
            });
          }
        }

        const variantsToDeactivate = existingProduct.variantes.filter(
          (variant) => !payloadVariantIds.has(variant.id)
        );

        if (variantsToDeactivate.length > 0) {
          await tx.produitVariante.updateMany({
            where: {
              id: {
                in: variantsToDeactivate.map((variant) => variant.id),
              },
            },
            data: {
              actif: false,
            },
          });
        }
      }

      if (Object.keys(data).length > 0) {
        await tx.produit.update({
          where: { id: productId },
          data,
        });
      }

      const [pointsDeVente, variantsAfterUpdate] = await Promise.all([
        tx.pointDeVente.findMany({
          where: {
            organisationId,
          },
          select: {
            id: true,
          },
          orderBy: {
            id: "asc",
          },
        }),
        tx.produitVariante.findMany({
          where: {
            organisationId,
            produitId: productId,
            actif: true,
          },
          orderBy: [{ id: "asc" }],
        }),
      ]);

      if (variantsAfterUpdate.length > 0) {
        const totalVariantStock = variantsAfterUpdate.reduce(
          (sum, variant) => sum + Number(variant.quantiteStock || 0),
          0
        );
        const quantityByStoreId = buildQuantityByStoreId(pointsDeVente, [
          {
            storeId: pointsDeVente[0]?.id,
            quantity: totalVariantStock,
          },
        ]);

        await syncAggregateProductStock(
          tx,
          organisationId,
          productId,
          pointsDeVente,
          quantityByStoreId
        );
      }

      return tx.produit.findUnique({
        where: { id: productId },
        include: productInclude,
      });
    });

    return res.status(200).json({
      message: "Produit mis a jour avec succes.",
      product: mapProductToResponse(produit),
    });
  } catch (error) {
    if (error?.status) {
      return res.status(error.status).json({
        message: error.message,
      });
    }

    if (
      error?.code === "P2002" &&
      Array.isArray(error?.meta?.target) &&
      error.meta.target.includes("codeBarres")
    ) {
      return res.status(409).json({
        message:
          error?.meta?.modelName === "ProduitVariante"
            ? VARIANT_BARCODE_CONFLICT_MESSAGE
            : PRODUCT_BARCODE_CONFLICT_MESSAGE,
      });
    }

    console.error("Update product error:", error);
    return res.status(500).json({
      message: "Erreur serveur lors de la mise a jour du produit.",
    });
  }
};

const importProducts = async (req, res) => {
  try {
    const organisationId = getOrganisationIdFromUser(req.user);

    if (!req.file?.buffer) {
      return res.status(400).json({
        success: false,
        message: "Veuillez selectionner un fichier .xlsx ou .csv.",
      });
    }

    const rawRows = parseProductImportRows(req.file);
    const primaryStore = await prisma.pointDeVente.findFirst({
      where: {
        organisationId,
      },
      select: {
        id: true,
        nom: true,
      },
      orderBy: {
        id: "asc",
      },
    });

    if (!primaryStore) {
      return res.status(400).json({
        success: false,
        message: "Aucun point de vente disponible pour l'import du stock.",
      });
    }

    const existingProducts = await prisma.produit.findMany({
      where: {
        organisationId,
      },
      select: {
        id: true,
        nom: true,
        codeBarres: true,
      },
      orderBy: [{ id: "asc" }],
    });
    const productsByName = new Map();

    for (const product of existingProducts) {
      const productKey = normalizeRequiredString(product.nom).toLowerCase();

      if (productKey && !productsByName.has(productKey)) {
        productsByName.set(productKey, product);
      }
    }

    const existingVariants = await prisma.produitVariante.findMany({
      where: {
        organisationId,
        actif: true,
      },
      select: {
        produitId: true,
        taille: true,
        couleur: true,
        valeursVariante: true,
      },
    });
    const variantSignaturesByProductId = new Map();

    for (const variant of existingVariants) {
      const signature = buildVariantSignature(
        variant.taille,
        variant.couleur,
        variant.valeursVariante
      );

      if (!variantSignaturesByProductId.has(variant.produitId)) {
        variantSignaturesByProductId.set(variant.produitId, new Set());
      }

      variantSignaturesByProductId.get(variant.produitId).add(signature);
    }

    const categories = await prisma.categorieProduit.findMany({
      where: {
        organisationId,
      },
      orderBy: [{ id: "asc" }],
    });
    const categoriesByName = new Map();

    for (const category of categories) {
      const categoryKey = normalizeRequiredString(category.nom).toLowerCase();

      if (categoryKey && !categoriesByName.has(categoryKey)) {
        categoriesByName.set(categoryKey, category);
      }
    }

    const usedCategoryCodes = new Set(
      categories.map((category) => String(category.code || "").toUpperCase())
    );
    const usedBarcodes = await loadUsedBarcodes(organisationId);
    const touchedProductIds = new Set();
    let importedProducts = 0;
    let importedVariants = 0;
    const errors = [];

    for (const [index, rawRow] of rawRows.entries()) {
      const rowNumber = index + 2;

      try {
        const row = normalizeImportProductRow(rawRow);
        let variantBarcode = row.codeBarres;

        if (variantBarcode && usedBarcodes.has(variantBarcode.toLowerCase())) {
          throw {
            status: 409,
            message: VARIANT_BARCODE_CONFLICT_MESSAGE,
          };
        }

        const existingProduct = productsByName.get(row.nomKey) || null;
        const nextParentBarcode = existingProduct
          ? existingProduct.codeBarres
          : null;

        const result = await prisma.$transaction(async (tx) => {
          let product = existingProduct;
          let createdProduct = false;
          let category = null;

          if (!product) {
            const categoryResult = await ensureImportCategory(
              tx,
              organisationId,
              row.categorie,
              categoriesByName,
              usedCategoryCodes
            );
            category = categoryResult.category;

            product = await tx.produit.create({
              data: {
                organisationId,
                codeBarres: nextParentBarcode,
                nom: row.nom,
                categorieId: category.id,
                categorie: category.nom,
                prixAchat: row.prixAchat,
                prixVente: row.prixVente,
                tauxTVA: 0,
                prixDetail: row.prixVente,
                prixGros: row.prixVente,
                prixMiniGros: row.prixVente,
                seuilMinimum: 0,
                estActif: true,
              },
              select: {
                id: true,
                nom: true,
                codeBarres: true,
              },
            });
            createdProduct = true;
          }

          const variantSignature = buildVariantSignature(
            row.taille,
            row.couleur,
            row.valeursVariante
          );
          const productVariantSignatures =
            variantSignaturesByProductId.get(product.id) || new Set();

          if (productVariantSignatures.has(variantSignature)) {
            throw {
              status: 409,
              message: "Cette variante existe deja pour ce produit.",
            };
          }

          if (variantBarcode) {
            const conflictingProduct = await tx.produit.findFirst({
              where: {
                organisationId,
                codeBarres: variantBarcode,
              },
              select: {
                id: true,
              },
            });

            if (conflictingProduct) {
              throw {
                status: 409,
                message: VARIANT_BARCODE_CONFLICT_MESSAGE,
              };
            }

            const conflictingVariant = await tx.produitVariante.findFirst({
              where: {
                organisationId,
                codeBarres: variantBarcode,
              },
              select: {
                id: true,
              },
            });

            if (conflictingVariant) {
              throw {
                status: 409,
                message: VARIANT_BARCODE_CONFLICT_MESSAGE,
              };
            }
          }

          const createdVariant = await tx.produitVariante.create({
            data: {
              organisationId,
              produitId: product.id,
              taille: row.taille,
              couleur: row.couleur,
              valeursVariante: row.valeursVariante,
              codeBarres: variantBarcode,
              prixAchat: row.prixAchat,
              prixVente: row.prixVente,
              quantiteStock: row.stock,
              seuilMinimum: 0,
              actif: true,
            },
          });

          const stockRecord = await tx.stock.upsert({
            where: {
              organisationId_produitId_pointDeVenteId: {
                organisationId,
                produitId: product.id,
                pointDeVenteId: primaryStore.id,
              },
            },
            update: {
              quantite: {
                increment: row.stock,
              },
            },
            create: {
              organisationId,
              produitId: product.id,
              pointDeVenteId: primaryStore.id,
              quantite: row.stock,
            },
          });

          console.log("Variant stock linked", {
            productId: product.id,
            variantId: createdVariant.id,
            pointDeVenteId: primaryStore.id,
            quantity: row.stock,
          });
          console.log("Stock created", {
            stockId: stockRecord.id,
            productId: product.id,
            pointDeVenteId: primaryStore.id,
            quantity: stockRecord.quantite,
          });

          return {
            product,
            createdProduct,
            category,
            variantId: createdVariant.id,
            variantSignature,
          };
        });

        if (result.createdProduct) {
          importedProducts += 1;
          productsByName.set(row.nomKey, result.product);

          if (result.product.codeBarres) {
            usedBarcodes.add(String(result.product.codeBarres).toLowerCase());
          }

          if (result.category) {
            categoriesByName.set(row.categorieKey, result.category);
            usedCategoryCodes.add(String(result.category.code || "").toUpperCase());
          }
        }

        importedVariants += 1;
        if (variantBarcode) {
          usedBarcodes.add(variantBarcode.toLowerCase());
        }
        touchedProductIds.add(result.product.id);
        if (!variantSignaturesByProductId.has(result.product.id)) {
          variantSignaturesByProductId.set(result.product.id, new Set());
        }
        variantSignaturesByProductId.get(result.product.id).add(result.variantSignature);
      } catch (error) {
        const importRowMap = buildImportRowMap(rawRow);

        errors.push({
          row: rowNumber,
          product: normalizeRequiredString(importRowMap.get("nom")),
          message: error?.message || "Erreur lors de l'import de cette ligne.",
        });
      }
    }

    if (touchedProductIds.size > 0) {
      const pointsDeVente = await prisma.pointDeVente.findMany({
        where: {
          organisationId,
        },
        select: {
          id: true,
        },
        orderBy: {
          id: "asc",
        },
      });

      for (const productId of touchedProductIds) {
        const variants = await prisma.produitVariante.findMany({
          where: {
            organisationId,
            produitId: productId,
            actif: true,
          },
          select: {
            quantiteStock: true,
          },
        });
        const totalVariantStock = variants.reduce(
          (sum, variant) => sum + Number(variant.quantiteStock || 0),
          0
        );
        const quantityByStoreId = buildQuantityByStoreId(pointsDeVente, [
          {
            storeId: primaryStore.id,
            quantity: totalVariantStock,
          },
        ]);

        await syncAggregateProductStock(
          prisma,
          organisationId,
          productId,
          pointsDeVente,
          quantityByStoreId
        );
      }
    }

    return res.status(200).json({
      success: true,
      importedProducts,
      importedVariants,
      errors,
    });
  } catch (error) {
    if (error?.status) {
      return res.status(error.status).json({
        success: false,
        message: error.message,
      });
    }

    console.error("Import products error:", error);
    return res.status(500).json({
      success: false,
      message: "Erreur serveur lors de l'import des produits.",
    });
  }
};

const deleteProduct = async (req, res) => {
  try {
    const organisationId = getOrganisationIdFromUser(req.user);
    const productId = parseId(req.params.id);

    if (!productId) {
      return res.status(400).json({
        message: "ID produit invalide.",
      });
    }

    const existingProduct = await prisma.produit.findFirst({
      where: {
        organisationId,
        id: productId,
      },
      include: {
        _count: {
          select: {
            lignesVente: true,
          },
        },
      },
    });

    if (!existingProduct) {
      return res.status(404).json({
        message: "Produit introuvable.",
      });
    }

    if (existingProduct._count.lignesVente > 0) {
      return res.status(409).json({
        message:
          "Impossible de supprimer ce produit car il a deja ete utilise dans des ventes.",
      });
    }

    await prisma.produit.delete({
      where: { id: productId },
    });

    return res.status(200).json({
      message: "Produit supprime avec succes.",
    });
  } catch (error) {
    if (error.code === "P2003") {
      return res.status(409).json({
        message:
          "Impossible de supprimer ce produit car il est lie a des enregistrements existants.",
      });
    }

    console.error("Delete product error:", error);
    return res.status(500).json({
      message: "Erreur serveur lors de la suppression du produit.",
    });
  }
};

module.exports = {
  getAllProducts,
  getProductById,
  createProduct,
  importProducts,
  updateProduct,
  deleteProduct,
};
