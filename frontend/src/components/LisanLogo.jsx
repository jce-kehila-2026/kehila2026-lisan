import React from 'react';

function LisanLogo({ className = '' }) {
  return (
    <div className={`lisan-logo ${className}`.trim()} aria-label="Lisan">
      <span>لسان</span>
      <strong>ליסאן</strong>
    </div>
  );
}

export default LisanLogo;
