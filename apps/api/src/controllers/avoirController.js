const { Prisma } = require("@prisma/client");
const prisma = require("../config/prisma");
const {
  getOrganisationIdFromUser,
  ensureEmployeeStoreAccess,
} = require("../utils/organisationScope");
const { createHttpError } = require("../utils/httpError");
const { validateSchema } = require("../utils/validation");
const {
  avoirCreateSchema,
  supplierAvoirCreateSchema,
} = require("../utils/validationSchemas");
const {
  resolveCustomerCompte,
  resolveSupplierCompte,
} = require("../services/compteService");
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

const parseDateInput = (value, fieldLabel) => {
  if (value === undefined || value === null || String(value).trim() === "") {
    return new Date();
  }

  const normalizedValue =
    typeof value === "string" && value.length <= 10 ? `${value}T00:00:00` : value;
  const parsedDate = new Date(normalizedValue);

  if (Number.isNaN(parsedDate.getTime())) {
    throw createHttpError(400, `${fieldLabel} est invalide.`);
  }

  return parsedDate;
};

const normalizeAvoirPayload = (body) => {
  const rawLines = Array.isArray(body?.lignes)
    ? body.lignes
    : Array.isArray(body?.items)
    ? body.items
    : [];

  return {
    compteClientId: body?.compteClientId ?? body?.clientCompteId ?? body?.clientId,
    pointDeVenteId: body?.pointDeVenteId ?? body?.storeId,
    dateAvoir: body?.dateAvoir ?? body?.creditDate ?? body?.date,
    motif: body?.motif ?? body?.reason,
    lignes: rawLines.map((ligne) => ({
      produitId: ligne?.produitId ?? ligne?.productId,
      quantite: ligne?.quantite ?? ligne?.quantity,
      prixUnitaire: ligne?.prixUnitaire ?? ligne?.unitPrice,
    })),
  };
};

const ensureUniqueLineProducts = (lignes) => {
  const duplicateIds = lignes.reduce((duplicates, ligne, index, source) => {
    if (source.findIndex((entry) => entry.produitId === ligne.produitId) !== index) {
      duplicates.add(ligne.produitId);
    }

    return duplicates;
  }, new Set());

  if (duplicateIds.size > 0) {
    throw createHttpError(
      400,
      `Chaque produit doit apparaitre une seule fois dans l'avoir. Produits en doublon: ${Array.from(
        duplicateIds
      ).join(", ")}.`
    );
  }
};

const buildAvoirNumber = async (tx, organisationId) => {
  const latestAvoir = await tx.avoir.findFirst({
    where: {
      organisationId,
      numeroAvoir: {
        startsWith: "AV-",
      },
    },
    select: {
      numeroAvoir: true,
    },
    orderBy: {
      id: "desc",
    },
  });

  const latestSequence = latestAvoir?.numeroAvoir
    ? Number(String(latestAvoir.numeroAvoir).split("-").pop())
    : 0;
  const nextSequence = Number.isInteger(latestSequence) ? latestSequence + 1 : 1;

  return `AV-${String(nextSequence).padStart(6, "0")}`;
};

