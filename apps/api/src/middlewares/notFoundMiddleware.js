const { createHttpError } = require("../utils/httpError");

const notFoundMiddleware = (req, res, next) => {
  next(createHttpError(404, "Route not found.", "ROUTE_NOT_FOUND"));
};

module.exports = notFoundMiddleware;
