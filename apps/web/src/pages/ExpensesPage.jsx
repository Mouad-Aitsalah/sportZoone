import { useEffect, useMemo, useState } from "react";
import Badge from "../components/Badge";
import DataTable from "../components/DataTable";
import Modal from "../components/Modal";
import PageHeader from "../components/PageHeader";
import SectionCard from "../components/SectionCard";
import StatCard from "../components/StatCard";
import api from "../services/api";
import { invalidateDomainCaches } from "../utils/appCache";
import { formatCurrencyDh } from "../utils/formatters";

const EXPENSE_CATEGORIES = [
  { value: "ELECTRICITE", label: "Electricite" },
  { value: "EAU", label: "Eau" },
  { value: "LOYER", label: "Loyer" },
  { value: "REPARATION", label: "Reparation" },
  { value: "TRANSPORT", label: "Transport" },
  { value: "CARBURANT", label: "Carburant" },
  { value: "INTERNET", label: "Internet" },
  { value: "SALAIRE", label: "Salaire" },
  { value: "AUTRE", label: "Autre" },
];

const EXPENSE_PAYMENT_METHODS = [
  { value: "ESPECE", label: "Especes" },
  { value: "CARTE", label: "Carte" },
  { value: "VIREMENT", label: "Virement" },
  { value: "CHEQUE", label: "Cheque" },
  { value: "AUTRE", label: "Autre" },
];

const getTodayString = () => new Date().toISOString().slice(0, 10);

