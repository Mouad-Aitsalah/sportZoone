const bcrypt = require("bcrypt");
const prisma = require("../config/prisma");

const parseId = (value) => {
  const parsedValue = Number(value);
  return Number.isInteger(parsedValue) && parsedValue > 0 ? parsedValue : null;
};

const parseOptionalInteger = (value) => {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const parsedValue = Number(value);
  return Number.isInteger(parsedValue) && parsedValue > 0 ? parsedValue : NaN;
};

const parseOptionalBoolean = (value, defaultValue = undefined) => {
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

const userSelect = {
  id: true,
  nom: true,
  email: true,
  role: true,
  estActif: true,
  pointDeVenteId: true,
  createdAt: true,
  updatedAt: true,
  pointDeVente: {
    select: {
      id: true,
      nom: true,
      adresse: true,
      telephone: true,
    },
  },
};

const formatUser = (user) => ({
  id: user.id,
  nom: user.nom,
  email: user.email,
  role: user.role,
  estActif: user.estActif,
  pointDeVenteId: user.pointDeVenteId,
  pointDeVente: user.pointDeVente || null,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});

const getAllUsers = async (req, res) => {
  try {
    const utilisateurs = await prisma.utilisateur.findMany({
      select: userSelect,
      orderBy: {
        id: "desc",
      },
    });

    return res.status(200).json({
      users: utilisateurs.map(formatUser),
    });
  } catch (error) {
    console.error("Get users error:", error);
    return res.status(500).json({
      message: "Erreur serveur lors de la recuperation des utilisateurs.",
    });
  }
};

const getUserById = async (req, res) => {
  try {
    const userId = parseId(req.params.id);

    if (!userId) {
      return res.status(400).json({
        message: "ID utilisateur invalide.",
      });
    }

    const utilisateur = await prisma.utilisateur.findUnique({
      where: { id: userId },
      select: userSelect,
    });

    if (!utilisateur) {
      return res.status(404).json({
        message: "Utilisateur introuvable.",
      });
    }

    return res.status(200).json({
      user: formatUser(utilisateur),
    });
  } catch (error) {
    console.error("Get user by id error:", error);
    return res.status(500).json({
      message: "Erreur serveur lors de la recuperation de l'utilisateur.",
    });
  }
};

const createUser = async (req, res) => {
  try {
    const { nom, email, motDePasse, role, estActif, pointDeVenteId } = req.body;

    const normalizedNom = String(nom || "").trim();
    const normalizedEmail = String(email || "").toLowerCase().trim();
    const rawPassword = String(motDePasse || "");
    const normalizedRole = role || "EMPLOYE";
    const parsedEstActif = parseOptionalBoolean(estActif, true);
    const parsedPointDeVenteId = parseOptionalInteger(pointDeVenteId);

    if (!normalizedNom || !normalizedEmail || !rawPassword.trim()) {
      return res.status(400).json({
        message: "nom, email et motDePasse sont obligatoires.",
      });
    }

    if (!["ADMIN", "EMPLOYE"].includes(normalizedRole)) {
      return res.status(400).json({
        message: "Le role doit etre ADMIN ou EMPLOYE.",
      });
    }

    if (parsedEstActif === null) {
      return res.status(400).json({
        message: "estActif doit etre true ou false.",
      });
    }

    if (Number.isNaN(parsedPointDeVenteId)) {
      return res.status(400).json({
        message: "pointDeVenteId doit etre un entier valide.",
      });
    }

    if (normalizedRole === "EMPLOYE" && !parsedPointDeVenteId) {
      return res.status(400).json({
        message: "Un employe doit etre rattache a un point de vente.",
      });
    }

    const existingUser = await prisma.utilisateur.findUnique({
      where: { email: normalizedEmail },
    });

    if (existingUser) {
      return res.status(409).json({
        message: "Un utilisateur avec cet email existe deja.",
      });
    }

    if (parsedPointDeVenteId) {
      const pointDeVente = await prisma.pointDeVente.findUnique({
        where: { id: parsedPointDeVenteId },
      });

      if (!pointDeVente) {
        return res.status(404).json({
          message: "Point de vente introuvable.",
        });
      }
    }

    const hashedPassword = await bcrypt.hash(rawPassword, 10);

    const utilisateur = await prisma.utilisateur.create({
      data: {
        nom: normalizedNom,
        email: normalizedEmail,
        motDePasse: hashedPassword,
        role: normalizedRole,
        estActif: parsedEstActif,
        pointDeVenteId: parsedPointDeVenteId,
      },
      select: userSelect,
    });

    return res.status(201).json({
      message: "Utilisateur cree avec succes.",
      user: formatUser(utilisateur),
    });
  } catch (error) {
    console.error("Create user error:", error);
    return res.status(500).json({
      message: "Erreur serveur lors de la creation de l'utilisateur.",
    });
  }
};

const updateUser = async (req, res) => {
  try {
    const userId = parseId(req.params.id);

    if (!userId) {
      return res.status(400).json({
        message: "ID utilisateur invalide.",
      });
    }

    const existingUser = await prisma.utilisateur.findUnique({
      where: { id: userId },
      select: userSelect,
    });

    if (!existingUser) {
      return res.status(404).json({
        message: "Utilisateur introuvable.",
      });
    }

    const { nom, email, motDePasse, role, estActif, pointDeVenteId } = req.body;
    const data = {};

    if (nom !== undefined) {
      const normalizedNom = String(nom).trim();

      if (!normalizedNom) {
        return res.status(400).json({
          message: "Le nom de l'utilisateur ne peut pas etre vide.",
        });
      }

      data.nom = normalizedNom;
    }

    if (email !== undefined) {
      const normalizedEmail = String(email).toLowerCase().trim();

      if (!normalizedEmail) {
        return res.status(400).json({
          message: "L'email de l'utilisateur ne peut pas etre vide.",
        });
      }

      const userWithSameEmail = await prisma.utilisateur.findFirst({
        where: {
          email: normalizedEmail,
          id: {
            not: userId,
          },
        },
      });

      if (userWithSameEmail) {
        return res.status(409).json({
          message: "Un autre utilisateur avec cet email existe deja.",
        });
      }

      data.email = normalizedEmail;
    }

    if (motDePasse !== undefined) {
      if (!String(motDePasse).trim()) {
        return res.status(400).json({
          message: "Le mot de passe ne peut pas etre vide.",
        });
      }

      data.motDePasse = await bcrypt.hash(String(motDePasse), 10);
    }

    const nextRole = role !== undefined ? role : existingUser.role;

    if (!["ADMIN", "EMPLOYE"].includes(nextRole)) {
      return res.status(400).json({
        message: "Le role doit etre ADMIN ou EMPLOYE.",
      });
    }

    data.role = nextRole;

    if (estActif !== undefined) {
      const parsedEstActif = parseOptionalBoolean(estActif);

      if (parsedEstActif === null) {
        return res.status(400).json({
          message: "estActif doit etre true ou false.",
        });
      }

      data.estActif = parsedEstActif;
    }

    let finalPointDeVenteId = existingUser.pointDeVenteId;

    if (pointDeVenteId !== undefined) {
      const parsedPointDeVenteId = parseOptionalInteger(pointDeVenteId);

      if (Number.isNaN(parsedPointDeVenteId)) {
        return res.status(400).json({
          message: "pointDeVenteId doit etre un entier valide.",
        });
      }

      finalPointDeVenteId = parsedPointDeVenteId;
    }

    if (nextRole === "EMPLOYE" && !finalPointDeVenteId) {
      return res.status(400).json({
        message: "Un employe doit etre rattache a un point de vente.",
      });
    }

    if (finalPointDeVenteId) {
      const pointDeVente = await prisma.pointDeVente.findUnique({
        where: { id: finalPointDeVenteId },
      });

      if (!pointDeVente) {
        return res.status(404).json({
          message: "Point de vente introuvable.",
        });
      }
    }

    data.pointDeVenteId = finalPointDeVenteId;

    const utilisateur = await prisma.utilisateur.update({
      where: { id: userId },
      data,
      select: userSelect,
    });

    return res.status(200).json({
      message: "Utilisateur mis a jour avec succes.",
      user: formatUser(utilisateur),
    });
  } catch (error) {
    console.error("Update user error:", error);
    return res.status(500).json({
      message: "Erreur serveur lors de la mise a jour de l'utilisateur.",
    });
  }
};

const deleteUser = async (req, res) => {
  try {
    const userId = parseId(req.params.id);

    if (!userId) {
      return res.status(400).json({
        message: "ID utilisateur invalide.",
      });
    }

    const existingUser = await prisma.utilisateur.findUnique({
      where: { id: userId },
      include: {
        _count: {
          select: {
            ventes: true,
          },
        },
      },
    });

    if (!existingUser) {
      return res.status(404).json({
        message: "Utilisateur introuvable.",
      });
    }

    if (existingUser._count.ventes > 0) {
      return res.status(409).json({
        message: "Impossible de supprimer cet utilisateur car il est lie a des ventes.",
      });
    }

    await prisma.utilisateur.delete({
      where: { id: userId },
    });

    return res.status(200).json({
      message: "Utilisateur supprime avec succes.",
    });
  } catch (error) {
    console.error("Delete user error:", error);
    return res.status(500).json({
      message: "Erreur serveur lors de la suppression de l'utilisateur.",
    });
  }
};

module.exports = {
  getAllUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
};
