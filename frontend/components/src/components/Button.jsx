import React from 'react';

function Button({ children, onClick, type = 'button', variant = 'primary', loading = false, className = '', ...props }) {
  const base = 'inline-flex min-h-12 items-center justify-center rounded-2xl px-5 py-3 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 disabled:cursor-not-allowed';
  const styles =
    variant === 'ghost'
      ? 'border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 shadow-sm'
      : 'bg-violet-600 text-white shadow-button hover:bg-violet-700';

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={loading || props.disabled}
      className={`${base} ${styles} ${className}`.trim()}
      aria-busy={loading}
      {...props}
    >
      {loading ? <span>{children}</span> : children}
    </button>
  );
}

export default Button;
