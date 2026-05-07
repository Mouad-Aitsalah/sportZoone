const { Prisma } = require("@prisma/client");
const prisma = require("../config/prisma");
const {
  getOrganisationIdFromUser,
  ensureEmployeeStoreAccess,
} = require("../utils/organisationScope");
const { createHttpError } = require("../utils/httpError");
const { validateSchema } = require("../utils/validation");
const { purchaseCreateSchema } = require("../utils/validationSchemas");
const { resolveSupplierCompte } = require("../services/compteService");
const { buildAnnualDocumentNumber } = require("../services/annualSequenceService");

const decimalToNumber = (value) => {
  if (value instanceof Prisma.Decimal) {
    return Number(value.toString());
  }

  return Number(value || 0);
};

const getDecimalValue = (value) => {
  if (value instanceof Prisma.Decimal) {
    return value;
  }

  return new Prisma.Decimal(value || 0);
};

const parsePositiveInteger = (value) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : NaN;
};

const parseDateInput = (value, fieldLabel, { required = false } = {}) => {
  if (value === undefined || value === null || String(value).trim() === "") {
    if (required) {
      throw createHttpError(400, `${fieldLabel} est obligatoire.`);
    }

    return null;
  }

  const normalizedValue =
    typeof value === "string" && value.length <= 10 ? `${value}T00:00:00` : value;
  const parsedDate = new Date(normalizedValue);

  if (Number.isNaN(parsedDate.getTime())) {
    throw createHttpError(400, `${fieldLabel} est invalide.`);
  }

  return parsedDate;
};

const ensureUniqueLineProducts = (lignes) => {
  const duplicateProductIds = lignes.reduce((duplicates, ligne, index, source) => {
    if (source.findIndex((entry) => entry.produitId === ligne.produitId) !== index) {
      duplicates.add(ligne.produitId);
    }

    return duplicates;
  }, new Set());

  if (duplicateProductIds.size > 0) {
    throw createHttpError(
      400,
      `Chaque produit doit apparaitre une seule fois dans l'achat. Produits en doublon: ${Array.from(
        duplicateProductIds
      ).join(", ")}.`
    );
  }
};

const normalizePurchasePayload = (body) => {
  const rawLines = Array.isArray(body?.lignes)
    ? body.lignes
    : Array.isArray(body?.items)
    ? body.items
    : [];

  return {
    compteFournisseurId:
      body?.compteFournisseurId ??
      body?.compteId ??
      body?.supplierCompteId ??
      body?.fournisseurCompteId ??
      body?.fournisseurId ??
      body?.supplierId,
    dateAchat: body?.dateAchat ?? body?.purchaseDate,
    modeReglement: body?.modeReglement ?? body?.paymentMode,
    dateReglement: body?.dateReglement ?? body?.paymentDate ?? body?.dueDate,
    numeroCheque: body?.numeroCheque ?? body?.checkNumber,
    observations: body?.observations ?? body?.commentaire ?? body?.comment,
    pointDeVenteId: body?.pointDeVenteId ?? body?.storeId,
    lignes: rawLines.map((ligne) => ({
      produitId: ligne?.produitId ?? ligne?.productId,
      quantite: ligne?.quantite ?? ligne?.quantity,
      prixAchatUnitaireHT:
        ligne?.prixAchatUnitaireHT ??
        ligne?.prixAchat ??
        ligne?.purchasePrice ??
        ligne?.unitPurchasePrice,
      prixDetail: ligne?.prixDetail ?? ligne?.retailPrice ?? ligne?.salePrice,
    })),
  };
};

const resolvePurchasePaymentMeta = ({ modeReglement, dateAchat, dateReglement }) => {
  if (modeReglement === "CREDIT" && !dateReglement) {
    throw createHttpError(
      400,
      "La date de reglement est obligatoire pour un achat a credit."
    );
  }

  if (modeReglement === "ESPECE") {
    return {
      dateReglement: dateReglement || dateAchat,
      statut: "PAYE",
    };
  }

  if (modeReglement === "CHEQUE") {
    return {
      dateReglement: dateReglement || null,
      statut: dateReglement ? "PAYE" : "ENREGISTRE",
    };
  }

  return {
    dateReglement,
    statut: "CREDIT_EN_ATTENTE",
  };
};

const purchaseInclude = {
  compteFournisseur: {
    select: {
      id: true,
      numeroCompte: true,
      nom: true,
      type: true,
    },
  },
  fournisseur: {
    select: {
      id: true,
      nom: true,
    },
  },
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
          codeBarres: true,
        },
      },
    },
    orderBy: {
      id: "asc",
    },
  },
};