const createInitialExpenseForm = () => ({
  titre: "",
  categorie: "ELECTRICITE",
  montant: "",
  dateCharge: getTodayString(),
  modePaiement: "ESPECE",
  pointDeVenteId: "",
  description: "",
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

const normalizeStore = (store) => ({
  id: Number(store?.id),
  name: store?.name || store?.nom || "Magasin",
});

const normalizeExpense = (expense) => ({
  id: Number(expense?.id),
  titre: expense?.titre || expense?.title || "Charge",
  categorie: expense?.categorie || expense?.category || "AUTRE",
  montant: Number(expense?.montant ?? expense?.amount ?? 0),
  dateCharge: expense?.dateCharge || expense?.date || "",
  modePaiement: expense?.modePaiement || expense?.paymentMethod || "ESPECE",
  pointDeVenteId: Number(expense?.pointDeVenteId ?? expense?.storeId ?? 0),
  storeName: expense?.storeName || expense?.pointDeVente?.nom || "-",
  description: expense?.description || "",
  createdByName: expense?.createdByName || expense?.utilisateur?.nom || "-",
});

const getCategoryLabel = (value) =>
  EXPENSE_CATEGORIES.find((category) => category.value === value)?.label || value || "-";

const getPaymentMethodLabel = (value) =>
  EXPENSE_PAYMENT_METHODS.find((item) => item.value === value)?.label || value || "-";

const formatDateValue = (value) => {
  if (!value) {
    return "-";
  }

  const parsedDate = new Date(value);
  return Number.isNaN(parsedDate.getTime())
    ? String(value).slice(0, 10)
    : parsedDate.toLocaleDateString("fr-MA");
};

function ExpensesPage() {
  const [expenses, setExpenses] = useState([]);
  const [stores, setStores] = useState([]);
  const [filters, setFilters] = useState({
    date: "",
    categorie: "all",
    pointDeVenteId: "all",
  });
  const [isLoading, setIsLoading] = useState(true);
  const [notice, setNotice] = useState({ type: "", message: "" });
  const [errorMessage, setErrorMessage] = useState("");
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState(null);
  const [expenseFormData, setExpenseFormData] = useState(createInitialExpenseForm);
  const [expenseEditorError, setExpenseEditorError] = useState("");
  const [isSubmittingExpense, setIsSubmittingExpense] = useState(false);
  const [expenseToDelete, setExpenseToDelete] = useState(null);
  const [isDeletingExpense, setIsDeletingExpense] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function bootstrapPage() {
      try {
        setIsLoading(true);
        setErrorMessage("");

        const loadStores = async () => {
          const response = await api.getStores();
          return getCollection(response.data, ["data", "stores"]).map(normalizeStore);
        };

        const loadExpenses = async () => {
          const params = {};

          if (filters.categorie !== "all") {
            params.category = filters.categorie;
          }

          if (filters.pointDeVenteId !== "all") {
            params.storeId = Number(filters.pointDeVenteId);
          }

          if (filters.date) {
            params.startDate = `${filters.date}T00:00:00.000`;
            params.endDate = `${filters.date}T23:59:59.999`;
          }

          const response = await api.getExpenses({ params });
          return getCollection(response.data, ["data", "expenses"]).map(normalizeExpense);
        };

        const [storesResult, expensesResult] = await Promise.allSettled([
          loadStores(),
          loadExpenses(),
        ]);

        if (!isMounted) {
          return;
        }

        if (storesResult.status === "fulfilled") {
          setStores(storesResult.value);
          setExpenseFormData((current) => ({
            ...current,
            pointDeVenteId:
              current.pointDeVenteId || String(storesResult.value[0]?.id || ""),
          }));
        } else {
          setStores([]);
        }

        if (expensesResult.status === "fulfilled") {
          setExpenses(expensesResult.value);
        } else {
          setExpenses([]);
          setErrorMessage(
            expensesResult.reason?.response?.data?.message ||
              "Impossible de charger les charges pour le moment."
          );
        }
      } catch (error) {
        if (isMounted) {
          setStores([]);
          setExpenses([]);
          setErrorMessage(
            error.response?.data?.message ||
              "Impossible de charger les charges pour le moment."
          );
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    bootstrapPage();

    return () => {
      isMounted = false;
    };
  }, [filters.categorie, filters.date, filters.pointDeVenteId]);

  const visibleExpenses = useMemo(() => expenses, [expenses]);

  const stats = useMemo(() => {
    const total = visibleExpenses.reduce((sum, expense) => sum + Number(expense.montant || 0), 0);
    const uniqueStores = new Set(
      visibleExpenses.map((expense) => String(expense.storeName || "").trim()).filter(Boolean)
    );

    return [
      {
        label: "Charges listees",
        value: isLoading ? "Chargement..." : visibleExpenses.length,
        detail: "Nombre de depenses correspondant aux filtres.",
        tone: "info",
      },
      {
        label: "Montant total",
        value: isLoading ? "Chargement..." : formatCurrencyDh(total),
        detail: "Somme des charges actuellement affichees.",
        tone: "danger",
      },
      {
        label: "Panier depense moyen",
        value:
          isLoading || !visibleExpenses.length
            ? isLoading
              ? "Chargement..."
              : formatCurrencyDh(0)
            : formatCurrencyDh(total / visibleExpenses.length),
        detail: "Montant moyen par charge enregistree.",
        tone: "warning",
      },
      {
        label: "Magasins concernes",
        value: isLoading ? "Chargement..." : uniqueStores.size,
        detail: "Nombre de points de vente couverts par la selection.",
        tone: "default",
      },
    ];
  }, [isLoading, visibleExpenses]);

  const openCreateModal = () => {
    setEditingExpense(null);
    setExpenseEditorError("");
    setExpenseFormData({
      ...createInitialExpenseForm(),
      pointDeVenteId: String(stores[0]?.id || ""),
    });
    setIsEditorOpen(true);
  };

  const openEditModal = (expense) => {
    setEditingExpense(expense);
    setExpenseEditorError("");
    setExpenseFormData({
      titre: expense.titre || "",
      categorie: expense.categorie || "AUTRE",
      montant: String(expense.montant || ""),
      dateCharge: String(expense.dateCharge || "").slice(0, 10),
      modePaiement: expense.modePaiement || "ESPECE",
      pointDeVenteId: String(expense.pointDeVenteId || ""),
      description: expense.description || "",
    });
    setIsEditorOpen(true);
  };

  const closeEditorModal = () => {
    if (isSubmittingExpense) {
      return;
    }

    setIsEditorOpen(false);
    setEditingExpense(null);
    setExpenseEditorError("");
  };

  const closeDeleteModal = () => {
    if (isDeletingExpense) {
      return;
    }

    setExpenseToDelete(null);
  };

  const handleFormChange = (field, value) => {
    setExpenseFormData((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const refreshExpenses = async () => {
    const params = {};

    if (filters.categorie !== "all") {
      params.category = filters.categorie;
    }

    if (filters.pointDeVenteId !== "all") {
      params.storeId = Number(filters.pointDeVenteId);
    }

    if (filters.date) {
      params.startDate = `${filters.date}T00:00:00.000`;
      params.endDate = `${filters.date}T23:59:59.999`;
    }

    const response = await api.getExpenses({ params });
    const nextExpenses = getCollection(response.data, ["data", "expenses"]).map(
      normalizeExpense
    );
    setExpenses(nextExpenses);
  };

  const handleSubmitExpense = async (event) => {
    event.preventDefault();

    try {
      setIsSubmittingExpense(true);
      setExpenseEditorError("");

      const payload = {
        titre: expenseFormData.titre,
        categorie: expenseFormData.categorie,
        montant: Number(expenseFormData.montant || 0),
        dateCharge: expenseFormData.dateCharge,
        modePaiement: expenseFormData.modePaiement,
        pointDeVenteId: Number(expenseFormData.pointDeVenteId),
        description: expenseFormData.description,
      };

      if (editingExpense?.id) {
        await api.updateExpense(editingExpense.id, payload);
      } else {
        await api.createExpense(payload);
      }

      invalidateDomainCaches("analytics:", "expenses:");
      await refreshExpenses();
      setNotice({
        type: "success",
        message: editingExpense?.id
          ? "Charge modifiee avec succes."
          : "Charge ajoutee avec succes.",
      });
      closeEditorModal();
    } catch (error) {
      setExpenseEditorError(
        error.response?.data?.message ||
          "Impossible d'enregistrer cette charge pour le moment."
      );
    } finally {
      setIsSubmittingExpense(false);
    }
  };

  const handleDeleteExpense = async () => {
    if (!expenseToDelete?.id) {
      return;
    }

    try {
      setIsDeletingExpense(true);
      await api.deleteExpense(expenseToDelete.id);
      invalidateDomainCaches("analytics:", "expenses:");
      await refreshExpenses();
      setNotice({
        type: "success",
        message: "Charge supprimee avec succes.",
      });
      setExpenseToDelete(null);
    } catch (error) {
      setNotice({
        type: "error",
        message:
          error.response?.data?.message ||
          "Impossible de supprimer cette charge pour le moment.",
      });
    } finally {
      setIsDeletingExpense(false);
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow="Charges"
        title="Charges / Depenses"
        description="Suivre les depenses du magasin, par categorie, date et point de vente."
        actions={
          <button className="primary-button" type="button" onClick={openCreateModal}>
            Ajouter une charge
          </button>
        }
      />

      {notice.message ? (
        <div className={`inline-notice ${notice.type}`}>{notice.message}</div>
      ) : null}

      {errorMessage ? <div className="inline-notice error">{errorMessage}</div> : null}

      <div className="card-grid analytics-stat-grid">
        {stats.map((item) => (
          <StatCard
            key={item.label}
            label={item.label}
            value={item.value}
            detail={item.detail}
            tone={item.tone}
          />
        ))}
      </div>

      <SectionCard
        title="Liste des charges"
        description="Consultez, modifiez et supprimez les depenses enregistrees."
      >
        <div className="filter-row">
          <input
            className="text-input select-input"
            type="date"
            value={filters.date}
            onChange={(event) =>
              setFilters((current) => ({ ...current, date: event.target.value }))
            }
          />

          <select
            className="text-input select-input"
            value={filters.categorie}
            onChange={(event) =>
              setFilters((current) => ({ ...current, categorie: event.target.value }))
            }
          >
            <option value="all">Toutes les categories</option>
            {EXPENSE_CATEGORIES.map((category) => (
              <option key={category.value} value={category.value}>
                {category.label}
              </option>
            ))}
          </select>

          <select
            className="text-input select-input"
            value={filters.pointDeVenteId}
            onChange={(event) =>
              setFilters((current) => ({ ...current, pointDeVenteId: event.target.value }))
            }
          >
            <option value="all">Tous les magasins</option>
            {stores.map((store) => (
              <option key={store.id} value={store.id}>
                {store.name}
              </option>
            ))}
          </select>

          <button
            className="ghost-button"
            type="button"
            onClick={() =>
              setFilters({
                date: "",
                categorie: "all",
                pointDeVenteId: "all",
              })
            }
          >
            Reinitialiser
          </button>
        </div>

        <DataTable
          columns={[
            { key: "date", label: "Date" },
            { key: "title", label: "Charge" },
            { key: "category", label: "Categorie" },
            { key: "amount", label: "Montant" },
            { key: "payment", label: "Paiement" },
            { key: "store", label: "Magasin" },
            { key: "description", label: "Remarque" },
            { key: "actions", label: "Actions" },
          ]}
          data={visibleExpenses}
          emptyTitle="Aucune charge"
          emptyDescription="Aucune depense ne correspond aux filtres selectionnes."
          renderRow={(expense) => (
            <tr key={expense.id}>
              <td>{formatDateValue(expense.dateCharge)}</td>
              <td>
                <div className="table-cell-stack">
                  <strong>{expense.titre}</strong>
                  <span className="muted-text">Par {expense.createdByName}</span>
                </div>
              </td>
              <td>
                <Badge tone="warning">{getCategoryLabel(expense.categorie)}</Badge>
              </td>
              <td>{formatCurrencyDh(expense.montant)}</td>
              <td>{getPaymentMethodLabel(expense.modePaiement)}</td>
              <td>{expense.storeName}</td>
              <td className="expense-description-cell">{expense.description || "-"}</td>
              <td>
                <div className="table-action-row">
                  <button
                    className="table-action-button"
                    type="button"
                    onClick={() => openEditModal(expense)}
                  >
                    Modifier
                  </button>
                  <button
                    className="table-action-button danger"
                    type="button"
                    onClick={() => setExpenseToDelete(expense)}
                  >
                    Supprimer
                  </button>
                </div>
              </td>
            </tr>
          )}
        />
      </SectionCard>

      <Modal
        isOpen={isEditorOpen}
        eyebrow="Charges"
        title={editingExpense ? "Modifier la charge" : "Ajouter une charge"}
        description="Enregistrez une depense liee au magasin courant."
        onClose={closeEditorModal}
        cardClassName="modal-large expenses-modal"
        actions={
          <>
            <button className="ghost-button" type="button" onClick={closeEditorModal}>
              Annuler
            </button>
            <button
              className="primary-button"
              type="submit"
              form="expense-form"
              disabled={isSubmittingExpense}
            >
              {isSubmittingExpense ? "Enregistrement..." : "Enregistrer"}
            </button>
          </>
        }
      >
        <form className="form-grid expenses-form-grid" id="expense-form" onSubmit={handleSubmitExpense}>
          {expenseEditorError ? (
            <div className="inline-notice error">{expenseEditorError}</div>
          ) : null}

          <div className="field-group">
            <label className="field-label" htmlFor="expense-title">
              Titre de la charge
            </label>
            <input
              id="expense-title"
              className="text-input"
              type="text"
              value={expenseFormData.titre}
              onChange={(event) => handleFormChange("titre", event.target.value)}
            />
          </div>

          <div className="field-group">
            <label className="field-label" htmlFor="expense-category">
              Categorie
            </label>
            <select
              id="expense-category"
              className="text-input select-input"
              value={expenseFormData.categorie}
              onChange={(event) => handleFormChange("categorie", event.target.value)}
            >
              {EXPENSE_CATEGORIES.map((category) => (
                <option key={category.value} value={category.value}>
                  {category.label}
                </option>
              ))}
            </select>
          </div>

          <div className="field-group">
            <label className="field-label" htmlFor="expense-amount">
              Montant
            </label>
            <input
              id="expense-amount"
              className="text-input"
              type="number"
              min="0.01"
              step="0.01"
              value={expenseFormData.montant}
              onChange={(event) => handleFormChange("montant", event.target.value)}
            />
          </div>

          <div className="field-group">
            <label className="field-label" htmlFor="expense-date">
              Date
            </label>
            <input
              id="expense-date"
              className="text-input"
              type="date"
              value={expenseFormData.dateCharge}
              onChange={(event) => handleFormChange("dateCharge", event.target.value)}
            />
          </div>

          <div className="field-group">
            <label className="field-label" htmlFor="expense-payment">
              Mode de paiement
            </label>
            <select
              id="expense-payment"
              className="text-input select-input"
              value={expenseFormData.modePaiement}
              onChange={(event) => handleFormChange("modePaiement", event.target.value)}
            >
              {EXPENSE_PAYMENT_METHODS.map((method) => (
                <option key={method.value} value={method.value}>
                  {method.label}
                </option>
              ))}
            </select>
          </div>

          <div className="field-group">
            <label className="field-label" htmlFor="expense-store">
              Magasin
            </label>
            <select
              id="expense-store"
              className="text-input select-input"
              value={expenseFormData.pointDeVenteId}
              onChange={(event) => handleFormChange("pointDeVenteId", event.target.value)}
            >
              <option value="">Choisir un magasin</option>
              {stores.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.name}
                </option>
              ))}
            </select>
          </div>

          <div className="field-group expenses-form-grid-span">
            <label className="field-label" htmlFor="expense-description">
              Description / remarque
            </label>
            <textarea
              id="expense-description"
              className="text-input"
              rows="4"
              value={expenseFormData.description}
              onChange={(event) => handleFormChange("description", event.target.value)}
              placeholder="Exemple : facture internet du mois de juin"
            />
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={Boolean(expenseToDelete)}
        eyebrow="Charges"
        title="Supprimer la charge"
        description={
          expenseToDelete
            ? `Confirmez la suppression de "${expenseToDelete.titre}".`
            : ""
        }
        onClose={closeDeleteModal}
        actions={
          <>
            <button className="ghost-button" type="button" onClick={closeDeleteModal}>
              Annuler
            </button>
            <button
              className="table-action-button danger"
              type="button"
              onClick={handleDeleteExpense}
              disabled={isDeletingExpense}
            >
              {isDeletingExpense ? "Suppression..." : "Supprimer"}
            </button>
          </>
        }
      >
        <p>
          Cette action supprimera definitivement la charge et l'enlevera des
          totaux de depenses.
        </p>
      </Modal>
    </div>
  );
}

export default ExpensesPage;
