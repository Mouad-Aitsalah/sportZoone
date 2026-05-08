import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Badge from "../components/Badge";
import DataTable from "../components/DataTable";
import Modal from "../components/Modal";
import PaymentModal from "../components/PaymentModal";
import SectionCard from "../components/SectionCard";
import api from "../services/api";
import { cacheResources, hydrateCachedResource } from "../services/cacheService";
import { getOfflineSales, savePendingSale } from "../services/offlineDb";
import { getCurrentUser } from "../store/authStore";
import { useCart } from "../store/cartStore";
import {
  CACHE_KEYS,
  CACHE_TTL_MS,
  invalidateCache,
  invalidateDomainCaches,
  readCache,
  writeCache,
} from "../utils/appCache";
import { cleanupLegacyStoreCache } from "../utils/storeAccess";
import { formatCurrencyDh } from "../utils/formatters";

const DEFAULT_CUSTOMER = {
  id: null,
  customerNumber: 1,
  name: "Client inconnu",
  phone: null,
  email: null,
  credit: 0,
  active: true,
};

const PRODUCTS_CACHE_KEY = CACHE_KEYS.products("pos");
const CUSTOMERS_CACHE_KEY = CACHE_KEYS.customers();
const POS_PRODUCTS_QUERY = {
  params: {
    page: 1,
    limit: 500,
    view: "pos",
    includeSalesStats: false,
    includePagination: false,
  },
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

const formatTimeValue = (value) => {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "-"
    : date.toLocaleTimeString("fr-MA", {
        hour: "2-digit",
        minute: "2-digit",
      });
};

const getPaymentMethodMeta = (paymentMethod) => {
  if (paymentMethod === "partial") {
    return { label: "Paiement partiel", tone: "warning" };
  }

  if (paymentMethod === "credit") {
    return { label: "Credit", tone: "warning" };
  }

  if (paymentMethod === "card") {
    return { label: "Carte", tone: "info" };
  }

  if (paymentMethod === "transfer") {
    return { label: "Virement", tone: "info" };
  }

  if (paymentMethod === "mobile_money") {
    return { label: "Mobile money", tone: "info" };
  }

  return { label: "Especes", tone: "success" };
};

const getSaleStatusMeta = (status, localOnly = false, paymentStatus = null) => {
  if (localOnly) {
    return {
      label: "Hors ligne",
      tone: "warning",
    };
  }

  if (paymentStatus === "PARTIALLY_PAID") {
    return {
      label: "Partiellement payee",
      tone: "warning",
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

  return {
    label: "Validee",
    tone: "success",
  };
};

const getSessionStatusMeta = (status, hasOfflineOnly = false) => {
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

  if (hasOfflineOnly) {
    return {
      label: "Hors ligne",
      tone: "warning",
    };
  }

  return {
    label: "Aucune session",
    tone: "info",
  };
};

const mapOfflineSaleToArchiveSale = (sale) => ({
  id: `offline-${sale.localId}`,
  ticketNumber: `LOCAL-${String(sale.localId || "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 8)
    .toUpperCase()}`,
  date: sale.createdAt,
  createdAt: sale.createdAt,
  total: Number(sale.total || 0),
  paymentMethod: sale.paymentMethod || "cash",
  paidAmount: Number(sale.paidAmount || 0),
  remainingAmount: Number(sale.remainingAmount || 0),
  paymentStatus: sale.paymentStatus || "PAID",
  status: "pending_sync",
  localOnly: true,
  cashRegisterName:
    sale.caisseName ||
    sale.cashRegisterName ||
    (sale.caisseId || sale.cashRegisterId
      ? `Caisse ${sale.caisseId || sale.cashRegisterId}`
      : null),
  cashierName: sale.cashierName || (sale.userId ? `Utilisateur ${sale.userId}` : null),
  items: (sale.items || []).map((item) => ({
    productId: item.productId,
    variantId: item.variantId || null,
    productName: item.productName || item.name || `Produit #${item.productId || "-"}`,
    variantLabel: item.variantLabel || null,
    quantity: item.quantity || 0,
    unitPrice: item.unitPrice || 0,
    subtotal:
      item.subtotal || Number(item.quantity || 0) * Number(item.unitPrice || 0),
  })),
});

const getActiveVariants = (product) =>
  (product?.variants || []).filter((variant) => variant.active);

const buildCartItemId = (productId, variantId) =>
  `product-${productId}-variant-${variantId || 0}`;

const getProductDisplayName = (productName, variantLabel = null) =>
  variantLabel ? `${productName} / ${variantLabel}` : productName;

const POS_QUANTITY_STEP = 0.25;

const roundPosQuantity = (value) => {
  const numericValue = Number(value || 0);

  if (!Number.isFinite(numericValue)) {
    return 0;
  }

  return Number(
    (Math.round(numericValue / POS_QUANTITY_STEP) * POS_QUANTITY_STEP).toFixed(2)
  );
};

const roundMoneyValue = (value) => Number(Number(value || 0).toFixed(2));

const buildArchiveSaleItems = (cartItems = []) =>
  cartItems.map((item) => ({
    productId: item.productId,
    variantId: item.variantId || null,
    productName: item.name || item.productName || `Produit #${item.productId || "-"}`,
    variantLabel: item.variantLabel || null,
    quantity: Number(item.quantity || 0),
    unitPrice: Number(item.price ?? item.unitPrice ?? 0),
    subtotal: roundMoneyValue(
      Number(item.subtotal ?? Number(item.quantity || 0) * Number(item.price ?? item.unitPrice ?? 0))
    ),
  }));

const buildArchiveSaleRecord = ({
  saleId,
  ticketNumber,
  createdAt,
  total,
  paymentMethod,
  paidAmount = 0,
  remainingAmount = 0,
  paymentStatus = "PAID",
  status = "completed",
  localOnly = false,
  cashRegisterName = null,
  cashierName = null,
  saleItems = [],
}) => ({
  id: saleId,
  ticketNumber,
  date: createdAt,
  createdAt,
  total: Number(total || 0),
  paymentMethod: paymentMethod || "cash",
  paidAmount: Number(paidAmount || 0),
  remainingAmount: Number(remainingAmount || 0),
  paymentStatus: paymentStatus || "PAID",
  status,
  localOnly,
  cashRegisterName,
  cashierName,
  items: buildArchiveSaleItems(saleItems),
});

const mergeArchiveSale = (sales = [], nextSale) =>
  [nextSale, ...sales.filter((sale) => sale.id !== nextSale.id && sale.ticketNumber !== nextSale.ticketNumber)];

const buildEmptyCashSession = ({
  id = null,
  sessionNumber = null,
  status = "OUVERTE",
} = {}) => ({
  id,
  sessionNumber,
  status,
  totalSales: 0,
  totalRefunds: 0,
  totalNet: 0,
  ticketsCount: 0,
  ordersCount: 0,
  sales: [],
});

const buildCashSessionWithSale = (currentSession, nextSale, sessionMeta = {}) => {
  const baseSession = currentSession || buildEmptyCashSession(sessionMeta);
  const nextSales = mergeArchiveSale(baseSession.sales || [], nextSale);

  return {
    ...baseSession,
    ...sessionMeta,
    totalSales: nextSales.reduce(
      (totalValue, sale) => totalValue + Number(sale.total || 0),
      0
    ),
    totalRefunds: nextSales.reduce((totalValue, sale) => {
      const saleTotal = Number(sale.total || 0);
      return saleTotal < 0 ? totalValue + Math.abs(saleTotal) : totalValue;
    }, 0),
    ticketsCount: nextSales.length,
    ordersCount: nextSales.length,
    sales: nextSales,
  };
};

function PosPage() {
  const navigate = useNavigate();
  const [barcode, setBarcode] = useState("");
  const [products, setProducts] = useState([]);
  const [stores, setStores] = useState([]);
  const [cashRegisters, setCashRegisters] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [selectedStoreId, setSelectedStoreId] = useState(null);
  const [selectedCashRegisterId, setSelectedCashRegisterId] = useState(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState(DEFAULT_CUSTOMER.id);
  const [selectedCustomerDetails, setSelectedCustomerDetails] = useState(DEFAULT_CUSTOMER);
  const [customerSearchTerm, setCustomerSearchTerm] = useState("");
  const [isLoadingProducts, setIsLoadingProducts] = useState(true);
  const [isLoadingCustomers, setIsLoadingCustomers] = useState(false);
  const [isLoadingCustomerCredit, setIsLoadingCustomerCredit] = useState(false);
  const [isSearchingBarcode, setIsSearchingBarcode] = useState(false);
  const [isSubmittingSale, setIsSubmittingSale] = useState(false);
  const [currentCashSession, setCurrentCashSession] = useState(null);
  const [offlineArchiveSales, setOfflineArchiveSales] = useState([]);
  const [isLoadingCashSession, setIsLoadingCashSession] = useState(false);
  const [isClosingCashSession, setIsClosingCashSession] = useState(false);
  const [selectedArchivedSale, setSelectedArchivedSale] = useState(null);
  const [refundMode, setRefundMode] = useState(false);
  const [refundReason, setRefundReason] = useState("");
  const [refundPaymentMethod, setRefundPaymentMethod] = useState("cash");
  const [isSubmittingRefund, setIsSubmittingRefund] = useState(false);
  const [variantSelection, setVariantSelection] = useState({
    isOpen: false,
    product: null,
    variants: [],
  });
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [isSubmittingCustomer, setIsSubmittingCustomer] = useState(false);
  const [customerModalError, setCustomerModalError] = useState("");
  const [customerNotice, setCustomerNotice] = useState({ type: "", message: "" });
  const [newCustomerForm, setNewCustomerForm] = useState({
    name: "",
    phone: "",
    email: "",
  });
  const [notice, setNotice] = useState({
    type: "info",
    message:
      "Scannez un code-barres ou utilisez l'ajout rapide pour remplir le panier.",
  });
  const [priceInputs, setPriceInputs] = useState({});
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);
  const [isOnline, setIsOnline] = useState(
    typeof navigator === "undefined" ? true : navigator.onLine
  );
  const currentUser = getCurrentUser();
  const isAdmin = currentUser?.role === "admin";
  const {
    items,
    addItem,
    removeItem,
    increaseQuantity,
    decreaseQuantity,
    updateQuantity,
    updatePrice,
    clearCart,
    totalItems,
    totalAmount,
  } = useCart();

  const activeStoreId = isAdmin ? selectedStoreId : currentUser?.storeId;
  const activeCashRegisterId = isAdmin
    ? selectedCashRegisterId
    : currentUser?.cashRegisterId;
  const activeStoreName =
    stores.find((store) => store.id === activeStoreId)?.name ||
    currentUser?.storeName ||
    null;
  const activeCashRegisterName = isAdmin
    ? cashRegisters.find((cashRegister) => cashRegister.id === selectedCashRegisterId)
        ?.name || null
    : currentUser?.cashRegisterName;
  const selectedCustomer =
    customers.find((customer) => customer.id === selectedCustomerId) ||
    selectedCustomerDetails ||
    DEFAULT_CUSTOMER;
  const customerCredit =
    selectedCustomerDetails?.id === selectedCustomer.id
      ? selectedCustomerDetails.credit ?? selectedCustomer.credit ?? 0
      : selectedCustomer.credit ?? 0;
  const displayTotalAmount = refundMode ? -Math.abs(totalAmount) : totalAmount;
  const currentCashSessionCacheKey = useMemo(
    () =>
      activeStoreId && activeCashRegisterId
        ? CACHE_KEYS.currentCashSession(activeStoreId, activeCashRegisterId, currentUser?.id)
        : null,
    [activeCashRegisterId, activeStoreId, currentUser?.id]
  );
  const currentCashSessionRef = useRef(null);

  useEffect(() => {
    currentCashSessionRef.current = currentCashSession;
  }, [currentCashSession]);

  useEffect(() => {
    setPriceInputs((current) => {
      const next = {};

      items.forEach((item) => {
        next[item.id] =
          current[item.id] !== undefined ? current[item.id] : String(item.price ?? "");
      });

      return next;
    });
  }, [items]);
  const filteredCustomers = customers.filter((customer) => {
    const query = customerSearchTerm.trim().toLowerCase();

    if (!query) {
      return true;
    }

    return (
      String(customer.customerNumber).includes(query) ||
      String(customer.name || "")
        .toLowerCase()
        .includes(query) ||
      String(customer.phone || "")
        .toLowerCase()
        .includes(query)
    );
  });
  const selectableCustomers = filteredCustomers.length
    ? filteredCustomers
    : [selectedCustomer];

  const setCachedCurrentCashSession = useCallback(
    (nextValueOrUpdater) => {
      setCurrentCashSession((currentValue) => {
        const nextValue =
          typeof nextValueOrUpdater === "function"
            ? nextValueOrUpdater(currentValue)
            : nextValueOrUpdater;

        currentCashSessionRef.current = nextValue;

        if (currentCashSessionCacheKey) {
          if (nextValue) {
            writeCache(currentCashSessionCacheKey, nextValue);
          } else {
            invalidateCache(currentCashSessionCacheKey);
          }
        }

        return nextValue;
      });
    },
    [currentCashSessionCacheKey]
  );

  const refreshOfflineArchiveSales = useCallback(async () => {
    if (!activeStoreId || !activeCashRegisterId) {
      setOfflineArchiveSales([]);
      return;
    }

    try {
      const offlineSales = await getOfflineSales();
      const todayKey = getLocalDateKey(new Date());
      const filteredOfflineSales = offlineSales
        .filter((sale) => ["pending", "failed", "syncing"].includes(sale.syncStatus))
        .filter((sale) => getLocalDateKey(sale.createdAt) === todayKey)
        .filter((sale) => Number(sale.storeId || 0) === Number(activeStoreId || 0))
        .filter(
          (sale) =>
            Number(sale.caisseId || sale.cashRegisterId || 0) ===
            Number(activeCashRegisterId || 0)
        )
        .filter((sale) => Number(sale.userId || 0) === Number(currentUser?.id || 0))
        .map(mapOfflineSaleToArchiveSale);

      setOfflineArchiveSales(filteredOfflineSales);
    } catch (error) {
      setOfflineArchiveSales([]);
    }
  }, [activeCashRegisterId, activeStoreId, currentUser?.id]);

  const appendSaleToCurrentCashSession = useCallback(
    (saleRecord, sessionMeta = {}) => {
      setCachedCurrentCashSession((currentValue) =>
        buildCashSessionWithSale(currentValue, saleRecord, {
          id: sessionMeta.id || currentValue?.id || null,
          sessionNumber: sessionMeta.sessionNumber || currentValue?.sessionNumber || null,
          status: sessionMeta.status || currentValue?.status || "OUVERTE",
        })
      );
    },
    [setCachedCurrentCashSession]
  );

  const appendOfflineArchiveSale = useCallback((saleRecord) => {
    setOfflineArchiveSales((currentValue) => mergeArchiveSale(currentValue, saleRecord));
  }, []);

  const archiveSales = useMemo(
    () =>
      [...(currentCashSession?.sales || []), ...offlineArchiveSales].sort(
        (left, right) =>
          new Date(right.date || right.createdAt || 0).getTime() -
          new Date(left.date || left.createdAt || 0).getTime()
      ),
    [currentCashSession, offlineArchiveSales]
  );

  const archiveSummary = useMemo(
    () => ({
      totalSales: archiveSales.reduce(
        (totalValue, sale) => totalValue + Number(sale.total || 0),
        0
      ),
      ticketsCount: archiveSales.length,
    }),
    [archiveSales]
  );
  useEffect(() => {
    cleanupLegacyStoreCache();
  }, []);

  useEffect(() => {
    const handleOnline = () => {
      console.log("BACK ONLINE");
      setIsOnline(true);
    };

    const handleOffline = () => {
      console.log("GO OFFLINE");
      setIsOnline(false);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function fetchProducts() {
      const cachedProducts = readCache(PRODUCTS_CACHE_KEY, CACHE_TTL_MS);

      if (cachedProducts && isMounted) {
        setProducts(Array.isArray(cachedProducts.data) ? cachedProducts.data : []);
      }

      try {
        setIsLoadingProducts(!cachedProducts);
        const response = await api.get("/products", POS_PRODUCTS_QUERY);
        const list = Array.isArray(response.data)
          ? response.data
          : response.data?.data || [];

        if (isMounted) {
          setProducts(list);
          writeCache(PRODUCTS_CACHE_KEY, list);
        }
      } catch (error) {
        if (isMounted) {
          const cachedFallback = cachedProducts?.data || [];

          if (cachedFallback.length) {
            setProducts(cachedFallback);
          }

          setNotice({
            type: "warning",
            message: cachedFallback.length
              ? "Connexion indisponible. Produits charges depuis le cache local."
              : error.response?.data?.message ||
                "Impossible de charger la liste rapide des produits.",
          });
        }
      } finally {
        if (isMounted) {
          setIsLoadingProducts(false);
        }
      }
    }

    fetchProducts();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    const applyStores = (list) => {
      const nextStores = Array.isArray(list) ? list : [];

      setStores(nextStores);
      setSelectedStoreId((currentValue) => {
        if (!isAdmin) {
          return currentValue;
        }

        return nextStores.some((store) => store.id === currentValue)
          ? currentValue
          : nextStores[0]?.id || null;
      });
    };

    async function fetchStores() {
      cleanupLegacyStoreCache();

      if (!isAdmin) {
        const currentStore =
          currentUser?.storeId && currentUser?.storeName
            ? [
                {
                  id: Number(currentUser.storeId),
                  name: currentUser.storeName,
                },
              ]
            : [];

        if (isMounted) {
          applyStores(currentStore);
        }

        return;
      }

      const { hasCachedData, refreshPromise } = hydrateCachedResource({
        resource: cacheResources.stores(),
        onCachedData: (cachedStores) => {
          if (!isMounted) {
            return;
          }

          applyStores(cachedStores);
        },
        onFreshData: (freshStores) => {
          if (!isMounted) {
            return;
          }

          applyStores(freshStores);
        },
        onError: (error, cachedEntry) => {
          if (!isMounted || cachedEntry) {
            return;
          }

          setStores([]);
          setCashRegisters([]);
          setSelectedStoreId(null);
          setSelectedCashRegisterId(null);
          setNotice({
            type: "warning",
            message:
              error.response?.data?.message ||
              "Impossible de charger les points de vente.",
          });
        },
      });

      try {
        await refreshPromise;
      } catch (error) {
        if (!hasCachedData) {
          return;
        }
      }
    }

    fetchStores();

    return () => {
      isMounted = false;
    };
  }, [currentUser?.storeId, currentUser?.storeName, isAdmin]);

  useEffect(() => {
    if (!isAdmin) {
      return undefined;
    }

    if (!selectedStoreId) {
      setCashRegisters([]);
      setSelectedCashRegisterId(null);
      return undefined;
    }

    let isMounted = true;

    async function fetchCashRegisters() {
      const cashRegistersCacheKey = CACHE_KEYS.cashRegisters(selectedStoreId);
      const cashRegistersCache = readCache(cashRegistersCacheKey, CACHE_TTL_MS);

      if (cashRegistersCache && isMounted) {
        const cachedCashRegisters = Array.isArray(cashRegistersCache.data)
          ? cashRegistersCache.data
          : [];
        setCashRegisters(cachedCashRegisters);
        setSelectedCashRegisterId((currentValue) =>
          cachedCashRegisters.some((cashRegister) => cashRegister.id === currentValue)
            ? currentValue
            : cachedCashRegisters[0]?.id || null
        );
      }

      try {
        const response = await api.get("/cash-registers", {
          params: { storeId: selectedStoreId },
        });
        const list = Array.isArray(response.data)
          ? response.data
          : response.data?.data || [];

        if (isMounted) {
          setCashRegisters(list);
          writeCache(cashRegistersCacheKey, list);
          setSelectedCashRegisterId((currentValue) =>
            list.some((cashRegister) => cashRegister.id === currentValue)
              ? currentValue
              : list[0]?.id || null
          );
        }
      } catch (error) {
        if (isMounted && !cashRegistersCache) {
          setCashRegisters([]);
          setSelectedCashRegisterId(null);
          setNotice({
            type: "warning",
            message:
              error.response?.data?.message ||
              "Impossible de charger les caisses pour ce point de vente.",
          });
        }
      }
    }

    fetchCashRegisters();

    return () => {
      isMounted = false;
    };
  }, [isAdmin, selectedStoreId]);

  const fetchCustomers = async (customerIdToSelect = null) => {
    const response = await api.getCustomers();
    const list = getCollection(response.data, ["data", "customers"]);

    setCustomers(list);
    writeCache(CUSTOMERS_CACHE_KEY, list);

    const preferredCustomer =
      list.find((customer) => customer.id === customerIdToSelect) ||
      list.find((customer) => customer.id === selectedCustomerId) ||
      list.find((customer) => customer.customerNumber === 1) ||
      list[0] ||
      DEFAULT_CUSTOMER;

    setSelectedCustomerId(preferredCustomer.id);
    setSelectedCustomerDetails(preferredCustomer);

    return list;
  };

  useEffect(() => {
    let isMounted = true;

    async function loadCustomers() {
      const customersCache = readCache(CUSTOMERS_CACHE_KEY, CACHE_TTL_MS);

      if (customersCache && isMounted) {
        const cachedCustomers = Array.isArray(customersCache.data)
          ? customersCache.data
          : [];
        const preferredCachedCustomer =
          cachedCustomers.find((customer) => customer.customerNumber === 1) ||
          cachedCustomers[0] ||
          DEFAULT_CUSTOMER;

        setCustomers(cachedCustomers.length ? cachedCustomers : [DEFAULT_CUSTOMER]);
        setSelectedCustomerId(preferredCachedCustomer.id);
        setSelectedCustomerDetails(preferredCachedCustomer);
      }

      try {
        setIsLoadingCustomers(!customersCache);
        setCustomerNotice({ type: "", message: "" });
        const response = await api.getCustomers();
        const list = getCollection(response.data, ["data", "customers"]);

        if (!isMounted) {
          return;
        }

        setCustomers(list);
        writeCache(CUSTOMERS_CACHE_KEY, list);

        const preferredCustomer =
          list.find((customer) => customer.customerNumber === 1) ||
          list[0] ||
          DEFAULT_CUSTOMER;

        setSelectedCustomerId(preferredCustomer.id);
        setSelectedCustomerDetails(preferredCustomer);
      } catch (error) {
        if (isMounted && !customersCache) {
          setCustomers([DEFAULT_CUSTOMER]);
          setSelectedCustomerId(DEFAULT_CUSTOMER.id);
          setSelectedCustomerDetails(DEFAULT_CUSTOMER);
          setCustomerNotice({
            type: "warning",
            message:
              error.response?.data?.message ||
              "Impossible de charger les clients. Client inconnu reste selectionne par defaut.",
          });
        }
      } finally {
        if (isMounted) {
          setIsLoadingCustomers(false);
        }
      }
    }

    loadCustomers();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedCustomerId) {
      return undefined;
    }

    let isMounted = true;

    async function loadCustomerCredit() {
      try {
        setIsLoadingCustomerCredit(true);
        const response = await api.get(`/customers/${selectedCustomerId}/credit`);

        if (isMounted) {
          setSelectedCustomerDetails((current) => ({
            ...(customers.find((customer) => customer.id === selectedCustomerId) ||
              current ||
              DEFAULT_CUSTOMER),
            customerNumber: response.data?.customerNumber ?? current.customerNumber,
            name: response.data?.name ?? current.name,
            credit: response.data?.credit ?? 0,
          }));
        }
      } catch (error) {
        if (isMounted) {
          setSelectedCustomerDetails((current) =>
            customers.find((customer) => customer.id === selectedCustomerId) ||
            current ||
            DEFAULT_CUSTOMER
          );
        }
      } finally {
        if (isMounted) {
          setIsLoadingCustomerCredit(false);
        }
      }
    }

    loadCustomerCredit();

    return () => {
      isMounted = false;
    };
  }, [customers, selectedCustomerId]);

  useEffect(() => {
    let isMounted = true;

    if (!activeStoreId || !activeCashRegisterId) {
      setCachedCurrentCashSession(null);
      setOfflineArchiveSales([]);
      setIsLoadingCashSession(false);
      return () => {
        isMounted = false;
      };
    }

    const currentCashSessionResource = cacheResources.currentCashSession({
      storeId: activeStoreId,
      cashRegisterId: activeCashRegisterId,
      userId: currentUser?.id,
      view: "pos",
    });

    setIsLoadingCashSession(true);
    void refreshOfflineArchiveSales();

    async function loadCurrentCashSession() {
      const { hasCachedData, refreshPromise } = hydrateCachedResource({
        resource: currentCashSessionResource,
        onCachedData: (cachedSession) => {
          if (!isMounted) {
            return;
          }

          currentCashSessionRef.current = cachedSession || null;
          setCurrentCashSession(cachedSession || null);
          setIsLoadingCashSession(false);
        },
        onFreshData: (freshSession) => {
          if (!isMounted) {
            return;
          }

          setCachedCurrentCashSession(freshSession || null);
        },
        onError: (error, cachedEntry) => {
          if (!isMounted || cachedEntry) {
            return;
          }

          setCachedCurrentCashSession(null);
        },
      });

      if (!hasCachedData && isMounted) {
        setIsLoadingCashSession(true);
      }

      try {
        await refreshPromise;
      } finally {
        if (isMounted) {
          setIsLoadingCashSession(false);
        }
      }
    }

    loadCurrentCashSession();

    return () => {
      isMounted = false;
    };
  }, [
    activeCashRegisterId,
    activeStoreId,
    currentCashSessionCacheKey,
    currentUser?.id,
    refreshOfflineArchiveSales,
    setCachedCurrentCashSession,
  ]);

  const refreshProducts = async () => {
    try {
      const response = await api.get("/products", POS_PRODUCTS_QUERY);
      const list = Array.isArray(response.data)
        ? response.data
        : response.data?.data || [];

      setProducts(list);
      writeCache(PRODUCTS_CACHE_KEY, list);
    } catch (error) {
      // Keep the cashier flow stable even if the background refresh fails.
    }
  };

  const getCachedProducts = () => {
    return readCache(PRODUCTS_CACHE_KEY, CACHE_TTL_MS)?.data || [];
  };

  const applyProductStockDelta = useCallback((saleItems, direction) => {
    const stockDeltaByEntry = new Map();

    saleItems.forEach((item) => {
      const itemKey = buildCartItemId(item.productId, item.variantId || null);
      stockDeltaByEntry.set(
        itemKey,
        (stockDeltaByEntry.get(itemKey) || 0) + Number(item.quantity || 0) * direction
      );
    });

    if (!stockDeltaByEntry.size) {
      return;
    }

    setProducts((currentProducts) => {
      const nextProducts = currentProducts.map((product) => {
        let productDelta = stockDeltaByEntry.get(buildCartItemId(product.id, null)) || 0;
        let hasChanges = productDelta !== 0;

        const nextVariants = (product.variants || []).map((variant) => {
          const variantDelta =
            stockDeltaByEntry.get(buildCartItemId(product.id, variant.id)) || 0;

          if (!variantDelta) {
            return variant;
          }

          hasChanges = true;
          productDelta += variantDelta;

          return {
            ...variant,
            stock: Math.max(
              0,
              roundPosQuantity(Number(variant.stock ?? 0) + variantDelta)
            ),
          };
        });

        if (!hasChanges) {
          return product;
        }

        return {
          ...product,
          variants: nextVariants,
          stock: Math.max(0, roundPosQuantity(Number(product.stock ?? 0) + productDelta)),
        };
      });

      writeCache(PRODUCTS_CACHE_KEY, nextProducts);
      return nextProducts;
    });
  }, []);

  const generateLocalSaleId = () => {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }

    return `local-sale-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
  };

  const buildSalePayload = (paymentConfig) => {
    const paymentMethod =
      typeof paymentConfig === "string"
        ? paymentConfig
        : paymentConfig?.paymentMethod || "cash";
    const paidAmount =
      typeof paymentConfig === "object" && paymentConfig?.paidAmount !== undefined
        ? Number(paymentConfig.paidAmount)
        : undefined;
    const remainingAmount =
      typeof paymentConfig === "object" && paymentConfig?.remainingAmount !== undefined
        ? Number(paymentConfig.remainingAmount)
        : undefined;

    return {
      storeId: activeStoreId,
      cashRegisterId: activeCashRegisterId,
      userId: currentUser?.id,
      customerId: selectedCustomer?.id || DEFAULT_CUSTOMER.id,
      paymentMethod,
      ...(paymentMethod === "partial"
        ? {
            paidAmount,
            remainingAmount,
          }
        : {}),
      items: items.map((item) => ({
        productId: item.productId,
        variantId: item.variantId,
        quantity: Number(item.quantity || 0),
        unitPrice: Number(item.price || 0),
        subtotal: roundMoneyValue(Number(item.quantity || 0) * Number(item.price || 0)),
      })),
      total: roundMoneyValue(totalAmount),
    };
  };

  const buildOfflineSalePayload = (paymentConfig, userId) => {
    const paymentMethod =
      typeof paymentConfig === "string"
        ? paymentConfig
        : paymentConfig?.paymentMethod || "cash";
    const paidAmount =
      typeof paymentConfig === "object" && paymentConfig?.paidAmount !== undefined
        ? Number(paymentConfig.paidAmount)
        : paymentMethod === "credit"
          ? 0
          : totalAmount;
    const remainingAmount =
      typeof paymentConfig === "object" && paymentConfig?.remainingAmount !== undefined
        ? Number(paymentConfig.remainingAmount)
        : paymentMethod === "credit"
          ? totalAmount
          : 0;
    const paymentStatus =
      paymentMethod === "partial"
        ? "PARTIALLY_PAID"
        : paymentMethod === "credit"
          ? "CREDIT"
          : "PAID";
    const hasKnownCustomer =
      Number(selectedCustomer?.customerNumber || 1) !== 1 &&
      Number(selectedCustomer?.id || 0) > 0;

    return {
      localId: generateLocalSaleId(),
      storeId: activeStoreId,
      caisseId: activeCashRegisterId,
      userId,
      ...(hasKnownCustomer
        ? {
            clientId: selectedCustomer.id,
          }
        : {}),
      items: items.map((item) => ({
        productId: item.productId,
        variantId: item.variantId,
        productName: item.name,
        variantLabel: item.variantLabel || null,
        quantity: Number(item.quantity || 0),
        unitPrice: Number(item.price || 0),
        subtotal: roundMoneyValue(
          Number(item.quantity || 0) * Number(item.price || 0)
        ),
      })),
      total: roundMoneyValue(totalAmount),
      paymentMethod,
      paidAmount,
      remainingAmount,
      paymentStatus,
      createdAt: new Date().toISOString(),
      syncStatus: "pending",
    };
  };

  const closeVariantSelection = () => {
    setVariantSelection({
      isOpen: false,
      product: null,
      variants: [],
    });
  };

  const buildVariantCartItem = (product, variant, options = {}) => {
    const variantLabel = variant?.label || null;
    const salePrice = variant?.salePrice ?? product.salePrice ?? product.price ?? 0;

    return {
      id: buildCartItemId(product.id, variant?.id || null),
      productId: product.id,
      variantId: variant?.id || null,
      name: product.name,
      displayName: getProductDisplayName(product.name, variantLabel),
      variantLabel,
      variantSize: variant?.size || variant?.taille || null,
      variantColor: variant?.color || variant?.couleur || null,
      barcode: variant?.barcode || product.barcode || "",
      price: salePrice,
      salePrice,
      stock:
        options.isOffline === true
          ? Number.POSITIVE_INFINITY
          : Number(variant?.stock ?? product.stock ?? 0),
      storeName: activeStoreName || product.storeName || null,
      active: product.active,
    };
  };

  const addProductWithStockCheck = (product, variant, options = {}) => {
    const cartItem = buildVariantCartItem(product, variant, options);
    const existingItem = items.find((item) => item.id === cartItem.id);
    const currentQuantity = existingItem?.quantity || 0;
    const availableStock = cartItem.stock ?? existingItem?.stock ?? 0;
    const initialQuantity = 1;

    if (!product?.active) {
      setNotice({
        type: "warning",
        message: `${product?.name || "Ce produit"} est inactif et ne peut pas etre ajoute.`,
      });
      return false;
    }

    if (!refundMode && availableStock <= 0) {
      setNotice({
        type: "error",
        message: `${cartItem.displayName} n'est plus disponible en stock.`,
      });
      return false;
    }

    if (!refundMode && !existingItem && initialQuantity > availableStock) {
      setNotice({
        type: "warning",
        message: `Stock insuffisant pour ${cartItem.displayName}. Stock disponible: ${availableStock}.`,
      });
      return false;
    }

    if (!refundMode && currentQuantity >= availableStock) {
      setNotice({
        type: "warning",
        message: `Stock insuffisant pour ${cartItem.displayName}. Stock disponible: ${availableStock}.`,
      });
      return false;
    }

    addItem(cartItem);

    if (!existingItem) {
      updateQuantity(cartItem.id, initialQuantity);
    }

    setNotice({
      type: "success",
      message: refundMode
        ? `${cartItem.displayName} ajoute au panier remboursement${
            options.isOffline ? " depuis le cache hors ligne" : ""
          }.`
        : `${cartItem.displayName} ajoute au panier${
            options.isOffline ? " depuis le cache hors ligne" : ""
          }.`,
    });
    return true;
  };

  const openVariantSelection = (product, variants) => {
    setVariantSelection({
      isOpen: true,
      product,
      variants,
    });
  };

  const addProductEntryToCart = (product, options = {}) => {
    const activeVariants = getActiveVariants(product);
    const selectedVariant = product.selectedVariant || null;

    if (selectedVariant) {
      return addProductWithStockCheck(product, selectedVariant, options);
    }

    if (activeVariants.length > 1) {
      openVariantSelection(product, activeVariants);
      return false;
    }

    return addProductWithStockCheck(product, activeVariants[0] || null, options);
  };

  const addOfflineProductToCart = (product) =>
    addProductEntryToCart(product, { isOffline: true });

  const ensureStoreSelected = () => {
    if (activeStoreId) {
      return true;
    }

    setNotice({
      type: "warning",
      message: "Le magasin SportZone n'est pas encore disponible.",
    });
    return false;
  };

  const handleAddByBarcode = async (event) => {
    event.preventDefault();
    const trimmedBarcode = barcode.trim();

    if (!trimmedBarcode) {
      setNotice({
        type: "error",
        message: "Veuillez entrer ou scanner un code-barres.",
      });
      return;
    }

    if (!ensureStoreSelected()) {
      return;
    }

    if (!isOnline) {
      const cachedProducts = getCachedProducts();

      if (!cachedProducts.length) {
        setNotice({
          type: "warning",
          message:
            "Aucun produit disponible hors ligne. Rechargez l'application en ligne une fois.",
        });
        return;
      }

      const product = cachedProducts.find(
        (item) =>
          String(item.barcode || "").trim() === trimmedBarcode ||
          (item.variants || []).some(
            (variant) => String(variant.barcode || "").trim() === trimmedBarcode
          )
      );

      if (!product) {
        setNotice({
          type: "error",
          message: "Produit non disponible hors ligne.",
        });
        return;
      }

      const matchedVariant =
        (product.variants || []).find(
          (variant) => String(variant.barcode || "").trim() === trimmedBarcode
        ) || null;
      const added = matchedVariant
        ? addProductWithStockCheck(product, matchedVariant, { isOffline: true })
        : addOfflineProductToCart(product);

      if (added) {
        setBarcode("");
      }

      return;
    }

    try {
      setIsSearchingBarcode(true);

      const response = await api.get(
        `/products/barcode/${encodeURIComponent(trimmedBarcode)}`,
        {
          params: {
            storeId: activeStoreId,
          },
        }
      );
      const product = {
        ...response.data,
        price: response.data.salePrice,
      };
      const added = addProductEntryToCart(product);

      if (added) {
        setBarcode("");
      }
    } catch (error) {
      setNotice({
        type: "error",
        message:
          error.response?.status === 404
            ? "Produit introuvable. Verifiez le code-barres puis reessayez."
            : error.response?.data?.message ||
              "Erreur lors de la recherche du produit.",
      });
    } finally {
      setIsSearchingBarcode(false);
    }
  };

  const handleOpenPayment = () => {
    if (!items.length) {
      setNotice({
        type: "warning",
        message: "Ajoutez au moins un produit avant de valider le paiement.",
      });
      return;
    }

    if (!activeStoreId || !activeCashRegisterId) {
      setNotice({
        type: "warning",
        message: "Le magasin SportZone ou la caisse 1 ne sont pas encore disponibles.",
      });
      return;
    }

    setIsPaymentOpen(true);
  };

  const handleQuickAdd = async (product) => {
    if (!ensureStoreSelected()) {
      return;
    }

    const availableProducts = products.length ? products : getCachedProducts();

    if (!availableProducts.length) {
      setNotice({
        type: "warning",
        message:
          "Aucun produit disponible localement pour l'ajout rapide. Rechargez la page.",
      });
      return;
    }

    const matchedProduct =
      availableProducts.find((item) => item.id === product.id) ||
      availableProducts.find(
        (item) => String(item.barcode || "") === String(product.barcode || "")
      );

    if (!matchedProduct) {
      setNotice({
        type: "error",
        message: "Produit non disponible localement.",
      });
      return;
    }

    if (!isOnline) {
      addOfflineProductToCart(matchedProduct);
      return;
    }

    addProductEntryToCart(matchedProduct);
  };

  const handleUpdateCartQuantity = (item, rawValue) => {
    if (rawValue === "") {
      updateQuantity(item.id, 0);
      return;
    }

    const parsedQuantity = roundPosQuantity(parseFloat(rawValue));

    if (!Number.isFinite(parsedQuantity) || parsedQuantity < 0) {
      setNotice({
        type: "warning",
        message: "La quantite doit etre un nombre valide superieur ou egal a 0.",
      });
      return;
    }

    if (!refundMode) {
      const availableStock = Number(item.stock ?? 0);

      if (parsedQuantity > availableStock) {
        setNotice({
          type: "warning",
          message: `Stock insuffisant pour ${item.displayName || item.name}. Stock disponible: ${availableStock}.`,
        });
        return;
      }
    }

    updateQuantity(item.id, parsedQuantity);
    setNotice({ type: "", message: "" });
  };

  const handlePriceInputChange = (item, rawValue) => {
    setPriceInputs((current) => ({
      ...current,
      [item.id]: rawValue,
    }));

    if (rawValue === "") {
      return;
    }

    const parsedPrice = Number(rawValue);

    if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
      return;
    }

    updatePrice(item.id, roundMoneyValue(parsedPrice));
    setNotice({ type: "", message: "" });
  };

  const handlePriceInputBlur = (item) => {
    const rawValue = priceInputs[item.id];
    const parsedPrice = Number(rawValue);

    if (rawValue === "" || !Number.isFinite(parsedPrice) || parsedPrice <= 0) {
      setPriceInputs((current) => ({
        ...current,
        [item.id]: String(item.price ?? ""),
      }));
      setNotice({
        type: "error",
        message: `Le prix de ${item.displayName || item.name} doit etre superieur a 0.`,
      });
      return;
    }

    const normalizedPrice = roundMoneyValue(parsedPrice);
    updatePrice(item.id, normalizedPrice);
    setPriceInputs((current) => ({
      ...current,
      [item.id]: String(normalizedPrice),
    }));
  };

  const handleClearCart = () => {
    clearCart();
    setNotice({
      type: "info",
      message: refundMode
        ? "Panier remboursement vide."
        : "Panier vide. Pret pour une nouvelle vente.",
    });
  };

  const handleCloseCashSession = async () => {
    if (!currentCashSession?.id) {
      setNotice({
        type: "warning",
        message:
          "Aucune session ouverte a cloturer pour cette caisse.",
      });
      return;
    }

    try {
      setIsClosingCashSession(true);
      const response = await api.closeCurrentCashSession({
        params: {
          storeId: activeStoreId,
          cashRegisterId: activeCashRegisterId,
        },
      });
      setCachedCurrentCashSession(response.data?.data?.currentSession || null);
      setSelectedArchivedSale(null);
      setNotice({
        type: "success",
        message: "Journee cloturee. Une nouvelle session vide est maintenant ouverte.",
      });
      void refreshOfflineArchiveSales();
    } catch (error) {
      setNotice({
        type: "error",
        message:
          error.response?.data?.message ||
          "Impossible de cloturer la journee pour le moment.",
      });
    } finally {
      setIsClosingCashSession(false);
    }
  };

  const handleConfirmPayment = async (paymentConfig) => {
    const method =
      typeof paymentConfig === "string"
        ? paymentConfig
        : paymentConfig?.paymentMethod || "cash";
    const userId = currentUser?.id;

    if (!userId) {
      setIsPaymentOpen(false);
      setNotice({
        type: "error",
        message:
          "Utilisateur introuvable. Reconnectez-vous avant de valider la vente.",
      });
      return false;
    }

    if (method === "credit" && (selectedCustomer?.customerNumber || 1) === 1) {
      setNotice({
        type: "error",
        message: 'Le paiement a credit n\'est pas autorise pour "Client inconnu".',
      });
      return false;
    }

    if (!activeStoreId || !activeCashRegisterId) {
      setNotice({
        type: "error",
        message:
          !activeStoreId
            ? "Champ manquant: storeId"
            : "Champ manquant: caisseId",
      });
      return false;
    }

    if (!items.length) {
      setNotice({
        type: "error",
        message: "Champ manquant: items",
      });
      return false;
    }

    const salePayload = buildSalePayload(paymentConfig);
    const cartSnapshot = items.map((item) => ({ ...item }));

    try {
      setIsSubmittingSale(true);
      console.log("TRY ONLINE SALE");
      const response = await api.post("/sales", salePayload);
      const saleResponse = response.data?.data || response.data?.sale || response.data || {};
      const ticketNumber =
        saleResponse.ticketNumber || response.data?.ticketNumber || null;
      const archiveSale = buildArchiveSaleRecord({
        saleId: saleResponse.id || ticketNumber || `sale-${Date.now()}`,
        ticketNumber: ticketNumber || `VENTE-${Date.now()}`,
        createdAt: saleResponse.createdAt || new Date().toISOString(),
        total: saleResponse.total ?? salePayload.total,
        paymentMethod: saleResponse.paymentMethod || method,
        paidAmount:
          saleResponse.paidAmount ??
          (method === "credit" ? 0 : salePayload.paidAmount ?? salePayload.total),
        remainingAmount: saleResponse.remainingAmount ?? salePayload.remainingAmount ?? 0,
        paymentStatus:
          saleResponse.paymentStatus ||
          (method === "partial"
            ? "PARTIALLY_PAID"
            : method === "credit"
              ? "CREDIT"
              : "PAID"),
        status: saleResponse.status || "completed",
        cashRegisterName: activeCashRegisterName,
        cashierName: currentUser?.name || null,
        saleItems: cartSnapshot,
      });

      appendSaleToCurrentCashSession(archiveSale, {
        id: saleResponse.sessionId || currentCashSessionRef.current?.id || null,
        sessionNumber:
          saleResponse.sessionNumber || currentCashSessionRef.current?.sessionNumber || null,
        status: saleResponse.sessionStatus || currentCashSessionRef.current?.status || "OUVERTE",
      });
      applyProductStockDelta(cartSnapshot, -1);
      clearCart();
      setIsPaymentOpen(false);
      setNotice({
        type: "success",
        message: ticketNumber
          ? `Paiement confirme. Ticket ${ticketNumber} genere avec succes.`
          : "Paiement confirme avec succes.",
      });
      invalidateDomainCaches(
        "products:",
        "sales:",
        "sales-sessions:",
        "stock:",
        "stock-alerts",
        "analytics:",
        "stores"
      );
      window.dispatchEvent(new CustomEvent("sportzone:sales-updated"));
      void refreshProducts();
      return true;
    } catch (error) {
      console.error("Sale API rejected, switching to offline fallback", {
        message:
          error.response?.data?.message ||
          error.response?.data?.error ||
          error.message,
        status: error.response?.status || null,
        details: error.response?.data || null,
        payload: salePayload,
      });

      const offlineSale = buildOfflineSalePayload(paymentConfig, userId);

      try {
        console.log("OFFLINE FALLBACK");
        await savePendingSale(offlineSale);
        appendOfflineArchiveSale(mapOfflineSaleToArchiveSale(offlineSale));
        clearCart();
        setIsPaymentOpen(false);
        setNotice({
          type: "success",
          message: "Vente enregistree hors ligne.",
        });
        window.dispatchEvent(new CustomEvent("sportzone:sales-updated"));
        return true;
      } catch (offlineError) {
        const backendMessage =
          error.response?.data?.message ||
          error.response?.data?.error ||
          (typeof error.response?.data?.details === "string"
            ? error.response.data.details
            : "");

        setNotice({
          type: "error",
          message:
            backendMessage ||
            offlineError.message ||
            "Impossible de finaliser la vente. Veuillez reessayer.",
        });
        return false;
      }
    } finally {
      setIsSubmittingSale(false);
    }
  };

  const handleCustomerSelection = (value) => {
    const nextCustomerId = Number(value) || DEFAULT_CUSTOMER.id;
    const nextCustomer =
      customers.find((customer) => customer.id === nextCustomerId) ||
      DEFAULT_CUSTOMER;

    setCustomerNotice({ type: "", message: "" });
    setSelectedCustomerId(nextCustomer.id);
    setSelectedCustomerDetails(nextCustomer);
  };

  const handleEnableRefundMode = () => {
    navigate("/sales", {
      state: {
        refundMode: true,
        source: "pos",
      },
    });
  };

  const handleCancelRefundMode = () => {
    if (isSubmittingRefund) {
      return;
    }

    clearCart();
    setRefundMode(false);
    setRefundReason("");
    setRefundPaymentMethod("cash");
    setNotice({
      type: "info",
      message: "Mode remboursement annule.",
    });
  };

  const handleSubmitRefund = async () => {
    const userId = currentUser?.id;
    const refundItemsSnapshot = items.map((item) => ({ ...item }));

    if (!refundMode) {
      return;
    }

    if (!userId) {
      setNotice({
        type: "error",
        message:
          "Utilisateur introuvable. Reconnectez-vous avant de valider le remboursement.",
      });
      return;
    }

    if (!activeStoreId || !activeCashRegisterId) {
      setNotice({
        type: "error",
        message:
          "Le magasin SportZone ou la caisse 1 ne sont pas encore disponibles.",
      });
      return;
    }

    if (!items.length) {
      setNotice({
        type: "warning",
        message: "Ajoutez au moins un produit avant de valider le remboursement.",
      });
      return;
    }

    const payload = {
      customerId: selectedCustomer?.id || DEFAULT_CUSTOMER.id,
      paymentMethod: refundPaymentMethod,
      reason: refundReason.trim() || "Remboursement client",
      items: items.map((item) => ({
        productId: item.productId,
        variantId: item.variantId,
        quantity: item.quantity,
        unitPrice: Number(item.price || 0),
      })),
    };

    try {
      setIsSubmittingRefund(true);

      const response = await api.createRefund(payload);
      const refundResponse =
        response.data?.refundSale || response.data?.sale || response.data?.data || response.data;
      const refundNumber =
        refundResponse?.ticketNumber ||
        response.data?.refund?.numero ||
        response.data?.refunds?.[0]?.numero ||
        null;
      const refundTotal = -Math.abs(totalAmount);
      const archiveSale = buildArchiveSaleRecord({
        saleId: refundResponse?.id || refundNumber || `refund-${Date.now()}`,
        ticketNumber: refundNumber || `AVOIR-${Date.now()}`,
        createdAt: refundResponse?.createdAt || new Date().toISOString(),
        total: refundResponse?.total ?? refundTotal,
        paymentMethod: refundResponse?.paymentMethod || refundPaymentMethod,
        paidAmount: 0,
        remainingAmount: 0,
        paymentStatus: refundResponse?.paymentStatus || "PAID",
        status: "refunded",
        cashRegisterName: activeCashRegisterName,
        cashierName: currentUser?.name || null,
        saleItems: refundItemsSnapshot,
      });

      appendSaleToCurrentCashSession(archiveSale, {
        id: refundResponse?.sessionId || currentCashSessionRef.current?.id || null,
        sessionNumber:
          refundResponse?.sessionNumber || currentCashSessionRef.current?.sessionNumber || null,
        status: refundResponse?.sessionStatus || currentCashSessionRef.current?.status || "OUVERTE",
      });
      applyProductStockDelta(refundItemsSnapshot, 1);
      clearCart();
      setRefundMode(false);
      setRefundReason("");
      setRefundPaymentMethod("cash");
      setNotice({
        type: "success",
        message: refundNumber
          ? `Remboursement ${refundNumber} valide avec succes.`
          : "Remboursement valide avec succes.",
      });
      invalidateDomainCaches(
        "products:",
        "sales:",
        "sales-sessions:",
        "stock:",
        "stock-alerts",
        "analytics:",
        "stores"
      );
      window.dispatchEvent(new CustomEvent("sportzone:sales-updated"));
      void refreshProducts();
    } catch (error) {
      setNotice({
        type: "error",
        message:
          error.response?.data?.message ||
          "Impossible d'enregistrer ce remboursement pour le moment.",
      });
    } finally {
      setIsSubmittingRefund(false);
    }
  };

  const closeCustomerModal = () => {
    if (isSubmittingCustomer) {
      return;
    }

    setIsCustomerModalOpen(false);
    setCustomerModalError("");
    setNewCustomerForm({
      name: "",
      phone: "",
      email: "",
    });
  };

  const handleCreateCustomer = async (event) => {
    event.preventDefault();

    if (!newCustomerForm.name.trim()) {
      setCustomerModalError("Le nom client est obligatoire.");
      return;
    }

    try {
      setIsSubmittingCustomer(true);
      setCustomerModalError("");

      const response = await api.createCustomer({
        name: newCustomerForm.name.trim(),
        phone: newCustomerForm.phone.trim(),
        email: newCustomerForm.email.trim(),
      });
      const createdCustomer = response.data?.data || response.data;

      invalidateDomainCaches("customers");
      await fetchCustomers(createdCustomer?.id);
      setIsCustomerModalOpen(false);
      setCustomerModalError("");
      setNewCustomerForm({
        name: "",
        phone: "",
        email: "",
      });
      setCustomerNotice({
        type: "success",
        message: `Client ajoute avec succes. Numero client: #${
          createdCustomer?.customerNumber || "?"
        }.`,
      });
    } catch (error) {
      setCustomerModalError(
        error.response?.data?.message ||
          "Impossible d'ajouter ce client pour le moment."
      );
    } finally {
      setIsSubmittingCustomer(false);
    }
  };

  return (
    <div className="pos-page-shell">
      <div className="pos-page-heading">
        <h1 className="pos-page-title">POS / Caisse</h1>
        <span className={`app-badge ${isOnline ? "tone-success" : "tone-warning"}`}>
          {isOnline ? "En ligne" : "Hors ligne"}
        </span>
      </div>

      <div className="pos-layout">
        <SectionCard
          title="Scanner des produits"
          description="Saisir un code-barres ou utiliser les raccourcis d'ajout rapide."
        >
          <div className={`inline-notice ${notice.type}`}>{notice.message}</div>

          <form className="pos-toolbar" onSubmit={handleAddByBarcode}>
            <input
              className="text-input"
              type="text"
              placeholder="Entrer ou scanner un code-barres"
              value={barcode}
              onChange={(event) => setBarcode(event.target.value)}
            />
            <button
              className="primary-button"
              type="submit"
              disabled={isSearchingBarcode}
            >
              {isSearchingBarcode ? "Recherche..." : "Ajouter"}
            </button>
          </form>

          <div className="product-hint-list">
            {isLoadingProducts ? (
              <div className="empty-state">
                Chargement des produits rapides...
              </div>
            ) : (
              products.map((product) => (
                <div className="hint-card" key={product.id}>
                  <h3>{product.name}</h3>
                  <p>Code-barres: {product.barcode}</p>
                  <p>Prix: {formatCurrencyDh(product.salePrice || 0)}</p>
                  {getActiveVariants(product).length === 1 ? (
                    <p>Variante: {getActiveVariants(product)[0]?.label || "-"}</p>
                  ) : null}
                  <p>
                    Variantes actives: {getActiveVariants(product).length || 1}
                  </p>
                  <p className="muted-text">
                    {product.active ? "Actif" : "Inactif"}
                  </p>
                  <button
                    className="ghost-button small-button"
                    type="button"
                    onClick={() => handleQuickAdd(product)}
                    disabled={!product.active || isSearchingBarcode}
                  >
                    Ajout rapide
                  </button>
                </div>
              ))
            )}
          </div>
        </SectionCard>

        <SectionCard
          title="Panier courant"
          description={
            refundMode
              ? "Mode remboursement actif. Le panier fonctionne comme une vente classique, avec total negatif."
              : "Verifier les quantites, les prix et le total avant paiement."
          }
          actions={
            <button
              className="ghost-button"
              type="button"
              onClick={handleClearCart}
            >
              Vider panier
            </button>
          }
        >
          <div className="cart-headline">
            <span>Articles dans le panier</span>
            <strong>{totalItems}</strong>
          </div>

          {items.length ? (
            <div className="cart-list">
              {items.map((item) => (
                <div className="cart-item" key={item.id}>
                  <div className="cart-item-main">
                    <strong>{item.displayName || item.name}</strong>
                    {item.variantLabel ? (
                      <span>{item.variantLabel}</span>
                    ) : null}
                    <span>{item.storeName || activeStoreName || "Magasin courant"}</span>
                  </div>

                  <div className="cart-quantity-controls">
                    <button
                      className="quantity-button"
                      type="button"
                      onClick={() => decreaseQuantity(item.id)}
                    >
                      -
                    </button>
                    <input
                      className="text-input cart-quantity-input"
                      type="number"
                      min="0"
                      step="0.25"
                      value={item.quantity}
                      onChange={(event) =>
                        handleUpdateCartQuantity(item, event.target.value)
                      }
                    />
                    <button
                      className="quantity-button"
                      type="button"
                      onClick={() => {
                        const nextQuantity = roundPosQuantity(
                          Number(item.quantity || 0) + POS_QUANTITY_STEP
                        );

                        if (!refundMode && nextQuantity > Number(item.stock ?? 0)) {
                          setNotice({
                            type: "warning",
                            message: `Stock insuffisant pour ${
                              item.displayName || item.name
                            }. Stock disponible: ${item.stock ?? 0}.`,
                          });
                          return;
                        }

                        increaseQuantity(item.id);
                      }}
                    >
                      +
                    </button>
                  </div>

                  <div className="cart-price-block">
                    <label className="field-label" htmlFor={`cart-price-${item.id}`}>
                      Prix
                    </label>
                    <input
                      id={`cart-price-${item.id}`}
                      className="text-input cart-price-input"
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={priceInputs[item.id] ?? String(item.price ?? "")}
                      onChange={(event) =>
                        handlePriceInputChange(item, event.target.value)
                      }
                      onBlur={() => handlePriceInputBlur(item)}
                    />
                    <strong>
                      Sous-total: {formatCurrencyDh(
                        roundMoneyValue(Number(item.quantity || 0) * Number(item.price || 0))
                      )}
                    </strong>
                  </div>

                  <button
                    className="table-action-button danger"
                    type="button"
                    onClick={() => removeItem(item.id)}
                  >
                    Retirer
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              {refundMode
                ? "Le panier remboursement est vide. Scannez un article pour demarrer le retour."
                : "Le panier est vide. Scannez un article pour demarrer la vente."}
            </div>
          )}

          <div className="cart-summary">
            {refundMode ? (
              <div className="inline-notice warning">
                <Badge tone="danger">MODE REMBOURSEMENT</Badge>
                <span>Chaque article valide augmentera automatiquement le stock.</span>
              </div>
            ) : null}
            <div className="summary-row">
              <span>Produits</span>
              <strong>{items.length}</strong>
            </div>
            <div className="summary-row">
              <span>Unites</span>
              <strong>{totalItems}</strong>
            </div>
            <div className="summary-row grand-total">
              <span>Total</span>
              <span>{formatCurrencyDh(displayTotalAmount)}</span>
            </div>
            {refundMode ? (
              <>
                <div className="field-group">
                  <label className="field-label" htmlFor="refund-payment-method">
                    Mode de remboursement
                  </label>
                  <select
                    id="refund-payment-method"
                    className="text-input select-input"
                    value={refundPaymentMethod}
                    onChange={(event) => setRefundPaymentMethod(event.target.value)}
                    disabled={isSubmittingRefund}
                  >
                    <option value="cash">Especes</option>
                    <option value="card">Carte bancaire</option>
                  </select>
                </div>

                <div className="field-group">
                  <label className="field-label" htmlFor="refund-reason">
                    Motif du remboursement
                  </label>
                  <textarea
                    id="refund-reason"
                    className="text-input"
                    rows="3"
                    value={refundReason}
                    onChange={(event) => setRefundReason(event.target.value)}
                    placeholder="Remboursement client"
                    disabled={isSubmittingRefund}
                  />
                </div>
              </>
            ) : null}
            <div className="action-row">
              {refundMode ? (
                <>
                  <button
                    className="ghost-button"
                    type="button"
                    onClick={handleCancelRefundMode}
                    disabled={isSubmittingRefund}
                  >
                    Annuler remboursement
                  </button>
                  <button
                    className="primary-button"
                    type="button"
                    onClick={handleSubmitRefund}
                    disabled={isSubmittingRefund}
                  >
                    {isSubmittingRefund ? "Validation..." : "Valider remboursement"}
                  </button>
                </>
              ) : (
                <>
                  <button
                    className="ghost-button"
                    type="button"
                    onClick={handleEnableRefundMode}
                  >
                    Remboursement
                  </button>
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={handleOpenPayment}
                  >
                    Valider paiement
                  </button>
                </>
              )}
              <button
                className="ghost-button"
                type="button"
                onClick={() => window.print()}
              >
                Imprimer ticket
              </button>
            </div>
          </div>
        </SectionCard>
      </div>

      <SectionCard
        title="Client"
        description="Section compacte pour rattacher rapidement la vente au bon client."
        actions={
          <button
            className="ghost-button"
            type="button"
            onClick={() => {
              setCustomerModalError("");
              setIsCustomerModalOpen(true);
            }}
          >
            Ajouter client
          </button>
        }
      >
        {customerNotice.message ? (
          <div className={`inline-notice ${customerNotice.type}`}>
            {customerNotice.message}
          </div>
        ) : null}

        <div className="register-selector-grid customer-selector-grid">
          <div className="field-group compact-field">
            <label className="field-label" htmlFor="customer-search">
              Recherche client
            </label>
            <input
              id="customer-search"
              className="text-input"
              type="text"
              placeholder="Rechercher par nom ou numero client"
              value={customerSearchTerm}
              onChange={(event) => setCustomerSearchTerm(event.target.value)}
            />
          </div>

          <div className="field-group compact-field">
            <label className="field-label" htmlFor="customer-select">
              Client selectionne
            </label>
            <select
              id="customer-select"
              className="text-input select-input"
              value={selectedCustomer?.id || DEFAULT_CUSTOMER.id}
              onChange={(event) => handleCustomerSelection(event.target.value)}
              disabled={isLoadingCustomers}
            >
              {selectableCustomers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  #{customer.customerNumber} - {customer.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="register-context-grid customer-context-grid">
          <div className="detail-stat">
            <span>Numero client</span>
            <strong>#{selectedCustomer?.customerNumber || 1}</strong>
          </div>
          <div className="detail-stat">
            <span>Nom client</span>
            <strong>{selectedCustomer?.name || DEFAULT_CUSTOMER.name}</strong>
          </div>
          <div className="detail-stat">
            <span>Credit client</span>
            <strong>
              {isLoadingCustomerCredit
                ? "Chargement..."
                : formatCurrencyDh(customerCredit || 0)}
            </strong>
          </div>
        </div>

        <div className="customer-credit-row">
          {Number(customerCredit) > 0 ? (
            <span className="app-badge tone-stock-warning">
              Credit client: {formatCurrencyDh(customerCredit)}
            </span>
          ) : (
            <span className="app-badge tone-success">Aucun credit</span>
          )}
        </div>
      </SectionCard>

      <SectionCard
        title="Session du jour"
        description={
          isLoadingCashSession
            ? "Chargement de la session active..."
            : "Resume rapide de la session active et cloture en fin de journee."
        }
        actions={
          <div className="table-action-row">
            <Badge
              tone={getSessionStatusMeta(currentCashSession?.status, offlineArchiveSales.length > 0).tone}
            >
              {getSessionStatusMeta(currentCashSession?.status, offlineArchiveSales.length > 0).label}
            </Badge>
            <button
              className="primary-button"
              type="button"
              onClick={handleCloseCashSession}
              disabled={
                isClosingCashSession ||
                !currentCashSession?.id ||
                currentCashSession?.status !== "OUVERTE"
              }
            >
              {isClosingCashSession ? "Cloture..." : "Cloturer journee"}
            </button>
          </div>
        }
      >
        <div className="register-context-grid pos-session-summary">
          <div className="detail-stat">
            <span>Session actuelle</span>
            <strong>
              {currentCashSession?.sessionNumber ||
                (offlineArchiveSales.length ? "Archive locale hors ligne" : "Aucune session")}
            </strong>
          </div>
          <div className="detail-stat">
            <span>Nombre tickets</span>
            <strong>{archiveSummary.ticketsCount}</strong>
          </div>
          <div className="detail-stat">
            <span>Total du jour</span>
            <strong>{formatCurrencyDh(archiveSummary.totalSales)}</strong>
          </div>
          <div className="detail-stat">
            <span>Caissier</span>
            <strong>{currentUser?.name || "Utilisateur inconnu"}</strong>
          </div>
          <div className="detail-stat">
            <span>Date</span>
            <strong>{new Date().toLocaleDateString("fr-MA")}</strong>
          </div>
          <div className="detail-stat">
            <span>Statut</span>
            <strong>
              {currentCashSession?.status === "OUVERTE"
                ? "Ouverte"
                : currentCashSession?.status === "FERMEE"
                  ? "Fermee"
                  : offlineArchiveSales.length
                    ? "Hors ligne"
                    : "Aucune session"}
            </strong>
          </div>
        </div>
      </SectionCard>

      <Modal
        isOpen={variantSelection.isOpen}
        eyebrow="Choisir variante"
        title={variantSelection.product?.name || "Variante produit"}
        description="Selectionnez la taille et la couleur a ajouter au panier."
        onClose={closeVariantSelection}
        actions={
          <button className="ghost-button" type="button" onClick={closeVariantSelection}>
            Fermer
          </button>
        }
      >
        <DataTable
          columns={[
            { key: "variant", label: "Variante" },
            { key: "size", label: "Taille" },
            { key: "color", label: "Couleur" },
            { key: "barcode", label: "Code-barres" },
            { key: "stock", label: "Stock" },
            { key: "price", label: "Prix" },
            { key: "actions", label: "Action" },
          ]}
          data={variantSelection.variants}
          emptyTitle="Aucune variante"
          emptyDescription="Aucune variante active n'est disponible pour ce produit."
          renderRow={(variant) => (
            <tr key={variant.id}>
              <td>{variant.label || "-"}</td>
              <td>{variant.size || variant.taille || "Unique"}</td>
              <td>{variant.color || variant.couleur || "-"}</td>
              <td>{variant.barcode || "-"}</td>
              <td>{variant.stock ?? 0}</td>
              <td>{formatCurrencyDh(variant.salePrice || 0)}</td>
              <td>
                <button
                  className="primary-button small-button"
                  type="button"
                  onClick={() => {
                    const added = addProductWithStockCheck(
                      variantSelection.product,
                      variant
                    );

                    if (added) {
                      closeVariantSelection();
                    }
                  }}
                >
                  Choisir
                </button>
              </td>
            </tr>
          )}
        />
      </Modal>

      <PaymentModal
        isOpen={isPaymentOpen}
        totalAmount={totalAmount}
        totalItems={totalItems}
        onClose={() => setIsPaymentOpen(false)}
        onConfirm={handleConfirmPayment}
        isProcessing={isSubmittingSale}
      />

      <Modal
        isOpen={Boolean(selectedArchivedSale)}
        eyebrow="Ticket du jour"
        title={selectedArchivedSale?.ticketNumber || "Ticket"}
        description={
          selectedArchivedSale
            ? `${activeStoreName || "Magasin"} - ${formatTimeValue(
                selectedArchivedSale.date || selectedArchivedSale.createdAt
              )}`
            : ""
        }
        onClose={() => setSelectedArchivedSale(null)}
        actions={
          <>
            <button
              className="ghost-button"
              type="button"
              onClick={() => setSelectedArchivedSale(null)}
            >
              Fermer
            </button>
            <button className="primary-button" type="button" onClick={() => window.print()}>
              Imprimer ticket
            </button>
          </>
        }
      >
        {selectedArchivedSale ? (
          <>
            <div className="details-list">
              <div className="detail-stat">
                <span>Heure</span>
                <strong>{formatTimeValue(selectedArchivedSale.date || selectedArchivedSale.createdAt)}</strong>
              </div>
              <div className="detail-stat">
                <span>Caisse</span>
                <strong>{selectedArchivedSale.cashRegisterName || activeCashRegisterName || "-"}</strong>
              </div>
              <div className="detail-stat">
                <span>Caissier</span>
                <strong>{selectedArchivedSale.cashierName || currentUser?.name || "-"}</strong>
              </div>
              <div className="detail-stat">
                <span>Paiement</span>
                <strong>{getPaymentMethodMeta(selectedArchivedSale.paymentMethod).label}</strong>
              </div>
              <div className="detail-stat">
                <span>Statut</span>
                <strong>
                  {
                    getSaleStatusMeta(
                      selectedArchivedSale.status,
                      selectedArchivedSale.localOnly,
                      selectedArchivedSale.paymentStatus
                    ).label
                  }
                </strong>
              </div>
              {Number(selectedArchivedSale.paidAmount || 0) > 0 &&
              Number(selectedArchivedSale.paidAmount || 0) !==
                Number(selectedArchivedSale.total || 0) ? (
                <div className="detail-stat">
                  <span>Montant paye</span>
                  <strong>{formatCurrencyDh(selectedArchivedSale.paidAmount || 0)}</strong>
                </div>
              ) : null}
              {Number(selectedArchivedSale.remainingAmount || 0) > 0 ? (
                <div className="detail-stat">
                  <span>Reste a payer</span>
                  <strong>
                    {formatCurrencyDh(selectedArchivedSale.remainingAmount || 0)}
                  </strong>
                </div>
              ) : null}
            </div>

            <DataTable
              columns={[
                { key: "product", label: "Produit" },
                { key: "quantity", label: "Quantite" },
                { key: "unitPrice", label: "Prix unitaire" },
                { key: "subtotal", label: "Sous-total" },
              ]}
              data={selectedArchivedSale.items || []}
              emptyTitle="Aucune ligne"
              emptyDescription="Ce ticket ne contient aucune ligne produit."
              renderRow={(item, index) => (
                <tr key={`${selectedArchivedSale.id || selectedArchivedSale.ticketNumber}-${index}`}>
                  <td>
                    {item.productName || "-"}
                    {item.variantLabel ? ` / ${item.variantLabel}` : ""}
                  </td>
                  <td>{item.quantity || 0}</td>
                  <td>{formatCurrencyDh(item.unitPrice || 0)}</td>
                  <td>{formatCurrencyDh(item.subtotal || 0)}</td>
                </tr>
              )}
            />

            <div className="details-summary">
              <span>Total ticket</span>
              <strong>{formatCurrencyDh(selectedArchivedSale.total || 0)}</strong>
            </div>
          </>
        ) : null}
      </Modal>

      <Modal
        isOpen={isCustomerModalOpen}
        eyebrow="Nouveau client"
        title="Ajouter un client"
        description="Les clients connus recoivent automatiquement le prochain numero client disponible."
        onClose={closeCustomerModal}
        actions={
          <>
            <button
              className="ghost-button"
              type="button"
              onClick={closeCustomerModal}
              disabled={isSubmittingCustomer}
            >
              Annuler
            </button>
            <button
              className="primary-button"
              type="submit"
              form="create-customer-form"
              disabled={isSubmittingCustomer}
            >
              {isSubmittingCustomer ? "Ajout..." : "Ajouter client"}
            </button>
          </>
        }
      >
        <form className="form-grid" id="create-customer-form" onSubmit={handleCreateCustomer}>
          {customerModalError ? (
            <div className="inline-notice error">{customerModalError}</div>
          ) : null}

          <div className="field-group">
            <label className="field-label" htmlFor="customer-name">
              Nom client
            </label>
            <input
              id="customer-name"
              className="text-input"
              type="text"
              value={newCustomerForm.name}
              onChange={(event) => {
                setCustomerModalError("");
                setNewCustomerForm((current) => ({
                  ...current,
                  name: event.target.value,
                }));
              }}
            />
          </div>

          <div className="field-group">
            <label className="field-label" htmlFor="customer-phone">
              Telephone
            </label>
            <input
              id="customer-phone"
              className="text-input"
              type="text"
              value={newCustomerForm.phone}
              onChange={(event) => {
                setCustomerModalError("");
                setNewCustomerForm((current) => ({
                  ...current,
                  phone: event.target.value,
                }));
              }}
            />
          </div>

          <div className="field-group">
            <label className="field-label" htmlFor="customer-email">
              Email
            </label>
            <input
              id="customer-email"
              className="text-input"
              type="email"
              value={newCustomerForm.email}
              onChange={(event) => {
                setCustomerModalError("");
                setNewCustomerForm((current) => ({
                  ...current,
                  email: event.target.value,
                }));
              }}
            />
          </div>
        </form>
      </Modal>
    </div>
  );
}

export default PosPage;
