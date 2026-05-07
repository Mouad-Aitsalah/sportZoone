import { useEffect, useMemo, useState } from "react";
import api from "../services/api";
import Badge from "../components/Badge";
import DataTable from "../components/DataTable";
import Modal from "../components/Modal";
import PageHeader from "../components/PageHeader";
import SalesLineChart from "../components/charts/SalesLineChart";
import SalesPieChart from "../components/charts/SalesPieChart";
import TopProductsChart from "../components/charts/TopProductsChart";
import SectionCard from "../components/SectionCard";
import StatCard from "../components/StatCard";
import { cleanupLegacyStoreCache, getStoresCollection } from "../utils/storeAccess";
import { formatCurrencyDh } from "../utils/formatters";

const periodOptions = [
  { key: "week", label: "7 derniers jours" },
  { key: "month", label: "Mensuel" },
];

const emptySalesMessage = "Pas encore de donnees de vente pour cette periode.";

function DashboardPage() {
  const [period, setPeriod] = useState("week");
  const [analytics, setAnalytics] = useState(null);
  const [stores, setStores] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAlertsModalOpen, setIsAlertsModalOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function fetchDashboardData() {
      try {
        cleanupLegacyStoreCache();
        setIsLoading(true);
        setErrorMessage("");

        const [analyticsResponse, alertsResponse, storesResponse] = await Promise.all([
          api.get("/analytics", {
            params: { period },
          }),
          api.get("/stocks/alerts"),
          api.get("/stores"),
        ]);

        if (isMounted) {
          setAnalytics(analyticsResponse.data || null);
          setAlerts(Array.isArray(alertsResponse.data) ? alertsResponse.data : []);
          setStores(getStoresCollection(storesResponse.data));
        }
      } catch (error) {
        if (isMounted) {
          setAnalytics(null);
          setStores([]);
          setAlerts([]);
          setErrorMessage(
            error.response?.data?.message ||
              "Impossible de charger les donnees du dashboard."
          );
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    fetchDashboardData();

    return () => {
      isMounted = false;
    };
  }, [period]);

  const scopedStoreNames = useMemo(
    () => new Set(stores.map((store) => String(store.name || "").trim()).filter(Boolean)),
    [stores]
  );
  const scopedAlerts = useMemo(() => {
    if (!alerts.length) {
      return [];
    }

    if (!stores.length) {
      return alerts;
    }

    const scopedStoreIds = new Set(stores.map((store) => Number(store.id)));

    return alerts.filter((item) => scopedStoreIds.has(Number(item.magasinId)));
  }, [alerts, stores]);
  const resolvedBestStore = useMemo(() => {
    if (!analytics?.bestStore?.name) {
      return null;
    }

    if (!scopedStoreNames.size || scopedStoreNames.has(String(analytics.bestStore.name).trim())) {
      return analytics.bestStore;
    }

    return null;
  }, [analytics, scopedStoreNames]);

  const hasSales = Boolean(analytics?.hasSales);
  const lowStockCount = scopedAlerts.length;
  const criticalStockCount = scopedAlerts.filter(
    (alert) => alert.severity === "critical"
  ).length;
  const warningStockCount = lowStockCount - criticalStockCount;

  const stats = useMemo(
    () => [
      {
        label: "Revenu",
        value: isLoading
          ? "Chargement..."
          : formatCurrencyDh(analytics?.revenue || 0),
        detail:
          period === "week"
            ? "Cumule sur les 7 derniers jours."
            : "Cumule sur le mois en cours.",
        tone: "success",
      },
      {
        label: "Nombre de ventes",
        value: isLoading ? "Chargement..." : analytics?.salesCount || 0,
        detail: "Transactions validees sur la periode selectionnee.",
        tone: "info",
      },
      {
        label: "Panier moyen",
        value: isLoading
          ? "Chargement..."
          : formatCurrencyDh(analytics?.averageBasket || 0),
        detail: "Montant moyen par ticket valide.",
        tone: "default",
      },
      {
        label: "Magasin suivi",
        value: isLoading
          ? "Chargement..."
          : resolvedBestStore?.name || "SportZone",
        detail: resolvedBestStore
          ? `${formatCurrencyDh(resolvedBestStore.revenue || 0)} sur la periode.`
          : "Le magasin unique SportZone sera affiche ici.",
        tone: "warning",
      },
    ],
    [analytics, isLoading, period, resolvedBestStore]
  );

  return (
    <div>
      <PageHeader
        eyebrow="Overview"
        title="Dashboard"
        description="Suivre la performance commerciale, les tendances de ventes et les alertes stock du magasin SportZone."
        actions={
          <>
            <div className="period-selector">
              {periodOptions.map((option) => (
                <button
                  key={option.key}
                  className={`period-button ${period === option.key ? "active" : ""}`}
                  type="button"
                  onClick={() => setPeriod(option.key)}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <button
              className="ghost-button"
              type="button"
              onClick={() => setIsAlertsModalOpen(true)}
            >
              Voir alertes
            </button>
          </>
        }
      />

      {errorMessage ? <div className="inline-notice error">{errorMessage}</div> : null}

      {!isLoading && !errorMessage && !hasSales ? (
        <div className="inline-notice info">{emptySalesMessage}</div>
      ) : null}

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
        title="Alertes stock"
        description="Produits en rupture ou sous seuil minimum dans le magasin SportZone."
        actions={
          <button
            className="ghost-button"
            type="button"
            onClick={() => setIsAlertsModalOpen(true)}
          >
            Voir alertes
          </button>
        }
      >
        <div className="stock-alert-summary">
          <div className="stock-alert-summary-card critical">
            <span>Produits en rupture</span>
            <strong>{isLoading ? "..." : criticalStockCount}</strong>
          </div>
          <div className="stock-alert-summary-card warning">
            <span>Produits en stock faible</span>
            <strong>{isLoading ? "..." : warningStockCount}</strong>
          </div>
        </div>

        <div className="dashboard-alert-list">
          <div className="alert-item">
            <div>
              <strong>Alertes actives</strong>
              <span>
                {isLoading
                  ? "Analyse des seuils en cours."
                  : `${lowStockCount} produits necessitent une attention.`}
              </span>
            </div>
            <Badge tone={criticalStockCount > 0 ? "stock-critical" : "stock-warning"}>
              {isLoading ? "..." : lowStockCount}
            </Badge>
          </div>

          <div className="alert-item">
            <div>
              <strong>Ruptures critiques</strong>
              <span>Produits a zero a reapprovisionner en priorite.</span>
            </div>
            <Badge tone={criticalStockCount > 0 ? "stock-critical" : "neutral"}>
              {isLoading ? "..." : criticalStockCount}
            </Badge>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="Evolution des ventes"
        description="Lecture rapide du revenu jour apres jour sur la periode selectionnee."
        className="analytics-card dashboard-hero-chart"
      >
        <SalesLineChart
          data={analytics?.salesEvolution || []}
          loading={isLoading}
          emptyTitle="Aucune evolution disponible"
          emptyDescription={emptySalesMessage}
        />
      </SectionCard>

      <div className="analytics-grid">
        <SectionCard
          title="Repartition par categorie"
          description="Poids des categories reelles dans le chiffre d'affaires."
          className="analytics-card"
        >
          <SalesPieChart
            data={analytics?.salesDistribution || []}
            loading={isLoading}
            emptyTitle="Aucune categorie vendue"
            emptyDescription={emptySalesMessage}
          />
        </SectionCard>
        <SectionCard
          title="Top produits"
          description="Produits reels les plus vendus en quantite sur la periode selectionnee."
          className="analytics-card"
        >
          <TopProductsChart
            data={analytics?.topProducts || []}
            loading={isLoading}
            limit={5}
            emptyTitle="Aucun produit vendu"
            emptyDescription={emptySalesMessage}
          />
        </SectionCard>
      </div>

      <Modal
        isOpen={isAlertsModalOpen}
        eyebrow="Surveillance stock"
        title="Alertes de stock"
        description="Liste des produits dont la quantite est inferieure ou egale au seuil minimum."
        onClose={() => setIsAlertsModalOpen(false)}
        cardClassName="modal-large stock-alert-modal"
        headerClassName="stock-alert-modal-header"
        bodyClassName="stock-alert-modal-body"
        actionsClassName="stock-alert-modal-actions"
        actions={
          <button
            className="ghost-button"
            type="button"
            onClick={() => setIsAlertsModalOpen(false)}
          >
            Fermer
          </button>
        }
      >
        <div className="stock-alert-summary">
          <div className="stock-alert-summary-card critical">
            <span>Produits en rupture</span>
            <strong>{isLoading ? "..." : criticalStockCount}</strong>
          </div>
          <div className="stock-alert-summary-card warning">
            <span>Produits en stock faible</span>
            <strong>{isLoading ? "..." : warningStockCount}</strong>
          </div>
        </div>

        <div className="stock-alert-table-wrap">
          <DataTable
            columns={[
              { key: "product", label: "Produit" },
              { key: "quantity", label: "Quantite" },
              { key: "minimumThreshold", label: "Seuil minimum" },
              { key: "status", label: "Statut" },
            ]}
            data={scopedAlerts}
            emptyTitle={isLoading ? "Chargement..." : "Aucune alerte active"}
            emptyDescription={
              isLoading
                ? "Recuperation des alertes en cours."
                : "Tous les produits sont au-dessus du seuil minimum."
            }
            renderRow={(item) => (
              <tr
                key={`${item.produitId}-${item.magasinId}`}
                className={
                  item.severity === "critical"
                    ? "stock-row-critical stock-alert-critical"
                    : "stock-row-warning"
                }
              >
                <td>{item.produitNom}</td>
                <td>{item.quantite}</td>
                <td>{item.seuilMinimum}</td>
                <td>
                  <Badge
                    tone={
                      item.severity === "critical"
                        ? "stock-critical"
                        : "stock-warning"
                    }
                  >
                    {item.severity === "critical" ? "Stock critique" : "Stock faible"}
                  </Badge>
                </td>
              </tr>
            )}
          />
        </div>
      </Modal>
    </div>
  );
}

export default DashboardPage;
