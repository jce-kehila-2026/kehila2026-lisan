const admin = require('../config/firebase');

const db = admin.firestore();

exports.getMe = async (req, res) => {
  try {
    const { uid } = req.user;

    if (!uid) {
      return res.status(401).json({
        error: 'Invalid token payload'
      });
    }

    const userDoc = await db.collection('users').doc(uid).get();

    if (!userDoc.exists) {
      return res.status(404).json({
        error: 'User not found'
      });
    }

    const user = userDoc.data();

    return res.status(200).json({
      id: uid,
      name: user.name,
      email: user.email,
      role: user.role,
      language: user.language,
      level: user.level
    });
  } catch (error) {
    console.error('GetMe error:', error);

    return res.status(500).json({
      error: 'Server error'
    });
  }
};