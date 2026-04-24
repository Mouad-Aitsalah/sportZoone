function EmptyState({ title, description, compact = false }) {
  return (
    <div className={`empty-state ${compact ? "compact" : ""}`}>
      <strong className="empty-state-title">{title}</strong>
      {description ? <p className="empty-state-description">{description}</p> : null}
    </div>
  );
}

export default EmptyState;
