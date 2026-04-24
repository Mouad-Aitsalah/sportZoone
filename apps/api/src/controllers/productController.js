const prisma = require("../config/prisma");

const parseId = (value) => {
  const parsedValue = Number(value);
  return Number.isInteger(parsedValue) && parsedValue > 0 ? parsedValue : null;
};

const normalizeRequiredString = (value) => String(value || "").trim();

const parseOptionalPositiveInteger = (value) => {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value === "string" && value.trim() === "") {
    return null;
  }

  const parsedValue = Number(value);
  return Number.isInteger(parsedValue) && parsedValue > 0 ? parsedValue : NaN;
};

const parseOptionalNonNegativeInteger = (value) => {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value === "string" && value.trim() === "") {
    return null;
  }

  const parsedValue = Number(value);
  return Number.isInteger(parsedValue) && parsedValue >= 0 ? parsedValue : NaN;
};

const parseRequiredNumber = (value) => {
  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) ? parsedValue : NaN;
};

const parseOptionalBoolean = (value, defaultValue = true) => {
  if (value === undefined) {
    return defaultValue;
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

const productInclude = {
  fournisseur: {
    select: {
      id: true,
      nom: true,
      email: true,
      telephone: true,
    },
  },
};

const getAllProducts = async (req, res) => {
  try {
    const produits = await prisma.produit.findMany({
      include: productInclude,
      orderBy: {
        id: "desc",
      },
    });

    return res.status(200).json({
      products: produits,
    });
  } catch (error) {
    console.error("Get products error:", error);
    return res.status(500).json({
      message: "Erreur serveur lors de la recuperation des produits.",
    });
  }
};

const getProductById = async (req, res) => {
  try {
    const productId = parseId(req.params.id);

    if (!productId) {
      return res.status(400).json({
        message: "ID produit invalide.",
      });
    }

    const produit = await prisma.produit.findUnique({
      where: { id: productId },
      include: productInclude,
    });

    if (!produit) {
      return res.status(404).json({
        message: "Produit introuvable.",
      });
    }

    return res.status(200).json({
      product: produit,
    });
  } catch (error) {
    console.error("Get product by id error:", error);
    return res.status(500).json({
      message: "Erreur serveur lors de la recuperation du produit.",
    });
  }
};

const createProduct = async (req, res) => {
  try {
    const {
      codeBarres,
      nom,
      categorie,
      prixAchat,
      prixVente,
      seuilMinimum,
      estActif,
      fournisseurId,
    } = req.body;
    const normalizedCodeBarres = normalizeRequiredString(codeBarres);
    const normalizedNom = normalizeRequiredString(nom);
    const normalizedCategorie = normalizeRequiredString(categorie);

    if (
      !normalizedCodeBarres ||
      !normalizedNom ||
      !normalizedCategorie ||
      prixAchat === undefined ||
      prixVente === undefined
    ) {
      return res.status(400).json({
        message:
          "codeBarres, nom, categorie, prixAchat et prixVente sont obligatoires.",
      });
    }

    const parsedPrixAchat = parseRequiredNumber(prixAchat);
    const parsedPrixVente = parseRequiredNumber(prixVente);
    const parsedSeuilMinimum =
      seuilMinimum === undefined ? 0 : parseOptionalNonNegativeInteger(seuilMinimum);
    const parsedEstActif = parseOptionalBoolean(estActif, true);
    const parsedFournisseurId = parseOptionalPositiveInteger(fournisseurId);

    if (Number.isNaN(parsedPrixAchat) || Number.isNaN(parsedPrixVente)) {
      return res.status(400).json({
        message: "prixAchat et prixVente doivent etre des nombres valides.",
      });
    }

    if (
      Number.isNaN(parsedSeuilMinimum) ||
      parsedSeuilMinimum === null ||
      parsedSeuilMinimum < 0
    ) {
      return res.status(400).json({
        message: "seuilMinimum doit etre un entier positif ou egal a 0.",
      });
    }

    if (parsedEstActif === null) {
      return res.status(400).json({
        message: "estActif doit etre true ou false.",
      });
    }

    if (Number.isNaN(parsedFournisseurId)) {
      return res.status(400).json({
        message: "fournisseurId doit etre un entier valide.",
      });
    }

    const existingProduct = await prisma.produit.findUnique({
      where: { codeBarres: normalizedCodeBarres },
    });

    if (existingProduct) {
      return res.status(409).json({
        message: "Un produit avec ce code-barres existe deja.",
      });
    }

    if (parsedFournisseurId) {
      const fournisseur = await prisma.fournisseur.findUnique({
        where: { id: parsedFournisseurId },
      });

      if (!fournisseur) {
        return res.status(404).json({
          message: "Fournisseur introuvable.",
        });
      }
    }

    const produit = await prisma.produit.create({
      data: {
        codeBarres: normalizedCodeBarres,
        nom: normalizedNom,
        categorie: normalizedCategorie,
        prixAchat: parsedPrixAchat,
        prixVente: parsedPrixVente,
        seuilMinimum: parsedSeuilMinimum,
        estActif: parsedEstActif,
        fournisseurId: parsedFournisseurId,
      },
      include: productInclude,
    });

    return res.status(201).json({
      message: "Produit cree avec succes.",
      product: produit,
    });
  } catch (error) {
    console.error("Create product error:", error);
    return res.status(500).json({
      message: "Erreur serveur lors de la creation du produit.",
    });
  }
};

const updateProduct = async (req, res) => {
  try {
    const productId = parseId(req.params.id);

    if (!productId) {
      return res.status(400).json({
        message: "ID produit invalide.",
      });
    }

    const existingProduct = await prisma.produit.findUnique({
      where: { id: productId },
    });

    if (!existingProduct) {
      return res.status(404).json({
        message: "Produit introuvable.",
      });
    }

    const {
      codeBarres,
      nom,
      categorie,
      prixAchat,
      prixVente,
      seuilMinimum,
      estActif,
      fournisseurId,
    } = req.body;

    const data = {};

    if (codeBarres !== undefined) {
      const normalizedCodeBarres = normalizeRequiredString(codeBarres);

      if (!normalizedCodeBarres) {
        return res.status(400).json({
          message: "codeBarres ne peut pas etre vide.",
        });
      }

      data.codeBarres = normalizedCodeBarres;
    }

    if (nom !== undefined) {
      const normalizedNom = normalizeRequiredString(nom);

      if (!normalizedNom) {
        return res.status(400).json({
          message: "nom ne peut pas etre vide.",
        });
      }

      data.nom = normalizedNom;
    }

    if (categorie !== undefined) {
      const normalizedCategorie = normalizeRequiredString(categorie);

      if (!normalizedCategorie) {
        return res.status(400).json({
          message: "categorie ne peut pas etre vide.",
        });
      }

      data.categorie = normalizedCategorie;
    }

    if (prixAchat !== undefined) {
      const parsedPrixAchat = parseRequiredNumber(prixAchat);

      if (Number.isNaN(parsedPrixAchat)) {
        return res.status(400).json({
          message: "prixAchat doit etre un nombre valide.",
        });
      }

      data.prixAchat = parsedPrixAchat;
    }

    if (prixVente !== undefined) {
      const parsedPrixVente = parseRequiredNumber(prixVente);

      if (Number.isNaN(parsedPrixVente)) {
        return res.status(400).json({
          message: "prixVente doit etre un nombre valide.",
        });
      }

      data.prixVente = parsedPrixVente;
    }

    if (seuilMinimum !== undefined) {
      const parsedSeuilMinimum = parseOptionalNonNegativeInteger(seuilMinimum);

      if (
        Number.isNaN(parsedSeuilMinimum) ||
        parsedSeuilMinimum === null ||
        parsedSeuilMinimum < 0
      ) {
        return res.status(400).json({
          message: "seuilMinimum doit etre un entier positif ou egal a 0.",
        });
      }

      data.seuilMinimum = parsedSeuilMinimum;
    }

    if (estActif !== undefined) {
      const parsedEstActif = parseOptionalBoolean(estActif);

      if (parsedEstActif === null) {
        return res.status(400).json({
          message: "estActif doit etre true ou false.",
        });
      }

      data.estActif = parsedEstActif;
    }

    if (fournisseurId !== undefined) {
      const parsedFournisseurId = parseOptionalPositiveInteger(fournisseurId);

      if (Number.isNaN(parsedFournisseurId)) {
        return res.status(400).json({
          message: "fournisseurId doit etre un entier valide.",
        });
      }

      if (parsedFournisseurId) {
        const fournisseur = await prisma.fournisseur.findUnique({
          where: { id: parsedFournisseurId },
        });

        if (!fournisseur) {
          return res.status(404).json({
            message: "Fournisseur introuvable.",
          });
        }
      }

      data.fournisseurId = parsedFournisseurId;
    }

    if (data.codeBarres) {
      const productWithSameBarcode = await prisma.produit.findFirst({
        where: {
          codeBarres: data.codeBarres,
          id: {
            not: productId,
          },
        },
      });

      if (productWithSameBarcode) {
        return res.status(409).json({
          message: "Un autre produit avec ce code-barres existe deja.",
        });
      }
    }

    const produit = await prisma.produit.update({
      where: { id: productId },
      data,
      include: productInclude,
    });

    return res.status(200).json({
      message: "Produit mis a jour avec succes.",
      product: produit,
    });
  } catch (error) {
    console.error("Update product error:", error);
    return res.status(500).json({
      message: "Erreur serveur lors de la mise a jour du produit.",
    });
  }
};

const deleteProduct = async (req, res) => {
  try {
    const productId = parseId(req.params.id);

    if (!productId) {
      return res.status(400).json({
        message: "ID produit invalide.",
      });
    }

    const existingProduct = await prisma.produit.findUnique({
      where: { id: productId },
      include: {
        _count: {
          select: {
            lignesVente: true,
          },
        },
      },
    });

    if (!existingProduct) {
      return res.status(404).json({
        message: "Produit introuvable.",
      });
    }

    if (existingProduct._count.lignesVente > 0) {
      return res.status(409).json({
        message: "Impossible de supprimer ce produit car il a deja ete utilise dans des ventes.",
      });
    }

    await prisma.produit.delete({
      where: { id: productId },
    });

    return res.status(200).json({
      message: "Produit supprime avec succes.",
    });
  } catch (error) {
    if (error.code === "P2003") {
      return res.status(409).json({
        message: "Impossible de supprimer ce produit car il est lie a des enregistrements existants.",
      });
    }

    console.error("Delete product error:", error);
    return res.status(500).json({
      message: "Erreur serveur lors de la suppression du produit.",
    });
  }
};

module.exports = {
  getAllProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
};
