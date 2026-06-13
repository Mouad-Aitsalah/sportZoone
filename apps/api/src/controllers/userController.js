const bcrypt = require("bcryptjs");
const prisma = require("../config/prisma");
const { validateSchema } = require("../utils/validation");
const { getOrganisationIdFromUser } = require("../utils/organisationScope");
const {
  userCreateSchema,
  userUpdateSchema,
  userPasswordUpdateSchema,
} = require("../utils/validationSchemas");

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

const getSingleStoreContext = async (organisationId, db = prisma) => {
  const pointDeVente = await db.pointDeVente.findFirst({
    where: {
      organisationId,
    },
    select: {
      id: true,
    },
    orderBy: [{ id: "asc" }],
  });

  const caisse = pointDeVente
    ? await db.caisse.findFirst({
        where: {
          organisationId,
          pointDeVenteId: pointDeVente.id,
        },
        select: {
          id: true,
          pointDeVenteId: true,
          estActive: true,
        },
        orderBy: [{ id: "asc" }],
      })
    : null;

  return {
    pointDeVente,
    caisse,
  };
};

const userSelect = {
  id: true,
  nom: true,
  email: true,
  role: true,
  estActif: true,
  pointDeVenteId: true,
  caisseId: true,
  organisationId: true,
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
  caisse: {
    select: {
      id: true,
      nom: true,
      code: true,
      estActive: true,
      pointDeVenteId: true,
    },
  },
};

const mapRoleForApi = (role) => {
  if (role === "SUPER_ADMIN") {
    return "super_admin";
  }

  if (role === "ADMIN_GLOBAL") {
    return "admin_global";
  }

  return role === "ADMIN" ? "admin" : "employe";
};

const formatUser = (user) => ({
  id: user.id,
  nom: user.nom,
  name: user.nom,
  email: user.email,
  role: mapRoleForApi(user.role),
  roleCode: user.role,
  estActif: user.estActif,
  pointDeVenteId: user.pointDeVenteId,
  storeId: user.pointDeVenteId,
  pointDeVente: user.pointDeVente || null,
  storeName: user.pointDeVente ? user.pointDeVente.nom : null,
  caisseId: user.caisseId,
  cashRegisterId: user.caisseId,
  caisse: user.caisse || null,
  cashRegisterName: user.caisse ? user.caisse.nom : null,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});

