import { useEffect, useMemo, useState } from "react";
import Badge from "../components/Badge";
import DataTable from "../components/DataTable";
import Modal from "../components/Modal";
import PageHeader from "../components/PageHeader";
import SearchInput from "../components/SearchInput";
import SectionCard from "../components/SectionCard";
import api from "../services/api";
import { getCurrentUser } from "../store/authStore";
import { formatCurrencyDh, formatDateTime } from "../utils/formatters";

const ACCOUNT_TABS = {
  CLIENTS: "clients",
  SUPPLIERS: "suppliers",
};

const createInitialClientFormData = (compte = null) => ({
  numeroCompte: compte?.numeroCompte || "",
  type: "CLIENT",
  nom: compte?.nom || "",
  telephone: compte?.telephone || "",
  email: compte?.email || "",
  adresse: compte?.adresse || "",
  actif: compte?.actif ?? true,
});

const createInitialSupplierFormData = (supplier = null) => ({
  nom: supplier?.name || "",
  telephone: supplier?.phone || "",
  email: supplier?.email || "",
  adresse: supplier?.address || "",
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

const normalizeCustomerCompte = (compte) => ({
  id: compte.id,
  numeroCompte: compte.numeroCompte || compte.accountNumber || "",
  nom: compte.nom || compte.name || "",
  telephone: compte.telephone || compte.phone || "",
  email: compte.email || "",
  adresse: compte.adresse || compte.address || "",
  actif: compte.actif ?? compte.active ?? true,
  customerNumber: compte.customerNumber || null,
});

const normalizeSupplier = (supplier) => ({
  id: supplier.id,
  numeroCompte: supplier.numeroCompte || supplier.accountNumber || "",
  nom: supplier.nom || supplier.name || "",
  telephone: supplier.telephone || supplier.phone || "",
  email: supplier.email || "",
  adresse: supplier.adresse || supplier.address || "",
  actif: supplier.actif ?? supplier.active ?? true,
  productsCount: supplier.productsCount || 0,
  purchasesCount: supplier.purchasesCount || 0,
  legacySupplierId: supplier.legacySupplierId || null,
});

const getInvoiceTypeMeta = (invoice) => {
  if (invoice?.paymentStatus === "CREDIT" || invoice?.type === "credit") {
    return {
      label: "Credit",
      tone: "warning",
    };
  }

  return {
    label: "Paiement partiel",
    tone: "info",
  };
};

const getInvoiceStatusMeta = (invoice) => {
  if (Number(invoice?.remainingAmount || 0) <= 0 || invoice?.paymentStatus === "PAID") {
    return {
      label: "Paye",
      tone: "success",
    };
  }

  if (invoice?.paymentStatus === "CREDIT") {
    return {
      label: "Credit",
      tone: "warning",
    };
  }

  return {
    label: "Partiellement paye",
    tone: "warning",
  };
};

function ComptesPage() {
  const [activeTab, setActiveTab] = useState(ACCOUNT_TABS.CLIENTS);
  const [searchTerm, setSearchTerm] = useState("");
  const [clientAccounts, setClientAccounts] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [isLoadingClients, setIsLoadingClients] = useState(true);
  const [isLoadingSuppliers, setIsLoadingSuppliers] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [notice, setNotice] = useState({ type: "", message: "" });

  const [clientModal, setClientModal] = useState({
    isOpen: false,
    mode: "add",
    compte: null,
  });
  const [clientFormData, setClientFormData] = useState(createInitialClientFormData);
  const [clientFormError, setClientFormError] = useState("");
  const [isSubmittingClient, setIsSubmittingClient] = useState(false);

  const [supplierModal, setSupplierModal] = useState({
    isOpen: false,
    mode: "add",
    supplier: null,
  });
  const [supplierFormData, setSupplierFormData] = useState(createInitialSupplierFormData);
  const [supplierFormError, setSupplierFormError] = useState("");
  const [isSubmittingSupplier, setIsSubmittingSupplier] = useState(false);

  const [deleteModal, setDeleteModal] = useState({
    isOpen: false,
    type: ACCOUNT_TABS.CLIENTS,
    item: null,
  });
  const [deleteError, setDeleteError] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  const [clientAccountModal, setClientAccountModal] = useState({
    isOpen: false,
    compte: null,
    customer: null,
    invoices: [],
  });
  const [isLoadingClientAccount, setIsLoadingClientAccount] = useState(false);
  const [clientAccountError, setClientAccountError] = useState("");

  const [supplierAccountModal, setSupplierAccountModal] = useState({
    isOpen: false,
    supplier: null,
  });

  const [clientPaymentModal, setClientPaymentModal] = useState({
    isOpen: false,
    invoice: null,
  });
  const [clientPaymentAmount, setClientPaymentAmount] = useState("");
  const [clientPaymentMethod, setClientPaymentMethod] = useState("cash");
  const [clientPaymentError, setClientPaymentError] = useState("");
  const [isSubmittingClientPayment, setIsSubmittingClientPayment] = useState(false);

  const currentUser = getCurrentUser();
  const canManageComptes = currentUser?.role === "admin";
  const canAddClients = ["admin", "employe"].includes(currentUser?.role || "");

  const fetchClientAccounts = async () => {
    const response = await api.getCustomerAccounts();
    const comptesList = getCollection(response.data, ["data", "comptes"]).map(
      normalizeCustomerCompte
    );
    setClientAccounts(comptesList);
    return comptesList;
  };

  const fetchSuppliers = async () => {
    const response = await api.getSuppliers();
    const suppliersList = getCollection(response.data, ["data", "suppliers"]).map(
      normalizeSupplier
    );
    setSuppliers(suppliersList);
    return suppliersList;
  };

  useEffect(() => {
    let isMounted = true;

    async function loadPageData() {
      try {
        setErrorMessage("");
        setIsLoadingClients(true);
        setIsLoadingSuppliers(true);

        const [clientsResult, suppliersResult] = await Promise.allSettled([
          api.getCustomerAccounts(),
          api.getSuppliers(),
        ]);

        if (clientsResult.status === "fulfilled" && isMounted) {
          setClientAccounts(
            getCollection(clientsResult.value.data, ["data", "comptes"]).map(
              normalizeCustomerCompte
            )
          );
        }

        if (suppliersResult.status === "fulfilled" && isMounted) {
          setSuppliers(
            getCollection(suppliersResult.value.data, ["data", "suppliers"]).map(
              normalizeSupplier
            )
          );
        }

        if (
          clientsResult.status === "rejected" &&
          suppliersResult.status === "rejected" &&
          isMounted
        ) {
          setErrorMessage(
            clientsResult.reason?.response?.data?.message ||
              suppliersResult.reason?.response?.data?.message ||
              "Impossible de charger les comptes pour le moment."
          );
        }
      } finally {
        if (isMounted) {
          setIsLoadingClients(false);
          setIsLoadingSuppliers(false);
        }
      }
    }

    loadPageData();

    return () => {
      isMounted = false;
    };
  }, []);

  const filteredClientAccounts = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    if (!query) {
      return clientAccounts;
    }

    return clientAccounts.filter((compte) =>
      [
        compte.numeroCompte,
        compte.nom,
        compte.telephone,
        compte.email,
        compte.adresse,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query))
    );
  }, [clientAccounts, searchTerm]);

  const filteredSuppliers = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    if (!query) {
      return suppliers;
    }

    return suppliers.filter((supplier) =>
      [
        supplier.numeroCompte,
        supplier.nom,
        supplier.telephone,
        supplier.email,
        supplier.adresse,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query))
    );
  }, [suppliers, searchTerm]);

  const resetClientModal = () => {
    setClientModal({
      isOpen: false,
      mode: "add",
      compte: null,
    });
    setClientFormData(createInitialClientFormData());
    setClientFormError("");
  };

  const openClientModal = (mode, compte = null) => {
    setNotice({ type: "", message: "" });
    setClientFormError("");
    setClientFormData(createInitialClientFormData(compte));
    setClientModal({
      isOpen: true,
      mode,
      compte,
    });
  };

  const closeClientModal = () => {
    if (isSubmittingClient) {
      return;
    }

    resetClientModal();
  };

  const resetSupplierModal = () => {
    setSupplierModal({
      isOpen: false,
      mode: "add",
      supplier: null,
    });
    setSupplierFormData(createInitialSupplierFormData());
    setSupplierFormError("");
  };

  const openSupplierModal = (mode, supplier = null) => {
    setNotice({ type: "", message: "" });
    setSupplierFormError("");
    setSupplierFormData(createInitialSupplierFormData(supplier));
    setSupplierModal({
      isOpen: true,
      mode,
      supplier,
    });
  };

  const closeSupplierModal = () => {
    if (isSubmittingSupplier) {
      return;
    }

    resetSupplierModal();
  };

  const openDeleteModal = (type, item) => {
    setNotice({ type: "", message: "" });
    setDeleteError("");
    setDeleteModal({
      isOpen: true,
      type,
      item,
    });
  };

  const closeDeleteModal = () => {
    if (isDeleting) {
      return;
    }

    setDeleteModal({
      isOpen: false,
      type: ACCOUNT_TABS.CLIENTS,
      item: null,
    });
    setDeleteError("");
  };

  const loadClientAccount = async (compteId) => {
    const response = await api.getCompteOpenInvoices(compteId);
    return response.data?.data || { customer: null, invoices: [] };
  };

  const openClientAccountModal = async (compte) => {
    setNotice({ type: "", message: "" });
    setClientAccountError("");
    setClientAccountModal({
      isOpen: true,
      compte,
      customer: null,
      invoices: [],
    });

    try {
      setIsLoadingClientAccount(true);
      const data = await loadClientAccount(compte.id);
      setClientAccountModal({
        isOpen: true,
        compte,
        customer: data.customer,
        invoices: data.invoices || [],
      });
    } catch (error) {
      setClientAccountError(
        error.response?.data?.message ||
          "Impossible de charger le compte client pour le moment."
      );
    } finally {
      setIsLoadingClientAccount(false);
    }
  };

  const refreshClientAccountModal = async (compteId = clientAccountModal.compte?.id) => {
    if (!compteId) {
      return;
    }

    const data = await loadClientAccount(compteId);
    setClientAccountModal((current) => ({
      ...current,
      customer: data.customer,
      invoices: data.invoices || [],
    }));
  };

  const closeClientAccountModal = () => {
    if (isSubmittingClientPayment) {
      return;
    }

    setClientAccountModal({
      isOpen: false,
      compte: null,
      customer: null,
      invoices: [],
    });
    setClientAccountError("");
  };

  const openSupplierAccountModal = (supplier) => {
    setNotice({ type: "", message: "" });
    setSupplierAccountModal({
      isOpen: true,
      supplier,
    });
  };

  const closeSupplierAccountModal = () => {
    setSupplierAccountModal({
      isOpen: false,
      supplier: null,
    });
  };

  const openClientPaymentModal = (invoice) => {
    setClientPaymentError("");
    setClientPaymentModal({
      isOpen: true,
      invoice,
    });
    setClientPaymentAmount(String(Number(invoice?.remainingAmount || 0) || ""));
    setClientPaymentMethod("cash");
  };

  const closeClientPaymentModal = () => {
    if (isSubmittingClientPayment) {
      return;
    }

    setClientPaymentModal({
      isOpen: false,
      invoice: null,
    });
    setClientPaymentAmount("");
    setClientPaymentMethod("cash");
    setClientPaymentError("");
  };

  const handleClientFormChange = (event) => {
    const { name, value, type, checked } = event.target;

    setClientFormError("");
    setClientFormData((current) => ({
      ...current,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const handleSupplierFormChange = (event) => {
    const { name, value } = event.target;

    setSupplierFormError("");
    setSupplierFormData((current) => ({
      ...current,
      [name]: value,
    }));
  };

  const validateClientForm = () => {
    if (clientModal.mode === "edit" && !clientFormData.numeroCompte.trim()) {
      return "Le numero de compte est obligatoire.";
    }

    if (!clientFormData.nom.trim()) {
      return "Le nom est obligatoire.";
    }

    return "";
  };

  const validateSupplierForm = () => {
    if (!supplierFormData.nom.trim()) {
      return "Le nom du fournisseur est obligatoire.";
    }

    return "";
  };

  const handleSubmitClient = async (event) => {
    event.preventDefault();

    const validationMessage = validateClientForm();
    if (validationMessage) {
      setClientFormError(validationMessage);
      return;
    }

    const payload = {
      numeroCompte: clientFormData.numeroCompte.trim(),
      type: "CLIENT",
      nom: clientFormData.nom.trim(),
      telephone: clientFormData.telephone.trim(),
      email: clientFormData.email.trim(),
      adresse: clientFormData.adresse.trim(),
      actif: clientFormData.actif,
    };

    try {
      setIsSubmittingClient(true);
      setClientFormError("");

      if (clientModal.mode === "edit" && clientModal.compte?.id) {
        await api.updateCompte(clientModal.compte.id, payload);
      } else {
        await api.createCustomer({
          name: clientFormData.nom.trim(),
          phone: clientFormData.telephone.trim(),
          email: clientFormData.email.trim(),
          address: clientFormData.adresse.trim(),
        });
      }

      await fetchClientAccounts();
      closeClientModal();
      setNotice({
        type: "success",
        message:
          clientModal.mode === "edit"
            ? "Client modifie avec succes."
            : "Client ajoute avec succes.",
      });
    } catch (error) {
      setClientFormError(
        error.response?.data?.message ||
          "Impossible d'enregistrer ce client pour le moment."
      );
    } finally {
      setIsSubmittingClient(false);
    }
  };

  const handleSubmitSupplier = async (event) => {
    event.preventDefault();

    const validationMessage = validateSupplierForm();
    if (validationMessage) {
      setSupplierFormError(validationMessage);
      return;
    }

    const payload = {
      nom: supplierFormData.nom.trim(),
      telephone: supplierFormData.telephone.trim(),
      email: supplierFormData.email.trim(),
      adresse: supplierFormData.adresse.trim(),
    };

    try {
      setIsSubmittingSupplier(true);
      setSupplierFormError("");

      if (supplierModal.mode === "edit" && supplierModal.supplier?.id) {
        await api.updateSupplier(supplierModal.supplier.id, payload);
      } else {
        await api.createSupplier(payload);
      }

      await fetchSuppliers();
      closeSupplierModal();
      setNotice({
        type: "success",
        message:
          supplierModal.mode === "edit"
            ? "Fournisseur modifie avec succes."
            : "Fournisseur ajoute avec succes.",
      });
    } catch (error) {
      setSupplierFormError(
        error.response?.data?.message ||
          "Impossible d'enregistrer ce fournisseur pour le moment."
      );
    } finally {
      setIsSubmittingSupplier(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteModal.item?.id) {
      return;
    }

    try {
      setIsDeleting(true);
      setDeleteError("");

      if (deleteModal.type === ACCOUNT_TABS.SUPPLIERS) {
        await api.deleteSupplier(deleteModal.item.id);
        await fetchSuppliers();
      } else {
        await api.deleteCompte(deleteModal.item.id);
        await fetchClientAccounts();
      }

      closeDeleteModal();
      setNotice({
        type: "success",
        message:
          deleteModal.type === ACCOUNT_TABS.SUPPLIERS
            ? "Fournisseur supprime avec succes."
            : "Compte client supprime avec succes.",
      });
    } catch (error) {
      setDeleteError(
        error.response?.data?.message ||
          "Impossible de supprimer cet element pour le moment."
      );
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSubmitClientPayment = async (event) => {
    event.preventDefault();

    if (!clientPaymentModal.invoice?.id) {
      setClientPaymentError("Facture introuvable.");
      return;
    }

    if (clientPaymentAmount === "") {
      setClientPaymentError("Le montant recu est obligatoire.");
      return;
    }

    const amount = Number(clientPaymentAmount);
    const remainingAmount = Number(clientPaymentModal.invoice?.remainingAmount || 0);

    if (!Number.isFinite(amount) || amount <= 0) {
      setClientPaymentError("Le montant recu doit etre superieur a 0.");
      return;
    }

    if (amount > remainingAmount) {
      setClientPaymentError("Le montant recu ne peut pas depasser le reste a payer.");
      return;
    }

    if (!["cash", "card"].includes(clientPaymentMethod)) {
      setClientPaymentError("Le mode de paiement doit etre Especes ou Carte bancaire.");
      return;
    }

    try {
      setIsSubmittingClientPayment(true);
      setClientPaymentError("");

      await api.patch(`/sales/${clientPaymentModal.invoice.id}/payment`, {
        amount,
        paymentMethod: clientPaymentMethod,
      });

      await Promise.all([fetchClientAccounts(), refreshClientAccountModal()]);
      closeClientPaymentModal();
      setNotice({
        type: "success",
        message: "Paiement ajoute avec succes.",
      });

      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("sportzone:sales-updated"));
      }
    } catch (error) {
      setClientPaymentError(
        error.response?.data?.message ||
          "Impossible d'enregistrer ce paiement pour le moment."
      );
    } finally {
      setIsSubmittingClientPayment(false);
    }
  };

  const isClientsTab = activeTab === ACCOUNT_TABS.CLIENTS;
  const activeItems = isClientsTab ? filteredClientAccounts : filteredSuppliers;
  const isTabLoading = isClientsTab ? isLoadingClients : isLoadingSuppliers;

  return (
    <div>
      <PageHeader
        eyebrow="Comptes"
        title="Clients et fournisseurs"
        description="Gerer les clients et les fournisseurs SportZone depuis une seule page."
        actions={
          (isClientsTab ? canAddClients : canManageComptes) ? (
            <button
              className="primary-button"
              type="button"
              onClick={() =>
                isClientsTab
                  ? openClientModal("add")
                  : openSupplierModal("add")
              }
            >
              {isClientsTab ? "Ajouter client" : "Ajouter fournisseur"}
            </button>
          ) : null
        }
      />

      {notice.message ? (
        <div className={`inline-notice ${notice.type}`}>{notice.message}</div>
      ) : null}

      <div className="period-selector">
        <button
          className={`period-button ${isClientsTab ? "active" : ""}`}
          type="button"
          onClick={() => {
            setActiveTab(ACCOUNT_TABS.CLIENTS);
            setSearchTerm("");
          }}
        >
          Clients
        </button>
        <button
          className={`period-button ${!isClientsTab ? "active" : ""}`}
          type="button"
          onClick={() => {
            setActiveTab(ACCOUNT_TABS.SUPPLIERS);
            setSearchTerm("");
          }}
        >
          Fournisseurs
        </button>
      </div>

      <SectionCard
        title={isClientsTab ? "Liste des clients" : "Liste des fournisseurs"}
        description={
          isClientsTab
            ? "Rechercher un client par numero, nom ou coordonnees."
            : "Rechercher un fournisseur par numero, nom ou coordonnees."
        }
      >
        <div className="table-toolbar">
          <SearchInput
            value={searchTerm}
            onChange={setSearchTerm}
            placeholder={
              isClientsTab ? "Rechercher un client" : "Rechercher un fournisseur"
            }
          />
        </div>

        {errorMessage ? <div className="inline-notice error">{errorMessage}</div> : null}

        {isClientsTab ? (
          <DataTable
            columns={[
              { key: "numeroCompte", label: "Numero client" },
              { key: "nom", label: "Nom" },
              { key: "telephone", label: "Telephone" },
              { key: "email", label: "Email" },
              { key: "adresse", label: "Adresse" },
              { key: "actions", label: "Actions" },
            ]}
            data={activeItems}
            emptyTitle={isTabLoading ? "Chargement..." : "Aucun client trouve"}
            emptyDescription={
              isTabLoading
                ? "Recuperation des clients en cours."
                : "Ajoutez un client pour commencer."
            }
            renderRow={(compte) => (
              <tr key={compte.id}>
                <td>
                  <strong>{compte.numeroCompte}</strong>
                </td>
                <td>{compte.nom}</td>
                <td>{compte.telephone || "-"}</td>
                <td>{compte.email || "-"}</td>
                <td>{compte.adresse || "-"}</td>
                <td>
                  <div className="table-action-row">
                    <button
                      className="table-action-button"
                      type="button"
                      onClick={() => openClientAccountModal(compte)}
                    >
                      Voir compte
                    </button>
                    {canManageComptes ? (
                      <>
                        <button
                          className="table-action-button"
                          type="button"
                          onClick={() => openClientModal("edit", compte)}
                        >
                          Edit
                        </button>
                        <button
                          className="table-action-button danger"
                          type="button"
                          onClick={() => openDeleteModal(ACCOUNT_TABS.CLIENTS, compte)}
                        >
                          Delete
                        </button>
                      </>
                    ) : null}
                  </div>
                </td>
              </tr>
            )}
          />
        ) : (
          <DataTable
            columns={[
              { key: "numeroCompte", label: "Numero fournisseur" },
              { key: "nom", label: "Nom" },
              { key: "telephone", label: "Telephone" },
              { key: "email", label: "Email" },
              { key: "adresse", label: "Adresse" },
              { key: "actions", label: "Actions" },
            ]}
            data={activeItems}
            emptyTitle={isTabLoading ? "Chargement..." : "Aucun fournisseur trouve"}
            emptyDescription={
              isTabLoading
                ? "Recuperation des fournisseurs en cours."
                : "Ajoutez un fournisseur pour commencer."
            }
            renderRow={(supplier) => (
              <tr key={supplier.id}>
                <td>
                  <strong>{supplier.numeroCompte}</strong>
                </td>
                <td>{supplier.nom}</td>
                <td>{supplier.telephone || "-"}</td>
                <td>{supplier.email || "-"}</td>
                <td>{supplier.adresse || "-"}</td>
                <td>
                  <div className="table-action-row">
                    <button
                      className="table-action-button"
                      type="button"
                      onClick={() => openSupplierAccountModal(supplier)}
                    >
                      Voir compte
                    </button>
                    {canManageComptes ? (
                      <>
                        <button
                          className="table-action-button"
                          type="button"
                          onClick={() => openSupplierModal("edit", supplier)}
                        >
                          Edit
                        </button>
                        <button
                          className="table-action-button danger"
                          type="button"
                          onClick={() => openDeleteModal(ACCOUNT_TABS.SUPPLIERS, supplier)}
                        >
                          Delete
                        </button>
                      </>
                    ) : null}
                  </div>
                </td>
              </tr>
            )}
          />
        )}
      </SectionCard>

      <Modal
        isOpen={clientModal.isOpen}
        eyebrow={clientModal.mode === "edit" ? "Edition client" : "Nouveau client"}
        title={clientModal.mode === "edit" ? "Modifier le client" : "Ajouter un client"}
        description="Renseignez les informations du client."
        onClose={closeClientModal}
        actions={
          <>
            <button
              className="ghost-button"
              type="button"
              onClick={closeClientModal}
              disabled={isSubmittingClient}
            >
              Annuler
            </button>
            <button
              className="primary-button"
              type="submit"
              form="client-form"
              disabled={isSubmittingClient}
            >
              {isSubmittingClient ? "Enregistrement..." : "Enregistrer"}
            </button>
          </>
        }
      >
        <form className="form-grid" id="client-form" onSubmit={handleSubmitClient}>
          {clientFormError ? <div className="inline-notice error">{clientFormError}</div> : null}

          {clientModal.mode === "edit" ? (
            <div className="field-group">
              <label className="field-label" htmlFor="client-numero">
                Numero compte
              </label>
              <input
                id="client-numero"
                className="text-input"
                type="text"
                name="numeroCompte"
                value={clientFormData.numeroCompte}
                onChange={handleClientFormChange}
                required
              />
            </div>
          ) : null}

          <div className="field-group">
            <label className="field-label" htmlFor="client-nom">
              Nom
            </label>
            <input
              id="client-nom"
              className="text-input"
              type="text"
              name="nom"
              value={clientFormData.nom}
              onChange={handleClientFormChange}
              required
            />
          </div>

          <div className="field-group">
            <label className="field-label" htmlFor="client-telephone">
              Telephone
            </label>
            <input
              id="client-telephone"
              className="text-input"
              type="text"
              name="telephone"
              value={clientFormData.telephone}
              onChange={handleClientFormChange}
            />
          </div>

          <div className="field-group">
            <label className="field-label" htmlFor="client-email">
              Email
            </label>
            <input
              id="client-email"
              className="text-input"
              type="email"
              name="email"
              value={clientFormData.email}
              onChange={handleClientFormChange}
            />
          </div>

          <div className="field-group">
            <label className="field-label" htmlFor="client-adresse">
              Adresse
            </label>
            <input
              id="client-adresse"
              className="text-input"
              type="text"
              name="adresse"
              value={clientFormData.adresse}
              onChange={handleClientFormChange}
            />
          </div>

          <label className="checkbox-field" htmlFor="client-actif">
            <input
              id="client-actif"
              type="checkbox"
              name="actif"
              checked={clientFormData.actif}
              onChange={handleClientFormChange}
            />
            <span>Compte actif</span>
          </label>
        </form>
      </Modal>

      <Modal
        isOpen={supplierModal.isOpen}
        eyebrow={
          supplierModal.mode === "edit" ? "Edition fournisseur" : "Nouveau fournisseur"
        }
        title={
          supplierModal.mode === "edit"
            ? "Modifier le fournisseur"
            : "Ajouter un fournisseur"
        }
        description="Renseignez les informations du fournisseur."
        onClose={closeSupplierModal}
        actions={
          <>
            <button
              className="ghost-button"
              type="button"
              onClick={closeSupplierModal}
              disabled={isSubmittingSupplier}
            >
              Annuler
            </button>
            <button
              className="primary-button"
              type="submit"
              form="supplier-form"
              disabled={isSubmittingSupplier}
            >
              {isSubmittingSupplier ? "Enregistrement..." : "Enregistrer"}
            </button>
          </>
        }
      >
        <form className="form-grid" id="supplier-form" onSubmit={handleSubmitSupplier}>
          {supplierFormError ? (
            <div className="inline-notice error">{supplierFormError}</div>
          ) : null}

          <div className="field-group">
            <label className="field-label" htmlFor="supplier-name">
              Nom
            </label>
            <input
              id="supplier-name"
              className="text-input"
              type="text"
              name="nom"
              value={supplierFormData.nom}
              onChange={handleSupplierFormChange}
              required
            />
          </div>

          <div className="field-group">
            <label className="field-label" htmlFor="supplier-phone">
              Telephone
            </label>
            <input
              id="supplier-phone"
              className="text-input"
              type="text"
              name="telephone"
              value={supplierFormData.telephone}
              onChange={handleSupplierFormChange}
            />
          </div>

          <div className="field-group">
            <label className="field-label" htmlFor="supplier-email">
              Email
            </label>
            <input
              id="supplier-email"
              className="text-input"
              type="email"
              name="email"
              value={supplierFormData.email}
              onChange={handleSupplierFormChange}
            />
          </div>

          <div className="field-group">
            <label className="field-label" htmlFor="supplier-address">
              Adresse
            </label>
            <input
              id="supplier-address"
              className="text-input"
              type="text"
              name="adresse"
              value={supplierFormData.adresse}
              onChange={handleSupplierFormChange}
            />
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={deleteModal.isOpen}
        eyebrow={deleteModal.type === ACCOUNT_TABS.SUPPLIERS ? "Suppression fournisseur" : "Suppression client"}
        title={
          deleteModal.type === ACCOUNT_TABS.SUPPLIERS
            ? "Supprimer ce fournisseur"
            : "Supprimer ce client"
        }
        description="Confirmez la suppression de cet element."
        onClose={closeDeleteModal}
        actions={
          <>
            <button
              className="ghost-button"
              type="button"
              onClick={closeDeleteModal}
              disabled={isDeleting}
            >
              Annuler
            </button>
            <button
              className="table-action-button danger"
              type="button"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting ? "Suppression..." : "Supprimer"}
            </button>
          </>
        }
      >
        {deleteError ? <div className="inline-notice error">{deleteError}</div> : null}

        {deleteModal.item ? (
          <div className="delete-product-summary">
            <p className="delete-product-name">{deleteModal.item.nom}</p>
            <p className="delete-product-meta">
              Numero: {deleteModal.item.numeroCompte}
            </p>
          </div>
        ) : null}
      </Modal>

      <Modal
        isOpen={clientAccountModal.isOpen}
        eyebrow="Compte client"
        title={clientAccountModal.customer?.name || clientAccountModal.compte?.nom || "Client"}
        description="Consulter les factures non reglees et encaisser un paiement."
        onClose={closeClientAccountModal}
        cardClassName="modal-large customer-account-modal"
        actions={
          <button
            className="ghost-button"
            type="button"
            onClick={closeClientAccountModal}
            disabled={isSubmittingClientPayment}
          >
            Fermer
          </button>
        }
      >
        {clientAccountError ? (
          <div className="inline-notice error">{clientAccountError}</div>
        ) : null}

        {clientAccountModal.customer ? (
          <>
            <div className="details-list">
              <div className="detail-stat">
                <span>Nom client</span>
                <strong>{clientAccountModal.customer.name}</strong>
              </div>
              <div className="detail-stat">
                <span>Telephone</span>
                <strong>{clientAccountModal.customer.phone || "-"}</strong>
              </div>
              <div className="detail-stat">
                <span>Email</span>
                <strong>{clientAccountModal.customer.email || "-"}</strong>
              </div>
              <div className="detail-stat">
                <span>Total credit</span>
                <strong>{formatCurrencyDh(clientAccountModal.customer.totalCredit || 0)}</strong>
              </div>
              <div className="detail-stat">
                <span>Total reste a payer</span>
                <strong>
                  {formatCurrencyDh(clientAccountModal.customer.totalRemainingAmount || 0)}
                </strong>
              </div>
              <div className="detail-stat">
                <span>Factures ouvertes</span>
                <strong>{clientAccountModal.customer.openInvoicesCount || 0}</strong>
              </div>
            </div>

            <SectionCard
              title="Factures a regler"
              description="Toutes les ventes a credit et partiellement payees de ce client."
            >
              <DataTable
                columns={[
                  { key: "ticket", label: "Ticket" },
                  { key: "date", label: "Date" },
                  { key: "total", label: "Total facture" },
                  { key: "paid", label: "Deja paye" },
                  { key: "remaining", label: "Reste a payer" },
                  { key: "type", label: "Type" },
                  { key: "status", label: "Statut" },
                  { key: "actions", label: "Actions" },
                ]}
                data={clientAccountModal.invoices || []}
                emptyTitle={
                  isLoadingClientAccount ? "Chargement..." : "Aucune facture ouverte"
                }
                emptyDescription={
                  isLoadingClientAccount
                    ? "Recuperation des factures client en cours."
                    : "Ce client n'a pas de vente a credit ou partiellement payee."
                }
                renderRow={(invoice) => {
                  const typeMeta = getInvoiceTypeMeta(invoice);
                  const statusMeta = getInvoiceStatusMeta(invoice);

                  return (
                    <tr key={invoice.id}>
                      <td>
                        <strong>{invoice.ticketNumber}</strong>
                      </td>
                      <td>{formatDateTime(invoice.date)}</td>
                      <td>{formatCurrencyDh(invoice.total || 0)}</td>
                      <td>{formatCurrencyDh(invoice.paidAmount || 0)}</td>
                      <td>{formatCurrencyDh(invoice.remainingAmount || 0)}</td>
                      <td>
                        <Badge tone={typeMeta.tone}>{typeMeta.label}</Badge>
                      </td>
                      <td>
                        <Badge tone={statusMeta.tone}>{statusMeta.label}</Badge>
                      </td>
                      <td>
                        <button
                          className="table-action-button"
                          type="button"
                          onClick={() => openClientPaymentModal(invoice)}
                        >
                          Ajouter paiement
                        </button>
                      </td>
                    </tr>
                  );
                }}
              />
            </SectionCard>
          </>
        ) : isLoadingClientAccount ? (
          <div className="inline-notice info">Chargement du compte client...</div>
        ) : null}
      </Modal>

      <Modal
        isOpen={supplierAccountModal.isOpen}
        eyebrow="Compte fournisseur"
        title={supplierAccountModal.supplier?.nom || "Fournisseur"}
        description="Consulter les informations principales du fournisseur."
        onClose={closeSupplierAccountModal}
        actions={
          <button
            className="ghost-button"
            type="button"
            onClick={closeSupplierAccountModal}
          >
            Fermer
          </button>
        }
      >
        {supplierAccountModal.supplier ? (
          <div className="details-list">
            <div className="detail-stat">
              <span>Numero fournisseur</span>
              <strong>{supplierAccountModal.supplier.numeroCompte}</strong>
            </div>
            <div className="detail-stat">
              <span>Nom</span>
              <strong>{supplierAccountModal.supplier.nom}</strong>
            </div>
            <div className="detail-stat">
              <span>Telephone</span>
              <strong>{supplierAccountModal.supplier.telephone || "-"}</strong>
            </div>
            <div className="detail-stat">
              <span>Email</span>
              <strong>{supplierAccountModal.supplier.email || "-"}</strong>
            </div>
            <div className="detail-stat">
              <span>Adresse</span>
              <strong>{supplierAccountModal.supplier.adresse || "-"}</strong>
            </div>
            <div className="detail-stat">
              <span>Statut</span>
              <strong>
                {supplierAccountModal.supplier.actif ? "Actif" : "Inactif"}
              </strong>
            </div>
            <div className="detail-stat">
              <span>Produits lies</span>
              <strong>{supplierAccountModal.supplier.productsCount || 0}</strong>
            </div>
            <div className="detail-stat">
              <span>Achats lies</span>
              <strong>{supplierAccountModal.supplier.purchasesCount || 0}</strong>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        isOpen={clientPaymentModal.isOpen}
        eyebrow="Paiement client"
        title="Ajouter un paiement"
        description="Enregistrer un paiement sur une facture ouverte."
        onClose={closeClientPaymentModal}
        actions={
          <>
            <button
              className="ghost-button"
              type="button"
              onClick={closeClientPaymentModal}
              disabled={isSubmittingClientPayment}
            >
              Annuler
            </button>
            <button
              className="primary-button"
              type="submit"
              form="client-payment-form"
              disabled={isSubmittingClientPayment}
            >
              {isSubmittingClientPayment ? "Validation..." : "Valider paiement"}
            </button>
          </>
        }
      >
        <form className="form-grid" id="client-payment-form" onSubmit={handleSubmitClientPayment}>
          {clientPaymentError ? (
            <div className="inline-notice error">{clientPaymentError}</div>
          ) : null}

          {clientPaymentModal.invoice ? (
            <>
              <div className="details-list">
                <div className="detail-stat">
                  <span>Ticket</span>
                  <strong>{clientPaymentModal.invoice.ticketNumber}</strong>
                </div>
                <div className="detail-stat">
                  <span>Total</span>
                  <strong>{formatCurrencyDh(clientPaymentModal.invoice.total || 0)}</strong>
                </div>
                <div className="detail-stat">
                  <span>Deja paye</span>
                  <strong>
                    {formatCurrencyDh(clientPaymentModal.invoice.paidAmount || 0)}
                  </strong>
                </div>
                <div className="detail-stat">
                  <span>Reste a payer</span>
                  <strong>
                    {formatCurrencyDh(clientPaymentModal.invoice.remainingAmount || 0)}
                  </strong>
                </div>
              </div>

              <div className="field-group">
                <label className="field-label" htmlFor="client-payment-amount">
                  Montant recu
                </label>
                <input
                  id="client-payment-amount"
                  className="text-input"
                  type="number"
                  min="0"
                  max={Number(clientPaymentModal.invoice.remainingAmount || 0)}
                  step="0.01"
                  value={clientPaymentAmount}
                  onChange={(event) => {
                    setClientPaymentError("");
                    setClientPaymentAmount(event.target.value);
                  }}
                  required
                />
              </div>

              <div className="field-group">
                <label className="field-label" htmlFor="client-payment-method">
                  Mode paiement
                </label>
                <select
                  id="client-payment-method"
                  className="text-input select-input"
                  value={clientPaymentMethod}
                  onChange={(event) => {
                    setClientPaymentError("");
                    setClientPaymentMethod(event.target.value);
                  }}
                >
                  <option value="cash">Especes</option>
                  <option value="card">Carte bancaire</option>
                </select>
              </div>
            </>
          ) : null}
        </form>
      </Modal>
    </div>
  );
}

export default ComptesPage;
