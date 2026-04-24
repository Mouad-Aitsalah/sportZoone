const prisma = require("../config/prisma");

const parseId = (value) => {
  const parsedValue = Number(value);
  return Number.isInteger(parsedValue) && parsedValue > 0 ? parsedValue : null;
};

const parseStockQuantity = (value, { min }) => {
  if (value === undefined || value === null) {
    return NaN;
  }

  if (typeof value === "string" && value.trim() === "") {
    return NaN;
  }

  const parsedValue = Number(value);
  return Number.isInteger(parsedValue) && parsedValue >= min ? parsedValue : NaN;
};

const parsePositiveInteger = (value) => parseStockQuantity(value, { min: 1 });

const parseNonNegativeInteger = (value) => {
  return parseStockQuantity(value, { min: 0 });
};

const stockInclude = {
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
  pointDeVente: {
    select: {
      id: true,
      nom: true,
      adresse: true,
      telephone: true,
    },
  },
};

const getEmployeePointDeVenteId = (user) => {
  if (user.role !== "EMPLOYE") {
    return null;
  }

  return user.pointDeVenteId || null;
};

const validateProductAndPointDeVente = async (produitId, pointDeVenteId) => {
  const [produit, pointDeVente] = await Promise.all([
    prisma.produit.findUnique({
      where: { id: produitId },
      select: { id: true, estActif: true },
    }),
    prisma.pointDeVente.findUnique({
      where: { id: pointDeVenteId },
      select: { id: true },
    }),
  ]);

  if (!produit) {
    return {
      status: 404,
      message: "Produit introuvable.",
    };
  }

  if (!produit.estActif) {
    return {
      status: 400,
      message: "Impossible de gerer le stock d'un produit inactif.",
    };
  }

  if (!pointDeVente) {
    return {
      status: 404,
      message: "Point de vente introuvable.",
    };
  }

  return null;
};

const getAllStocks = async (req, res) => {
  try {
    const employeePointDeVenteId = getEmployeePointDeVenteId(req.user);

    if (req.user.role === "EMPLOYE" && !employeePointDeVenteId) {
      return res.status(403).json({
        message: "Acces refuse. Aucun point de vente n'est associe a cet employe.",
      });
    }

    const stocks = await prisma.stock.findMany({
      where:
        req.user.role === "ADMIN"
          ? {}
          : {
              pointDeVenteId: employeePointDeVenteId,
            },
      include: stockInclude,
      orderBy: {
        updatedAt: "desc",
      },
    });

    return res.status(200).json({
      stocks,
    });
  } catch (error) {
    console.error("Get stocks error:", error);
    return res.status(500).json({
      message: "Erreur serveur lors de la recuperation des stocks.",
    });
  }
};

const getStockById = async (req, res) => {
  try {
    const stockId = parseId(req.params.id);

    if (!stockId) {
      return res.status(400).json({
        message: "ID stock invalide.",
      });
    }

    const stock = await prisma.stock.findUnique({
      where: { id: stockId },
      include: stockInclude,
    });

    if (!stock) {
      return res.status(404).json({
        message: "Stock introuvable.",
      });
    }

    const employeePointDeVenteId = getEmployeePointDeVenteId(req.user);

    if (req.user.role === "EMPLOYE" && !employeePointDeVenteId) {
      return res.status(403).json({
        message: "Acces refuse. Aucun point de vente n'est associe a cet employe.",
      });
    }

    if (
      req.user.role === "EMPLOYE" &&
      stock.pointDeVenteId !== employeePointDeVenteId
    ) {
      return res.status(403).json({
        message: "Acces refuse. Ce stock appartient a un autre point de vente.",
      });
    }

    return res.status(200).json({
      stock,
    });
  } catch (error) {
    console.error("Get stock by id error:", error);
    return res.status(500).json({
      message: "Erreur serveur lors de la recuperation du stock.",
    });
  }
};

