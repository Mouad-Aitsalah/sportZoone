import EmptyState from "./EmptyState";

function DataTable({
  columns,
  data,
  renderRow,
  emptyTitle = "Aucune donnee",
  emptyDescription = "Aucun resultat a afficher pour le moment.",
}) {
  return (
    <div className="table-wrapper">
      <table className="data-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={typeof column === "string" ? column : column.key}>
                {typeof column === "string" ? column : column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.length ? (
            data.map((item, index) => renderRow(item, index))
          ) : (
            <tr>
              <td colSpan={columns.length}>
                <EmptyState
                  compact
                  title={emptyTitle}
                  description={emptyDescription}
                />
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export default DataTable;