const avoirInclude = {
  compteClient: {
    select: {
      id: true,
      numeroCompte: true,
      nom: true,
      type: true,
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

const toApiAvoirLine = (ligne) => ({
  id: ligne.id,
  produitId: ligne.produitId,
  productId: ligne.produitId,
  produitNom: ligne.produit?.nom || null,
  productName: ligne.produit?.nom || null,
  quantite: ligne.quantite,
  quantity: ligne.quantite,
  prixUnitaire: decimalToNumber(ligne.prixUnitaire),
  unitPrice: decimalToNumber(ligne.prixUnitaire),
  totalLigne: decimalToNumber(ligne.totalLigne),
  lineTotal: decimalToNumber(ligne.totalLigne),
});

const toApiAvoir = (avoir) => {
  const lignes = Array.isArray(avoir.lignes) ? avoir.lignes.map(toApiAvoirLine) : [];

  return {
    id: avoir.id,
    numeroAvoir: avoir.numeroAvoir,
    creditNumber: avoir.numeroAvoir,
    compteClientId: avoir.compteClientId,
    clientCompteId: avoir.compteClientId,
    clientId: avoir.compteClientId,
    clientName: avoir.compteClient?.nom || "Client",
    clientAccountNumber: avoir.compteClient?.numeroCompte || "",
    pointDeVenteId: avoir.pointDeVenteId,
    storeId: avoir.pointDeVenteId,
    pointDeVenteNom: avoir.pointDeVente?.nom || null,
    storeName: avoir.pointDeVente?.nom || null,
    dateAvoir: avoir.dateAvoir,
    creditDate: avoir.dateAvoir,
    motif: avoir.motif || "",
    reason: avoir.motif || "",
    total: decimalToNumber(avoir.total),
    statut: avoir.statut,
    status: avoir.statut,
    lignes,
    items: lignes,
    createdAt: avoir.createdAt,
    updatedAt: avoir.updatedAt,
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

const validateProductsForAvoir = async (tx, organisationId, lignes) => {
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
    },
  });

  if (products.length !== productIds.length) {
    throw createHttpError(404, "Un ou plusieurs produits sont introuvables.");
  }

  return new Map(products.map((product) => [product.id, product]));
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
        `Impossible d'annuler cet avoir car le stock du produit ${ligne.produitId} est insuffisant pour retirer la quantite retournee.`
      );
    }
  }
};

const incrementStocksForLines = async (
  tx,
  organisationId,
  pointDeVenteId,
  lignes,
  reason,
  movementType = "RETURN"
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
        type: movementType,
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
  reason,
  movementType = "RETURN"
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
        type: movementType,
        reason,
      },
    });
  }
};

const createOrUpdateAvoir = async ({
  tx,
  organisationId,
  existingAvoir = null,
  payload,
}) => {
  const validatedPayload = validateSchema(
    avoirCreateSchema,
    normalizeAvoirPayload(payload)
  );
  const dateAvoir = parseDateInput(validatedPayload.dateAvoir, "La date de l'avoir");
  const [clientCompte, store] = await Promise.all([
    resolveCustomerCompte(tx, organisationId, validatedPayload.compteClientId),
    validateStoreExists(tx, organisationId, validatedPayload.pointDeVenteId),
  ]);

  await validateProductsForAvoir(tx, organisationId, validatedPayload.lignes);

  const normalizedLines = validatedPayload.lignes.map((ligne) => {
    const prixUnitaire = getDecimalValue(ligne.prixUnitaire);
    const quantite = ligne.quantite;
    const totalLigne = prixUnitaire.times(quantite);

    return {
      organisationId,
      produitId: ligne.produitId,
      quantite,
      prixUnitaire,
      totalLigne,
    };
  });

  const total = normalizedLines.reduce(
    (sum, ligne) => sum.plus(ligne.totalLigne),
    new Prisma.Decimal(0)
  );

  if (existingAvoir) {
    if (existingAvoir.statut === "ANNULE") {
      throw createHttpError(400, "Un avoir annule ne peut pas etre modifie.");
    }

    await decrementStocksForLines(
      tx,
      organisationId,
      existingAvoir.pointDeVenteId,
      existingAvoir.lignes.map((ligne) => ({
        produitId: ligne.produitId,
        quantite: ligne.quantite,
      })),
      `Annulation des quantites de l'avoir ${existingAvoir.numeroAvoir} avant mise a jour`
    );

    await tx.avoirLigne.deleteMany({
      where: {
        avoirId: existingAvoir.id,
      },
    });
  }

  const numeroAvoir = existingAvoir?.numeroAvoir || (await buildAvoirNumber(tx, organisationId));

  const avoir = existingAvoir
    ? await tx.avoir.update({
        where: {
          id: existingAvoir.id,
        },
        data: {
          compteClientId: clientCompte.id,
          pointDeVenteId: store.id,
          dateAvoir,
          motif: validatedPayload.motif || null,
          total,
          statut: "ENREGISTRE",
          lignes: {
            create: normalizedLines.map((ligne) => ({
              organisationId: ligne.organisationId,
              produitId: ligne.produitId,
              quantite: ligne.quantite,
              prixUnitaire: ligne.prixUnitaire,
              totalLigne: ligne.totalLigne,
            })),
          },
        },
        include: avoirInclude,
      })
    : await tx.avoir.create({
        data: {
          organisationId,
          numeroAvoir,
          compteClientId: clientCompte.id,
          pointDeVenteId: store.id,
          dateAvoir,
          motif: validatedPayload.motif || null,
          total,
          statut: "ENREGISTRE",
          lignes: {
            create: normalizedLines.map((ligne) => ({
              organisationId: ligne.organisationId,
              produitId: ligne.produitId,
              quantite: ligne.quantite,
              prixUnitaire: ligne.prixUnitaire,
              totalLigne: ligne.totalLigne,
            })),
          },
        },
        include: avoirInclude,
      });

  await incrementStocksForLines(
    tx,
    organisationId,
    store.id,
    normalizedLines.map((ligne) => ({
      produitId: ligne.produitId,
      quantite: ligne.quantite,
    })),
    `Avoir client ${numeroAvoir}`
  );

  return avoir;
};

