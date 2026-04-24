import { useEffect, useMemo, useState } from "react";
import api from "../services/api";
import Badge from "../components/Badge";
import DataTable from "../components/DataTable";
import PageHeader from "../components/PageHeader";
import SearchInput from "../components/SearchInput";
import SectionCard from "../components/SectionCard";

function UsersPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function fetchUsers() {
      try {
        setIsLoading(true);
        setErrorMessage("");

        const response = await api.get("/users");
        const list = Array.isArray(response.data)
          ? response.data
          : response.data?.data || [];

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

    fetchUsers();

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

        const storeName = user.storeName || user.store?.name || "";

        return (
          user.name?.toLowerCase().includes(query) ||
          user.email?.toLowerCase().includes(query) ||
          storeName.toLowerCase().includes(query)
        );
      }),
    [searchTerm, users]
  );

  return (
    <div>
      <PageHeader
        eyebrow="Utilisateurs"
        title="Gestion des utilisateurs"
        description="Suivre les comptes admin et employe, avec leur magasin d'affectation et leur statut."
        actions={
          <button className="primary-button" type="button">
            Ajouter utilisateur
          </button>
        }
      />

      <SectionCard
        title="Liste des utilisateurs"
        description="Recherche par nom, email ou point de vente."
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
            { key: "store", label: "Magasin" },
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
                    {user.role}
                  </Badge>
                </td>
                <td>{user.storeName || user.store?.name || "-"}</td>
                <td>
                  <Badge tone={statusLabel === "Actif" ? "success" : "warning"}>
                    {statusLabel}
                  </Badge>
                </td>
                <td>
                  <div className="table-action-row">
                    <button className="table-action-button" type="button">
                      Edit
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
    </div>
  );
}

export default UsersPage;
