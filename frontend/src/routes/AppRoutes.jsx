import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from '../pages/Login.jsx';
import Home from '../pages/Home.jsx';
import PlaceholderPage from '../pages/PlaceholderPage.jsx';
import Chatbot from '../pages/Chatbot.jsx';
import MorePage from '../pages/MorePage.jsx';
import ProfilePage from '../pages/ProfilePage.jsx';
import ScenarioChat from '../pages/ScenarioChat.jsx';
import AdminDashboard from '../pages/admin/Dashboard.jsx';
import AdminLogin from '../pages/admin/Login.jsx';
import AdminConversations from '../pages/admin/Conversations.jsx';
import AdminNotifications from '../pages/admin/Notifications.jsx';
import AdminProgress from '../pages/admin/Progress.jsx';
import AdminStudents from '../pages/admin/Students.jsx';
import AdminWords from '../pages/admin/Words.jsx';
import TeacherHome from '../pages/home/TeacherHome.jsx';
import ProtectedRoute from './ProtectedRoute.jsx';

function AppRoutes() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/admin/login" element={<AdminLogin />} />
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
        <Route path="/story/:id" element={<PlaceholderPage type="story" />} />
        <Route path="/games" element={<PlaceholderPage titleKey="games" />} />
        <Route path="/links" element={<PlaceholderPage titleKey="links" />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/chatbot" element={<Chatbot />} />
        <Route path="/scenario/:id" element={<ScenarioChat />} />
        <Route path="/more" element={<MorePage />} />
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
        <Route path="*" element={<Navigate to="/home" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default AppRoutes;
