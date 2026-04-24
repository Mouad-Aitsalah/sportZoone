const DEFAULT_ERROR_CODES = {
  400: "BAD_REQUEST",
  401: "UNAUTHORIZED",
  403: "FORBIDDEN",
  404: "NOT_FOUND",
  409: "CONFLICT",
  500: "INTERNAL_SERVER_ERROR",
};

const createHttpError = (
  status,
  message,
  apiCode = DEFAULT_ERROR_CODES[status] || "ERROR"
) => {
  const error = new Error(message);
  error.status = status;
  error.apiCode = apiCode;
  return error;
};

module.exports = {
  DEFAULT_ERROR_CODES,
  createHttpError,
};