const stockEntry = async (req, res) => {
  try {
    const produitId = parseId(req.body.produitId);
    const pointDeVenteId = parseId(req.body.pointDeVenteId);
    const quantite = parsePositiveInteger(req.body.quantite);

    if (!produitId || !pointDeVenteId || Number.isNaN(quantite)) {
      return res.status(400).json({
        message: "produitId, pointDeVenteId et quantite doivent etre valides.",
      });
    }

    const relationError = await validateProductAndPointDeVente(produitId, pointDeVenteId);

    if (relationError) {
      return res.status(relationError.status).json({
        message: relationError.message,
      });
    }

    const stock = await prisma.stock.upsert({
      where: {
        produitId_pointDeVenteId: {
          produitId,
          pointDeVenteId,
        },
      },
      update: {
        quantite: {
          increment: quantite,
        },
      },
      create: {
        produitId,
        pointDeVenteId,
        quantite,
      },
      include: stockInclude,
    });

    return res.status(200).json({
      message: "Entree de stock enregistree avec succes.",
      stock,
    });
  } catch (error) {
    console.error("Stock entry error:", error);
    return res.status(500).json({
      message: "Erreur serveur lors de l'entree de stock.",
    });
  }
};

const stockExit = async (req, res) => {
  try {
    const produitId = parseId(req.body.produitId);
    const pointDeVenteId = parseId(req.body.pointDeVenteId);
    const quantite = parsePositiveInteger(req.body.quantite);

    if (!produitId || !pointDeVenteId || Number.isNaN(quantite)) {
      return res.status(400).json({
        message: "produitId, pointDeVenteId et quantite doivent etre valides.",
      });
    }

    const relationError = await validateProductAndPointDeVente(produitId, pointDeVenteId);

    if (relationError) {
      return res.status(relationError.status).json({
        message: relationError.message,
      });
    }

    const stock = await prisma.$transaction(async (tx) => {
      const existingStock = await tx.stock.findUnique({
        where: {
          produitId_pointDeVenteId: {
            produitId,
            pointDeVenteId,
          },
        },
      });

      if (!existingStock) {
        return { error: "Aucun stock trouve pour ce produit dans ce point de vente." };
      }

      if (existingStock.quantite < quantite) {
        return { error: "Stock insuffisant. La quantite ne peut pas devenir negative." };
      }

      return tx.stock.update({
        where: { id: existingStock.id },
        data: {
          quantite: {
            decrement: quantite,
          },
        },
        include: stockInclude,
      });
    });

    if (stock.error) {
      return res.status(400).json({
        message: stock.error,
      });
    }

    return res.status(200).json({
      message: "Sortie de stock enregistree avec succes.",
      stock,
    });
  } catch (error) {
    console.error("Stock exit error:", error);
    return res.status(500).json({
      message: "Erreur serveur lors de la sortie de stock.",
    });
  }
};

const updateStock = async (req, res) => {
  try {
    const stockId = parseId(req.params.id);
    const quantite = parseNonNegativeInteger(req.body.quantite);

    if (!stockId) {
      return res.status(400).json({
        message: "ID stock invalide.",
      });
    }

    if (Number.isNaN(quantite)) {
      return res.status(400).json({
        message: "quantite doit etre un entier positif ou egal a 0.",
      });
    }

    const existingStock = await prisma.stock.findUnique({
      where: { id: stockId },
    });

    if (!existingStock) {
      return res.status(404).json({
        message: "Stock introuvable.",
      });
    }

    const stock = await prisma.stock.update({
      where: { id: stockId },
      data: {
        quantite,
      },
      include: stockInclude,
    });

    return res.status(200).json({
      message: "Stock mis a jour avec succes.",
      stock,
    });
  } catch (error) {
    console.error("Update stock error:", error);
    return res.status(500).json({
      message: "Erreur serveur lors de la mise a jour du stock.",
    });
  }
};

module.exports = {
  getAllStocks,
  getStockById,
  stockEntry,
  stockExit,
  updateStock,
};
