import React from 'react';
import { Link } from 'react-router-dom';

function CardButton({ children, onClick, to, variant = 'primary' }) {
  const classes =
    variant === 'secondary'
      ? 'inline-flex min-h-10 items-center justify-center rounded-2xl border border-violet-100 bg-white px-4 text-sm font-bold text-violet-700 transition hover:bg-violet-50 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2'
      : 'inline-flex min-h-10 items-center justify-center rounded-2xl bg-violet-600 px-4 text-sm font-bold text-white shadow-button transition hover:bg-violet-700 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2';

  if (to) {
    return (
      <Link to={to} className={classes}>
        {children}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} className={classes}>
      {children}
    </button>
  );
}

export default CardButton;
