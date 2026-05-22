import Chatbot from './pages/Chatbot.jsx';
import React from 'react';
import { Navigate, Route, BrowserRouter as Router, Routes } from 'react-router-dom';
import ProtectedRoute from './routes/ProtectedRoute.jsx';
import ExistingPlaceholderPage from './pages/PlaceholderPage.jsx';
import MorePage from './pages/MorePage.jsx';
import ProfilePage from './pages/ProfilePage.jsx';
import ScenarioChat from './pages/ScenarioChat.jsx';
import AdminDashboard from './pages/admin/Dashboard.jsx';
import AdminLogin from './pages/admin/Login.jsx';
import AdminConversations from './pages/admin/Conversations.jsx';
import AdminNotifications from './pages/admin/Notifications.jsx';
import AdminProgress from './pages/admin/Progress.jsx';
import AdminStudents from './pages/admin/Students.jsx';
import AdminWords from './pages/admin/Words.jsx';
import ForgotAccess from './pages/ForgotAccess.jsx';
import HomePage from './pages/home/HomePage.jsx';
import TeacherHome from './pages/home/TeacherHome.jsx';
import StudentLogin from './pages/student/Login.jsx';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<StudentLogin />} />
        <Route path="/forgot-access" element={<ForgotAccess />} />
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route
          path="/home"
          element={
            <ProtectedRoute role="student">
              <HomePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/teacher/dashboard"
          element={
            <ProtectedRoute role="teacher">
              <TeacherHome />
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
              <ProfilePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/chatbot"
          element={
            <ProtectedRoute role={['student', 'teacher']}>
              <Chatbot />
            </ProtectedRoute>
          }
        />
        <Route
          path="/scenario/:id"
          element={
            <ProtectedRoute role={['student', 'teacher']}>
              <ScenarioChat />
            </ProtectedRoute>
          }
        />
        <Route
          path="/more"
          element={
            <ProtectedRoute role={['student', 'teacher']}>
              <MorePage />
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
        <Route
          path="/admin/students"
          element={
            <ProtectedRoute role="admin">
              <AdminStudents />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/conversations"
          element={
            <ProtectedRoute role="admin">
              <AdminConversations />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/words"
          element={
            <ProtectedRoute role="admin">
              <AdminWords />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/progress"
          element={
            <ProtectedRoute role="admin">
              <AdminProgress />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/notifications"
          element={
            <ProtectedRoute role="admin">
              <AdminNotifications />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </Router>
  );
}

export default App;
