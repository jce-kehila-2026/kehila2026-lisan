import React from 'react';
import { Navigate, Route, BrowserRouter as Router, Routes } from 'react-router-dom';
import ProtectedRoute from './routes/ProtectedRoute.jsx';
import ExistingPlaceholderPage from '../components/src/pages/PlaceholderPage.jsx';
import AdminDashboard from './pages/admin/Dashboard.jsx';
import ForgotAccess from './pages/ForgotAccess.jsx';
import HomePage from './pages/home/HomePage.jsx';
import StudentLogin from './pages/student/Login.jsx';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<StudentLogin />} />
        <Route path="/forgot-access" element={<ForgotAccess />} />
        <Route path="/admin/login" element={<Navigate to="/login" replace />} />
        <Route
          path="/home"
          element={
            <ProtectedRoute>
              <HomePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/story/:id"
          element={
            <ProtectedRoute role={['student', 'teacher']}>
              <ExistingPlaceholderPage type="story" />
            </ProtectedRoute>
          }
        />
        <Route
          path="/games"
          element={
            <ProtectedRoute role={['student', 'teacher']}>
              <ExistingPlaceholderPage titleKey="games" />
            </ProtectedRoute>
          }
        />
        <Route
          path="/links"
          element={
            <ProtectedRoute role={['student', 'teacher']}>
              <ExistingPlaceholderPage titleKey="links" />
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile"
          element={
            <ProtectedRoute role={['student', 'teacher']}>
              <ExistingPlaceholderPage titleKey="profile" />
            </ProtectedRoute>
          }
        />
        <Route
          path="/chatbot"
          element={
            <ProtectedRoute role={['student', 'teacher']}>
              <ExistingPlaceholderPage titleKey="chatbot" />
            </ProtectedRoute>
          }
        />
        <Route
          path="/more"
          element={
            <ProtectedRoute role={['student', 'teacher']}>
              <ExistingPlaceholderPage titleKey="more" />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/register-student"
          element={
            <ProtectedRoute role="admin">
              <ExistingPlaceholderPage titleKey="adminRegisterStudent" />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/remove-student"
          element={
            <ProtectedRoute role="admin">
              <ExistingPlaceholderPage titleKey="adminRemoveStudent" />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/edit-student"
          element={
            <ProtectedRoute role="admin">
              <ExistingPlaceholderPage titleKey="adminEditStudent" />
            </ProtectedRoute>
          }
        />
        <Route
          path="/teacher/dialog/upload"
          element={
            <ProtectedRoute role="teacher">
              <ExistingPlaceholderPage titleKey="teacherDialogTitle" />
            </ProtectedRoute>
          }
        />
        <Route
          path="/teacher/games/upload"
          element={
            <ProtectedRoute role="teacher">
              <ExistingPlaceholderPage titleKey="teacherGamesTitle" />
            </ProtectedRoute>
          }
        />
        <Route
          path="/teacher/links/upload"
          element={
            <ProtectedRoute role="teacher">
              <ExistingPlaceholderPage titleKey="teacherLinksTitle" />
            </ProtectedRoute>
          }
        />
        <Route
          path="/teacher/stories/upload"
          element={
            <ProtectedRoute role="teacher">
              <ExistingPlaceholderPage titleKey="teacherStoriesTitle" />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/dashboard"
          element={
            <ProtectedRoute role="admin">
              <AdminDashboard />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </Router>
  );
}

export default App;
