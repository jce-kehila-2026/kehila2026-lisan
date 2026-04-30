import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from '../pages/Login.jsx';
import Home from '../pages/Home.jsx';
import PlaceholderPage from '../pages/PlaceholderPage.jsx';

function AppRoutes() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/home" element={<Home />} />
        <Route path="/story/:id" element={<PlaceholderPage type="story" />} />
        <Route path="/games" element={<PlaceholderPage titleKey="games" />} />
        <Route path="/links" element={<PlaceholderPage titleKey="links" />} />
        <Route path="/profile" element={<PlaceholderPage titleKey="profile" />} />
        <Route path="/chatbot" element={<PlaceholderPage titleKey="chatbot" />} />
        <Route path="/more" element={<PlaceholderPage titleKey="more" />} />
        <Route path="*" element={<Navigate to="/home" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default AppRoutes;