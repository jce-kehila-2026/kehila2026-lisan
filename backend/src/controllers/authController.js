const { admin, db } = require('../config/firebase');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        error: 'Email and password are required'
      });
    }

    const userSnapshot = await db
      .collection('users')
      .where('email', '==', email)
      .limit(1)
      .get();

    if (userSnapshot.empty) {
      return res.status(401).json({
        error: 'Invalid credentials'
      });
    }

    const userDoc = userSnapshot.docs[0];
    const user = userDoc.data();
    const uid = userDoc.id;

    const now = new Date();

    if (user.lockedUntil && user.lockedUntil.toDate() > now) {
      return res.status(423).json({
        error: 'Account is locked',
        unlockAt: user.lockedUntil.toDate().toISOString()
      });
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

    if (!isPasswordValid) {
      const failedAttempts = (user.failedLoginAttempts || 0) + 1;

      const updateData = {
        failedLoginAttempts: failedAttempts
      };

      if (failedAttempts >= 5) {
        const lockedUntil = new Date(Date.now() + 10 * 60 * 1000);
        updateData.lockedUntil = admin.firestore.Timestamp.fromDate(lockedUntil);
      }

      await db.collection('users').doc(uid).update(updateData);

      return res.status(failedAttempts >= 5 ? 423 : 401).json({
        error: failedAttempts >= 5 ? 'Account is locked' : 'Invalid credentials',
        ...(failedAttempts >= 5
          ? { unlockAt: updateData.lockedUntil.toDate().toISOString() }
          : {})
      });
    }

    await db.collection('users').doc(uid).update({
      failedLoginAttempts: 0,
      lockedUntil: null,
      lastLoginAt: admin.firestore.FieldValue.serverTimestamp()
    });

    const token = jwt.sign(
      {
        uid,
        role: user.role
      },
      process.env.JWT_SECRET,
      {
        expiresIn: '24h'
      }
    );

    return res.status(200).json({
      token,
      user: {
        id: uid,
        uid,
        name: user.name || '',
        email: user.email || '',
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