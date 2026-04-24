function StatCard({ label, value, detail, tone = "default" }) {
  return (
    <article className={`stat-card tone-${tone}`}>
      <p className="stat-label">{label}</p>
      <h2 className="stat-value">{value}</h2>
      <p className="stat-detail">{detail}</p>
    </article>
  );
}

export default StatCard;
