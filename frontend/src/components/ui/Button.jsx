import React from 'react';

const variants = {
  primary: 'ui-button--primary',
  secondary: 'ui-button--secondary',
  danger: 'ui-button--danger',
};

const sizes = {
  sm: 'ui-button--sm',
  md: 'ui-button--md',
  lg: 'ui-button--lg',
};

function Button({
  children,
  className = '',
  disabled = false,
  loading = false,
  size = 'md',
  variant = 'primary',
  ...props
}) {
  const classes = ['ui-button', variants[variant], sizes[size], className].filter(Boolean).join(' ');

  return (
    <button className={classes} disabled={disabled || loading} aria-busy={loading} {...props}>
      {loading ? <span className="ui-button__loader" /> : null}
      <span>{children}</span>
    </button>
  );
}

export default Button;
