const prisma = require("../config/prisma");
const { getOrganisationIdFromUser } = require("../utils/organisationScope");
const { validateSchema } = require("../utils/validation");
const {
  productCategoryCreateSchema,
  productCategoryUpdateSchema,
} = require("../utils/validationSchemas");

const parseId = (value) => {
  const parsedValue = Number(value);
  return Number.isInteger(parsedValue) && parsedValue > 0 ? parsedValue : null;
};

const normalizeRequiredString = (value) => String(value || "").trim();

const parseOptionalBoolean = (value, fallbackValue = true) => {
  if (value === undefined) {
    return fallbackValue;
  }

  if (typeof value === "boolean") {
    return value;
  }

  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  return null;
};

const toApiCategory = (category) => ({
  id: category.id,
  organisationId: category.organisationId,
  code: category.code,
  name: category.nom,
  nom: category.nom,
  fullName: category.nomComplet,
  nomComplet: category.nomComplet,
  active: category.actif,
  actif: category.actif,
  createdAt: category.createdAt,
  updatedAt: category.updatedAt,
});

const getProductCategories = async (req, res) => {
  try {
    const organisationId = getOrganisationIdFromUser(req.user);
    const activeOnly = req.query.activeOnly === "true";

    const categories = await prisma.categorieProduit.findMany({
      where: {
        organisationId,
        ...(activeOnly ? { actif: true } : {}),
      },
      orderBy: [{ actif: "desc" }, { nom: "asc" }, { id: "asc" }],
    });

    return res.status(200).json({
      categories: categories.map(toApiCategory),
    });
  } catch (error) {
    console.error("Get product categories error:", error);
    return res.status(500).json({
      message: "Erreur serveur lors de la recuperation des categories produit.",
    });
  }
};

const createProductCategory = async (req, res) => {
  try {
    const organisationId = getOrganisationIdFromUser(req.user);
    const { code, nom, nomComplet, actif } = validateSchema(
      productCategoryCreateSchema,
      req.body
    );

    const normalizedCode = normalizeRequiredString(code).toUpperCase();
    const normalizedName = normalizeRequiredString(nom);
    const normalizedFullName = normalizeRequiredString(nomComplet);
    const parsedActive = parseOptionalBoolean(actif, true);

    if (parsedActive === null) {
      return res.status(400).json({
        message: "actif doit etre true ou false.",
      });
    }

    const existingCategory = await prisma.categorieProduit.findFirst({
      where: {
        organisationId,
        OR: [{ code: normalizedCode }, { nom: normalizedName }],
      },
    });

    if (existingCategory) {
      return res.status(409).json({
        message: "Une categorie produit avec ce code ou ce nom existe deja.",
      });
    }

    const category = await prisma.categorieProduit.create({
      data: {
        organisationId,
        code: normalizedCode,
        nom: normalizedName,
        nomComplet: normalizedFullName,
        actif: parsedActive,
      },
    });

    return res.status(201).json({
      message: "Categorie produit creee avec succes.",
      category: toApiCategory(category),
    });
  } catch (error) {
    console.error("Create product category error:", error);
    return res.status(500).json({
      message: "Erreur serveur lors de la creation de la categorie produit.",
    });
  }
};

const updateProductCategory = async (req, res) => {
  try {
    const organisationId = getOrganisationIdFromUser(req.user);
    const categoryId = parseId(req.params.id);

    if (!categoryId) {
      return res.status(400).json({
        message: "ID categorie invalide.",
      });
    }

    const existingCategory = await prisma.categorieProduit.findFirst({
      where: {
        id: categoryId,
        organisationId,
      },
    });

    if (!existingCategory) {
      return res.status(404).json({
        message: "Categorie produit introuvable.",
      });
    }

    const { code, nom, nomComplet, actif } = validateSchema(
      productCategoryUpdateSchema,
      req.body
    );

    const data = {};

    if (code !== undefined) {
      data.code = normalizeRequiredString(code).toUpperCase();
    }

    if (nom !== undefined) {
      data.nom = normalizeRequiredString(nom);
    }

    if (nomComplet !== undefined) {
      data.nomComplet = normalizeRequiredString(nomComplet);
    }

    if (actif !== undefined) {
      const parsedActive = parseOptionalBoolean(actif);

      if (parsedActive === null) {
        return res.status(400).json({
          message: "actif doit etre true ou false.",
        });
      }

      data.actif = parsedActive;
    }

    if (data.code || data.nom) {
      const duplicateCategory = await prisma.categorieProduit.findFirst({
        where: {
          organisationId,
          id: {
            not: categoryId,
          },
          OR: [
            data.code ? { code: data.code } : undefined,
            data.nom ? { nom: data.nom } : undefined,
          ].filter(Boolean),
        },
      });

      if (duplicateCategory) {
        return res.status(409).json({
          message: "Une categorie produit avec ce code ou ce nom existe deja.",
        });
      }
    }

    const category = await prisma.$transaction(async (tx) => {
      const updatedCategory = await tx.categorieProduit.update({
        where: {
          id: categoryId,
        },
        data,
      });

      if (data.nom) {
        await tx.produit.updateMany({
          where: {
            organisationId,
            categorieId: categoryId,
          },
          data: {
            categorie: data.nom,
          },
        });
      }

      return updatedCategory;
    });

    return res.status(200).json({
      message: "Categorie produit mise a jour avec succes.",
      category: toApiCategory(category),
    });
  } catch (error) {
    console.error("Update product category error:", error);
    return res.status(500).json({
      message: "Erreur serveur lors de la mise a jour de la categorie produit.",
    });
  }
};

const deleteProductCategory = async (req, res) => {
  try {
    const organisationId = getOrganisationIdFromUser(req.user);
    const categoryId = parseId(req.params.id);

    if (!categoryId) {
      return res.status(400).json({
        message: "ID categorie invalide.",
      });
    }

    const category = await prisma.categorieProduit.findFirst({
      where: {
        id: categoryId,
        organisationId,
      },
      include: {
        _count: {
          select: {
            produits: true,
          },
        },
      },
    });

    if (!category) {
      return res.status(404).json({
        message: "Categorie produit introuvable.",
      });
    }

    if (category.code === "AUTRE") {
      return res.status(400).json({
        message: "La categorie Autre ne peut pas etre supprimee.",
      });
    }

    const updatedCategory = await prisma.categorieProduit.update({
      where: {
        id: categoryId,
      },
      data: {
        actif: false,
      },
    });

    return res.status(200).json({
      message:
        category._count.produits > 0
          ? "Categorie produit desactivee car elle est encore utilisee."
          : "Categorie produit desactivee avec succes.",
      category: toApiCategory(updatedCategory),
    });
  } catch (error) {
    console.error("Delete product category error:", error);
    return res.status(500).json({
      message: "Erreur serveur lors de la desactivation de la categorie produit.",
    });
  }
};

module.exports = {
  getProductCategories,
  createProductCategory,
  updateProductCategory,
  deleteProductCategory,
};
