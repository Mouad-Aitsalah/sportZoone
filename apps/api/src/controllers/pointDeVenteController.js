const prisma = require("../config/prisma");
const { getOrganisationIdFromUser } = require("../utils/organisationScope");

const parseId = (value) => {
  const parsedValue = Number(value);
  return Number.isInteger(parsedValue) && parsedValue > 0 ? parsedValue : null;
};

const buildCashRegisterCode = (pointDeVenteName, pointDeVenteId) =>
  `${String(pointDeVenteName || "STORE")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 18) || "STORE"}-${pointDeVenteId}-CAISSE-1`;

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
  caisses: {
    select: {
      id: true,
      nom: true,
      code: true,
      estActive: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: {
      id: "asc",
    },
  },
  _count: {
    select: {
      utilisateurs: true,
      caisses: true,
      stocks: true,
      ventes: true,
    },
  },
};

const getAllPointsDeVente = async (req, res) => {
  try {
    const organisationId = getOrganisationIdFromUser(req.user);
    const pointsDeVente = await prisma.pointDeVente.findMany({
      where: {
        organisationId,
      },
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
    const organisationId = getOrganisationIdFromUser(req.user);
    const pointDeVenteId = parseId(req.params.id);

    if (!pointDeVenteId) {
      return res.status(400).json({
        message: "ID point de vente invalide.",
      });
    }

    const pointDeVente = await prisma.pointDeVente.findFirst({
      where: {
        organisationId,
        id: pointDeVenteId,
      },
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
    const organisationId = getOrganisationIdFromUser(req.user);
    const { nom, adresse, telephone } = req.body;
    const normalizedNom = String(nom || "").trim();

    if (!normalizedNom) {
      return res.status(400).json({
        message: "Le nom du point de vente est obligatoire.",
      });
    }

    const pointDeVente = await prisma.$transaction(async (tx) => {
      const createdPointDeVente = await tx.pointDeVente.create({
        data: {
          organisationId,
          nom: normalizedNom,
          adresse: normalizeOptionalString(adresse),
          telephone: normalizeOptionalString(telephone),
        },
      });

      await tx.caisse.create({
        data: {
          organisationId,
          nom: "Caisse 1",
          code: buildCashRegisterCode(normalizedNom, createdPointDeVente.id),
          pointDeVenteId: createdPointDeVente.id,
          estActive: true,
        },
      });

      return tx.pointDeVente.findUnique({
        where: {
          id: createdPointDeVente.id,
        },
        include: pointDeVenteInclude,
      });
    });

    return res.status(201).json({
      message: "Point de vente et caisse par defaut crees avec succes.",
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
    const organisationId = getOrganisationIdFromUser(req.user);
    const pointDeVenteId = parseId(req.params.id);

    if (!pointDeVenteId) {
      return res.status(400).json({
        message: "ID point de vente invalide.",
      });
    }

    const existingPointDeVente = await prisma.pointDeVente.findFirst({
      where: {
        organisationId,
        id: pointDeVenteId,
      },
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
    const organisationId = getOrganisationIdFromUser(req.user);
    const pointDeVenteId = parseId(req.params.id);

    if (!pointDeVenteId) {
      return res.status(400).json({
        message: "ID point de vente invalide.",
      });
    }

    const existingPointDeVente = await prisma.pointDeVente.findFirst({
      where: {
        organisationId,
        id: pointDeVenteId,
      },
      include: {
        _count: {
          select: {
            utilisateurs: true,
            caisses: true,
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
      existingPointDeVente._count.caisses > 0 ||
      existingPointDeVente._count.stocks > 0 ||
      existingPointDeVente._count.ventes > 0
    ) {
      return res.status(409).json({
        message:
          "Impossible de supprimer ce point de vente car il est lie a des utilisateurs, caisses, stocks ou ventes.",
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
