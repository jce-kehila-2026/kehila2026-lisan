const jwt = require('jsonwebtoken');

function requireAuth(req, res, next) {
  const skipAuth = String(process.env.SKIP_AUTH || '').trim() === 'true';

  if (skipAuth) {
    req.user = {
      uid: 'dev-user',
      email: process.env.SKIP_AUTH_EMAIL || 'dev@localhost',
      role: process.env.SKIP_AUTH_ROLE || 'student',
      name: process.env.SKIP_AUTH_NAME || 'Dev User',
    };
    return next();
  }

  const token = req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.user = decoded;

    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = { requireAuth };