import React from 'react';
import { Navigate } from 'react-router-dom';
import { getStoredUser, getStoredToken } from '../services/auth.js';

export const getRedirectPath = (role) => {
  if (role === 'admin') return '/admin/dashboard';
  if (role === 'teacher') return '/admin/dashboard';
  if (role === 'student') return '/home';
  if (role === 'reviewer') return '/review';
  return '/login';
};

function ProtectedRoute({ children, role }) {
  const token = getStoredToken();
  const user = getStoredUser();

  const allowedRoles = Array.isArray(role) ? role : role ? [role] : [];

  if (!token || !user) {
    return <Navigate to="/login" replace />;
  }

  // Volunteer reviewers may only ever see the /review area: any protected
  // route that does not explicitly allow them sends them back there.
  if (user.role === 'reviewer' && !allowedRoles.includes('reviewer')) {
    return <Navigate to="/review" replace />;
  }

  if (allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
    return <Navigate to={getRedirectPath(user.role)} replace />;
  }

  return children;
}

export default ProtectedRoute;