const createAvoir = async (req, res) => {
  const organisationId = getOrganisationIdFromUser(req.user);
  const normalizedPayload = normalizeAvoirPayload(req.body);

  ensureEmployeeStoreAccess(req.user, Number(normalizedPayload.pointDeVenteId));

  const avoir = await prisma.$transaction((tx) =>
    createOrUpdateAvoir({
      tx,
      organisationId,
      payload: req.body,
    })
  );

  return res.status(201).json({
    success: true,
    data: toApiAvoir(avoir),
  });
};

const getAvoirs = async (req, res) => {
  const organisationId = getOrganisationIdFromUser(req.user);
  const employeeStoreId = req.user.role === "EMPLOYE" ? req.user.pointDeVenteId : null;

  if (req.user.role === "EMPLOYE" && !employeeStoreId) {
    throw createHttpError(
      403,
      "Acces refuse. Aucun point de vente n'est associe a cet employe."
    );
  }

  const avoirs = await prisma.avoir.findMany({
    where: {
      organisationId,
      ...(employeeStoreId ? { pointDeVenteId: employeeStoreId } : {}),
    },
    include: avoirInclude,
    orderBy: [{ dateAvoir: "desc" }, { id: "desc" }],
  });

  return res.status(200).json({
    success: true,
    data: avoirs.map(toApiAvoir),
  });
};

const getAvoirById = async (req, res) => {
  const organisationId = getOrganisationIdFromUser(req.user);
  const avoirId = parsePositiveInteger(req.params.id);

  if (Number.isNaN(avoirId)) {
    throw createHttpError(400, "ID avoir invalide.");
  }

  const avoir = await prisma.avoir.findFirst({
    where: {
      id: avoirId,
      organisationId,
    },
    include: avoirInclude,
  });

  if (!avoir) {
    throw createHttpError(404, "Avoir introuvable.");
  }

  ensureEmployeeStoreAccess(req.user, avoir.pointDeVenteId);

  return res.status(200).json({
    success: true,
    data: toApiAvoir(avoir),
  });
};

const updateAvoir = async (req, res) => {
  const organisationId = getOrganisationIdFromUser(req.user);
  const avoirId = parsePositiveInteger(req.params.id);

  if (Number.isNaN(avoirId)) {
    throw createHttpError(400, "ID avoir invalide.");
  }

  const existingAvoir = await prisma.avoir.findFirst({
    where: {
      id: avoirId,
      organisationId,
    },
    include: avoirInclude,
  });

  if (!existingAvoir) {
    throw createHttpError(404, "Avoir introuvable.");
  }

  ensureEmployeeStoreAccess(req.user, existingAvoir.pointDeVenteId);

  const normalizedPayload = normalizeAvoirPayload(req.body);
  ensureEmployeeStoreAccess(req.user, Number(normalizedPayload.pointDeVenteId));

  const avoir = await prisma.$transaction((tx) =>
    createOrUpdateAvoir({
      tx,
      organisationId,
      existingAvoir,
      payload: req.body,
    })
  );

  return res.status(200).json({
    success: true,
    data: toApiAvoir(avoir),
  });
};

