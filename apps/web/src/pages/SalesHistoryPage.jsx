import { useCallback, useEffect, useMemo, useState } from "react";
import api from "../services/api";
import Badge from "../components/Badge";
import DataTable from "../components/DataTable";
import Modal from "../components/Modal";
import PageHeader from "../components/PageHeader";
import SearchInput from "../components/SearchInput";
import SectionCard from "../components/SectionCard";
import {
  getOfflineSales,
  markSaleAsFailed,
  markSaleAsSynced,
  updateSaleStatus,
} from "../services/offlineDb";
import { getCurrentUser } from "../store/authStore";
import { downloadBlob } from "../utils/downloadBlob";
import {
  formatCurrencyDh,
  formatDateOnly,
  formatDateTime,
} from "../utils/formatters";

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

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

const getSalesCollection = (payload) => getCollection(payload, ["data", "sales"]);
const getStoresCollection = (payload) => getCollection(payload, ["data", "stores"]);

const buildInitialReturnQuantities = (sale) =>
  (sale?.items || []).reduce((accumulator, item) => {
    accumulator[item.productId] = "";
    return accumulator;
  }, {});

const getSaleStatusMeta = (status, paymentMethod) => {
  if (status === "cancelled") {
    return {
      label: "Annulee",
      tone: "danger",
    };
  }

  if (status === "refunded") {
    return {
      label: "Remboursee",
      tone: "info",
    };
  }

  if (paymentMethod === "credit") {
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

const getPaymentMethodMeta = (paymentMethod) => {
  if (paymentMethod === "credit") {
    return {
      label: "Credit",
      tone: "warning",
    };
  }

  if (paymentMethod === "card") {
    return {
      label: "Carte",
      tone: "info",
    };
  }

  return {
    label: "Especes",
    tone: "success",
  };
};

const getSyncStatusMeta = (syncStatus, localOnly = false) => {
  if (syncStatus === "pending") {
    return {
      label: "En attente",
      tone: "warning",
    };
  }

  if (syncStatus === "failed") {
    return {
      label: "Erreur",
      tone: "danger",
    };
  }

  if (syncStatus === "syncing") {
    return {
      label: "Synchronisation...",
      tone: "info",
    };
  }

  if (syncStatus === "synced") {
    return {
      label: "Synchronise",
      tone: "success",
    };
  }

  return {
    label: localOnly ? "En attente" : "En ligne",
    tone: "success",
  };
};

const mapOfflineSaleToHistorySale = (sale) => ({
  id: `local-${sale.localId}`,
  localId: sale.localId,
  ticketNumber: `LOCAL-${String(sale.localId || "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 8)
    .toUpperCase()}`,
  date: sale.createdAt,
  createdAt: sale.createdAt,
  storeId: sale.storeId || null,
  storeName: sale.storeName || (sale.storeId ? `Magasin ${sale.storeId}` : "-"),
  cashRegisterId: sale.caisseId || sale.cashRegisterId || null,
  cashRegisterName:
    sale.caisseName ||
    sale.cashRegisterName ||
    (sale.caisseId || sale.cashRegisterId
      ? `Caisse ${sale.caisseId || sale.cashRegisterId}`
      : "-"),
  userId: sale.userId || null,
  cashierName: sale.cashierName || (sale.userId ? `Utilisateur ${sale.userId}` : "-"),
  customerId: sale.clientId || null,
  customerNumber: sale.customerNumber || null,
  customerName: sale.clientName || sale.customerName || "Client inconnu",
  customerCredit: sale.customerCredit || 0,
  paymentMethod: sale.paymentMethod,
  status: "pending_sync",
  syncStatus: sale.syncStatus || "pending",
  syncError: sale.syncError || null,
  total: sale.total || 0,
  itemsCount: Array.isArray(sale.items) ? sale.items.length : 0,
  localOnly: true,
  items: (sale.items || []).map((item) => ({
    productId: item.productId,
    productName: item.productName || item.name || `Produit #${item.productId || "-"}`,
    quantity: item.quantity || 0,
    returnedQuantity: 0,
    remainingReturnQuantity: 0,
    unitPrice: item.unitPrice || 0,
    subtotal:
      item.subtotal || (item.quantity || 0) * (item.unitPrice || 0),
  })),
});

function SalesHistoryPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedStore, setSelectedStore] = useState("Tous");
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState("all");
  const [selectedSale, setSelectedSale] = useState(null);
  const [saleToCancel, setSaleToCancel] = useState(null);
  const [saleToReturn, setSaleToReturn] = useState(null);
  const [saleToPayCredit, setSaleToPayCredit] = useState(null);
  const [returnQuantities, setReturnQuantities] = useState({});
  const [returnReason, setReturnReason] = useState("");
  const [creditPaymentAmount, setCreditPaymentAmount] = useState("");
  const [creditPaymentNote, setCreditPaymentNote] = useState("");
  const [backendSales, setBackendSales] = useState([]);
  const [offlineSales, setOfflineSalesState] = useState([]);
  const [stores, setStores] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isExportingExcel, setIsExportingExcel] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isSubmittingCancel, setIsSubmittingCancel] = useState(false);
  const [isSubmittingReturn, setIsSubmittingReturn] = useState(false);
  const [isSubmittingCreditPayment, setIsSubmittingCreditPayment] = useState(false);
  const [isSynchronizingOfflineSales, setIsSynchronizingOfflineSales] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [notice, setNotice] = useState({ type: "", message: "" });
  const [cancelModalError, setCancelModalError] = useState("");
  const [returnModalError, setReturnModalError] = useState("");
  const [creditPaymentError, setCreditPaymentError] = useState("");
  const currentUser = getCurrentUser();
  const isAdmin = currentUser?.role === "admin";

  const loadOfflineSalesState = useCallback(async () => {
    const localSales = await getOfflineSales();
    setOfflineSalesState(localSales.map(mapOfflineSaleToHistorySale));
    return localSales;
  }, []);

  const fetchPageData = useCallback(async () => {
    const [salesResult, storesResult, offlineSalesResult] = await Promise.allSettled([
      api.get("/sales", {
        params: {
          paymentMethod:
            selectedPaymentMethod === "all" ? undefined : selectedPaymentMethod,
        },
      }),
      api.get("/stores"),
      getOfflineSales(),
    ]);

    if (offlineSalesResult.status === "fulfilled") {
      setOfflineSalesState(offlineSalesResult.value.map(mapOfflineSaleToHistorySale));
    } else {
      setOfflineSalesState([]);
    }

    if (salesResult.status === "fulfilled") {
      setBackendSales(getSalesCollection(salesResult.value.data));
    } else {
      setBackendSales([]);
    }

    if (storesResult.status === "fulfilled") {
      setStores(getStoresCollection(storesResult.value.data));
    } else {
      setStores([]);
    }

    const hasOfflineSales =
      offlineSalesResult.status === "fulfilled" && offlineSalesResult.value.length > 0;

    if (salesResult.status === "rejected" && !hasOfflineSales) {
      throw salesResult.reason;
    }
  }, [selectedPaymentMethod]);

  useEffect(() => {
    let isMounted = true;

    async function loadPageData() {
      try {
        setIsLoading(true);
        setErrorMessage("");

        await fetchPageData();
      } catch (error) {
        if (isMounted) {
          setErrorMessage(
            error.response?.data?.message ||
              "Impossible de charger l'historique des ventes."
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
  }, [fetchPageData]);

  const sales = useMemo(
    () =>
      [...offlineSales, ...backendSales].sort(
        (left, right) =>
          new Date(right.date || right.createdAt || 0).getTime() -
          new Date(left.date || left.createdAt || 0).getTime()
      ),
    [backendSales, offlineSales]
  );

  const storeOptions = useMemo(() => {
    const storeMap = new Map();

    for (const store of stores) {
      if (store?.name) {
        storeMap.set(store.name, store);
      }
    }

    for (const sale of offlineSales) {
      const storeName = sale.storeName || sale.storeId;

      if (storeName && !storeMap.has(storeName)) {
        storeMap.set(storeName, {
          id: sale.storeId || storeName,
          name: storeName,
        });
      }
    }

    return Array.from(storeMap.values());
  }, [offlineSales, stores]);

  const hasSyncableOfflineSales = useMemo(
    () =>
      offlineSales.some(
        (sale) => sale.localOnly && ["pending", "failed"].includes(sale.syncStatus)
      ),
    [offlineSales]
  );

  const filteredSales = useMemo(
    () =>
      sales.filter((sale) => {
        const query = searchTerm.trim().toLowerCase();
        const ticket = sale.ticketNumber || sale.id?.toString() || "";
        const cashier =
          sale.cashier || sale.cashierName || sale.userName || sale.user?.name || "";
        const storeName = sale.store || sale.storeName || sale.store?.name || "";
        const cashRegisterName =
          sale.cashRegisterName || sale.cashRegister?.name || "";
        const customerName = sale.customerName || "";
        const customerNumber = sale.customerNumber || "";
        const saleDate = sale.date || sale.createdAt || "";
        const matchesSearch =
          !query ||
          ticket.toLowerCase().includes(query) ||
          cashier.toLowerCase().includes(query) ||
          cashRegisterName.toLowerCase().includes(query) ||
          customerName.toLowerCase().includes(query) ||
          String(customerNumber).includes(query);
        const matchesStore =
          selectedStore === "Tous" || storeName === selectedStore;
        const matchesDate = !selectedDate || saleDate.startsWith(selectedDate);
        const matchesPaymentMethod =
          selectedPaymentMethod === "all" ||
          sale.paymentMethod === selectedPaymentMethod;

        return (
          matchesSearch &&
          matchesStore &&
          matchesDate &&
          matchesPaymentMethod
        );
      }),
    [sales, searchTerm, selectedStore, selectedDate, selectedPaymentMethod]
  );

  const handlePrintTicket = (sale) => {
    if (!sale) {
      return;
    }

    const ticketNumber = sale.ticketNumber || sale.id?.toString() || "-";
    const saleDate = formatDateTime(sale.date || sale.createdAt);
    const storeName = sale.store || sale.storeName || sale.store?.name || "-";
    const cashRegisterName =
      sale.cashRegisterName || sale.cashRegister?.name || "-";
    const cashierName =
      sale.cashier || sale.cashierName || sale.userName || sale.user?.name || "-";
    const items = sale.items || [];
    const rowsHtml = items
      .map((item) => {
        const productName =
          item.name || item.productName || item.product?.name || "-";
        const quantity = item.quantity || 0;
        const unitPrice = item.unitPrice || item.price || 0;
        const subtotal = item.subtotal || quantity * unitPrice;

        return `
          <tr>
            <td>${escapeHtml(productName)}</td>
            <td class="numeric">${escapeHtml(quantity)}</td>
            <td class="numeric">${escapeHtml(formatCurrencyDh(unitPrice))}</td>
            <td class="numeric">${escapeHtml(formatCurrencyDh(subtotal))}</td>
          </tr>
        `;
      })
      .join("");

    const printWindow = window.open("", "_blank", "width=420,height=720");

    if (!printWindow) {
      return;
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html lang="fr">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>${escapeHtml(ticketNumber)}</title>
          <style>
            body {
              margin: 0;
              padding: 24px;
              font-family: "Segoe UI", Arial, sans-serif;
              background: #ffffff;
              color: #111827;
            }

            .ticket {
              max-width: 360px;
              margin: 0 auto;
              border: 1px dashed #9ca3af;
              padding: 20px 18px;
            }

            .ticket-header {
              text-align: center;
              margin-bottom: 16px;
            }

            .ticket-title {
              margin: 0 0 6px;
              font-size: 22px;
              font-weight: 700;
            }

            .ticket-subtitle {
              margin: 0;
              font-size: 12px;
              color: #4b5563;
            }

            .ticket-meta {
              display: grid;
              gap: 6px;
              margin-bottom: 16px;
              font-size: 13px;
            }

            .ticket-meta-row {
              display: flex;
              justify-content: space-between;
              gap: 16px;
            }

            table {
              width: 100%;
              border-collapse: collapse;
              font-size: 12px;
            }

            th,
            td {
              padding: 8px 0;
              border-bottom: 1px dashed #d1d5db;
              vertical-align: top;
            }

            th {
              text-align: left;
              font-size: 11px;
              text-transform: uppercase;
              letter-spacing: 0.04em;
              color: #4b5563;
            }

            .numeric {
              text-align: right;
              white-space: nowrap;
            }

            .ticket-total {
              display: flex;
              justify-content: space-between;
              margin-top: 16px;
              padding-top: 12px;
              border-top: 2px solid #111827;
              font-size: 16px;
              font-weight: 700;
            }

            .ticket-footer {
              margin-top: 18px;
              text-align: center;
              font-size: 12px;
              color: #4b5563;
            }
          </style>
        </head>
        <body>
          <section class="ticket">
            <div class="ticket-header">
              <h1 class="ticket-title">Multi-POS Manager</h1>
              <p class="ticket-subtitle">Ticket de caisse</p>
            </div>

            <div class="ticket-meta">
              <div class="ticket-meta-row">
                <span>Ticket</span>
                <strong>${escapeHtml(ticketNumber)}</strong>
              </div>
              <div class="ticket-meta-row">
                <span>Date</span>
                <strong>${escapeHtml(saleDate)}</strong>
              </div>
              <div class="ticket-meta-row">
                <span>Magasin</span>
                <strong>${escapeHtml(storeName)}</strong>
              </div>
              <div class="ticket-meta-row">
                <span>Caisse</span>
                <strong>${escapeHtml(cashRegisterName)}</strong>
              </div>
              <div class="ticket-meta-row">
                <span>Caissier</span>
                <strong>${escapeHtml(cashierName)}</strong>
              </div>
            </div>

            <table>
              <thead>
                <tr>
                  <th>Produit</th>
                  <th class="numeric">Qte</th>
                  <th class="numeric">PU</th>
                  <th class="numeric">Sous-total</th>
                </tr>
              </thead>
              <tbody>
                ${rowsHtml}
              </tbody>
            </table>

            <div class="ticket-total">
              <span>Total</span>
              <span>${escapeHtml(formatCurrencyDh(sale.total || 0))}</span>
            </div>

            <p class="ticket-footer">Merci pour votre achat</p>
          </section>
        </body>
      </html>
    `);

    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  const handleExportSales = async (format) => {
    const selectedStoreMatch = stores.find((store) => store.name === selectedStore);
    const params = {
      search: searchTerm.trim() || undefined,
      startDate: selectedDate || undefined,
      endDate: selectedDate || undefined,
      storeId: selectedStoreMatch?.id || undefined,
      paymentMethod:
        selectedPaymentMethod === "all" ? undefined : selectedPaymentMethod,
    };

    try {
      if (format === "excel") {
        setIsExportingExcel(true);
      } else {
        setIsExportingPdf(true);
      }

      setErrorMessage("");

      const response = await api.get(`/exports/sales/${format}`, {
        params,
        responseType: "blob",
      });

      downloadBlob(
        response,
        format === "excel" ? "sales-export.xlsx" : "sales-export.pdf"
      );
    } catch (error) {
      if (error.response?.data instanceof Blob) {
        const message = await error.response.data.text();
        setErrorMessage(message || "Impossible d'exporter les ventes.");
      } else {
        setErrorMessage(
          error.response?.data?.message ||
            "Impossible d'exporter les ventes pour le moment."
        );
      }
    } finally {
      setIsExportingExcel(false);
      setIsExportingPdf(false);
    }
  };

  const handleSyncOfflineSales = async () => {
    try {
      setIsSynchronizingOfflineSales(true);
      setErrorMessage("");
      setNotice({ type: "", message: "" });

      const localSales = await getOfflineSales();
      const syncableSales = localSales.filter((sale) =>
        ["pending", "failed"].includes(sale.syncStatus)
      );

      if (!syncableSales.length) {
        setNotice({
          type: "info",
          message: "Aucune vente offline a synchroniser.",
        });
        return;
      }

      for (const sale of syncableSales) {
        await updateSaleStatus(sale.localId, "syncing", null);
        await loadOfflineSalesState();

        const hasKnownCustomer = Number(sale.clientId || 0) > 0;
        const payload = {
          storeId: sale.storeId,
          caisseId: sale.caisseId || sale.cashRegisterId,
          paymentMethod: sale.paymentMethod,
          total: sale.total,
          items: (sale.items || []).map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
          })),
          ...(hasKnownCustomer
            ? {
                clientId: sale.clientId,
              }
            : {}),
        };

        try {
          await api.post("/sales", payload);
          await markSaleAsSynced(sale.localId);
        } catch (error) {
          const syncErrorMessage =
            error.response?.data?.message ||
            error.response?.data?.error ||
            error.message ||
            "Erreur de synchronisation";
          await markSaleAsFailed(sale.localId, syncErrorMessage);
        }

        await loadOfflineSalesState();
      }

      await fetchPageData();
      setNotice({
        type: "success",
        message: "Synchronisation des ventes offline terminee.",
      });
    } catch (error) {
      setNotice({
        type: "error",
        message:
          error.message ||
          "Impossible de synchroniser les ventes offline pour le moment.",
      });
    } finally {
      setIsSynchronizingOfflineSales(false);
    }
  };

  const canCancelSale = (sale) =>
    !sale?.localOnly && isAdmin && sale?.status === "completed";

  const canReturnSale = (sale) =>
    !sale?.localOnly &&
    sale?.status !== "cancelled" &&
    sale?.items?.some((item) => (item.remainingReturnQuantity ?? item.quantity ?? 0) > 0);

  const canPayCreditSale = (sale) =>
    !sale?.localOnly &&
    sale?.paymentMethod === "credit" &&
    Number(sale?.customerCredit || 0) > 0 &&
    Number(sale?.customerId || 0) > 0;

  const openCancelModal = (sale) => {
    setNotice({ type: "", message: "" });
    setCancelModalError("");
    setSelectedSale(null);
    setSaleToCancel(sale);
  };

  const closeCancelModal = () => {
    if (isSubmittingCancel) {
      return;
    }

    setSaleToCancel(null);
    setCancelModalError("");
  };

  const openReturnModal = (sale) => {
    setNotice({ type: "", message: "" });
    setReturnModalError("");
    setSelectedSale(null);
    setSaleToReturn(sale);
    setReturnQuantities(buildInitialReturnQuantities(sale));
    setReturnReason("");
  };

  const openCreditPaymentModal = (sale) => {
    setNotice({ type: "", message: "" });
    setCreditPaymentError("");
    setSelectedSale(null);
    setSaleToPayCredit(sale);
    setCreditPaymentAmount(String(Math.min(Number(sale?.total || 0), Number(sale?.customerCredit || 0))));
    setCreditPaymentNote(
      `Paiement credit depuis ticket ${sale?.ticketNumber || sale?.id || ""}`
    );
  };

  const closeReturnModal = () => {
    if (isSubmittingReturn) {
      return;
    }

    setSaleToReturn(null);
    setReturnQuantities({});
    setReturnReason("");
    setReturnModalError("");
  };

  const closeCreditPaymentModal = () => {
    if (isSubmittingCreditPayment) {
      return;
    }

    setSaleToPayCredit(null);
    setCreditPaymentAmount("");
    setCreditPaymentNote("");
    setCreditPaymentError("");
  };

  const handleReturnQuantityChange = (productId, value) => {
    if (value === "") {
      setReturnQuantities((current) => ({
        ...current,
        [productId]: "",
      }));
      return;
    }

    const normalizedValue = Math.max(0, Number(value) || 0);

    setReturnModalError("");
    setReturnQuantities((current) => ({
      ...current,
      [productId]: String(normalizedValue),
    }));
  };

  const handleConfirmCancel = async () => {
    if (!saleToCancel?.id) {
      return;
    }

    try {
      setIsSubmittingCancel(true);
      setCancelModalError("");

      await api.post(`/sales/${saleToCancel.id}/cancel`);
      await fetchPageData();
      setSaleToCancel(null);
      setNotice({
        type: "success",
        message: "Vente annulee",
      });
    } catch (error) {
      setCancelModalError(
        error.response?.data?.message ||
          "Impossible d'annuler cette vente pour le moment."
      );
    } finally {
      setIsSubmittingCancel(false);
    }
  };

  const handleSubmitReturn = async (event) => {
    event.preventDefault();

    if (!saleToReturn?.id) {
      setReturnModalError("Vente introuvable.");
      return;
    }

    const normalizedItems = (saleToReturn.items || [])
      .map((item) => {
        const rawQuantity = returnQuantities[item.productId];
        const quantity = rawQuantity === "" ? 0 : Number(rawQuantity);

        return {
          productId: item.productId,
          productName: item.productName || item.name || "-",
          maxQuantity: item.remainingReturnQuantity ?? item.quantity ?? 0,
          quantity,
        };
      })
      .filter((item) => item.quantity > 0);

    if (!normalizedItems.length) {
      setReturnModalError("Selectionnez au moins un produit a retourner.");
      return;
    }

    for (const item of normalizedItems) {
      if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
        setReturnModalError(
          `La quantite retournee pour ${item.productName} doit etre un entier positif.`
        );
        return;
      }

      if (item.quantity > item.maxQuantity) {
        setReturnModalError(
          `La quantite retournee pour ${item.productName} depasse la quantite disponible.`
        );
        return;
      }
    }

    try {
      setIsSubmittingReturn(true);
      setReturnModalError("");

      await api.post(`/sales/${saleToReturn.id}/return`, {
        items: normalizedItems.map((item) => ({
          produitId: item.productId,
          quantity: item.quantity,
        })),
        reason: returnReason.trim(),
      });
      await fetchPageData();
      closeReturnModal();
      setNotice({
        type: "success",
        message: "Retour effectue",
      });
    } catch (error) {
      setReturnModalError(
        error.response?.data?.message ||
          "Impossible d'enregistrer ce retour pour le moment."
      );
    } finally {
      setIsSubmittingReturn(false);
    }
  };

  const handleSubmitCreditPayment = async (event) => {
    event.preventDefault();

    if (!saleToPayCredit?.customerId) {
      setCreditPaymentError("Client introuvable pour ce ticket.");
      return;
    }

    if (creditPaymentAmount === "") {
      setCreditPaymentError("Le montant paye est obligatoire.");
      return;
    }

    const amount = Number(creditPaymentAmount);
    const currentCredit = Number(saleToPayCredit.customerCredit || 0);

    if (!Number.isFinite(amount) || amount <= 0) {
      setCreditPaymentError("Le montant paye doit etre superieur a 0.");
      return;
    }

    if (amount > currentCredit) {
      setCreditPaymentError("Le montant paye ne peut pas depasser le credit client.");
      return;
    }

    try {
      setIsSubmittingCreditPayment(true);
      setCreditPaymentError("");

      await api.post(`/customers/${saleToPayCredit.customerId}/pay-credit`, {
        amount,
        note:
          creditPaymentNote.trim() ||
          `Paiement credit depuis ticket ${
            saleToPayCredit.ticketNumber || saleToPayCredit.id
          }`,
      });
      await fetchPageData();
      closeCreditPaymentModal();
      setNotice({
        type: "success",
        message: "Credit paye avec succes.",
      });
    } catch (error) {
      setCreditPaymentError(
        error.response?.data?.message ||
          "Impossible d'enregistrer ce paiement de credit pour le moment."
      );
    } finally {
      setIsSubmittingCreditPayment(false);
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow="Historique"
        title="Historique des ventes"
        description="Consulter les tickets, filtrer par date ou magasin et visualiser les details de vente."
      />

      {notice.message ? (
        <div className={`inline-notice ${notice.type}`}>{notice.message}</div>
      ) : null}

      <SectionCard
        title="Tickets de vente"
        description="Rechercher par numero de ticket ou caissier."
        actions={
          hasSyncableOfflineSales ? (
            <button
              className="secondary-button"
              type="button"
              onClick={handleSyncOfflineSales}
              disabled={isSynchronizingOfflineSales}
            >
              {isSynchronizingOfflineSales
                ? "Synchronisation..."
                : "Synchroniser les ventes offline"}
            </button>
          ) : null
        }
      >
        <div className="filter-row">
          <SearchInput
            value={searchTerm}
            onChange={setSearchTerm}
            placeholder="Rechercher par ticket ou utilisateur"
          />

          <input
            className="text-input select-input"
            type="date"
            value={selectedDate}
            onChange={(event) => setSelectedDate(event.target.value)}
          />

          <select
            className="text-input select-input"
            value={selectedStore}
            onChange={(event) => setSelectedStore(event.target.value)}
          >
            <option value="Tous">Tous les magasins</option>
            {storeOptions.map((store) => (
              <option key={store.id} value={store.name}>
                {store.name}
              </option>
            ))}
          </select>

          <select
            className="text-input select-input"
            value={selectedPaymentMethod}
            onChange={(event) => setSelectedPaymentMethod(event.target.value)}
          >
            <option value="all">Tous les paiements</option>
            <option value="cash">Especes</option>
            <option value="card">Carte bancaire</option>
            <option value="credit">Credit</option>
          </select>

          <button
            className="ghost-button"
            type="button"
            onClick={() => handleExportSales("excel")}
            disabled={isExportingExcel || isExportingPdf}
          >
            {isExportingExcel ? "Export Excel..." : "Exporter Excel"}
          </button>

          <button
            className="primary-button"
            type="button"
            onClick={() => handleExportSales("pdf")}
            disabled={isExportingExcel || isExportingPdf}
          >
            {isExportingPdf ? "Export PDF..." : "Exporter PDF"}
          </button>
        </div>

            {errorMessage ? (
          <div className="inline-notice error">{errorMessage}</div>
        ) : null}

        <DataTable
          columns={[
            { key: "ticket", label: "Ticket" },
            { key: "date", label: "Date" },
            { key: "store", label: "Magasin" },
            { key: "cashRegister", label: "Caisse" },
            { key: "cashier", label: "Caissier" },
            { key: "customer", label: "Client" },
            { key: "items", label: "Nb articles" },
            { key: "total", label: "Total" },
            { key: "payment", label: "Paiement" },
            { key: "sync", label: "Sync" },
            { key: "status", label: "Statut" },
            { key: "actions", label: "Actions" },
          ]}
          data={filteredSales}
          emptyTitle={
            isLoading ? "Chargement..." : "Aucune vente trouvee pour ce filtre"
          }
          emptyDescription={
            isLoading
              ? "Recuperation des ventes en cours."
              : "Modifiez les filtres pour afficher des tickets."
          }
          renderRow={(sale, index) => {
            const ticket = sale.ticketNumber || sale.id?.toString() || "-";
            const storeName = sale.store || sale.storeName || sale.store?.name || "-";
            const cashRegisterName =
              sale.cashRegisterName || sale.cashRegister?.name || "-";
            const cashier =
              sale.cashier || sale.cashierName || sale.userName || sale.user?.name || "-";
            const customerLabel = sale.customerName
              ? `#${sale.customerNumber || "-"} - ${sale.customerName}`
              : "Client inconnu";
            const saleDate = sale.date || sale.createdAt;
            const items = sale.items || [];
            const itemsCount = sale.itemsCount || items.length || 0;
            const paymentMeta = getPaymentMethodMeta(sale.paymentMethod);
            const syncMeta = getSyncStatusMeta(sale.syncStatus, sale.localOnly);
            const statusMeta = sale.localOnly
              ? {
                  label: "En attente sync",
                  tone: "warning",
                }
              : getSaleStatusMeta(sale.status, sale.paymentMethod);

            return (
              <tr key={`${ticket}-${index}`}>
                <td>
                  <strong>{ticket}</strong>
                </td>
                <td>{saleDate ? formatDateTime(saleDate) : "-"}</td>
                <td>{storeName}</td>
                <td>{cashRegisterName}</td>
                <td>{cashier}</td>
                <td>{customerLabel}</td>
                <td>{itemsCount}</td>
                <td>{formatCurrencyDh(sale.total || 0)}</td>
                <td>
                  <Badge tone={paymentMeta.tone}>{paymentMeta.label}</Badge>
                </td>
                <td>
                  <div className="table-cell-stack">
                    <Badge tone={syncMeta.tone}>{syncMeta.label}</Badge>
                    {sale.syncStatus === "failed" && sale.syncError ? (
                      <span className="muted-text">{sale.syncError}</span>
                    ) : null}
                  </div>
                </td>
                <td>
                  <Badge tone={statusMeta.tone}>{statusMeta.label}</Badge>
                </td>
                <td>
                  <div className="table-action-row">
                    <button
                      className="table-action-button"
                      type="button"
                      onClick={() => setSelectedSale(sale)}
                    >
                      Voir details
                    </button>
                    {canCancelSale(sale) ? (
                      <button
                        className="table-action-button danger"
                        type="button"
                        onClick={() => openCancelModal(sale)}
                      >
                        Annuler vente
                      </button>
                    ) : null}
                    {canReturnSale(sale) ? (
                      <button
                        className="table-action-button"
                        type="button"
                        onClick={() => openReturnModal(sale)}
                      >
                        Retour
                      </button>
                    ) : null}
                    {canPayCreditSale(sale) ? (
                      <button
                        className="table-action-button"
                        type="button"
                        onClick={() => openCreditPaymentModal(sale)}
                      >
                        Payer credit
                      </button>
                    ) : null}
                  </div>
                </td>
              </tr>
            );
          }}
        />
      </SectionCard>

      <Modal
        isOpen={Boolean(selectedSale)}
        eyebrow="Details ticket"
        title={
          selectedSale
            ? selectedSale.ticketNumber || selectedSale.id?.toString() || ""
            : ""
        }
        description={
          selectedSale
            ? `${
                selectedSale.store ||
                selectedSale.storeName ||
                selectedSale.store?.name ||
                "-"
              } - ${formatDateTime(selectedSale.date || selectedSale.createdAt)}`
            : ""
        }
        onClose={() => setSelectedSale(null)}
        actions={
          <>
            {selectedSale && canReturnSale(selectedSale) ? (
              <button
                className="ghost-button"
                type="button"
                onClick={() => openReturnModal(selectedSale)}
              >
                Retour
              </button>
            ) : null}
            {selectedSale && canCancelSale(selectedSale) ? (
              <button
                className="table-action-button danger"
                type="button"
                onClick={() => openCancelModal(selectedSale)}
              >
                Annuler vente
              </button>
            ) : null}
            {selectedSale && canPayCreditSale(selectedSale) ? (
              <button
                className="table-action-button"
                type="button"
                onClick={() => openCreditPaymentModal(selectedSale)}
              >
                Payer credit
              </button>
            ) : null}
            <button
              className="ghost-button"
              type="button"
              onClick={() => setSelectedSale(null)}
            >
              Fermer
            </button>
            <button
              className="primary-button"
              type="button"
              onClick={() => handlePrintTicket(selectedSale)}
            >
              Imprimer ticket
            </button>
          </>
        }
      >
        {selectedSale ? (
          <>
            <div className="details-list">
              <div className="detail-stat">
                <span>Date</span>
                <strong>
                  {formatDateOnly(selectedSale.date || selectedSale.createdAt)}
                </strong>
              </div>
              <div className="detail-stat">
                <span>Caissier</span>
                <strong>
                  {selectedSale.cashier ||
                    selectedSale.cashierName ||
                    selectedSale.userName ||
                    selectedSale.user?.name ||
                    "-"}
                </strong>
              </div>
              <div className="detail-stat">
                <span>Magasin</span>
                <strong>
                  {selectedSale.store ||
                    selectedSale.storeName ||
                    selectedSale.store?.name ||
                    "-"}
                </strong>
              </div>
              <div className="detail-stat">
                <span>Caisse</span>
                <strong>
                  {selectedSale.cashRegisterName ||
                    selectedSale.cashRegister?.name ||
                    "-"}
                </strong>
              </div>
              <div className="detail-stat">
                <span>Paiement</span>
                <strong>
                  {
                    getPaymentMethodMeta(selectedSale.paymentMethod).label
                  }
                </strong>
              </div>
              <div className="detail-stat">
                <span>Sync</span>
                <strong>
                  {getSyncStatusMeta(
                    selectedSale.syncStatus,
                    selectedSale.localOnly
                  ).label}
                </strong>
              </div>
              {selectedSale.syncStatus === "failed" && selectedSale.syncError ? (
                <div className="detail-stat">
                  <span>Erreur sync</span>
                  <strong>{selectedSale.syncError}</strong>
                </div>
              ) : null}
              <div className="detail-stat">
                <span>Numero client</span>
                <strong>
                  {selectedSale.customerNumber
                    ? `#${selectedSale.customerNumber}`
                    : "#1"}
                </strong>
              </div>
              <div className="detail-stat">
                <span>Nom client</span>
                <strong>{selectedSale.customerName || "Client inconnu"}</strong>
              </div>
              <div className="detail-stat">
                <span>Credit client</span>
                <strong>{formatCurrencyDh(selectedSale.customerCredit || 0)}</strong>
              </div>
              <div className="detail-stat">
                <span>Statut</span>
                <strong>
                  {selectedSale.localOnly
                    ? "En attente sync"
                    : getSaleStatusMeta(
                        selectedSale.status,
                        selectedSale.paymentMethod
                      ).label}
                </strong>
              </div>
            </div>

            <DataTable
              columns={[
                { key: "product", label: "Produit" },
                { key: "quantity", label: "Quantite" },
                { key: "returned", label: "Retourne" },
                { key: "unitPrice", label: "Prix unitaire" },
                { key: "subtotal", label: "Sous-total" },
              ]}
              data={selectedSale.items || []}
              renderRow={(item, index) => {
                const productName =
                  item.name || item.productName || item.product?.name || "-";
                const unitPrice = item.unitPrice || item.price || 0;

                return (
                  <tr
                    key={`${
                      selectedSale.ticketNumber || selectedSale.id
                    }-${productName}-${index}`}
                  >
                    <td>{productName}</td>
                    <td>{item.quantity || 0}</td>
                    <td>{item.returnedQuantity || 0}</td>
                    <td>{formatCurrencyDh(unitPrice)}</td>
                    <td>
                      {formatCurrencyDh(
                        item.subtotal || (item.quantity || 0) * unitPrice
                      )}
                    </td>
                  </tr>
                );
              }}
            />

            <div className="details-summary">
              <span>Total ticket</span>
              <strong>{formatCurrencyDh(selectedSale.total || 0)}</strong>
            </div>
          </>
        ) : null}
      </Modal>

      <Modal
        isOpen={Boolean(saleToCancel)}
        eyebrow="Annulation vente"
        title="Annuler cette vente"
        description="Êtes-vous sûr d'annuler cette vente ?"
        onClose={closeCancelModal}
        actions={
          <>
            <button
              className="ghost-button"
              type="button"
              onClick={closeCancelModal}
              disabled={isSubmittingCancel}
            >
              Annuler
            </button>
            <button
              className="table-action-button danger"
              type="button"
              onClick={handleConfirmCancel}
              disabled={isSubmittingCancel}
            >
              {isSubmittingCancel ? "Confirmation..." : "Confirmer"}
            </button>
          </>
        }
      >
        {cancelModalError ? (
          <div className="inline-notice error">{cancelModalError}</div>
        ) : null}

        {saleToCancel ? (
          <div className="delete-product-summary">
            <p className="delete-product-name">
              {saleToCancel.ticketNumber || saleToCancel.id}
            </p>
            <p className="delete-product-meta">
              Magasin: {saleToCancel.storeName || saleToCancel.store?.name || "-"}
            </p>
            <p className="delete-product-meta">
              Total: {formatCurrencyDh(saleToCancel.total || 0)}
            </p>
          </div>
        ) : null}
      </Modal>

      <Modal
        isOpen={Boolean(saleToPayCredit)}
        eyebrow="Paiement credit"
        title={
          saleToPayCredit
            ? `Payer le credit de ${saleToPayCredit.customerName || "ce client"}`
            : "Payer credit"
        }
        description="Enregistrez un paiement de credit directement depuis le ticket."
        onClose={closeCreditPaymentModal}
        actions={
          <>
            <button
              className="ghost-button"
              type="button"
              onClick={closeCreditPaymentModal}
              disabled={isSubmittingCreditPayment}
            >
              Annuler
            </button>
            <button
              className="primary-button"
              type="submit"
              form="credit-payment-form"
              disabled={isSubmittingCreditPayment}
            >
              {isSubmittingCreditPayment
                ? "Paiement..."
                : "Confirmer paiement"}
            </button>
          </>
        }
      >
        <form
          className="form-grid"
          id="credit-payment-form"
          onSubmit={handleSubmitCreditPayment}
        >
          {creditPaymentError ? (
            <div className="inline-notice error">{creditPaymentError}</div>
          ) : null}

          {saleToPayCredit ? (
            <div className="delete-product-summary">
              <p className="delete-product-name">
                {saleToPayCredit.ticketNumber || saleToPayCredit.id}
              </p>
              <p className="delete-product-meta">
                Client: {saleToPayCredit.customerName || "Client inconnu"}
              </p>
              <p className="delete-product-meta">
                Credit actuel: {formatCurrencyDh(saleToPayCredit.customerCredit || 0)}
              </p>
              <p className="delete-product-meta">
                Total ticket: {formatCurrencyDh(saleToPayCredit.total || 0)}
              </p>
            </div>
          ) : null}

          <div className="field-group">
            <label className="field-label" htmlFor="credit-payment-amount">
              Montant paye
            </label>
            <input
              id="credit-payment-amount"
              className="text-input"
              type="number"
              min="0.01"
              step="0.01"
              max={Number(saleToPayCredit?.customerCredit || 0)}
              value={creditPaymentAmount}
              onChange={(event) => {
                setCreditPaymentError("");
                setCreditPaymentAmount(event.target.value);
              }}
            />
          </div>

          <div className="field-group">
            <label className="field-label" htmlFor="credit-payment-note">
              Note
            </label>
            <textarea
              id="credit-payment-note"
              className="text-input"
              rows="4"
              value={creditPaymentNote}
              onChange={(event) => {
                setCreditPaymentError("");
                setCreditPaymentNote(event.target.value);
              }}
            />
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={Boolean(saleToReturn)}
        eyebrow="Retour produits"
        title={
          saleToReturn
            ? `Retour sur ${saleToReturn.ticketNumber || saleToReturn.id}`
            : "Retour produits"
        }
        description="Selectionnez les quantites a reintegrer en stock et precisez une raison si necessaire."
        onClose={closeReturnModal}
        actions={
          <>
            <button
              className="ghost-button"
              type="button"
              onClick={closeReturnModal}
              disabled={isSubmittingReturn}
            >
              Annuler
            </button>
            <button
              className="primary-button"
              type="submit"
              form="sale-return-form"
              disabled={isSubmittingReturn}
            >
              {isSubmittingReturn ? "Enregistrement..." : "Confirmer retour"}
            </button>
          </>
        }
      >
        <form className="form-grid" id="sale-return-form" onSubmit={handleSubmitReturn}>
          {returnModalError ? (
            <div className="inline-notice error">{returnModalError}</div>
          ) : null}

          {(saleToReturn?.items || []).map((item) => {
            const productName =
              item.productName || item.name || item.product?.name || "-";
            const maxQuantity = item.remainingReturnQuantity ?? item.quantity ?? 0;

            return (
              <div className="delete-product-summary" key={item.productId || productName}>
                <p className="delete-product-name">{productName}</p>
                <p className="delete-product-meta">
                  Vendu: {item.quantity || 0} | Deja retourne: {item.returnedQuantity || 0}
                </p>
                <div className="field-group compact-field">
                  <label className="field-label" htmlFor={`return-quantity-${item.productId}`}>
                    Quantite a retourner
                  </label>
                  <input
                    id={`return-quantity-${item.productId}`}
                    className="text-input"
                    type="number"
                    min="0"
                    max={maxQuantity}
                    step="1"
                    value={returnQuantities[item.productId] ?? ""}
                    onChange={(event) =>
                      handleReturnQuantityChange(item.productId, event.target.value)
                    }
                    placeholder={`Max ${maxQuantity}`}
                  />
                </div>
              </div>
            );
          })}

          <div className="field-group">
            <label className="field-label" htmlFor="sale-return-reason">
              Raison
            </label>
            <textarea
              id="sale-return-reason"
              className="text-input"
              rows="4"
              value={returnReason}
              onChange={(event) => {
                setReturnModalError("");
                setReturnReason(event.target.value);
              }}
              placeholder="Client return"
            />
          </div>
        </form>
      </Modal>
    </div>
  );
}

export default SalesHistoryPage;
