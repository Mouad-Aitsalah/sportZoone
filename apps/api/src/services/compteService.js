const { Prisma } = require("@prisma/client");
const { createHttpError } = require("../utils/httpError");

const COMPTE_TYPES = {
  CLIENT: "CLIENT",
  FOURNISSEUR: "FOURNISSEUR",
};
const DEFAULT_SUPPLIER_NAME = "Autre";

const decimalToNumber = (value) => {
  if (value instanceof Prisma.Decimal) {
    return Number(value.toString());
  }

  if (typeof value === "string") {
    return Number(value);
  }

  return Number(value || 0);
};

const normalizeOptionalString = (value) => {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  const normalizedValue = String(value).trim();
  return normalizedValue === "" ? null : normalizedValue;
};

const normalizeCompteType = (value) => {
  const normalizedValue = String(value || "").trim().toUpperCase();
  return Object.values(COMPTE_TYPES).includes(normalizedValue) ? normalizedValue : null;
};

const getComptePrefix = (type) =>
  type === COMPTE_TYPES.FOURNISSEUR ? "FR" : "CL";

const buildNextNumeroCompte = async (tx, organisationId, type) => {
  const prefix = getComptePrefix(type);
  const latestCompte = await tx.compte.findFirst({
    where: {
      organisationId,
      type,
      numeroCompte: {
        startsWith: `${prefix}-`,
      },
    },
    select: {
      numeroCompte: true,
    },
    orderBy: {
      id: "desc",
    },
  });

  const latestSequence = latestCompte?.numeroCompte
    ? Number(String(latestCompte.numeroCompte).split("-").pop())
    : 0;
  const nextSequence = Number.isInteger(latestSequence) ? latestSequence + 1 : 1;

  return `${prefix}-${String(nextSequence).padStart(4, "0")}`;
};

const buildNextNumeroClient = async (tx, organisationId) => {
  const lastCustomer = await tx.client.findFirst({
    where: {
      organisationId,
      numeroClient: {
        gt: 1,
      },
    },
    select: {
      numeroClient: true,
    },
    orderBy: {
      numeroClient: "desc",
    },
  });

  return lastCustomer ? lastCustomer.numeroClient + 1 : 2;
};

const compteInclude = {
  clientSource: {
    include: {
      _count: {
        select: {
          ventes: true,
        },
      },
      ventes: {
        select: {
          total: true,
        },
      },
      paiements: {
        select: {
          id: true,
        },
      },
    },
  },
  fournisseurSource: {
    include: {
      _count: {
        select: {
          produits: true,
          achats: true,
        },
      },
    },
  },
};

const getCustomerTotals = (clientSource) => {
  const totalPurchases = (clientSource?.ventes || []).reduce(
    (sum, sale) => sum.plus(sale.total),
    new Prisma.Decimal(0)
  );

  return {
    totalPurchases: decimalToNumber(totalPurchases),
    salesCount: clientSource?._count?.ventes || 0,
  };
};

const toApiCompte = (compte) => ({
  id: compte.id,
  organisationId: compte.organisationId,
  numeroCompte: compte.numeroCompte,
  type: compte.type,
  nom: compte.nom,
  name: compte.nom,
  telephone: compte.telephone,
  phone: compte.telephone,
  email: compte.email,
  adresse: compte.adresse,
  address: compte.adresse,
  actif: compte.actif,
  active: compte.actif,
  createdAt: compte.createdAt,
  updatedAt: compte.updatedAt,
});

const toApiCustomerFromCompte = (compte) => {
  const clientSource = compte.clientSource;
  const totals = getCustomerTotals(clientSource);

  return {
    id: compte.id,
    accountNumber: compte.numeroCompte,
    customerNumber: clientSource?.numeroClient || null,
    organisationId: compte.organisationId,
    type: compte.type,
    name: compte.nom,
    phone: compte.telephone,
    email: compte.email,
    address: compte.adresse,
    credit: decimalToNumber(clientSource?.credit || 0),
    active: compte.actif,
    totalPurchases: totals.totalPurchases,
    salesCount: totals.salesCount,
    legacyCustomerId: clientSource?.id || null,
  };
};

const toApiSupplierFromCompte = (compte) => ({
  id: compte.id,
  accountNumber: compte.numeroCompte,
  organisationId: compte.organisationId,
  type: compte.type,
  name: compte.nom,
  phone: compte.telephone,
  email: compte.email,
  address: compte.adresse,
  active: compte.actif,
  productsCount: compte.fournisseurSource?._count?.produits || 0,
  purchasesCount: compte.fournisseurSource?._count?.achats || 0,
  legacySupplierId: compte.fournisseurSource?.id || null,
});

const getCompteById = (tx, organisationId, compteId, type) =>
  tx.compte.findFirst({
    where: {
      organisationId,
      id: compteId,
      ...(type ? { type } : {}),
    },
    include: compteInclude,
  });

const resolveCustomerCompte = async (tx, organisationId, compteId) => {
  const compte = await getCompteById(tx, organisationId, compteId, COMPTE_TYPES.CLIENT);

  if (!compte || !compte.clientSource) {
    throw createHttpError(404, "Client introuvable.");
  }

  return compte;
};

const resolveSupplierCompte = async (tx, organisationId, compteId) => {
  const compte = await getCompteById(
    tx,
    organisationId,
    compteId,
    COMPTE_TYPES.FOURNISSEUR
  );

  if (!compte || !compte.fournisseurSource) {
    throw createHttpError(404, "Fournisseur introuvable.");
  }

  return compte;
};

const ensureDefaultSupplierCompte = async (tx, organisationId) => {
  const existingSupplier = await tx.fournisseur.findFirst({
    where: {
      organisationId,
      nom: {
        equals: DEFAULT_SUPPLIER_NAME,
        mode: "insensitive",
      },
    },
    include: {
      compte: {
        include: compteInclude,
      },
    },
    orderBy: {
      id: "asc",
    },
  });

  if (existingSupplier?.compte) {
    return existingSupplier.compte;
  }

  const numeroCompte = await buildNextNumeroCompte(
    tx,
    organisationId,
    COMPTE_TYPES.FOURNISSEUR
  );

  if (existingSupplier) {
    return tx.compte.create({
      data: {
        organisationId,
        numeroCompte,
        type: COMPTE_TYPES.FOURNISSEUR,
        nom: existingSupplier.nom || DEFAULT_SUPPLIER_NAME,
        actif: true,
        fournisseurSourceId: existingSupplier.id,
      },
      include: compteInclude,
    });
  }

  const createdSupplier = await tx.fournisseur.create({
    data: {
      organisationId,
      nom: DEFAULT_SUPPLIER_NAME,
    },
  });

  return tx.compte.create({
    data: {
      organisationId,
      numeroCompte,
      type: COMPTE_TYPES.FOURNISSEUR,
      nom: DEFAULT_SUPPLIER_NAME,
      actif: true,
      fournisseurSourceId: createdSupplier.id,
    },
    include: compteInclude,
  });
};

module.exports = {
  COMPTE_TYPES,
  DEFAULT_SUPPLIER_NAME,
  compteInclude,
  decimalToNumber,
  normalizeOptionalString,
  normalizeCompteType,
  buildNextNumeroCompte,
  buildNextNumeroClient,
  toApiCompte,
  toApiCustomerFromCompte,
  toApiSupplierFromCompte,
  getCompteById,
  resolveCustomerCompte,
  resolveSupplierCompte,
  ensureDefaultSupplierCompte,
};
