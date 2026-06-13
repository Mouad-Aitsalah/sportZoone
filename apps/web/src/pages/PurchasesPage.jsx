import { useEffect, useMemo, useState } from "react";
import Badge from "../components/Badge";
import DataTable from "../components/DataTable";
import Modal from "../components/Modal";
import PageHeader from "../components/PageHeader";
import SectionCard from "../components/SectionCard";
import api from "../services/api";
import { invalidateDomainCaches } from "../utils/appCache";
import { formatCurrencyDh } from "../utils/formatters";

const getTodayString = () => new Date().toISOString().slice(0, 10);

const createProductLookupLabel = (product) =>
  [product.barcode, product.displayName || product.name].filter(Boolean).join(" - ");

const buildVariantLabel = (variant) => {
  const values = String(variant?.valeursVariante || "").trim();

  if (values) {
    return values;
  }

  return [variant?.taille, variant?.couleur].filter(Boolean).join(" / ");
};

const getProductVariants = (product) => {
  const variantsSource = Array.isArray(product?.variants)
    ? product.variants
    : Array.isArray(product?.variantes)
    ? product.variantes
    : Array.isArray(product?.productVariants)
    ? product.productVariants
    : [];

  return variantsSource.filter((variant) => (variant?.active ?? variant?.actif ?? true) !== false);
};

