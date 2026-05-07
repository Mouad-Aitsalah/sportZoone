const { createHttpError } = require("../utils/httpError");

const ANNUAL_NUMBER_PATTERN = /^(\d+)\/(\d{4})$/;

const extractAnnualCounter = (value, year) => {
  const match = String(value || "").match(ANNUAL_NUMBER_PATTERN);

  if (!match) {
    return null;
  }

  if (Number(match[2]) !== Number(year)) {
    return null;
  }

  return Number(match[1]);
};

const buildAnnualDocumentNumber = async ({
  tx,
  model,
  field,
  date = new Date(),
  where = {},
}) => {
  const year = date.getFullYear();
  const suffix = `/${year}`;
  const rows = await tx[model].findMany({
    where: {
      ...where,
      [field]: {
        endsWith: suffix,
      },
    },
    select: {
      [field]: true,
    },
  });

  const maxCounter = rows.reduce((currentMax, row) => {
    const counter = extractAnnualCounter(row[field], year);
    return counter && counter > currentMax ? counter : currentMax;
  }, 0);

  return `${maxCounter + 1}/${year}`;
};

const createAnnualDocumentNumberGenerator = ({
  model,
  field,
  where = {},
  maxAttempts = 5,
}) => {
  return async (tx, date = new Date()) => {
    let lastError = null;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      try {
        return await buildAnnualDocumentNumber({
          tx,
          model,
          field,
          date,
          where,
        });
      } catch (error) {
        lastError = error;
      }
    }

    throw (
      lastError ||
      createHttpError(
        500,
        "Impossible de generer le prochain numero annuel."
      )
    );
  };
};

module.exports = {
  buildAnnualDocumentNumber,
  createAnnualDocumentNumberGenerator,
  extractAnnualCounter,
};
