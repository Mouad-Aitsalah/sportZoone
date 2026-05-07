import { useEffect, useMemo, useState } from "react";
import Badge from "../components/Badge";
import DataTable from "../components/DataTable";
import Modal from "../components/Modal";
import PageHeader from "../components/PageHeader";
import SectionCard from "../components/SectionCard";
import api from "../services/api";
import { formatCurrencyDh } from "../utils/formatters";

const getTodayString = () => new Date().toISOString().slice(0, 10);

const createProductLookupLabel = (product) =>
  [product.barcode, product.name].filter(Boolean).join(" - ");

const createEmptyClientAvoirLine = () => ({
  rowId: `avoir-line-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  productId: "",
  productLookup: "",
  productCode: "",
  productName: "",
  category: "",
  quantity: "1",
  prixUnitaire: "",
});

const createEmptySupplierAvoirLine = () => ({
  rowId: `supplier-avoir-line-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  productId: "",
  productLookup: "",
  productCode: "",
  productName: "",
  category: "",
  quantity: "1",
  prixAchat: "",
});

const createInitialAvoirForm = (numeroAvoir = "AV-00001") => ({
  numeroAvoir,
  compteClientId: "",
  pointDeVenteId: "",
  dateAvoir: getTodayString(),
  motif: "",
  lignes: [createEmptyClientAvoirLine()],
});

const createInitialSupplierAvoirForm = (numero = "1/2026") => ({
  numero,
  compteFournisseurId: "",
  achatId: "",
  pointDeVenteId: "",
  date: getTodayString(),
  motif: "",
  compensationMode: "REMBOURSEMENT",
  commentaire: "",
  lignes: [createEmptySupplierAvoirLine()],
});

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

const normalizeClient = (client) => ({
  id: Number(client?.id),
  name: client?.name || client?.nom || "Client",
  accountNumber: client?.accountNumber || client?.numeroCompte || "",
});

const normalizeSupplier = (supplier) => ({
  id: Number(supplier?.id),
  name: supplier?.name || supplier?.nom || "Fournisseur",
  accountNumber: supplier?.accountNumber || supplier?.numeroCompte || "",
});

const normalizeProduct = (product) => ({
  id: Number(product?.id),
  name: product?.name || product?.nom || "Produit",
  barcode: product?.barcode || product?.codeBarres || "",
  category: product?.category || product?.categorie || "",
  salePrice: Number(
    product?.salePrice ?? product?.retailPrice ?? product?.prixDetail ?? product?.prixVente ?? 0
  ),
  purchasePrice: Number(product?.purchasePrice ?? product?.prixAchat ?? 0),
});

const normalizeStore = (store) => ({
  id: Number(store?.id),
  name: store?.name || store?.nom || "Magasin",
});

const normalizePurchase = (purchase) => ({
  id: Number(purchase?.id),
  purchaseNumber:
    purchase?.purchaseNumber || purchase?.numeroAchat || purchase?.reference || "-",
  supplierCompteId: Number(
    purchase?.supplierCompteId ?? purchase?.compteFournisseurId ?? purchase?.supplierId ?? 0
  ),
  storeId: Number(purchase?.storeId ?? purchase?.pointDeVenteId ?? 0),
  dateAchat: purchase?.dateAchat || purchase?.purchaseDate || "",
});

const normalizeAvoirLine = (line) => ({
  id: line?.id || `line-${Date.now()}`,
  productId: Number(line?.productId ?? line?.produitId ?? 0),
  productName:
    line?.productName || line?.produitNom || line?.product?.name || line?.produit?.nom || "-",
  quantity: Number(line?.quantity ?? line?.quantite ?? 0),
  unitPrice: Number(line?.unitPrice ?? line?.prixUnitaire ?? 0),
  lineTotal: Number(line?.lineTotal ?? line?.totalLigne ?? 0),
});

const normalizeSupplierAvoirLine = (line) => ({
  id: line?.id || `supplier-line-${Date.now()}`,
  productId: Number(line?.productId ?? line?.produitId ?? 0),
  productName:
    line?.productName || line?.produitNom || line?.product?.name || line?.produit?.nom || "-",
  barcode: line?.barcode || line?.codeBarres || "",
  category: line?.category || line?.categorie || "",
  quantity: Number(line?.quantity ?? line?.quantite ?? 0),
  purchasePrice: Number(line?.purchasePrice ?? line?.prixAchat ?? 0),
  lineTotal: Number(line?.lineTotal ?? line?.sousTotal ?? 0),
});

const normalizeAvoir = (avoir) => ({
  id: avoir?.id || `avoir-${Date.now()}`,
  creditNumber: avoir?.creditNumber || avoir?.numeroAvoir || `AV-${Date.now()}`,
  clientId: Number(avoir?.compteClientId ?? avoir?.clientCompteId ?? avoir?.clientId ?? 0),
  clientName: avoir?.clientName || avoir?.client?.name || avoir?.client?.nom || "-",
  clientAccountNumber: avoir?.clientAccountNumber || avoir?.client?.numeroCompte || "",
  dateAvoir: avoir?.dateAvoir || avoir?.creditDate || avoir?.date || "",
  storeId: Number(avoir?.pointDeVenteId ?? avoir?.storeId ?? 0),
  storeName: avoir?.pointDeVenteNom || avoir?.storeName || avoir?.pointDeVente?.nom || "-",
  motif: avoir?.motif || avoir?.reason || "",
  total: Number(avoir?.total ?? 0),
  status: avoir?.status || avoir?.statut || "ENREGISTRE",
  lignes: getCollection(avoir, ["lignes", "items"]).map(normalizeAvoirLine),
});

