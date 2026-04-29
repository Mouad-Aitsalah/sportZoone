const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const prisma = require("../config/prisma");
const { validateSchema } = require("../utils/validation");
const {
  authRegisterSchema,
  authLoginSchema,
} = require("../utils/validationSchemas");

const mapRoleForApi = (role) => (role === "ADMIN" ? "admin" : "employe");

const userInclude = {
  pointDeVente: {
    select: {
      id: true,
      nom: true,
    },
  },
  caisse: {
    select: {
      id: true,
      nom: true,
      code: true,
      pointDeVenteId: true,
      estActive: true,
    },
  },
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
  storeName: user.pointDeVente ? user.pointDeVente.nom : null,
  caisseId: user.caisseId,
  cashRegisterId: user.caisseId,
  cashRegisterName: user.caisse ? user.caisse.nom : null,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});

const normalizeRequiredString = (value) => String(value || "").trim();

const createToken = (user) =>
  jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      pointDeVenteId: user.pointDeVenteId,
      caisseId: user.caisseId,
    },
    process.env.JWT_SECRET,
    {
      expiresIn: process.env.JWT_EXPIRES_IN || "7d",
    }
  );

const getAdminRequester = async (req) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ") || !process.env.JWT_SECRET) {
    return null;
  }

  try {
    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const requester = await prisma.utilisateur.findUnique({
      where: { id: decoded.id },
      select: {
        id: true,
        role: true,
        estActif: true,
      },
    });

    if (requester && requester.estActif && requester.role === "ADMIN") {
      return requester;
    }

    return null;
  } catch (error) {
    return null;
  }
};

const parsePointDeVenteId = (value) => {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value === "string" && value.trim() === "") {
    return null;
  }

  const parsedValue = Number(value);
  return Number.isInteger(parsedValue) && parsedValue > 0 ? parsedValue : NaN;
};

const parseCaisseId = (value) => {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value === "string" && value.trim() === "") {
    return null;
  }

  const parsedValue = Number(value);
  return Number.isInteger(parsedValue) && parsedValue > 0 ? parsedValue : NaN;
};

const register = async (req, res) => {
  try {
    const parsedInput = validateSchema(authRegisterSchema, req.body);
    const { nom, email, motDePasse, role, pointDeVenteId, caisseId } = parsedInput;
    const adminRequester = await getAdminRequester(req);
    const normalizedNom = normalizeRequiredString(nom);
    const normalizedEmail = normalizeRequiredString(email).toLowerCase();
    const rawPassword = String(motDePasse || "");

    if (!normalizedNom || !normalizedEmail || !rawPassword.trim()) {
      return res.status(400).json({
        message: "nom, email et motDePasse sont obligatoires.",
      });
    }

    const requestedRole = typeof role === "string" ? role.trim().toUpperCase() : "";
    const userRole =
      adminRequester && ["ADMIN", "EMPLOYE"].includes(requestedRole)
        ? requestedRole
        : "EMPLOYE";
    const parsedPointDeVenteId = parsePointDeVenteId(pointDeVenteId);
    const parsedCaisseId = parseCaisseId(caisseId);

    if (Number.isNaN(parsedPointDeVenteId)) {
      return res.status(400).json({
        message: "pointDeVenteId doit etre un nombre entier valide.",
      });
    }

    if (Number.isNaN(parsedCaisseId)) {
      return res.status(400).json({
        message: "caisseId doit etre un nombre entier valide.",
      });
    }

    if (userRole === "EMPLOYE" && !parsedPointDeVenteId) {
      return res.status(400).json({
        message: "Un employe doit etre rattache a un point de vente.",
      });
    }

    if (userRole === "EMPLOYE" && !parsedCaisseId) {
      return res.status(400).json({
        message: "Un employe doit etre rattache a une caisse.",
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

    if (parsedCaisseId) {
      const caisse = await prisma.caisse.findUnique({
        where: { id: parsedCaisseId },
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

    const user = await prisma.utilisateur.create({
      data: {
        nom: normalizedNom,
        email: normalizedEmail,
        motDePasse: hashedPassword,
        role: userRole,
        pointDeVenteId: parsedPointDeVenteId,
        caisseId: parsedCaisseId,
      },
      include: userInclude,
    });

    return res.status(201).json({
      message: "Utilisateur cree avec succes.",
      user: formatUser(user),
    });
  } catch (error) {
    if (error?.status) {
      return res.status(error.status).json({
        message: error.message,
      });
    }

    console.error("Register error:", error);
    return res.status(500).json({
      message: "Erreur serveur lors de la creation du compte.",
    });
  }
};

const login = async (req, res) => {
  try {
    const { email, motDePasse } = validateSchema(authLoginSchema, req.body);
    const normalizedEmail = normalizeRequiredString(email).toLowerCase();
    const rawPassword = String(motDePasse || "");

    if (!normalizedEmail || !rawPassword.trim()) {
      return res.status(400).json({
        message: "email et motDePasse sont obligatoires.",
      });
    }

    if (!process.env.JWT_SECRET) {
      return res.status(500).json({
        message: "JWT_SECRET est manquant dans la configuration.",
      });
    }

    const user = await prisma.utilisateur.findUnique({
      where: { email: normalizedEmail },
      include: userInclude,
    });

    if (!user) {
      return res.status(401).json({
        message: "Email ou mot de passe incorrect.",
      });
    }

    if (!user.estActif) {
      return res.status(403).json({
        message: "Ce compte est desactive.",
      });
    }

    const isPasswordValid = await bcrypt.compare(rawPassword, user.motDePasse);

    if (!isPasswordValid) {
      return res.status(401).json({
        message: "Email ou mot de passe incorrect.",
      });
    }

    if (false) {
      if (false) {
        await ensureLoginApprovalRequest(user);

        return res.status(403).json({
          message: "Acces refuse.",
        });
      }

      return res.status(403).json({
        success: false,
        code: "FORBIDDEN",
        message: "Votre accès a été refusé par l'administrateur.",
      });
    }

    const token = createToken(user);

    return res.status(200).json({
      message: "Connexion reussie.",
      token,
      user: formatUser(user),
    });
  } catch (error) {
    if (error?.status) {
      return res.status(error.status).json({
        message: error.message,
      });
    }

    console.error("Login error:", error);
    return res.status(500).json({
      message: "Erreur serveur lors de la connexion.",
    });
  }
};

const getMe = async (req, res) => {
  const user = await prisma.utilisateur.findUnique({
    where: { id: req.user.id },
    include: userInclude,
  });

  return res.status(200).json({
    user: user ? formatUser(user) : formatUser(req.user),
  });
};

module.exports = {
  register,
  login,
  getMe,
};
