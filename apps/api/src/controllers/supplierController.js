const prisma = require("../config/prisma");
const { validateSchema } = require("../utils/validation");
const { createHttpError } = require("../utils/httpError");
const { getOrganisationIdFromUser } = require("../utils/organisationScope");
const {
  supplierCreateSchema,
  supplierUpdateSchema,
} = require("../utils/validationSchemas");
const {
  COMPTE_TYPES,
  compteInclude,
  normalizeOptionalString,
  buildNextNumeroCompte,
  toApiSupplierFromCompte,
  resolveSupplierCompte,
} = require("../services/compteService");

const parseId = (value) => {
  const parsedValue = Number(value);
  return Number.isInteger(parsedValue) && parsedValue > 0 ? parsedValue : null;
};

const getAllSuppliers = async (req, res) => {
  try {
    const organisationId = getOrganisationIdFromUser(req.user);
    const fournisseurs = await prisma.compte.findMany({
      where: {
        organisationId,
        type: COMPTE_TYPES.FOURNISSEUR,
      },
      include: compteInclude,
      orderBy: {
        id: "desc",
      },
    });

    return res.status(200).json({
      suppliers: fournisseurs.map(toApiSupplierFromCompte),
    });
  } catch (error) {
    console.error("Get suppliers error:", error);
    return res.status(500).json({
      message: "Erreur serveur lors de la recuperation des fournisseurs.",
    });
  }
};

const getSupplierById = async (req, res) => {
  try {
    const organisationId = getOrganisationIdFromUser(req.user);
    const supplierId = parseId(req.params.id);

    if (!supplierId) {
      return res.status(400).json({
        message: "ID fournisseur invalide.",
      });
    }

    const fournisseur = await prisma.compte.findFirst({
      where: {
        organisationId,
        id: supplierId,
        type: COMPTE_TYPES.FOURNISSEUR,
      },
      include: compteInclude,
    });

    if (!fournisseur) {
      return res.status(404).json({
        message: "Fournisseur introuvable.",
      });
    }

    return res.status(200).json({
      supplier: toApiSupplierFromCompte(fournisseur),
    });
  } catch (error) {
    console.error("Get supplier by id error:", error);
    return res.status(500).json({
      message: "Erreur serveur lors de la recuperation du fournisseur.",
    });
  }
};

const createSupplier = async (req, res) => {
  try {
    const organisationId = getOrganisationIdFromUser(req.user);
    const { nom, email, telephone, adresse } = validateSchema(
      supplierCreateSchema,
      req.body
    );

    const normalizedEmail = normalizeOptionalString(email)?.toLowerCase();
    const normalizedTelephone = normalizeOptionalString(telephone);
    const normalizedAdresse = normalizeOptionalString(adresse);

    const fournisseur = await prisma.$transaction(async (tx) => {
      const numeroCompte = await buildNextNumeroCompte(
        tx,
        organisationId,
        COMPTE_TYPES.FOURNISSEUR
      );

      const createdSupplier = await tx.fournisseur.create({
        data: {
          organisationId,
          nom: String(nom).trim(),
          email: normalizedEmail || null,
          telephone: normalizedTelephone,
          adresse: normalizedAdresse,
        },
      });

      return tx.compte.create({
        data: {
          organisationId,
          numeroCompte,
          type: COMPTE_TYPES.FOURNISSEUR,
          nom: String(nom).trim(),
          email: normalizedEmail || null,
          telephone: normalizedTelephone,
          adresse: normalizedAdresse,
          actif: true,
          fournisseurSourceId: createdSupplier.id,
        },
        include: compteInclude,
      });
    });

    return res.status(201).json({
      message: "Fournisseur cree avec succes.",
      supplier: toApiSupplierFromCompte(fournisseur),
    });
  } catch (error) {
    if (error?.status) {
      return res.status(error.status).json({
        message: error.message,
      });
    }

    console.error("Create supplier error:", error);
    return res.status(500).json({
      message: "Erreur serveur lors de la creation du fournisseur.",
    });
  }
};

const updateSupplier = async (req, res) => {
  try {
    const organisationId = getOrganisationIdFromUser(req.user);
    const supplierId = parseId(req.params.id);

    if (!supplierId) {
      return res.status(400).json({
        message: "ID fournisseur invalide.",
      });
    }

    const existingSupplier = await resolveSupplierCompte(prisma, organisationId, supplierId);
    const { nom, email, telephone, adresse } = validateSchema(
      supplierUpdateSchema,
      req.body
    );

    const data = {};
    if (nom !== undefined) {
      data.nom = String(nom).trim();
    }
    if (email !== undefined) {
      data.email = normalizeOptionalString(email)?.toLowerCase() || null;
    }
    if (telephone !== undefined) {
      data.telephone = normalizeOptionalString(telephone) || null;
    }
    if (adresse !== undefined) {
      data.adresse = normalizeOptionalString(adresse) || null;
    }

    const fournisseur = await prisma.$transaction(async (tx) => {
      await tx.fournisseur.update({
        where: {
          id: existingSupplier.fournisseurSource.id,
        },
        data,
      });

      return tx.compte.update({
        where: {
          id: existingSupplier.id,
        },
        data,
        include: compteInclude,
      });
    });

    return res.status(200).json({
      message: "Fournisseur mis a jour avec succes.",
      supplier: toApiSupplierFromCompte(fournisseur),
    });
  } catch (error) {
    if (error?.status) {
      return res.status(error.status).json({
        message: error.message,
      });
    }

    console.error("Update supplier error:", error);
    return res.status(500).json({
      message: "Erreur serveur lors de la mise a jour du fournisseur.",
    });
  }
};

const deleteSupplier = async (req, res) => {
  try {
    const organisationId = getOrganisationIdFromUser(req.user);
    const supplierId = parseId(req.params.id);

    if (!supplierId) {
      return res.status(400).json({
        message: "ID fournisseur invalide.",
      });
    }

    const existingSupplier = await resolveSupplierCompte(prisma, organisationId, supplierId);

    if ((existingSupplier.fournisseurSource?._count?.produits || 0) > 0) {
      return res.status(409).json({
        message: "Impossible de supprimer ce fournisseur car il est lie a des produits.",
      });
    }

    if ((existingSupplier.fournisseurSource?._count?.achats || 0) > 0) {
      return res.status(409).json({
        message: "Impossible de supprimer ce fournisseur car il est deja lie a des achats.",
      });
    }

    await prisma.$transaction(async (tx) => {
      await tx.compte.delete({
        where: {
          id: existingSupplier.id,
        },
      });

      await tx.fournisseur.delete({
        where: {
          id: existingSupplier.fournisseurSource.id,
        },
      });
    });

    return res.status(200).json({
      message: "Fournisseur supprime avec succes.",
    });
  } catch (error) {
    console.error("Delete supplier error:", error);
    return res.status(500).json({
      message: "Erreur serveur lors de la suppression du fournisseur.",
    });
  }
};

module.exports = {
  getAllSuppliers,
  getSupplierById,
  createSupplier,
  updateSupplier,
  deleteSupplier,
};