const deleteAvoir = async (req, res) => {
  const organisationId = getOrganisationIdFromUser(req.user);
  const avoirId = parsePositiveInteger(req.params.id);

  if (Number.isNaN(avoirId)) {
    throw createHttpError(400, "ID avoir invalide.");
  }

  const avoir = await prisma.avoir.findFirst({
    where: {
      id: avoirId,
      organisationId,
    },
    include: avoirInclude,
  });

  if (!avoir) {
    throw createHttpError(404, "Avoir introuvable.");
  }

  ensureEmployeeStoreAccess(req.user, avoir.pointDeVenteId);

  if (avoir.statut === "ANNULE") {
    return res.status(200).json({
      success: true,
      message: "Avoir deja annule.",
    });
  }

  await prisma.$transaction(async (tx) => {
    await decrementStocksForLines(
      tx,
      organisationId,
      avoir.pointDeVenteId,
      avoir.lignes.map((ligne) => ({
        produitId: ligne.produitId,
        quantite: ligne.quantite,
      })),
      `Annulation de l'avoir ${avoir.numeroAvoir}`
    );

    await tx.avoir.update({
      where: {
        id: avoir.id,
      },
      data: {
        statut: "ANNULE",
      },
    });
  });

  return res.status(200).json({
    success: true,
    message: "Avoir annule avec succes.",
  });
};

const normalizeSupplierAvoirPayload = (body) => {
  const rawLines = Array.isArray(body?.lignes)
    ? body.lignes
    : Array.isArray(body?.items)
    ? body.items
    : [];

  return {
    compteFournisseurId:
      body?.compteFournisseurId ??
      body?.fournisseurCompteId ??
      body?.supplierCompteId ??
      body?.fournisseurId ??
      body?.supplierId,
    achatId: body?.achatId ?? body?.purchaseId,
    pointDeVenteId: body?.pointDeVenteId ?? body?.storeId,
    date: body?.date ?? body?.dateAvoir ?? body?.creditDate,
    motif: body?.motif ?? body?.reason,
    compensationMode: body?.compensationMode ?? body?.modeCompensation,
    commentaire: body?.commentaire ?? body?.comment,
    lignes: rawLines.map((ligne) => ({
      produitId: ligne?.produitId ?? ligne?.productId,
      quantite: ligne?.quantite ?? ligne?.quantity,
      prixAchat: ligne?.prixAchat ?? ligne?.purchasePrice ?? ligne?.unitPurchasePrice,
    })),
  };
};

const supplierAvoirInclude = {
  compteFournisseur: {
    select: {
      id: true,
      numeroCompte: true,
      nom: true,
      type: true,
    },
  },
  achat: {
    select: {
      id: true,
      numeroAchat: true,
      dateAchat: true,
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
          categorie: true,
        },
      },
    },
    orderBy: {
      id: "asc",
    },
  },
};

const toApiSupplierAvoirLine = (ligne) => ({
  id: ligne.id,
  produitId: ligne.produitId,
  productId: ligne.produitId,
  produitNom: ligne.produit?.nom || null,
  productName: ligne.produit?.nom || null,
  codeBarres: ligne.produit?.codeBarres || "",
  barcode: ligne.produit?.codeBarres || "",
  categorie: ligne.produit?.categorie || "",
  category: ligne.produit?.categorie || "",
  quantite: ligne.quantite,
  quantity: ligne.quantite,
  prixAchat: decimalToNumber(ligne.prixAchat),
  purchasePrice: decimalToNumber(ligne.prixAchat),
  sousTotal: decimalToNumber(ligne.sousTotal),
  lineTotal: decimalToNumber(ligne.sousTotal),
});

