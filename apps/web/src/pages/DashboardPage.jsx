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
import { getCurrentUser } from "../store/authStore";
import { cleanupLegacyStoreCache, getStoresCollection } from "../utils/storeAccess";
import { CACHE_KEYS, CACHE_TTL_MS, readCache, writeCache } from "../utils/appCache";
import { formatCurrencyDh, formatDateOnly } from "../utils/formatters";

const periodOptions = [
  { key: "week", label: "7 derniers jours" },
  { key: "month", label: "Mensuel" },
];

const emptySalesMessage = "Pas encore de donnees de vente pour cette periode.";

const getSlowMovingMeta = (item) => {
  if (Number(item?.quantitySold30Days || 0) <= 0) {
    return {
      badgeTone: "danger",
      rowClassName: "stock-row-critical",
    };
  }

  return {
    badgeTone: "stock-warning",
    rowClassName: "stock-row-warning",
  };
};

function DashboardPage() {
  const currentUser = getCurrentUser();
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
      const analyticsCache = readCache(CACHE_KEYS.analytics(period), CACHE_TTL_MS);
      const alertsCache = readCache(CACHE_KEYS.stockAlerts(), CACHE_TTL_MS);
      const storesCache = readCache(CACHE_KEYS.stores(), CACHE_TTL_MS);
      const hasCachedData = Boolean(analyticsCache || alertsCache || storesCache);

      if (analyticsCache && isMounted) {
        setAnalytics(analyticsCache.data || null);
      }

      if (alertsCache && isMounted) {
        setAlerts(Array.isArray(alertsCache.data) ? alertsCache.data : []);
      }

      if (storesCache && isMounted) {
        setStores(Array.isArray(storesCache.data) ? storesCache.data : []);
      }

      try {
        cleanupLegacyStoreCache();
        setIsLoading(!hasCachedData);
        setErrorMessage("");

        const [analyticsResult, alertsResult, storesResult] = await Promise.allSettled([
          api.get("/analytics", {
            params: { period },
          }),
          api.get("/stocks/alerts"),
          api.get("/stores"),
        ]);

        if (isMounted) {
          const analyticsError =
            analyticsResult.status === "rejected" ? analyticsResult.reason : null;
          const alertsError = alertsResult.status === "rejected" ? alertsResult.reason : null;
          const storesError = storesResult.status === "rejected" ? storesResult.reason : null;

          if (analyticsResult.status === "fulfilled") {
            const nextAnalytics = analyticsResult.value.data || null;
            setAnalytics(nextAnalytics);
            writeCache(CACHE_KEYS.analytics(period), nextAnalytics);
          } else if (!analyticsCache) {
            setAnalytics(null);
          }

          if (alertsResult.status === "fulfilled") {
            const nextAlerts = Array.isArray(alertsResult.value.data)
              ? alertsResult.value.data
              : [];
            setAlerts(nextAlerts);
            writeCache(CACHE_KEYS.stockAlerts(), nextAlerts);
          } else if (!alertsCache) {
            setAlerts([]);
          }

          if (storesResult.status === "fulfilled") {
            const nextStores = getStoresCollection(storesResult.value.data);
            setStores(nextStores);
            writeCache(CACHE_KEYS.stores(), nextStores);
          } else if (!storesCache) {
            setStores([]);
          }

          if (analyticsError && !hasCachedData) {
            setErrorMessage(
              analyticsError.response?.data?.message ||
                "Impossible de charger les donnees principales du dashboard."
            );
          }

          if (alertsError || storesError) {
            console.error("Dashboard secondary requests failed", {
              alertsError,
              storesError,
            });
          }
        }
      } catch (error) {
        if (isMounted && !hasCachedData) {
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
  const organisationName = useMemo(() => {
    const currentOrganisationName = String(currentUser?.organisationName || "").trim();

    if (currentOrganisationName) {
      return currentOrganisationName;
    }

    const analyticsOrganisationName = String(analytics?.organisationName || "").trim();

    return analyticsOrganisationName || "SportZone";
  }, [analytics, currentUser?.organisationName]);
  const slowMovingProducts = useMemo(
    () => (Array.isArray(analytics?.slowMovingProducts) ? analytics.slowMovingProducts : []),
    [analytics]
  );

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
          : organisationName,
        detail: `${formatCurrencyDh(resolvedBestStore?.revenue || analytics?.revenue || 0)} sur la periode.`,
        tone: "warning",
      },
      {
        label: "Charges du mois",
        value: isLoading
          ? "Chargement..."
          : formatCurrencyDh(analytics?.currentMonthExpenses || 0),
        detail: "Total des depenses du mois courant.",
        tone: "danger",
      },
    ],
    [analytics, isLoading, organisationName, period, resolvedBestStore]
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

      <SectionCard
        title="Produits a faible rotation"
        description="Articles en stock mais rarement vendus."
        className="analytics-card"
      >
        <div className="dashboard-compact-table-wrap">
          <DataTable
            columns={[
              { key: "product", label: "Produit" },
              { key: "variant", label: "Variante" },
              { key: "stock", label: "Stock" },
              { key: "sold", label: "Vendus 30j" },
              { key: "lastSale", label: "Derniere vente" },
              { key: "status", label: "Statut" },
            ]}
            data={slowMovingProducts}
            emptyTitle={isLoading ? "Chargement..." : "Aucun produit a faible rotation"}
            emptyDescription="Les articles en stock avec peu de ventes apparaitront ici."
            renderRow={(item) => {
              const meta = getSlowMovingMeta(item);

              return (
                <tr
                  key={`${item.productId}-${item.variantId || "base"}`}
                  className={meta.rowClassName}
                >
                  <td>
                    <strong>{item.productName || "-"}</strong>
                  </td>
                  <td>{item.variantName || "-"}</td>
                  <td>{Number(item.stock || 0)}</td>
                  <td>{Number(item.quantitySold30Days || 0)}</td>
                  <td>
                    {item.lastSaleDate ? (
                      <>
                        <div>{formatDateOnly(item.lastSaleDate)}</div>
                        <div className="table-subtext">Derniere vente connue</div>
                      </>
                    ) : (
                      <span>-</span>
                    )}
                  </td>
                  <td>
                    <Badge tone={meta.badgeTone}>{item.status || "-"}</Badge>
                  </td>
                </tr>
              );
            }}
          />
        </div>
      </SectionCard>

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
