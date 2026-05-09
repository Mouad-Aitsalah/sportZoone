const { z } = require("zod");
const { createHttpError } = require("./httpError");

const emptyStringToUndefined = (value) => {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value === "string" && value.trim() === "") {
    return undefined;
  }

  return value;
};

const optionalString = (fieldLabel) =>
  z.preprocess(
    (value) => {
      if (value === null) {
        return null;
      }

      return emptyStringToUndefined(value);
    },
    z
      .union([
        z.string({
          invalid_type_error: `${fieldLabel} doit etre une chaine de caracteres.`,
        }).trim(),
        z.null(),
      ])
      .optional()
  );

const requiredString = (fieldLabel) =>
  z
    .string({
      required_error: `${fieldLabel} est obligatoire.`,
      invalid_type_error: `${fieldLabel} doit etre une chaine de caracteres.`,
    })
    .trim()
    .min(1, `${fieldLabel} est obligatoire.`);

const emailString = (fieldLabel = "L'email") =>
  requiredString(fieldLabel).email(`${fieldLabel} doit avoir un format valide.`);

const optionalEmailString = (fieldLabel = "L'email") =>
  z.preprocess(
    (value) => {
      if (value === null) {
        return null;
      }

      return emptyStringToUndefined(value);
    },
    z.union([
      z
        .string({
          invalid_type_error: `${fieldLabel} doit etre une chaine de caracteres.`,
        })
        .trim()
        .email(`${fieldLabel} doit avoir un format valide.`),
      z.null(),
    ])
      .optional()
  );

const optionalPhoneString = (fieldLabel = "Le telephone") =>
  z.preprocess(
    (value) => {
      if (value === null) {
        return null;
      }

      return emptyStringToUndefined(value);
    },
    z
      .union([
        z.string({
          invalid_type_error: `${fieldLabel} doit etre une chaine de caracteres.`,
        }).trim(),
        z.null(),
      ])
      .optional()
  );

const coerceNumber = (fieldLabel) =>
  z.coerce.number({
    required_error: `${fieldLabel} est obligatoire.`,
    invalid_type_error: `${fieldLabel} doit etre un nombre valide.`,
  });

const numberValue = (fieldLabel) => coerceNumber(fieldLabel);

const nonNegativeNumber = (fieldLabel) =>
  coerceNumber(fieldLabel).min(0, `${fieldLabel} doit etre superieur ou egal a 0.`);

const positiveNumber = (fieldLabel) =>
  coerceNumber(fieldLabel).gt(0, `${fieldLabel} doit etre superieur a 0.`);

const optionalPositiveInt = (fieldLabel) =>
  z.preprocess(
    (value) => {
      if (value === null) {
        return null;
      }

      return emptyStringToUndefined(value);
    },
    z.union([
      z.coerce
        .number({
          invalid_type_error: `${fieldLabel} doit etre un entier valide.`,
        })
        .int(`${fieldLabel} doit etre un entier valide.`)
        .positive(`${fieldLabel} doit etre superieur a 0.`),
      z.null(),
    ])
      .optional()
  );

const positiveInt = (fieldLabel) =>
  z.coerce
    .number({
      required_error: `${fieldLabel} est obligatoire.`,
      invalid_type_error: `${fieldLabel} doit etre un entier valide.`,
    })
    .int(`${fieldLabel} doit etre un entier valide.`)
    .positive(`${fieldLabel} doit etre superieur a 0.`);

const nonNegativeInt = (fieldLabel) =>
  z.coerce
    .number({
      required_error: `${fieldLabel} est obligatoire.`,
      invalid_type_error: `${fieldLabel} doit etre un entier valide.`,
    })
    .int(`${fieldLabel} doit etre un entier valide.`)
    .min(0, `${fieldLabel} doit etre superieur ou egal a 0.`);

const optionalBoolean = (fieldLabel) =>
  z.preprocess(
    (value) => {
      if (value === undefined) {
        return undefined;
      }

      if (value === "true") {
        return true;
      }

      if (value === "false") {
        return false;
      }

      return value;
    },
    z.boolean({
      invalid_type_error: `${fieldLabel} doit etre true ou false.`,
    }).optional()
  );

const formatZodError = (error) =>
  error.issues.map((issue) => issue.message).join(" ");

const validateSchema = (schema, payload) => {
  const result = schema.safeParse(payload);

  if (!result.success) {
    throw createHttpError(400, formatZodError(result.error));
  }

  return result.data;
};

module.exports = {
  z,
  requiredString,
  optionalString,
  emailString,
  optionalEmailString,
  optionalPhoneString,
  numberValue,
  positiveNumber,
  nonNegativeNumber,
  positiveInt,
  optionalPositiveInt,
  nonNegativeInt,
  optionalBoolean,
  validateSchema,
};
