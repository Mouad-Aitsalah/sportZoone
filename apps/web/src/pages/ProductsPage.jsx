import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import DataTable from "../components/DataTable";
import Badge from "../components/Badge";
import Modal from "../components/Modal";
import PageHeader from "../components/PageHeader";
import SectionCard from "../components/SectionCard";
import SearchInput from "../components/SearchInput";
import StatCard from "../components/StatCard";
import api from "../services/api";
import {
  cacheResources,
  hydrateCachedResource,
  readCachedResourceData,
  refreshCachedResource,
} from "../services/cacheService";
import { getCurrentUser } from "../store/authStore";
import { invalidateDomainCaches } from "../utils/appCache";
import { cleanupLegacyStoreCache } from "../utils/storeAccess";
import { downloadBlob } from "../utils/downloadBlob";
import { formatCurrencyDh, formatDateTime } from "../utils/formatters";

const getCollection = (payload, keys = []) => {
  if (Array.isArray(payload)) {
    return payload;
  }

  for (const key of keys) {
    if (Array.isArray(payload?.[key])) {
      return payload[key];
    }
  }

  return [];
};

const getProductSalesCollection = (payload) => getCollection(payload, ["data", "sales"]);

const DEFAULT_SIZE_OPTIONS = [
  "2XS",
  "XS",
  "S",
  "M",
  "L",
  "XL",
  "2XL",
  "3XL",
  "4XL",
  "5XL",
  "6XL",
  "7XL",
];

const VARIANT_MODE_LABELS = {
  size: "Variante par taille",
  color: "Variante par couleur",
  sizeColor: "Variante taille + couleur",
};

const DEFAULT_VARIANT_COLOR = "Standard";
const DEFAULT_SUPPLIER_NAME = "Autre";

const normalizeSearchValue = (value) => String(value || "").trim().toLowerCase();
const getSupplierDisplayName = (supplier) => supplier?.name || supplier?.nom || "";
const getDefaultSupplier = (suppliers = []) =>
  suppliers.find(
    (supplier) =>
      normalizeSearchValue(getSupplierDisplayName(supplier)) ===
      normalizeSearchValue(DEFAULT_SUPPLIER_NAME)
  ) || null;
const getDefaultSupplierId = (suppliers = []) =>
  getDefaultSupplier(suppliers)?.id ? String(getDefaultSupplier(suppliers).id) : "";
const getPreferredSupplierId = (product = null, suppliers = []) => {
  const existingSupplierId =
    product?.compteId || product?.supplierCompteId || product?.supplierId;

  if (existingSupplierId) {
    return String(existingSupplierId);
  }

  return getDefaultSupplierId(suppliers);
};

const getProductVariants = (product) => {
  const resolveVariants = (variants) =>
    variants.filter((variant) => (variant?.active ?? variant?.actif ?? true) !== false);

  if (Array.isArray(product?.variants)) {
    return resolveVariants(product.variants);
  }

  if (Array.isArray(product?.variantes)) {
    return resolveVariants(product.variantes);
  }

  if (Array.isArray(product?.productVariants)) {
    return resolveVariants(product.productVariants);
  }

  return [];
};

const getActiveProductVariants = (product) =>
  getProductVariants(product);

const getVariantBarcodeValue = (variant) => variant?.barcode || variant?.codeBarres || "";

const getVariantSizeValue = (variant) => variant?.size || variant?.taille || "";

const getVariantColorValue = (variant) => variant?.color || variant?.couleur || "";

const buildVariantValuesText = (taille, couleur) => {
  const size = String(taille || "Unique").trim() || "Unique";
  const color = String(couleur || DEFAULT_VARIANT_COLOR).trim();

  return color ? `Taille: ${size} / Couleur: ${color}` : `Taille: ${size}`;
};

const getVariantValuesText = (variant) =>
  String(
    variant?.variantValuesText ||
      variant?.valeursVariante ||
      buildVariantValuesText(getVariantSizeValue(variant), getVariantColorValue(variant))
  ).trim();

const getVariantMatchKey = (productId, variant) =>
  String(
    variant?.id ||
      `${productId}-${getVariantBarcodeValue(variant)}-${getVariantSizeValue(
        variant
      )}-${getVariantColorValue(variant)}`
  );

const normalizeVariantKey = (taille, couleur) =>
  `${String(taille || "Unique").trim().toLowerCase()}::${String(
    couleur || DEFAULT_VARIANT_COLOR
  )
    .trim()
    .toLowerCase()}`;

const isDefaultVariantDraft = (variant) =>
  normalizeVariantKey(variant?.taille, variant?.couleur) ===
  normalizeVariantKey("Unique", DEFAULT_VARIANT_COLOR);

const getVariantTypeLabel = (variant) => {
  return getVariantValuesText(variant);
};

const formatQuantityValue = (value) =>
  new Intl.NumberFormat("fr-MA", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));

const getProductSaleStatusMeta = (sale) => {
  if (sale?.type === "refund" || Number(sale?.lineTotal || 0) < 0) {
    return {
      label: "Remboursement",
      tone: "info",
    };
  }

  if (sale?.status === "cancelled") {
    return {
      label: "Annulee",
      tone: "danger",
    };
  }

  if (sale?.paymentStatus === "PARTIALLY_PAID") {
    return {
      label: "Partiellement paye",
      tone: "warning",
    };
  }

  if (sale?.paymentMethod === "credit" || sale?.paymentStatus === "CREDIT") {
    return {
      label: "Credit",
      tone: "warning",
    };
  }

  return {
    label: "Paye",
    tone: "success",
  };
};

const createInitialFormData = (product = null, suppliers = []) => ({
  nom: product?.name || "",
  codeBarres: product?.barcode || product?.codeBarres || "",
  categorieId: product?.categoryId ? String(product.categoryId) : "",
  prixAchat:
    product?.purchasePrice === 0 || product?.purchasePrice
      ? String(product.purchasePrice)
      : "",
  prixVente:
    product?.salePrice === 0 || product?.salePrice ? String(product.salePrice) : "",
  tauxTVA: product?.vatRate === 0 || product?.vatRate ? String(product.vatRate) : "0",
  prixDetail:
    product?.retailPrice === 0 || product?.retailPrice
      ? String(product.retailPrice)
      : product?.salePrice === 0 || product?.salePrice
      ? String(product.salePrice)
      : "",
  prixGros:
    product?.wholesalePrice === 0 || product?.wholesalePrice
      ? String(product.wholesalePrice)
      : "",
  prixMiniGros:
    product?.miniWholesalePrice === 0 || product?.miniWholesalePrice
      ? String(product.miniWholesalePrice)
      : "",
  seuilMinimum:
    product?.minimumThreshold === 0 || product?.minimumThreshold
      ? String(product.minimumThreshold)
      : "0",
  compteId: getPreferredSupplierId(product, suppliers),
  estActif: product?.active ?? true,
  sansVariante: product ? getActiveProductVariants(product).length === 0 : false,
});

const resolveVariantNumber = (...values) => {
  for (const value of values) {
    if (value === 0 || value === "0") {
      return "0";
    }

    if (value !== undefined && value !== null && value !== "") {
      return String(value);
    }
  }

  return "";
};

const getStockPresentationMeta = (quantity, minimumThreshold = 0) => {
  const normalizedQuantity = Number(quantity || 0);
  const normalizedThreshold = Number(minimumThreshold || 0);

  if (normalizedQuantity < 0) {
    return {
      label: "Stock negatif",
      tone: "stock-critical",
      valueClassName: "stock-negative-value",
      rowClassName: "variant-stock-row-critical",
    };
  }

  if (normalizedQuantity === 0) {
    return {
      label: "Rupture",
      tone: "stock-critical",
      valueClassName: "",
      rowClassName: "variant-stock-row-critical",
    };
  }

  if (normalizedQuantity <= normalizedThreshold) {
    return {
      label: "Stock faible",
      tone: "stock-warning",
      valueClassName: "",
      rowClassName: "variant-stock-row-warning",
    };
  }

  return {
    label: "Disponible",
    tone: "success",
    valueClassName: "",
    rowClassName: "",
  };
};

const createVariantDraft = (variant = null, product = null) => ({
  id: variant?.id || null,
  taille: variant?.size || variant?.taille || "Unique",
  couleur: variant?.color || variant?.couleur || DEFAULT_VARIANT_COLOR,
  valeursVariante: getVariantValuesText(variant),
  codeBarres: variant?.barcode || variant?.codeBarres || "",
  prixAchat: resolveVariantNumber(
    variant?.purchasePrice,
    variant?.prixAchat,
    product?.purchasePrice,
    product?.prixAchat
  ),
  prixVente: resolveVariantNumber(
    variant?.salePrice,
    variant?.prixVente,
    variant?.retailPrice,
    product?.retailPrice,
    product?.prixDetail,
    product?.salePrice,
    product?.prixVente
  ),
  quantiteStock: resolveVariantNumber(variant?.stock, variant?.quantiteStock, 0),
  seuilMinimum: resolveVariantNumber(
    variant?.minimumThreshold,
    variant?.seuilMinimum,
    product?.minimumThreshold,
    product?.seuilMinimum,
    0
  ),
  actif: variant?.active ?? variant?.actif ?? true,
});

