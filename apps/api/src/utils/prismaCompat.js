const isPrismaMissingColumnError = (error) =>
  Boolean(error && typeof error === "object" && error.code === "P2022");

const logPrismaCompatFallback = (scope, error, metadata = {}) => {
  console.warn(`[prisma-compat] ${scope}`, {
    code: error?.code || null,
    message: error?.message || "Unknown Prisma error",
    ...metadata,
  });
};

module.exports = {
  isPrismaMissingColumnError,
  logPrismaCompatFallback,
};
