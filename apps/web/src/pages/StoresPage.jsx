import { useEffect, useState } from "react";
import api from "../services/api";
import Badge from "../components/Badge";
import PageHeader from "../components/PageHeader";
import SectionCard from "../components/SectionCard";
import { formatCurrencyDh } from "../utils/formatters";

function StoresPage() {
  const [stores, setStores] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function fetchStores() {
      try {
        setIsLoading(true);
        setErrorMessage("");

        const response = await api.get("/stores");
        const list = Array.isArray(response.data)
          ? response.data
          : response.data?.data || [];

        if (isMounted) {
          setStores(list);
        }
      } catch (error) {
        if (isMounted) {
          setErrorMessage(
            error.response?.data?.message ||
              "Impossible de charger les points de vente."
          );
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    fetchStores();

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <div>
      <PageHeader
        eyebrow="Points de vente"
        title="Reseau des magasins"
        description="Visualiser les points de vente, leur activite du jour et leur effectif affecte."
      />

      {errorMessage ? (
        <div className="inline-notice error">{errorMessage}</div>
      ) : null}

      <SectionCard
        title="Liste des magasins"
        description="Suivi rapide des performances et du statut operationnel."
      >
        <div className="store-grid">
          {isLoading ? (
            <div className="empty-state">Chargement des magasins...</div>
          ) : (
            stores.map((store) => {
              const statusLabel =
                typeof store.active === "boolean"
                  ? store.active
                    ? "Actif"
                    : "Inactif"
                  : store.status === "active"
                  ? "Actif"
                  : store.status === "inactive"
                  ? "Inactif"
                  : store.status || "Actif";

              return (
                <article className="store-card" key={store.id}>
                  <div className="store-card-header">
                    <div>
                      <p className="page-eyebrow">{store.city || "Magasin"}</p>
                      <h3 className="store-card-title">{store.name}</h3>
                    </div>
                    <Badge tone={statusLabel === "Actif" ? "success" : "warning"}>
                      {statusLabel}
                    </Badge>
                  </div>

                  <p className="store-card-address">{store.address || "-"}</p>

                  <div className="store-card-metrics">
                    <div className="detail-stat">
                      <span>Utilisateurs</span>
                      <strong>{store.usersCount || store.users?.length || 0}</strong>
                    </div>
                    <div className="detail-stat">
                      <span>CA du jour</span>
                      <strong>
                        {formatCurrencyDh(
                          store.todayRevenue || store.revenueToday || 0
                        )}
                      </strong>
                    </div>
                  </div>

                  <div className="store-card-actions">
                    <button className="table-action-button" type="button">
                      View details
                    </button>
                    <button className="table-action-button" type="button">
                      Edit
                    </button>
                  </div>
                </article>
              );
            })
          )}
        </div>
      </SectionCard>
    </div>
  );
}

export default StoresPage;
