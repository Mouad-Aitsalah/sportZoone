import axios from "axios";
import { getAuthToken, logout } from "../store/authStore";

const API_BASE_URL = process.env.REACT_APP_API_URL || "http://localhost:5000/api";

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

const SUPPLIER_WRITE_BASE_URL =
  API_BASE_URL.replace(/\/api\/?$/, "/suppliers") || "http://localhost:5000/suppliers";

api.interceptors.request.use(
  (config) => {
    const token = getAuthToken();

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      logout();

      if (
        typeof window !== "undefined" &&
        window.location.pathname !== "/"
      ) {
        window.location.assign("/");
      }
    }

    return Promise.reject(error);
  }
);

api.getPurchases = (config = {}) => api.get("/purchases", config);
api.getPurchaseById = (id, config = {}) => api.get(`/purchases/${id}`, config);
api.createPurchase = (payload, config = {}) => api.post("/purchases", payload, config);
api.updatePurchase = (id, payload, config = {}) =>
  api.put(`/purchases/${id}`, payload, config);
api.deletePurchase = (id, config = {}) => api.delete(`/purchases/${id}`, config);
api.createRefund = (payload, config = {}) => api.post("/refunds", payload, config);
api.getAvoirs = (config = {}) => api.get("/avoirs", config);
api.getAvoirById = (id, config = {}) => api.get(`/avoirs/${id}`, config);
api.createAvoir = (payload, config = {}) => api.post("/avoirs", payload, config);
api.updateAvoir = (id, payload, config = {}) => api.put(`/avoirs/${id}`, payload, config);
api.deleteAvoir = (id, config = {}) => api.delete(`/avoirs/${id}`, config);
api.getSupplierAvoirs = (config = {}) => api.get("/avoirs/fournisseurs", config);
api.getSupplierAvoirById = (id, config = {}) =>
  api.get(`/avoirs/fournisseurs/${id}`, config);
api.createSupplierAvoir = (payload, config = {}) =>
  api.post("/avoirs/fournisseurs", payload, config);
api.validateSupplierAvoir = (id, config = {}) =>
  api.patch(`/avoirs/fournisseurs/${id}/valider`, {}, config);
api.cancelSupplierAvoir = (id, config = {}) =>
  api.patch(`/avoirs/fournisseurs/${id}/annuler`, {}, config);
api.getCurrentCashSession = (config = {}) => api.get("/cash-sessions/current", config);
api.getCashSessions = (config = {}) => api.get("/cash-sessions", config);
api.getCashSessionById = (id, config = {}) => api.get(`/cash-sessions/${id}`, config);
api.closeCurrentCashSession = (config = {}) =>
  api.patch("/cash-sessions/current/close", {}, config);
api.closeCashSession = (id, config = {}) => api.post(`/cash-sessions/${id}/close`, {}, config);
api.getProductCategories = (config = {}) => api.get("/product-categories", config);
api.createProductCategory = (payload, config = {}) =>
  api.post("/product-categories", payload, config);
api.updateProductCategory = (id, payload, config = {}) =>
  api.put(`/product-categories/${id}`, payload, config);
api.deleteProductCategory = (id, config = {}) =>
  api.delete(`/product-categories/${id}`, config);
api.getSuppliers = (config = {}) => api.get("/suppliers", config);
api.getCustomers = (config = {}) => api.get("/customers", config);
api.createCustomer = (payload, config = {}) => api.post("/customers", payload, config);
api.getSupplierById = (id, config = {}) => api.get(`${SUPPLIER_WRITE_BASE_URL}/${id}`, config);
api.createSupplier = (payload, config = {}) =>
  api.post(SUPPLIER_WRITE_BASE_URL, payload, config);
api.updateSupplier = (id, payload, config = {}) =>
  api.put(`${SUPPLIER_WRITE_BASE_URL}/${id}`, payload, config);
api.deleteSupplier = (id, config = {}) =>
  api.delete(`${SUPPLIER_WRITE_BASE_URL}/${id}`, config);
api.getProducts = (config = {}) => api.get("/products", config);
api.getProductSales = (id, config = {}) => api.get(`/products/${id}/sales`, config);
api.getStores = (config = {}) => api.get("/stores", config);
api.getComptes = (config = {}) => api.get("/comptes", config);
api.getCustomerAccounts = (config = {}) =>
  api.get("/comptes", {
    ...config,
    params: {
      ...(config.params || {}),
      type: "CLIENT",
    },
  });
api.getSupplierAccounts = (config = {}) =>
  api.get("/comptes", {
    ...config,
    params: {
      ...(config.params || {}),
      type: "FOURNISSEUR",
    },
  });
api.importProducts = (file, config = {}) => {
  const formData = new FormData();
  formData.append("file", file);

  return api.post("/products/import", formData, {
    ...config,
    headers: {
      ...(config.headers || {}),
      "Content-Type": "multipart/form-data",
    },
  });
};
api.exportProductBarcodesPdf = (payload, config = {}) =>
  api.post("/exports/products/barcodes/pdf", payload, config);
api.getCompteById = (id, config = {}) => api.get(`/comptes/${id}`, config);
api.getCompteOpenInvoices = (id, config = {}) => api.get(`/comptes/${id}/open-invoices`, config);
api.createCompte = (payload, config = {}) => api.post("/comptes", payload, config);
api.updateCompte = (id, payload, config = {}) => api.put(`/comptes/${id}`, payload, config);
api.deleteCompte = (id, config = {}) => api.delete(`/comptes/${id}`, config);

export default api;
