const { Prisma } = require("@prisma/client");
const prisma = require("../config/prisma");
const { getOrganisationIdFromUser } = require("../utils/organisationScope");
const { createHttpError } = require("../utils/httpError");
const { validateSchema } = require("../utils/validation");
const {
  expenseCreateSchema,
  expenseUpdateSchema,
} = require("../utils/validationSchemas");

const decimalToNumber = (value) => {
  if (value instanceof Prisma.Decimal) {
    return Number(value.toString());
  }

  if (typeof value === "string") {
    return Number(value);
  }

  return Number(value || 0);
};

const parsePositiveInt = (value) => {
  const numericValue = Number(value);
  return Number.isInteger(numericValue) && numericValue > 0 ? numericValue : null;
};

const parseOptionalDate = (value, fieldName) => {
  if (value === undefined || value === null || String(value).trim() === "") {
    return null;
  }

  const parsedDate = new Date(value);

  if (Number.isNaN(parsedDate.getTime())) {
    throw createHttpError(400, `${fieldName} invalide.`);
  }

  return parsedDate;
};

const normalizeChargeDate = (value, fieldName = "La date") => {
  const parsedDate = new Date(value);

  if (Number.isNaN(parsedDate.getTime())) {
    throw createHttpError(400, `${fieldName} invalide.`);
  }

  return parsedDate;
};

const expenseInclude = {
  pointDeVente: {
    select: {
      id: true,
      nom: true,
    },
  },
  utilisateur: {
    select: {
      id: true,
      nom: true,
      email: true,
    },
  },
};

const toApiExpense = (expense) => ({
  id: expense.id,
  title: expense.titre,
  titre: expense.titre,
  category: expense.categorie,
  categorie: expense.categorie,
  amount: decimalToNumber(expense.montant),
  montant: decimalToNumber(expense.montant),
  date: expense.dateCharge,
  dateCharge: expense.dateCharge,
  paymentMethod: expense.modePaiement,
  modePaiement: expense.modePaiement,
  description: expense.description || "",
  pointDeVenteId: expense.pointDeVenteId,
  storeId: expense.pointDeVenteId,
  storeName: expense.pointDeVente?.nom || "-",
  utilisateurId: expense.utilisateurId,
  createdById: expense.utilisateurId,
  createdByName: expense.utilisateur?.nom || "-",
  createdAt: expense.createdAt,
  updatedAt: expense.updatedAt,
});

const ensureStoreBelongsToOrganisation = async (organisationId, pointDeVenteId, db = prisma) => {
  const store = await db.pointDeVente.findFirst({
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

const getExpenses = async (req, res) => {
  const organisationId = getOrganisationIdFromUser(req.user);
  const storeId = parsePositiveInt(req.query.storeId ?? req.query.pointDeVenteId);
  const category = String(req.query.category ?? req.query.categorie ?? "")
    .trim()
    .toUpperCase();
  const startDate = parseOptionalDate(req.query.startDate ?? req.query.dateFrom, "Date debut");
  const endDate = parseOptionalDate(req.query.endDate ?? req.query.dateTo, "Date fin");

  if ((req.query.storeId || req.query.pointDeVenteId) && !storeId) {
    throw createHttpError(400, "Le point de vente filtre est invalide.");
  }

  const where = {
    organisationId,
    ...(storeId ? { pointDeVenteId: storeId } : {}),
    ...(category ? { categorie: category } : {}),
    ...(startDate || endDate
      ? {
          dateCharge: {
            ...(startDate ? { gte: startDate } : {}),
            ...(endDate ? { lte: endDate } : {}),
          },
        }
      : {}),
  };

  const expenses = await prisma.charge.findMany({
    where,
    include: expenseInclude,
    orderBy: [{ dateCharge: "desc" }, { id: "desc" }],
  });

  return res.status(200).json({
    data: expenses.map(toApiExpense),
  });
};

const createExpense = async (req, res) => {
  const organisationId = getOrganisationIdFromUser(req.user);
  const payload = validateSchema(expenseCreateSchema, req.body || {});
  const dateCharge = normalizeChargeDate(payload.dateCharge);

  await ensureStoreBelongsToOrganisation(organisationId, payload.pointDeVenteId);

  const createdExpense = await prisma.charge.create({
    data: {
      organisationId,
      pointDeVenteId: payload.pointDeVenteId,
      utilisateurId: req.user.id,
      titre: payload.titre,
      categorie: payload.categorie,
      montant: payload.montant,
      dateCharge,
      modePaiement: payload.modePaiement,
      description: payload.description || null,
    },
    include: expenseInclude,
  });

  return res.status(201).json({
    data: toApiExpense(createdExpense),
    message: "Charge enregistree avec succes.",
  });
};

const updateExpense = async (req, res) => {
  const organisationId = getOrganisationIdFromUser(req.user);
  const expenseId = parsePositiveInt(req.params.id);

  if (!expenseId) {
    throw createHttpError(400, "ID charge invalide.");
  }

  const payload = validateSchema(expenseUpdateSchema, req.body || {});

  if (!Object.keys(payload).length) {
    throw createHttpError(400, "Aucune modification fournie.");
  }

  const existingExpense = await prisma.charge.findFirst({
    where: {
      id: expenseId,
      organisationId,
    },
  });

  if (!existingExpense) {
    throw createHttpError(404, "Charge introuvable.");
  }

  if (payload.pointDeVenteId) {
    await ensureStoreBelongsToOrganisation(organisationId, payload.pointDeVenteId);
  }

  const updatedExpense = await prisma.charge.update({
    where: {
      id: expenseId,
    },
    data: {
      ...(payload.titre !== undefined ? { titre: payload.titre } : {}),
      ...(payload.categorie !== undefined ? { categorie: payload.categorie } : {}),
      ...(payload.montant !== undefined ? { montant: payload.montant } : {}),
      ...(payload.dateCharge !== undefined
        ? { dateCharge: normalizeChargeDate(payload.dateCharge) }
        : {}),
      ...(payload.modePaiement !== undefined ? { modePaiement: payload.modePaiement } : {}),
      ...(payload.pointDeVenteId !== undefined
        ? { pointDeVenteId: payload.pointDeVenteId }
        : {}),
      ...(payload.description !== undefined ? { description: payload.description || null } : {}),
    },
    include: expenseInclude,
  });

  return res.status(200).json({
    data: toApiExpense(updatedExpense),
    message: "Charge modifiee avec succes.",
  });
};

const deleteExpense = async (req, res) => {
  const organisationId = getOrganisationIdFromUser(req.user);
  const expenseId = parsePositiveInt(req.params.id);

  if (!expenseId) {
    throw createHttpError(400, "ID charge invalide.");
  }

  const existingExpense = await prisma.charge.findFirst({
    where: {
      id: expenseId,
      organisationId,
    },
    select: {
      id: true,
    },
  });

  if (!existingExpense) {
    throw createHttpError(404, "Charge introuvable.");
  }

  await prisma.charge.delete({
    where: {
      id: expenseId,
    },
  });

  return res.status(200).json({
    message: "Charge supprimee avec succes.",
  });
};

module.exports = {
  getExpenses,
  createExpense,
  updateExpense,
  deleteExpense,
};
