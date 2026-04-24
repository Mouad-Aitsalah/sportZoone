const requestLoggerMiddleware = (req, res, next) => {
  const startedAt = new Date().toISOString();
  const route = req.originalUrl.split("?")[0];

  res.on("finish", () => {
    const userId = req.user?.id || "anonymous";

    console.log(
      `[${startedAt}] ${req.method} ${route} userId=${userId}`
    );
  });

  next();
};

module.exports = requestLoggerMiddleware;
