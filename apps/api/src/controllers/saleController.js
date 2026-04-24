const { Prisma } = require("@prisma/client");
const { randomBytes } = require("crypto");
const prisma = require("../config/prisma");

const parseId = (value) => {
  const parsedValue = Number(value);
  return Number.isInteger(parsedValue) && parsedValue > 0 ? parsedValue : null;
};

const parsePositiveInteger = (value) => {
  const parsedValue = Number(value);
  return Number.isInteger(parsedValue) && parsedValue > 0 ? parsedValue : NaN;
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

const normalizePaymentMethod = (value) => {
  if (value === undefined || value === null || String(value).trim() === "") {
    return "cash";
  }

  const normalizedValue = String(value).trim().toLowerCase();
  return PAYMENT_METHOD_ALIASES[normalizedValue] || null;
};

const createHttpError = (status, message) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

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
          estActif: true,
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

const generateTicketNumber = (pointDeVenteId) => {
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

  return `TCK-${pointDeVenteId}-${datePart}${timePart}-${randomPart}`;
};

const normalizeItems = (items) => {
  if (!Array.isArray(items) || items.length === 0) {
    throw createHttpError(400, "items doit etre un tableau non vide.");
  }

  const groupedItems = new Map();

  for (const item of items) {
    const produitId = parseId(item?.produitId);
    const quantite = parsePositiveInteger(item?.quantite);

    if (!produitId || Number.isNaN(quantite)) {
      throw createHttpError(
        400,
        "Chaque item doit contenir un produitId valide et une quantite positive."
      );
    }

    groupedItems.set(produitId, (groupedItems.get(produitId) || 0) + quantite);
  }

  return Array.from(groupedItems.entries()).map(([produitId, quantite]) => ({
    produitId,
    quantite,
  }));
};

const getAllSales = async (req, res) => {
  try {
    const sales = await prisma.vente.findMany({
      include: saleInclude,
      orderBy: {
        dateVente: "desc",
      },
    });

    return res.status(200).json({
      sales: sales.map(formatSaleResponse),
    });
  } catch (error) {
    console.error("Get sales error:", error);
    return res.status(500).json({
      message: "Erreur serveur lors de la recuperation des ventes.",
    });
  }
};

const getSaleById = async (req, res) => {
  try {
    const saleId = parseId(req.params.id);

    if (!saleId) {
      return res.status(400).json({
        message: "ID vente invalide.",
      });
    }

    const sale = await prisma.vente.findUnique({
      where: { id: saleId },
      include: saleInclude,
    });

    if (!sale) {
      return res.status(404).json({
        message: "Vente introuvable.",
      });
    }

    return res.status(200).json({
      sale: formatSaleResponse(sale),
    });
  } catch (error) {
    console.error("Get sale by id error:", error);
    return res.status(500).json({
      message: "Erreur serveur lors de la recuperation de la vente.",
    });
  }
};

const createSale = async (req, res) => {
  try {
    const pointDeVenteId = parseId(req.body.pointDeVenteId);
    const utilisateurId = parseId(req.body.utilisateurId);
    const paymentMethod = normalizePaymentMethod(req.body.paymentMethod);
    const items = normalizeItems(req.body.items);

    if (!pointDeVenteId || !utilisateurId) {
      return res.status(400).json({
        message: "pointDeVenteId et utilisateurId doivent etre valides.",
      });
    }

    if (!paymentMethod) {
      return res.status(400).json({
        message:
          "paymentMethod doit etre l'une des valeurs suivantes : cash, card, transfer, mobile_money, other.",
      });
    }

    if (
      req.user.role === "EMPLOYE" &&
      (req.user.id !== utilisateurId || req.user.pointDeVenteId !== pointDeVenteId)
    ) {
      return res.status(403).json({
        message: "Un employe ne peut creer une vente que pour lui-meme et son point de vente.",
      });
    }

    const sale = await prisma.$transaction(async (tx) => {
      const pointDeVente = await tx.pointDeVente.findUnique({
        where: { id: pointDeVenteId },
        select: {
          id: true,
        },
      });

      if (!pointDeVente) {
        throw createHttpError(404, "Point de vente introuvable.");
      }

      const utilisateur = await tx.utilisateur.findUnique({
        where: { id: utilisateurId },
        select: {
          id: true,
          role: true,
          estActif: true,
          pointDeVenteId: true,
        },
      });

      if (!utilisateur) {
        throw createHttpError(404, "Utilisateur introuvable.");
      }

      if (!utilisateur.estActif) {
        throw createHttpError(400, "Impossible de creer une vente avec un utilisateur inactif.");
      }

      if (utilisateur.role === "EMPLOYE" && utilisateur.pointDeVenteId !== pointDeVenteId) {
        throw createHttpError(
          400,
          "Cet utilisateur n'appartient pas au point de vente selectionne."
        );
      }

      const productIds = items.map((item) => item.produitId);

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
          `Produits introuvables: ${missingProductIds.join(", ")}.`
        );
      }

      const stocks = await tx.stock.findMany({
        where: {
          pointDeVenteId,
          produitId: {
            in: productIds,
          },
        },
        select: {
          id: true,
          produitId: true,
          quantite: true,
        },
      });

      const productMap = new Map(produits.map((produit) => [produit.id, produit]));
      const stockMap = new Map(stocks.map((stock) => [stock.produitId, stock]));

      const lignesData = [];
      let total = new Prisma.Decimal(0);

      for (const item of items) {
        const produit = productMap.get(item.produitId);
        const stock = stockMap.get(item.produitId);

        if (!produit.estActif) {
          throw createHttpError(
            400,
            `Le produit ${produit.nom} est inactif et ne peut pas etre vendu.`
          );
        }

        if (!stock) {
          throw createHttpError(
            400,
            `Aucun stock trouve pour le produit ${produit.nom} dans ce point de vente.`
          );
        }

        if (stock.quantite < item.quantite) {
          throw createHttpError(
            400,
            `Stock insuffisant pour le produit ${produit.nom}.`
          );
        }

        const prixUnitaire = new Prisma.Decimal(produit.prixVente);
        const sousTotal = prixUnitaire.mul(item.quantite);

        total = total.plus(sousTotal);

        lignesData.push({
          produitId: item.produitId,
          quantite: item.quantite,
          prixUnitaire,
          sousTotal,
        });
      }

      const createdSale = await tx.vente.create({
        data: {
          numeroTicket: generateTicketNumber(pointDeVenteId),
          total,
          paymentMethod,
          pointDeVenteId,
          utilisateurId,
          lignes: {
            create: lignesData,
          },
        },
        select: {
          id: true,
        },
      });

      for (const item of items) {
        const produit = productMap.get(item.produitId);

        const updatedStock = await tx.stock.updateMany({
          where: {
            produitId: item.produitId,
            pointDeVenteId,
            quantite: {
              gte: item.quantite,
            },
          },
          data: {
            quantite: {
              decrement: item.quantite,
            },
          },
        });

        if (updatedStock.count === 0) {
          throw createHttpError(
            400,
            `Stock insuffisant pour le produit ${produit.nom}.`
          );
        }
      }

      return tx.vente.findUnique({
        where: { id: createdSale.id },
        include: saleInclude,
      });
    });

    return res.status(201).json({
      message: "Vente creee avec succes.",
      sale: formatSaleResponse(sale),
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({
        message: error.message,
      });
    }

    if (error.code === "P2002") {
      return res.status(409).json({
        message: "Le numero de ticket genere existe deja. Veuillez reessayer.",
      });
    }

    console.error("Create sale error:", error);
    return res.status(500).json({
      message: "Erreur serveur lors de la creation de la vente.",
    });
  }
};

module.exports = {
  getAllSales,
  getSaleById,
  createSale,
};
