const rtl = require('tailwindcss-rtl');

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{js,jsx}', './components/src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        primary: 'var(--color-primary)',
      },
      boxShadow: {
        card: '0 18px 48px rgba(109, 40, 217, 0.10), 0 4px 16px rgba(15, 23, 42, 0.04)',
        button: '0 14px 28px rgba(124, 58, 237, 0.24)',
      },
    },
  },
  plugins: [rtl],
};
