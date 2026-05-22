import React from 'react';
import { Navigate } from 'react-router-dom';
import ExistingStudentHome from '../Home.jsx';
import { getStoredUser } from '../../services/auth.js';

function HomePage() {
  const user = getStoredUser();

  if (user?.role === 'admin') {
    return <Navigate to="/admin/dashboard" replace />;
  }

  if (user?.role === 'teacher') {
    return <Navigate to="/teacher/dashboard" replace />;
  }

  return <ExistingStudentHome />;
}

export default HomePage;