const toApiPurchaseLine = (ligne) => ({
  id: ligne.id,
  produitId: ligne.produitId,
  productId: ligne.produitId,
  produitNom: ligne.produit?.nom || null,
  productName: ligne.produit?.nom || null,
  quantite: ligne.quantite,
  quantity: ligne.quantite,
  prixAchatUnitaireHT: decimalToNumber(ligne.prixAchatUnitaireHT),
  purchasePriceHT: decimalToNumber(ligne.prixAchatUnitaireHT),
  tauxTVA: decimalToNumber(ligne.tauxTVA),
  vatRate: decimalToNumber(ligne.tauxTVA),
  montantTVA: decimalToNumber(ligne.montantTVA),
  vatAmount: decimalToNumber(ligne.montantTVA),
  totalHT: decimalToNumber(ligne.totalHT),
  totalTTC: decimalToNumber(ligne.totalTTC),
  prixDetail: decimalToNumber(ligne.prixDetail),
  retailPrice: decimalToNumber(ligne.prixDetail),
  prixGros: decimalToNumber(ligne.prixGros),
  wholesalePrice: decimalToNumber(ligne.prixGros),
  prixMiniGros: decimalToNumber(ligne.prixMiniGros),
  miniWholesalePrice: decimalToNumber(ligne.prixMiniGros),
});

const toApiPurchase = (achat) => {
  const lignes = Array.isArray(achat.lignes) ? achat.lignes.map(toApiPurchaseLine) : [];

  return {
    id: achat.id,
    numeroAchat: achat.numeroAchat,
    purchaseNumber: achat.numeroAchat,
    reference: achat.numeroAchat,
    compteFournisseurId: achat.compteFournisseurId,
    supplierCompteId: achat.compteFournisseurId,
    supplierId: achat.compteFournisseurId,
    supplierName:
      achat.compteFournisseur?.nom || achat.fournisseur?.nom || "Fournisseur",
    dateAchat: achat.dateAchat,
    purchaseDate: achat.dateAchat,
    dateReglement: achat.dateReglement,
    paymentDate: achat.dateReglement,
    numeroCheque: achat.numeroCheque || "",
    checkNumber: achat.numeroCheque || "",
    observations: achat.observations || "",
    commentaire: achat.observations || "",
    modeReglement: achat.modeReglement,
    paymentMode: achat.modeReglement,
    totalHT: decimalToNumber(achat.totalHT),
    totalTVA: decimalToNumber(achat.totalTVA),
    totalTTC: decimalToNumber(achat.totalTTC),
    total: decimalToNumber(achat.totalTTC),
    statut: achat.statut,
    status: achat.statut,
    pointDeVenteId: achat.pointDeVenteId,
    storeId: achat.pointDeVenteId,
    pointDeVenteNom: achat.pointDeVente?.nom || null,
    storeName: achat.pointDeVente?.nom || null,
    lignes,
    items: lignes,
    createdAt: achat.createdAt,
    updatedAt: achat.updatedAt,
  };
};

const buildLineAmounts = (ligne, produit) => {
  const prixAchatUnitaireHT = getDecimalValue(ligne.prixAchatUnitaireHT);
  const quantite = new Prisma.Decimal(ligne.quantite);
  const totalHT = prixAchatUnitaireHT.times(quantite);
  const tauxTVA = new Prisma.Decimal(0);
  const montantTVA = new Prisma.Decimal(0);
  const totalTTC = totalHT;

  return {
    prixAchatUnitaireHT,
    tauxTVA,
    montantTVA,
    totalHT,
    totalTTC,
    prixDetail: getDecimalValue(ligne.prixDetail),
    prixGros: new Prisma.Decimal(0),
    prixMiniGros: new Prisma.Decimal(0),
  };
};

const validateStoreExists = async (tx, organisationId, pointDeVenteId) => {
  const store = await tx.pointDeVente.findFirst({
    where: {
      id: pointDeVenteId,
      organisationId,
    },
    select: {
      id: true,
      nom: true,
    },
  });

  if (!store) {
    throw createHttpError(404, "Point de vente introuvable.");
  }

  return store;
};

