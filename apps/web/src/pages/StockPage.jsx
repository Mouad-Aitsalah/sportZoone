import { useEffect, useMemo, useState } from "react";
import api from "../services/api";
import Badge from "../components/Badge";
import DataTable from "../components/DataTable";
import Modal from "../components/Modal";
import PageHeader from "../components/PageHeader";
import SearchInput from "../components/SearchInput";
import SectionCard from "../components/SectionCard";
import { getCurrentUser, isAdminRole } from "../store/authStore";
import {
  CACHE_KEYS,
  CACHE_TTL_MS,
  invalidateDomainCaches,
  readCache,
  writeCache,
} from "../utils/appCache";
import { cleanupLegacyStoreCache } from "../utils/storeAccess";
import { formatCurrencyDh } from "../utils/formatters";

const createInitialModalState = () => ({
  isOpen: false,
  mode: "entry",
  stock: null,
});

const createInitialFormData = (mode = "entry", stock = null) => ({
  quantity:
    mode === "correction"
      ? String(stock?.quantity ?? "")
      : "",
  reason: mode === "correction" ? "Correction inventaire" : "Réapprovisionnement",
});

const STOCK_QUERY_PARAMS = {
  params: {
    page: 1,
    limit: 500,
  },
};
const STOCK_CACHE_KEY = CACHE_KEYS.stock("inventory");

function StockPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [purchaseValueSort, setPurchaseValueSort] = useState("default");
  const [stocks, setStocks] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [notice, setNotice] = useState({ type: "", message: "" });
  const [modalError, setModalError] = useState("");
  const [stockModal, setStockModal] = useState(createInitialModalState);
  const [formData, setFormData] = useState(createInitialFormData());
  const currentUser = getCurrentUser();
  const canManageStock = isAdminRole(currentUser?.role);
  const canViewFinancialStock = canManageStock;
  const fetchStocks = async () => {
    const response = await api.get("/stocks", STOCK_QUERY_PARAMS);
    const nextStocks = Array.isArray(response.data) ? response.data : response.data?.data || [];
    setStocks(nextStocks);
    writeCache(STOCK_CACHE_KEY, nextStocks);
    return nextStocks;
  };

  useEffect(() => {
    if (!canViewFinancialStock && purchaseValueSort !== "default") {
      setPurchaseValueSort("default");
    }
  }, [canViewFinancialStock, purchaseValueSort]);

  useEffect(() => {
    let isMounted = true;

    async function loadStocks() {
      const stocksCache = readCache(STOCK_CACHE_KEY, CACHE_TTL_MS);

      if (stocksCache && isMounted) {
        setStocks(Array.isArray(stocksCache.data) ? stocksCache.data : []);
      }

      try {
        cleanupLegacyStoreCache();
        setIsLoading(!stocksCache);
        setErrorMessage("");

        const stocksResponse = await api.get("/stocks", STOCK_QUERY_PARAMS);
        const nextStocks = Array.isArray(stocksResponse.data)
          ? stocksResponse.data
          : stocksResponse.data?.data || [];

        if (isMounted) {
          setStocks(nextStocks);
          writeCache(STOCK_CACHE_KEY, nextStocks);
        }
      } catch (error) {
        if (isMounted && !stocksCache) {
          setErrorMessage(
            error.response?.data?.message ||
              "Impossible de charger le stock pour le moment."
          );
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadStocks();

    return () => {
      isMounted = false;
    };
  }, []);

  const filteredStocks = useMemo(
    () => {
      const filteredItems = stocks.filter((item) => {
        const query = searchTerm.trim().toLowerCase();
        return (
          !query ||
          item.productName?.toLowerCase().includes(query) ||
          item.category?.toLowerCase().includes(query) ||
          item.barcode?.toLowerCase().includes(query) ||
          item.variantLabel?.toLowerCase().includes(query) ||
          item.variantSize?.toLowerCase().includes(query) ||
          item.variantColor?.toLowerCase().includes(query)
        );
      });

      if (purchaseValueSort === "asc" || purchaseValueSort === "desc") {
        filteredItems.sort((left, right) => {
          const leftPurchaseValue =
            Number(left.purchasePrice || 0) * Number(left.quantity || 0);
          const rightPurchaseValue =
            Number(right.purchasePrice || 0) * Number(right.quantity || 0);

          return purchaseValueSort === "asc"
            ? leftPurchaseValue - rightPurchaseValue
            : rightPurchaseValue - leftPurchaseValue;
        });
      }

      return filteredItems;
    },
    [stocks, searchTerm, purchaseValueSort]
  );

  const totalStockPurchaseValue = useMemo(
    () =>
      filteredStocks.reduce((sum, item) => {
        const purchasePrice = Number(item.purchasePrice || 0);
        const quantity = Number(item.quantity || 0);
        return sum + purchasePrice * quantity;
      }, 0),
    [filteredStocks]
  );

  const openStockModal = (mode, stock) => {
    setNotice({ type: "", message: "" });
    setModalError("");
    setStockModal({
      isOpen: true,
      mode,
      stock,
    });
    setFormData(createInitialFormData(mode, stock));
  };

  const closeStockModal = () => {
    if (isSubmitting) {
      return;
    }

    setStockModal(createInitialModalState());
    setFormData(createInitialFormData());
    setModalError("");
  };

  const resetStockModal = () => {
    setStockModal(createInitialModalState());
    setFormData(createInitialFormData());
    setModalError("");
  };

  const handleFormChange = (event) => {
    const { name, value } = event.target;

    setModalError("");
    setFormData((current) => ({
      ...current,
      [name]: value,
    }));
  };

  const validateForm = () => {
    const quantity = Number(formData.quantity);

    if (formData.quantity === "") {
      return stockModal.mode === "entry"
        ? "La quantité à ajouter est obligatoire."
        : "La nouvelle quantité est obligatoire.";
    }

    if (
      stockModal.mode === "entry" &&
      (!Number.isFinite(quantity) || quantity <= 0)
    ) {
      return "La quantité à ajouter doit être un entier supérieur à 0.";
    }

    if (
      stockModal.mode === "correction" &&
      (!Number.isFinite(quantity) || quantity < 0)
    ) {
      return "La nouvelle quantité doit être un entier supérieur ou égal à 0.";
    }

    if (!formData.reason.trim()) {
      return "Le motif / raison est obligatoire.";
    }

    return "";
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    const validationMessage = validateForm();

    if (validationMessage) {
      setModalError(validationMessage);
      return;
    }

    if (!stockModal.stock) {
      setModalError("Ligne de stock introuvable.");
      return;
    }

    const payload = {
      productId: stockModal.stock.productId,
      variantId: stockModal.stock.variantId,
      storeId: stockModal.stock.storeId,
      quantity: Number(formData.quantity),
      reason: formData.reason.trim(),
    };

    const endpoint =
      stockModal.mode === "entry" ? "/stocks/in" : "/stocks/correction";

    try {
      setIsSubmitting(true);
      setModalError("");

      await api.post(endpoint, payload);
      invalidateDomainCaches("stock:", "stock-alerts", "analytics:", "products:");
      await fetchStocks();
      resetStockModal();
      setNotice({
        type: "success",
        message:
          stockModal.mode === "entry"
            ? "Entrée de stock enregistrée avec succès."
            : "Correction de stock enregistrée avec succès.",
      });
    } catch (error) {
      setModalError(
        error.response?.data?.message ||
          (stockModal.mode === "entry"
            ? "Impossible d'enregistrer l'entrée de stock."
            : "Impossible d'enregistrer la correction de stock.")
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const modalTitle =
    stockModal.mode === "entry" ? "Entrée de stock" : "Correction de stock";
  const modalDescription =
    stockModal.mode === "entry"
      ? "Ajoutez une quantité au stock existant du produit sélectionné."
      : "Définissez la nouvelle quantité réelle pour corriger le stock du produit.";
  const quantityLabel =
    stockModal.mode === "entry" ? "Quantité à ajouter" : "Nouvelle quantité";
  const quantityPlaceholder =
    stockModal.mode === "entry"
      ? "Entrer la quantité à ajouter"
      : "Entrer la nouvelle quantité";
  const submitLabel = isSubmitting ? "Enregistrement..." : "Enregistrer";

  return (
    <div>
      <PageHeader
        eyebrow="Stock"
        title="Stock SportZone"
        description="Afficher directement le stock du magasin SportZone et intervenir rapidement sur les seuils critiques."
      />

      {notice.message ? (
        <div className={`inline-notice ${notice.type}`}>{notice.message}</div>
      ) : null}

      <SectionCard
        title="Etat du stock"
        description="Suivi des quantites, seuils minimums et actions de correction du magasin SportZone."
      >
        {canViewFinancialStock ? (
          <div className="details-summary">
            <span>Valeur totale du stock</span>
            <strong>{formatCurrencyDh(totalStockPurchaseValue)}</strong>
          </div>
        ) : null}

        <div className="filter-row">
          <SearchInput
            value={searchTerm}
            onChange={setSearchTerm}
            placeholder="Rechercher par produit, categorie, code-barres ou variante"
          />
          {canViewFinancialStock ? (
            <select
              className="text-input select-input"
              value={purchaseValueSort}
              onChange={(event) => setPurchaseValueSort(event.target.value)}
            >
              <option value="default">Aucun tri / defaut</option>
              <option value="asc">Valeur achat croissante</option>
              <option value="desc">Valeur achat decroissante</option>
            </select>
          ) : null}
        </div>

        {errorMessage ? (
          <div className="inline-notice error">{errorMessage}</div>
        ) : null}

        <DataTable
          columns={
            canViewFinancialStock
              ? [
                  { key: "product", label: "Produit" },
                  { key: "variant", label: "Variante" },
                  { key: "size", label: "Taille" },
                  { key: "color", label: "Couleur" },
                  { key: "barcode", label: "Code-barres" },
                  { key: "quantity", label: "Quantite" },
                  { key: "purchaseValue", label: "Valeur achat" },
                  { key: "minimum", label: "Seuil mini" },
                  { key: "status", label: "Statut" },
                  { key: "actions", label: "Actions" },
                ]
              : [
                  { key: "product", label: "Produit" },
                  { key: "variant", label: "Variante" },
                  { key: "size", label: "Taille" },
                  { key: "color", label: "Couleur" },
                  { key: "barcode", label: "Code-barres" },
                  { key: "quantity", label: "Quantite" },
                  { key: "minimum", label: "Seuil mini" },
                  { key: "status", label: "Statut" },
                ]
          }
          data={filteredStocks}
          emptyTitle={isLoading ? "Chargement du stock..." : "Aucun mouvement trouve"}
          emptyDescription={
            isLoading
              ? "Veuillez patienter pendant la recuperation des donnees."
              : "Essayez une autre recherche."
          }
          renderRow={(item) => {
            const isCritical = item.severity === "critical";
            const isLow = item.isLowStock;
            const stockStatus = item.status || (isCritical
              ? "Rupture"
              : isLow
              ? "Stock faible"
              : "Disponible");
            const rowClassName = isCritical
              ? "stock-row-critical"
              : isLow
              ? "stock-row-warning"
              : "";

            return (
              <tr key={item.id} className={rowClassName}>
                <td>
                  <strong>{item.productName}</strong>
                </td>
                <td>{item.variantLabel || "-"}</td>
                <td>{item.variantSize || "Unique"}</td>
                <td>{item.variantColor || "-"}</td>
                <td>{item.barcode}</td>
                <td>{item.quantity}</td>
                {canViewFinancialStock ? (
                  <td>
                    {formatCurrencyDh(
                      Number(item.purchasePrice || 0) * Number(item.quantity || 0)
                    )}
                  </td>
                ) : null}
                <td>{item.minimumThreshold}</td>
                <td>
                  <Badge
                    tone={
                      isCritical
                        ? "stock-critical"
                        : isLow
                        ? "stock-warning"
                        : "success"
                    }
                  >
                    {stockStatus}
                  </Badge>
                </td>
                {canViewFinancialStock ? (
                  <td>
                    {canManageStock ? (
                      <div className="table-action-row">
                        <button
                          className="table-action-button"
                          type="button"
                          onClick={() => openStockModal("entry", item)}
                        >
                          Entree stock
                        </button>
                        <button
                          className="table-action-button"
                          type="button"
                          onClick={() => openStockModal("correction", item)}
                        >
                          Correction stock
                        </button>
                      </div>
                    ) : (
                      <span className="muted-text">-</span>
                    )}
                  </td>
                ) : null}
              </tr>
            );
          }}
        />
      </SectionCard>

      <Modal
        isOpen={stockModal.isOpen}
        eyebrow="Mouvement de stock"
        title={modalTitle}
        description={modalDescription}
        onClose={closeStockModal}
        actions={
          <>
            <button
              className="ghost-button"
              type="button"
              onClick={closeStockModal}
              disabled={isSubmitting}
            >
              Annuler
            </button>
            <button
              className="primary-button"
              type="submit"
              form="stock-movement-form"
              disabled={isSubmitting}
            >
              {submitLabel}
            </button>
          </>
        }
      >
        {stockModal.stock ? (
          <div className="details-list">
            <div className="detail-stat">
              <span>Produit</span>
              <strong>{stockModal.stock.productName}</strong>
            </div>
            <div className="detail-stat">
              <span>Code-barres</span>
              <strong>{stockModal.stock.barcode}</strong>
            </div>
            <div className="detail-stat">
              <span>Variante</span>
              <strong>{stockModal.stock.variantLabel || "-"}</strong>
            </div>
            <div className="detail-stat">
              <span>Taille</span>
              <strong>{stockModal.stock.variantSize || "Unique"}</strong>
            </div>
            <div className="detail-stat">
              <span>Couleur</span>
              <strong>{stockModal.stock.variantColor || "-"}</strong>
            </div>
            <div className="detail-stat">
              <span>Magasin</span>
              <strong>{stockModal.stock.storeName}</strong>
            </div>
            <div className="detail-stat">
              <span>Quantité actuelle</span>
              <strong>{stockModal.stock.quantity}</strong>
            </div>
          </div>
        ) : null}

        <form className="form-grid" id="stock-movement-form" onSubmit={handleSubmit}>
          {modalError ? (
            <div className="inline-notice error">{modalError}</div>
          ) : null}

          <div className="field-group">
            <label className="field-label" htmlFor="stock-quantity">
              {quantityLabel}
            </label>
            <input
              id="stock-quantity"
              className="text-input"
              type="number"
              min="0"
              step="0.25"
              name="quantity"
              placeholder={quantityPlaceholder}
              value={formData.quantity}
              onChange={handleFormChange}
              required
            />
          </div>

          <div className="field-group">
            <label className="field-label" htmlFor="stock-reason">
              Motif / Raison
            </label>
            <input
              id="stock-reason"
              className="text-input"
              type="text"
              name="reason"
              value={formData.reason}
              onChange={handleFormChange}
              required
            />
          </div>
        </form>
      </Modal>
    </div>
  );
}

export default StockPage;
