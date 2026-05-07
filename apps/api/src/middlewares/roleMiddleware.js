const { createHttpError } = require("../utils/httpError");
const { hasRequiredRole } = require("../utils/roleUtils");

const roleMiddleware = (...allowedRoles) => (req, res, next) => {
  if (!req.user) {
    return next(createHttpError(401, "Authentification requise."));
  }

  if (!hasRequiredRole(req.user.role, allowedRoles)) {
    return next(createHttpError(403, "Acces refuse. Permissions insuffisantes."));
  }

  next();
};

module.exports = roleMiddleware;
