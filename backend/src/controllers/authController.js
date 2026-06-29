const { admin, db } = require('../config/firebase');
const jwt = require('jsonwebtoken');
const axios = require('axios');

const IDENTITY_TOOLKIT_SIGNIN_URL =
  'https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword';

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        error: 'Email and password are required'
      });
    }

    const apiKey = process.env.FB_WEB_API_KEY;

    if (!apiKey) {
      console.error('Login error: FB_WEB_API_KEY is not configured');
      return res.status(500).json({ error: 'Server error' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();

    // 1) Verify the credentials against Firebase Authentication (source of
    //    truth for passwords). Admin SDK can't verify passwords, so we use the
    //    Identity Toolkit REST endpoint with the public Web API key.
    let uid;

    try {
      const { data } = await axios.post(
        `${IDENTITY_TOOLKIT_SIGNIN_URL}?key=${apiKey}`,
        { email: normalizedEmail, password, returnSecureToken: true },
        { timeout: 10000 }
      );
      uid = data.localId;
    } catch (authError) {
      const code = authError.response?.data?.error?.message || '';

      if (code === 'USER_DISABLED') {
        return res.status(403).json({ error: 'User account is inactive' });
      }

      // INVALID_LOGIN_CREDENTIALS / EMAIL_NOT_FOUND / INVALID_PASSWORD / ...
      if (authError.response) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      // Network / unexpected failure talking to Firebase Auth.
      console.error('Login error (auth verify):', code || authError.message);
      return res.status(500).json({ error: 'Server error' });
    }

    // 2) Load the profile (role/level/teachers/...) from Firestore, keyed by
    //    the Firebase Auth uid.
    const userDoc = await db.collection('users').doc(uid).get();

    if (!userDoc.exists) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = userDoc.data();

    if (user.isActive === false) {
      return res.status(403).json({ error: 'User account is inactive' });
    }

    await db.collection('users').doc(uid).update({
      lastLoginAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // 3) Issue the app session token (unchanged — requireAuth verifies this).
    const token = jwt.sign(
      {
        uid,
        role: user.role,
        level: user.level || 'A1'
      },
      process.env.JWT_SECRET,
      {
        expiresIn: process.env.JWT_EXPIRES_IN || '24h'
      }
    );

    return res.status(200).json({
      token,
      user: {
        id: uid,
        uid,
        name: user.name || '',
        email: user.email || normalizedEmail,
        role: user.role || '',
        language: user.language || 'ar',
        level: user.level || '',
        teacherId: user.teacherId || '',
        teacherIds: Array.isArray(user.teacherIds) ? user.teacherIds : []
      }
    });
  } catch (error) {
    console.error('Login error:', error);

    return res.status(500).json({
      error: 'Server error'
    });
  }
};