const createInitialVariantsState = (product = null) => {
  const variants = getActiveProductVariants(product);
  const sourceVariants = variants.length ? variants : [null];
  return sourceVariants.map((variant) => createVariantDraft(variant, product));
};

const createInitialVariantBuilderState = () => ({
  isOpen: false,
  mode: null,
  selectedSizes: [],
  customSize: "",
  colors: [],
  colorInput: "",
});

const createInitialStocksState = (stores = []) =>
  stores.reduce((accumulator, store) => {
    accumulator[store.id] = "";
    return accumulator;
  }, {});

const createInitialImportResult = () => ({
  success: false,
  importedProducts: 0,
  importedVariants: 0,
  errors: [],
});

const createInitialBarcodeExportState = () => ({
  mode: "products_and_variants",
  productId: "",
});

const getProductWriteUrl = () =>
  api.defaults.baseURL?.replace(/\/api\/?$/, "/products") || "/products";

const getProductsCatalogResource = () => cacheResources.productsCatalog();
const getStoresResource = () => cacheResources.stores();
const getSupplierAccountsResource = () =>
  cacheResources.comptes({
    type: "FOURNISSEUR",
    view: "summary",
  });
const getProductCategoriesResource = () =>
  cacheResources.productCategories({
    activeOnly: true,
  });

const buildSuppliersFromProducts = (products = []) => {
  const suppliersById = new Map();

  products.forEach((product) => {
    const supplierId = Number(
      product?.compteId ?? product?.supplierCompteId ?? product?.supplierId ?? 0
    );
    const supplierName = String(product?.supplierName || "").trim();

    if (!supplierId || !supplierName || suppliersById.has(supplierId)) {
      return;
    }

    suppliersById.set(supplierId, {
      id: supplierId,
      name: supplierName,
      nom: supplierName,
    });
  });

  return Array.from(suppliersById.values()).sort((left, right) =>
    String(left.name || left.nom || "").localeCompare(String(right.name || right.nom || ""), "fr")
  );
};

const buildCategoriesFromProducts = (products = []) => {
  const categoriesById = new Map();

  products.forEach((product) => {
    const categoryId = Number(product?.categoryId ?? 0);
    const categoryName = String(product?.category || product?.categoryFullName || "").trim();
    const categoryFullName = String(product?.categoryFullName || categoryName).trim();
    const categoryCode = String(product?.categoryCode || "").trim();

    if (!categoryId || !categoryName || categoriesById.has(categoryId)) {
      return;
    }

    categoriesById.set(categoryId, {
      id: categoryId,
      code: categoryCode || null,
      name: categoryName,
      nom: categoryName,
      fullName: categoryFullName || categoryName,
      nomComplet: categoryFullName || categoryName,
      active: true,
      actif: true,
    });
  });

  return Array.from(categoriesById.values()).sort((left, right) =>
    String(left.name || left.nom || "").localeCompare(String(right.name || right.nom || ""), "fr")
  );
};

const buildProductPayload = (formData) => ({
  ...(formData.codeBarres.trim() ? { codeBarres: formData.codeBarres.trim() } : {}),
  nom: formData.nom.trim(),
  categorieId: Number(formData.categorieId),
  prixAchat: Number(formData.prixAchat),
  prixVente: Number(formData.prixDetail || formData.prixVente),
  prixDetail: Number(formData.prixDetail),
  seuilMinimum: formData.seuilMinimum === "" ? 0 : Number(formData.seuilMinimum),
  compteId: formData.compteId ? Number(formData.compteId) : null,
  estActif: formData.estActif,
});

const buildInitialStocksPayload = (initialStocksByStore = {}) =>
  Object.entries(initialStocksByStore).reduce((entries, [storeId, quantity]) => {
    const normalizedStoreId = Number(storeId);
    const normalizedQuantity = quantity === "" ? 0 : Number(quantity);

    if (!Number.isInteger(normalizedStoreId) || Number.isNaN(normalizedQuantity)) {
      return entries;
    }

    entries.push({
      storeId: normalizedStoreId,
      quantity: normalizedQuantity,
    });
    return entries;
  }, []);

const formatCompactCount = (value) =>
  new Intl.NumberFormat("fr-MA", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Number(value || 0));

const normalizeProductsCatalogResponse = (payload) => {
  if (Array.isArray(payload)) {
    return {
      products: payload,
      stats: null,
    };
  }

  return {
    products: getCollection(payload, ["products", "data"]),
    stats: payload?.stats || null,
  };
};

const buildProductsSummaryStats = (products = []) =>
  products.reduce(
    (stats, product) => {
      const variants = getProductVariants(product);
      const productStock = Number(product?.stock || 0);

      stats.totalProducts += 1;
      stats.totalVariants += variants.length;

      if (!String(product?.barcode || "").trim()) {
        stats.missingBarcodes += 1;
      }

      if (productStock < 0) {
        stats.negativeStockCount += 1;
      }

      variants.forEach((variant) => {
        if (!String(getVariantBarcodeValue(variant)).trim()) {
          stats.missingBarcodes += 1;
        }

        if (Number(variant?.stock || 0) < 0) {
          stats.negativeStockCount += 1;
        }
      });

      return stats;
    },
    {
      totalProducts: 0,
      totalVariants: 0,
      missingBarcodes: 0,
      negativeStockCount: 0,
    }
  );

function ProductFormFields({
  formData,
  onChange,
  categories,
  isLoadingCategories,
  suppliers,
  isLoadingSuppliers,
  stores,
  storesError,
  isLoadingStores,
  initialStocksByStore,
  onInitialStockChange,
  showInitialStocks = false,
}) {
  const primaryStore = stores[0] || null;
  const defaultSupplier = getDefaultSupplier(suppliers);
  const supplierOptions = defaultSupplier
    ? [defaultSupplier, ...suppliers.filter((supplier) => supplier.id !== defaultSupplier.id)]
    : suppliers;

  return (
    <>
      <div className="field-group">
        <label className="field-label" htmlFor="product-name">
          Nom du produit
        </label>
        <input
          id="product-name"
          className="text-input"
          type="text"
          name="nom"
          value={formData.nom}
          onChange={onChange}
          required
        />
      </div>

      <div className="field-group">
        <label className="field-label" htmlFor="product-barcode">
          Code-barres principal
        </label>
        <input
          id="product-barcode"
          className="text-input"
          type="text"
          name="codeBarres"
          value={formData.codeBarres}
          onChange={onChange}
          placeholder="Optionnel"
        />
      </div>

      <div className="field-group">
        <label className="field-label" htmlFor="product-category">
          {"Cat\u00E9gorie"}
        </label>
        <select
          id="product-category"
          className="text-input select-input"
          name="categorieId"
          value={formData.categorieId}
          onChange={onChange}
          disabled={isLoadingCategories}
          required
        >
          <option value="">
            {isLoadingCategories
              ? "Chargement des categories..."
              : "Selectionner une categorie"}
          </option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name || category.nom}
            </option>
          ))}
        </select>
      </div>

      <div className="field-group">
        <label className="field-label" htmlFor="product-purchase-price">
          Prix d'achat
        </label>
        <input
          id="product-purchase-price"
          className="text-input"
          type="number"
          min="0"
          step="0.01"
          name="prixAchat"
          value={formData.prixAchat}
          onChange={onChange}
          required
        />
      </div>

      <div className="field-group">
        <label className="field-label" htmlFor="product-minimum-threshold">
          Seuil minimum
        </label>
        <input
          id="product-minimum-threshold"
          className="text-input"
          type="number"
          min="0"
          step="1"
          name="seuilMinimum"
          value={formData.seuilMinimum}
          onChange={onChange}
        />
      </div>

      <div className="field-group">
        <label className="field-label" htmlFor="product-retail-price">
          Prix detail
        </label>
        <input
          id="product-retail-price"
          className="text-input"
          type="number"
          min="0"
          step="0.01"
          name="prixDetail"
          value={formData.prixDetail}
          onChange={onChange}
          required
        />
      </div>

      <div className="field-group">
        <label className="field-label" htmlFor="product-supplier">
          Fournisseur
        </label>
        <select
          id="product-supplier"
          className="text-input select-input"
          name="compteId"
          value={formData.compteId}
          onChange={onChange}
          disabled={isLoadingSuppliers}
        >
          <option value={defaultSupplier ? String(defaultSupplier.id) : ""}>
            {isLoadingSuppliers ? "Chargement des fournisseurs..." : DEFAULT_SUPPLIER_NAME}
          </option>
          {supplierOptions.slice(defaultSupplier ? 1 : 0).map((supplier) => (
            <option key={supplier.id} value={supplier.id}>
              {supplier.name || supplier.nom}
            </option>
          ))}
        </select>
      </div>

      <label className="checkbox-field" htmlFor="product-active-status">
        <input
          id="product-active-status"
          type="checkbox"
          name="estActif"
          checked={formData.estActif}
          onChange={onChange}
        />
        <span>Statut actif</span>
      </label>

      <label className="checkbox-field" htmlFor="product-no-variant">
        <input
          id="product-no-variant"
          type="checkbox"
          name="sansVariante"
          checked={Boolean(formData.sansVariante)}
          onChange={onChange}
        />
        <span>Ce produit n'a pas de variante</span>
      </label>

      {showInitialStocks ? (
        <div className="initial-stock-section">
          <div>
            <p className="section-card-title">Stock initial</p>
            <p className="section-card-description">
              Laissez vide pour envoyer 0 sur le magasin SportZone.
            </p>
          </div>

          {storesError ? <div className="inline-notice error">{storesError}</div> : null}

          {isLoadingStores ? (
            <div className="inline-notice info">Chargement des magasins...</div>
          ) : null}

          {!isLoadingStores && !storesError ? (
            primaryStore ? (
              <div className="initial-stock-grid">
                <div className="field-group" key={primaryStore.id}>
                  <label
                    className="field-label"
                    htmlFor={`initial-stock-${primaryStore.id}`}
                  >
                    {primaryStore.name}
                  </label>
                  <input
                    id={`initial-stock-${primaryStore.id}`}
                    className="text-input"
                    type="number"
                    step="1"
                    value={initialStocksByStore[primaryStore.id] ?? ""}
                    onChange={(event) =>
                      onInitialStockChange(primaryStore.id, event.target.value)
                    }
                    placeholder="0"
                  />
                </div>
              </div>
            ) : (
              <div className="inline-notice warning">
                Aucun magasin disponible pour definir le stock initial.
              </div>
            )
          ) : null}
        </div>
      ) : null}
    </>
  );
}

function ProductsPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [products, setProducts] = useState([]);
  const [productsStats, setProductsStats] = useState(null);
  const [suppliers, setSuppliers] = useState([]);
  const [categories, setCategories] = useState([]);
  const [stores, setStores] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingSuppliers, setIsLoadingSuppliers] = useState(true);
  const [isLoadingCategories, setIsLoadingCategories] = useState(true);
  const [isLoadingStores, setIsLoadingStores] = useState(true);
  const [storesError, setStoresError] = useState("");
  const [hasLoadedSuppliersFromApi, setHasLoadedSuppliersFromApi] = useState(false);
  const [hasLoadedCategoriesFromApi, setHasLoadedCategoriesFromApi] = useState(false);
  const [productModal, setProductModal] = useState({
    isOpen: false,
    mode: "add",
    product: null,
  });
  const [productFormData, setProductFormData] = useState(createInitialFormData);
  const [productVariants, setProductVariants] = useState(createInitialVariantsState);
  const [variantBuilder, setVariantBuilder] = useState(createInitialVariantBuilderState);
  const [initialStocksByStore, setInitialStocksByStore] = useState({});
  const [isSubmittingProduct, setIsSubmittingProduct] = useState(false);
  const [productModalError, setProductModalError] = useState("");
  const [barcodeExportModal, setBarcodeExportModal] = useState({
    isOpen: false,
  });
  const [barcodeExportFormData, setBarcodeExportFormData] = useState(
    createInitialBarcodeExportState
  );
  const [isExportingBarcodes, setIsExportingBarcodes] = useState(false);
  const [barcodeExportError, setBarcodeExportError] = useState("");
  const [importModal, setImportModal] = useState({
    isOpen: false,
  });
  const [selectedImportFile, setSelectedImportFile] = useState(null);
  const [isImportingProducts, setIsImportingProducts] = useState(false);
  const [importProductsError, setImportProductsError] = useState("");
  const [importResult, setImportResult] = useState(createInitialImportResult);
  const [deleteModal, setDeleteModal] = useState({
    isOpen: false,
    product: null,
  });
  const [isDeletingProduct, setIsDeletingProduct] = useState(false);
  const [deleteModalError, setDeleteModalError] = useState("");
  const [salesModal, setSalesModal] = useState({
    isOpen: false,
    product: null,
  });
  const [productSales, setProductSales] = useState([]);
  const [isLoadingProductSales, setIsLoadingProductSales] = useState(false);
  const [productSalesError, setProductSalesError] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [notice, setNotice] = useState({ type: "", message: "" });
  const [expandedProductIds, setExpandedProductIds] = useState({});
  const currentUser = getCurrentUser();
  const canManageProducts = currentUser?.role === "admin";

  const applyDerivedReferenceData = useCallback(
    (nextProducts) => {
      if (!canManageProducts) {
        return;
      }

      const derivedSuppliers = buildSuppliersFromProducts(nextProducts);
      const derivedCategories = buildCategoriesFromProducts(nextProducts);

      setSuppliers((current) => (current.length ? current : derivedSuppliers));
      setCategories((current) => (current.length ? current : derivedCategories));
    },
    [canManageProducts]
  );

  const toggleProductVariants = (productId) => {
    setExpandedProductIds((current) => ({
      ...current,
      [productId]: !current[productId],
    }));
  };

  const fetchProducts = async () => {
    const catalogPayload = await refreshCachedResource(getProductsCatalogResource());
    const normalizedCatalog = normalizeProductsCatalogResponse(catalogPayload);

    setProducts(normalizedCatalog.products);
    setProductsStats(normalizedCatalog.stats);
    applyDerivedReferenceData(normalizedCatalog.products);
    return normalizedCatalog.products;
  };

  const fetchSuppliers = async () => {
    const suppliersList = await refreshCachedResource(getSupplierAccountsResource());
    setSuppliers(suppliersList);
    setHasLoadedSuppliersFromApi(true);
    return suppliersList;
  };

  const fetchCategories = async () => {
    const nextCategories = await refreshCachedResource(getProductCategoriesResource());
    setCategories(nextCategories);
    setHasLoadedCategoriesFromApi(true);
    return nextCategories;
  };

  const fetchStores = async () => {
    const nextStores = await refreshCachedResource(getStoresResource());
    setStores(nextStores);
    setStoresError("");
    return nextStores;
  };

  useEffect(() => {
    let isMounted = true;

    async function loadPageData() {
      cleanupLegacyStoreCache();
      setIsLoading(true);
      setIsLoadingSuppliers(false);
      setIsLoadingCategories(false);
      setIsLoadingStores(false);
      setErrorMessage("");
      setStoresError("");
      setHasLoadedSuppliersFromApi(false);
      setHasLoadedCategoriesFromApi(false);

      if (!canManageProducts) {
        setSuppliers([]);
        setCategories([]);
        setStores([]);
      }

      const { hasCachedData, refreshPromise } = hydrateCachedResource({
        resource: getProductsCatalogResource(),
        onCachedData: (cachedProducts) => {
          if (!isMounted) {
            return;
          }

          const normalizedCatalog = normalizeProductsCatalogResponse(cachedProducts);
          setProducts(normalizedCatalog.products);
          setProductsStats(normalizedCatalog.stats);
          applyDerivedReferenceData(normalizedCatalog.products);
          setIsLoading(false);
        },
        onFreshData: (freshProducts) => {
          if (!isMounted) {
            return;
          }

          const normalizedCatalog = normalizeProductsCatalogResponse(freshProducts);
          setProducts(normalizedCatalog.products);
          setProductsStats(normalizedCatalog.stats);
          applyDerivedReferenceData(normalizedCatalog.products);
        },
        onError: (error, cachedEntry) => {
          if (!isMounted || cachedEntry) {
            return;
          }

          setErrorMessage(
            error.response?.data?.message ||
              "Impossible de charger les produits pour le moment."
          );
        },
      });

      if (!hasCachedData && isMounted) {
        setIsLoading(true);
      }

      try {
        await refreshPromise;
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadPageData();

    return () => {
      isMounted = false;
    };
  }, [applyDerivedReferenceData, canManageProducts]);

  const searchResults = useMemo(() => {
    const query = normalizeSearchValue(searchTerm);
    const matchedVariantKeysByProduct = {};

    const filtered = products.filter((product) => {
      if (!query) {
        return true;
      }

      const variants = getProductVariants(product);
      const matchingVariantKeys = variants
        .filter((variant) => {
          const variantLabel = getVariantTypeLabel(variant);

          return (
            normalizeSearchValue(getVariantBarcodeValue(variant)).includes(query) ||
            normalizeSearchValue(getVariantSizeValue(variant)).includes(query) ||
            normalizeSearchValue(getVariantColorValue(variant)).includes(query) ||
            normalizeSearchValue(getVariantValuesText(variant)).includes(query) ||
            normalizeSearchValue(variantLabel).includes(query)
          );
        })
        .map((variant) => getVariantMatchKey(product.id, variant));

      if (matchingVariantKeys.length > 0) {
        matchedVariantKeysByProduct[product.id] = matchingVariantKeys;
      }

      return (
        normalizeSearchValue(product.name).includes(query) ||
        normalizeSearchValue(product.barcode).includes(query) ||
        normalizeSearchValue(product.category).includes(query) ||
        normalizeSearchValue(product.supplierName).includes(query) ||
        matchingVariantKeys.length > 0
      );
    });

    return {
      filteredProducts: filtered,
      matchedVariantKeysByProduct,
    };
  }, [products, searchTerm]);

  const filteredProducts = searchResults.filteredProducts;
  const matchedVariantKeysByProduct = searchResults.matchedVariantKeysByProduct;
  const visibleProductsStats = useMemo(
    () => buildProductsSummaryStats(filteredProducts),
    [filteredProducts]
  );
  const globalProductsStats = useMemo(
    () => productsStats || buildProductsSummaryStats(products),
    [products, productsStats]
  );
  const isSearchActive = Boolean(normalizeSearchValue(searchTerm));

  const ensureSuppliersLoaded = async () => {
    if (!canManageProducts) {
      return [];
    }

    if (suppliers.length && hasLoadedSuppliersFromApi) {
      return suppliers;
    }

    if (suppliers.length) {
      void fetchSuppliers().catch(() => {});
      return suppliers;
    }

    const cachedSuppliers = readCachedResourceData(getSupplierAccountsResource(), []);

    if (cachedSuppliers.length) {
      setSuppliers(cachedSuppliers);
      void fetchSuppliers().catch(() => {});
      return cachedSuppliers;
    }

    if (isLoadingSuppliers) {
      return [];
    }

    setIsLoadingSuppliers(true);

    try {
      return await fetchSuppliers();
    } finally {
      setIsLoadingSuppliers(false);
    }
  };

  const ensureCategoriesLoaded = async () => {
    if (!canManageProducts) {
      return [];
    }

    if (categories.length && hasLoadedCategoriesFromApi) {
      return categories;
    }

    if (categories.length) {
      void fetchCategories().catch(() => {});
      return categories;
    }

    const cachedCategories = readCachedResourceData(getProductCategoriesResource(), []);

    if (cachedCategories.length) {
      setCategories(cachedCategories);
      void fetchCategories().catch(() => {});
      return cachedCategories;
    }

    if (isLoadingCategories) {
      return [];
    }

    setIsLoadingCategories(true);

    try {
      return await fetchCategories();
    } finally {
      setIsLoadingCategories(false);
    }
  };

  const ensureStoresLoaded = async () => {
    if (!canManageProducts) {
      return [];
    }

    if (stores.length) {
      return stores;
    }

    const cachedStores = readCachedResourceData(getStoresResource(), []);

    if (cachedStores.length) {
      setStores(cachedStores);
      void fetchStores().catch(() => {});
      return cachedStores;
    }

    if (isLoadingStores) {
      return [];
    }

    setIsLoadingStores(true);
    setStoresError("");

    try {
      return await fetchStores();
    } catch (error) {
      setStoresError(
        error.response?.data?.message ||
          "Impossible de charger les magasins pour le stock initial."
      );
      throw error;
    } finally {
      setIsLoadingStores(false);
    }
  };

  const openProductModal = async (mode, product = null) => {
    setNotice({ type: "", message: "" });
    setProductModalError("");
    setProductFormData(createInitialFormData(product, suppliers));
    setProductVariants(createInitialVariantsState(product));
    setVariantBuilder(createInitialVariantBuilderState());
    setInitialStocksByStore(createInitialStocksState(stores));
    setProductModal({
      isOpen: true,
      mode,
      product,
    });

    try {
      const loadedSuppliers = await ensureSuppliersLoaded();
      const [, loadedStores] = await Promise.all([
        ensureCategoriesLoaded(),
        ensureStoresLoaded(),
      ]);
      const resolvedSuppliers =
        Array.isArray(loadedSuppliers) && loadedSuppliers.length ? loadedSuppliers : suppliers;
      const resolvedStores =
        Array.isArray(loadedStores) && loadedStores.length ? loadedStores : stores;

      setProductFormData(createInitialFormData(product, resolvedSuppliers));

      if (mode === "add") {
        setInitialStocksByStore(createInitialStocksState(resolvedStores));
      }
    } catch (error) {
      setProductModalError(
        error.response?.data?.message ||
          "Impossible de charger les donnees necessaires pour le produit."
      );
    }
  };

  const closeProductModal = () => {
    if (isSubmittingProduct) {
      return;
    }

    setProductModal({
      isOpen: false,
      mode: "add",
      product: null,
    });
    setProductFormData(createInitialFormData(null, suppliers));
    setProductVariants(createInitialVariantsState());
    setVariantBuilder(createInitialVariantBuilderState());
    setInitialStocksByStore(createInitialStocksState(stores));
    setProductModalError("");
  };

  const resetProductModal = () => {
    setProductModal({
      isOpen: false,
      mode: "add",
      product: null,
    });
    setProductFormData(createInitialFormData(null, suppliers));
    setProductVariants(createInitialVariantsState());
    setVariantBuilder(createInitialVariantBuilderState());
    setInitialStocksByStore(createInitialStocksState(stores));
    setProductModalError("");
  };

  const openBarcodeExportModal = () => {
    setNotice({ type: "", message: "" });
    setBarcodeExportError("");
    setBarcodeExportFormData(createInitialBarcodeExportState());
    setBarcodeExportModal({
      isOpen: true,
    });
  };

  const closeBarcodeExportModal = () => {
    if (isExportingBarcodes) {
      return;
    }

    setBarcodeExportModal({
      isOpen: false,
    });
    setBarcodeExportFormData(createInitialBarcodeExportState());
    setBarcodeExportError("");
  };

  const handleBarcodeExportFormChange = (event) => {
    const { name, value } = event.target;

    setBarcodeExportError("");
    setBarcodeExportFormData((current) => ({
      ...current,
      [name]: value,
    }));
  };

  const handleSubmitBarcodeExport = async (event) => {
    event.preventDefault();

    if (
      barcodeExportFormData.mode === "selected_product" &&
      !barcodeExportFormData.productId
    ) {
      setBarcodeExportError("Veuillez selectionner un produit a exporter.");
      return;
    }

    try {
      setIsExportingBarcodes(true);
      setBarcodeExportError("");

      const response = await api.exportProductBarcodesPdf(
        {
          mode: barcodeExportFormData.mode,
          productId: barcodeExportFormData.productId
            ? Number(barcodeExportFormData.productId)
            : undefined,
        },
        {
          responseType: "blob",
        }
      );

      const filename =
        barcodeExportFormData.mode === "selected_product"
          ? "code-barres-produit.pdf"
          : "codes-barres-produits.pdf";

      downloadBlob(response, filename);
      closeBarcodeExportModal();
      setNotice({
        type: "success",
        message: "Export des codes-barres genere avec succes.",
      });
    } catch (error) {
      if (error.response?.data instanceof Blob) {
        const message = await error.response.data.text();
        setBarcodeExportError(message || "Impossible d'exporter les codes-barres.");
      } else {
        setBarcodeExportError(
          error.response?.data?.message ||
            "Impossible d'exporter les codes-barres pour le moment."
        );
      }
    } finally {
      setIsExportingBarcodes(false);
    }
  };

  const openImportModal = () => {
    setNotice({ type: "", message: "" });
    setImportProductsError("");
    setImportResult(createInitialImportResult());
    setSelectedImportFile(null);
    setImportModal({
      isOpen: true,
    });
  };

  const closeImportModal = () => {
    if (isImportingProducts) {
      return;
    }

    setImportModal({
      isOpen: false,
    });
    setSelectedImportFile(null);
    setImportProductsError("");
    setImportResult(createInitialImportResult());
  };

  const handleImportFileChange = (event) => {
    setImportProductsError("");
    setImportResult(createInitialImportResult());
    setSelectedImportFile(event.target.files?.[0] || null);
  };

  const handleSubmitProductImport = async (event) => {
    event.preventDefault();

    if (!selectedImportFile) {
      setImportProductsError("Veuillez selectionner un fichier .xlsx ou .csv.");
      return;
    }

    try {
      setIsImportingProducts(true);
      setImportProductsError("");

      const response = await api.importProducts(selectedImportFile);
      const result = response.data || createInitialImportResult();
      setImportResult({
        success: Boolean(result.success),
        importedProducts: Number(result.importedProducts || 0),
        importedVariants: Number(result.importedVariants || 0),
        errors: Array.isArray(result.errors) ? result.errors : [],
      });

      invalidateDomainCaches("products:", "stock:", "stock-alerts");
      await fetchProducts();

      if (canManageProducts) {
        await fetchCategories();
      }

      setNotice({
        type: result.errors?.length ? "warning" : "success",
        message: result.errors?.length
          ? "Import termine avec quelques erreurs."
          : "Produits importes avec succes.",
      });
    } catch (error) {
      setImportProductsError(
        error.response?.data?.message ||
          "Impossible d'importer les produits pour le moment."
      );
    } finally {
      setIsImportingProducts(false);
    }
  };

  const openSalesModal = async (product) => {
    setSalesModal({
      isOpen: true,
      product,
    });
    setProductSales([]);
    setProductSalesError("");
    setIsLoadingProductSales(true);

    try {
      const response = await api.getProductSales(product.id);
      setProductSales(getProductSalesCollection(response.data));
    } catch (error) {
      setProductSalesError(
        error.response?.data?.message ||
          "Impossible de charger les ventes de ce produit pour le moment."
      );
    } finally {
      setIsLoadingProductSales(false);
    }
  };

  const closeSalesModal = () => {
    setSalesModal({
      isOpen: false,
      product: null,
    });
    setProductSales([]);
    setProductSalesError("");
    setIsLoadingProductSales(false);
  };

  const openDeleteModal = (product) => {
    setNotice({ type: "", message: "" });
    setDeleteModalError("");
    setDeleteModal({
      isOpen: true,
      product,
    });
  };

  const closeDeleteModal = () => {
    if (isDeletingProduct) {
      return;
    }

    setDeleteModal({
      isOpen: false,
      product: null,
    });
    setDeleteModalError("");
  };

  const resetDeleteModal = () => {
    setDeleteModal({
      isOpen: false,
      product: null,
    });
    setDeleteModalError("");
  };

  const handleFormChange = (event) => {
    const { name, value, type, checked } = event.target;
    const nextValue = type === "checkbox" ? checked : value;

    setProductModalError("");
    setProductFormData((current) => ({
      ...current,
      [name]: nextValue,
    }));

    if (name === "sansVariante" && nextValue) {
      setVariantBuilder(createInitialVariantBuilderState());
    }
  };

  const handleInitialStockChange = (storeId, value) => {
    setProductModalError("");
    setInitialStocksByStore((current) => ({
      ...current,
      [storeId]: value,
    }));
  };

  const handleVariantChange = (index, field, value, type = "text") => {
    setProductModalError("");
    setProductVariants((current) =>
      current.map((variant, variantIndex) =>
        variantIndex === index
          ? (() => {
              const nextVariant = {
                ...variant,
                [field]: type === "checkbox" ? value : value,
              };

              if (field === "taille" || field === "couleur") {
                const previousGeneratedValues = buildVariantValuesText(
                  variant.taille,
                  variant.couleur
                );
                const nextGeneratedValues = buildVariantValuesText(
                  field === "taille" ? value : nextVariant.taille,
                  field === "couleur" ? value : nextVariant.couleur
                );
                const currentValuesText = String(variant.valeursVariante || "").trim();

                if (!currentValuesText || currentValuesText === previousGeneratedValues) {
                  nextVariant.valeursVariante = nextGeneratedValues;
                }
              }

              return nextVariant;
            })()
          : variant
      )
    );
  };

  const handleOpenVariantBuilder = () => {
    setProductModalError("");
    setVariantBuilder((current) => ({
      ...current,
      isOpen: !current.isOpen,
      mode: current.isOpen ? null : current.mode,
    }));
  };

  const handleSelectVariantMode = (mode) => {
    setProductModalError("");
    setVariantBuilder((current) => ({
      ...current,
      isOpen: true,
      mode,
      selectedSizes:
        mode === "color"
          ? []
          : current.selectedSizes,
      colors: mode === "size" ? [] : current.colors,
    }));
  };

  const handleToggleBuilderSize = (size) => {
    setProductModalError("");
    setVariantBuilder((current) => {
      const normalizedSize = size.trim();
      const hasSize = current.selectedSizes.includes(normalizedSize);

      return {
        ...current,
        selectedSizes: hasSize
          ? current.selectedSizes.filter((entry) => entry !== normalizedSize)
          : [...current.selectedSizes, normalizedSize],
      };
    });
  };

  const handleBuilderInputChange = (field, value) => {
    setProductModalError("");
    setVariantBuilder((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const handleAddCustomSize = () => {
    const normalizedSize = variantBuilder.customSize.trim();

    if (!normalizedSize) {
      return;
    }

    setVariantBuilder((current) => ({
      ...current,
      selectedSizes: current.selectedSizes.includes(normalizedSize)
        ? current.selectedSizes
        : [...current.selectedSizes, normalizedSize],
      customSize: "",
    }));
  };

  const handleAddColor = () => {
    const normalizedColor = variantBuilder.colorInput.trim();

    if (!normalizedColor) {
      return;
    }

    setVariantBuilder((current) => ({
      ...current,
      colors: current.colors.includes(normalizedColor)
        ? current.colors
        : [...current.colors, normalizedColor],
      colorInput: "",
    }));
  };

  const handleRemoveColor = (color) => {
    setVariantBuilder((current) => ({
      ...current,
      colors: current.colors.filter((entry) => entry !== color),
    }));
  };

  const handleGenerateVariants = () => {
    if (!variantBuilder.mode) {
      setProductModalError("Choisissez d'abord un type de variante.");
      return;
    }

    const selectedSizes =
      variantBuilder.mode === "color"
        ? ["Unique"]
        : variantBuilder.selectedSizes.filter(Boolean);
    const selectedColors =
      variantBuilder.mode === "size"
        ? [DEFAULT_VARIANT_COLOR]
        : variantBuilder.colors.filter(Boolean);

    if (
      (variantBuilder.mode === "size" || variantBuilder.mode === "sizeColor") &&
      !selectedSizes.length
    ) {
      setProductModalError("Selectionnez au moins une taille.");
      return;
    }

    if (
      (variantBuilder.mode === "color" || variantBuilder.mode === "sizeColor") &&
      !selectedColors.length
    ) {
      setProductModalError("Ajoutez au moins une couleur.");
      return;
    }

    const combinations =
      variantBuilder.mode === "size"
        ? selectedSizes.map((taille) => ({
            taille,
            couleur: DEFAULT_VARIANT_COLOR,
          }))
        : variantBuilder.mode === "color"
        ? selectedColors.map((couleur) => ({
            taille: "Unique",
            couleur,
          }))
        : selectedSizes.flatMap((taille) =>
            selectedColors.map((couleur) => ({
              taille,
              couleur,
            }))
          );

    setProductVariants((current) => {
      const shouldReplaceDefaultOnly =
        current.length === 1 &&
        !current[0].id &&
        isDefaultVariantDraft(current[0]);
      const baseVariants = shouldReplaceDefaultOnly ? [] : current;
      const existingByKey = new Map(
        baseVariants.map((variant) => [
          normalizeVariantKey(variant.taille, variant.couleur),
          variant,
        ])
      );

      for (const combination of combinations) {
        const key = normalizeVariantKey(combination.taille, combination.couleur);

        if (!existingByKey.has(key)) {
          existingByKey.set(key, {
            ...createVariantDraft(),
            taille: combination.taille,
            couleur: combination.couleur,
            valeursVariante: buildVariantValuesText(
              combination.taille,
              combination.couleur
            ),
            prixAchat: productFormData.prixAchat || "0",
            prixVente: productFormData.prixDetail || productFormData.prixVente || "0",
            seuilMinimum: productFormData.seuilMinimum || "0",
            quantiteStock: "0",
            actif: true,
          });
        }
      }

      return Array.from(existingByKey.values());
    });

    setVariantBuilder((current) => ({
      ...current,
      isOpen: false,
      mode: null,
    }));
  };

  const handleResetToDefaultVariant = () => {
    setProductModalError("");
    setProductVariants([createVariantDraft()]);
    setVariantBuilder(createInitialVariantBuilderState());
  };

  const handleRemoveVariant = (index) => {
    setProductVariants((current) =>
      current.length === 1
        ? [createVariantDraft()]
        : current.filter((_, variantIndex) => variantIndex !== index)
    );
  };

  const validateForm = (formData) => {
    if (!formData.nom.trim()) {
      return "Le nom du produit est obligatoire.";
    }

    if (!formData.categorieId) {
      return "La categorie est obligatoire.";
    }

    if (formData.prixAchat === "") {
      return "Le prix d'achat est obligatoire.";
    }

    if (formData.prixDetail === "") {
      return "Le prix detail est obligatoire.";
    }

    if (formData.sansVariante) {
      for (const value of Object.values(initialStocksByStore)) {
        if (value !== "" && Number.isNaN(Number(value))) {
          return "Le stock initial doit contenir une quantite valide.";
        }
      }

      return "";
    }

    if (!productVariants.length) {
      return "Au moins une variante est obligatoire.";
    }

    for (const variant of productVariants) {
      if (!String(variant.taille || "").trim()) {
        return "Chaque variante doit contenir une taille.";
      }

      if (variant.prixAchat === "" || Number(variant.prixAchat) < 0) {
        return "Chaque variante doit contenir un prix d'achat valide.";
      }

      if (variant.prixVente === "" || Number(variant.prixVente) < 0) {
        return "Chaque variante doit contenir un prix de vente valide.";
      }

      if (variant.quantiteStock === "" || Number.isNaN(Number(variant.quantiteStock))) {
        return "Chaque variante doit contenir un stock valide.";
      }
    }

    const seenVariantBarcodes = new Set();

    for (const variant of productVariants) {
      const normalizedVariantBarcode = String(variant.codeBarres || "")
        .trim()
        .toLowerCase();

      if (!normalizedVariantBarcode) {
        continue;
      }

      if (seenVariantBarcodes.has(normalizedVariantBarcode)) {
        return "Ce code-barres de variante est deja utilise";
      }

      seenVariantBarcodes.add(normalizedVariantBarcode);
    }

    return "";
  };

  const handleSubmitProduct = async (event) => {
    event.preventDefault();

    const validationMessage = validateForm(productFormData);

    if (validationMessage) {
      setProductModalError(validationMessage);
      return;
    }

    try {
      setIsSubmittingProduct(true);
      setProductModalError("");

      const payload = {
        ...buildProductPayload(productFormData),
        variants: productFormData.sansVariante
          ? []
          : productVariants.map((variant) => ({
              ...(variant.id ? { id: variant.id } : {}),
              taille: variant.taille.trim(),
              couleur: variant.couleur.trim() || DEFAULT_VARIANT_COLOR,
              valeursVariante:
                String(
                  variant.valeursVariante ||
                    buildVariantValuesText(variant.taille, variant.couleur)
                ).trim() || null,
              codeBarres: variant.codeBarres.trim() || null,
              prixAchat: Number(variant.prixAchat || productFormData.prixAchat || 0),
              prixVente: Number(variant.prixVente || productFormData.prixDetail || 0),
              quantiteStock:
                variant.quantiteStock === "" ? 0 : Number(variant.quantiteStock),
              seuilMinimum:
                variant.seuilMinimum === "" ? 0 : Number(variant.seuilMinimum),
              actif: variant.actif,
            })),
      };

      if (productFormData.sansVariante && productModal.mode === "add") {
        payload.initialStocks = buildInitialStocksPayload(initialStocksByStore);
      }

      if (productModal.mode === "edit" && productModal.product?.id) {
        await api.put(`${getProductWriteUrl()}/${productModal.product.id}`, payload);
      } else {
        await api.post(getProductWriteUrl(), payload);
      }

      invalidateDomainCaches("products:", "stock:", "stock-alerts");
      await fetchProducts();
      resetProductModal();
      setNotice({
        type: "success",
        message:
          productModal.mode === "edit"
            ? "Produit modifi\u00E9 avec succ\u00E8s."
            : "Produit ajout\u00E9 avec succ\u00E8s.",
      });
    } catch (error) {
      setProductModalError(
        error.response?.data?.message ||
          (productModal.mode === "edit"
            ? "Impossible de modifier le produit pour le moment."
            : "Impossible d'ajouter le produit pour le moment.")
      );
    } finally {
      setIsSubmittingProduct(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteModal.product?.id) {
      return;
    }

    try {
      setIsDeletingProduct(true);
      setDeleteModalError("");

      await api.delete(`${getProductWriteUrl()}/${deleteModal.product.id}`);
      invalidateDomainCaches("products:", "stock:", "stock-alerts");
      await fetchProducts();
      resetDeleteModal();
      setNotice({
        type: "success",
        message: "Produit supprim\u00E9 avec succ\u00E8s.",
      });
    } catch (error) {
      setDeleteModalError(
        error.response?.data?.message ||
          "Impossible de supprimer le produit pour le moment."
      );
    } finally {
      setIsDeletingProduct(false);
    }
  };

  const productModalTitle =
    productModal.mode === "edit" ? "Modifier le produit" : "Ajouter un produit";
  const productModalEyebrow =
    productModal.mode === "edit" ? "Edition produit" : "Nouveau produit";
  const productModalDescription =
    productModal.mode === "edit"
      ? "Mettez \u00E0 jour les informations du produit s\u00E9lectionn\u00E9."
      : "Renseignez les informations principales pour ajouter une nouvelle reference au catalogue, avec ou sans variante.";
  const productModalSubmitLabel =
    productModal.mode === "edit"
      ? isSubmittingProduct
        ? "Enregistrement..."
        : "Enregistrer"
      : isSubmittingProduct
      ? "Ajout en cours..."
      : "Ajouter produit";

  const isSimpleProduct = Boolean(productFormData.sansVariante);

  return (
    <div>
      <PageHeader
        eyebrow="Catalog"
        title="Produits"
        description="Piloter les references, les prix et la disponibilite produit du magasin SportZone."
        actions={
          canManageProducts ? (
            <>
              <button
                className="ghost-button"
                type="button"
                onClick={openBarcodeExportModal}
              >
                Exporter codes-barres
              </button>
              <button
                className="ghost-button"
                type="button"
                onClick={openImportModal}
              >
                Importer produits
              </button>
              <button
                className="primary-button"
                type="button"
                onClick={() => openProductModal("add")}
              >
                Ajouter produit
              </button>
            </>
          ) : null
        }
      />

      {notice.message ? (
        <div className={`inline-notice ${notice.type}`}>{notice.message}</div>
      ) : null}

      <div className="card-grid">
        <StatCard
          label="Total produits"
          value={formatCompactCount(globalProductsStats.totalProducts)}
          detail={
            isSearchActive
              ? `${formatCompactCount(visibleProductsStats.totalProducts)} affiches`
              : "Catalogue complet"
          }
          tone="info"
        />
        <StatCard
          label="Total variantes"
          value={formatCompactCount(globalProductsStats.totalVariants)}
          detail={
            isSearchActive
              ? `${formatCompactCount(visibleProductsStats.totalVariants)} visibles`
              : "Toutes variantes confondues"
          }
          tone="default"
        />
        <StatCard
          label="Sans code-barres"
          value={formatCompactCount(globalProductsStats.missingBarcodes)}
          detail={
            isSearchActive
              ? `${formatCompactCount(visibleProductsStats.missingBarcodes)} visibles`
              : "Produits et variantes"
          }
          tone="warning"
        />
        <StatCard
          label="Stock negatif"
          value={formatCompactCount(globalProductsStats.negativeStockCount)}
          detail={
            isSearchActive
              ? `${formatCompactCount(visibleProductsStats.negativeStockCount)} visibles`
              : "Produits et variantes"
          }
          tone="danger"
        />
      </div>

      <SectionCard
        title="Catalogue produits"
        description="Rechercher une reference par nom, categorie, code-barres ou texte de variante."
      >
        <div className="table-toolbar">
            <SearchInput
              value={searchTerm}
              onChange={setSearchTerm}
              placeholder="Rechercher par nom, code-barres, categorie ou variante"
            />
        </div>

        {errorMessage ? (
          <div className="inline-notice error">{errorMessage}</div>
        ) : null}

        <DataTable
          columns={[
            { key: "product", label: "Produit" },
            { key: "barcode", label: "Code-barres" },
            { key: "supplier", label: "Fournisseur" },
            { key: "category", label: "Categorie" },
            { key: "purchasePrice", label: "Prix achat" },
            { key: "retailPrice", label: "Prix detail" },
            { key: "status", label: "Statut" },
            { key: "actions", label: "Actions" },
          ]}
          data={filteredProducts}
          emptyTitle={isLoading ? "Chargement des produits..." : "Aucun produit trouve"}
          emptyDescription={
            isLoading
              ? "Veuillez patienter pendant la recuperation des donnees."
              : "Essayez un autre nom, code-barres, categorie ou texte de variante."
          }
          renderRow={(product) => {
            const variants = getProductVariants(product);
            const hasMultipleVariants = variants.length > 1;
            const matchedVariantKeys = new Set(
              matchedVariantKeysByProduct[product.id] || []
            );
            const isExpanded = Boolean(
              expandedProductIds[product.id] || matchedVariantKeys.size > 0
            );
            const shouldShowVariantDetails = Boolean(
              isExpanded && (hasMultipleVariants || matchedVariantKeys.size > 0)
            );

            return (
              <Fragment key={product.id}>
                <tr>
                  <td>
                    <strong>{product.name}</strong>
                    <div className="muted-text product-variant-summary">
                      <span>{variants.length ? `${variants.length} variante${variants.length > 1 ? "s" : ""}` : "Sans variante"}</span>
                      {hasMultipleVariants ? (
                        <button
                          className={`variant-toggle-button ${
                            isExpanded ? "expanded" : ""
                          }`}
                          type="button"
                          onClick={() => toggleProductVariants(product.id)}
                          aria-expanded={isExpanded}
                          aria-label={
                            isExpanded
                              ? `Masquer les variantes de ${product.name}`
                              : `Afficher les variantes de ${product.name}`
                          }
                        >
                          <span className="variant-toggle-chevron" aria-hidden="true">
                            ▾
                          </span>
                        </button>
                      ) : null}
                    </div>
                  </td>
                  <td>{product.barcode || "-"}</td>
                  <td>{product.supplierName || "-"}</td>
                  <td>{product.category}</td>
                  <td>{formatCurrencyDh(product.purchasePrice || 0)}</td>
                  <td>{formatCurrencyDh(product.retailPrice || 0)}</td>
                  <td>
                    <Badge tone={product.active ? "success" : "warning"}>
                      {product.active ? "Actif" : "Inactif"}
                    </Badge>
                  </td>
                  <td>
                    <div className="table-action-row">
                      {canManageProducts ? (
                        <button
                          className="table-action-button"
                          type="button"
                          onClick={() => openProductModal("edit", product)}
                        >
                          Edit
                        </button>
                      ) : null}
                      <button
                        className="table-action-button"
                        type="button"
                        onClick={() => openSalesModal(product)}
                      >
                        Ventes
                      </button>
                      {canManageProducts ? (
                        <button
                          className="table-action-button danger"
                          type="button"
                          onClick={() => openDeleteModal(product)}
                        >
                          Delete
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
                {shouldShowVariantDetails ? (
                  <tr className="variant-detail-row">
                    <td colSpan={8}>
                      <div className="variant-subtable-shell">
                        <table className="variant-subtable">
                          <thead>
                            <tr>
                              <th>Variante</th>
                              <th>Code-barres</th>
                              <th>Stock</th>
                              <th>Statut</th>
                              <th>Qte vendue</th>
                              <th>CA</th>
                              <th>Tickets</th>
                            </tr>
                          </thead>
                          <tbody>
                            {variants.map((variant) => {
                              const stockMeta = getStockPresentationMeta(
                                variant.stock,
                                variant.minimumThreshold
                              );

                              return (
                                <tr
                                  key={getVariantMatchKey(product.id, variant)}
                                  className={stockMeta.rowClassName}
                                  data-search-match={
                                    matchedVariantKeys.has(
                                      getVariantMatchKey(product.id, variant)
                                    )
                                      ? "true"
                                      : "false"
                                  }
                                >
                                  <td>
                                    <strong>{getVariantTypeLabel(variant)}</strong>
                                  </td>
                                  <td>{variant.barcode || "-"}</td>
                                  <td>
                                    <span className={stockMeta.valueClassName}>
                                      {formatQuantityValue(variant.stock)}
                                    </span>
                                  </td>
                                  <td>
                                    <Badge tone={stockMeta.tone}>{stockMeta.label}</Badge>
                                  </td>
                                  <td>{formatQuantityValue(variant.quantitySold)}</td>
                                  <td>{formatCurrencyDh(variant.revenue || 0)}</td>
                                  <td>{variant.ticketsCount || 0}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          }}
        />
      </SectionCard>

      <Modal
        isOpen={barcodeExportModal.isOpen}
        eyebrow="Export codes-barres"
        title="Exporter codes-barres"
        description="Generez un PDF imprimable avec les codes-barres produits et variantes."
        onClose={closeBarcodeExportModal}
        actions={
          <>
            <button
              className="ghost-button"
              type="button"
              onClick={closeBarcodeExportModal}
              disabled={isExportingBarcodes}
            >
              Annuler
            </button>
            <button
              className="primary-button"
              type="submit"
              form="barcode-export-form"
              disabled={isExportingBarcodes}
            >
              {isExportingBarcodes ? "Generation PDF..." : "Exporter PDF"}
            </button>
          </>
        }
      >
        <form
          className="import-products-form"
          id="barcode-export-form"
          onSubmit={handleSubmitBarcodeExport}
        >
          {barcodeExportError ? (
            <div className="inline-notice error">{barcodeExportError}</div>
          ) : null}

          <div className="field-group">
            <label className="field-label" htmlFor="barcode-export-mode">
              Contenu a exporter
            </label>
            <select
              id="barcode-export-mode"
              className="text-input select-input"
              name="mode"
              value={barcodeExportFormData.mode}
              onChange={handleBarcodeExportFormChange}
            >
              <option value="all_products">Tous les produits</option>
              <option value="selected_product">Produit selectionne</option>
              <option value="variants_only">Variantes seulement</option>
              <option value="products_and_variants">Produits + variantes</option>
            </select>
          </div>

          {barcodeExportFormData.mode === "selected_product" ? (
            <div className="field-group">
              <label className="field-label" htmlFor="barcode-export-product">
                Produit
              </label>
              <select
                id="barcode-export-product"
                className="text-input select-input"
                name="productId"
                value={barcodeExportFormData.productId}
                onChange={handleBarcodeExportFormChange}
              >
                <option value="">Selectionner un produit</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {[product.name, product.barcode].filter(Boolean).join(" - ")}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <div className="inline-notice info">
            Les produits sans code-barres sont ignores dans cet export. Les codes EAN-13 et les anciens codes restent exportables pour compatibilite.
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={importModal.isOpen}
        eyebrow="Import produits"
        title="Importer produits"
        description="Chargez un fichier Excel ou CSV avec une ligne par variante. Formats acceptes: ancien format `nom, codeBarres, categorie, prixAchat, prixVente, stock, taille, couleur` ou nouveau format `nom, codeBarres, categorie, cout, prixVente, quantiteDisponible, valeursVariante`. Si codeBarres est vide, aucun code-barres ne sera genere."
        onClose={closeImportModal}
        actions={
          <>
            <button
              className="ghost-button"
              type="button"
              onClick={closeImportModal}
              disabled={isImportingProducts}
            >
              Fermer
            </button>
            <button
              className="primary-button"
              type="submit"
              form="product-import-form"
              disabled={isImportingProducts}
            >
              {isImportingProducts ? "Import en cours..." : "Lancer import"}
            </button>
          </>
        }
      >
        <form
          className="import-products-form"
          id="product-import-form"
          onSubmit={handleSubmitProductImport}
        >
          {importProductsError ? (
            <div className="inline-notice error">{importProductsError}</div>
          ) : null}

          <div className="field-group">
            <label className="field-label" htmlFor="products-import-file">
              Fichier Excel ou CSV
            </label>
            <input
              id="products-import-file"
              className="text-input import-file-input"
              type="file"
              accept=".xlsx,.csv"
              onChange={handleImportFileChange}
            />
            <p className="muted-text">
              {selectedImportFile
                ? `Fichier selectionne: ${selectedImportFile.name}`
                : "Formats supportes: .xlsx et .csv"}
            </p>
          </div>

          <div className="inline-notice info">
            Chaque ligne cree une variante. Les produits partageant le meme nom seront regroupes sous un seul produit parent.
          </div>

          {importResult.success ? (
            <div className="import-result-panel">
              <div className="inline-notice success">
                {importResult.importedProducts} produits et {importResult.importedVariants} variantes importes.
              </div>

              {importResult.errors.length ? (
                <div className="import-error-list">
                  <p className="field-label">Lignes avec erreurs</p>
                  <ul>
                    {importResult.errors.map((entry, index) => (
                      <li key={`${entry.row || index}-${entry.message || index}`}>
                        Ligne {entry.row || "-"}{entry.product ? ` - ${entry.product}` : ""}:{" "}
                        {entry.message || "Erreur d'import."}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}
        </form>
      </Modal>

      <Modal
        isOpen={productModal.isOpen}
        eyebrow={productModalEyebrow}
        title={productModalTitle}
        description={productModalDescription}
        onClose={closeProductModal}
        cardClassName="modal-large product-modal"
        actions={
          <>
            <button
              className="ghost-button"
              type="button"
              onClick={closeProductModal}
              disabled={isSubmittingProduct}
            >
              Annuler
            </button>
            <button
              className="primary-button"
              type="submit"
              form="product-form"
              disabled={isSubmittingProduct}
            >
              {productModalSubmitLabel}
            </button>
          </>
        }
      >
        <form className="form-grid" id="product-form" onSubmit={handleSubmitProduct}>
          {productModalError ? (
            <div className="inline-notice error">{productModalError}</div>
          ) : null}

          <ProductFormFields
            formData={productFormData}
            onChange={handleFormChange}
            categories={categories}
            isLoadingCategories={isLoadingCategories}
            suppliers={suppliers}
            isLoadingSuppliers={isLoadingSuppliers}
            stores={stores}
            storesError={storesError}
            isLoadingStores={isLoadingStores}
            initialStocksByStore={initialStocksByStore}
            onInitialStockChange={handleInitialStockChange}
            showInitialStocks={productModal.mode === "add" && isSimpleProduct}
          />

          {isSimpleProduct ? (
            <div className="inline-notice info">
              Ce produit sera cree sans variante. Le stock et le prix de vente seront portes par
              la fiche produit principale.
            </div>
          ) : (
            <div className="initial-stock-section">
              <div className="table-toolbar">
                <div>
                  <p className="section-card-title">Variantes produit</p>
                  <p className="section-card-description">
                    Generez d'abord les variantes par taille et couleur, puis renseignez le stock
                    de chaque combinaison.
                  </p>
                  <p className="section-card-description">
                    Les codes-barres des variantes restent optionnels.
                  </p>
                </div>
                <div className="variant-builder-actions">
                  <button
                    className="ghost-button"
                    type="button"
                    onClick={handleOpenVariantBuilder}
                  >
                    Ajouter variante
                  </button>
                  <button
                    className="ghost-button"
                    type="button"
                    onClick={handleResetToDefaultVariant}
                  >
                    Variante par defaut
                  </button>
                </div>
              </div>

              {variantBuilder.isOpen ? (
                <div className="variant-builder-panel">
                  <div className="variant-mode-row">
                    {Object.entries(VARIANT_MODE_LABELS).map(([mode, label]) => (
                      <button
                        key={mode}
                        className={`period-button ${
                          variantBuilder.mode === mode ? "active" : ""
                        }`}
                        type="button"
                        onClick={() => handleSelectVariantMode(mode)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  {variantBuilder.mode === "size" || variantBuilder.mode === "sizeColor" ? (
                    <div className="variant-builder-block">
                      <p className="field-label">Tailles</p>
                      <div className="variant-chip-grid">
                        {DEFAULT_SIZE_OPTIONS.map((size) => (
                          <button
                            key={size}
                            className={`variant-chip ${
                              variantBuilder.selectedSizes.includes(size) ? "active" : ""
                            }`}
                            type="button"
                            onClick={() => handleToggleBuilderSize(size)}
                          >
                            {size}
                          </button>
                        ))}
                      </div>

                      <div className="variant-inline-form">
                        <input
                          className="text-input"
                          type="text"
                          placeholder="Ajouter une taille personnalisee"
                          value={variantBuilder.customSize}
                          onChange={(event) =>
                            handleBuilderInputChange("customSize", event.target.value)
                          }
                        />
                        <button
                          className="ghost-button"
                          type="button"
                          onClick={handleAddCustomSize}
                        >
                          Ajouter taille
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {variantBuilder.mode === "color" || variantBuilder.mode === "sizeColor" ? (
                    <div className="variant-builder-block">
                      <p className="field-label">Couleurs</p>
                      <div className="variant-inline-form">
                        <input
                          className="text-input"
                          type="text"
                          placeholder="Rouge, Noir, Bleu, Blanc..."
                          value={variantBuilder.colorInput}
                          onChange={(event) =>
                            handleBuilderInputChange("colorInput", event.target.value)
                          }
                        />
                        <button
                          className="ghost-button"
                          type="button"
                          onClick={handleAddColor}
                        >
                          Ajouter couleur
                        </button>
                      </div>

                      {variantBuilder.colors.length ? (
                        <div className="variant-chip-grid">
                          {variantBuilder.colors.map((color) => (
                            <button
                              key={color}
                              className="variant-chip active"
                              type="button"
                              onClick={() => handleRemoveColor(color)}
                            >
                              {color}
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  <div className="variant-inline-form end">
                    <button
                      className="ghost-button"
                      type="button"
                      onClick={() => setVariantBuilder(createInitialVariantBuilderState())}
                    >
                      Fermer
                    </button>
                    <button
                      className="primary-button"
                      type="button"
                      onClick={handleGenerateVariants}
                    >
                      Generer variantes
                    </button>
                  </div>
                </div>
              ) : null}

              <div className="table-wrapper product-variant-edit-wrap">
                <table className="data-table product-variant-edit-table">
                  <thead>
                    <tr>
                      <th>Taille</th>
                      <th>Couleur</th>
                      <th>Valeurs variante</th>
                      <th>Code-barres</th>
                      <th>Prix achat</th>
                      <th>Prix vente</th>
                      <th>Stock</th>
                      <th>Seuil mini</th>
                      <th>Actif</th>
                      <th>Supprimer</th>
                    </tr>
                  </thead>
                  <tbody>
                    {productVariants.map((variant, index) => (
                      <tr key={variant.id || `variant-${index}`}>
                      <td>
                        <input
                          className="text-input variant-input"
                          type="text"
                          value={variant.taille}
                          onChange={(event) =>
                            handleVariantChange(index, "taille", event.target.value)
                          }
                        />
                      </td>
                      <td>
                        <input
                          className="text-input variant-input"
                          type="text"
                          value={variant.couleur}
                          onChange={(event) =>
                            handleVariantChange(index, "couleur", event.target.value)
                          }
                        />
                      </td>
                      <td>
                        <input
                          className="text-input variant-input"
                          type="text"
                          value={variant.valeursVariante}
                          onChange={(event) =>
                            handleVariantChange(
                              index,
                              "valeursVariante",
                              event.target.value
                            )
                          }
                          placeholder="Ex: Pointure:42 / Couleur:Noir"
                        />
                      </td>
                      <td>
                        <input
                          className="text-input variant-input"
                          type="text"
                          value={variant.codeBarres}
                          onChange={(event) =>
                            handleVariantChange(index, "codeBarres", event.target.value)
                          }
                          placeholder={
                            variant.id ? "Code-barres variante" : "Optionnel"
                          }
                        />
                      </td>
                      <td>
                        <input
                          className="text-input variant-input"
                          type="number"
                          min="0"
                          step="0.01"
                          value={variant.prixAchat}
                          onChange={(event) =>
                            handleVariantChange(index, "prixAchat", event.target.value)
                          }
                        />
                      </td>
                      <td>
                        <input
                          className="text-input variant-input"
                          type="number"
                          min="0"
                          step="0.01"
                          value={variant.prixVente}
                          onChange={(event) =>
                            handleVariantChange(index, "prixVente", event.target.value)
                          }
                        />
                      </td>
                      <td>
                        <input
                          className="text-input variant-input"
                          type="number"
                          step="1"
                          value={variant.quantiteStock}
                          onChange={(event) =>
                            handleVariantChange(index, "quantiteStock", event.target.value)
                          }
                        />
                      </td>
                      <td>
                        <input
                          className="text-input variant-input"
                          type="number"
                          min="0"
                          step="1"
                          value={variant.seuilMinimum}
                          onChange={(event) =>
                            handleVariantChange(index, "seuilMinimum", event.target.value)
                          }
                        />
                      </td>
                      <td>
                        <input
                          type="checkbox"
                          checked={variant.actif}
                          onChange={(event) =>
                            handleVariantChange(
                              index,
                              "actif",
                              event.target.checked,
                              "checkbox"
                            )
                          }
                        />
                      </td>
                      <td>
                        <button
                          className="table-action-button danger"
                          type="button"
                          onClick={() => handleRemoveVariant(index)}
                        >
                          Retirer
                        </button>
                      </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </form>
      </Modal>

      <Modal
        isOpen={salesModal.isOpen}
        eyebrow="Ventes produit"
        title={
          salesModal.product ? `Ventes - ${salesModal.product.name}` : "Ventes du produit"
        }
        description="Historique des lignes de vente enregistrees pour ce produit et ses variantes."
        onClose={closeSalesModal}
        cardClassName="modal-large"
        actions={
          <button className="ghost-button" type="button" onClick={closeSalesModal}>
            Fermer
          </button>
        }
      >
        {productSalesError ? (
          <div className="inline-notice error">{productSalesError}</div>
        ) : null}

        <DataTable
          columns={[
            { key: "ticket", label: "Ticket" },
            { key: "date", label: "Date" },
            { key: "client", label: "Client" },
            { key: "quantity", label: "Quantite vendue" },
            { key: "unitPrice", label: "Prix unitaire vendu" },
            { key: "lineTotal", label: "Total ligne" },
            { key: "status", label: "Statut facture" },
          ]}
          data={productSales}
          emptyTitle={
            isLoadingProductSales ? "Chargement des ventes..." : "Aucune vente trouvee"
          }
          emptyDescription={
            isLoadingProductSales
              ? "Veuillez patienter pendant la recuperation de l'historique."
              : "Ce produit n'apparait encore dans aucune facture."
          }
          renderRow={(sale) => {
            const statusMeta = getProductSaleStatusMeta(sale);

            return (
              <tr key={sale.id}>
                <td>
                  <strong>{sale.ticketNumber || "-"}</strong>
                </td>
                <td>{sale.date ? formatDateTime(sale.date) : "-"}</td>
                <td>{sale.customerName || "Client inconnu"}</td>
                <td>
                  <div className="table-cell-stack">
                    <span>{formatQuantityValue(sale.quantity)}</span>
                    {sale.variantLabel ? (
                      <span className="muted-text">{sale.variantLabel}</span>
                    ) : null}
                  </div>
                </td>
                <td>{formatCurrencyDh(sale.unitPrice || 0)}</td>
                <td>{formatCurrencyDh(sale.lineTotal || 0)}</td>
                <td>
                  <Badge tone={statusMeta.tone}>{statusMeta.label}</Badge>
                </td>
              </tr>
            );
          }}
        />
      </Modal>

      <Modal
        isOpen={deleteModal.isOpen}
        eyebrow="Suppression produit"
        title="Supprimer ce produit"
        description={"\u00CAtes-vous s\u00FBr de vouloir supprimer ce produit ?"}
        onClose={closeDeleteModal}
        actions={
          <>
            <button
              className="ghost-button"
              type="button"
              onClick={closeDeleteModal}
              disabled={isDeletingProduct}
            >
              Annuler
            </button>
            <button
              className="table-action-button danger"
              type="button"
              onClick={handleConfirmDelete}
              disabled={isDeletingProduct}
            >
              {isDeletingProduct ? "Suppression..." : "Supprimer"}
            </button>
          </>
        }
      >
        {deleteModalError ? (
          <div className="inline-notice error">{deleteModalError}</div>
        ) : null}

        {deleteModal.product ? (
          <div className="delete-product-summary">
            <p className="delete-product-name">{deleteModal.product.name}</p>
            <p className="delete-product-meta">
              Code-barres: {deleteModal.product.barcode || "-"}
            </p>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

export default ProductsPage;
