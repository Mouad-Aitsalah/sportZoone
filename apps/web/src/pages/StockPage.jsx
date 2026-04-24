import { useEffect, useMemo, useState } from "react";
import api from "../services/api";
import Badge from "../components/Badge";
import DataTable from "../components/DataTable";
import PageHeader from "../components/PageHeader";
import SearchInput from "../components/SearchInput";
import SectionCard from "../components/SectionCard";

function StockPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedStore, setSelectedStore] = useState("Tous");
  const [stocks, setStocks] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function fetchStocks() {
      try {
        setIsLoading(true);
        setErrorMessage("");

        const response = await api.get("/stocks");

        if (isMounted) {
          setStocks(response.data?.data || []);
        }
      } catch (error) {
        if (isMounted) {
          setErrorMessage(
            error.response?.data?.message ||
              "Impossible de charger le stock pour le moment."
          );
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    fetchStocks();

    return () => {
      isMounted = false;
    };
  }, []);

  const storeOptions = useMemo(
    () => [...new Set(stocks.map((item) => item.storeName).filter(Boolean))],
    [stocks]
  );

  const filteredStocks = useMemo(
    () =>
      stocks.filter((item) => {
        const query = searchTerm.trim().toLowerCase();
        const matchesSearch =
          !query ||
          item.productName?.toLowerCase().includes(query) ||
          item.barcode?.toLowerCase().includes(query);
        const matchesStore =
          selectedStore === "Tous" || item.storeName === selectedStore;

        return matchesSearch && matchesStore;
      }),
    [stocks, searchTerm, selectedStore]
  );

  return (
    <div>
      <PageHeader
        eyebrow="Stock"
        title="Gestion du stock"
        description="Rechercher les niveaux de stock par magasin et identifier rapidement les seuils critiques."
      />

      <SectionCard
        title="Etat du stock"
        description="Suivi des quantites, seuils minimums et actions de correction."
      >
        <div className="filter-row">
          <SearchInput
            value={searchTerm}
            onChange={setSearchTerm}
            placeholder="Rechercher par produit ou code-barres"
          />

          <select
            className="text-input select-input"
            value={selectedStore}
            onChange={(event) => setSelectedStore(event.target.value)}
          >
            <option value="Tous">Tous les magasins</option>
            {storeOptions.map((storeName) => (
              <option key={storeName} value={storeName}>
                {storeName}
              </option>
            ))}
          </select>
        </div>

        {errorMessage ? (
          <div className="inline-notice error">{errorMessage}</div>
        ) : null}

        <DataTable
          columns={[
            { key: "product", label: "Produit" },
            { key: "barcode", label: "Code-barres" },
            { key: "store", label: "Magasin" },
            { key: "quantity", label: "Quantite" },
            { key: "minimum", label: "Seuil mini" },
            { key: "status", label: "Statut" },
            { key: "actions", label: "Actions" },
          ]}
          data={filteredStocks}
          emptyTitle={isLoading ? "Chargement du stock..." : "Aucun mouvement trouve"}
          emptyDescription={
            isLoading
              ? "Veuillez patienter pendant la recuperation des donnees."
              : "Essayez un autre magasin ou une autre recherche."
          }
          renderRow={(item) => {
            const isLow = item.quantity <= item.minimumThreshold;

            return (
              <tr key={item.id}>
                <td>
                  <strong>{item.productName}</strong>
                </td>
                <td>{item.barcode}</td>
                <td>{item.storeName}</td>
                <td>{item.quantity}</td>
                <td>{item.minimumThreshold}</td>
                <td>
                  <Badge tone={isLow ? "warning" : "success"}>
                    {isLow ? "Stock faible" : "Disponible"}
                  </Badge>
                </td>
                <td>
                  <div className="table-action-row">
                    <button className="table-action-button" type="button">
                      Entree stock
                    </button>
                    <button className="table-action-button" type="button">
                      Correction stock
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

export default StockPage;
