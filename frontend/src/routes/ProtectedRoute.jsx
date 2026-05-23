import React from 'react';
import { Navigate } from 'react-router-dom';
import { getStoredUser, getStoredToken } from '../services/auth.js';

const getRedirectPath = (role) => {
  if (role === 'admin') return '/admin/dashboard';
  if (role === 'teacher') return '/teacher/dashboard';
  if (role === 'student') return '/home';
  return '/login';
};

function ProtectedRoute({ children, role }) {
  const token = getStoredToken();
  const user = getStoredUser();

  const allowedRoles = Array.isArray(role) ? role : role ? [role] : [];

  if (!token || !user) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
    return <Navigate to={getRedirectPath(user.role)} replace />;
  }

  return children;
}

export default ProtectedRoute;