const prisma = require("../config/prisma");
const { validateSchema } = require("../utils/validation");
const { createHttpError } = require("../utils/httpError");
const { getOrganisationIdFromUser } = require("../utils/organisationScope");
const {
  compteCreateSchema,
  compteUpdateSchema,
} = require("../utils/validationSchemas");
const {
  COMPTE_TYPES,
  compteInclude,
  decimalToNumber,
  normalizeCompteType,
  normalizeOptionalString,
  buildNextNumeroCompte,
  buildNextNumeroClient,
  toApiCompte,
  getCompteById,
} = require("../services/compteService");

const parsePositiveInteger = (value) => {
  const parsedValue = Number(value);
  return Number.isInteger(parsedValue) && parsedValue > 0 ? parsedValue : NaN;
};

const buildCompteResponse = (compte) => {
  const base = toApiCompte(compte);

  if (compte.type === COMPTE_TYPES.CLIENT) {
    return {
      ...base,
      customerNumber: compte.clientSource?.numeroClient || null,
      credit: compte.clientSource ? Number(compte.clientSource.credit || 0) : 0,
    };
  }

  return {
    ...base,
    productsCount: compte.fournisseurSource?._count?.produits || 0,
    purchasesCount: compte.fournisseurSource?._count?.achats || 0,
  };
};

const buildCompteSummaryResponse = (compte) => {
  const base = toApiCompte(compte);

  if (compte.type === COMPTE_TYPES.CLIENT) {
    return {
      ...base,
      customerNumber: compte.clientSource?.numeroClient || null,
      credit: compte.clientSource ? Number(compte.clientSource.credit || 0) : 0,
    };
  }

  return {
    ...base,
  };
};

const getComptes = async (req, res) => {
  const startedAt = Date.now();
  const timerLabel = `[perf] GET /api/comptes ${startedAt}-${Math.random()
    .toString(16)
    .slice(2, 8)}`;
  console.time(timerLabel);
  const organisationId = getOrganisationIdFromUser(req.user);
  const requestedType = normalizeCompteType(req.query.type);
  const requestedView = normalizeOptionalString(req.query.view)?.toLowerCase() || "default";
  const isSummaryView = requestedView === "summary";

  try {
    if (req.query.type && !requestedType) {
      throw createHttpError(400, "type must be CLIENT or FOURNISSEUR.");
    }

    if (req.query.view && !["default", "summary"].includes(requestedView)) {
      throw createHttpError(400, "view must be default or summary.");
    }

    const comptes = await prisma.compte.findMany({
      where: {
        organisationId,
        ...(requestedType ? { type: requestedType } : {}),
      },
      ...(isSummaryView
        ? {
            select: {
              id: true,
              organisationId: true,
              numeroCompte: true,
              type: true,
              nom: true,
              telephone: true,
              email: true,
              adresse: true,
              actif: true,
              ...(requestedType !== COMPTE_TYPES.FOURNISSEUR
                ? {
                    clientSource: {
                      select: {
                        numeroClient: true,
                        credit: true,
                      },
                    },
                  }
                : {}),
            },
          }
        : {
            include: compteInclude,
          }),
      orderBy: [{ type: "asc" }, { nom: "asc" }],
    });

    return res.status(200).json({
      success: true,
      data: comptes.map(isSummaryView ? buildCompteSummaryResponse : buildCompteResponse),
    });
  } finally {
    console.timeEnd(timerLabel);
    console.info("[perf] GET /api/comptes", {
      durationMs: Date.now() - startedAt,
      organisationId,
      type: requestedType || "all",
      view: requestedView,
    });
  }
};

const getCompteByIdHandler = async (req, res) => {
  const organisationId = getOrganisationIdFromUser(req.user);
  const compteId = parsePositiveInteger(req.params.id);

  if (Number.isNaN(compteId)) {
    throw createHttpError(400, "ID compte invalide.");
  }

  const compte = await getCompteById(prisma, organisationId, compteId);

  if (!compte) {
    throw createHttpError(404, "Compte introuvable.");
  }

  return res.status(200).json({
    success: true,
    data: buildCompteResponse(compte),
  });
};

