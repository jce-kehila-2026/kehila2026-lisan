import React from 'react';
import LisanHeader from './LisanHeader.jsx';

// Thin wrapper — renders LisanHeader with no sections (logo + lang + logout only).
// Pages that need section nav should use LisanHeader directly.
function PageHeader({ onLogout = null, logoTarget = '/home' }) {
  return (
    <LisanHeader
      sections={[]}
      logoTarget={logoTarget}
      onLogout={onLogout}
    />
  );
}

export default PageHeader;
