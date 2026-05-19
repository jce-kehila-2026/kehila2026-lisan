import React from 'react';

function Spinner({ label = 'Loading' }) {
  return <span className="ui-spinner" role="status" aria-label={label} />;
}

export default Spinner;
