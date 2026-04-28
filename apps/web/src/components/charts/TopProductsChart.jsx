import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import EmptyState from "../EmptyState";

const PRODUCT_BAR_COLORS = ["#106d5b", "#1f9077", "#2aa487", "#5dc5ad", "#9bddcf"];

function TopProductsChart({
  data = [],
  loading = false,
  limit = 5,
  emptyTitle = "Aucun produit disponible",
  emptyDescription = "Les produits les plus vendus apparaitront ici.",
}) {
  const sortedData = useMemo(
    () =>
      [...data]
        .sort((left, right) => (right.quantite || 0) - (left.quantite || 0))
        .slice(0, limit),
    [data, limit]
  );

  if (loading) {
    return <div className="chart-loading">Chargement du graphique...</div>;
  }

  if (!sortedData.length) {
    return (
      <EmptyState
        compact
        title={emptyTitle}
        description={emptyDescription}
      />
    );
  }

  return (
    <div className="chart-shell">
      <ResponsiveContainer width="100%" height={320}>
        <BarChart
          data={sortedData}
          layout="vertical"
          margin={{ top: 8, right: 24, left: 24, bottom: 8 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#d7e1ec" horizontal={false} />
          <XAxis type="number" tickLine={false} axisLine={false} tickMargin={12} />
          <YAxis
            type="category"
            dataKey="name"
            tickLine={false}
            axisLine={false}
            width={90}
          />
          <Tooltip
            contentStyle={{
              borderRadius: 16,
              border: "1px solid #d7e1ec",
              boxShadow: "0 18px 36px rgba(18, 33, 53, 0.12)",
            }}
            formatter={(value) => [`${value}`, "Quantite vendue"]}
          />
          <Bar dataKey="quantite" radius={[0, 12, 12, 0]} animationDuration={500}>
            {sortedData.map((entry, index) => (
              <Cell
                key={`${entry.name}-${index}`}
                fill={PRODUCT_BAR_COLORS[index % PRODUCT_BAR_COLORS.length]}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export default TopProductsChart;