const validateProductsForPurchase = async (
  tx,
  organisationId,
  lignes,
  supplierLegacyId
) => {
  ensureUniqueLineProducts(lignes);

  const productIds = [...new Set(lignes.map((ligne) => ligne.produitId))];
  const products = await tx.produit.findMany({
    where: {
      organisationId,
      id: {
        in: productIds,
      },
    },
    select: {
      id: true,
      nom: true,
      estActif: true,
      fournisseurId: true,
      prixVente: true,
      prixDetail: true,
    },
  });

  if (products.length !== productIds.length) {
    throw createHttpError(404, "Un ou plusieurs produits sont introuvables.");
  }

  const productsById = new Map(products.map((product) => [product.id, product]));

  for (const ligne of lignes) {
    const product = productsById.get(ligne.produitId);

    if (!product.estActif) {
      throw createHttpError(
        400,
        `Le produit ${product.nom} est inactif et ne peut pas etre utilise dans un achat.`
      );
    }

    if (
      supplierLegacyId &&
      product.fournisseurId &&
      product.fournisseurId !== supplierLegacyId
    ) {
      throw createHttpError(
        400,
        `Le produit ${product.nom} n'appartient pas au fournisseur selectionne.`
      );
    }
  }

  return productsById;
};

const assertStocksCanBeReduced = async (tx, organisationId, pointDeVenteId, lignes) => {
  const productIds = [...new Set(lignes.map((ligne) => ligne.produitId))];
  const stocks = await tx.stock.findMany({
    where: {
      organisationId,
      pointDeVenteId,
      produitId: {
        in: productIds,
      },
    },
    select: {
      produitId: true,
      quantite: true,
    },
  });

  const stockByProductId = new Map(stocks.map((stock) => [stock.produitId, stock.quantite]));

  for (const ligne of lignes) {
    const currentQuantity = stockByProductId.get(ligne.produitId) || 0;

    if (currentQuantity < ligne.quantite) {
      throw createHttpError(
        409,
        `Impossible de modifier cet achat car le stock du produit ${ligne.produitId} est insuffisant pour annuler la quantite precedente.`
      );
    }
  }
};

const incrementStocksForLines = async (
  tx,
  organisationId,
  pointDeVenteId,
  lignes,
  reason
) => {
  for (const ligne of lignes) {
    await tx.stock.upsert({
      where: {
        organisationId_produitId_pointDeVenteId: {
          organisationId,
          produitId: ligne.produitId,
          pointDeVenteId,
        },
      },
      update: {
        quantite: {
          increment: ligne.quantite,
        },
      },
      create: {
        organisationId,
        produitId: ligne.produitId,
        pointDeVenteId,
        quantite: ligne.quantite,
      },
    });

    await tx.stockMovement.create({
      data: {
        organisationId,
        produitId: ligne.produitId,
        pointDeVenteId,
        quantite: ligne.quantite,
        type: "PURCHASE",
        reason,
      },
    });
  }
};

const decrementStocksForLines = async (
  tx,
  organisationId,
  pointDeVenteId,
  lignes,
  reason
) => {
  await assertStocksCanBeReduced(tx, organisationId, pointDeVenteId, lignes);

  for (const ligne of lignes) {
    await tx.stock.update({
      where: {
        organisationId_produitId_pointDeVenteId: {
          organisationId,
          produitId: ligne.produitId,
          pointDeVenteId,
        },
      },
      data: {
        quantite: {
          decrement: ligne.quantite,
        },
      },
    });

    await tx.stockMovement.create({
      data: {
        organisationId,
        produitId: ligne.produitId,
        pointDeVenteId,
        quantite: -ligne.quantite,
        type: "PURCHASE",
        reason,
      },
    });
  }
};