const toApiSupplierAvoir = (avoir) => {
  const lignes = Array.isArray(avoir.lignes)
    ? avoir.lignes.map(toApiSupplierAvoirLine)
    : [];

  return {
    id: avoir.id,
    numero: avoir.numero,
    supplierCreditNumber: avoir.numero,
    compteFournisseurId: avoir.compteFournisseurId,
    fournisseurCompteId: avoir.compteFournisseurId,
    supplierCompteId: avoir.compteFournisseurId,
    fournisseurNom: avoir.compteFournisseur?.nom || "Fournisseur",
    supplierName: avoir.compteFournisseur?.nom || "Fournisseur",
    fournisseurNumeroCompte: avoir.compteFournisseur?.numeroCompte || "",
    supplierAccountNumber: avoir.compteFournisseur?.numeroCompte || "",
    achatId: avoir.achatId,
    purchaseId: avoir.achatId,
    numeroAchat: avoir.achat?.numeroAchat || "",
    purchaseNumber: avoir.achat?.numeroAchat || "",
    pointDeVenteId: avoir.pointDeVenteId,
    storeId: avoir.pointDeVenteId,
    pointDeVenteNom: avoir.pointDeVente?.nom || null,
    storeName: avoir.pointDeVente?.nom || null,
    date: avoir.date,
    motif: avoir.motif || "",
    reason: avoir.motif || "",
    compensationMode: avoir.compensationMode,
    commentaire: avoir.commentaire || "",
    comment: avoir.commentaire || "",
    total: decimalToNumber(avoir.total),
    statut: avoir.statut,
    status: avoir.statut,
    lignes,
    items: lignes,
    createdAt: avoir.createdAt,
    updatedAt: avoir.updatedAt,
  };
};

const validatePurchaseExists = async (
  tx,
  organisationId,
  achatId,
  compteFournisseurId,
  pointDeVenteId
) => {
  if (!achatId) {
    return null;
  }

  const achat = await tx.achat.findFirst({
    where: {
      id: achatId,
      organisationId,
    },
    select: {
      id: true,
      numeroAchat: true,
      compteFournisseurId: true,
      pointDeVenteId: true,
    },
  });

  if (!achat) {
    throw createHttpError(404, "Achat de reference introuvable.");
  }

  if (achat.compteFournisseurId !== compteFournisseurId) {
    throw createHttpError(
      400,
      "L'achat selectionne n'appartient pas au fournisseur selectionne."
    );
  }

  if (pointDeVenteId && achat.pointDeVenteId !== pointDeVenteId) {
    throw createHttpError(
      400,
      "L'achat selectionne n'appartient pas au point de vente selectionne."
    );
  }

  return achat;
};

const validateProductsForSupplierAvoir = async (
  tx,
  organisationId,
  compteFournisseur,
  lignes
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
      categorie: true,
      codeBarres: true,
    },
  });

  if (products.length !== productIds.length) {
    throw createHttpError(404, "Un ou plusieurs produits sont introuvables.");
  }

  const productsById = new Map(products.map((product) => [product.id, product]));
  const legacySupplierId = compteFournisseur.fournisseurSource?.id || null;

  for (const ligne of lignes) {
    const product = productsById.get(ligne.produitId);

    if (!product.estActif) {
      throw createHttpError(
        400,
        `Le produit ${product.nom} est inactif et ne peut pas etre retourne au fournisseur.`
      );
    }

    if (
      legacySupplierId &&
      product.fournisseurId &&
      product.fournisseurId !== legacySupplierId
    ) {
      throw createHttpError(
        400,
        `Le produit ${product.nom} n'appartient pas au fournisseur selectionne.`
      );
    }
  }

  return productsById;
};

