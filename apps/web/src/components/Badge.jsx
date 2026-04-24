function Badge({ children, tone = "neutral" }) {
  return <span className={`app-badge tone-${tone}`}>{children}</span>;
}

export default Badge;
