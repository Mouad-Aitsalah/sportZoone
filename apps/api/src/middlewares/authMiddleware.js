const jwt = require("jsonwebtoken");
const prisma = require("../config/prisma");
const { createHttpError } = require("../utils/httpError");

const authMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return next(createHttpError(401, "Acces refuse. Token Bearer manquant."));
  }

  if (!process.env.JWT_SECRET) {
    return next(createHttpError(500, "JWT_SECRET est manquant dans la configuration."));
  }

  const token = authHeader.split(" ")[1];
  let decoded;

  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError || error instanceof jwt.JsonWebTokenError) {
      return next(createHttpError(401, "Token invalide ou expire."));
    }

    return next(createHttpError(500, "Erreur serveur lors de la verification du token."));
  }

  try {
    const user = await prisma.utilisateur.findUnique({
      where: { id: decoded.id },
      select: {
        id: true,
        nom: true,
        email: true,
        role: true,
        estActif: true,
        pointDeVenteId: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user || !user.estActif) {
      return next(createHttpError(401, "Utilisateur non autorise."));
    }

    req.user = user;
    next();
  } catch (error) {
    console.error("Auth middleware error:", error);
    return next(createHttpError(500, "Erreur serveur lors de l'authentification."));
  }
};

module.exports = authMiddleware;
