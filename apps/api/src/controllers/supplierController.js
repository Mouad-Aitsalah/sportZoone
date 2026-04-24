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

const supplierInclude = {
  produits: {
    select: {
      id: true,
      nom: true,
      codeBarres: true,
      categorie: true,
      prixVente: true,
      estActif: true,
    },
  },
};

const getAllSuppliers = async (req, res) => {
  try {
    const fournisseurs = await prisma.fournisseur.findMany({
      include: supplierInclude,
      orderBy: {
        id: "desc",
      },
    });

    return res.status(200).json({
      suppliers: fournisseurs,
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
    const supplierId = parseId(req.params.id);

    if (!supplierId) {
      return res.status(400).json({
        message: "ID fournisseur invalide.",
      });
    }

    const fournisseur = await prisma.fournisseur.findUnique({
      where: { id: supplierId },
      include: supplierInclude,
    });

    if (!fournisseur) {
      return res.status(404).json({
        message: "Fournisseur introuvable.",
      });
    }

    return res.status(200).json({
      supplier: fournisseur,
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
    const { nom, email, telephone, adresse } = req.body;

    if (!nom || !String(nom).trim()) {
      return res.status(400).json({
        message: "Le nom du fournisseur est obligatoire.",
      });
    }

    const normalizedEmail = normalizeOptionalString(email)?.toLowerCase();
    const normalizedTelephone = normalizeOptionalString(telephone);
    const normalizedAdresse = normalizeOptionalString(adresse);

    if (normalizedEmail) {
      const existingSupplier = await prisma.fournisseur.findUnique({
        where: { email: normalizedEmail },
      });

      if (existingSupplier) {
        return res.status(409).json({
          message: "Un fournisseur avec cet email existe deja.",
        });
      }
    }

    const fournisseur = await prisma.fournisseur.create({
      data: {
        nom: String(nom).trim(),
        email: normalizedEmail || null,
        telephone: normalizedTelephone,
        adresse: normalizedAdresse,
      },
      include: supplierInclude,
    });

    return res.status(201).json({
      message: "Fournisseur cree avec succes.",
      supplier: fournisseur,
    });
  } catch (error) {
    console.error("Create supplier error:", error);
    return res.status(500).json({
      message: "Erreur serveur lors de la creation du fournisseur.",
    });
  }
};

const updateSupplier = async (req, res) => {
  try {
    const supplierId = parseId(req.params.id);

    if (!supplierId) {
      return res.status(400).json({
        message: "ID fournisseur invalide.",
      });
    }

    const existingSupplier = await prisma.fournisseur.findUnique({
      where: { id: supplierId },
    });

    if (!existingSupplier) {
      return res.status(404).json({
        message: "Fournisseur introuvable.",
      });
    }

    const { nom, email, telephone, adresse } = req.body;
    const data = {};

    if (nom !== undefined) {
      const normalizedNom = String(nom).trim();

      if (!normalizedNom) {
        return res.status(400).json({
          message: "Le nom du fournisseur ne peut pas etre vide.",
        });
      }

      data.nom = normalizedNom;
    }

    if (email !== undefined) {
      const normalizedEmail = normalizeOptionalString(email)?.toLowerCase() || null;

      if (normalizedEmail) {
        const supplierWithSameEmail = await prisma.fournisseur.findFirst({
          where: {
            email: normalizedEmail,
            id: {
              not: supplierId,
            },
          },
        });

        if (supplierWithSameEmail) {
          return res.status(409).json({
            message: "Un autre fournisseur avec cet email existe deja.",
          });
        }
      }

      data.email = normalizedEmail;
    }

    if (telephone !== undefined) {
      data.telephone = normalizeOptionalString(telephone);
    }

    if (adresse !== undefined) {
      data.adresse = normalizeOptionalString(adresse);
    }

    const fournisseur = await prisma.fournisseur.update({
      where: { id: supplierId },
      data,
      include: supplierInclude,
    });

    return res.status(200).json({
      message: "Fournisseur mis a jour avec succes.",
      supplier: fournisseur,
    });
  } catch (error) {
    console.error("Update supplier error:", error);
    return res.status(500).json({
      message: "Erreur serveur lors de la mise a jour du fournisseur.",
    });
  }
};

const deleteSupplier = async (req, res) => {
  try {
    const supplierId = parseId(req.params.id);

    if (!supplierId) {
      return res.status(400).json({
        message: "ID fournisseur invalide.",
      });
    }

    const existingSupplier = await prisma.fournisseur.findUnique({
      where: { id: supplierId },
      include: {
        _count: {
          select: {
            produits: true,
          },
        },
      },
    });

    if (!existingSupplier) {
      return res.status(404).json({
        message: "Fournisseur introuvable.",
      });
    }

    if (existingSupplier._count.produits > 0) {
      return res.status(409).json({
        message: "Impossible de supprimer ce fournisseur car il est lie a des produits.",
      });
    }

    await prisma.fournisseur.delete({
      where: { id: supplierId },
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
