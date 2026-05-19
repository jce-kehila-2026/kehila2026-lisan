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
        card: '0 10px 25px rgba(124, 58, 237, 0.10)',
        button: '0 8px 18px rgba(124, 58, 237, 0.25)',
      },
    },
  },
  plugins: [rtl],
};
