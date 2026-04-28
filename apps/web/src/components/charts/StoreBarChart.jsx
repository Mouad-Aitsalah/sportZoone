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
import { formatCurrencyDh } from "../../utils/formatters";

const BAR_COLORS = ["#1659b5", "#1f9077", "#f59e0b", "#ef4444", "#7c89f5"];

function StoreBarChart({
  data = [],
  loading = false,
  emptyTitle = "Aucun magasin disponible",
  emptyDescription = "Les comparaisons entre points de vente apparaitront ici.",
}) {
  if (loading) {
    return <div className="chart-loading">Chargement du graphique...</div>;
  }

  if (!data.length) {
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
        <BarChart data={data} margin={{ top: 12, right: 12, left: 0, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#d7e1ec" vertical={false} />
          <XAxis dataKey="store" tickLine={false} axisLine={false} tickMargin={12} />
          <YAxis
            tickLine={false}
            axisLine={false}
            tickMargin={12}
            width={80}
            tickFormatter={(value) => formatCurrencyDh(value)}
          />
          <Tooltip
            contentStyle={{
              borderRadius: 16,
              border: "1px solid #d7e1ec",
              boxShadow: "0 18px 36px rgba(18, 33, 53, 0.12)",
            }}
            formatter={(value) => [formatCurrencyDh(value), "Ventes"]}
          />
          <Bar dataKey="ventes" radius={[12, 12, 0, 0]} animationDuration={500}>
            {data.map((entry, index) => (
              <Cell
                key={`${entry.store}-${index}`}
                fill={BAR_COLORS[index % BAR_COLORS.length]}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export default StoreBarChart;
