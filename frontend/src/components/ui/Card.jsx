import React from 'react';

function Card({ as: Component = 'section', children, className = '', padded = true, ...props }) {
  return (
    <Component className={`ui-card ${padded ? 'ui-card--padded' : ''} ${className}`.trim()} {...props}>
      {children}
    </Component>
  );
}

export default Card;