const createOrUpdatePurchase = async ({
  tx,
  organisationId,
  purchaseId = null,
  existingPurchase = null,
  payload,
}) => {
  const validatedPayload = validateSchema(
    purchaseCreateSchema,
    normalizePurchasePayload(payload)
  );
  const dateAchat = parseDateInput(validatedPayload.dateAchat, "La date d'achat", {
    required: true,
  });
  const requestedDateReglement = parseDateInput(
    validatedPayload.dateReglement,
    "La date de reglement"
  );
  const paymentMeta = resolvePurchasePaymentMeta({
    modeReglement: validatedPayload.modeReglement,
    dateAchat,
    dateReglement: requestedDateReglement,
  });

  const [supplierCompte, store] = await Promise.all([
    resolveSupplierCompte(tx, organisationId, validatedPayload.compteFournisseurId),
    validateStoreExists(tx, organisationId, validatedPayload.pointDeVenteId),
  ]);

  const productsById = await validateProductsForPurchase(
    tx,
    organisationId,
    validatedPayload.lignes,
    supplierCompte.fournisseurSource.id
  );

  const normalizedLines = validatedPayload.lignes.map((ligne) => {
    const product = productsById.get(ligne.produitId);
    const amounts = buildLineAmounts(ligne, product);

    return {
      organisationId,
      produitId: ligne.produitId,
      quantite: ligne.quantite,
      ...amounts,
    };
  });

  const totals = normalizedLines.reduce(
    (accumulator, ligne) => ({
      totalHT: accumulator.totalHT.plus(ligne.totalHT),
      totalTVA: accumulator.totalTVA.plus(ligne.montantTVA),
      totalTTC: accumulator.totalTTC.plus(ligne.totalTTC),
    }),
    {
      totalHT: new Prisma.Decimal(0),
      totalTVA: new Prisma.Decimal(0),
      totalTTC: new Prisma.Decimal(0),
    }
  );

  if (existingPurchase) {
    await decrementStocksForLines(
      tx,
      organisationId,
      existingPurchase.pointDeVenteId,
      existingPurchase.lignes.map((ligne) => ({
        produitId: ligne.produitId,
        quantite: ligne.quantite,
      })),
      `Annulation des quantites de l'achat ${existingPurchase.numeroAchat} avant mise a jour`
    );

    await tx.achatLigne.deleteMany({
      where: {
        achatId: existingPurchase.id,
      },
    });
  }

  for (const ligne of normalizedLines) {
    await tx.produit.update({
      where: {
        id: ligne.produitId,
      },
      data: {
        prixAchat: ligne.prixAchatUnitaireHT,
        prixVente: ligne.prixDetail,
        prixDetail: ligne.prixDetail,
      },
    });
  }

  const numeroAchat =
    existingPurchase?.numeroAchat ||
    (await buildAnnualDocumentNumber({
      tx,
      model: "achat",
      field: "numeroAchat",
      date: dateAchat,
    }));

  const achat = existingPurchase
    ? await tx.achat.update({
        where: {
          id: existingPurchase.id,
        },
        data: {
          compteFournisseurId: supplierCompte.id,
          fournisseurId: supplierCompte.fournisseurSource.id,
          dateAchat,
          modeReglement: validatedPayload.modeReglement,
          dateReglement: paymentMeta.dateReglement,
          numeroCheque:
            validatedPayload.modeReglement === "CHEQUE"
              ? validatedPayload.numeroCheque || null
              : null,
          observations: validatedPayload.observations || null,
          totalHT: totals.totalHT,
          totalTVA: totals.totalTVA,
          totalTTC: totals.totalTTC,
          statut: paymentMeta.statut,
          pointDeVenteId: store.id,
          lignes: {
            create: normalizedLines.map((ligne) => ({
              organisationId: ligne.organisationId,
              produitId: ligne.produitId,
              quantite: ligne.quantite,
              prixAchatUnitaireHT: ligne.prixAchatUnitaireHT,
              tauxTVA: ligne.tauxTVA,
              montantTVA: ligne.montantTVA,
              totalHT: ligne.totalHT,
              totalTTC: ligne.totalTTC,
              prixDetail: ligne.prixDetail,
              prixGros: ligne.prixGros,
              prixMiniGros: ligne.prixMiniGros,
            })),
          },
        },
        include: purchaseInclude,
      })
    : await tx.achat.create({
        data: {
          organisationId,
          numeroAchat,
          compteFournisseurId: supplierCompte.id,
          fournisseurId: supplierCompte.fournisseurSource.id,
          dateAchat,
          modeReglement: validatedPayload.modeReglement,
          dateReglement: paymentMeta.dateReglement,
          numeroCheque:
            validatedPayload.modeReglement === "CHEQUE"
              ? validatedPayload.numeroCheque || null
              : null,
          observations: validatedPayload.observations || null,
          totalHT: totals.totalHT,
          totalTVA: totals.totalTVA,
          totalTTC: totals.totalTTC,
          statut: paymentMeta.statut,
          pointDeVenteId: store.id,
          lignes: {
            create: normalizedLines.map((ligne) => ({
              organisationId: ligne.organisationId,
              produitId: ligne.produitId,
              quantite: ligne.quantite,
              prixAchatUnitaireHT: ligne.prixAchatUnitaireHT,
              tauxTVA: ligne.tauxTVA,
              montantTVA: ligne.montantTVA,
              totalHT: ligne.totalHT,
              totalTTC: ligne.totalTTC,
              prixDetail: ligne.prixDetail,
              prixGros: ligne.prixGros,
              prixMiniGros: ligne.prixMiniGros,
            })),
          },
        },
        include: purchaseInclude,
      });

  await incrementStocksForLines(
    tx,
    organisationId,
    store.id,
    normalizedLines.map((ligne) => ({
      produitId: ligne.produitId,
      quantite: ligne.quantite,
    })),
    `Achat fournisseur ${numeroAchat}`
  );

  return achat;
};

