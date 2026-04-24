function SectionCard({ title, description, actions, children, className = "" }) {
  const classes = ["section-card", className].filter(Boolean).join(" ");

  return (
    <section className={classes}>
      <div className="section-card-header">
        <div>
          <h2 className="section-card-title">{title}</h2>
          {description ? (
            <p className="section-card-description">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="section-card-actions">{actions}</div> : null}
      </div>

      {children}
    </section>
  );
}

export default SectionCard;
