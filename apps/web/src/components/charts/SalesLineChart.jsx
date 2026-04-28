import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import EmptyState from "../EmptyState";
import { formatCurrencyDh } from "../../utils/formatters";

function SalesLineChart({
  data = [],
  loading = false,
  emptyTitle = "Aucune vente disponible",
  emptyDescription = "Les donnees de ventes apparaitront ici des qu'elles seront disponibles.",
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
        <LineChart
          data={data}
          margin={{ top: 12, right: 16, left: 8, bottom: 8 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#d7e1ec" vertical={false} />
          <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={12} />
          <YAxis
            tickLine={false}
            axisLine={false}
            tickMargin={12}
            width={80}
            tickFormatter={(value) => formatCurrencyDh(value)}
          />
          <Tooltip
            cursor={{ stroke: "#1659b5", strokeWidth: 1, strokeDasharray: "4 4" }}
            contentStyle={{
              borderRadius: 16,
              border: "1px solid #d7e1ec",
              boxShadow: "0 18px 36px rgba(18, 33, 53, 0.12)",
            }}
            formatter={(value) => [formatCurrencyDh(value), "Ventes"]}
          />
          <Line
            type="monotone"
            dataKey="ventes"
            stroke="#1659b5"
            strokeWidth={3}
            dot={{ r: 4, strokeWidth: 2, fill: "#ffffff" }}
            activeDot={{ r: 6 }}
            animationDuration={500}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export default SalesLineChart;
