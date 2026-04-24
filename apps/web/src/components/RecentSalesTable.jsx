import Badge from "./Badge";
import DataTable from "./DataTable";
import { formatCurrencyDh, formatDateTime } from "../utils/formatters";

function RecentSalesTable({ sales }) {
  return (
    <DataTable
      columns={[
        { key: "ticket", label: "Ticket" },
        { key: "store", label: "Magasin" },
        { key: "cashier", label: "Caissier" },
        { key: "items", label: "Articles" },
        { key: "total", label: "Total" },
        { key: "status", label: "Statut" },
      ]}
      data={sales}
      renderRow={(sale) => (
        <tr key={sale.id}>
          <td>
            <strong>{sale.id}</strong>
            <div className="table-subtext">{formatDateTime(sale.time)}</div>
          </td>
          <td>{sale.store}</td>
          <td>{sale.cashier}</td>
          <td>{sale.items}</td>
          <td>{formatCurrencyDh(sale.total)}</td>
          <td>
            <Badge tone={sale.status === "Synchronise" ? "success" : "warning"}>
              {sale.status}
            </Badge>
          </td>
        </tr>
      )}
    />
  );
}

export default RecentSalesTable;
