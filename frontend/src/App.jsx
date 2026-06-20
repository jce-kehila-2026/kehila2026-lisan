import Chatbot from './pages/Chatbot.jsx';
import React, { useEffect } from 'react';
import { Navigate, Route, BrowserRouter as Router, Routes, useLocation } from 'react-router-dom';
import ProtectedRoute from './routes/ProtectedRoute.jsx';
import ExistingPlaceholderPage from './pages/PlaceholderPage.jsx';
import GamesPage from './pages/GamesPage.jsx';
import MorePage from './pages/MorePage.jsx';
import ProfilePage from './pages/ProfilePage.jsx';
import ScenarioChat from './pages/ScenarioChat.jsx';
import SharedChat from './pages/SharedChat.jsx';
import SharedChatRoom from './pages/SharedChatRoom.jsx';
import TeacherMore from './pages/teacher/More.jsx';
import AdminDashboard from './pages/admin/Dashboard.jsx';
import AdminAnalytics from './pages/admin/Analytics.jsx';
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
import TeacherLogin from './pages/teacher/Login.jsx';
import TeacherReviews from './pages/teacher/Reviews.jsx';
import DatasetUploader from './pages/teacher/DatasetUploader.jsx';
import { getStoredUser } from './services/auth.js';

const SKIP_AUTH = import.meta.env.VITE_SKIP_AUTH === 'true';

function MoreByRole() {
  const user = getStoredUser();

  if (user?.role === 'teacher') {
    return <TeacherMore />;
  }

  return <MorePage />;
}

function StudentPreferenceSync() {
  const location = useLocation();

  useEffect(() => {
    const applyPreferences = () => {
      const user = getStoredUser();
      const isStudent = user?.role === 'student';
      let preferences = {};

      try {
        preferences = JSON.parse(localStorage.getItem('lisan-student-preferences') || '{}');
      } catch {
        preferences = {};
      }

      document.documentElement.classList.toggle('lisan-student-dark', isStudent && preferences.theme === 'dark');
      document.documentElement.classList.toggle('lisan-student-motion', isStudent);
      document.documentElement.classList.toggle(
        'lisan-student-large-text',
        isStudent && preferences.textSize === 'large',
      );
    };

    applyPreferences();
    window.addEventListener('storage', applyPreferences);
    window.addEventListener('lisan-student-preferences-changed', applyPreferences);

    return () => {
      window.removeEventListener('storage', applyPreferences);
      window.removeEventListener('lisan-student-preferences-changed', applyPreferences);
    };
  }, [location.pathname]);

  return null;
}

function AdminScrollToTop() {
  const location = useLocation();

  useEffect(() => {
    if (location.pathname.startsWith('/admin/')) {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    }
  }, [location.pathname]);

  return null;
}

function App() {
  return (
    <Router>
      <StudentPreferenceSync />
      <AdminScrollToTop />
      <Routes>
        <Route path="/" element={<Navigate to={SKIP_AUTH ? '/home' : '/login'} replace />} />
        <Route path="/login" element={<StudentLogin />} />
        <Route path="/forgot-access" element={<ForgotAccess />} />
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route path="/teacher/login" element={<TeacherLogin />} />
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
          path="/teacher/reviews"
          element={
            <ProtectedRoute role="teacher">
              <TeacherReviews />
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
              <GamesPage />
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
              <MoreByRole />
            </ProtectedRoute>
          }
        />
        <Route
          path="/shared-chat"
          element={
            <ProtectedRoute role={['student', 'teacher']}>
              <SharedChat />
            </ProtectedRoute>
          }
        />
        <Route
          path="/shared-chat/:id"
          element={
            <ProtectedRoute role={['student', 'teacher']}>
              <SharedChatRoom />
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
            <ProtectedRoute role={['admin', 'teacher']}>
              <DatasetUploader />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/dashboard"
          element={
            <ProtectedRoute role={['admin', 'teacher']}>
              <AdminDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/students"
          element={
            <ProtectedRoute role={['admin', 'teacher']}>
              <AdminStudents />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/conversations"
          element={
            <ProtectedRoute role={['admin', 'teacher']}>
              <AdminConversations />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/words"
          element={
            <ProtectedRoute role={['admin', 'teacher']}>
              <AdminWords />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/progress"
          element={
            <ProtectedRoute role={['admin', 'teacher']}>
              <AdminProgress />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/notifications"
          element={
            <ProtectedRoute role={['admin', 'teacher']}>
              <AdminNotifications />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/analytics"
          element={
            <ProtectedRoute role="admin">
              <AdminAnalytics />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to={SKIP_AUTH ? '/home' : '/login'} replace />} />
      </Routes>
    </Router>
  );
}

export default App;
