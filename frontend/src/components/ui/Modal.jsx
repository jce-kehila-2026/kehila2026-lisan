import React from 'react';
import Button from './Button.jsx';

function Modal({ children, onClose, open, title }) {
  if (!open) {
    return null;
  }

  return (
    <div className="ui-modal" role="presentation">
      <div className="ui-modal__backdrop" onClick={onClose} />
      <section className="ui-modal__panel" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <header className="ui-modal__header">
          <h2 id="modal-title">{title}</h2>
          <Button type="button" variant="secondary" size="sm" onClick={onClose}>
            X
          </Button>
        </header>
        {children}
      </section>
    </div>
  );
}

export default Modal;
