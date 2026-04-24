const { Prisma } = require("@prisma/client");
const prisma = require("../config/prisma");

const saleInclude = {
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
      pointDeVenteId: true,
    },
  },
  lignes: {
    orderBy: {
      id: "asc",
    },
    include: {
      produit: {
        select: {
          id: true,
          nom: true,
          codeBarres: true,
          categorie: true,
          prixVente: true,
        },
      },
    },
  },
};

const formatDecimal = (value) =>
  value instanceof Prisma.Decimal ? value.toString() : value;

const formatSaleResponse = (sale) => ({
  ...sale,
  total: formatDecimal(sale.total),
  lignes: sale.lignes.map((ligne) => ({
    ...ligne,
    prixUnitaire: formatDecimal(ligne.prixUnitaire),
    sousTotal: formatDecimal(ligne.sousTotal),
    produit: ligne.produit
      ? {
          ...ligne.produit,
          prixVente: formatDecimal(ligne.produit.prixVente),
        }
      : null,
  })),
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

const buildReport = async (periodType, startDate, endDate) => {
  const where = {
    dateVente: {
      gte: startDate,
      lte: endDate,
    },
  };

  const [numberOfSales, revenueResult, sales] = await Promise.all([
    prisma.vente.count({ where }),
    prisma.vente.aggregate({
      where,
      _sum: {
        total: true,
      },
    }),
    prisma.vente.findMany({
      where,
      include: saleInclude,
      orderBy: {
        dateVente: "desc",
      },
    }),
  ]);

  return {
    period: periodType,
    startDate,
    endDate,
    numberOfSales,
    totalRevenue: revenueResult._sum.total
      ? revenueResult._sum.total.toString()
      : "0.00",
    sales: sales.map(formatSaleResponse),
  };
};

const getDayReport = async (req, res) => {
  try {
    const now = new Date();
    const report = await buildReport("day", getStartOfDay(now), getEndOfDay(now));

    return res.status(200).json(report);
  } catch (error) {
    console.error("Day report error:", error);
    return res.status(500).json({
      message: "Erreur serveur lors de la recuperation du rapport journalier.",
    });
  }
};

const getWeekReport = async (req, res) => {
  try {
    const now = new Date();
    const report = await buildReport("week", getStartOfWeek(now), getEndOfWeek(now));

    return res.status(200).json(report);
  } catch (error) {
    console.error("Week report error:", error);
    return res.status(500).json({
      message: "Erreur serveur lors de la recuperation du rapport hebdomadaire.",
    });
  }
};

const getMonthReport = async (req, res) => {
  try {
    const now = new Date();
    const report = await buildReport("month", getStartOfMonth(now), getEndOfMonth(now));

    return res.status(200).json(report);
  } catch (error) {
    console.error("Month report error:", error);
    return res.status(500).json({
      message: "Erreur serveur lors de la recuperation du rapport mensuel.",
    });
  }
};

module.exports = {
  getDayReport,
  getWeekReport,
  getMonthReport,
};
