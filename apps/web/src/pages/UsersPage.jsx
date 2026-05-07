import { useEffect, useMemo, useState } from "react";
import api from "../services/api";
import Badge from "../components/Badge";
import DataTable from "../components/DataTable";
import Modal from "../components/Modal";
import PageHeader from "../components/PageHeader";
import SearchInput from "../components/SearchInput";
import SectionCard from "../components/SectionCard";

const createInitialEditFormData = (user = null) => ({
  nom: user?.name || user?.nom || "",
  email: user?.email || "",
  role: user?.role === "admin" ? "admin" : "employe",
});

const createInitialAddFormData = () => ({
  nom: "",
  email: "",
  motDePasse: "",
  role: "employe",
  pointDeVenteId: "",
  caisseId: "",
  estActif: true,
});

const createInitialEditModal = () => ({
  isOpen: false,
  user: null,
});

const createInitialPasswordModal = () => ({
  isOpen: false,
  user: null,
});

const createInitialPasswordFormData = () => ({
  newPassword: "",
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

const getUsersCollection = (payload) => getCollection(payload, ["data", "users"]);
const getUserWriteUrl = () =>
  api.defaults.baseURL?.replace(/\/api\/?$/, "/users") || "/users";

const buildUserUpdatePayload = (formData) => ({
  nom: formData.nom.trim(),
  email: formData.email.trim(),
  role: formData.role === "admin" ? "ADMIN" : "EMPLOYE",
});

const buildUserCreatePayload = (formData) => ({
  nom: formData.nom.trim(),
  email: formData.email.trim(),
  motDePasse: formData.motDePasse,
  role: formData.role === "admin" ? "ADMIN" : "EMPLOYE",
  pointDeVenteId: formData.pointDeVenteId ? Number(formData.pointDeVenteId) : null,
  caisseId: formData.caisseId ? Number(formData.caisseId) : null,
  estActif: formData.estActif,
});

function UsersPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [notice, setNotice] = useState({ type: "", message: "" });
  const [editModal, setEditModal] = useState(createInitialEditModal);
  const [editFormData, setEditFormData] = useState(createInitialEditFormData);
  const [editModalError, setEditModalError] = useState("");
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addFormData, setAddFormData] = useState(createInitialAddFormData);
  const [addModalError, setAddModalError] = useState("");
  const [isSubmittingAdd, setIsSubmittingAdd] = useState(false);
  const [passwordModal, setPasswordModal] = useState(createInitialPasswordModal);
  const [passwordFormData, setPasswordFormData] = useState(createInitialPasswordFormData);
  const [passwordModalError, setPasswordModalError] = useState("");
  const [isSubmittingPassword, setIsSubmittingPassword] = useState(false);

  const fetchUsers = async () => {
    const response = await api.get("/users");
    setUsers(getUsersCollection(response.data));
  };

  useEffect(() => {
    let isMounted = true;

    async function loadUsers() {
      try {
        setIsLoading(true);
        setErrorMessage("");

        const response = await api.get("/users");
        const list = getUsersCollection(response.data);

        if (isMounted) {
          setUsers(list);
        }
      } catch (error) {
        if (isMounted) {
          setErrorMessage(
            error.response?.data?.message ||
              "Impossible de charger les utilisateurs pour le moment."
          );
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadUsers();

    return () => {
      isMounted = false;
    };
  }, []);

  const filteredUsers = useMemo(
    () =>
      users.filter((user) => {
        const query = searchTerm.trim().toLowerCase();

        if (!query) {
          return true;
        }

        return (
          user.name?.toLowerCase().includes(query) ||
          user.email?.toLowerCase().includes(query)
        );
      }),
    [searchTerm, users]
  );

  const openEditModal = (user) => {
    setNotice({ type: "", message: "" });
    setEditModalError("");
    setEditFormData(createInitialEditFormData(user));
    setEditModal({
      isOpen: true,
      user,
    });
  };

  const closeEditModal = () => {
    if (isSubmittingEdit) {
      return;
    }

    setEditModal(createInitialEditModal());
    setEditFormData(createInitialEditFormData());
    setEditModalError("");
  };

  const resetEditModal = () => {
    setEditModal(createInitialEditModal());
    setEditFormData(createInitialEditFormData());
    setEditModalError("");
  };

  const openAddModal = async () => {
    setNotice({ type: "", message: "" });
    setAddModalError("");
    setAddFormData(createInitialAddFormData());
    setIsAddModalOpen(true);
  };

  const closeAddModal = () => {
    if (isSubmittingAdd) {
      return;
    }

    setIsAddModalOpen(false);
    setAddFormData(createInitialAddFormData());
    setAddModalError("");
  };

  const resetAddModal = () => {
    setIsAddModalOpen(false);
    setAddFormData(createInitialAddFormData());
    setAddModalError("");
  };

  const openPasswordModal = (user) => {
    setNotice({ type: "", message: "" });
    setPasswordModalError("");
    setPasswordFormData(createInitialPasswordFormData());
    setPasswordModal({
      isOpen: true,
      user,
    });
  };

  const closePasswordModal = () => {
    if (isSubmittingPassword) {
      return;
    }

    setPasswordModal(createInitialPasswordModal());
    setPasswordFormData(createInitialPasswordFormData());
    setPasswordModalError("");
  };

  const resetPasswordModal = () => {
    setPasswordModal(createInitialPasswordModal());
    setPasswordFormData(createInitialPasswordFormData());
    setPasswordModalError("");
  };

  const handleEditFormChange = (event) => {
    const { name, value } = event.target;

    setEditModalError("");
    setEditFormData((current) => ({
      ...current,
      [name]: value,
    }));
  };

  const handleAddFormChange = (event) => {
    const { name, value, type, checked } = event.target;

    setAddModalError("");

    setAddFormData((current) => {
      const nextValue = type === "checkbox" ? checked : value;
      const nextState = {
        ...current,
        [name]: nextValue,
      };

      return nextState;
    });
  };

  const handlePasswordFormChange = (event) => {
    const { name, value } = event.target;

    setPasswordModalError("");
    setPasswordFormData((current) => ({
      ...current,
      [name]: value,
    }));
  };

  const validateEditForm = () => {
    if (!editFormData.nom.trim()) {
      return "Le nom est obligatoire.";
    }

    if (!editFormData.email.trim()) {
      return "L'email est obligatoire.";
    }

    if (!editFormData.role) {
      return "Le role est obligatoire.";
    }

    return "";
  };

  const validateAddForm = () => {
    if (!addFormData.nom.trim()) {
      return "Le nom est obligatoire.";
    }

    if (!addFormData.email.trim()) {
      return "L'email est obligatoire.";
    }

    if (!addFormData.motDePasse.trim()) {
      return "Le mot de passe est obligatoire.";
    }

    if (!addFormData.role) {
      return "Le role est obligatoire.";
    }

    return "";
  };

  const validatePasswordForm = () => {
    if (!passwordFormData.newPassword.trim()) {
      return "Le nouveau mot de passe est obligatoire.";
    }

    if (passwordFormData.newPassword.trim().length < 8) {
      return "Le nouveau mot de passe doit contenir au moins 8 caracteres.";
    }

    return "";
  };

  const handleSubmitEdit = async (event) => {
    event.preventDefault();

    const validationMessage = validateEditForm();

    if (validationMessage) {
      setEditModalError(validationMessage);
      return;
    }

    if (!editModal.user?.id) {
      setEditModalError("Utilisateur introuvable.");
      return;
    }

    try {
      setIsSubmittingEdit(true);
      setEditModalError("");

      await api.put(
        `${getUserWriteUrl()}/${editModal.user.id}`,
        buildUserUpdatePayload(editFormData)
      );
      await fetchUsers();
      resetEditModal();
      setNotice({
        type: "success",
        message: "Utilisateur modifie avec succes.",
      });
    } catch (error) {
      setEditModalError(
        error.response?.data?.message ||
          "Impossible de modifier cet utilisateur pour le moment."
      );
    } finally {
      setIsSubmittingEdit(false);
    }
  };

  const handleSubmitAdd = async (event) => {
    event.preventDefault();

    const validationMessage = validateAddForm();

    if (validationMessage) {
      setAddModalError(validationMessage);
      return;
    }

    try {
      setIsSubmittingAdd(true);
      setAddModalError("");

      await api.post(getUserWriteUrl(), buildUserCreatePayload(addFormData));
      await fetchUsers();
      resetAddModal();
      setNotice({
        type: "success",
        message: "Utilisateur ajoute avec succes.",
      });
    } catch (error) {
      setAddModalError(
        error.response?.data?.message ||
          "Impossible d'ajouter cet utilisateur pour le moment."
      );
    } finally {
      setIsSubmittingAdd(false);
    }
  };

  const handleSubmitPassword = async (event) => {
    event.preventDefault();

    const validationMessage = validatePasswordForm();

    if (validationMessage) {
      setPasswordModalError(validationMessage);
      return;
    }

    if (!passwordModal.user?.id) {
      setPasswordModalError("Utilisateur introuvable.");
      return;
    }

    try {
      setIsSubmittingPassword(true);
      setPasswordModalError("");

      await api.patch(`${getUserWriteUrl()}/${passwordModal.user.id}/password`, {
        newPassword: passwordFormData.newPassword.trim(),
      });

      resetPasswordModal();
      setNotice({
        type: "success",
        message: "Mot de passe modifie avec succes.",
      });
    } catch (error) {
      setPasswordModalError(
        error.response?.data?.message ||
          "Impossible de modifier le mot de passe pour le moment."
      );
    } finally {
      setIsSubmittingPassword(false);
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow="Utilisateurs"
        title="Gestion des utilisateurs"
        description="Suivre les comptes admin et caissier du magasin SportZone."
        actions={
          <button className="primary-button" type="button" onClick={openAddModal}>
            Ajouter utilisateur
          </button>
        }
      />

      {notice.message ? (
        <div className={`inline-notice ${notice.type}`}>{notice.message}</div>
      ) : null}

      <SectionCard
        title="Liste des utilisateurs"
        description="Recherche par nom ou email."
      >
        <div className="table-toolbar">
          <SearchInput
            value={searchTerm}
            onChange={setSearchTerm}
            placeholder="Rechercher un utilisateur"
          />
        </div>

        {errorMessage ? (
          <div className="inline-notice error">{errorMessage}</div>
        ) : null}

        <DataTable
          columns={[
            { key: "name", label: "Nom" },
            { key: "email", label: "Email" },
            { key: "role", label: "Role" },
            { key: "status", label: "Statut" },
            { key: "actions", label: "Actions" },
          ]}
          data={filteredUsers}
          emptyTitle={isLoading ? "Chargement..." : "Aucun utilisateur trouve"}
          emptyDescription={
            isLoading
              ? "Recuperation des utilisateurs en cours."
              : "Ajustez la recherche pour voir les utilisateurs."
          }
          renderRow={(user) => {
            const statusLabel =
              typeof user.active === "boolean"
                ? user.active
                  ? "Actif"
                  : "Inactif"
                : user.status === "active"
                ? "Actif"
                : user.status === "inactive"
                ? "Inactif"
                : user.status || "Actif";

            return (
              <tr key={user.id}>
                <td>
                  <strong>{user.name}</strong>
                </td>
                <td>{user.email}</td>
                <td>
                  <Badge tone={user.role === "admin" ? "info" : "neutral"}>
                    {user.role === "admin" ? "admin" : "caissier"}
                  </Badge>
                </td>
                <td>
                  <Badge tone={statusLabel === "Actif" ? "success" : "warning"}>
                    {statusLabel}
                  </Badge>
                </td>
                <td>
                  <div className="table-action-row">
                    <button
                      className="table-action-button"
                      type="button"
                      onClick={() => openEditModal(user)}
                    >
                      Edit
                    </button>
                    <button
                      className="table-action-button"
                      type="button"
                      onClick={() => openPasswordModal(user)}
                    >
                      Changer mot de passe
                    </button>
                    <button className="table-action-button danger" type="button">
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            );
          }}
        />
      </SectionCard>

      <Modal
        isOpen={isAddModalOpen}
        eyebrow="Nouvel utilisateur"
        title="Ajouter un utilisateur"
        description="Renseignez les informations du compte. Le caissier sera rattache automatiquement au magasin SportZone et a la caisse 1."
        onClose={closeAddModal}
        actions={
          <>
            <button
              className="ghost-button"
              type="button"
              onClick={closeAddModal}
              disabled={isSubmittingAdd}
            >
              Annuler
            </button>
            <button
              className="primary-button"
              type="submit"
              form="add-user-form"
              disabled={isSubmittingAdd}
            >
              {isSubmittingAdd ? "Ajout en cours..." : "Ajouter utilisateur"}
            </button>
          </>
        }
      >
        <form className="form-grid" id="add-user-form" onSubmit={handleSubmitAdd}>
          {addModalError ? (
            <div className="inline-notice error">{addModalError}</div>
          ) : null}

          <div className="field-group">
            <label className="field-label" htmlFor="add-user-name">
              Nom
            </label>
            <input
              id="add-user-name"
              className="text-input"
              type="text"
              name="nom"
              value={addFormData.nom}
              onChange={handleAddFormChange}
              required
            />
          </div>

          <div className="field-group">
            <label className="field-label" htmlFor="add-user-email">
              Email
            </label>
            <input
              id="add-user-email"
              className="text-input"
              type="email"
              name="email"
              value={addFormData.email}
              onChange={handleAddFormChange}
              required
            />
          </div>

          <div className="field-group">
            <label className="field-label" htmlFor="add-user-password">
              Mot de passe
            </label>
            <input
              id="add-user-password"
              className="text-input"
              type="password"
              name="motDePasse"
              value={addFormData.motDePasse}
              onChange={handleAddFormChange}
              required
            />
          </div>

          <div className="field-group">
            <label className="field-label" htmlFor="add-user-role">
              Role
            </label>
            <select
              id="add-user-role"
              className="text-input select-input"
              name="role"
              value={addFormData.role}
              onChange={handleAddFormChange}
              required
            >
              <option value="admin">admin</option>
              <option value="employe">caissier</option>
            </select>
          </div>

          <label className="checkbox-field" htmlFor="add-user-active">
            <input
              id="add-user-active"
              type="checkbox"
              name="estActif"
              checked={addFormData.estActif}
              onChange={handleAddFormChange}
            />
            <span>Statut actif</span>
          </label>
        </form>
      </Modal>

      <Modal
        isOpen={editModal.isOpen}
        eyebrow="Edition utilisateur"
        title="Modifier l'utilisateur"
        description="Mettez a jour le nom, l'email et le role de l'utilisateur selectionne."
        onClose={closeEditModal}
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
              form="edit-user-form"
              disabled={isSubmittingEdit}
            >
              {isSubmittingEdit ? "Enregistrement..." : "Enregistrer"}
            </button>
          </>
        }
      >
        <form className="form-grid" id="edit-user-form" onSubmit={handleSubmitEdit}>
          {editModalError ? (
            <div className="inline-notice error">{editModalError}</div>
          ) : null}

          <div className="field-group">
            <label className="field-label" htmlFor="edit-user-name">
              Nom
            </label>
            <input
              id="edit-user-name"
              className="text-input"
              type="text"
              name="nom"
              value={editFormData.nom}
              onChange={handleEditFormChange}
              required
            />
          </div>

          <div className="field-group">
            <label className="field-label" htmlFor="edit-user-email">
              Email
            </label>
            <input
              id="edit-user-email"
              className="text-input"
              type="email"
              name="email"
              value={editFormData.email}
              onChange={handleEditFormChange}
              required
            />
          </div>

          <div className="field-group">
            <label className="field-label" htmlFor="edit-user-role">
              Role
            </label>
            <select
              id="edit-user-role"
              className="text-input select-input"
              name="role"
              value={editFormData.role}
              onChange={handleEditFormChange}
              required
            >
              <option value="admin">admin</option>
              <option value="employe">caissier</option>
            </select>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={passwordModal.isOpen}
        eyebrow="Securite utilisateur"
        title="Changer le mot de passe"
        description={
          passwordModal.user
            ? `Definissez un nouveau mot de passe pour ${passwordModal.user.name}.`
            : "Definissez un nouveau mot de passe."
        }
        onClose={closePasswordModal}
        actions={
          <>
            <button
              className="ghost-button"
              type="button"
              onClick={closePasswordModal}
              disabled={isSubmittingPassword}
            >
              Annuler
            </button>
            <button
              className="primary-button"
              type="submit"
              form="change-password-form"
              disabled={isSubmittingPassword}
            >
              {isSubmittingPassword ? "Enregistrement..." : "Changer mot de passe"}
            </button>
          </>
        }
      >
        <form
          className="form-grid"
          id="change-password-form"
          onSubmit={handleSubmitPassword}
        >
          {passwordModalError ? (
            <div className="inline-notice error">{passwordModalError}</div>
          ) : null}

          <div className="field-group">
            <label className="field-label" htmlFor="change-user-password">
              Nouveau mot de passe
            </label>
            <input
              id="change-user-password"
              className="text-input"
              type="password"
              name="newPassword"
              value={passwordFormData.newPassword}
              onChange={handlePasswordFormChange}
              placeholder="Nouveau12345"
              required
            />
          </div>
        </form>
      </Modal>
    </div>
  );
}

export default UsersPage;
