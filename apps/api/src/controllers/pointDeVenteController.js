const prisma = require("../config/prisma");

const parseId = (value) => {
  const parsedValue = Number(value);
  return Number.isInteger(parsedValue) && parsedValue > 0 ? parsedValue : null;
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

const pointDeVenteInclude = {
  utilisateurs: {
    select: {
      id: true,
      nom: true,
      email: true,
      role: true,
      estActif: true,
      createdAt: true,
      updatedAt: true,
    },
  },
  _count: {
    select: {
      utilisateurs: true,
      stocks: true,
      ventes: true,
    },
  },
};

const getAllPointsDeVente = async (req, res) => {
  try {
    const pointsDeVente = await prisma.pointDeVente.findMany({
      include: pointDeVenteInclude,
      orderBy: {
        id: "desc",
      },
    });

    return res.status(200).json({
      pointsDeVente,
    });
  } catch (error) {
    console.error("Get points de vente error:", error);
    return res.status(500).json({
      message: "Erreur serveur lors de la recuperation des points de vente.",
    });
  }
};

const getPointDeVenteById = async (req, res) => {
  try {
    const pointDeVenteId = parseId(req.params.id);

    if (!pointDeVenteId) {
      return res.status(400).json({
        message: "ID point de vente invalide.",
      });
    }

    const pointDeVente = await prisma.pointDeVente.findUnique({
      where: { id: pointDeVenteId },
      include: pointDeVenteInclude,
    });

    if (!pointDeVente) {
      return res.status(404).json({
        message: "Point de vente introuvable.",
      });
    }

    return res.status(200).json({
      pointDeVente,
    });
  } catch (error) {
    console.error("Get point de vente by id error:", error);
    return res.status(500).json({
      message: "Erreur serveur lors de la recuperation du point de vente.",
    });
  }
};

const createPointDeVente = async (req, res) => {
  try {
    const { nom, adresse, telephone } = req.body;

    if (!nom || !String(nom).trim()) {
      return res.status(400).json({
        message: "Le nom du point de vente est obligatoire.",
      });
    }

    const pointDeVente = await prisma.pointDeVente.create({
      data: {
        nom: String(nom).trim(),
        adresse: normalizeOptionalString(adresse),
        telephone: normalizeOptionalString(telephone),
      },
      include: pointDeVenteInclude,
    });

    return res.status(201).json({
      message: "Point de vente cree avec succes.",
      pointDeVente,
    });
  } catch (error) {
    console.error("Create point de vente error:", error);
    return res.status(500).json({
      message: "Erreur serveur lors de la creation du point de vente.",
    });
  }
};

const updatePointDeVente = async (req, res) => {
  try {
    const pointDeVenteId = parseId(req.params.id);

    if (!pointDeVenteId) {
      return res.status(400).json({
        message: "ID point de vente invalide.",
      });
    }

    const existingPointDeVente = await prisma.pointDeVente.findUnique({
      where: { id: pointDeVenteId },
    });

    if (!existingPointDeVente) {
      return res.status(404).json({
        message: "Point de vente introuvable.",
      });
    }

    const { nom, adresse, telephone } = req.body;
    const data = {};

    if (nom !== undefined) {
      const normalizedNom = String(nom).trim();

      if (!normalizedNom) {
        return res.status(400).json({
          message: "Le nom du point de vente ne peut pas etre vide.",
        });
      }

      data.nom = normalizedNom;
    }

    if (adresse !== undefined) {
      data.adresse = normalizeOptionalString(adresse);
    }

    if (telephone !== undefined) {
      data.telephone = normalizeOptionalString(telephone);
    }

    const pointDeVente = await prisma.pointDeVente.update({
      where: { id: pointDeVenteId },
      data,
      include: pointDeVenteInclude,
    });

    return res.status(200).json({
      message: "Point de vente mis a jour avec succes.",
      pointDeVente,
    });
  } catch (error) {
    console.error("Update point de vente error:", error);
    return res.status(500).json({
      message: "Erreur serveur lors de la mise a jour du point de vente.",
    });
  }
};

const deletePointDeVente = async (req, res) => {
  try {
    const pointDeVenteId = parseId(req.params.id);

    if (!pointDeVenteId) {
      return res.status(400).json({
        message: "ID point de vente invalide.",
      });
    }

    const existingPointDeVente = await prisma.pointDeVente.findUnique({
      where: { id: pointDeVenteId },
      include: {
        _count: {
          select: {
            utilisateurs: true,
            stocks: true,
            ventes: true,
          },
        },
      },
    });

    if (!existingPointDeVente) {
      return res.status(404).json({
        message: "Point de vente introuvable.",
      });
    }

    if (
      existingPointDeVente._count.utilisateurs > 0 ||
      existingPointDeVente._count.stocks > 0 ||
      existingPointDeVente._count.ventes > 0
    ) {
      return res.status(409).json({
        message:
          "Impossible de supprimer ce point de vente car il est lie a des utilisateurs, stocks ou ventes.",
      });
    }

    await prisma.pointDeVente.delete({
      where: { id: pointDeVenteId },
    });

    return res.status(200).json({
      message: "Point de vente supprime avec succes.",
    });
  } catch (error) {
    console.error("Delete point de vente error:", error);
    return res.status(500).json({
      message: "Erreur serveur lors de la suppression du point de vente.",
    });
  }
};

module.exports = {
  getAllPointsDeVente,
  getPointDeVenteById,
  createPointDeVente,
  updatePointDeVente,
  deletePointDeVente,
};
