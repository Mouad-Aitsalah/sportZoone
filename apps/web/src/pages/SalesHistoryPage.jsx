import { useEffect, useMemo, useState } from "react";
import api from "../services/api";
import Badge from "../components/Badge";
import DataTable from "../components/DataTable";
import Modal from "../components/Modal";
import PageHeader from "../components/PageHeader";
import SearchInput from "../components/SearchInput";
import SectionCard from "../components/SectionCard";
import { formatCurrencyDh, formatDateOnly, formatDateTime } from "../utils/formatters";

function SalesHistoryPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedStore, setSelectedStore] = useState("Tous");
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedSale, setSelectedSale] = useState(null);
  const [sales, setSales] = useState([]);
  const [stores, setStores] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function fetchData() {
      try {
        setIsLoading(true);
        setErrorMessage("");

        const [salesResponse, storesResponse] = await Promise.all([
          api.get("/sales"),
          api.get("/stores"),
        ]);

        const salesList = Array.isArray(salesResponse.data)
          ? salesResponse.data
          : salesResponse.data?.data || [];
        const storesList = Array.isArray(storesResponse.data)
          ? storesResponse.data
          : storesResponse.data?.data || [];

        if (isMounted) {
          setSales(salesList);
          setStores(storesList);
        }
      } catch (error) {
        if (isMounted) {
          setErrorMessage(
            error.response?.data?.message ||
              "Impossible de charger l'historique des ventes."
          );
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    fetchData();

    return () => {
      isMounted = false;
    };
  }, []);

  const filteredSales = useMemo(
    () =>
      sales.filter((sale) => {
        const query = searchTerm.trim().toLowerCase();
        const ticket = sale.ticketNumber || sale.id?.toString() || "";
        const cashier = sale.cashier || sale.userName || sale.user?.name || "";
        const storeName = sale.store || sale.storeName || sale.store?.name || "";
        const saleDate = sale.date || sale.createdAt || "";
        const matchesSearch =
          !query ||
          ticket.toLowerCase().includes(query) ||
          cashier.toLowerCase().includes(query);
        const matchesStore =
          selectedStore === "Tous" || storeName === selectedStore;
        const matchesDate = !selectedDate || saleDate.startsWith(selectedDate);

        return matchesSearch && matchesStore && matchesDate;
      }),
    [sales, searchTerm, selectedStore, selectedDate]
  );

  return (
    <div>
      <PageHeader
        eyebrow="Historique"
        title="Historique des ventes"
        description="Consulter les tickets, filtrer par date ou magasin et visualiser les details de vente."
      />

      <SectionCard
        title="Tickets de vente"
        description="Rechercher par numero de ticket ou caissier."
      >
        <div className="filter-row">
          <SearchInput
            value={searchTerm}
            onChange={setSearchTerm}
            placeholder="Rechercher par ticket ou utilisateur"
          />

          <input
            className="text-input select-input"
            type="date"
            value={selectedDate}
            onChange={(event) => setSelectedDate(event.target.value)}
          />

          <select
            className="text-input select-input"
            value={selectedStore}
            onChange={(event) => setSelectedStore(event.target.value)}
          >
            <option value="Tous">Tous les magasins</option>
            {stores.map((store) => (
              <option key={store.id} value={store.name}>
                {store.name}
              </option>
            ))}
          </select>
        </div>

        {errorMessage ? (
          <div className="inline-notice error">{errorMessage}</div>
        ) : null}

        <DataTable
          columns={[
            { key: "ticket", label: "Ticket" },
            { key: "date", label: "Date" },
            { key: "store", label: "Magasin" },
            { key: "cashier", label: "Caissier" },
            { key: "items", label: "Nb articles" },
            { key: "total", label: "Total" },
            { key: "sync", label: "Sync" },
            { key: "actions", label: "Action" },
          ]}
          data={filteredSales}
          emptyTitle={isLoading ? "Chargement..." : "Aucune vente trouvee"}
          emptyDescription={
            isLoading
              ? "Recuperation des ventes en cours."
              : "Modifiez les filtres pour afficher des tickets."
          }
          renderRow={(sale, index) => {
            const ticket = sale.ticketNumber || sale.id?.toString() || "-";
            const storeName = sale.store || sale.storeName || sale.store?.name || "-";
            const cashier = sale.cashier || sale.userName || sale.user?.name || "-";
            const saleDate = sale.date || sale.createdAt;
            const syncStatus =
              sale.syncStatus || sale.status || (sale.synced ? "Synchronise" : "En attente");
            const syncLabel =
              syncStatus === "synced" || syncStatus === "completed"
                ? "Synchronise"
                : syncStatus;
            const items = sale.items || [];
            const itemsCount = sale.itemsCount || items.length || 0;

            return (
              <tr key={`${ticket}-${index}`}>
                <td>
                  <strong>{ticket}</strong>
                </td>
                <td>{saleDate ? formatDateTime(saleDate) : "-"}</td>
                <td>{storeName}</td>
                <td>{cashier}</td>
                <td>{itemsCount}</td>
                <td>{formatCurrencyDh(sale.total || 0)}</td>
                <td>
                  <Badge
                    tone={syncLabel === "Synchronise" ? "success" : "warning"}
                  >
                    {syncLabel}
                  </Badge>
                </td>
                <td>
                  <button
                    className="table-action-button"
                    type="button"
                    onClick={() => setSelectedSale(sale)}
                  >
                    Voir details
                  </button>
                </td>
              </tr>
            );
          }}
        />
      </SectionCard>

      <Modal
        isOpen={Boolean(selectedSale)}
        eyebrow="Details ticket"
        title={
          selectedSale
            ? selectedSale.ticketNumber || selectedSale.id?.toString() || ""
            : ""
        }
        description={
          selectedSale
            ? `${
                selectedSale.store ||
                selectedSale.storeName ||
                selectedSale.store?.name ||
                "-"
              } - ${formatDateTime(selectedSale.date || selectedSale.createdAt)}`
            : ""
        }
        onClose={() => setSelectedSale(null)}
        actions={
          <button
            className="primary-button"
            type="button"
            onClick={() => setSelectedSale(null)}
          >
            Fermer
          </button>
        }
      >
        {selectedSale ? (
          <>
            <div className="details-list">
              <div className="detail-stat">
                <span>Date</span>
                <strong>
                  {formatDateOnly(selectedSale.date || selectedSale.createdAt)}
                </strong>
              </div>
              <div className="detail-stat">
                <span>Caissier</span>
                <strong>
                  {selectedSale.cashier ||
                    selectedSale.userName ||
                    selectedSale.user?.name ||
                    "-"}
                </strong>
              </div>
              <div className="detail-stat">
                <span>Magasin</span>
                <strong>
                  {selectedSale.store ||
                    selectedSale.storeName ||
                    selectedSale.store?.name ||
                    "-"}
                </strong>
              </div>
            </div>

            <DataTable
              columns={[
                { key: "product", label: "Produit" },
                { key: "quantity", label: "Quantite" },
                { key: "unitPrice", label: "Prix unitaire" },
                { key: "subtotal", label: "Sous-total" },
              ]}
              data={selectedSale.items || []}
              renderRow={(item, index) => {
                const productName =
                  item.name || item.productName || item.product?.name || "-";
                const unitPrice = item.unitPrice || item.price || 0;

                return (
                  <tr
                    key={`${
                      selectedSale.ticketNumber || selectedSale.id
                    }-${productName}-${index}`}
                  >
                    <td>{productName}</td>
                    <td>{item.quantity || 0}</td>
                    <td>{formatCurrencyDh(unitPrice)}</td>
                    <td>
                      {formatCurrencyDh(
                        item.subtotal || (item.quantity || 0) * unitPrice
                      )}
                    </td>
                  </tr>
                );
              }}
            />

            <div className="details-summary">
              <span>Total ticket</span>
              <strong>{formatCurrencyDh(selectedSale.total || 0)}</strong>
            </div>
          </>
        ) : null}
      </Modal>
    </div>
  );
}

export default SalesHistoryPage;
