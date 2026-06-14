import React from 'react';

function LisanLogo({ className = '' }) {
  return (
    <img
      src="/images/loggo.png"
      alt="Lisan"
      className={`h-32 w-auto object-contain sm:h-32 ${className}`.trim()}
    />
  );
}

export default LisanLogo;
