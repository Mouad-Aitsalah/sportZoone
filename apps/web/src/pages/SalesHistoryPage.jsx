import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
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
import { getCurrentUser, isAdminRole, isCashierRole } from "../store/authStore";
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

const getLocalDateKey = (value) => {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
};

const getLocalMonthKey = (value) => {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return `${date.getMonth() + 1}/${date.getFullYear()}`;
};

const getMonthMeta = (value) => {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const month = date.getMonth() + 1;
  const year = date.getFullYear();
  const monthName = new Intl.DateTimeFormat("fr-FR", {
    month: "long",
    year: "numeric",
  }).format(date);

  return {
    key: `${month}/${year}`,
    month,
    year,
    monthName: monthName.charAt(0).toUpperCase() + monthName.slice(1),
  };
};

const getSaleLinePurchasePrice = (item) => {
  const variantPurchasePrice = Number(item?.variant?.purchasePrice);

  if (Number.isFinite(variantPurchasePrice)) {
    return variantPurchasePrice;
  }

  const linePurchasePrice = Number(item?.purchasePrice);
  return Number.isFinite(linePurchasePrice) ? linePurchasePrice : 0;
};

const getSaleNetProfit = (sale) =>
  (sale?.items || []).reduce((profit, item) => {
    const quantity = Math.abs(Number(item?.quantity || 0));
    const unitPrice = Math.abs(Number(item?.unitPrice || 0));
    const purchasePrice = getSaleLinePurchasePrice(item);
    const subtotal = Number(item?.subtotal || 0);
    const lineProfit = (unitPrice - purchasePrice) * quantity;

    return subtotal < 0 ? profit - lineProfit : profit + lineProfit;
  }, 0);

const getSaleTotalPurchase = (sale) =>
  (sale?.items || []).reduce((totalPurchase, item) => {
    const quantity = Math.abs(Number(item?.quantity || 0));
    const purchasePrice = getSaleLinePurchasePrice(item);
    const subtotal = Number(item?.subtotal || 0);
    const lineTotalPurchase = purchasePrice * quantity;

    return subtotal < 0
      ? totalPurchase - lineTotalPurchase
      : totalPurchase + lineTotalPurchase;
  }, 0);

const buildInitialReturnQuantities = (sale) =>
  (sale?.items || []).reduce((accumulator, item) => {
    accumulator[`${item.productId}-${item.variantId || 0}`] = "";
    return accumulator;
  }, {});

const getSaleTypeMeta = (type, total = 0) => {
  if (type === "refund" || Number(total || 0) < 0) {
    return {
      label: "Remboursement",
      tone: "info",
    };
  }

  return {
    label: "Vente",
    tone: "success",
  };
};

const getSaleStatusMeta = (
  status,
  paymentMethod,
  type,
  total = 0,
  paymentStatus = null
) => {
  if (type === "refund" || Number(total || 0) < 0) {
    return {
      label: "Remboursement",
      tone: "info",
    };
  }

  if (paymentStatus === "PARTIALLY_PAID" || status === "partially_paid") {
    return {
      label: "Partiellement paye",
      tone: "warning",
    };
  }

  if (paymentStatus === "CREDIT") {
    return {
      label: "Credit",
      tone: "warning",
    };
  }

  if (paymentStatus === "PAID") {
    return {
      label: "Paye",
      tone: "success",
    };
  }

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
  if (paymentMethod === "partial") {
    return {
      label: "Paiement partiel",
      tone: "warning",
    };
  }

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

const getSessionStatusMeta = (status) => {
  if (status === "FERMEE") {
    return {
      label: "Fermee",
      tone: "danger",
    };
  }

  if (status === "OUVERTE") {
    return {
      label: "Ouverte",
      tone: "success",
    };
  }

  return {
    label: "Non archivee",
    tone: "info",
  };
};

const filterSalesList = (sales, { searchTerm, selectedDate, selectedPaymentMethod }) => {
  const query = searchTerm.trim().toLowerCase();

  return sales.filter((sale) => {
    const ticket = sale.ticketNumber || sale.id?.toString() || "";
    const customerName = sale.customerName || "";
    const customerNumber = sale.customerNumber || "";
    const saleDate = sale.date || sale.createdAt || "";
    const matchesSearch =
      !query ||
      ticket.toLowerCase().includes(query) ||
      customerName.toLowerCase().includes(query) ||
      String(customerNumber).includes(query);
    const matchesDate = !selectedDate || saleDate.startsWith(selectedDate);
    const matchesPaymentMethod =
      selectedPaymentMethod === "all" || sale.paymentMethod === selectedPaymentMethod;

    return matchesSearch && matchesDate && matchesPaymentMethod;
  });
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
  type: "sale",
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
  paidAmount: sale.paidAmount || sale.total || 0,
  remainingAmount: sale.remainingAmount || 0,
  paymentStatus: sale.paymentStatus || "PAID",
  status: "pending_sync",
  syncStatus: sale.syncStatus || "pending",
  syncError: sale.syncError || null,
  total: sale.total || 0,
  itemsCount: Array.isArray(sale.items) ? sale.items.length : 0,
  localOnly: true,
  items: (sale.items || []).map((item) => ({
    productId: item.productId,
    variantId: item.variantId || null,
    productName: item.productName || item.name || `Produit #${item.productId || "-"}`,
    variantLabel: item.variantLabel || null,
    quantity: item.quantity || 0,
    returnedQuantity: 0,
    remainingReturnQuantity: 0,
    unitPrice: item.unitPrice || 0,
    subtotal:
      item.subtotal || (item.quantity || 0) * (item.unitPrice || 0),
  })),
});