const getCustomerOpenInvoices = async (req, res) => {
  const organisationId = getOrganisationIdFromUser(req.user);
  const compteId = parsePositiveInteger(req.params.id);

  if (Number.isNaN(compteId)) {
    throw createHttpError(400, "ID compte invalide.");
  }

  const compte = await prisma.compte.findFirst({
    where: {
      organisationId,
      id: compteId,
      type: COMPTE_TYPES.CLIENT,
    },
    include: {
      clientSource: true,
    },
  });

  if (!compte || !compte.clientSource) {
    throw createHttpError(404, "Compte client introuvable.");
  }

  const invoices = await prisma.vente.findMany({
    where: {
      organisationId,
      clientId: compte.clientSource.id,
      paymentStatus: {
        in: ["CREDIT", "PARTIALLY_PAID"],
      },
      remainingAmount: {
        gt: 0,
      },
      total: {
        gt: 0,
      },
      status: {
        notIn: ["cancelled", "refunded"],
      },
    },
    orderBy: [{ dateVente: "desc" }, { id: "desc" }],
    select: {
      id: true,
      numeroTicket: true,
      dateVente: true,
      total: true,
      paidAmount: true,
      remainingAmount: true,
      paymentMethod: true,
      paymentStatus: true,
      status: true,
    },
  });

  const normalizedInvoices = invoices.map((invoice) => ({
    id: invoice.id,
    ticketNumber: invoice.numeroTicket,
    date: invoice.dateVente,
    total: decimalToNumber(invoice.total),
    paidAmount: decimalToNumber(invoice.paidAmount),
    remainingAmount: decimalToNumber(invoice.remainingAmount),
    paymentMethod: invoice.paymentMethod,
    paymentStatus: invoice.paymentStatus,
    status: invoice.status,
    type: invoice.paymentStatus === "CREDIT" ? "credit" : "partial",
  }));

  const totalRemainingAmount = normalizedInvoices.reduce(
    (sum, invoice) => sum + Number(invoice.remainingAmount || 0),
    0
  );

  return res.status(200).json({
    success: true,
    data: {
      customer: {
        id: compte.id,
        customerNumber: compte.clientSource.numeroClient,
        accountNumber: compte.numeroCompte,
        name: compte.nom,
        phone: compte.telephone,
        email: compte.email,
        totalCredit: decimalToNumber(compte.clientSource.credit || 0),
        totalRemainingAmount,
        openInvoicesCount: normalizedInvoices.length,
      },
      invoices: normalizedInvoices,
    },
  });
};

const createCompte = async (req, res) => {
  const organisationId = getOrganisationIdFromUser(req.user);
  const payload = validateSchema(compteCreateSchema, req.body);
  const type = normalizeCompteType(payload.type);

  const compte = await prisma.$transaction(async (tx) => {
    const existingCompte = await tx.compte.findFirst({
      where: {
        organisationId,
        numeroCompte: payload.numeroCompte,
      },
      select: {
        id: true,
      },
    });

    if (existingCompte) {
      throw createHttpError(409, "Un compte avec ce numero existe deja.");
    }

    if (type === COMPTE_TYPES.CLIENT) {
      const numeroClient = await buildNextNumeroClient(tx, organisationId);
      const client = await tx.client.create({
        data: {
          organisationId,
          numeroClient,
          nom: payload.nom,
          telephone: normalizeOptionalString(payload.telephone) || null,
          email: normalizeOptionalString(payload.email) || null,
          estActif: payload.actif,
        },
      });

      return tx.compte.create({
        data: {
          organisationId,
          numeroCompte: payload.numeroCompte,
          type,
          nom: payload.nom,
          telephone: normalizeOptionalString(payload.telephone) || null,
          email: normalizeOptionalString(payload.email) || null,
          adresse: normalizeOptionalString(payload.adresse) || null,
          actif: payload.actif,
          clientSourceId: client.id,
        },
        include: compteInclude,
      });
    }

    const fournisseur = await tx.fournisseur.create({
      data: {
        organisationId,
        nom: payload.nom,
        telephone: normalizeOptionalString(payload.telephone) || null,
        email: normalizeOptionalString(payload.email) || null,
        adresse: normalizeOptionalString(payload.adresse) || null,
      },
    });

    return tx.compte.create({
      data: {
        organisationId,
        numeroCompte: payload.numeroCompte,
        type,
        nom: payload.nom,
        telephone: normalizeOptionalString(payload.telephone) || null,
        email: normalizeOptionalString(payload.email) || null,
        adresse: normalizeOptionalString(payload.adresse) || null,
        actif: payload.actif,
        fournisseurSourceId: fournisseur.id,
      },
      include: compteInclude,
    });
  });

  return res.status(201).json({
    success: true,
    data: buildCompteResponse(compte),
  });
};

