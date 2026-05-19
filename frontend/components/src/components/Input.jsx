import React from 'react';

function Input({ label, type = 'text', value, onChange, placeholder, id }) {
  return (
    <label htmlFor={id} className="block text-sm font-medium text-slate-700">
      <span className="mb-2 inline-block">{label}</span>
      <input
        id={id}
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="min-h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 shadow-sm transition focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-100"
      />
    </label>
  );
}

export default Input;
