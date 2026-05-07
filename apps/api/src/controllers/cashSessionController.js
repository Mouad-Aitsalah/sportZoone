const prisma = require("../config/prisma");
const { createHttpError } = require("../utils/httpError");
const {
  ensureEmployeeCashRegisterAccess,
  ensureEmployeeStoreAccess,
  getOrganisationIdFromUser,
} = require("../utils/organisationScope");
const {
  cashSessionInclude,
  cashSessionListInclude,
  createCashSession,
  getCashSessionDayRange,
  recalculateCashSessionMetrics,
  toApiCashSession,
} = require("../services/cashSessionService");

const isBlankString = (value) => typeof value === "string" && value.trim() === "";

const parsePositiveInteger = (value) => {
  if (value === undefined || value === null || isBlankString(value)) {
    return null;
  }

  const parsedValue = Number(value);
  return Number.isInteger(parsedValue) && parsedValue > 0 ? parsedValue : NaN;
};

const normalizeOptionalString = (value) => {
  if (value === undefined || value === null) {
    return null;
  }

  const normalizedValue = String(value).trim();
  return normalizedValue === "" ? null : normalizedValue;
};

const resolveSessionScope = (req) => {
  const requestedStoreId = parsePositiveInteger(req.query.storeId ?? req.query.pointDeVenteId);
  const requestedCashRegisterId = parsePositiveInteger(
    req.query.cashRegisterId ?? req.query.caisseId
  );
  const requestedUserId = parsePositiveInteger(req.query.userId ?? req.query.utilisateurId);

  if (Number.isNaN(requestedStoreId) || Number.isNaN(requestedCashRegisterId)) {
    throw createHttpError(400, "storeId and cashRegisterId must be valid positive integers.");
  }

  if (Number.isNaN(requestedUserId)) {
    throw createHttpError(400, "userId must be a valid positive integer.");
  }

  const storeId = req.user.role === "EMPLOYE" ? req.user.pointDeVenteId : requestedStoreId;
  const cashRegisterId =
    req.user.role === "EMPLOYE" ? req.user.caisseId : requestedCashRegisterId;
  const userId = requestedUserId || req.user.id;

  if (req.user.role === "EMPLOYE") {
    ensureEmployeeStoreAccess(req.user, storeId);
    ensureEmployeeCashRegisterAccess(req.user, cashRegisterId);
  }

  return {
    storeId,
    cashRegisterId,
    userId,
  };
};

const findCurrentOpenSession = async ({
  tx = prisma,
  organisationId,
  storeId,
  cashRegisterId,
}) =>
  tx.sessionCaisse.findFirst({
    where: {
      organisationId,
      pointDeVenteId: storeId,
      caisseId: cashRegisterId,
      statut: "OUVERTE",
    },
    include: cashSessionInclude,
    orderBy: {
      dateOuverture: "desc",
    },
  });

const getCurrentCashSession = async (req, res) => {
  const organisationId = getOrganisationIdFromUser(req.user);
  const { storeId, cashRegisterId } = resolveSessionScope(req);

  if (!storeId || !cashRegisterId) {
    return res.status(200).json({
      data: null,
    });
  }

  const session = await findCurrentOpenSession({
    organisationId,
    storeId,
    cashRegisterId,
  });

  return res.status(200).json({
    data: session ? toApiCashSession(session) : null,
  });
};

const getCashSessions = async (req, res) => {
  const organisationId = getOrganisationIdFromUser(req.user);
  const requestedStoreId = parsePositiveInteger(req.query.storeId ?? req.query.pointDeVenteId);
  const requestedCashRegisterId = parsePositiveInteger(
    req.query.cashRegisterId ?? req.query.caisseId
  );
  const requestedUserId = parsePositiveInteger(req.query.userId ?? req.query.utilisateurId);
  const requestedStatus = normalizeOptionalString(req.query.status)?.toUpperCase() || null;
  const requestedDate = normalizeOptionalString(req.query.date);

  if (
    Number.isNaN(requestedStoreId) ||
    Number.isNaN(requestedCashRegisterId) ||
    Number.isNaN(requestedUserId)
  ) {
    throw createHttpError(
      400,
      "storeId, cashRegisterId and userId must be valid positive integers when provided."
    );
  }

  if (requestedStatus && !["OUVERTE", "FERMEE"].includes(requestedStatus)) {
    throw createHttpError(400, "status must be one of: OUVERTE, FERMEE.");
  }

  let dateRangeFilter = {};

  if (requestedDate) {
    const parsedDate = new Date(requestedDate);

    if (Number.isNaN(parsedDate.getTime())) {
      throw createHttpError(400, "date must be a valid ISO date.");
    }

    dateRangeFilter = getCashSessionDayRange(parsedDate);
  }

  const where = {
    organisationId,
    ...(req.user.role === "EMPLOYE"
      ? {
          pointDeVenteId: req.user.pointDeVenteId,
          caisseId: req.user.caisseId,
        }
      : {}),
    ...(requestedStoreId ? { pointDeVenteId: requestedStoreId } : {}),
    ...(requestedCashRegisterId ? { caisseId: requestedCashRegisterId } : {}),
    ...(requestedUserId ? { utilisateurId: requestedUserId } : {}),
    ...(requestedStatus ? { statut: requestedStatus } : {}),
    ...(dateRangeFilter.startDate && dateRangeFilter.endDate
      ? {
          dateOuverture: {
            gte: dateRangeFilter.startDate,
            lte: dateRangeFilter.endDate,
          },
        }
      : {}),
  };

  const sessions = await prisma.sessionCaisse.findMany({
    where,
    include: cashSessionListInclude,
    orderBy: [
      {
        dateOuverture: "desc",
      },
      {
        id: "desc",
      },
    ],
  });

  return res.status(200).json({
    data: sessions.map((session) => toApiCashSession(session, { includeSales: false })),
  });
};

