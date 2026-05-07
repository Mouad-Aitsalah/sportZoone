const EAN13_LENGTH = 13;
const EAN13_BODY_LENGTH = 12;
const GENERATED_EAN13_PREFIX = "6201";
const GENERATED_EAN13_SEQUENCE_LENGTH =
  EAN13_BODY_LENGTH - GENERATED_EAN13_PREFIX.length;

const normalizeBarcodeDigits = (value) => String(value || "").trim();

const isDigitsOnly = (value) => /^\d+$/.test(value);

const calculateEAN13CheckDigit = (body) => {
  const normalizedBody = normalizeBarcodeDigits(body);

  if (
    normalizedBody.length !== EAN13_BODY_LENGTH ||
    !isDigitsOnly(normalizedBody)
  ) {
    throw new Error("EAN-13 body must contain exactly 12 digits.");
  }

  const checksumBase = normalizedBody
    .split("")
    .reduce((sum, digit, index) => {
      const multiplier = index % 2 === 0 ? 1 : 3;
      return sum + Number(digit) * multiplier;
    }, 0);

  return String((10 - (checksumBase % 10)) % 10);
};

const generateEAN13 = (body) => {
  const normalizedBody = normalizeBarcodeDigits(body);
  return `${normalizedBody}${calculateEAN13CheckDigit(normalizedBody)}`;
};

const isValidEAN13 = (value) => {
  const normalizedValue = normalizeBarcodeDigits(value);

  if (
    normalizedValue.length !== EAN13_LENGTH ||
    !isDigitsOnly(normalizedValue)
  ) {
    return false;
  }

  const body = normalizedValue.slice(0, EAN13_BODY_LENGTH);
  const checksum = normalizedValue.slice(-1);

  return calculateEAN13CheckDigit(body) === checksum;
};

const buildGeneratedEAN13 = (sequence) => {
  const numericSequence = Number(sequence);

  if (
    !Number.isInteger(numericSequence) ||
    numericSequence < 0 ||
    numericSequence >= 10 ** GENERATED_EAN13_SEQUENCE_LENGTH
  ) {
    throw new Error("EAN-13 generation sequence is out of range.");
  }

  const body = `${GENERATED_EAN13_PREFIX}${String(numericSequence).padStart(
    GENERATED_EAN13_SEQUENCE_LENGTH,
    "0"
  )}`;

  return generateEAN13(body);
};

const parseGeneratedEAN13Sequence = (barcode) => {
  const normalizedBarcode = normalizeBarcodeDigits(barcode);

  if (!isValidEAN13(normalizedBarcode)) {
    return null;
  }

  const body = normalizedBarcode.slice(0, EAN13_BODY_LENGTH);

  if (!body.startsWith(GENERATED_EAN13_PREFIX)) {
    return null;
  }

  return Number(body.slice(GENERATED_EAN13_PREFIX.length));
};

module.exports = {
  EAN13_BODY_LENGTH,
  EAN13_LENGTH,
  GENERATED_EAN13_PREFIX,
  GENERATED_EAN13_SEQUENCE_LENGTH,
  buildGeneratedEAN13,
  calculateEAN13CheckDigit,
  generateEAN13,
  isValidEAN13,
  normalizeBarcodeDigits,
  parseGeneratedEAN13Sequence,
};