const createSupplierAvoirDraft = async ({ tx, organisationId, payload }) => {
  const validatedPayload = validateSchema(
    supplierAvoirCreateSchema,
    normalizeSupplierAvoirPayload(payload)
  );
  const date = parseDateInput(validatedPayload.date, "La date");
  const [compteFournisseur, store] = await Promise.all([
    resolveSupplierCompte(tx, organisationId, validatedPayload.compteFournisseurId),
    validateStoreExists(tx, organisationId, validatedPayload.pointDeVenteId),
  ]);

  await Promise.all([
    validatePurchaseExists(
      tx,
      organisationId,
      validatedPayload.achatId || null,
      compteFournisseur.id,
      store.id
    ),
    validateProductsForSupplierAvoir(
      tx,
      organisationId,
      compteFournisseur,
      validatedPayload.lignes
    ),
  ]);

  const normalizedLines = validatedPayload.lignes.map((ligne) => {
    const prixAchat = getDecimalValue(ligne.prixAchat);
    const quantite = ligne.quantite;

    return {
      organisationId,
      produitId: ligne.produitId,
      quantite,
      prixAchat,
      sousTotal: prixAchat.times(quantite),
    };
  });

  const total = normalizedLines.reduce(
    (sum, ligne) => sum.plus(ligne.sousTotal),
    new Prisma.Decimal(0)
  );
  const numero = await buildAnnualDocumentNumber({
    tx,
    model: "avoirFournisseur",
    field: "numero",
    date,
    where: {
      organisationId,
    },
  });

  return tx.avoirFournisseur.create({
    data: {
      organisationId,
      numero,
      compteFournisseurId: compteFournisseur.id,
      achatId: validatedPayload.achatId || null,
      pointDeVenteId: store.id,
      date,
      total,
      statut: "BROUILLON",
      motif: validatedPayload.motif || null,
      compensationMode: validatedPayload.compensationMode,
      commentaire: validatedPayload.commentaire || null,
      lignes: {
        create: normalizedLines.map((ligne) => ({
          organisationId: ligne.organisationId,
          produitId: ligne.produitId,
          quantite: ligne.quantite,
          prixAchat: ligne.prixAchat,
          sousTotal: ligne.sousTotal,
        })),
      },
    },
    include: supplierAvoirInclude,
  });
};

const getSupplierAvoirOrThrow = async (organisationId, avoirId) => {
  const avoir = await prisma.avoirFournisseur.findFirst({
    where: {
      id: avoirId,
      organisationId,
    },
    include: supplierAvoirInclude,
  });

  if (!avoir) {
    throw createHttpError(404, "Avoir fournisseur introuvable.");
  }

  return avoir;
};

const createSupplierAvoir = async (req, res) => {
  const organisationId = getOrganisationIdFromUser(req.user);
  const normalizedPayload = normalizeSupplierAvoirPayload(req.body);

  ensureEmployeeStoreAccess(req.user, Number(normalizedPayload.pointDeVenteId));

  const avoir = await prisma.$transaction((tx) =>
    createSupplierAvoirDraft({
      tx,
      organisationId,
      payload: req.body,
    })
  );

  return res.status(201).json({
    success: true,
    data: toApiSupplierAvoir(avoir),
  });
};

const getSupplierAvoirs = async (req, res) => {
  const organisationId = getOrganisationIdFromUser(req.user);
  const employeeStoreId = req.user.role === "EMPLOYE" ? req.user.pointDeVenteId : null;

  if (req.user.role === "EMPLOYE" && !employeeStoreId) {
    throw createHttpError(
      403,
      "Acces refuse. Aucun point de vente n'est associe a cet employe."
    );
  }

  const avoirs = await prisma.avoirFournisseur.findMany({
    where: {
      organisationId,
      ...(employeeStoreId ? { pointDeVenteId: employeeStoreId } : {}),
    },
    include: supplierAvoirInclude,
    orderBy: [{ date: "desc" }, { id: "desc" }],
  });

  return res.status(200).json({
    success: true,
    data: avoirs.map(toApiSupplierAvoir),
  });
};