const createPurchase = async (req, res) => {
  const organisationId = getOrganisationIdFromUser(req.user);
  const normalizedPayload = normalizePurchasePayload(req.body);

  ensureEmployeeStoreAccess(req.user, Number(normalizedPayload.pointDeVenteId));

  let purchase = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      purchase = await prisma.$transaction((tx) =>
        createOrUpdatePurchase({
          tx,
          organisationId,
          payload: req.body,
        })
      );
      break;
    } catch (error) {
      if (error.code === "P2002" && attempt < 2) {
        continue;
      }

      throw error;
    }
  }

  return res.status(201).json({
    success: true,
    data: toApiPurchase(purchase),
  });
};

const getPurchases = async (req, res) => {
  const organisationId = getOrganisationIdFromUser(req.user);
  const employeeStoreId = req.user.role === "EMPLOYE" ? req.user.pointDeVenteId : null;

  if (req.user.role === "EMPLOYE" && !employeeStoreId) {
    throw createHttpError(
      403,
      "Acces refuse. Aucun point de vente n'est associe a cet employe."
    );
  }

  const purchases = await prisma.achat.findMany({
    where: {
      organisationId,
      ...(employeeStoreId ? { pointDeVenteId: employeeStoreId } : {}),
    },
    include: purchaseInclude,
    orderBy: [{ dateAchat: "desc" }, { id: "desc" }],
  });

  return res.status(200).json({
    success: true,
    data: purchases.map(toApiPurchase),
  });
};

const getPurchaseById = async (req, res) => {
  const organisationId = getOrganisationIdFromUser(req.user);
  const purchaseId = parsePositiveInteger(req.params.id);

  if (Number.isNaN(purchaseId)) {
    throw createHttpError(400, "ID achat invalide.");
  }

  const purchase = await prisma.achat.findFirst({
    where: {
      id: purchaseId,
      organisationId,
    },
    include: purchaseInclude,
  });

  if (!purchase) {
    throw createHttpError(404, "Achat introuvable.");
  }

  ensureEmployeeStoreAccess(req.user, purchase.pointDeVenteId);

  return res.status(200).json({
    success: true,
    data: toApiPurchase(purchase),
  });
};

const updatePurchase = async (req, res) => {
  const organisationId = getOrganisationIdFromUser(req.user);
  const purchaseId = parsePositiveInteger(req.params.id);

  if (Number.isNaN(purchaseId)) {
    throw createHttpError(400, "ID achat invalide.");
  }

  const existingPurchase = await prisma.achat.findFirst({
    where: {
      id: purchaseId,
      organisationId,
    },
    include: purchaseInclude,
  });

  if (!existingPurchase) {
    throw createHttpError(404, "Achat introuvable.");
  }

  ensureEmployeeStoreAccess(req.user, existingPurchase.pointDeVenteId);

  const normalizedPayload = normalizePurchasePayload(req.body);
  ensureEmployeeStoreAccess(req.user, Number(normalizedPayload.pointDeVenteId));

  const purchase = await prisma.$transaction((tx) =>
    createOrUpdatePurchase({
      tx,
      organisationId,
      purchaseId,
      existingPurchase,
      payload: req.body,
    })
  );

  return res.status(200).json({
    success: true,
    data: toApiPurchase(purchase),
  });
};

const deletePurchase = async (req, res) => {
  const organisationId = getOrganisationIdFromUser(req.user);
  const purchaseId = parsePositiveInteger(req.params.id);

  if (Number.isNaN(purchaseId)) {
    throw createHttpError(400, "ID achat invalide.");
  }

  const purchase = await prisma.achat.findFirst({
    where: {
      id: purchaseId,
      organisationId,
    },
    include: purchaseInclude,
  });

  if (!purchase) {
    throw createHttpError(404, "Achat introuvable.");
  }

  ensureEmployeeStoreAccess(req.user, purchase.pointDeVenteId);

  await prisma.$transaction(async (tx) => {
    await decrementStocksForLines(
      tx,
      organisationId,
      purchase.pointDeVenteId,
      purchase.lignes.map((ligne) => ({
        produitId: ligne.produitId,
        quantite: ligne.quantite,
      })),
      `Suppression de l'achat ${purchase.numeroAchat}`
    );

    await tx.achat.delete({
      where: {
        id: purchase.id,
      },
    });
  });

  return res.status(200).json({
    success: true,
    message: "Achat supprime avec succes.",
  });
};

module.exports = {
  createPurchase,
  getPurchases,
  getPurchaseById,
  updatePurchase,
  deletePurchase,
};