function SalesHistoryPage() {
  const location = useLocation();
  const [activeTab, setActiveTab] = useState("commandes");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState("all");
  const [selectedSale, setSelectedSale] = useState(null);
  const [saleToCancel, setSaleToCancel] = useState(null);
  const [saleToReturn, setSaleToReturn] = useState(null);
  const [saleToPay, setSaleToPay] = useState(null);
  const [returnQuantities, setReturnQuantities] = useState({});
  const [returnReason, setReturnReason] = useState("");
  const [salePaymentAmount, setSalePaymentAmount] = useState("");
  const [salePaymentMethod, setSalePaymentMethod] = useState("cash");
  const [backendSales, setBackendSales] = useState([]);
  const [backendSessions, setBackendSessions] = useState([]);
  const [offlineSales, setOfflineSalesState] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingSessionDetails, setIsLoadingSessionDetails] = useState(false);
  const [isExportingExcel, setIsExportingExcel] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isSubmittingCancel, setIsSubmittingCancel] = useState(false);
  const [isSubmittingReturn, setIsSubmittingReturn] = useState(false);
  const [isSubmittingSalePayment, setIsSubmittingSalePayment] = useState(false);
  const [isSynchronizingOfflineSales, setIsSynchronizingOfflineSales] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [notice, setNotice] = useState({ type: "", message: "" });
  const [cancelModalError, setCancelModalError] = useState("");
  const [returnModalError, setReturnModalError] = useState("");
  const [salePaymentError, setSalePaymentError] = useState("");
  const [selectedSession, setSelectedSession] = useState(null);
  const [selectedSessionError, setSelectedSessionError] = useState("");
  const [refundSelectionMode, setRefundSelectionMode] = useState(false);
  const currentUser = getCurrentUser();
  const isAdmin = isAdminRole(currentUser?.role);
  const isCashier = isCashierRole(currentUser?.role);
  const visibleActiveTab = isCashier ? "commandes" : activeTab;

  const loadOfflineSalesState = useCallback(async () => {
    const localSales = await getOfflineSales();
    setOfflineSalesState(localSales.map(mapOfflineSaleToHistorySale));
    return localSales;
  }, []);

  const fetchPageData = useCallback(async () => {
    const [salesResult, sessionsResult, offlineSalesResult] = await Promise.allSettled([
      api.get("/sales", {
        params: {
          limit: 500,
        },
      }),
      isCashier ? Promise.resolve({ data: { data: [] } }) : api.getCashSessions(),
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

    if (sessionsResult.status === "fulfilled") {
      setBackendSessions(getCollection(sessionsResult.value.data, ["data", "sessions"]));
    } else {
      setBackendSessions([]);
    }

    const hasOfflineSales =
      offlineSalesResult.status === "fulfilled" && offlineSalesResult.value.length > 0;

    if (salesResult.status === "rejected" && sessionsResult.status === "rejected" && !hasOfflineSales) {
      throw salesResult.reason;
    }
  }, [isCashier]);

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

  useEffect(() => {
    const handleSalesUpdated = () => {
      fetchPageData().catch(() => {});
    };

    window.addEventListener("sportzone:sales-updated", handleSalesUpdated);
    return () => {
      window.removeEventListener("sportzone:sales-updated", handleSalesUpdated);
    };
  }, [fetchPageData]);

  useEffect(() => {
    const hasRefundIntent = location.state?.refundMode === true;

    if (hasRefundIntent) {
      setActiveTab("commandes");
      setSelectedSession(null);
      setSelectedSessionError("");
      setRefundSelectionMode(true);
      return;
    }

    setRefundSelectionMode(false);
  }, [location.key, location.state]);

  useEffect(() => {
    if (!isCashier) {
      return;
    }

    if (activeTab !== "commandes") {
      setActiveTab("commandes");
    }

    if (selectedSession) {
      setSelectedSession(null);
      setSelectedSessionError("");
    }
  }, [activeTab, isCashier, selectedSession]);

  const sales = useMemo(
    () =>
      [...offlineSales, ...backendSales].sort(
        (left, right) =>
          new Date(right.date || right.createdAt || 0).getTime() -
          new Date(left.date || left.createdAt || 0).getTime()
      ),
    [backendSales, offlineSales]
  );

  const hasSyncableOfflineSales = useMemo(
    () =>
      offlineSales.some(
        (sale) => sale.localOnly && ["pending", "failed"].includes(sale.syncStatus)
      ),
    [offlineSales]
  );

  const filteredSales = useMemo(
    () =>
      filterSalesList(sales, {
        searchTerm,
        selectedDate,
        selectedPaymentMethod,
      }),
    [sales, searchTerm, selectedDate, selectedPaymentMethod]
  );

  const sessions = useMemo(() => backendSessions, [backendSessions]);

  const filteredSessions = useMemo(
    () =>
      sessions.filter((session) => {
        const query = searchTerm.trim().toLowerCase();
        const sessionLabel = String(session.sessionNumber || "").toLowerCase();
        const sessionDateKey = getLocalDateKey(session.openedAt || session.date || session.createdAt);
        const matchesSearch =
          !query ||
          sessionLabel.includes(query) ||
          String(sessionDateKey || "").includes(query);
        const matchesDate = !selectedDate || sessionDateKey === selectedDate;

        return matchesSearch && matchesDate;
      }),
    [sessions, searchTerm, selectedDate]
  );

  const filteredSelectedSessionSales = useMemo(
    () =>
      filterSalesList(selectedSession?.sales || [], {
        searchTerm,
        selectedDate,
        selectedPaymentMethod,
      }),
    [selectedSession, searchTerm, selectedDate, selectedPaymentMethod]
  );

  const monthlySummaries = useMemo(() => {
    const groupedMonths = new Map();

    sales.forEach((sale) => {
      const saleDate = sale.date || sale.createdAt;
      const monthMeta = getMonthMeta(saleDate);

      if (!monthMeta) {
        return;
      }

      const existingMonth = groupedMonths.get(monthMeta.key) || {
        id: monthMeta.key,
        monthKey: monthMeta.key,
        month: monthMeta.month,
        year: monthMeta.year,
        monthName: monthMeta.monthName,
        ordersCount: 0,
        totalSales: 0,
        totalRefunds: 0,
        totalNet: 0,
      };

      const saleTotal = Number(sale.total || 0);

      existingMonth.ordersCount += 1;
      existingMonth.totalSales += saleTotal;

      if (saleTotal < 0 || sale.type === "refund") {
        existingMonth.totalRefunds += Math.abs(saleTotal);
      }

      existingMonth.totalNet += getSaleNetProfit(sale);
      groupedMonths.set(monthMeta.key, existingMonth);
    });

    return Array.from(groupedMonths.values()).sort((left, right) => {
      if (left.year !== right.year) {
        return right.year - left.year;
      }

      return right.month - left.month;
    });
  }, [sales]);

  const filteredMonthlySummaries = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    const selectedMonthKey = selectedDate ? getLocalMonthKey(selectedDate) : "";

    return monthlySummaries.filter((monthSummary) => {
      const matchesSearch =
        !query ||
        monthSummary.monthKey.toLowerCase().includes(query) ||
        String(monthSummary.year).includes(query) ||
        monthSummary.monthName.toLowerCase().includes(query);
      const matchesDate = !selectedMonthKey || monthSummary.monthKey === selectedMonthKey;

      return matchesSearch && matchesDate;
    });
  }, [monthlySummaries, searchTerm, selectedDate]);

  const handleOpenSession = useCallback(async (session) => {
    if (!session?.id) {
      return;
    }

    try {
      setIsLoadingSessionDetails(true);
      setSelectedSessionError("");
      const response = await api.getCashSessionById(session.id);
      setSelectedSession(response.data?.data || session);
    } catch (error) {
      setSelectedSession(session);
      setSelectedSessionError(
        error.response?.data?.message || "Impossible de charger les commandes de cette session."
      );
    } finally {
      setIsLoadingSessionDetails(false);
    }
  }, []);

  const renderSaleRow = (sale, index) => {
    const ticket = sale.ticketNumber || sale.id?.toString() || "-";
    const customerLabel = sale.customerName
      ? `#${sale.customerNumber || "-"} - ${sale.customerName}`
      : "Client inconnu";
    const saleDate = sale.date || sale.createdAt;
    const items = sale.items || [];
    const itemsCount = sale.itemsCount || items.length || 0;
    const saleNet =
      Number.isFinite(Number(sale.net)) ? Number(sale.net) : getSaleNetProfit(sale);
    const paymentMeta = getPaymentMethodMeta(sale.paymentMethod);
    const statusMeta = sale.localOnly
      ? {
          label: "En attente sync",
          tone: "warning",
        }
      : getSaleStatusMeta(
          sale.status,
          sale.paymentMethod,
          sale.type,
          sale.total,
          sale.paymentStatus
        );
    const returnActionLabel = refundSelectionMode
      ? "Rembourser cette facture"
      : "Retour";
    const returnActionClassName = refundSelectionMode
      ? "secondary-button sales-refund-action"
      : "table-action-button";

    return (
      <tr key={`${ticket}-${index}`}>
        <td>
          <strong>{ticket}</strong>
        </td>
        <td>{saleDate ? formatDateTime(saleDate) : "-"}</td>
        <td>{customerLabel}</td>
        <td>{itemsCount}</td>
        <td>{formatCurrencyDh(sale.total || 0)}</td>
        <td>{formatCurrencyDh(saleNet)}</td>
        <td>
          <div className="table-cell-stack">
            <Badge tone={paymentMeta.tone}>{paymentMeta.label}</Badge>
            {Number(sale.paidAmount || 0) > 0 &&
            Number(sale.remainingAmount || 0) > 0 ? (
              <>
                <span className="muted-text">
                  Paye: {formatCurrencyDh(sale.paidAmount || 0)}
                </span>
                <span className="muted-text">
                  Reste: {formatCurrencyDh(sale.remainingAmount || 0)}
                </span>
              </>
            ) : null}
            {sale.localOnly ? (
              <span className="muted-text">
                {getSyncStatusMeta(sale.syncStatus, sale.localOnly).label}
              </span>
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
                className={returnActionClassName}
                type="button"
                onClick={() => openReturnModal(sale)}
              >
                {returnActionLabel}
              </button>
            ) : null}
            {canAddPaymentSale(sale) ? (
              <button
                className="table-action-button"
                type="button"
                onClick={() => openSalePaymentModal(sale)}
              >
                Ajouter paiement
              </button>
            ) : null}
          </div>
        </td>
      </tr>
    );
  };

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
    const totalPurchase =
      Number.isFinite(Number(sale.totalPurchase))
        ? Number(sale.totalPurchase)
        : getSaleTotalPurchase(sale);
    const net = Number.isFinite(Number(sale.net)) ? Number(sale.net) : getSaleNetProfit(sale);
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
              <h1 class="ticket-title">SportZone</h1>
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

            ${
              isAdmin
                ? `
            <div class="ticket-meta" style="margin-top: 12px;">
              <div class="ticket-meta-row">
                <span>Total achat</span>
                <strong>${escapeHtml(formatCurrencyDh(totalPurchase))}</strong>
              </div>
              <div class="ticket-meta-row">
                <span>Net</span>
                <strong>${escapeHtml(formatCurrencyDh(net))}</strong>
              </div>
            </div>
            `
                : ""
            }

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
    const params = {
      search: searchTerm.trim() || undefined,
      startDate: selectedDate || undefined,
      endDate: selectedDate || undefined,
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
          paidAmount: sale.paidAmount,
          remainingAmount: sale.remainingAmount,
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
    sale?.type !== "refund" &&
    sale?.status !== "cancelled" &&
    sale?.items?.some((item) => (item.remainingReturnQuantity ?? item.quantity ?? 0) > 0);

  const canAddPaymentSale = (sale) =>
    !sale?.localOnly &&
    sale?.type !== "refund" &&
    Number(sale?.remainingAmount || 0) > 0 &&
    ["credit", "partial"].includes(sale?.paymentMethod);

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

  const openSalePaymentModal = (sale) => {
    setNotice({ type: "", message: "" });
    setSalePaymentError("");
    setSelectedSale(null);
    setSaleToPay(sale);
    setSalePaymentAmount(String(Number(sale?.remainingAmount || 0) || ""));
    setSalePaymentMethod("cash");
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

  const closeSalePaymentModal = () => {
    if (isSubmittingSalePayment) {
      return;
    }

    setSaleToPay(null);
    setSalePaymentAmount("");
    setSalePaymentMethod("cash");
    setSalePaymentError("");
  };

  const handleReturnQuantityChange = (itemKey, value) => {
    if (value === "") {
      setReturnQuantities((current) => ({
        ...current,
        [itemKey]: "",
      }));
      return;
    }

    const normalizedValue = Math.max(0, Number(value) || 0);

    setReturnModalError("");
    setReturnQuantities((current) => ({
      ...current,
      [itemKey]: String(normalizedValue),
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
        const itemKey = `${item.productId}-${item.variantId || 0}`;
        const rawQuantity = returnQuantities[itemKey];
        const quantity = rawQuantity === "" ? 0 : Number(rawQuantity);

        return {
          productId: item.productId,
          variantId: item.variantId || null,
          productName: item.productName || item.name || "-",
          variantLabel: item.variantLabel || null,
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
      if (!Number.isFinite(item.quantity) || item.quantity <= 0) {
        setReturnModalError(
          `La quantite retournee pour ${item.productName} doit etre un nombre positif.`
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

      const payload = {
        items: normalizedItems.map((item) => ({
          produitId: item.productId,
          varianteId: item.variantId,
          quantity: item.quantity,
        })),
        reason: returnReason.trim(),
      };

      const response = refundSelectionMode
        ? await api.post("/refunds", {
            ...payload,
            saleId: saleToReturn.id,
          })
        : await api.post(`/sales/${saleToReturn.id}/return`, payload);

      await fetchPageData();
      closeReturnModal();
      setNotice({
        type: "success",
        message: refundSelectionMode
          ? `Remboursement cree${
              response?.data?.sale?.ticketNumber
                ? ` (${response.data.sale.ticketNumber})`
                : ""
            }`
          : "Retour effectue",
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

  const handleSubmitSalePayment = async (event) => {
    event.preventDefault();

    if (!saleToPay?.id) {
      setSalePaymentError("Vente introuvable pour ce ticket.");
      return;
    }

    if (salePaymentAmount === "") {
      setSalePaymentError("Le montant recu est obligatoire.");
      return;
    }

    const amount = Number(salePaymentAmount);
    const remainingAmount = Number(saleToPay?.remainingAmount || 0);

    if (!Number.isFinite(amount) || amount <= 0) {
      setSalePaymentError("Le montant recu doit etre superieur a 0.");
      return;
    }

    if (amount > remainingAmount) {
      setSalePaymentError("Le montant recu ne peut pas depasser le reste a payer.");
      return;
    }

    if (!["cash", "card"].includes(salePaymentMethod)) {
      setSalePaymentError("Le mode de paiement doit etre Especes ou Carte bancaire.");
      return;
    }

    try {
      setIsSubmittingSalePayment(true);
      setSalePaymentError("");

      await api.patch(`/sales/${saleToPay.id}/payment`, {
        amount,
        paymentMethod: salePaymentMethod,
      });
      await fetchPageData();
      closeSalePaymentModal();
      setNotice({
        type: "success",
        message: "Paiement ajoute avec succes.",
      });
    } catch (error) {
      setSalePaymentError(
        error.response?.data?.message ||
          "Impossible d'enregistrer ce paiement pour le moment."
      );
    } finally {
      setIsSubmittingSalePayment(false);
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow="Historique"
        title="Historique des ventes"
        description="Consulter les commandes et les sessions journalieres du POS SportZone."
      />

      {notice.message ? (
        <div className={`inline-notice ${notice.type}`}>{notice.message}</div>
      ) : null}

      {refundSelectionMode ? (
        <div className="inline-notice info sales-refund-banner">
          <Badge tone="info">Mode remboursement</Badge>
          <span>Selectionnez une facture a rembourser dans l'onglet Commandes.</span>
        </div>
      ) : null}

      <div className="period-selector">
        <button
          className={`period-button ${visibleActiveTab === "commandes" ? "active" : ""}`}
          type="button"
          onClick={() => setActiveTab("commandes")}
        >
          Commandes
        </button>
        {!isCashier ? (
          <>
            <button
              className={`period-button ${visibleActiveTab === "sessions" ? "active" : ""}`}
              type="button"
              onClick={() => setActiveTab("sessions")}
            >
              Sessions
            </button>
            <button
              className={`period-button ${visibleActiveTab === "mois" ? "active" : ""}`}
              type="button"
              onClick={() => setActiveTab("mois")}
            >
              Mois
            </button>
          </>
        ) : null}
      </div>

      <SectionCard
        title={
          visibleActiveTab === "commandes"
            ? "Commandes"
            : visibleActiveTab === "sessions"
              ? "Sessions"
              : "Mois"
        }
        description={
          visibleActiveTab === "commandes"
            ? refundSelectionMode
              ? "Selectionnez une facture a rembourser. L'action de retour reste disponible et mise en avant."
              : "Contient toutes les factures et tickets de vente: ventes normales, remboursements, paiements partiels et credits."
            : visibleActiveTab === "sessions"
              ? "Contient les journees POS regroupees par session reelle sous la forme POS/1, POS/2, POS/3..."
              : "Contient les ventes regroupees par mois civil avec chiffre d'affaires, remboursements et benefice net."
        }
        actions={
          visibleActiveTab === "commandes"
            ? (
              <div className="table-action-row">
                {refundSelectionMode ? (
                  <Badge tone="info">Selection facture remboursement</Badge>
                ) : null}
                {hasSyncableOfflineSales ? (
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
                ) : null}
              </div>
            )
            : null
        }
      >
        <div className="filter-row">
          <SearchInput
            value={searchTerm}
            onChange={setSearchTerm}
            placeholder={
              visibleActiveTab === "commandes" ||
              (visibleActiveTab === "sessions" && Boolean(selectedSession))
                ? "Rechercher par ticket ou client"
                : visibleActiveTab === "sessions"
                  ? "Rechercher par session ou date"
                  : "Rechercher par mois ou annee"
            }
          />

          <input
            className="text-input select-input"
            type="date"
            value={selectedDate}
            onChange={(event) => setSelectedDate(event.target.value)}
          />

          {visibleActiveTab === "commandes" ||
          (visibleActiveTab === "sessions" && Boolean(selectedSession)) ? (
            <>
              <select
                className="text-input select-input"
                value={selectedPaymentMethod}
                onChange={(event) => setSelectedPaymentMethod(event.target.value)}
              >
                <option value="all">Tous les paiements</option>
                <option value="cash">Especes</option>
                <option value="card">Carte bancaire</option>
                <option value="credit">Credit</option>
                <option value="partial">Paiement partiel</option>
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
            </>
          ) : null}
        </div>

        {errorMessage ? (
          <div className="inline-notice error">{errorMessage}</div>
        ) : null}

        {visibleActiveTab === "commandes" ? (
          <DataTable
            columns={[
              { key: "ticket", label: "Ticket" },
              { key: "date", label: "Date" },
              { key: "customer", label: "Client" },
              { key: "items", label: "Nb articles" },
              { key: "total", label: "Total" },
              { key: "net", label: "Net" },
              { key: "payment", label: "Paiement" },
              { key: "status", label: "Statut" },
              { key: "actions", label: "Actions" },
            ]}
            data={filteredSales}
            emptyTitle={
              isLoading ? "Chargement..." : "Aucune commande trouvee pour ce filtre"
            }
            emptyDescription={
              isLoading
                ? "Recuperation des commandes en cours."
                : "Modifiez les filtres pour afficher des tickets."
            }
            renderRow={renderSaleRow}
          />
        ) : visibleActiveTab === "sessions" && selectedSession ? (
          <div className="sales-session-view">
            {selectedSessionError ? (
              <div className="inline-notice warning">{selectedSessionError}</div>
            ) : null}

            <SectionCard
              title={`Commandes de ${selectedSession.sessionNumber}`}
              description="Vue detaillee des commandes rattachees a cette session POS."
              actions={
                <button
                  className="ghost-button"
                  type="button"
                  onClick={() => {
                    setSelectedSession(null);
                    setSelectedSessionError("");
                  }}
                >
                  Retour aux sessions
                </button>
              }
            >
              <div className="details-list">
                <div className="detail-stat">
                  <span>Date ouverture</span>
                  <strong>{formatDateTime(selectedSession.openedAt || selectedSession.date)}</strong>
                </div>
                <div className="detail-stat">
                  <span>Date cloture</span>
                  <strong>
                    {selectedSession.closedAt
                      ? formatDateTime(selectedSession.closedAt)
                      : "-"}
                  </strong>
                </div>
                <div className="detail-stat">
                  <span>Total ventes</span>
                  <strong>{formatCurrencyDh(selectedSession.totalSales || 0)}</strong>
                </div>
                <div className="detail-stat">
                  <span>Total remboursements</span>
                  <strong>{formatCurrencyDh(selectedSession.totalRefunds || 0)}</strong>
                </div>
                <div className="detail-stat">
                  <span>Total net</span>
                  <strong>{formatCurrencyDh(selectedSession.totalNet || 0)}</strong>
                </div>
                <div className="detail-stat">
                  <span>Statut</span>
                  <strong>{getSessionStatusMeta(selectedSession.status).label}</strong>
                </div>
              </div>

              <DataTable
                columns={[
                  { key: "ticket", label: "Ticket" },
                  { key: "date", label: "Date" },
                  { key: "customer", label: "Client" },
                  { key: "items", label: "Nb articles" },
                  { key: "total", label: "Total" },
                  { key: "net", label: "Net" },
                  { key: "payment", label: "Paiement" },
                  { key: "status", label: "Statut" },
                  { key: "actions", label: "Actions" },
                ]}
                data={filteredSelectedSessionSales}
                emptyTitle={
                  isLoadingSessionDetails
                    ? "Chargement des commandes..."
                    : "Aucune commande pour cette session"
                }
                emptyDescription={
                  isLoadingSessionDetails
                    ? "Recuperation des commandes de la session en cours."
                    : "Ajustez les filtres ou revenez aux sessions."
                }
                renderRow={renderSaleRow}
              />
            </SectionCard>
          </div>
        ) : visibleActiveTab === "sessions" ? (
          <DataTable
            columns={[
              { key: "session", label: "Session" },
              { key: "openedAt", label: "Date ouverture" },
              { key: "closedAt", label: "Date cloture" },
              { key: "orders", label: "Nombre de commandes" },
              { key: "sales", label: "Total ventes" },
              { key: "refunds", label: "Total remboursements" },
              { key: "net", label: "Total net" },
              { key: "status", label: "Statut" },
              { key: "actions", label: "Actions" },
            ]}
            data={filteredSessions}
            emptyTitle={isLoading ? "Chargement..." : "Aucune session trouvee"}
            emptyDescription={
              isLoading
                ? "Recuperation des sessions POS en cours."
                : "Les sessions de caisse cloturees et ouvertes apparaitront ici."
            }
            renderRow={(session) => {
              const statusMeta = getSessionStatusMeta(session.status);

              return (
                <tr key={session.id}>
                  <td>
                    <strong>{session.sessionNumber}</strong>
                  </td>
                  <td>{formatDateTime(session.openedAt)}</td>
                  <td>{session.closedAt ? formatDateTime(session.closedAt) : "-"}</td>
                  <td>{session.ordersCount || 0}</td>
                  <td>{formatCurrencyDh(session.totalSales || 0)}</td>
                  <td>{formatCurrencyDh(session.totalRefunds || 0)}</td>
                  <td>{formatCurrencyDh(session.totalNet || 0)}</td>
                  <td>
                    <Badge tone={statusMeta.tone}>{statusMeta.label}</Badge>
                  </td>
                  <td>
                    <button
                      className="table-action-button"
                      type="button"
                      onClick={() => handleOpenSession(session)}
                    >
                      Voir commandes
                    </button>
                  </td>
                </tr>
              );
            }}
          />
        ) : (
          <DataTable
            columns={[
              { key: "month", label: "Mois" },
              { key: "year", label: "Annee" },
              { key: "orders", label: "Nombre de commandes" },
              { key: "sales", label: "Total vendu" },
              { key: "refunds", label: "Total remboursements" },
              { key: "net", label: "Total net" },
            ]}
            data={filteredMonthlySummaries}
            emptyTitle={isLoading ? "Chargement..." : "Aucun mois trouve"}
            emptyDescription={
              isLoading
                ? "Recuperation des ventes mensuelles en cours."
                : "Les ventes seront regroupees ici par mois."
            }
            renderRow={(monthSummary) => (
              <tr key={monthSummary.id}>
                <td>
                  <div className="table-cell-stack">
                    <strong>{monthSummary.monthKey}</strong>
                    <span className="muted-text">{monthSummary.monthName}</span>
                  </div>
                </td>
                <td>{monthSummary.year}</td>
                <td>{monthSummary.ordersCount || 0}</td>
                <td>{formatCurrencyDh(monthSummary.totalSales || 0)}</td>
                <td>{formatCurrencyDh(monthSummary.totalRefunds || 0)}</td>
                <td>{formatCurrencyDh(monthSummary.totalNet || 0)}</td>
              </tr>
            )}
          />
        )}
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
            ? `${formatDateTime(selectedSale.date || selectedSale.createdAt)}`
            : ""
        }
        onClose={() => setSelectedSale(null)}
        actions={
          <>
            {selectedSale && canReturnSale(selectedSale) ? (
              <button
                className={refundSelectionMode ? "secondary-button" : "ghost-button"}
                type="button"
                onClick={() => openReturnModal(selectedSale)}
              >
                {refundSelectionMode ? "Rembourser cette facture" : "Retour"}
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
            {selectedSale && canAddPaymentSale(selectedSale) ? (
              <button
                className="table-action-button"
                type="button"
                onClick={() => openSalePaymentModal(selectedSale)}
              >
                Ajouter paiement
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
            {(() => {
              const totalPurchase =
                Number.isFinite(Number(selectedSale.totalPurchase))
                  ? Number(selectedSale.totalPurchase)
                  : getSaleTotalPurchase(selectedSale);
              const net = Number.isFinite(Number(selectedSale.net))
                ? Number(selectedSale.net)
                : getSaleNetProfit(selectedSale);

              return (
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
                    <span>Type</span>
                    <strong>{getSaleTypeMeta(selectedSale.type, selectedSale.total).label}</strong>
                  </div>
                  <div className="detail-stat">
                    <span>Paiement</span>
                    <strong>
                      {
                        getPaymentMethodMeta(selectedSale.paymentMethod).label
                      }
                    </strong>
                  </div>
                  {Number(selectedSale.paidAmount || 0) > 0 &&
                  Number(selectedSale.remainingAmount || 0) > 0 ? (
                    <>
                      <div className="detail-stat">
                        <span>Montant paye</span>
                        <strong>{formatCurrencyDh(selectedSale.paidAmount || 0)}</strong>
                      </div>
                      <div className="detail-stat">
                        <span>Reste a payer</span>
                        <strong>{formatCurrencyDh(selectedSale.remainingAmount || 0)}</strong>
                      </div>
                    </>
                  ) : null}
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
                            selectedSale.paymentMethod,
                            selectedSale.type,
                            selectedSale.total,
                            selectedSale.paymentStatus
                          ).label}
                    </strong>
                  </div>
                  <div className="detail-stat">
                    <span>Total facture</span>
                    <strong>{formatCurrencyDh(selectedSale.total || 0)}</strong>
                  </div>
                  <div className="detail-stat">
                    <span>Total achat</span>
                    <strong>{formatCurrencyDh(totalPurchase)}</strong>
                  </div>
                  <div className="detail-stat">
                    <span>Net</span>
                    <strong>{formatCurrencyDh(net)}</strong>
                  </div>
                </div>
              );
            })()}

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
                const displayName = item.variantLabel
                  ? `${productName} / ${item.variantLabel}`
                  : productName;
                const unitPrice = item.unitPrice || item.price || 0;

                return (
                  <tr
                    key={`${
                      selectedSale.ticketNumber || selectedSale.id
                    }-${displayName}-${index}`}
                  >
                    <td>{displayName}</td>
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
              <span>Net</span>
              <strong>
                {formatCurrencyDh(
                  Number.isFinite(Number(selectedSale.net))
                    ? Number(selectedSale.net)
                    : getSaleNetProfit(selectedSale)
                )}
              </strong>
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
              Total: {formatCurrencyDh(saleToCancel.total || 0)}
            </p>
          </div>
        ) : null}
      </Modal>

      <Modal
        isOpen={Boolean(saleToPay)}
        eyebrow="Ajouter paiement"
        title={
          saleToPay
            ? `Ajouter un paiement sur ${saleToPay.ticketNumber || saleToPay.id}`
            : "Ajouter paiement"
        }
        description="Enregistrez un paiement sur une vente partiellement payee ou a credit."
        onClose={closeSalePaymentModal}
        actions={
          <>
            <button
              className="ghost-button"
              type="button"
              onClick={closeSalePaymentModal}
              disabled={isSubmittingSalePayment}
            >
              Annuler
            </button>
            <button
              className="primary-button"
              type="submit"
              form="sale-payment-form"
              disabled={isSubmittingSalePayment}
            >
              {isSubmittingSalePayment ? "Paiement..." : "Valider paiement"}
            </button>
          </>
        }
      >
        <form
          className="form-grid"
          id="sale-payment-form"
          onSubmit={handleSubmitSalePayment}
        >
          {salePaymentError ? (
            <div className="inline-notice error">{salePaymentError}</div>
          ) : null}

          {saleToPay ? (
            <div className="details-list">
              <div className="detail-stat">
                <span>Ticket</span>
                <strong>{saleToPay.ticketNumber || saleToPay.id}</strong>
              </div>
              <div className="detail-stat">
                <span>Total vente</span>
                <strong>{formatCurrencyDh(saleToPay.total || 0)}</strong>
              </div>
              <div className="detail-stat">
                <span>Montant deja paye</span>
                <strong>{formatCurrencyDh(saleToPay.paidAmount || 0)}</strong>
              </div>
              <div className="detail-stat">
                <span>Reste a payer</span>
                <strong>{formatCurrencyDh(saleToPay.remainingAmount || 0)}</strong>
              </div>
            </div>
          ) : null}

          <div className="field-group">
            <label className="field-label" htmlFor="sale-payment-amount">
              Montant recu
            </label>
            <input
              id="sale-payment-amount"
              className="text-input"
              type="number"
              min="0.01"
              step="0.01"
              max={Number(saleToPay?.remainingAmount || 0)}
              value={salePaymentAmount}
              onChange={(event) => {
                setSalePaymentError("");
                setSalePaymentAmount(event.target.value);
              }}
            />
          </div>

          <div className="field-group">
            <label className="field-label" htmlFor="sale-payment-method">
              Mode paiement
            </label>
            <select
              id="sale-payment-method"
              className="text-input select-input"
              value={salePaymentMethod}
              onChange={(event) => {
                setSalePaymentError("");
                setSalePaymentMethod(event.target.value);
              }}
            >
              <option value="cash">Especes</option>
              <option value="card">Carte bancaire</option>
            </select>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={Boolean(saleToReturn)}
        eyebrow={refundSelectionMode ? "Remboursement facture" : "Retour produits"}
        title={
          saleToReturn
            ? refundSelectionMode
              ? `Rembourser ${saleToReturn.ticketNumber || saleToReturn.id}`
              : `Retour sur ${saleToReturn.ticketNumber || saleToReturn.id}`
            : refundSelectionMode
              ? "Remboursement facture"
              : "Retour produits"
        }
        description={
          refundSelectionMode
            ? "Selectionnez les produits et quantites a rembourser. Le stock sera reintegre automatiquement."
            : "Selectionnez les quantites a reintegrer en stock et precisez une raison si necessaire."
        }
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
              {isSubmittingReturn
                ? "Enregistrement..."
                : refundSelectionMode
                  ? "Valider remboursement"
                  : "Confirmer retour"}
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
            const itemKey = `${item.productId}-${item.variantId || 0}`;
            const displayName = item.variantLabel
              ? `${productName} / ${item.variantLabel}`
              : productName;
            const maxQuantity = item.remainingReturnQuantity ?? item.quantity ?? 0;

            return (
              <div className="delete-product-summary" key={itemKey}>
                <p className="delete-product-name">{displayName}</p>
                <p className="delete-product-meta">
                  Vendu: {item.quantity || 0} | Deja retourne: {item.returnedQuantity || 0}
                </p>
                <div className="field-group compact-field">
                  <label className="field-label" htmlFor={`return-quantity-${itemKey}`}>
                    Quantite a retourner
                  </label>
                  <input
                    id={`return-quantity-${itemKey}`}
                  className="text-input"
                  type="number"
                  min="0"
                  step="0.25"
                  max={maxQuantity}
                  value={returnQuantities[itemKey] ?? ""}
                    onChange={(event) =>
                      handleReturnQuantityChange(itemKey, event.target.value)
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