const getSupplierAvoirById = async (req, res) => {
  const organisationId = getOrganisationIdFromUser(req.user);
  const avoirId = parsePositiveInteger(req.params.id);

  if (Number.isNaN(avoirId)) {
    throw createHttpError(400, "ID avoir fournisseur invalide.");
  }

  const avoir = await getSupplierAvoirOrThrow(organisationId, avoirId);
  ensureEmployeeStoreAccess(req.user, avoir.pointDeVenteId);

  return res.status(200).json({
    success: true,
    data: toApiSupplierAvoir(avoir),
  });
};

const validateSupplierAvoir = async (req, res) => {
  const organisationId = getOrganisationIdFromUser(req.user);
  const avoirId = parsePositiveInteger(req.params.id);

  if (Number.isNaN(avoirId)) {
    throw createHttpError(400, "ID avoir fournisseur invalide.");
  }

  const existingAvoir = await getSupplierAvoirOrThrow(organisationId, avoirId);
  ensureEmployeeStoreAccess(req.user, existingAvoir.pointDeVenteId);

  if (existingAvoir.statut === "VALIDE") {
    throw createHttpError(400, "Cet avoir fournisseur est deja valide.");
  }

  if (existingAvoir.statut === "REMBOURSE") {
    throw createHttpError(400, "Un avoir fournisseur rembourse ne peut pas etre revalide.");
  }

  const avoir = await prisma.$transaction(async (tx) => {
    await decrementStocksForLines(
      tx,
      organisationId,
      existingAvoir.pointDeVenteId,
      existingAvoir.lignes.map((ligne) => ({
        produitId: ligne.produitId,
        quantite: ligne.quantite,
      })),
      `Validation de l'avoir fournisseur ${existingAvoir.numero}`,
      "SUPPLIER_RETURN"
    );

    return tx.avoirFournisseur.update({
      where: {
        id: existingAvoir.id,
      },
      data: {
        statut: "VALIDE",
      },
      include: supplierAvoirInclude,
    });
  });

  return res.status(200).json({
    success: true,
    data: toApiSupplierAvoir(avoir),
  });
};

const cancelSupplierAvoir = async (req, res) => {
  const organisationId = getOrganisationIdFromUser(req.user);
  const avoirId = parsePositiveInteger(req.params.id);

  if (Number.isNaN(avoirId)) {
    throw createHttpError(400, "ID avoir fournisseur invalide.");
  }

  const existingAvoir = await getSupplierAvoirOrThrow(organisationId, avoirId);
  ensureEmployeeStoreAccess(req.user, existingAvoir.pointDeVenteId);

  if (existingAvoir.statut === "ANNULE") {
    return res.status(200).json({
      success: true,
      message: "Avoir fournisseur deja annule.",
    });
  }

  if (existingAvoir.statut === "REMBOURSE") {
    throw createHttpError(
      409,
      "Un avoir fournisseur deja rembourse ne peut pas etre annule."
    );
  }

  const avoir = await prisma.$transaction(async (tx) => {
    if (existingAvoir.statut === "VALIDE") {
      await incrementStocksForLines(
        tx,
        organisationId,
        existingAvoir.pointDeVenteId,
        existingAvoir.lignes.map((ligne) => ({
          produitId: ligne.produitId,
          quantite: ligne.quantite,
        })),
        `Annulation de l'avoir fournisseur ${existingAvoir.numero}`,
        "SUPPLIER_RETURN"
      );
    }

    return tx.avoirFournisseur.update({
      where: {
        id: existingAvoir.id,
      },
      data: {
        statut: "ANNULE",
      },
      include: supplierAvoirInclude,
    });
  });

  return res.status(200).json({
    success: true,
    data: toApiSupplierAvoir(avoir),
  });
};

module.exports = {
  createAvoir,
  getAvoirs,
  getAvoirById,
  updateAvoir,
  deleteAvoir,
  createSupplierAvoir,
  getSupplierAvoirs,
  getSupplierAvoirById,
  validateSupplierAvoir,
  cancelSupplierAvoir,
};