const getAllUsers = async (req, res) => {
  try {
    const organisationId = getOrganisationIdFromUser(req.user);
    const utilisateurs = await prisma.utilisateur.findMany({
      where: {
        organisationId,
      },
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
    const organisationId = getOrganisationIdFromUser(req.user);
    const userId = parseId(req.params.id);

    if (!userId) {
      return res.status(400).json({
        message: "ID utilisateur invalide.",
      });
    }

    const utilisateur = await prisma.utilisateur.findFirst({
      where: {
        organisationId,
        id: userId,
      },
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
    const organisationId = getOrganisationIdFromUser(req.user);
    const parsedInput = validateSchema(userCreateSchema, req.body);
    const { nom, email, motDePasse, role, estActif, pointDeVenteId, caisseId } = parsedInput;

    const normalizedNom = String(nom || "").trim();
    const normalizedEmail = String(email || "").toLowerCase().trim();
    const rawPassword = String(motDePasse || "");
    const normalizedRole = role || "EMPLOYE";
    const parsedEstActif = parseOptionalBoolean(estActif, true);
    let parsedPointDeVenteId = parseOptionalInteger(pointDeVenteId);
    let parsedCaisseId = parseOptionalInteger(caisseId);

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

    if (Number.isNaN(parsedCaisseId)) {
      return res.status(400).json({
        message: "caisseId doit etre un entier valide.",
      });
    }

    if (normalizedRole === "EMPLOYE" && (!parsedPointDeVenteId || !parsedCaisseId)) {
      const singleStoreContext = await getSingleStoreContext(organisationId);

      parsedPointDeVenteId = parsedPointDeVenteId || singleStoreContext.pointDeVente?.id || null;
      parsedCaisseId = parsedCaisseId || singleStoreContext.caisse?.id || null;
    }

    if (normalizedRole === "EMPLOYE" && !parsedPointDeVenteId) {
      return res.status(400).json({
        message: "Aucun magasin par defaut n'est disponible pour rattacher ce caissier.",
      });
    }

    if (normalizedRole === "EMPLOYE" && !parsedCaisseId) {
      return res.status(400).json({
        message: "Aucune caisse par defaut n'est disponible pour rattacher ce caissier.",
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
      const pointDeVente = await prisma.pointDeVente.findFirst({
        where: {
          organisationId,
          id: parsedPointDeVenteId,
        },
      });

      if (!pointDeVente) {
        return res.status(404).json({
          message: "Point de vente introuvable.",
        });
      }
    }

    if (parsedCaisseId) {
      const caisse = await prisma.caisse.findFirst({
        where: {
          organisationId,
          id: parsedCaisseId,
        },
        select: {
          id: true,
          pointDeVenteId: true,
          estActive: true,
        },
      });

      if (!caisse) {
        return res.status(404).json({
          message: "Caisse introuvable.",
        });
      }

      if (parsedPointDeVenteId && caisse.pointDeVenteId !== parsedPointDeVenteId) {
        return res.status(400).json({
          message: "La caisse selectionnee n'appartient pas au point de vente choisi.",
        });
      }

      if (!caisse.estActive) {
        return res.status(400).json({
          message: "La caisse selectionnee est inactive.",
        });
      }
    }

    const hashedPassword = await bcrypt.hash(rawPassword, 10);

    const utilisateur = await prisma.utilisateur.create({
      data: {
        organisationId,
        nom: normalizedNom,
        email: normalizedEmail,
        motDePasse: hashedPassword,
        role: normalizedRole,
        estActif: parsedEstActif,
        approvalStatus: "APPROVED",
        pointDeVenteId: parsedPointDeVenteId,
        caisseId: parsedCaisseId,
      },
      select: userSelect,
    });

    return res.status(201).json({
      message: "Utilisateur cree avec succes.",
      user: formatUser(utilisateur),
    });
  } catch (error) {
    if (error?.status) {
      return res.status(error.status).json({
        message: error.message,
      });
    }

    console.error("Create user error:", error);
    return res.status(500).json({
      message: "Erreur serveur lors de la creation de l'utilisateur.",
    });
  }
};

const updateUser = async (req, res) => {
  try {
    const organisationId = getOrganisationIdFromUser(req.user);
    const userId = parseId(req.params.id);

    if (!userId) {
      return res.status(400).json({
        message: "ID utilisateur invalide.",
      });
    }

    const existingUser = await prisma.utilisateur.findFirst({
      where: {
        organisationId,
        id: userId,
      },
      select: userSelect,
    });

    if (!existingUser) {
      return res.status(404).json({
        message: "Utilisateur introuvable.",
      });
    }

    const { nom, email, motDePasse, role, estActif, pointDeVenteId, caisseId } =
      validateSchema(userUpdateSchema, req.body);
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
    let finalCaisseId = existingUser.caisseId;

    if (pointDeVenteId !== undefined) {
      const parsedPointDeVenteId = parseOptionalInteger(pointDeVenteId);

      if (Number.isNaN(parsedPointDeVenteId)) {
        return res.status(400).json({
          message: "pointDeVenteId doit etre un entier valide.",
        });
      }

      finalPointDeVenteId = parsedPointDeVenteId;
    }

    if (caisseId !== undefined) {
      const parsedCaisseId = parseOptionalInteger(caisseId);

      if (Number.isNaN(parsedCaisseId)) {
        return res.status(400).json({
          message: "caisseId doit etre un entier valide.",
        });
      }

      finalCaisseId = parsedCaisseId;
    }

    if (nextRole === "EMPLOYE" && (!finalPointDeVenteId || !finalCaisseId)) {
      const singleStoreContext = await getSingleStoreContext(organisationId);

      finalPointDeVenteId = finalPointDeVenteId || singleStoreContext.pointDeVente?.id || null;
      finalCaisseId = finalCaisseId || singleStoreContext.caisse?.id || null;
    }

    if (nextRole === "EMPLOYE" && !finalPointDeVenteId) {
      return res.status(400).json({
        message: "Aucun magasin par defaut n'est disponible pour rattacher ce caissier.",
      });
    }

    if (nextRole === "EMPLOYE" && !finalCaisseId) {
      return res.status(400).json({
        message: "Aucune caisse par defaut n'est disponible pour rattacher ce caissier.",
      });
    }

    if (finalPointDeVenteId) {
      const pointDeVente = await prisma.pointDeVente.findFirst({
        where: {
          organisationId,
          id: finalPointDeVenteId,
        },
      });

      if (!pointDeVente) {
        return res.status(404).json({
          message: "Point de vente introuvable.",
        });
      }
    }

    if (finalCaisseId) {
      const caisse = await prisma.caisse.findFirst({
        where: {
          organisationId,
          id: finalCaisseId,
        },
        select: {
          id: true,
          pointDeVenteId: true,
          estActive: true,
        },
      });

      if (!caisse) {
        return res.status(404).json({
          message: "Caisse introuvable.",
        });
      }

      if (finalPointDeVenteId && caisse.pointDeVenteId !== finalPointDeVenteId) {
        return res.status(400).json({
          message: "La caisse selectionnee n'appartient pas au point de vente choisi.",
        });
      }

      if (!caisse.estActive) {
        return res.status(400).json({
          message: "La caisse selectionnee est inactive.",
        });
      }
    }

    data.pointDeVenteId = finalPointDeVenteId;
    data.caisseId = finalCaisseId;

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
    if (error?.status) {
      return res.status(error.status).json({
        message: error.message,
      });
    }

    console.error("Update user error:", error);
    return res.status(500).json({
      message: "Erreur serveur lors de la mise a jour de l'utilisateur.",
    });
  }
};

const deleteUser = async (req, res) => {
  try {
    const organisationId = getOrganisationIdFromUser(req.user);
    const userId = parseId(req.params.id);

    if (!userId) {
      return res.status(400).json({
        message: "ID utilisateur invalide.",
      });
    }

    const existingUser = await prisma.utilisateur.findFirst({
      where: {
        organisationId,
        id: userId,
      },
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

const changeUserPassword = async (req, res) => {
  try {
    const organisationId = getOrganisationIdFromUser(req.user);
    const userId = parseId(req.params.id);

    if (!userId) {
      return res.status(400).json({
        message: "ID utilisateur invalide.",
      });
    }

    const existingUser = await prisma.utilisateur.findFirst({
      where: {
        organisationId,
        id: userId,
      },
      select: {
        id: true,
        nom: true,
      },
    });

    if (!existingUser) {
      return res.status(404).json({
        message: "Utilisateur introuvable.",
      });
    }

    const { newPassword } = validateSchema(userPasswordUpdateSchema, req.body);
    const normalizedPassword = String(newPassword || "").trim();

    if (normalizedPassword.length < 8) {
      return res.status(400).json({
        message: "Le nouveau mot de passe doit contenir au moins 8 caracteres.",
      });
    }

    const hashedPassword = await bcrypt.hash(normalizedPassword, 10);

    await prisma.utilisateur.update({
      where: { id: userId },
      data: {
        motDePasse: hashedPassword,
      },
    });

    return res.status(200).json({
      message: `Mot de passe mis a jour pour ${existingUser.nom}.`,
    });
  } catch (error) {
    if (error?.status) {
      return res.status(error.status).json({
        message: error.message,
      });
    }

    console.error("Change user password error:", error);
    return res.status(500).json({
      message: "Erreur serveur lors du changement de mot de passe.",
    });
  }
};

module.exports = {
  getAllUsers,
  getUserById,
  createUser,
  updateUser,
  changeUserPassword,
  deleteUser,
};
