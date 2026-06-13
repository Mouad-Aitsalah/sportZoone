import { useEffect, useMemo, useState } from "react";
import api from "../services/api";
import Badge from "../components/Badge";
import DataTable from "../components/DataTable";
import PageHeader from "../components/PageHeader";
import SectionCard from "../components/SectionCard";
import StatCard from "../components/StatCard";
import { downloadBlob } from "../utils/downloadBlob";
import { formatCurrencyDh } from "../utils/formatters";

const periodOptions = [
  { key: "day", label: "Jour" },
  { key: "week", label: "Semaine" },
  { key: "month", label: "Mois" },
];

const EXPENSE_CATEGORY_LABELS = {
  ELECTRICITE: "Electricite",
  EAU: "Eau",
  LOYER: "Loyer",
  REPARATION: "Reparation",
  TRANSPORT: "Transport",
  CARBURANT: "Carburant",
  INTERNET: "Internet",
  SALAIRE: "Salaire",
  AUTRE: "Autre",
};

function ReportsPage() {
  const [period, setPeriod] = useState("day");
  const [report, setReport] = useState(null);
  const [stores, setStores] = useState([]);
  const [autoReportEnabled, setAutoReportEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isExportingExcel, setIsExportingExcel] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isTogglingAutoReport, setIsTogglingAutoReport] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [storesError, setStoresError] = useState("");
  const [storeExportError, setStoreExportError] = useState("");
  const [autoReportError, setAutoReportError] = useState("");
  const [autoReportNotice, setAutoReportNotice] = useState("");
  const [exportingStoreId, setExportingStoreId] = useState(null);
  const [exportingStoreFormat, setExportingStoreFormat] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function fetchReport() {
      try {
        setIsLoading(true);
        setErrorMessage("");
        setStoresError("");

        const [reportResponse, storesResponse] = await Promise.all([
          api.get("/reports", {
            params: { period },
          }),
          api.get("/stores"),
        ]);

        if (isMounted) {
          setReport(reportResponse.data || null);
          setStores(
            Array.isArray(storesResponse.data)
              ? storesResponse.data
              : storesResponse.data?.data || []
          );
        }
      } catch (error) {
        if (isMounted) {
          const message =
            error.response?.data?.message ||
            "Impossible de charger les rapports pour le moment.";
          setErrorMessage(message);
          setStoresError(
            error.response?.data?.message ||
              "Impossible de charger les points de vente pour le moment."
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

  useEffect(() => {
    let isMounted = true;

    async function fetchAutoReportStatus() {
      try {
        setAutoReportError("");

        const response = await api.get("/reports/auto-status");

        if (isMounted) {
          setAutoReportEnabled(Boolean(response.data?.isActive));
        }
      } catch (error) {
        if (isMounted) {
          setAutoReportError(
            error.response?.data?.message ||
              "Impossible de charger le statut du rapport automatique."
          );
        }
      }
    }

    fetchAutoReportStatus();

    return () => {
      isMounted = false;
    };
  }, []);

  const statItems = useMemo(
    () => [
      {
        label: "Revenu",
        value: isLoading ? "Chargement..." : formatCurrencyDh(report?.revenue || 0),
        detail: "Chiffre d'affaires cumule de la periode.",
        tone: "success",
      },
      {
        label: "Benefice net",
        value: isLoading ? "Chargement..." : formatCurrencyDh(report?.netProfit || 0),
        detail: "Marge nette apres deduction du cout d'achat et des charges.",
        tone: "info",
      },
      {
        label: "Charges",
        value: isLoading ? "Chargement..." : formatCurrencyDh(report?.expensesTotal || 0),
        detail: "Total des depenses enregistrees sur la periode.",
        tone: "info",
      },
      {
        label: "Nombre de ventes",
        value: isLoading ? "Chargement..." : report?.salesCount || 0,
        detail: "Transactions enregistrees sur la periode.",
        tone: "default",
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

  const revenueByStoreName = useMemo(
    () =>
      new Map(
        (report?.salesByStore || []).map((item) => [
          item.storeName || item.store,
          item.revenue || 0,
        ])
      ),
    [report]
  );

  const handleExportReport = async (format) => {
    try {
      if (format === "excel") {
        setIsExportingExcel(true);
      } else {
        setIsExportingPdf(true);
      }

      setErrorMessage("");

      const response = await api.get(`/exports/reports/${format}`, {
        params: { period },
        responseType: "blob",
      });

      downloadBlob(
        response,
        format === "excel" ? `report-${period}.xlsx` : `report-${period}.pdf`
      );
    } catch (error) {
      if (error.response?.data instanceof Blob) {
        const message = await error.response.data.text();
        setErrorMessage(message || "Impossible d'exporter le rapport.");
      } else {
        setErrorMessage(
          error.response?.data?.message ||
            "Impossible d'exporter le rapport pour le moment."
        );
      }
    } finally {
      setIsExportingExcel(false);
      setIsExportingPdf(false);
    }
  };

  const buildStoreFilename = (storeName, format) => {
    const safeStoreName = String(storeName || "magasin")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-+|-+$/g, "");

    return `rapport-magasin-${safeStoreName || "magasin"}-${period}.${format}`;
  };

  const handleExportStore = async (store, format) => {
    try {
      setStoreExportError("");
      setExportingStoreId(store.id);
      setExportingStoreFormat(format);

      const response = await api.get(`/exports/stores/${store.id}/${format}`, {
        params: { period },
        responseType: "blob",
      });

      downloadBlob(response, buildStoreFilename(store.name, format));
    } catch (error) {
      if (error.response?.data instanceof Blob) {
        const message = await error.response.data.text();
        setStoreExportError(message || "Erreur lors de l'export du rapport magasin.");
      } else {
        setStoreExportError("Erreur lors de l'export du rapport magasin.");
      }
    } finally {
      setExportingStoreId(null);
      setExportingStoreFormat("");
    }
  };

  const handleToggleAutoReport = async (event) => {
    const nextValue = event.target.checked;

    try {
      setIsTogglingAutoReport(true);
      setAutoReportError("");
      setAutoReportNotice("");

      const response = await api.post("/reports/auto-toggle", {
        isActive: nextValue,
      });

      setAutoReportEnabled(Boolean(response.data?.isActive));
      setAutoReportNotice(
        nextValue
          ? "Envoi automatique active."
          : "Envoi automatique desactive."
      );
    } catch (error) {
      setAutoReportError(
        error.response?.data?.message ||
          "Impossible de mettre a jour l'envoi automatique."
      );
    } finally {
      setIsTogglingAutoReport(false);
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow="Rapports"
        title="Rapports analytiques"
        description="Comparer les ventes par periode, magasin et produit pour faciliter les decisions operationnelles."
        actions={
          <>
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
            <div className="page-actions">
              <button
                className="ghost-button"
                type="button"
                onClick={() => handleExportReport("excel")}
                disabled={isExportingExcel || isExportingPdf}
              >
                {isExportingExcel ? "Export Excel..." : "Exporter Excel"}
              </button>
              <button
                className="primary-button"
                type="button"
                onClick={() => handleExportReport("pdf")}
                disabled={isExportingExcel || isExportingPdf}
              >
                {isExportingPdf ? "Export PDF..." : "Exporter PDF"}
              </button>
            </div>
          </>
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
          description="Synthese du chiffre d'affaires, du volume de tickets et des charges."
        >
          <DataTable
            columns={[
              { key: "store", label: "Magasin" },
              { key: "salesCount", label: "Nb ventes" },
              { key: "revenue", label: "Revenu" },
              { key: "expenses", label: "Charges" },
              { key: "netProfit", label: "Benefice net" },
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
                <td>{formatCurrencyDh(item.expenses || 0)}</td>
                <td>{formatCurrencyDh(item.netProfit || 0)}</td>
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
              { key: "netProfit", label: "Benefice net" },
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
                <td>{formatCurrencyDh(item.netProfit || 0)}</td>
              </tr>
            )}
          />
        </SectionCard>
      </div>

      <div className="dashboard-grid">
        <SectionCard
          title="Charges par categorie"
          description="Total des depenses regroupees par categorie sur la periode."
        >
          <DataTable
            columns={[
              { key: "category", label: "Categorie" },
              { key: "total", label: "Total charges" },
            ]}
            data={report?.expensesByCategory || []}
            emptyTitle={isLoading ? "Chargement..." : "Aucune charge"}
            emptyDescription={
              isLoading
                ? "Recuperation des charges en cours."
                : "Aucune depense n'a ete enregistree sur cette periode."
            }
            renderRow={(item, index) => (
              <tr key={`${item.category || "category"}-${index}`}>
                <td>{EXPENSE_CATEGORY_LABELS[item.category] || item.category || "-"}</td>
                <td>{formatCurrencyDh(item.total || 0)}</td>
              </tr>
            )}
          />
        </SectionCard>

        <SectionCard
          title="Charges par magasin"
          description="Volume des depenses enregistrees par point de vente."
        >
          <DataTable
            columns={[
              { key: "store", label: "Magasin" },
              { key: "count", label: "Nb charges" },
              { key: "total", label: "Total charges" },
            ]}
            data={report?.expensesByStore || []}
            emptyTitle={isLoading ? "Chargement..." : "Aucune charge magasin"}
            emptyDescription={
              isLoading
                ? "Recuperation des charges en cours."
                : "Aucune charge magasin disponible pour cette periode."
            }
            renderRow={(item, index) => (
              <tr key={`${item.storeName || "store"}-${index}`}>
                <td>{item.storeName || "-"}</td>
                <td>{item.expensesCount || 0}</td>
                <td>{formatCurrencyDh(item.totalExpenses || 0)}</td>
              </tr>
            )}
          />
        </SectionCard>
      </div>

      <SectionCard
        title="Rapports par magasin"
        description="Exporter un rapport detaille pour chaque point de vente."
      >
        {storeExportError ? (
          <div className="inline-notice error">{storeExportError}</div>
        ) : null}

        {storesError ? <div className="inline-notice error">{storesError}</div> : null}

        <div className="store-grid">
          {isLoading && !stores.length ? (
            <div className="empty-state">Chargement des magasins...</div>
          ) : stores.length ? (
            stores.map((store) => {
              const currentPeriodRevenue =
                revenueByStoreName.get(store.name) ??
                store.todayRevenue ??
                store.revenueToday ??
                0;

              return (
                <article className="store-card" key={store.id}>
                  <div className="store-card-header">
                    <div>
                      <p className="page-eyebrow">{store.city || "Magasin"}</p>
                      <h3 className="store-card-title">{store.name}</h3>
                    </div>
                    <Badge tone="info">{period}</Badge>
                  </div>

                  <p className="store-card-address">{store.address || "-"}</p>

                  <div className="store-card-metrics">
                    <div className="detail-stat">
                      <span>Utilisateurs</span>
                      <strong>{store.usersCount || 0}</strong>
                    </div>
                    <div className="detail-stat">
                      <span>Caisses</span>
                      <strong>{store.cashRegistersCount || 0}</strong>
                    </div>
                    <div className="detail-stat">
                      <span>CA periode</span>
                      <strong>{formatCurrencyDh(currentPeriodRevenue)}</strong>
                    </div>
                  </div>

                  <div className="store-card-actions">
                    <button
                      className="primary-button"
                      type="button"
                      onClick={() => handleExportStore(store, "pdf")}
                      disabled={Boolean(exportingStoreId)}
                    >
                      {exportingStoreId === store.id && exportingStoreFormat === "pdf"
                        ? "Export..."
                        : "Exporter PDF"}
                    </button>
                    <button
                      className="ghost-button"
                      type="button"
                      onClick={() => handleExportStore(store, "excel")}
                      disabled={Boolean(exportingStoreId)}
                    >
                      {exportingStoreId === store.id && exportingStoreFormat === "excel"
                        ? "Export..."
                        : "Exporter Excel"}
                    </button>
                  </div>
                </article>
              );
            })
          ) : (
            <div className="empty-state">
              Aucun point de vente disponible pour l'export.
            </div>
          )}
        </div>
      </SectionCard>

      <SectionCard
        title="Envoi automatique par email"
        description="Recevoir chaque jour le rapport du Point de Vente Est par email."
      >
        {autoReportNotice ? (
          <div className="inline-notice success">{autoReportNotice}</div>
        ) : null}

        {autoReportError ? (
          <div className="inline-notice error">{autoReportError}</div>
        ) : null}

        <label className="toggle-report">
          <input
            type="checkbox"
            checked={autoReportEnabled}
            onChange={handleToggleAutoReport}
            disabled={isTogglingAutoReport}
          />
          <span>
            Envoyer automatiquement le rapport du Point de Vente Est chaque jour
          </span>
        </label>
      </SectionCard>
    </div>
  );
}

export default ReportsPage;
