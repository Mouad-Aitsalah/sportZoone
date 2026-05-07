const { Prisma } = require("@prisma/client");

const DEFAULT_VARIANT_SIZE = "Unique";

const decimalToNumber = (value) => {
  if (value instanceof Prisma.Decimal) {
    return Number(value.toString());
  }

  if (typeof value === "string") {
    return Number(value);
  }

  return Number(value || 0);
};

const normalizeVariantText = (value, fallback = null) => {
  if (value === undefined || value === null) {
    return fallback;
  }

  const normalizedValue = String(value).trim();
  return normalizedValue === "" ? fallback : normalizedValue;
};

const getVariantSize = (variant) =>
  normalizeVariantText(variant?.taille, DEFAULT_VARIANT_SIZE);

const getVariantColor = (variant) => normalizeVariantText(variant?.couleur, null);

const getVariantLabel = (variant) => {
  const size = getVariantSize(variant);
  const color = getVariantColor(variant);
  return color ? `${size} / ${color}` : size;
};

const getVariantDisplayName = (productName, variant) =>
  [productName, getVariantLabel(variant)].filter(Boolean).join(" / ");

const isDefaultVariant = (variant) =>
  getVariantSize(variant) === DEFAULT_VARIANT_SIZE && !getVariantColor(variant);

const buildProductVariantKey = (productId, variantId = null) =>
  `${Number(productId || 0)}:${Number(variantId || 0)}`;

const sumVariantStock = (variants = []) =>
  variants.reduce(
    (total, variant) =>
      total + Number(variant?.quantiteStock ?? variant?.stock ?? 0),
    0
  );

const sumVariantThreshold = (variants = []) =>
  variants.reduce((total, variant) => total + Number(variant?.seuilMinimum || 0), 0);

const toApiVariant = (variant, product = null) => ({
  id: variant.id,
  productId: variant.produitId,
  size: getVariantSize(variant),
  taille: getVariantSize(variant),
  color: getVariantColor(variant),
  couleur: getVariantColor(variant),
  label: getVariantLabel(variant),
  displayName: getVariantDisplayName(product?.nom || product?.name || "", variant),
  barcode: variant.codeBarres || null,
  codeBarres: variant.codeBarres || null,
  purchasePrice:
    variant.prixAchat === null || variant.prixAchat === undefined
      ? decimalToNumber(product?.prixAchat)
      : decimalToNumber(variant.prixAchat),
  salePrice:
    variant.prixVente === null || variant.prixVente === undefined
      ? decimalToNumber(product?.prixVente ?? product?.prixDetail)
      : decimalToNumber(variant.prixVente),
  minimumThreshold: Number(
    variant.seuilMinimum ?? product?.seuilMinimum ?? 0
  ),
  stock: Number(variant.quantiteStock || 0),
  active: Boolean(variant.actif),
  isDefault: isDefaultVariant(variant),
});

module.exports = {
  DEFAULT_VARIANT_SIZE,
  buildProductVariantKey,
  decimalToNumber,
  getVariantColor,
  getVariantDisplayName,
  getVariantLabel,
  getVariantSize,
  isDefaultVariant,
  normalizeVariantText,
  sumVariantStock,
  sumVariantThreshold,
  toApiVariant,
};