const getCashSessionById = async (req, res) => {
  const organisationId = getOrganisationIdFromUser(req.user);
  const sessionId = parsePositiveInteger(req.params.id);

  if (Number.isNaN(sessionId) || !sessionId) {
    throw createHttpError(400, "cash session id must be a valid positive integer.");
  }

  const session = await prisma.sessionCaisse.findFirst({
    where: {
      organisationId,
      id: sessionId,
    },
    include: cashSessionInclude,
  });

  if (!session) {
    throw createHttpError(404, "Cash session not found.");
  }

  ensureEmployeeStoreAccess(req.user, session.pointDeVenteId);
  ensureEmployeeCashRegisterAccess(req.user, session.caisseId);

  return res.status(200).json({
    data: toApiCashSession(session),
  });
};

const closeCashSession = async (req, res) => {
  const organisationId = getOrganisationIdFromUser(req.user);
  const sessionId = parsePositiveInteger(req.params.id);

  if (Number.isNaN(sessionId) || !sessionId) {
    throw createHttpError(400, "cash session id must be a valid positive integer.");
  }

  const { closedSession, currentSession } = await prisma.$transaction(async (tx) => {
    const existingSession = await tx.sessionCaisse.findFirst({
      where: {
        organisationId,
        id: sessionId,
      },
      include: {
        caisse: {
          select: {
            id: true,
            nom: true,
            code: true,
            estActive: true,
          },
        },
        pointDeVente: {
          select: {
            id: true,
            nom: true,
            adresse: true,
            telephone: true,
          },
        },
        utilisateur: {
          select: {
            id: true,
            nom: true,
            email: true,
            role: true,
          },
        },
      },
    });

    if (!existingSession) {
      throw createHttpError(404, "Cash session not found.");
    }

    ensureEmployeeStoreAccess(req.user, existingSession.pointDeVenteId);
    ensureEmployeeCashRegisterAccess(req.user, existingSession.caisseId);

    if (existingSession.statut === "FERMEE") {
      throw createHttpError(400, "Cette journee est deja cloturee.");
    }

    await recalculateCashSessionMetrics(tx, {
      organisationId,
      sessionId: existingSession.id,
    });

    const closedAt = new Date();

    await tx.sessionCaisse.update({
      where: {
        id: existingSession.id,
      },
      data: {
        statut: "FERMEE",
        dateFermeture: closedAt,
      },
    });

    await recalculateCashSessionMetrics(tx, {
      organisationId,
      sessionId: existingSession.id,
    });

    const nextSession = await createCashSession(tx, {
      organisationId,
      caisseId: existingSession.caisseId,
      pointDeVenteId: existingSession.pointDeVenteId,
      utilisateurId: req.user.id,
      date: closedAt,
    });

    const [closedSessionRecord, currentSessionRecord] = await Promise.all([
      tx.sessionCaisse.findUnique({
        where: {
          id: existingSession.id,
        },
        include: cashSessionInclude,
      }),
      tx.sessionCaisse.findUnique({
        where: {
          id: nextSession.id,
        },
        include: cashSessionInclude,
      }),
    ]);

    return {
      closedSession: closedSessionRecord,
      currentSession: currentSessionRecord,
    };
  });

  return res.status(200).json({
    message: "Journee cloturee avec succes. Une nouvelle session est ouverte.",
    data: {
      closedSession: toApiCashSession(closedSession),
      currentSession: toApiCashSession(currentSession),
    },
  });
};

const closeCurrentCashSession = async (req, res) => {
  const organisationId = getOrganisationIdFromUser(req.user);
  const { storeId, cashRegisterId } = resolveSessionScope(req);

  if (!storeId || !cashRegisterId) {
    throw createHttpError(400, "Aucune caisse active n'est disponible.");
  }

  const currentSession = await findCurrentOpenSession({
    organisationId,
    storeId,
    cashRegisterId,
  });

  if (!currentSession) {
    throw createHttpError(404, "Aucune session ouverte a cloturer.");
  }

  req.params.id = String(currentSession.id);
  return closeCashSession(req, res);
};

module.exports = {
  closeCashSession,
  closeCurrentCashSession,
  getCashSessionById,
  getCashSessions,
  getCurrentCashSession,
};
