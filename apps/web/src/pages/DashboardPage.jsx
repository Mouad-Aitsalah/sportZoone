import { useEffect, useMemo, useState } from "react";
import api from "../services/api";
import Badge from "../components/Badge";
import DataTable from "../components/DataTable";
import PageHeader from "../components/PageHeader";
import SectionCard from "../components/SectionCard";
import StatCard from "../components/StatCard";
import TopSellingList from "../components/TopSellingList";
import { formatCurrencyDh } from "../utils/formatters";

const periodOptions = [
  { key: "day", label: "Jour" },
  { key: "week", label: "Semaine" },
  { key: "month", label: "Mois" },
];

function DashboardPage() {
  const [period, setPeriod] = useState("day");
  const [report, setReport] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function fetchReport() {
      try {
        setIsLoading(true);
        setErrorMessage("");

        const response = await api.get("/reports", {
          params: { period },
        });

        if (isMounted) {
          setReport(response.data);
        }
      } catch (error) {
        if (isMounted) {
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

    fetchReport();

    return () => {
      isMounted = false;
    };
  }, [period]);

  const stats = useMemo(
    () => [
      {
        label: "Revenu",
        value: isLoading
          ? "Chargement..."
          : formatCurrencyDh(report?.revenue || 0),
        detail: "Chiffre d'affaires de la periode selectionnee.",
        tone: "success",
      },
      {
        label: "Nombre de ventes",
        value: isLoading ? "Chargement..." : report?.salesCount || 0,
        detail: "Transactions enregistrees sur la periode.",
        tone: "info",
      },
      {
        label: "Panier moyen",
        value: isLoading
          ? "Chargement..."
          : formatCurrencyDh(report?.averageBasket || 0),
        detail: "Montant moyen par ticket.",
        tone: "default",
      },
      {
        label: "Meilleur magasin",
        value: isLoading ? "Chargement..." : report?.bestStore || "-",
        detail: "Point de vente le plus performant.",
        tone: "warning",
      },
    ],
    [isLoading, report]
  );

  const topProducts = useMemo(
    () =>
      (report?.topProducts || []).map((product) => ({
        name: product.name || product.productName || "Produit",
        unitsSold: product.quantitySold || product.quantity || product.unitsSold || 0,
        store: product.store || report?.bestStore || "Reseau",
        revenue: product.revenue || 0,
      })),
    [report]
  );

  const salesByStore = report?.salesByStore || [];

  return (
    <div>
      <PageHeader
        eyebrow="Overview"
        title="Dashboard"
        description="Suivre la performance commerciale et les indicateurs cles du reseau en temps reel."
        actions={
          <div className="period-selector">
            {periodOptions.map((option) => (
              <button
                key={option.key}
                className={`period-button ${
                  period === option.key ? "active" : ""
                }`}
                type="button"
                onClick={() => setPeriod(option.key)}
              >
                {option.label}
              </button>
            ))}
          </div>
        }
      />

      {errorMessage ? (
        <div className="inline-notice error">{errorMessage}</div>
      ) : null}

      <div className="card-grid">
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

      <div className="dashboard-grid">
        <SectionCard
          title="Top produits"
          description="Meilleures references sur la periode selectionnee."
        >
          {isLoading ? (
            <div className="empty-state">Chargement des top produits...</div>
          ) : (
            <TopSellingList products={topProducts} />
          )}
        </SectionCard>

        <SectionCard
          title="Ventes par magasin"
          description="Comparaison du chiffre d'affaires et du volume des ventes."
        >
          <DataTable
            columns={[
              { key: "store", label: "Magasin" },
              { key: "salesCount", label: "Nb ventes" },
              { key: "revenue", label: "Revenu" },
            ]}
            data={salesByStore}
            emptyTitle={isLoading ? "Chargement..." : "Aucune donnee disponible"}
            emptyDescription={
              isLoading
                ? "Recuperation du rapport en cours."
                : "Aucune synthese magasin disponible."
            }
            renderRow={(item, index) => (
              <tr key={`${item.store || item.storeName || "store"}-${index}`}>
                <td>{item.store || item.storeName || "-"}</td>
                <td>{item.salesCount || item.count || 0}</td>
                <td>{formatCurrencyDh(item.revenue || 0)}</td>
              </tr>
            )}
          />
        </SectionCard>
      </div>

      <div className="dashboard-grid dashboard-secondary-grid">
        <SectionCard
          title="Vue operationnelle"
          description="Resume rapide de la periode active."
        >
          <div className="alert-list">
            <div className="alert-item">
              <div>
                <strong>Periode active</strong>
                <span>Analyse actuellement affichee sur {period}.</span>
              </div>
              <Badge tone="info">{period}</Badge>
            </div>

            <div className="alert-item">
              <div>
                <strong>Magasin leader</strong>
                <span>{report?.bestStore || "En attente de donnees"}</span>
              </div>
              <Badge tone="success">
                {isLoading ? "..." : formatCurrencyDh(report?.revenue || 0)}
              </Badge>
            </div>

            <div className="alert-item">
              <div>
                <strong>Panier moyen</strong>
                <span>Valeur moyenne observee sur la periode.</span>
              </div>
              <Badge tone="neutral">
                {isLoading
                  ? "..."
                  : formatCurrencyDh(report?.averageBasket || 0)}
              </Badge>
            </div>
          </div>
        </SectionCard>

        <SectionCard
          title="Synthese ventes"
          description="Volume global remonte par l'API de reporting."
        >
          <div className="alert-list">
            <div className="alert-item">
              <div>
                <strong>Transactions</strong>
                <span>Nombre total de ventes sur la periode.</span>
              </div>
              <Badge tone="info">
                {isLoading ? "..." : report?.salesCount || 0}
              </Badge>
            </div>

            <div className="alert-item">
              <div>
                <strong>Top produit</strong>
                <span>
                  {topProducts[0]?.name || "Aucun produit disponible pour le moment."}
                </span>
              </div>
              <Badge tone="warning">
                {isLoading ? "..." : topProducts[0]?.unitsSold || 0}
              </Badge>
            </div>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}

export default DashboardPage;
