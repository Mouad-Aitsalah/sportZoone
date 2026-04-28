import { useEffect, useState } from "react";
import Modal from "../components/Modal";
import PageHeader from "../components/PageHeader";
import PaymentModal from "../components/PaymentModal";
import SectionCard from "../components/SectionCard";
import api from "../services/api";
import { savePendingSale } from "../services/offlineDb";
import { getCurrentUser } from "../store/authStore";
import { useCart } from "../store/cartStore";
import { formatCurrencyDh } from "../utils/formatters";

const DEFAULT_CUSTOMER = {
  id: 1,
  customerNumber: 1,
  name: "Client inconnu",
  phone: null,
  email: null,
  credit: 0,
  active: true,
};

const PRODUCTS_CACHE_KEY = "products";

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

function PosPage() {
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
  const [isLoadingStores, setIsLoadingStores] = useState(false);
  const [isLoadingCashRegisters, setIsLoadingCashRegisters] = useState(false);
  const [isLoadingCustomers, setIsLoadingCustomers] = useState(false);
  const [isLoadingCustomerCredit, setIsLoadingCustomerCredit] = useState(false);
  const [isSearchingBarcode, setIsSearchingBarcode] = useState(false);
  const [isSubmittingSale, setIsSubmittingSale] = useState(false);
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
    clearCart,
    totalItems,
    totalAmount,
  } = useCart();

  const activeStoreId = isAdmin ? selectedStoreId : currentUser?.storeId;
  const activeCashRegisterId = isAdmin
    ? selectedCashRegisterId
    : currentUser?.cashRegisterId;
  const activeStoreName = isAdmin
    ? stores.find((store) => store.id === selectedStoreId)?.name || null
    : currentUser?.storeName;
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
      try {
        setIsLoadingProducts(true);
        const response = await api.get("/products");
        const list = Array.isArray(response.data)
          ? response.data
          : response.data?.data || [];

        if (isMounted) {
          setProducts(list);
          localStorage.setItem(PRODUCTS_CACHE_KEY, JSON.stringify(list));
        }
      } catch (error) {
        if (isMounted) {
          const cachedProducts = JSON.parse(
            localStorage.getItem(PRODUCTS_CACHE_KEY) || "[]"
          );

          if (cachedProducts.length) {
            setProducts(cachedProducts);
          }

          setNotice({
            type: "warning",
            message: cachedProducts.length
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
    if (!isAdmin) {
      return undefined;
    }

    let isMounted = true;

    async function fetchStores() {
      try {
        setIsLoadingStores(true);
        const response = await api.get("/stores");
        const list = Array.isArray(response.data)
          ? response.data
          : response.data?.data || [];

        if (isMounted) {
          setStores(list);
        }
      } catch (error) {
        if (isMounted) {
          setNotice({
            type: "warning",
            message:
              error.response?.data?.message ||
              "Impossible de charger les points de vente.",
          });
        }
      } finally {
        if (isMounted) {
          setIsLoadingStores(false);
        }
      }
    }

    fetchStores();

    return () => {
      isMounted = false;
    };
  }, [isAdmin]);

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
      try {
        setIsLoadingCashRegisters(true);
        const response = await api.get("/cash-registers", {
          params: { storeId: selectedStoreId },
        });
        const list = Array.isArray(response.data)
          ? response.data
          : response.data?.data || [];

        if (isMounted) {
          setCashRegisters(list);
          setSelectedCashRegisterId((currentValue) =>
            list.some((cashRegister) => cashRegister.id === currentValue)
              ? currentValue
              : null
          );
        }
      } catch (error) {
        if (isMounted) {
          setCashRegisters([]);
          setSelectedCashRegisterId(null);
          setNotice({
            type: "warning",
            message:
              error.response?.data?.message ||
              "Impossible de charger les caisses pour ce point de vente.",
          });
        }
      } finally {
        if (isMounted) {
          setIsLoadingCashRegisters(false);
        }
      }
    }

    fetchCashRegisters();

    return () => {
      isMounted = false;
    };
  }, [isAdmin, selectedStoreId]);

  const fetchCustomers = async (customerIdToSelect = null) => {
    const response = await api.get("/customers");
    const list = getCollection(response.data, ["data", "customers"]);

    setCustomers(list);

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
      try {
        setIsLoadingCustomers(true);
        setCustomerNotice({ type: "", message: "" });
        const response = await api.get("/customers");
        const list = getCollection(response.data, ["data", "customers"]);

        if (!isMounted) {
          return;
        }

        setCustomers(list);

        const preferredCustomer =
          list.find((customer) => customer.customerNumber === 1) ||
          list[0] ||
          DEFAULT_CUSTOMER;

        setSelectedCustomerId(preferredCustomer.id);
        setSelectedCustomerDetails(preferredCustomer);
      } catch (error) {
        if (isMounted) {
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

  const refreshProducts = async () => {
    try {
      const response = await api.get("/products");
      const list = Array.isArray(response.data)
        ? response.data
        : response.data?.data || [];

      setProducts(list);
      localStorage.setItem(PRODUCTS_CACHE_KEY, JSON.stringify(list));
    } catch (error) {
      // Keep the cashier flow stable even if the background refresh fails.
    }
  };

  const getCachedProducts = () => {
    try {
      return JSON.parse(localStorage.getItem(PRODUCTS_CACHE_KEY) || "[]");
    } catch (error) {
      return [];
    }
  };

  const generateLocalSaleId = () => {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }

    return `local-sale-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
  };

  const buildSalePayload = (method) => {
    return {
      storeId: activeStoreId,
      cashRegisterId: activeCashRegisterId,
      userId: currentUser?.id,
      customerId: selectedCustomer?.id || DEFAULT_CUSTOMER.id,
      paymentMethod: method,
      items: items.map((item) => ({
        productId: item.id,
        quantity: item.quantity,
        unitPrice: item.salePrice ?? item.price,
      })),
      total: totalAmount,
    };
  };

  const buildOfflineSalePayload = (method, userId) => {
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
        productId: item.id,
        quantity: item.quantity,
        unitPrice: item.salePrice ?? item.price,
      })),
      total: totalAmount,
      paymentMethod: method,
      createdAt: new Date().toISOString(),
      syncStatus: "pending",
    };
  };

  const addOfflineProductToCart = (product) => {
    if (!product?.active) {
      setNotice({
        type: "warning",
        message: `${product?.name || "Ce produit"} est inactif et ne peut pas etre ajoute.`,
      });
      return false;
    }

    addItem({
      ...product,
      price: product.price ?? product.salePrice ?? 0,
      salePrice: product.salePrice ?? product.price ?? 0,
      stock: Number.POSITIVE_INFINITY,
      storeName: activeStoreName || product.storeName || null,
    });
    setNotice({
      type: "success",
      message: `${product.name} ajoute au panier depuis le cache hors ligne.`,
    });
    return true;
  };

  const ensureStoreSelected = () => {
    if (activeStoreId) {
      return true;
    }

    setNotice({
      type: "warning",
      message: isAdmin
        ? "Selectionnez d'abord un point de vente pour verifier le stock."
        : "Aucun point de vente actif n'est assigne a cet utilisateur.",
    });
    return false;
  };

  const addProductWithStockCheck = (product) => {
    const existingItem = items.find((item) => item.id === product.id);
    const currentQuantity = existingItem?.quantity || 0;
    const availableStock = product.stock ?? existingItem?.stock ?? 0;

    if (availableStock <= 0) {
      setNotice({
        type: "error",
        message: `${product.name} n'est plus disponible en stock.`,
      });
      return false;
    }

    if (currentQuantity >= availableStock) {
      setNotice({
        type: "warning",
        message: `Stock insuffisant pour ${product.name}. Stock disponible: ${availableStock}.`,
      });
      return false;
    }

    addItem({
      ...product,
      price: product.price ?? product.salePrice ?? 0,
      storeName: activeStoreName || product.storeName || null,
    });
    setNotice({
      type: "success",
      message: `${product.name} ajoute au panier.`,
    });
    return true;
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
        (item) => String(item.barcode || "").trim() === trimmedBarcode
      );

      if (!product) {
        setNotice({
          type: "error",
          message: "Produit non disponible hors ligne.",
        });
        return;
      }

      const added = addOfflineProductToCart(product);

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
      const added = addProductWithStockCheck(product);

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
        message: isAdmin
          ? "Selectionnez un point de vente et une caisse avant de valider la vente."
          : "Votre compte doit etre assigne a un point de vente et une caisse.",
      });
      return;
    }

    setIsPaymentOpen(true);
  };

  const handleQuickAdd = async (product) => {
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

      const cachedProduct =
        cachedProducts.find((item) => item.id === product.id) ||
        cachedProducts.find(
          (item) => String(item.barcode || "") === String(product.barcode || "")
        );

      if (!cachedProduct) {
        setNotice({
          type: "error",
          message: "Produit non disponible hors ligne.",
        });
        return;
      }

      addOfflineProductToCart(cachedProduct);
      return;
    }

    try {
      setIsSearchingBarcode(true);

      const response = await api.get(
        `/products/barcode/${encodeURIComponent(product.barcode)}`,
        {
          params: {
            storeId: activeStoreId,
          },
        }
      );

      addProductWithStockCheck({
        ...response.data,
        price: response.data.salePrice,
      });
    } catch (error) {
      setNotice({
        type: "error",
        message:
          error.response?.data?.message ||
          "Impossible d'ajouter rapidement ce produit.",
      });
    } finally {
      setIsSearchingBarcode(false);
    }
  };

  const handleClearCart = () => {
    clearCart();
    setNotice({
      type: "info",
      message: "Panier vide. Pret pour une nouvelle vente.",
    });
  };

  const handleConfirmPayment = async (method) => {
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

    const salePayload = buildSalePayload(method);

    try {
      setIsSubmittingSale(true);
      console.log("TRY ONLINE SALE");
      const response = await api.post("/sales", salePayload);
      const ticketNumber =
        response.data?.ticketNumber ||
        response.data?.data?.ticketNumber ||
        response.data?.sale?.ticketNumber;

      clearCart();
      setIsPaymentOpen(false);
      setNotice({
        type: "success",
        message: ticketNumber
          ? `Paiement confirme. Ticket ${ticketNumber} genere avec succes.`
          : "Paiement confirme avec succes.",
      });
      await refreshProducts();
      return true;
    } catch (error) {
      console.error("API FAILED → OFFLINE MODE", error);

      const offlineSale = buildOfflineSalePayload(method, userId);

      try {
        console.log("OFFLINE FALLBACK");
        await savePendingSale(offlineSale);
        clearCart();
        setIsPaymentOpen(false);
        setNotice({
          type: "success",
          message: "Vente enregistree hors ligne.",
        });
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

      const response = await api.post("/customers", {
        name: newCustomerForm.name.trim(),
        phone: newCustomerForm.phone.trim(),
        email: newCustomerForm.email.trim(),
      });
      const createdCustomer = response.data?.data || response.data;

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
    <div>
      <PageHeader
        eyebrow="Caisse"
        title="POS / Caisse"
        description="Scanner les produits, ajuster les quantites et finaliser l'encaissement en quelques clics."
      />

      <SectionCard
        title="Caisse active"
        description="Le contexte de vente actuel est applique a chaque ticket."
        actions={
          <span className={`app-badge ${isOnline ? "tone-success" : "tone-warning"}`}>
            {isOnline ? "En ligne" : "Hors ligne"}
          </span>
        }
      >
        <div className="register-context-grid">
          <div className="detail-stat">
            <span>Store</span>
            <strong>{activeStoreName || "Selection requise"}</strong>
          </div>
          <div className="detail-stat">
            <span>Cash register</span>
            <strong>{activeCashRegisterName || "Selection requise"}</strong>
          </div>
          <div className="detail-stat">
            <span>Cashier</span>
            <strong>{currentUser?.name || "Utilisateur inconnu"}</strong>
          </div>
        </div>

        {isAdmin ? (
          <div className="register-selector-grid">
            <div className="field-group compact-field">
              <label className="field-label" htmlFor="pos-store-select">
                Store
              </label>
              <select
                id="pos-store-select"
                className="text-input select-input"
                value={selectedStoreId || ""}
                onChange={(event) => {
                  const nextStoreId = Number(event.target.value) || null;
                  setSelectedStoreId(nextStoreId);
                  setSelectedCashRegisterId(null);
                }}
                disabled={isLoadingStores}
              >
                <option value="">Selectionner un point de vente</option>
                {stores.map((store) => (
                  <option key={store.id} value={store.id}>
                    {store.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="field-group compact-field">
              <label className="field-label" htmlFor="pos-cash-register-select">
                Cash Register
              </label>
              <select
                id="pos-cash-register-select"
                className="text-input select-input"
                value={selectedCashRegisterId || ""}
                onChange={(event) =>
                  setSelectedCashRegisterId(Number(event.target.value) || null)
                }
                disabled={!selectedStoreId || isLoadingCashRegisters}
              >
                <option value="">
                  {selectedStoreId
                    ? "Selectionner une caisse"
                    : "Choisir d'abord un point de vente"}
                </option>
                {cashRegisters.map((cashRegister) => (
                  <option key={cashRegister.id} value={cashRegister.id}>
                    {cashRegister.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ) : null}
      </SectionCard>

      <SectionCard
        title="Client"
        description="Selectionnez le client avant de scanner ou d'ajouter les produits."
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
          description="Verifier les quantites, les prix et le total avant paiement."
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
                    <strong>{item.name}</strong>
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
                    <strong>{item.quantity}</strong>
                    <button
                      className="quantity-button"
                      type="button"
                      onClick={() => {
                        if (item.quantity >= (item.stock ?? 0)) {
                          setNotice({
                            type: "warning",
                            message: `Stock insuffisant pour ${item.name}. Stock disponible: ${item.stock ?? 0}.`,
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
                    <span>Unite: {formatCurrencyDh(item.price)}</span>
                    <strong>
                      Sous-total: {formatCurrencyDh(item.quantity * item.price)}
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
              Le panier est vide. Scannez un article pour demarrer la vente.
            </div>
          )}

          <div className="cart-summary">
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
              <span>{formatCurrencyDh(totalAmount)}</span>
            </div>
            <div className="action-row">
              <button
                className="secondary-button"
                type="button"
                onClick={handleOpenPayment}
              >
                Valider paiement
              </button>
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

      <PaymentModal
        isOpen={isPaymentOpen}
        totalAmount={totalAmount}
        totalItems={totalItems}
        onClose={() => setIsPaymentOpen(false)}
        onConfirm={handleConfirmPayment}
        isProcessing={isSubmittingSale}
      />

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
