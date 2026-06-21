import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Home from '../pages/Home.jsx';
import PlaceholderPage from '../pages/PlaceholderPage.jsx';
import Chatbot from '../pages/Chatbot.jsx';
import ChatbotPage from '../pages/ChatbotPage.jsx';
import GamesPage from '../pages/GamesPage.jsx';
import MorePage from '../pages/MorePage.jsx';
import ProfilePage from '../pages/ProfilePage.jsx';
import ScenarioChat from '../pages/ScenarioChat.jsx';
import SharedChat from '../pages/SharedChat.jsx';
import TeacherMore from '../pages/teacher/More.jsx';
import AdminDashboard from '../pages/admin/Dashboard.jsx';
import AdminLogin from '../pages/admin/Login.jsx';
import AdminConversations from '../pages/admin/Conversations.jsx';
import AdminNotifications from '../pages/admin/Notifications.jsx';
import AdminProgress from '../pages/admin/Progress.jsx';
import AdminStudents from '../pages/admin/Students.jsx';
import AdminStatistics from '../pages/admin/Statistics.jsx';
import AdminWords from '../pages/admin/Words.jsx';
import TeacherHome from '../pages/home/TeacherHome.jsx';
import TeacherLogin from '../pages/teacher/Login.jsx';
import TeacherReviews from '../pages/teacher/Reviews.jsx';
import StudentLogin from '../pages/student/Login.jsx';
import ProtectedRoute from './ProtectedRoute.jsx';
import { getStoredUser } from '../services/auth.js';

function MoreByRole() {
  const user = getStoredUser();

  if (user?.role === 'teacher') {
    return <TeacherMore />;
  }

  return <MorePage />;
}

function AppRoutes() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<StudentLogin />} />
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route path="/teacher/login" element={<TeacherLogin />} />
        <Route
          path="/home"
          element={
            <ProtectedRoute role="student">
              <Home />
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
        <Route path="/story/:id" element={<PlaceholderPage type="story" />} />
        <Route path="/games" element={<GamesPage />} />
        <Route path="/links" element={<PlaceholderPage titleKey="links" />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/chatbot" element={<ChatbotPage />} />
        <Route path="/scenario/:id" element={<ScenarioChat />} />
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
            <ProtectedRoute role="student">
              <SharedChat />
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
          path="/admin/statistics"
          element={
            <ProtectedRoute role="admin">
              <AdminStatistics />
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
    </BrowserRouter>
  );
}

export default AppRoutes;
