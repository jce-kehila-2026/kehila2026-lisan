import React from 'react';
import ExistingStudentHome from '../../../components/src/pages/Home.jsx';
import { getStoredUser } from '../../services/auth.js';
import AdminHome from './AdminHome.jsx';
import TeacherHome from './TeacherHome.jsx';

function HomePage() {
  const user = getStoredUser();

  if (user?.role === 'admin') {
    return <AdminHome />;
  }

  if (user?.role === 'teacher') {
    return <TeacherHome />;
  }

  return <ExistingStudentHome />;
}

export default HomePage;
