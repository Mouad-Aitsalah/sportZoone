import { useEffect, useMemo, useState } from "react";
import api from "../services/api";
import DataTable from "../components/DataTable";
import PageHeader from "../components/PageHeader";
import SectionCard from "../components/SectionCard";
import StatCard from "../components/StatCard";
import { formatCurrencyDh } from "../utils/formatters";

const periodOptions = [
  { key: "day", label: "Jour" },
  { key: "week", label: "Semaine" },
  { key: "month", label: "Mois" },
];

function ReportsPage() {
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
          setReport(response.data || null);
        }
      } catch (error) {
        if (isMounted) {
          setErrorMessage(
            error.response?.data?.message ||
              "Impossible de charger les rapports pour le moment."
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

  const statItems = useMemo(
    () => [
      {
        label: "Revenu",
        value: isLoading ? "Chargement..." : formatCurrencyDh(report?.revenue || 0),
        detail: "Chiffre d'affaires cumule de la periode.",
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
        detail: "Valeur moyenne d'un ticket.",
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

  return (
    <div>
      <PageHeader
        eyebrow="Rapports"
        title="Rapports analytiques"
        description="Comparer les ventes par periode, magasin et produit pour faciliter les decisions operationnelles."
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
        {statItems.map((item) => (
          <StatCard
            key={item.label}
            label={item.label}
            value={item.value}
            detail={item.detail}
            tone={item.tone}
          />
        ))}
      </div>

      <div className="dashboard-grid dashboard-secondary-grid">
        <SectionCard
          title="Ventes par magasin"
          description="Synthese du chiffre d'affaires et du volume de tickets."
        >
          <DataTable
            columns={[
              { key: "store", label: "Magasin" },
              { key: "salesCount", label: "Nb ventes" },
              { key: "revenue", label: "Revenu" },
            ]}
            data={report?.salesByStore || []}
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

        <SectionCard
          title="Top produits"
          description="Produits leaders de la periode selectionnee."
        >
          <DataTable
            columns={[
              { key: "name", label: "Produit" },
              { key: "quantity", label: "Quantite" },
              { key: "revenue", label: "Revenu" },
            ]}
            data={report?.topProducts || []}
            emptyTitle={isLoading ? "Chargement..." : "Aucun produit disponible"}
            emptyDescription={
              isLoading
                ? "Recuperation du rapport en cours."
                : "Aucun top produit disponible pour cette periode."
            }
            renderRow={(item, index) => (
              <tr key={`${item.name || item.productName || "product"}-${index}`}>
                <td>{item.name || item.productName || "-"}</td>
                <td>{item.quantitySold || item.quantity || item.unitsSold || 0}</td>
                <td>{formatCurrencyDh(item.revenue || 0)}</td>
              </tr>
            )}
          />
        </SectionCard>
      </div>
    </div>
  );
}

export default ReportsPage;
