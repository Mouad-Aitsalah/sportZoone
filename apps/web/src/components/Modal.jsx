function Modal({
  isOpen,
  eyebrow,
  title,
  description,
  onClose,
  children,
  actions,
}) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="modal-overlay" role="presentation" onClick={onClose}>
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
      >
        {eyebrow ? <p className="modal-eyebrow">{eyebrow}</p> : null}
        {title ? <h2 className="modal-title">{title}</h2> : null}
        {description ? <p className="modal-description">{description}</p> : null}

        {children}

        {actions ? <div className="modal-actions">{actions}</div> : null}
      </div>
    </div>
  );
}

export default Modal;