const normalizeSupplierAvoir = (avoir) => ({
  id: avoir?.id || `supplier-avoir-${Date.now()}`,
  number: avoir?.supplierCreditNumber || avoir?.numero || `${Date.now()}`,
  supplierCompteId: Number(
    avoir?.compteFournisseurId ??
      avoir?.fournisseurCompteId ??
      avoir?.supplierCompteId ??
      0
  ),
  supplierName: avoir?.supplierName || avoir?.fournisseurNom || "-",
  supplierAccountNumber:
    avoir?.supplierAccountNumber || avoir?.fournisseurNumeroCompte || "",
  purchaseId: Number(avoir?.achatId ?? avoir?.purchaseId ?? 0),
  purchaseNumber: avoir?.purchaseNumber || avoir?.numeroAchat || "",
  storeId: Number(avoir?.pointDeVenteId ?? avoir?.storeId ?? 0),
  storeName: avoir?.pointDeVenteNom || avoir?.storeName || "-",
  date: avoir?.date || "",
  motif: avoir?.motif || avoir?.reason || "",
  compensationMode: avoir?.compensationMode || "REMBOURSEMENT",
  commentaire: avoir?.commentaire || avoir?.comment || "",
  total: Number(avoir?.total ?? 0),
  status: avoir?.status || avoir?.statut || "BROUILLON",
  lignes: getCollection(avoir, ["lignes", "items"]).map(normalizeSupplierAvoirLine),
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

const getClientStatusTone = (status) => {
  if (status === "REMBOURSE") {
    return "success";
  }

  if (status === "ANNULE") {
    return "danger";
  }

  return "warning";
};

const getSupplierStatusTone = (status) => {
  if (status === "VALIDE" || status === "REMBOURSE") {
    return "success";
  }

  if (status === "ANNULE") {
    return "danger";
  }

  return "warning";
};

const findProductByLookup = (lookupValue, products) => {
  const normalizedLookup = String(lookupValue || "").trim().toLowerCase();

  if (!normalizedLookup) {
    return null;
  }

  return (
    products.find((product) => createProductLookupLabel(product).toLowerCase() === normalizedLookup) ||
    products.find((product) => String(product.barcode || "").toLowerCase() === normalizedLookup) ||
    products.find((product) => String(product.name || "").toLowerCase() === normalizedLookup)
  );
};

const buildNextAvoirNumber = (avoirs) => {
  const highestNumber = avoirs.reduce((maxValue, avoir) => {
    const match = String(avoir.creditNumber || "").match(/AV-(\d+)/i);
    const currentValue = match ? Number(match[1]) : 0;
    return Math.max(maxValue, currentValue);
  }, 0);

  return `AV-${String(highestNumber + 1).padStart(5, "0")}`;
};

const buildNextAnnualNumber = (documents) => {
  const year = new Date().getFullYear();
  const highestNumber = documents.reduce((maxValue, document) => {
    const match = String(document.number || "").match(/^(\d+)\/(\d{4})$/);

    if (!match || Number(match[2]) !== year) {
      return maxValue;
    }

    return Math.max(maxValue, Number(match[1]));
  }, 0);

  return `${highestNumber + 1}/${year}`;
};

const getSupplierProductsSummary = (avoir) =>
  avoir.lignes.map((line) => `${line.productName} x${line.quantity}`).join(", ");

const getSupplierQuantitySummary = (avoir) =>
  avoir.lignes.reduce((sum, line) => sum + line.quantity, 0);

function AvoirsPage() {
  const [activeTab, setActiveTab] = useState("client");
  const [avoirs, setAvoirs] = useState([]);
  const [supplierAvoirs, setSupplierAvoirs] = useState([]);
  const [clients, setClients] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [stores, setStores] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [notice, setNotice] = useState({ type: "", message: "" });
  const [errorMessage, setErrorMessage] = useState("");
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isSupplierEditorOpen, setIsSupplierEditorOpen] = useState(false);
  const [avoirFormData, setAvoirFormData] = useState(createInitialAvoirForm);
  const [supplierAvoirFormData, setSupplierAvoirFormData] = useState(
    createInitialSupplierAvoirForm
  );
  const [avoirEditorError, setAvoirEditorError] = useState("");
  const [supplierAvoirEditorError, setSupplierAvoirEditorError] = useState("");
  const [isSubmittingAvoir, setIsSubmittingAvoir] = useState(false);
  const [isSubmittingSupplierAvoir, setIsSubmittingSupplierAvoir] = useState(false);
  const [selectedAvoir, setSelectedAvoir] = useState(null);
  const [selectedSupplierAvoir, setSelectedSupplierAvoir] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [dateFilter, setDateFilter] = useState("");
  const [supplierSearchTerm, setSupplierSearchTerm] = useState("");
  const [supplierStatusFilter, setSupplierStatusFilter] = useState("ALL");
  const [supplierDateFilter, setSupplierDateFilter] = useState("");
  const [isCancellingId, setIsCancellingId] = useState(null);
  const [isUpdatingSupplierId, setIsUpdatingSupplierId] = useState(null);

  const nextAvoirNumber = useMemo(() => buildNextAvoirNumber(avoirs), [avoirs]);
  const nextSupplierAvoirNumber = useMemo(
    () => buildNextAnnualNumber(supplierAvoirs),
    [supplierAvoirs]
  );

  const productLookupOptions = useMemo(
    () =>
      products.map((product) => ({
        id: product.id,
        label: createProductLookupLabel(product),
      })),
    [products]
  );

  const fetchAvoirs = async () => {
    const response = await api.getAvoirs();
    return getCollection(response.data, ["data", "avoirs"]).map(normalizeAvoir);
  };

  const fetchSupplierAvoirs = async () => {
    const response = await api.getSupplierAvoirs();
    return getCollection(response.data, ["data", "avoirs"]).map(normalizeSupplierAvoir);
  };

  useEffect(() => {
    let isMounted = true;

    async function loadPageData() {
      try {
        setIsLoading(true);
        setErrorMessage("");
        setNotice({ type: "", message: "" });

        const [
          avoirsResult,
          supplierAvoirsResult,
          clientsResult,
          suppliersResult,
          productsResult,
          storesResult,
          purchasesResult,
        ] = await Promise.allSettled([
          fetchAvoirs(),
          fetchSupplierAvoirs(),
          api.getCustomerAccounts(),
          api.getSupplierAccounts(),
          api.getProducts(),
          api.getStores(),
          api.getPurchases(),
        ]);

        if (!isMounted) {
          return;
        }

        setAvoirs(avoirsResult.status === "fulfilled" ? avoirsResult.value : []);
        setSupplierAvoirs(
          supplierAvoirsResult.status === "fulfilled" ? supplierAvoirsResult.value : []
        );
        setClients(
          clientsResult.status === "fulfilled"
            ? getCollection(clientsResult.value.data, ["data", "comptes"]).map(
                normalizeClient
              )
            : []
        );
        setSuppliers(
          suppliersResult.status === "fulfilled"
            ? getCollection(suppliersResult.value.data, ["data", "comptes"]).map(
                normalizeSupplier
              )
            : []
        );
        setProducts(
          productsResult.status === "fulfilled"
            ? getCollection(productsResult.value.data, ["data", "products"]).map(
                normalizeProduct
              )
            : []
        );
        setStores(
          storesResult.status === "fulfilled"
            ? getCollection(storesResult.value.data, ["data", "stores"]).map(normalizeStore)
            : []
        );
        setPurchases(
          purchasesResult.status === "fulfilled"
            ? getCollection(purchasesResult.value.data, ["data", "purchases"]).map(
                normalizePurchase
              )
            : []
        );

        const firstError =
          (avoirsResult.status !== "fulfilled" && avoirsResult.reason) ||
          (supplierAvoirsResult.status !== "fulfilled" && supplierAvoirsResult.reason);

        if (firstError) {
          setErrorMessage(
            firstError.response?.data?.message ||
              "Impossible de charger les avoirs pour le moment."
          );
        }
      } catch (error) {
        if (isMounted) {
          setAvoirs([]);
          setSupplierAvoirs([]);
          setClients([]);
          setSuppliers([]);
          setProducts([]);
          setStores([]);
          setPurchases([]);
          setErrorMessage(
            error.response?.data?.message ||
              "Impossible de charger les avoirs pour le moment."
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
      avoirFormData.lignes.map((line) => {
        const quantity = Number(line.quantity || 0);
        const unitPrice = Number(line.prixUnitaire || 0);

        return {
          ...line,
          quantity,
          unitPrice,
          lineTotal: quantity * unitPrice,
        };
      }),
    [avoirFormData.lignes]
  );

  const computedSupplierLines = useMemo(
    () =>
      supplierAvoirFormData.lignes.map((line) => {
        const quantity = Number(line.quantity || 0);
        const purchasePrice = Number(line.prixAchat || 0);

        return {
          ...line,
          quantity,
          purchasePrice,
          lineTotal: quantity * purchasePrice,
        };
      }),
    [supplierAvoirFormData.lignes]
  );

  const totalAvoir = useMemo(
    () => computedLines.reduce((sum, line) => sum + line.lineTotal, 0),
    [computedLines]
  );

  const totalSupplierAvoir = useMemo(
    () => computedSupplierLines.reduce((sum, line) => sum + line.lineTotal, 0),
    [computedSupplierLines]
  );

  const filteredAvoirs = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return avoirs.filter((avoir) => {
      const matchesSearch =
        !normalizedSearch ||
        avoir.creditNumber.toLowerCase().includes(normalizedSearch) ||
        avoir.clientName.toLowerCase().includes(normalizedSearch);
      const matchesStatus = statusFilter === "ALL" || avoir.status === statusFilter;
      const matchesDate =
        !dateFilter || String(avoir.dateAvoir).slice(0, 10) === dateFilter;

      return matchesSearch && matchesStatus && matchesDate;
    });
  }, [avoirs, dateFilter, searchTerm, statusFilter]);

  const filteredSupplierAvoirs = useMemo(() => {
    const normalizedSearch = supplierSearchTerm.trim().toLowerCase();

    return supplierAvoirs.filter((avoir) => {
      const matchesSearch =
        !normalizedSearch ||
        avoir.number.toLowerCase().includes(normalizedSearch) ||
        avoir.supplierName.toLowerCase().includes(normalizedSearch);
      const matchesStatus =
        supplierStatusFilter === "ALL" || avoir.status === supplierStatusFilter;
      const matchesDate =
        !supplierDateFilter || String(avoir.date).slice(0, 10) === supplierDateFilter;

      return matchesSearch && matchesStatus && matchesDate;
    });
  }, [supplierAvoirs, supplierDateFilter, supplierSearchTerm, supplierStatusFilter]);

  const filteredPurchaseOptions = useMemo(() => {
    const supplierId = Number(supplierAvoirFormData.compteFournisseurId || 0);
    const storeId = Number(supplierAvoirFormData.pointDeVenteId || 0);

    return purchases.filter((purchase) => {
      const matchesSupplier = !supplierId || purchase.supplierCompteId === supplierId;
      const matchesStore = !storeId || purchase.storeId === storeId;
      return matchesSupplier && matchesStore;
    });
  }, [purchases, supplierAvoirFormData.compteFournisseurId, supplierAvoirFormData.pointDeVenteId]);

  const openAvoirEditor = () => {
    setNotice({ type: "", message: "" });
    setAvoirEditorError("");
    setAvoirFormData(createInitialAvoirForm(nextAvoirNumber));
    setIsEditorOpen(true);
  };

  const closeAvoirEditor = () => {
    if (isSubmittingAvoir) {
      return;
    }

    setIsEditorOpen(false);
    setAvoirEditorError("");
    setAvoirFormData(createInitialAvoirForm(nextAvoirNumber));
  };

  const openSupplierAvoirEditor = () => {
    setNotice({ type: "", message: "" });
    setSupplierAvoirEditorError("");
    setSupplierAvoirFormData(createInitialSupplierAvoirForm(nextSupplierAvoirNumber));
    setIsSupplierEditorOpen(true);
  };

  const closeSupplierAvoirEditor = () => {
    if (isSubmittingSupplierAvoir) {
      return;
    }

    setIsSupplierEditorOpen(false);
    setSupplierAvoirEditorError("");
    setSupplierAvoirFormData(createInitialSupplierAvoirForm(nextSupplierAvoirNumber));
  };

  const handleTopLevelChange = (event) => {
    const { name, value } = event.target;
    setAvoirEditorError("");
    setAvoirFormData((current) => ({
      ...current,
      [name]: value,
    }));
  };

  const handleSupplierTopLevelChange = (event) => {
    const { name, value } = event.target;
    setSupplierAvoirEditorError("");
    setSupplierAvoirFormData((current) => ({
      ...current,
      [name]: value,
      ...(name === "compteFournisseurId" ? { achatId: "" } : {}),
    }));
  };

  const applySelectedProductToLine = (rowId, product) => {
    setAvoirFormData((current) => ({
      ...current,
      lignes: current.lignes.map((line) =>
        line.rowId !== rowId
          ? line
          : {
              ...line,
              productId: String(product.id),
              productLookup: createProductLookupLabel(product),
              productCode: product.barcode,
              productName: product.name,
              category: product.category,
              prixUnitaire: String(product.salePrice || 0),
            }
      ),
    }));
  };

  const applySelectedProductToSupplierLine = (rowId, product) => {
    setSupplierAvoirFormData((current) => ({
      ...current,
      lignes: current.lignes.map((line) =>
        line.rowId !== rowId
          ? line
          : {
              ...line,
              productId: String(product.id),
              productLookup: createProductLookupLabel(product),
              productCode: product.barcode,
              productName: product.name,
              category: product.category,
              prixAchat: String(product.purchasePrice || 0),
            }
      ),
    }));
  };

  const handleLineChange = (rowId, field, value) => {
    setAvoirEditorError("");

    if (field === "productLookup") {
      setAvoirFormData((current) => ({
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

    setAvoirFormData((current) => ({
      ...current,
      lignes: current.lignes.map((line) =>
        line.rowId === rowId ? { ...line, [field]: value } : line
      ),
    }));
  };

  const handleSupplierLineChange = (rowId, field, value) => {
    setSupplierAvoirEditorError("");

    if (field === "productLookup") {
      setSupplierAvoirFormData((current) => ({
        ...current,
        lignes: current.lignes.map((line) =>
          line.rowId === rowId ? { ...line, productLookup: value } : line
        ),
      }));

      const matchingProduct = findProductByLookup(value, products);

      if (matchingProduct) {
        applySelectedProductToSupplierLine(rowId, matchingProduct);
      }

      return;
    }

    setSupplierAvoirFormData((current) => ({
      ...current,
      lignes: current.lignes.map((line) =>
        line.rowId === rowId ? { ...line, [field]: value } : line
      ),
    }));
  };

  const handleAddLine = () => {
    setAvoirFormData((current) => ({
      ...current,
      lignes: [...current.lignes, createEmptyClientAvoirLine()],
    }));
  };

  const handleAddSupplierLine = () => {
    setSupplierAvoirFormData((current) => ({
      ...current,
      lignes: [...current.lignes, createEmptySupplierAvoirLine()],
    }));
  };

  const handleRemoveLine = (rowId) => {
    setAvoirFormData((current) => ({
      ...current,
      lignes:
        current.lignes.length === 1
          ? current.lignes
          : current.lignes.filter((line) => line.rowId !== rowId),
    }));
  };

  const handleRemoveSupplierLine = (rowId) => {
    setSupplierAvoirFormData((current) => ({
      ...current,
      lignes:
        current.lignes.length === 1
          ? current.lignes
          : current.lignes.filter((line) => line.rowId !== rowId),
    }));
  };

  const validateAvoirForm = () => {
    if (!avoirFormData.compteClientId) {
      return "Le client est obligatoire.";
    }

    if (!avoirFormData.pointDeVenteId) {
      return "Le point de vente est obligatoire.";
    }

    if (!avoirFormData.lignes.length) {
      return "Au moins une ligne produit est obligatoire.";
    }

    const productIds = new Set();

    for (const line of avoirFormData.lignes) {
      if (!line.productId) {
        return "Chaque ligne doit contenir un produit valide.";
      }

      if (productIds.has(line.productId)) {
        return "Chaque produit ne peut apparaitre qu'une seule fois dans l'avoir.";
      }

      productIds.add(line.productId);

      if (!Number.isFinite(Number(line.quantity)) || Number(line.quantity) <= 0) {
        return "La quantite retournee doit etre superieure a 0.";
      }

      if (!Number.isFinite(Number(line.prixUnitaire)) || Number(line.prixUnitaire) < 0) {
        return "Le prix unitaire doit etre superieur ou egal a 0.";
      }
    }

    return "";
  };

  const validateSupplierAvoirForm = () => {
    if (!supplierAvoirFormData.compteFournisseurId) {
      return "Le fournisseur est obligatoire.";
    }

    if (!supplierAvoirFormData.pointDeVenteId) {
      return "Le point de vente est obligatoire.";
    }

    if (!supplierAvoirFormData.lignes.length) {
      return "Au moins une ligne produit est obligatoire.";
    }

    const productIds = new Set();

    for (const line of supplierAvoirFormData.lignes) {
      if (!line.productId) {
        return "Chaque ligne doit contenir un produit valide.";
      }

      if (productIds.has(line.productId)) {
        return "Chaque produit ne peut apparaitre qu'une seule fois dans l'avoir fournisseur.";
      }

      productIds.add(line.productId);

      if (!Number.isFinite(Number(line.quantity)) || Number(line.quantity) <= 0) {
        return "La quantite retournee doit etre superieure a 0.";
      }

      if (!Number.isFinite(Number(line.prixAchat)) || Number(line.prixAchat) < 0) {
        return "Le prix d'achat doit etre superieur ou egal a 0.";
      }
    }

    return "";
  };

  const handlePrintDraft = () => {
    if (typeof window !== "undefined") {
      window.print();
    }
  };

  const handleCreateAvoir = async (event) => {
    event.preventDefault();

    const validationMessage = validateAvoirForm();

    if (validationMessage) {
      setAvoirEditorError(validationMessage);
      return;
    }

    const payload = {
      compteClientId: Number(avoirFormData.compteClientId),
      pointDeVenteId: Number(avoirFormData.pointDeVenteId),
      dateAvoir: avoirFormData.dateAvoir,
      motif: avoirFormData.motif.trim(),
      lignes: avoirFormData.lignes.map((line) => ({
        produitId: Number(line.productId),
        quantite: Number(line.quantity),
        prixUnitaire: Number(line.prixUnitaire),
      })),
    };

    try {
      setIsSubmittingAvoir(true);
      setAvoirEditorError("");
      const response = await api.createAvoir(payload);
      const createdAvoir = normalizeAvoir(response.data?.data || response.data);
      const refreshedAvoirs = await fetchAvoirs();

      setAvoirs(refreshedAvoirs);
      setNotice({
        type: "success",
        message: `Avoir ${createdAvoir.creditNumber} enregistre avec succes.`,
      });
      closeAvoirEditor();
    } catch (error) {
      setAvoirEditorError(
        error.response?.data?.message ||
          "Impossible d'enregistrer l'avoir pour le moment."
      );
    } finally {
      setIsSubmittingAvoir(false);
    }
  };

  const handleCreateSupplierAvoir = async (event) => {
    event.preventDefault();

    const validationMessage = validateSupplierAvoirForm();

    if (validationMessage) {
      setSupplierAvoirEditorError(validationMessage);
      return;
    }

    const payload = {
      compteFournisseurId: Number(supplierAvoirFormData.compteFournisseurId),
      achatId: supplierAvoirFormData.achatId ? Number(supplierAvoirFormData.achatId) : undefined,
      pointDeVenteId: Number(supplierAvoirFormData.pointDeVenteId),
      date: supplierAvoirFormData.date,
      motif: supplierAvoirFormData.motif.trim(),
      compensationMode: supplierAvoirFormData.compensationMode,
      commentaire: supplierAvoirFormData.commentaire.trim(),
      lignes: supplierAvoirFormData.lignes.map((line) => ({
        produitId: Number(line.productId),
        quantite: Number(line.quantity),
        prixAchat: Number(line.prixAchat),
      })),
    };

    try {
      setIsSubmittingSupplierAvoir(true);
      setSupplierAvoirEditorError("");
      const response = await api.createSupplierAvoir(payload);
      const createdAvoir = normalizeSupplierAvoir(response.data?.data || response.data);
      const refreshedAvoirs = await fetchSupplierAvoirs();

      setSupplierAvoirs(refreshedAvoirs);
      setNotice({
        type: "success",
        message: `Avoir fournisseur ${createdAvoir.number} cree en brouillon.`,
      });
      closeSupplierAvoirEditor();
    } catch (error) {
      setSupplierAvoirEditorError(
        error.response?.data?.message ||
          "Impossible d'enregistrer l'avoir fournisseur pour le moment."
      );
    } finally {
      setIsSubmittingSupplierAvoir(false);
    }
  };

  const handleCancelAvoir = async (avoirId) => {
    try {
      setIsCancellingId(avoirId);
      await api.deleteAvoir(avoirId);
      const refreshedAvoirs = await fetchAvoirs();

      setAvoirs(refreshedAvoirs);
      setNotice({
        type: "success",
        message: "Avoir annule avec succes.",
      });
      setSelectedAvoir((current) =>
        current && current.id === avoirId
          ? refreshedAvoirs.find((avoir) => avoir.id === avoirId) || null
          : current
      );
    } catch (error) {
      setNotice({
        type: "error",
        message:
          error.response?.data?.message ||
          "Impossible d'annuler cet avoir pour le moment.",
      });
    } finally {
      setIsCancellingId(null);
    }
  };

  const handleValidateSupplierAvoir = async (avoirId) => {
    try {
      setIsUpdatingSupplierId(avoirId);
      const response = await api.validateSupplierAvoir(avoirId);
      const updatedAvoir = normalizeSupplierAvoir(response.data?.data || response.data);
      const refreshedAvoirs = await fetchSupplierAvoirs();

      setSupplierAvoirs(refreshedAvoirs);
      setSelectedSupplierAvoir((current) =>
        current && current.id === avoirId ? updatedAvoir : current
      );
      setNotice({
        type: "success",
        message: `Avoir fournisseur ${updatedAvoir.number} valide et stock mis a jour.`,
      });
    } catch (error) {
      setNotice({
        type: "error",
        message:
          error.response?.data?.message ||
          "Impossible de valider cet avoir fournisseur pour le moment.",
      });
    } finally {
      setIsUpdatingSupplierId(null);
    }
  };

  const handleCancelSupplierAvoir = async (avoirId) => {
    try {
      setIsUpdatingSupplierId(avoirId);
      const response = await api.cancelSupplierAvoir(avoirId);
      const updatedAvoir = normalizeSupplierAvoir(response.data?.data || response.data);
      const refreshedAvoirs = await fetchSupplierAvoirs();

      setSupplierAvoirs(refreshedAvoirs);
      setSelectedSupplierAvoir((current) =>
        current && current.id === avoirId ? updatedAvoir : current
      );
      setNotice({
        type: "success",
        message: `Avoir fournisseur ${updatedAvoir.number} annule.`,
      });
    } catch (error) {
      setNotice({
        type: "error",
        message:
          error.response?.data?.message ||
          "Impossible d'annuler cet avoir fournisseur pour le moment.",
      });
    } finally {
      setIsUpdatingSupplierId(null);
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow="Avoirs"
        title="Gestion des avoirs"
        description="Pilotez les avoirs clients et fournisseurs depuis une seule page, avec bons detaillees, suivi des statuts et mouvements de stock."
        actions={
          activeTab === "client" ? (
            <button
              className="primary-button"
              type="button"
              onClick={isEditorOpen ? closeAvoirEditor : openAvoirEditor}
            >
              {isEditorOpen ? "Fermer le bon d'avoir" : "Nouvel avoir client"}
            </button>
          ) : (
            <button
              className="primary-button"
              type="button"
              onClick={isSupplierEditorOpen ? closeSupplierAvoirEditor : openSupplierAvoirEditor}
            >
              {isSupplierEditorOpen
                ? "Fermer le bon fournisseur"
                : "Nouvel avoir fournisseur"}
            </button>
          )
        }
      />

      <SectionCard
        title="Modules d'avoir"
        description="Basculer entre les retours clients et les retours fournisseurs sans quitter la page."
      >
        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
          <button
            className={activeTab === "client" ? "primary-button" : "ghost-button"}
            type="button"
            onClick={() => setActiveTab("client")}
          >
            Avoir client
          </button>
          <button
            className={activeTab === "fournisseur" ? "primary-button" : "ghost-button"}
            type="button"
            onClick={() => setActiveTab("fournisseur")}
          >
            Avoir fournisseur
          </button>
        </div>
      </SectionCard>

      {notice.message ? (
        <div className={`inline-notice ${notice.type}`}>{notice.message}</div>
      ) : null}

      {activeTab === "client" ? (
        <>
          {isEditorOpen ? (
            <SectionCard
              title="Bon d'avoir"
              description="Informations client en haut, lignes produits au centre et total general en bas."
            >
              <form className="purchase-voucher" id="avoir-form" onSubmit={handleCreateAvoir}>
                {avoirEditorError ? (
                  <div className="inline-notice error">{avoirEditorError}</div>
                ) : null}

                <div className="purchase-voucher-header">
                  <div>
                    <p className="purchase-voucher-eyebrow">Nouvel avoir</p>
                    <h3 className="purchase-voucher-title">Bon d'avoir client</h3>
                  </div>
                  <div className="purchase-voucher-number">
                    <span>Numero avoir</span>
                    <strong>{avoirFormData.numeroAvoir}</strong>
                  </div>
                </div>

                <div className="purchase-voucher-grid">
                  <div className="field-group">
                    <label className="field-label" htmlFor="avoir-client">
                      Client
                    </label>
                    <select
                      id="avoir-client"
                      className="text-input select-input"
                      name="compteClientId"
                      value={avoirFormData.compteClientId}
                      onChange={handleTopLevelChange}
                    >
                      <option value="">Selectionner un client</option>
                      {clients.map((client) => (
                        <option key={client.id} value={client.id}>
                          {client.accountNumber ? `${client.accountNumber} - ` : ""}
                          {client.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="field-group">
                    <label className="field-label" htmlFor="avoir-date">
                      Date avoir
                    </label>
                    <input
                      id="avoir-date"
                      className="text-input"
                      type="date"
                      name="dateAvoir"
                      value={avoirFormData.dateAvoir}
                      onChange={handleTopLevelChange}
                    />
                  </div>

                  <div className="field-group">
                    <label className="field-label" htmlFor="avoir-store">
                      Point de vente
                    </label>
                    <select
                      id="avoir-store"
                      className="text-input select-input"
                      name="pointDeVenteId"
                      value={avoirFormData.pointDeVenteId}
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

                  <div className="field-group purchase-voucher-grid-span">
                    <label className="field-label" htmlFor="avoir-motif">
                      Motif
                    </label>
                    <input
                      id="avoir-motif"
                      className="text-input"
                      type="text"
                      name="motif"
                      placeholder="Produit non aime, produit defectueux, erreur achat..."
                      value={avoirFormData.motif}
                      onChange={handleTopLevelChange}
                    />
                  </div>
                </div>

                <div className="purchase-voucher-table-wrap">
                  <div className="purchase-voucher-table-toolbar">
                    <div>
                      <p className="section-card-title">Produits retournes</p>
                      <p className="section-card-description">
                        Recherchez un produit par code ou designation puis ajustez la quantite et le prix unitaire.
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
                          <th>Quantite retournee</th>
                          <th>Prix unitaire</th>
                          <th>Total ligne</th>
                          <th>Action supprimer</th>
                        </tr>
                      </thead>
                      <tbody>
                        {avoirFormData.lignes.map((line) => {
                          const computedLine =
                            computedLines.find((entry) => entry.rowId === line.rowId) || {
                              lineTotal: 0,
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
                                  list="avoir-products-list"
                                  value={line.productLookup}
                                  onChange={(event) =>
                                    handleLineChange(
                                      line.rowId,
                                      "productLookup",
                                      event.target.value
                                    )
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
                                  value={line.prixUnitaire}
                                  onChange={(event) =>
                                    handleLineChange(
                                      line.rowId,
                                      "prixUnitaire",
                                      event.target.value
                                    )
                                  }
                                />
                              </td>
                              <td>
                                <div className="purchase-voucher-cell-total">
                                  {formatCurrencyDh(computedLine.lineTotal)}
                                </div>
                              </td>
                              <td>
                                <button
                                  className="table-action-button danger"
                                  type="button"
                                  onClick={() => handleRemoveLine(line.rowId)}
                                  disabled={avoirFormData.lignes.length === 1}
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
                    <button className="primary-button" type="submit" disabled={isSubmittingAvoir}>
                      {isSubmittingAvoir ? "Enregistrement..." : "Enregistrer"}
                    </button>
                    <button
                      className="ghost-button"
                      type="button"
                      onClick={closeAvoirEditor}
                      disabled={isSubmittingAvoir}
                    >
                      Annuler
                    </button>
                    <button className="secondary-button" type="button" onClick={handlePrintDraft}>
                      Imprimer
                    </button>
                  </div>

                  <div className="purchase-voucher-totals">
                    <div className="purchase-voucher-total-row grand">
                      <span>Total avoir</span>
                      <strong>{formatCurrencyDh(totalAvoir)}</strong>
                    </div>
                  </div>
                </div>
              </form>

              <datalist id="avoir-products-list">
                {productLookupOptions.map((product) => (
                  <option key={product.id} value={product.label} />
                ))}
              </datalist>
            </SectionCard>
          ) : null}

          <SectionCard
            title="Liste des avoirs clients"
            description="Recherchez un avoir par numero ou client, puis filtrez par statut et par date."
          >
            {errorMessage ? <div className="inline-notice warning">{errorMessage}</div> : null}

            <div className="form-grid" style={{ marginBottom: "18px" }}>
              <div className="field-group">
                <label className="field-label" htmlFor="avoir-search">
                  Recherche
                </label>
                <input
                  id="avoir-search"
                  className="text-input"
                  type="search"
                  placeholder="Numero avoir ou client"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                />
              </div>

              <div className="field-group">
                <label className="field-label" htmlFor="avoir-status-filter">
                  Statut
                </label>
                <select
                  id="avoir-status-filter"
                  className="text-input select-input"
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value)}
                >
                  <option value="ALL">Tous</option>
                  <option value="ENREGISTRE">Enregistre</option>
                  <option value="REMBOURSE">Rembourse</option>
                  <option value="ANNULE">Annule</option>
                </select>
              </div>

              <div className="field-group">
                <label className="field-label" htmlFor="avoir-date-filter">
                  Date
                </label>
                <input
                  id="avoir-date-filter"
                  className="text-input"
                  type="date"
                  value={dateFilter}
                  onChange={(event) => setDateFilter(event.target.value)}
                />
              </div>
            </div>

            <DataTable
              columns={[
                { key: "creditNumber", label: "Numero avoir" },
                { key: "client", label: "Client" },
                { key: "date", label: "Date" },
                { key: "store", label: "Point de vente" },
                { key: "total", label: "Total" },
                { key: "status", label: "Statut" },
                { key: "actions", label: "Actions" },
              ]}
              data={filteredAvoirs}
              emptyTitle={isLoading ? "Chargement des avoirs..." : "Aucun avoir enregistre"}
              emptyDescription={
                isLoading
                  ? "Recuperation des avoirs en cours."
                  : "Creez un nouvel avoir client pour commencer le suivi."
              }
              renderRow={(avoir) => (
                <tr key={avoir.id}>
                  <td>
                    <strong>{avoir.creditNumber}</strong>
                  </td>
                  <td>
                    {avoir.clientAccountNumber ? `${avoir.clientAccountNumber} - ` : ""}
                    {avoir.clientName}
                  </td>
                  <td>{formatDateValue(avoir.dateAvoir)}</td>
                  <td>{avoir.storeName}</td>
                  <td>{formatCurrencyDh(avoir.total)}</td>
                  <td>
                    <Badge tone={getClientStatusTone(avoir.status)}>{avoir.status}</Badge>
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                      <button
                        className="table-action-button"
                        type="button"
                        onClick={() => setSelectedAvoir(avoir)}
                      >
                        Voir
                      </button>
                      {avoir.status !== "ANNULE" ? (
                        <button
                          className="table-action-button danger"
                          type="button"
                          onClick={() => handleCancelAvoir(avoir.id)}
                          disabled={isCancellingId === avoir.id}
                        >
                          {isCancellingId === avoir.id ? "Annulation..." : "Annuler"}
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              )}
            />
          </SectionCard>
        </>
      ) : (
        <>
          {isSupplierEditorOpen ? (
            <SectionCard
              title="Bon d'avoir fournisseur"
              description="Retour fournisseur en brouillon, avec validation ulterieure pour decrementer le stock."
            >
              <form
                className="purchase-voucher"
                id="supplier-avoir-form"
                onSubmit={handleCreateSupplierAvoir}
              >
                {supplierAvoirEditorError ? (
                  <div className="inline-notice error">{supplierAvoirEditorError}</div>
                ) : null}

                <div className="purchase-voucher-header">
                  <div>
                    <p className="purchase-voucher-eyebrow">Nouvel avoir fournisseur</p>
                    <h3 className="purchase-voucher-title">Bon de retour fournisseur</h3>
                  </div>
                  <div className="purchase-voucher-number">
                    <span>Numero avoir fournisseur</span>
                    <strong>{supplierAvoirFormData.numero}</strong>
                  </div>
                </div>

                <div className="purchase-voucher-grid">
                  <div className="field-group">
                    <label className="field-label" htmlFor="supplier-avoir-supplier">
                      Fournisseur
                    </label>
                    <select
                      id="supplier-avoir-supplier"
                      className="text-input select-input"
                      name="compteFournisseurId"
                      value={supplierAvoirFormData.compteFournisseurId}
                      onChange={handleSupplierTopLevelChange}
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
                    <label className="field-label" htmlFor="supplier-avoir-date">
                      Date
                    </label>
                    <input
                      id="supplier-avoir-date"
                      className="text-input"
                      type="date"
                      name="date"
                      value={supplierAvoirFormData.date}
                      onChange={handleSupplierTopLevelChange}
                    />
                  </div>

                  <div className="field-group">
                    <label className="field-label" htmlFor="supplier-avoir-store">
                      Point de vente
                    </label>
                    <select
                      id="supplier-avoir-store"
                      className="text-input select-input"
                      name="pointDeVenteId"
                      value={supplierAvoirFormData.pointDeVenteId}
                      onChange={handleSupplierTopLevelChange}
                    >
                      <option value="">Selectionner un point de vente</option>
                      {stores.map((store) => (
                        <option key={store.id} value={store.id}>
                          {store.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="field-group">
                    <label className="field-label" htmlFor="supplier-avoir-purchase">
                      Achat concerne
                    </label>
                    <select
                      id="supplier-avoir-purchase"
                      className="text-input select-input"
                      name="achatId"
                      value={supplierAvoirFormData.achatId}
                      onChange={handleSupplierTopLevelChange}
                    >
                      <option value="">Aucun achat de reference</option>
                      {filteredPurchaseOptions.map((purchase) => (
                        <option key={purchase.id} value={purchase.id}>
                          {purchase.purchaseNumber}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="field-group">
                    <label className="field-label" htmlFor="supplier-avoir-mode">
                      Mode de compensation
                    </label>
                    <select
                      id="supplier-avoir-mode"
                      className="text-input select-input"
                      name="compensationMode"
                      value={supplierAvoirFormData.compensationMode}
                      onChange={handleSupplierTopLevelChange}
                    >
                      <option value="REMBOURSEMENT">Remboursement</option>
                      <option value="AVOIR_PROCHAINE_FACTURE">
                        Avoir sur prochaine facture
                      </option>
                      <option value="REMPLACEMENT_PRODUIT">Remplacement produit</option>
                    </select>
                  </div>

                  <div className="field-group">
                    <label className="field-label" htmlFor="supplier-avoir-motif">
                      Motif du retour
                    </label>
                    <input
                      id="supplier-avoir-motif"
                      className="text-input"
                      type="text"
                      name="motif"
                      placeholder="Produit defectueux, erreur livraison..."
                      value={supplierAvoirFormData.motif}
                      onChange={handleSupplierTopLevelChange}
                    />
                  </div>

                  <div className="field-group purchase-voucher-grid-span">
                    <label className="field-label" htmlFor="supplier-avoir-comment">
                      Commentaire
                    </label>
                    <input
                      id="supplier-avoir-comment"
                      className="text-input"
                      type="text"
                      name="commentaire"
                      placeholder="Observations complementaires"
                      value={supplierAvoirFormData.commentaire}
                      onChange={handleSupplierTopLevelChange}
                    />
                  </div>
                </div>

                <div className="purchase-voucher-table-wrap">
                  <div className="purchase-voucher-table-toolbar">
                    <div>
                      <p className="section-card-title">Produits retournes au fournisseur</p>
                      <p className="section-card-description">
                        Selectionnez les produits concernes, ajustez la quantite et le prix d'achat, puis validez ensuite pour decrementar le stock.
                      </p>
                    </div>
                    <button
                      className="ghost-button"
                      type="button"
                      onClick={handleAddSupplierLine}
                    >
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
                          <th>Quantite retournee</th>
                          <th>Prix d'achat</th>
                          <th>Total ligne</th>
                          <th>Action supprimer</th>
                        </tr>
                      </thead>
                      <tbody>
                        {supplierAvoirFormData.lignes.map((line) => {
                          const computedLine =
                            computedSupplierLines.find((entry) => entry.rowId === line.rowId) || {
                              lineTotal: 0,
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
                                  list="supplier-avoir-products-list"
                                  value={line.productLookup}
                                  onChange={(event) =>
                                    handleSupplierLineChange(
                                      line.rowId,
                                      "productLookup",
                                      event.target.value
                                    )
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
                                    handleSupplierLineChange(
                                      line.rowId,
                                      "quantity",
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
                                  value={line.prixAchat}
                                  onChange={(event) =>
                                    handleSupplierLineChange(
                                      line.rowId,
                                      "prixAchat",
                                      event.target.value
                                    )
                                  }
                                />
                              </td>
                              <td>
                                <div className="purchase-voucher-cell-total">
                                  {formatCurrencyDh(computedLine.lineTotal)}
                                </div>
                              </td>
                              <td>
                                <button
                                  className="table-action-button danger"
                                  type="button"
                                  onClick={() => handleRemoveSupplierLine(line.rowId)}
                                  disabled={supplierAvoirFormData.lignes.length === 1}
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
                      disabled={isSubmittingSupplierAvoir}
                    >
                      {isSubmittingSupplierAvoir ? "Enregistrement..." : "Enregistrer"}
                    </button>
                    <button
                      className="ghost-button"
                      type="button"
                      onClick={closeSupplierAvoirEditor}
                      disabled={isSubmittingSupplierAvoir}
                    >
                      Annuler
                    </button>
                    <button className="secondary-button" type="button" onClick={handlePrintDraft}>
                      Imprimer
                    </button>
                  </div>

                  <div className="purchase-voucher-totals">
                    <div className="purchase-voucher-total-row grand">
                      <span>Total avoir fournisseur</span>
                      <strong>{formatCurrencyDh(totalSupplierAvoir)}</strong>
                    </div>
                  </div>
                </div>
              </form>

              <datalist id="supplier-avoir-products-list">
                {productLookupOptions.map((product) => (
                  <option key={product.id} value={product.label} />
                ))}
              </datalist>
            </SectionCard>
          ) : null}

          <SectionCard
            title="Liste des avoirs fournisseurs"
            description="Suivez les brouillons, validations, remboursements et annulations des retours fournisseurs."
          >
            {errorMessage ? <div className="inline-notice warning">{errorMessage}</div> : null}

            <div className="form-grid" style={{ marginBottom: "18px" }}>
              <div className="field-group">
                <label className="field-label" htmlFor="supplier-avoir-search">
                  Recherche
                </label>
                <input
                  id="supplier-avoir-search"
                  className="text-input"
                  type="search"
                  placeholder="Numero avoir ou fournisseur"
                  value={supplierSearchTerm}
                  onChange={(event) => setSupplierSearchTerm(event.target.value)}
                />
              </div>

              <div className="field-group">
                <label className="field-label" htmlFor="supplier-avoir-status-filter">
                  Statut
                </label>
                <select
                  id="supplier-avoir-status-filter"
                  className="text-input select-input"
                  value={supplierStatusFilter}
                  onChange={(event) => setSupplierStatusFilter(event.target.value)}
                >
                  <option value="ALL">Tous</option>
                  <option value="BROUILLON">Brouillon</option>
                  <option value="VALIDE">Valide</option>
                  <option value="REMBOURSE">Rembourse</option>
                  <option value="ANNULE">Annule</option>
                </select>
              </div>

              <div className="field-group">
                <label className="field-label" htmlFor="supplier-avoir-date-filter">
                  Date
                </label>
                <input
                  id="supplier-avoir-date-filter"
                  className="text-input"
                  type="date"
                  value={supplierDateFilter}
                  onChange={(event) => setSupplierDateFilter(event.target.value)}
                />
              </div>
            </div>

            <DataTable
              columns={[
                { key: "number", label: "Numero avoir fournisseur" },
                { key: "date", label: "Date" },
                { key: "supplier", label: "Fournisseur" },
                { key: "products", label: "Produits retournes" },
                { key: "quantity", label: "Quantite" },
                { key: "total", label: "Montant total" },
                { key: "status", label: "Statut" },
                { key: "actions", label: "Actions" },
              ]}
              data={filteredSupplierAvoirs}
              emptyTitle={
                isLoading
                  ? "Chargement des avoirs fournisseurs..."
                  : "Aucun avoir fournisseur enregistre"
              }
              emptyDescription={
                isLoading
                  ? "Recuperation des avoirs fournisseurs en cours."
                  : "Creez un nouvel avoir fournisseur pour commencer le suivi."
              }
              renderRow={(avoir) => (
                <tr key={avoir.id}>
                  <td>
                    <strong>{avoir.number}</strong>
                  </td>
                  <td>{formatDateValue(avoir.date)}</td>
                  <td>
                    {avoir.supplierAccountNumber ? `${avoir.supplierAccountNumber} - ` : ""}
                    {avoir.supplierName}
                  </td>
                  <td>{getSupplierProductsSummary(avoir) || "-"}</td>
                  <td>{getSupplierQuantitySummary(avoir)}</td>
                  <td>{formatCurrencyDh(avoir.total)}</td>
                  <td>
                    <Badge tone={getSupplierStatusTone(avoir.status)}>{avoir.status}</Badge>
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                      <button
                        className="table-action-button"
                        type="button"
                        onClick={() => setSelectedSupplierAvoir(avoir)}
                      >
                        Voir detail
                      </button>
                      {avoir.status === "BROUILLON" ? (
                        <button
                          className="table-action-button"
                          type="button"
                          onClick={() => handleValidateSupplierAvoir(avoir.id)}
                          disabled={isUpdatingSupplierId === avoir.id}
                        >
                          {isUpdatingSupplierId === avoir.id ? "Validation..." : "Valider"}
                        </button>
                      ) : null}
                      {avoir.status !== "ANNULE" && avoir.status !== "REMBOURSE" ? (
                        <button
                          className="table-action-button danger"
                          type="button"
                          onClick={() => handleCancelSupplierAvoir(avoir.id)}
                          disabled={isUpdatingSupplierId === avoir.id}
                        >
                          {isUpdatingSupplierId === avoir.id ? "Traitement..." : "Annuler"}
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              )}
            />
          </SectionCard>
        </>
      )}

      <Modal
        isOpen={Boolean(selectedAvoir)}
        eyebrow="Details avoir"
        title={selectedAvoir?.creditNumber || "Avoir"}
        description="Consultez les produits retournes, le client concerne et le total de l'avoir."
        onClose={() => setSelectedAvoir(null)}
        actions={
          <button className="ghost-button" type="button" onClick={() => setSelectedAvoir(null)}>
            Fermer
          </button>
        }
      >
        {selectedAvoir ? (
          <div style={{ display: "grid", gap: "16px" }}>
            <div className="form-grid">
              <div className="detail-stat">
                <span>Client</span>
                <strong>{selectedAvoir.clientName}</strong>
              </div>
              <div className="detail-stat">
                <span>Point de vente</span>
                <strong>{selectedAvoir.storeName}</strong>
              </div>
              <div className="detail-stat">
                <span>Motif</span>
                <strong>{selectedAvoir.motif || "-"}</strong>
              </div>
              <div className="detail-stat">
                <span>Statut</span>
                <strong>{selectedAvoir.status}</strong>
              </div>
            </div>

            <DataTable
              columns={[
                { key: "product", label: "Produit" },
                { key: "quantity", label: "Quantite" },
                { key: "unitPrice", label: "Prix unitaire" },
                { key: "lineTotal", label: "Total ligne" },
              ]}
              data={selectedAvoir.lignes}
              emptyTitle="Aucune ligne"
              emptyDescription="Cet avoir ne contient aucune ligne produit."
              renderRow={(line) => (
                <tr key={line.id}>
                  <td>{line.productName}</td>
                  <td>{line.quantity}</td>
                  <td>{formatCurrencyDh(line.unitPrice)}</td>
                  <td>{formatCurrencyDh(line.lineTotal)}</td>
                </tr>
              )}
            />
          </div>
        ) : null}
      </Modal>

      <Modal
        isOpen={Boolean(selectedSupplierAvoir)}
        eyebrow="Details avoir fournisseur"
        title={selectedSupplierAvoir?.number || "Avoir fournisseur"}
        description="Consultez les produits retournes au fournisseur, le mode de compensation et le total."
        onClose={() => setSelectedSupplierAvoir(null)}
        actions={
          <button
            className="ghost-button"
            type="button"
            onClick={() => setSelectedSupplierAvoir(null)}
          >
            Fermer
          </button>
        }
      >
        {selectedSupplierAvoir ? (
          <div style={{ display: "grid", gap: "16px" }}>
            <div className="form-grid">
              <div className="detail-stat">
                <span>Fournisseur</span>
                <strong>{selectedSupplierAvoir.supplierName}</strong>
              </div>
              <div className="detail-stat">
                <span>Point de vente</span>
                <strong>{selectedSupplierAvoir.storeName}</strong>
              </div>
              <div className="detail-stat">
                <span>Achat concerne</span>
                <strong>{selectedSupplierAvoir.purchaseNumber || "-"}</strong>
              </div>
              <div className="detail-stat">
                <span>Mode de compensation</span>
                <strong>{selectedSupplierAvoir.compensationMode}</strong>
              </div>
              <div className="detail-stat">
                <span>Motif</span>
                <strong>{selectedSupplierAvoir.motif || "-"}</strong>
              </div>
              <div className="detail-stat">
                <span>Statut</span>
                <strong>{selectedSupplierAvoir.status}</strong>
              </div>
            </div>

            <DataTable
              columns={[
                { key: "product", label: "Produit" },
                { key: "quantity", label: "Quantite" },
                { key: "purchasePrice", label: "Prix achat" },
                { key: "lineTotal", label: "Total ligne" },
              ]}
              data={selectedSupplierAvoir.lignes}
              emptyTitle="Aucune ligne"
              emptyDescription="Cet avoir fournisseur ne contient aucune ligne produit."
              renderRow={(line) => (
                <tr key={line.id}>
                  <td>{line.productName}</td>
                  <td>{line.quantity}</td>
                  <td>{formatCurrencyDh(line.purchasePrice)}</td>
                  <td>{formatCurrencyDh(line.lineTotal)}</td>
                </tr>
              )}
            />
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

export default AvoirsPage;
