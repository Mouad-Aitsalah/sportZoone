const { createHttpError } = require("../utils/httpError");

const roleMiddleware = (...allowedRoles) => (req, res, next) => {
  if (!req.user) {
    return next(createHttpError(401, "Authentification requise."));
  }

  if (!allowedRoles.includes(req.user.role)) {
    return next(createHttpError(403, "Acces refuse. Permissions insuffisantes."));
  }

  next();
};

module.exports = roleMiddleware;
