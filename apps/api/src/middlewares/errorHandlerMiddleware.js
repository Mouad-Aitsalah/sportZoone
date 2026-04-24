const { DEFAULT_ERROR_CODES } = require("../utils/httpError");

const errorHandlerMiddleware = (error, req, res, next) => {
  if (res.headersSent) {
    return next(error);
  }

  if (error?.code === "P2002") {
    return res.status(409).json({
      success: false,
      message: "A unique constraint failed.",
      code: "CONFLICT",
    });
  }

  const status =
    Number.isInteger(error?.status) && error.status >= 400 && error.status < 600
      ? error.status
      : 500;

  const isHandledError = Number.isInteger(error?.status);
  const message = isHandledError
    ? error?.message || "An unexpected error occurred."
    : "Internal server error.";
  const code = error?.apiCode || DEFAULT_ERROR_CODES[status] || "ERROR";

  if (status === 500) {
    console.error("Unhandled error:", error);
  }

  return res.status(status).json({
    success: false,
    message,
    code,
  });
};

module.exports = errorHandlerMiddleware;