const updateCompte = async (req, res) => {
  const organisationId = getOrganisationIdFromUser(req.user);
  const compteId = parsePositiveInteger(req.params.id);

  if (Number.isNaN(compteId)) {
    throw createHttpError(400, "ID compte invalide.");
  }

  const payload = validateSchema(compteUpdateSchema, req.body);
  const compte = await prisma.$transaction(async (tx) => {
    const existingCompte = await getCompteById(tx, organisationId, compteId);

    if (!existingCompte) {
      throw createHttpError(404, "Compte introuvable.");
    }

    if (
      payload.numeroCompte &&
      payload.numeroCompte !== existingCompte.numeroCompte
    ) {
      const compteWithSameNumber = await tx.compte.findFirst({
        where: {
          organisationId,
          numeroCompte: payload.numeroCompte,
          id: {
            not: compteId,
          },
        },
        select: {
          id: true,
        },
      });

      if (compteWithSameNumber) {
        throw createHttpError(409, "Un compte avec ce numero existe deja.");
      }
    }

    if (payload.type && payload.type !== existingCompte.type) {
      throw createHttpError(
        400,
        "Le type de compte ne peut pas etre modifie apres creation."
      );
    }

    const compteData = {
      ...(payload.numeroCompte !== undefined
        ? { numeroCompte: payload.numeroCompte }
        : {}),
      ...(payload.nom !== undefined ? { nom: payload.nom } : {}),
      ...(payload.telephone !== undefined
        ? { telephone: normalizeOptionalString(payload.telephone) || null }
        : {}),
      ...(payload.email !== undefined
        ? { email: normalizeOptionalString(payload.email) || null }
        : {}),
      ...(payload.adresse !== undefined
        ? { adresse: normalizeOptionalString(payload.adresse) || null }
        : {}),
      ...(payload.actif !== undefined ? { actif: payload.actif } : {}),
    };

    if (existingCompte.type === COMPTE_TYPES.CLIENT && existingCompte.clientSourceId) {
      await tx.client.update({
        where: {
          id: existingCompte.clientSourceId,
        },
        data: {
          ...(payload.nom !== undefined ? { nom: payload.nom } : {}),
          ...(payload.telephone !== undefined
            ? { telephone: normalizeOptionalString(payload.telephone) || null }
            : {}),
          ...(payload.email !== undefined
            ? { email: normalizeOptionalString(payload.email) || null }
            : {}),
          ...(payload.actif !== undefined ? { estActif: payload.actif } : {}),
        },
      });
    }

    if (
      existingCompte.type === COMPTE_TYPES.FOURNISSEUR &&
      existingCompte.fournisseurSourceId
    ) {
      await tx.fournisseur.update({
        where: {
          id: existingCompte.fournisseurSourceId,
        },
        data: {
          ...(payload.nom !== undefined ? { nom: payload.nom } : {}),
          ...(payload.telephone !== undefined
            ? { telephone: normalizeOptionalString(payload.telephone) || null }
            : {}),
          ...(payload.email !== undefined
            ? { email: normalizeOptionalString(payload.email) || null }
            : {}),
          ...(payload.adresse !== undefined
            ? { adresse: normalizeOptionalString(payload.adresse) || null }
            : {}),
        },
      });
    }

    return tx.compte.update({
      where: {
        id: compteId,
      },
      data: compteData,
      include: compteInclude,
    });
  });

  return res.status(200).json({
    success: true,
    data: buildCompteResponse(compte),
  });
};

const deleteCompte = async (req, res) => {
  const organisationId = getOrganisationIdFromUser(req.user);
  const compteId = parsePositiveInteger(req.params.id);

  if (Number.isNaN(compteId)) {
    throw createHttpError(400, "ID compte invalide.");
  }

  await prisma.$transaction(async (tx) => {
    const compte = await getCompteById(tx, organisationId, compteId);

    if (!compte) {
      throw createHttpError(404, "Compte introuvable.");
    }

    if (compte.type === COMPTE_TYPES.CLIENT && compte.clientSource) {
      if (compte.clientSource.numeroClient === 1) {
        throw createHttpError(409, "Le client inconnu ne peut pas etre supprime.");
      }

      const hasHistory =
        (compte.clientSource._count?.ventes || 0) > 0 ||
        (compte.clientSource.paiements?.length || 0) > 0;

      if (hasHistory) {
        await tx.client.update({
          where: {
            id: compte.clientSource.id,
          },
          data: {
            estActif: false,
          },
        });
        await tx.compte.update({
          where: {
            id: compte.id,
          },
          data: {
            actif: false,
          },
        });
        return;
      }

      await tx.compte.delete({
        where: {
          id: compte.id,
        },
      });
      await tx.client.delete({
        where: {
          id: compte.clientSource.id,
        },
      });
      return;
    }

    if (compte.type === COMPTE_TYPES.FOURNISSEUR && compte.fournisseurSource) {
      if ((compte.fournisseurSource._count?.produits || 0) > 0) {
        throw createHttpError(
          409,
          "Impossible de supprimer ce fournisseur car il est lie a des produits."
        );
      }

      if ((compte.fournisseurSource._count?.achats || 0) > 0) {
        throw createHttpError(
          409,
          "Impossible de supprimer ce fournisseur car il est deja lie a des achats."
        );
      }

      await tx.compte.delete({
        where: {
          id: compte.id,
        },
      });
      await tx.fournisseur.delete({
        where: {
          id: compte.fournisseurSource.id,
        },
      });
      return;
    }

    await tx.compte.delete({
      where: {
        id: compte.id,
      },
    });
  });

  return res.status(200).json({
    success: true,
    message: "Compte supprime avec succes.",
  });
};

module.exports = {
  getComptes,
  getCompteById: getCompteByIdHandler,
  getCustomerOpenInvoices,
  createCompte,
  updateCompte,
  deleteCompte,
  buildNextNumeroCompte,
};