const createEmptyPurchaseLine = () => ({
  rowId: `purchase-line-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  productId: "",
  variantId: "",
  productLookup: "",
  productCode: "",
  productName: "",
  variantLabel: "",
  category: "",
  quantity: "1",
  prixAchat: "",
  prixDetail: "",
});

const createInitialPurchaseForm = () => {
  const today = getTodayString();

  return {
    numeroAchat: "Automatique a l'enregistrement",
    compteFournisseurId: "",
    dateAchat: today,
    modeReglement: "ESPECE",
    dateReglement: today,
    numeroCheque: "",
    observations: "",
    pointDeVenteId: "",
    lignes: [createEmptyPurchaseLine()],
  };
};

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

const normalizeSupplier = (supplier) => ({
  id: Number(supplier?.id),
  name: supplier?.name || supplier?.nom || "Fournisseur",
  accountNumber: supplier?.accountNumber || supplier?.numeroCompte || "",
});

const normalizeProductEntries = (product) => {
  const baseProduct = {
    id: Number(product?.id),
    name: product?.name || product?.nom || "Produit",
    barcode: product?.barcode || product?.codeBarres || "",
    category: product?.category || product?.categorie || "",
    purchasePrice: Number(product?.purchasePrice ?? product?.prixAchat ?? 0),
    retailPrice: Number(
      product?.retailPrice ?? product?.prixDetail ?? product?.salePrice ?? product?.prixVente ?? 0
    ),
  };
  const activeVariants = getProductVariants(product);

  if (!activeVariants.length) {
    return [
      {
        ...baseProduct,
        variantId: null,
        variantLabel: "",
        displayName: baseProduct.name,
      },
    ];
  }

  return activeVariants.map((variant) => {
    const variantLabel = buildVariantLabel(variant) || "Sans variante";

    return {
      ...baseProduct,
      variantId: Number(variant?.id),
      variantLabel,
      displayName: `${baseProduct.name} - ${variantLabel}`,
      barcode: variant?.barcode || variant?.codeBarres || baseProduct.barcode,
      purchasePrice: Number(
        variant?.purchasePrice ?? variant?.prixAchat ?? baseProduct.purchasePrice
      ),
      retailPrice: Number(
        variant?.retailPrice ??
          variant?.salePrice ??
          variant?.prixDetail ??
          variant?.prixVente ??
          baseProduct.retailPrice
      ),
    };
  });
};

const normalizeStore = (store) => ({
  id: Number(store?.id),
  name: store?.name || store?.nom || "Magasin",
});

const normalizePurchaseLine = (line) => ({
  id: line?.id || `line-${Date.now()}`,
  productId: Number(line?.productId ?? line?.produitId ?? 0),
  variantId: line?.variantId ?? line?.varianteId ?? null,
  productName: line?.productName || line?.produitNom || line?.product?.name || "-",
  variantLabel: line?.variantLabel || line?.varianteNom || "",
  quantity: Number(line?.quantity ?? line?.quantite ?? 0),
  purchasePriceHT: Number(
    line?.purchasePriceHT ?? line?.prixAchatUnitaireHT ?? line?.purchasePrice ?? 0
  ),
  totalHT: Number(line?.totalHT ?? 0),
  retailPrice: Number(line?.retailPrice ?? line?.prixDetail ?? 0),
});

const normalizePurchase = (purchase) => ({
  id: purchase?.id || `purchase-${Date.now()}`,
  purchaseNumber:
    purchase?.purchaseNumber || purchase?.numeroAchat || purchase?.reference || `ACH-${Date.now()}`,
  supplierId: Number(
    purchase?.compteFournisseurId ??
      purchase?.supplierCompteId ??
      purchase?.supplierId ??
      purchase?.fournisseurId ??
      0
  ),
  supplierName:
    purchase?.supplierName || purchase?.fournisseurNom || purchase?.supplier?.name || "-",
  purchaseDate: purchase?.purchaseDate || purchase?.dateAchat || purchase?.date || "",
  paymentMode: purchase?.paymentMode || purchase?.modeReglement || "-",
  settlementDate: purchase?.paymentDate || purchase?.dateReglement || "",
  checkNumber: purchase?.checkNumber || purchase?.numeroCheque || "",
  observations: purchase?.observations || purchase?.commentaire || "",
  totalHT: Number(purchase?.totalHT ?? 0),
  totalTVA: Number(purchase?.totalTVA ?? 0),
  totalTTC: Number(purchase?.totalTTC ?? purchase?.totalHT ?? purchase?.total ?? purchase?.totalAmount ?? 0),
  status: purchase?.status || purchase?.statut || "ENREGISTRE",
  storeId: Number(purchase?.storeId ?? purchase?.pointDeVenteId ?? 0),
  storeName: purchase?.storeName || purchase?.pointDeVenteNom || purchase?.store?.name || "-",
  lignes: getCollection(purchase, ["lignes", "items"]).map(normalizePurchaseLine),
});

const formatDateValue = (value) => {
  if (!value) {
    return "-";
  }

  const parsedDate = new Date(value);
  return Number.isNaN(parsedDate.getTime())
    ? String(value).slice(0, 10)
    : parsedDate.toLocaleDateString("fr-MA");
};

const getStatusTone = (status) => {
  if (status === "PAYE") {
    return "success";
  }

  if (status === "CREDIT_EN_ATTENTE") {
    return "warning";
  }

  return "info";
};

const findProductByLookup = (lookupValue, products) => {
  const normalizedLookup = String(lookupValue || "").trim().toLowerCase();

  if (!normalizedLookup) {
    return null;
  }

  return (
    products.find((product) => createProductLookupLabel(product).toLowerCase() === normalizedLookup) ||
    products.find((product) => String(product.barcode || "").toLowerCase() === normalizedLookup) ||
    products.find(
      (product) =>
        String(product.displayName || product.name || "").toLowerCase() === normalizedLookup
    )
  );
};

function PurchasesPage() {
  const [purchases, setPurchases] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [stores, setStores] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [notice, setNotice] = useState({ type: "", message: "" });
  const [errorMessage, setErrorMessage] = useState("");
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [purchaseFormData, setPurchaseFormData] = useState(createInitialPurchaseForm);
  const [purchaseEditorError, setPurchaseEditorError] = useState("");
  const [isSubmittingPurchase, setIsSubmittingPurchase] = useState(false);
  const [selectedPurchase, setSelectedPurchase] = useState(null);

  const productLookupOptions = useMemo(
    () =>
      products.map((product) => ({
        id: `${product.id}-${product.variantId || "simple"}`,
        label: createProductLookupLabel(product),
      })),
    [products]
  );

  const fetchPurchases = async () => {
    const response = await api.getPurchases();
    return getCollection(response.data, ["data", "purchases"]).map(normalizePurchase);
  };

  useEffect(() => {
    let isMounted = true;

    async function loadPageData() {
      try {
        setIsLoading(true);
        setErrorMessage("");
        setNotice({ type: "", message: "" });

        const [purchasesResult, suppliersResult, productsResult, storesResult] =
          await Promise.allSettled([
            fetchPurchases(),
            api.getSupplierAccounts(),
            api.getProducts({ params: { includePagination: false } }),
            api.getStores(),
          ]);

        if (!isMounted) {
          return;
        }

        const purchasesList =
          purchasesResult.status === "fulfilled" ? purchasesResult.value : [];
        const suppliersList =
          suppliersResult.status === "fulfilled"
            ? getCollection(suppliersResult.value.data, ["data", "comptes"]).map(
                normalizeSupplier
              )
            : [];
        const productsList =
          productsResult.status === "fulfilled"
            ? getCollection(productsResult.value.data, ["data", "products"]).flatMap(
                normalizeProductEntries
              )
            : [];
        const storesList =
          storesResult.status === "fulfilled"
            ? getCollection(storesResult.value.data, ["data", "stores"]).map(normalizeStore)
            : [];

        setPurchases(purchasesList);
        setSuppliers(suppliersList);
        setProducts(productsList);
        setStores(storesList);

        if (purchasesResult.status !== "fulfilled") {
          setErrorMessage(
            purchasesResult.reason?.response?.data?.message ||
              "Impossible de charger les achats pour le moment."
          );
        }
      } catch (error) {
        if (isMounted) {
          setPurchases([]);
          setSuppliers([]);
          setProducts([]);
          setStores([]);
          setErrorMessage(
            error.response?.data?.message ||
              "Impossible de charger les achats pour le moment."
          );
        }
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
  }, []);

  const computedLines = useMemo(
    () =>
      purchaseFormData.lignes.map((line) => {
        const quantity = Number(line.quantity || 0);
        const purchasePriceHT = Number(line.prixAchat || 0);
        const totalHT = quantity * purchasePriceHT;

        return {
          ...line,
          quantity,
          purchasePriceHT,
          totalHT,
        };
      }),
    [purchaseFormData.lignes]
  );

  const totals = useMemo(
    () =>
      computedLines.reduce(
        (accumulator, line) => ({
          totalHT: accumulator.totalHT + line.totalHT,
          totalTVA: 0,
          totalTTC: accumulator.totalTTC + line.totalHT,
        }),
        {
          totalHT: 0,
          totalTVA: 0,
          totalTTC: 0,
        }
      ),
    [computedLines]
  );

  const openPurchaseEditor = () => {
    setNotice({ type: "", message: "" });
    setPurchaseEditorError("");
    setPurchaseFormData(createInitialPurchaseForm());
    setIsEditorOpen(true);
  };

  const closePurchaseEditor = () => {
    if (isSubmittingPurchase) {
      return;
    }

    setIsEditorOpen(false);
    setPurchaseEditorError("");
    setPurchaseFormData(createInitialPurchaseForm());
  };

  const handleTopLevelChange = (event) => {
    const { name, value } = event.target;

    setPurchaseEditorError("");
    setPurchaseFormData((current) => {
      const nextState = {
        ...current,
        [name]: value,
      };

      if (name === "modeReglement" && value === "ESPECE") {
        nextState.dateReglement = current.dateAchat;
        nextState.numeroCheque = "";
      }

      if (name === "dateAchat" && current.modeReglement === "ESPECE") {
        nextState.dateReglement = value;
      }

      return nextState;
    });
  };

  const applySelectedProductToLine = (rowId, product) => {
    setPurchaseFormData((current) => ({
      ...current,
      lignes: current.lignes.map((line) => {
        if (line.rowId !== rowId) {
          return line;
        }

        return {
          ...line,
          productId: String(product.id),
          variantId: product.variantId ? String(product.variantId) : "",
          productLookup: createProductLookupLabel(product),
          productCode: product.barcode,
          productName: product.displayName || product.name,
          variantLabel: product.variantLabel || "",
          category: product.category,
          prixAchat: String(product.purchasePrice || 0),
          prixDetail: String(product.retailPrice || 0),
        };
      }),
    }));
  };

  const handleLineChange = (rowId, field, value) => {
    setPurchaseEditorError("");

    if (field === "productLookup") {
      setPurchaseFormData((current) => ({
        ...current,
        lignes: current.lignes.map((line) =>
          line.rowId === rowId ? { ...line, productLookup: value } : line
        ),
      }));

      const matchingProduct = findProductByLookup(value, products);

      if (matchingProduct) {
        applySelectedProductToLine(rowId, matchingProduct);
      }

      return;
    }

    if (field === "productId") {
      const product = products.find((entry) => entry.id === Number(value));

      if (product) {
        applySelectedProductToLine(rowId, product);
      }

      return;
    }

    setPurchaseFormData((current) => ({
      ...current,
      lignes: current.lignes.map((line) =>
        line.rowId === rowId ? { ...line, [field]: value } : line
      ),
    }));
  };

  const handleAddLine = () => {
    setPurchaseFormData((current) => ({
      ...current,
      lignes: [...current.lignes, createEmptyPurchaseLine()],
    }));
  };

  const handleRemoveLine = (rowId) => {
    setPurchaseFormData((current) => ({
      ...current,
      lignes:
        current.lignes.length === 1
          ? current.lignes
          : current.lignes.filter((line) => line.rowId !== rowId),
    }));
  };

  const validatePurchaseForm = () => {
    if (!purchaseFormData.compteFournisseurId) {
      return "Le fournisseur est obligatoire.";
    }

    if (!purchaseFormData.dateAchat) {
      return "La date d'achat est obligatoire.";
    }

    if (!purchaseFormData.pointDeVenteId) {
      return "Le point de vente concerne est obligatoire.";
    }

    if (purchaseFormData.modeReglement === "CREDIT" && !purchaseFormData.dateReglement) {
      return "La date de reglement est obligatoire pour un achat a credit.";
    }

    if (purchaseFormData.modeReglement === "CHEQUE" && !purchaseFormData.numeroCheque.trim()) {
      return "Le numero de cheque est obligatoire pour un reglement par cheque.";
    }

    if (!purchaseFormData.lignes.length) {
      return "Au moins une ligne produit est obligatoire.";
    }

    const productKeys = new Set();

    for (const line of purchaseFormData.lignes) {
      if (!line.productId) {
        return "Chaque ligne doit contenir un produit valide.";
      }

      const lineKey = `${line.productId}:${line.variantId || "simple"}`;

      if (productKeys.has(lineKey)) {
        return "Chaque produit ou variante ne peut apparaitre qu'une seule fois dans l'achat.";
      }

      productKeys.add(lineKey);

      if (!Number.isFinite(Number(line.quantity)) || Number(line.quantity) <= 0) {
        return "La quantite achetee doit etre superieure a 0.";
      }

      if (
        !Number.isFinite(Number(line.prixAchat)) ||
        Number(line.prixAchat) < 0
      ) {
        return "Le prix d'achat doit etre superieur ou egal a 0.";
      }

      if (!Number.isFinite(Number(line.prixDetail)) || Number(line.prixDetail) < 0) {
        return "Le prix detail doit etre superieur ou egal a 0.";
      }
    }

    return "";
  };

  const handlePrintDraft = () => {
    if (typeof window !== "undefined") {
      window.print();
    }
  };

  const handleCreatePurchase = async (event) => {
    event.preventDefault();

    const validationMessage = validatePurchaseForm();

    if (validationMessage) {
      setPurchaseEditorError(validationMessage);
      return;
    }

    const payload = {
      compteFournisseurId: Number(purchaseFormData.compteFournisseurId),
      dateAchat: purchaseFormData.dateAchat,
      modeReglement: purchaseFormData.modeReglement,
      dateReglement:
        purchaseFormData.modeReglement === "ESPECE"
          ? purchaseFormData.dateAchat
          : purchaseFormData.dateReglement || null,
      numeroCheque:
        purchaseFormData.modeReglement === "CHEQUE"
          ? purchaseFormData.numeroCheque.trim()
          : null,
      observations: purchaseFormData.observations.trim(),
      pointDeVenteId: Number(purchaseFormData.pointDeVenteId),
      lignes: purchaseFormData.lignes.map((line) => ({
        produitId: Number(line.productId),
        varianteId: line.variantId ? Number(line.variantId) : null,
        quantite: Number(line.quantity),
        prixAchatUnitaireHT: Number(line.prixAchat),
        prixDetail: Number(line.prixDetail),
      })),
    };

    try {
      setIsSubmittingPurchase(true);
      setPurchaseEditorError("");
      const response = await api.createPurchase(payload);
      const createdPurchase = normalizePurchase(response.data?.data || response.data);
      const refreshedPurchases = await fetchPurchases();
      invalidateDomainCaches("stock:", "stock-alerts", "products:");

      setPurchases(refreshedPurchases);
      setNotice({
        type: "success",
        message: `Achat ${createdPurchase.purchaseNumber} enregistre avec succes.`,
      });
      closePurchaseEditor();
    } catch (error) {
      setPurchaseEditorError(
        error.response?.data?.message ||
          "Impossible d'enregistrer l'achat pour le moment."
      );
    } finally {
      setIsSubmittingPurchase(false);
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow="Achats"
        title="Gestion des achats"
        description="Enregistrer les achats fournisseurs dans une presentation simple avec quantite, prix achat et prix detail."
        actions={
          <button
            className="primary-button"
            type="button"
            onClick={isEditorOpen ? closePurchaseEditor : openPurchaseEditor}
          >
            {isEditorOpen ? "Fermer le bon d'achat" : "Nouvel achat"}
          </button>
        }
      />

      {notice.message ? (
        <div className={`inline-notice ${notice.type}`}>{notice.message}</div>
      ) : null}

      {isEditorOpen ? (
        <SectionCard
          title="Bon d'achat"
          description="Informations generales en haut, lignes produits au centre et recapitulatif simple en bas."
        >
          <form className="purchase-voucher" id="purchase-form" onSubmit={handleCreatePurchase}>
            {purchaseEditorError ? (
              <div className="inline-notice error">{purchaseEditorError}</div>
            ) : null}

            <div className="purchase-voucher-header">
              <div>
                <p className="purchase-voucher-eyebrow">Nouvel achat</p>
                <h3 className="purchase-voucher-title">Bon d'achat fournisseur</h3>
              </div>
              <div className="purchase-voucher-number">
                <span>Numero achat</span>
                <strong>{purchaseFormData.numeroAchat}</strong>
              </div>
            </div>

            <div className="purchase-voucher-grid">
              <div className="field-group">
                <label className="field-label" htmlFor="purchase-supplier">
                  Fournisseur
                </label>
                <select
                  id="purchase-supplier"
                  className="text-input select-input"
                  name="compteFournisseurId"
                  value={purchaseFormData.compteFournisseurId}
                  onChange={handleTopLevelChange}
                >
                  <option value="">Selectionner un fournisseur</option>
                  {suppliers.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.accountNumber ? `${supplier.accountNumber} - ` : ""}
                      {supplier.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field-group">
                <label className="field-label" htmlFor="purchase-date">
                  Date achat
                </label>
                <input
                  id="purchase-date"
                  className="text-input"
                  type="date"
                  name="dateAchat"
                  value={purchaseFormData.dateAchat}
                  onChange={handleTopLevelChange}
                />
              </div>

              <div className="field-group">
                <label className="field-label" htmlFor="purchase-payment-mode">
                  Mode de reglement
                </label>
                <select
                  id="purchase-payment-mode"
                  className="text-input select-input"
                  name="modeReglement"
                  value={purchaseFormData.modeReglement}
                  onChange={handleTopLevelChange}
                >
                  <option value="ESPECE">Espece</option>
                  <option value="CHEQUE">Cheque</option>
                  <option value="CREDIT">Credit</option>
                </select>
              </div>

              <div className="field-group">
                <label className="field-label" htmlFor="purchase-settlement-date">
                  Date reglement
                </label>
                <input
                  id="purchase-settlement-date"
                  className="text-input"
                  type="date"
                  name="dateReglement"
                  value={
                    purchaseFormData.modeReglement === "ESPECE"
                      ? purchaseFormData.dateAchat
                      : purchaseFormData.dateReglement
                  }
                  onChange={handleTopLevelChange}
                  disabled={purchaseFormData.modeReglement === "ESPECE"}
                />
              </div>

              <div className="field-group">
                <label className="field-label" htmlFor="purchase-store">
                  Point de vente
                </label>
                <select
                  id="purchase-store"
                  className="text-input select-input"
                  name="pointDeVenteId"
                  value={purchaseFormData.pointDeVenteId}
                  onChange={handleTopLevelChange}
                >
                  <option value="">Selectionner un point de vente</option>
                  {stores.map((store) => (
                    <option key={store.id} value={store.id}>
                      {store.name}
                    </option>
                  ))}
                </select>
              </div>

              {purchaseFormData.modeReglement === "CHEQUE" ? (
                <div className="field-group">
                  <label className="field-label" htmlFor="purchase-check-number">
                    Numero cheque
                  </label>
                  <input
                    id="purchase-check-number"
                    className="text-input"
                    type="text"
                    name="numeroCheque"
                    value={purchaseFormData.numeroCheque}
                    onChange={handleTopLevelChange}
                    placeholder="CHQ-2026-001"
                  />
                </div>
              ) : null}

              <div className="field-group purchase-voucher-grid-span">
                <label className="field-label" htmlFor="purchase-observations">
                  Observations / commentaire
                </label>
                <input
                  id="purchase-observations"
                  className="text-input"
                  type="text"
                  name="observations"
                  value={purchaseFormData.observations}
                  onChange={handleTopLevelChange}
                  placeholder="Notes internes, reference document, precision fournisseur..."
                />
              </div>
            </div>

            <div className="purchase-voucher-table-wrap">
              <div className="purchase-voucher-table-toolbar">
                <div>
                  <p className="section-card-title">Lignes produits</p>
                  <p className="section-card-description">
                    Recherchez un produit par code ou designation puis ajustez la quantite, le prix achat et le prix detail.
                  </p>
                </div>
                <button className="ghost-button" type="button" onClick={handleAddLine}>
                  Ajouter ligne
                </button>
              </div>

              <div className="purchase-voucher-table-shell">
                <table className="purchase-voucher-table">
                  <thead>
                    <tr>
                      <th>Code produit</th>
                      <th>Produit / Designation</th>
                      <th>Categorie</th>
                      <th>Quantite</th>
                      <th>Prix achat</th>
                      <th>Prix detail</th>
                      <th>Total achat</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {purchaseFormData.lignes.map((line) => {
                      const computedLine =
                        computedLines.find((entry) => entry.rowId === line.rowId) || {
                          totalHT: 0,
                        };

                      return (
                        <tr key={line.rowId}>
                          <td>
                            <input
                              className="text-input"
                              type="text"
                              value={line.productCode}
                              readOnly
                              placeholder="Auto"
                            />
                          </td>
                          <td>
                            <input
                              className="text-input"
                              type="text"
                              list="purchase-products-list"
                              value={line.productLookup}
                              onChange={(event) =>
                                handleLineChange(line.rowId, "productLookup", event.target.value)
                              }
                              placeholder="Code ou designation produit"
                            />
                          </td>
                          <td>
                            <input
                              className="text-input"
                              type="text"
                              value={line.category}
                              readOnly
                              placeholder="Categorie"
                            />
                          </td>
                          <td>
                            <input
                              className="text-input"
                              type="number"
                              min="1"
                              step="1"
                              value={line.quantity}
                              onChange={(event) =>
                                handleLineChange(line.rowId, "quantity", event.target.value)
                              }
                            />
                          </td>
                          <td>
                            <input
                              className="text-input"
                              type="number"
                              min="0"
                              step="0.01"
                              value={line.prixAchat}
                              onChange={(event) =>
                                handleLineChange(
                                  line.rowId,
                                  "prixAchat",
                                  event.target.value
                                )
                              }
                            />
                          </td>
                          <td>
                            <input
                              className="text-input"
                              type="number"
                              min="0"
                              step="0.01"
                              value={line.prixDetail}
                              onChange={(event) =>
                                handleLineChange(line.rowId, "prixDetail", event.target.value)
                              }
                            />
                          </td>
                          <td>
                            <div className="purchase-voucher-cell-total">
                              {formatCurrencyDh(computedLine.totalHT)}
                            </div>
                          </td>
                          <td>
                            <button
                              className="table-action-button danger"
                              type="button"
                              onClick={() => handleRemoveLine(line.rowId)}
                              disabled={purchaseFormData.lignes.length === 1}
                            >
                              Supprimer
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="purchase-voucher-footer">
              <div className="purchase-voucher-actions">
                <button
                  className="primary-button"
                  type="submit"
                  disabled={isSubmittingPurchase}
                >
                  {isSubmittingPurchase ? "Enregistrement..." : "Enregistrer"}
                </button>
                <button
                  className="ghost-button"
                  type="button"
                  onClick={closePurchaseEditor}
                  disabled={isSubmittingPurchase}
                >
                  Annuler
                </button>
                <button className="secondary-button" type="button" onClick={handlePrintDraft}>
                  Imprimer
                </button>
              </div>

              <div className="purchase-voucher-totals">
              <div className="purchase-voucher-total-row">
                  <span>Total achat</span>
                  <strong>{formatCurrencyDh(totals.totalHT)}</strong>
                </div>
                <div className="purchase-voucher-total-row grand">
                  <span>Total</span>
                  <strong>{formatCurrencyDh(totals.totalTTC)}</strong>
                </div>
              </div>
            </div>
          </form>

          <datalist id="purchase-products-list">
            {productLookupOptions.map((product) => (
              <option key={product.id} value={product.label} />
            ))}
          </datalist>
        </SectionCard>
      ) : null}

      <SectionCard
        title="Suivi des achats"
        description="Consultez les achats enregistres avec leur mode de reglement et leur montant total."
      >
        {errorMessage ? <div className="inline-notice warning">{errorMessage}</div> : null}

        <DataTable
          columns={[
            { key: "purchaseNumber", label: "Numero achat" },
            { key: "supplier", label: "Fournisseur" },
            { key: "purchaseDate", label: "Date achat" },
            { key: "paymentMode", label: "Reglement" },
            { key: "settlementDate", label: "Date reglement" },
            { key: "totalHT", label: "Total achat" },
            { key: "totalTTC", label: "Total" },
            { key: "status", label: "Statut" },
            { key: "store", label: "Point de vente" },
            { key: "actions", label: "Actions" },
          ]}
          data={purchases}
          emptyTitle={isLoading ? "Chargement des achats..." : "Aucun achat enregistre"}
          emptyDescription={
            isLoading
              ? "Recuperation des achats en cours."
              : "Ajoutez un nouvel achat pour commencer le suivi."
          }
          renderRow={(purchase) => (
            <tr key={purchase.id}>
              <td>
                <strong>{purchase.purchaseNumber}</strong>
              </td>
              <td>{purchase.supplierName}</td>
              <td>{formatDateValue(purchase.purchaseDate)}</td>
              <td>{purchase.paymentMode}</td>
              <td>{formatDateValue(purchase.settlementDate)}</td>
              <td>{formatCurrencyDh(purchase.totalHT)}</td>
              <td>{formatCurrencyDh(purchase.totalTTC)}</td>
              <td>
                <Badge tone={getStatusTone(purchase.status)}>{purchase.status}</Badge>
              </td>
              <td>{purchase.storeName}</td>
              <td>
                <button
                  className="table-action-button"
                  type="button"
                  onClick={() => setSelectedPurchase(purchase)}
                >
                  Voir
                </button>
              </td>
            </tr>
          )}
        />
      </SectionCard>

      <Modal
        isOpen={Boolean(selectedPurchase)}
        eyebrow="Details achat"
        title={selectedPurchase?.purchaseNumber || "Achat"}
        description="Consultez les lignes et les montants enregistres pour cet achat."
        onClose={() => setSelectedPurchase(null)}
        actions={
          <button
            className="ghost-button"
            type="button"
            onClick={() => setSelectedPurchase(null)}
          >
            Fermer
          </button>
        }
      >
        {selectedPurchase ? (
          <div style={{ display: "grid", gap: "16px" }}>
            <div className="form-grid">
              <div className="detail-stat">
                <span>Fournisseur</span>
                <strong>{selectedPurchase.supplierName}</strong>
              </div>
              <div className="detail-stat">
                <span>Point de vente</span>
                <strong>{selectedPurchase.storeName}</strong>
              </div>
              <div className="detail-stat">
                <span>Reglement</span>
                <strong>{selectedPurchase.paymentMode}</strong>
              </div>
              <div className="detail-stat">
                <span>Statut</span>
                <strong>{selectedPurchase.status}</strong>
              </div>
              <div className="detail-stat">
                <span>Numero cheque</span>
                <strong>{selectedPurchase.checkNumber || "-"}</strong>
              </div>
              <div className="detail-stat">
                <span>Observations</span>
                <strong>{selectedPurchase.observations || "-"}</strong>
              </div>
            </div>

            <DataTable
              columns={[
                { key: "product", label: "Produit" },
                { key: "quantity", label: "Quantite" },
                { key: "purchasePriceHT", label: "Prix achat" },
                { key: "totalHT", label: "Total achat" },
                { key: "totalTTC", label: "Total" },
              ]}
              data={selectedPurchase.lignes}
              emptyTitle="Aucune ligne"
              emptyDescription="Cet achat ne contient aucune ligne produit."
              renderRow={(line) => (
                <tr key={line.id}>
                  <td>
                    {[line.productName, line.variantLabel].filter(Boolean).join(" - ")}
                  </td>
                  <td>{line.quantity}</td>
                  <td>{formatCurrencyDh(line.purchasePriceHT)}</td>
                  <td>{formatCurrencyDh(line.totalHT)}</td>
                  <td>{formatCurrencyDh(line.totalTTC)}</td>
                </tr>
              )}
            />
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

export default PurchasesPage;
