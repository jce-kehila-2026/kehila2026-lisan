const admin = require('../config/firebase');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const db = admin.firestore();

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // 1) Validate input
    if (!email || !password) {
      return res.status(400).json({
        error: 'Email and password are required'
      });
    }

    // 2) Find user by email in Firestore
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

    // 3) Check if account is locked
    const now = new Date();

    if (user.lockedUntil && user.lockedUntil.toDate() > now) {
      return res.status(423).json({
        error: 'Account is locked',
        unlockAt: user.lockedUntil.toDate().toISOString()
      });
    }

    // 4) Compare password
    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

    // 5) Wrong password
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

      if (failedAttempts >= 5) {
        return res.status(423).json({
          error: 'Account is locked',
          unlockAt: updateData.lockedUntil.toDate().toISOString()
        });
      }

      return res.status(401).json({
        error: 'Invalid credentials'
      });
    }

    // 6) Correct password: reset failed attempts and update login time
    await db.collection('users').doc(uid).update({
      failedLoginAttempts: 0,
      lockedUntil: null,
      lastLoginAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // 7) Generate JWT
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

    // 8) Return response
    return res.status(200).json({
      token,
      user: {
        id: uid,
        name: user.name,
        role: user.role,
        language: user.language
      }
    });
  } catch (error) {
    console.error('Login error:', error);

    return res.status(500).json({
      error: 'Server error'
    });
  }
};