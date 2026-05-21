import React from 'react';
import { Navigate } from 'react-router-dom';
import { getStoredUser } from '../services/auth.js';

function ProtectedRoute({ children, role }) {
  const token = localStorage.getItem('lisan-token');
  const user = getStoredUser();
  const allowedRoles = Array.isArray(role) ? role : role ? [role] : [];

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles.length > 0 && user?.role && !allowedRoles.includes(user.role)) {
    return <Navigate to={user.role === 'admin' ? '/admin/dashboard' : '/home'} replace />;
  }

  return children;
}

export default ProtectedRoute;
