import { useEffect, useMemo, useState } from "react";
import api from "../services/api";
import DataTable from "../components/DataTable";
import Modal from "../components/Modal";
import PageHeader from "../components/PageHeader";
import SearchInput from "../components/SearchInput";
import SectionCard from "../components/SectionCard";
import { getCurrentUser } from "../store/authStore";
import { formatDateOnly } from "../utils/formatters";

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

const getOrganisationsCollection = (payload) => getCollection(payload, ["data", "organisations"]);

const createInitialCreateFormData = () => ({
  name: "",
  adminName: "",
  adminEmail: "",
  adminPassword: "",
  cashierName: "",
  cashierEmail: "",
  cashierPassword: "",
});

const createInitialEditFormData = (organisation = null) => ({
  name: organisation?.name || "",
  adminName: organisation?.admin?.name || "",
  adminEmail: organisation?.admin?.email || "",
  adminPassword: "",
  cashierName: organisation?.cashier?.name || "",
  cashierEmail: organisation?.cashier?.email || "",
  cashierPassword: "",
});

function OrganisationsPage() {
  const currentUser = getCurrentUser();
  const canManageOrganisations = ["super_admin", "admin_global"].includes(
    currentUser?.role || ""
  );
  const [searchTerm, setSearchTerm] = useState("");
  const [organisations, setOrganisations] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [notice, setNotice] = useState({ type: "", message: "" });
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createFormData, setCreateFormData] = useState(createInitialCreateFormData);
  const [createModalError, setCreateModalError] = useState("");
  const [isSubmittingCreate, setIsSubmittingCreate] = useState(false);
  const [editModal, setEditModal] = useState({
    isOpen: false,
    organisation: null,
  });
  const [editFormData, setEditFormData] = useState(createInitialEditFormData);
  const [editModalError, setEditModalError] = useState("");
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);
  const [deleteModal, setDeleteModal] = useState({
    isOpen: false,
    organisation: null,
  });
  const [deleteModalError, setDeleteModalError] = useState("");
  const [isSubmittingDelete, setIsSubmittingDelete] = useState(false);

  const fetchOrganisations = async () => {
    const response = await api.get("/organisations");
    setOrganisations(getOrganisationsCollection(response.data));
  };

  useEffect(() => {
    let isMounted = true;

    async function loadOrganisations() {
      if (!canManageOrganisations) {
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        setErrorMessage("");
        const response = await api.get("/organisations");

        if (isMounted) {
          setOrganisations(getOrganisationsCollection(response.data));
        }
      } catch (error) {
        if (isMounted) {
          setErrorMessage(
            error.response?.data?.message ||
              "Impossible de charger les organisations pour le moment."
          );
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadOrganisations();

    return () => {
      isMounted = false;
    };
  }, [canManageOrganisations]);

  const filteredOrganisations = useMemo(
    () =>
      organisations.filter((organisation) => {
        const query = searchTerm.trim().toLowerCase();

        if (!query) {
          return true;
        }

        return (
          organisation.name?.toLowerCase().includes(query) ||
          organisation.admin?.name?.toLowerCase().includes(query) ||
          organisation.admin?.email?.toLowerCase().includes(query) ||
          organisation.cashier?.name?.toLowerCase().includes(query) ||
          organisation.cashier?.email?.toLowerCase().includes(query)
        );
      }),
    [organisations, searchTerm]
  );

  const openCreateModal = () => {
    setNotice({ type: "", message: "" });
    setCreateModalError("");
    setCreateFormData(createInitialCreateFormData());
    setIsCreateModalOpen(true);
  };

  const closeCreateModal = () => {
    if (isSubmittingCreate) {
      return;
    }

    setIsCreateModalOpen(false);
    setCreateFormData(createInitialCreateFormData());
    setCreateModalError("");
  };

  const openEditModal = (organisation) => {
    setNotice({ type: "", message: "" });
    setEditModalError("");
    setEditFormData(createInitialEditFormData(organisation));
    setEditModal({
      isOpen: true,
      organisation,
    });
  };

  const closeEditModal = () => {
    if (isSubmittingEdit) {
      return;
    }

    setEditModal({
      isOpen: false,
      organisation: null,
    });
    setEditFormData(createInitialEditFormData());
    setEditModalError("");
  };

  const openDeleteModal = (organisation) => {
    setNotice({ type: "", message: "" });
    setDeleteModalError("");
    setDeleteModal({
      isOpen: true,
      organisation,
    });
  };

  const closeDeleteModal = () => {
    if (isSubmittingDelete) {
      return;
    }

    setDeleteModal({
      isOpen: false,
      organisation: null,
    });
    setDeleteModalError("");
  };

  const resetDeleteModal = () => {
    setDeleteModal({
      isOpen: false,
      organisation: null,
    });
    setDeleteModalError("");
  };

  const handleCreateFormChange = (event) => {
    const { name, value } = event.target;

    setCreateModalError("");
    setCreateFormData((current) => ({
      ...current,
      [name]: value,
    }));
  };

  const handleEditFormChange = (event) => {
    const { name, value } = event.target;

    setEditModalError("");
    setEditFormData((current) => ({
      ...current,
      [name]: value,
    }));
  };

  const validateCreateForm = () => {
    if (!createFormData.name.trim()) {
      return "Le nom de l'organisation est obligatoire.";
    }

    if (!createFormData.adminName.trim() || !createFormData.adminEmail.trim()) {
      return "Les informations admin sont obligatoires.";
    }

    if (!createFormData.adminPassword.trim()) {
      return "Le mot de passe admin est obligatoire.";
    }

    if (!createFormData.cashierName.trim() || !createFormData.cashierEmail.trim()) {
      return "Les informations caissier sont obligatoires.";
    }

    if (!createFormData.cashierPassword.trim()) {
      return "Le mot de passe caissier est obligatoire.";
    }

    return "";
  };

  const validateEditForm = () => {
    if (!editFormData.name.trim()) {
      return "Le nom de l'organisation est obligatoire.";
    }

    return "";
  };

  const handleSubmitCreate = async (event) => {
    event.preventDefault();

    const validationMessage = validateCreateForm();

    if (validationMessage) {
      setCreateModalError(validationMessage);
      return;
    }

    try {
      setIsSubmittingCreate(true);
      setCreateModalError("");

      await api.post("/organisations", {
        name: createFormData.name.trim(),
        adminName: createFormData.adminName.trim(),
        adminEmail: createFormData.adminEmail.trim(),
        adminPassword: createFormData.adminPassword,
        cashierName: createFormData.cashierName.trim(),
        cashierEmail: createFormData.cashierEmail.trim(),
        cashierPassword: createFormData.cashierPassword,
      });

      await fetchOrganisations();
      setIsCreateModalOpen(false);
      setCreateFormData(createInitialCreateFormData());
      setNotice({
        type: "success",
        message: "Organisation creee avec succes.",
      });
    } catch (error) {
      setCreateModalError(
        error.response?.data?.message ||
          "Impossible de creer cette organisation pour le moment."
      );
    } finally {
      setIsSubmittingCreate(false);
    }
  };

  const handleSubmitEdit = async (event) => {
    event.preventDefault();

    const validationMessage = validateEditForm();

    if (validationMessage) {
      setEditModalError(validationMessage);
      return;
    }

    if (!editModal.organisation?.id) {
      setEditModalError("Organisation introuvable.");
      return;
    }

    try {
      setIsSubmittingEdit(true);
      setEditModalError("");

      await api.put(`/organisations/${editModal.organisation.id}`, {
        name: editFormData.name.trim(),
        adminName: editFormData.adminName.trim() || undefined,
        adminEmail: editFormData.adminEmail.trim() || undefined,
        adminPassword: editFormData.adminPassword.trim() || undefined,
        cashierName: editFormData.cashierName.trim() || undefined,
        cashierEmail: editFormData.cashierEmail.trim() || undefined,
        cashierPassword: editFormData.cashierPassword.trim() || undefined,
      });

      await fetchOrganisations();
      closeEditModal();
      setNotice({
        type: "success",
        message: "Organisation mise a jour avec succes.",
      });
    } catch (error) {
      setEditModalError(
        error.response?.data?.message ||
          "Impossible de modifier cette organisation pour le moment."
      );
    } finally {
      setIsSubmittingEdit(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteModal.organisation?.id) {
      setDeleteModalError("Organisation introuvable.");
      return;
    }

    try {
      setIsSubmittingDelete(true);
      setDeleteModalError("");

      await api.delete(`/organisations/${deleteModal.organisation.id}`);
      await fetchOrganisations();
      resetDeleteModal();
      setNotice({
        type: "success",
        message: "Organisation supprimee avec succes.",
      });
    } catch (error) {
      setDeleteModalError(
        error.response?.data?.message ||
          "Impossible de supprimer cette organisation pour le moment."
      );
    } finally {
      setIsSubmittingDelete(false);
    }
  };

  if (!canManageOrganisations) {
    return (
      <div className="inline-notice error">
        Acces reserve au super admin ou a l'admin global.
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        eyebrow="Global"
        title="Organisations"
        description="Creer de nouvelles organisations SportZone et suivre leurs admins, caissiers et activite."
        actions={
          <button className="primary-button" type="button" onClick={openCreateModal}>
            Nouvelle organisation
          </button>
        }
      />

      {notice.message ? (
        <div className={`inline-notice ${notice.type}`}>{notice.message}</div>
      ) : null}

      <SectionCard
        title="Liste des organisations"
        description="Recherche par nom d'organisation ou comptes principaux."
      >
        <div className="table-toolbar">
          <SearchInput
            value={searchTerm}
            onChange={setSearchTerm}
            placeholder="Rechercher une organisation"
          />
        </div>

        {errorMessage ? <div className="inline-notice error">{errorMessage}</div> : null}

        <DataTable
          columns={[
            { key: "name", label: "Organisation" },
            { key: "admin", label: "Admin" },
            { key: "cashier", label: "Caissier" },
            { key: "summary", label: "Resume" },
            { key: "createdAt", label: "Creation" },
            { key: "actions", label: "Actions" },
          ]}
          data={filteredOrganisations}
          emptyTitle={isLoading ? "Chargement..." : "Aucune organisation trouvee"}
          emptyDescription={
            isLoading
              ? "Recuperation des organisations en cours."
              : "Ajustez la recherche ou creez une nouvelle organisation."
          }
          renderRow={(organisation) => (
            <tr key={organisation.id}>
              <td>
                <strong>{organisation.name}</strong>
                <div className="muted-text">
                  {organisation.storeName || "Magasin principal"} /{" "}
                  {organisation.cashRegisterName || "Caisse 1"}
                </div>
              </td>
              <td>
                <div className="table-cell-stack">
                  <strong>{organisation.admin?.name || "-"}</strong>
                  <span>{organisation.admin?.email || "-"}</span>
                </div>
              </td>
              <td>
                <div className="table-cell-stack">
                  <strong>{organisation.cashier?.name || "-"}</strong>
                  <span>{organisation.cashier?.email || "-"}</span>
                </div>
              </td>
              <td>
                <div className="table-cell-stack">
                  <span>Utilisateurs: {organisation.usersCount || 0}</span>
                  <span>Produits: {organisation.productsCount || 0}</span>
                  <span>Clients: {organisation.clientsCount || 0}</span>
                  <span>Ventes: {organisation.salesCount || 0}</span>
                </div>
              </td>
              <td>{organisation.createdAt ? formatDateOnly(organisation.createdAt) : "-"}</td>
              <td>
                <div className="table-action-row">
                  <button
                    className="table-action-button"
                    type="button"
                    onClick={() => openEditModal(organisation)}
                  >
                    Edit
                  </button>
                  <button
                    className="table-action-button danger"
                    type="button"
                    onClick={() => openDeleteModal(organisation)}
                  >
                    Delete
                  </button>
                </div>
              </td>
            </tr>
          )}
        />
      </SectionCard>

      <Modal
        isOpen={isCreateModalOpen}
        eyebrow="Nouvelle organisation"
        title="Creer une organisation"
        description="Creation du tenant complet avec admin, caissier, magasin unique, caisse unique et client inconnu."
        onClose={closeCreateModal}
        cardClassName="modal-large"
        actions={
          <>
            <button
              className="ghost-button"
              type="button"
              onClick={closeCreateModal}
              disabled={isSubmittingCreate}
            >
              Annuler
            </button>
            <button
              className="primary-button"
              type="submit"
              form="create-organisation-form"
              disabled={isSubmittingCreate}
            >
              {isSubmittingCreate ? "Creation..." : "Creer organisation"}
            </button>
          </>
        }
      >
        <form
          className="form-grid"
          id="create-organisation-form"
          onSubmit={handleSubmitCreate}
        >
          {createModalError ? (
            <div className="inline-notice error">{createModalError}</div>
          ) : null}

          <div className="field-group">
            <label className="field-label" htmlFor="organisation-name">
              Nom organisation
            </label>
            <input
              id="organisation-name"
              className="text-input"
              type="text"
              name="name"
              value={createFormData.name}
              onChange={handleCreateFormChange}
              required
            />
          </div>

          <div className="field-group">
            <label className="field-label" htmlFor="organisation-admin-name">
              Nom admin
            </label>
            <input
              id="organisation-admin-name"
              className="text-input"
              type="text"
              name="adminName"
              value={createFormData.adminName}
              onChange={handleCreateFormChange}
              required
            />
          </div>

          <div className="field-group">
            <label className="field-label" htmlFor="organisation-admin-email">
              Email admin
            </label>
            <input
              id="organisation-admin-email"
              className="text-input"
              type="email"
              name="adminEmail"
              value={createFormData.adminEmail}
              onChange={handleCreateFormChange}
              required
            />
          </div>

          <div className="field-group">
            <label className="field-label" htmlFor="organisation-admin-password">
              Mot de passe admin
            </label>
            <input
              id="organisation-admin-password"
              className="text-input"
              type="password"
              name="adminPassword"
              value={createFormData.adminPassword}
              onChange={handleCreateFormChange}
              required
            />
          </div>

          <div className="field-group">
            <label className="field-label" htmlFor="organisation-cashier-name">
              Nom caissier
            </label>
            <input
              id="organisation-cashier-name"
              className="text-input"
              type="text"
              name="cashierName"
              value={createFormData.cashierName}
              onChange={handleCreateFormChange}
              required
            />
          </div>

          <div className="field-group">
            <label className="field-label" htmlFor="organisation-cashier-email">
              Email caissier
            </label>
            <input
              id="organisation-cashier-email"
              className="text-input"
              type="email"
              name="cashierEmail"
              value={createFormData.cashierEmail}
              onChange={handleCreateFormChange}
              required
            />
          </div>

          <div className="field-group">
            <label className="field-label" htmlFor="organisation-cashier-password">
              Mot de passe caissier
            </label>
            <input
              id="organisation-cashier-password"
              className="text-input"
              type="password"
              name="cashierPassword"
              value={createFormData.cashierPassword}
              onChange={handleCreateFormChange}
              required
            />
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={editModal.isOpen}
        eyebrow="Edition organisation"
        title="Modifier l'organisation"
        description="Mettez a jour le nom de l'organisation et, si besoin, les comptes admin et caissier."
        onClose={closeEditModal}
        cardClassName="modal-large"
        actions={
          <>
            <button
              className="ghost-button"
              type="button"
              onClick={closeEditModal}
              disabled={isSubmittingEdit}
            >
              Annuler
            </button>
            <button
              className="primary-button"
              type="submit"
              form="edit-organisation-form"
              disabled={isSubmittingEdit}
            >
              {isSubmittingEdit ? "Enregistrement..." : "Enregistrer"}
            </button>
          </>
        }
      >
        <form
          className="form-grid"
          id="edit-organisation-form"
          onSubmit={handleSubmitEdit}
        >
          {editModalError ? (
            <div className="inline-notice error">{editModalError}</div>
          ) : null}

          <div className="field-group">
            <label className="field-label" htmlFor="edit-organisation-name">
              Nom organisation
            </label>
            <input
              id="edit-organisation-name"
              className="text-input"
              type="text"
              name="name"
              value={editFormData.name}
              onChange={handleEditFormChange}
              required
            />
          </div>

          <div className="field-group">
            <label className="field-label" htmlFor="edit-organisation-admin-name">
              Nom admin
            </label>
            <input
              id="edit-organisation-admin-name"
              className="text-input"
              type="text"
              name="adminName"
              value={editFormData.adminName}
              onChange={handleEditFormChange}
            />
          </div>

          <div className="field-group">
            <label className="field-label" htmlFor="edit-organisation-admin-email">
              Email admin
            </label>
            <input
              id="edit-organisation-admin-email"
              className="text-input"
              type="email"
              name="adminEmail"
              value={editFormData.adminEmail}
              onChange={handleEditFormChange}
            />
          </div>

          <div className="field-group">
            <label className="field-label" htmlFor="edit-organisation-admin-password">
              Nouveau mot de passe admin
            </label>
            <input
              id="edit-organisation-admin-password"
              className="text-input"
              type="password"
              name="adminPassword"
              value={editFormData.adminPassword}
              onChange={handleEditFormChange}
              placeholder="Laisser vide pour conserver"
            />
          </div>

          <div className="field-group">
            <label className="field-label" htmlFor="edit-organisation-cashier-name">
              Nom caissier
            </label>
            <input
              id="edit-organisation-cashier-name"
              className="text-input"
              type="text"
              name="cashierName"
              value={editFormData.cashierName}
              onChange={handleEditFormChange}
            />
          </div>

          <div className="field-group">
            <label className="field-label" htmlFor="edit-organisation-cashier-email">
              Email caissier
            </label>
            <input
              id="edit-organisation-cashier-email"
              className="text-input"
              type="email"
              name="cashierEmail"
              value={editFormData.cashierEmail}
              onChange={handleEditFormChange}
            />
          </div>

          <div className="field-group">
            <label className="field-label" htmlFor="edit-organisation-cashier-password">
              Nouveau mot de passe caissier
            </label>
            <input
              id="edit-organisation-cashier-password"
              className="text-input"
              type="password"
              name="cashierPassword"
              value={editFormData.cashierPassword}
              onChange={handleEditFormChange}
              placeholder="Laisser vide pour conserver"
            />
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={deleteModal.isOpen}
        eyebrow="Suppression organisation"
        title="Supprimer cette organisation"
        description="Voulez-vous vraiment supprimer cette organisation ? Toutes ses donnees seront supprimees."
        onClose={closeDeleteModal}
        actions={
          <>
            <button
              className="ghost-button"
              type="button"
              onClick={closeDeleteModal}
              disabled={isSubmittingDelete}
            >
              Annuler
            </button>
            <button
              className="table-action-button danger"
              type="button"
              onClick={handleConfirmDelete}
              disabled={isSubmittingDelete}
            >
              {isSubmittingDelete ? "Suppression..." : "Supprimer"}
            </button>
          </>
        }
      >
        {deleteModalError ? (
          <div className="inline-notice error">{deleteModalError}</div>
        ) : null}

        <p className="helper-text">
          {deleteModal.organisation
            ? `Organisation cible: ${deleteModal.organisation.name}`
            : "Cette action est definitive."}
        </p>
      </Modal>
    </div>
  );
}

export default OrganisationsPage;
