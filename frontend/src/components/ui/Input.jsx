import React from 'react';
import { forwardRef } from 'react';

const Input = forwardRef(function Input(
  { className = '', error, id, label, leftSlot, rightSlot, ...props },
  ref,
) {
  return (
    <label className={`ui-field ${className}`.trim()} htmlFor={id}>
      {label ? <span className="ui-field__label">{label}</span> : null}
      <span className={`ui-field__control ${error ? 'ui-field__control--error' : ''}`}>
        {leftSlot ? <span className="ui-field__slot">{leftSlot}</span> : null}
        <input ref={ref} id={id} dir="rtl" aria-invalid={Boolean(error)} {...props} />
        {rightSlot ? <span className="ui-field__slot">{rightSlot}</span> : null}
      </span>
      {error ? <span className="ui-field__error">{error}</span> : null}
    </label>
  );
});

export default Input;
