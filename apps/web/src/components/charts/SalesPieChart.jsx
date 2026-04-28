import {
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import EmptyState from "../EmptyState";

const PIE_COLORS = ["#1659b5", "#106d5b", "#f59e0b", "#ef4444", "#7c89f5"];

function SalesPieChart({
  data = [],
  loading = false,
  emptyTitle = "Aucune categorie disponible",
  emptyDescription = "La repartition des ventes par categorie apparaitra ici.",
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
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="48%"
            outerRadius={98}
            innerRadius={54}
            paddingAngle={3}
            animationDuration={500}
            label={({ percent }) => `${Math.round(percent * 100)}%`}
            labelLine={false}
          >
            {data.map((entry, index) => (
              <Cell
                key={`${entry.name}-${index}`}
                fill={PIE_COLORS[index % PIE_COLORS.length]}
              />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              borderRadius: 16,
              border: "1px solid #d7e1ec",
              boxShadow: "0 18px 36px rgba(18, 33, 53, 0.12)",
            }}
            formatter={(value) => [`${value}%`, "Part des ventes"]}
          />
          <Legend verticalAlign="bottom" height={24} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

export default SalesPieChart;
