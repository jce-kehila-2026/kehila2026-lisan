const { admin, db } = require('../config/firebase');
const bcrypt = require('bcrypt');

exports.getAllUsers = async (req, res) => {
  try {
    const snapshot = await db.collection('users').get();

    const users = [];

    snapshot.forEach(doc => {
      const data = doc.data();

      users.push({
        id: doc.id,
        email: data.email,
        name: data.name,
        role: data.role,
        level: data.level,
        language: data.language,
        isActive: data.isActive ?? true,
        createdAt: data.createdAt || null,
        lastLoginAt: data.lastLoginAt || null
      });
    });

    return res.status(200).json({
      success: true,
      users
    });
  } catch (error) {
    console.error('Get all users error:', error);

    return res.status(500).json({
      success: false,
      error: 'Server error',
      code: 'SERVER_ERROR'
    });
  }
};

exports.createUser = async (req, res) => {
  try {
    const {
      email,
      password,
      name,
      role,
      level,
      language
    } = req.body;

    if (!email || !password || !name || !role) {
      return res.status(400).json({
        success: false,
        error: 'email, password, name, and role are required',
        code: 'MISSING_REQUIRED_FIELDS'
      });
    }

    const allowedRoles = ['student', 'teacher', 'admin', 'expert'];

    if (!allowedRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid role',
        code: 'INVALID_ROLE'
      });
    }

    const existingUserSnapshot = await db
      .collection('users')
      .where('email', '==', email)
      .limit(1)
      .get();

    if (!existingUserSnapshot.empty) {
      return res.status(409).json({
        success: false,
        error: 'User already exists',
        code: 'USER_ALREADY_EXISTS'
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const userData = {
      email,
      passwordHash,
      name,
      role,
      level: level || 'A1',
      language: language || 'ar',
      isActive: true,
      failedLoginAttempts: 0,
      lockedUntil: null,
      pronunciationUsage: {
        monthlyLimit: 30,
        usedThisMonth: 0
      },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      lastLoginAt: null
    };

    const docRef = await db.collection('users').add(userData);

    return res.status(201).json({
      success: true,
      user: {
        id: docRef.id,
        email,
        name,
        role,
        level: userData.level,
        language: userData.language,
        isActive: true
      }
    });
  } catch (error) {
    console.error('Create user error:', error);

    return res.status(500).json({
      success: false,
      error: 'Server error',
      code: 'SERVER_ERROR'
    });
  }
};

exports.updateUser = async (req, res) => {
  try {
    const { id } = req.params;

    const allowedFields = [
      'name',
      'role',
      'level',
      'language',
      'isActive'
    ];

    const updateData = {};

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
      }
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid fields provided',
        code: 'NO_VALID_FIELDS'
      });
    }

    const userRef = db.collection('users').doc(id);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }

    await userRef.update(updateData);

    return res.status(200).json({
      success: true,
      message: 'User updated successfully'
    });
  } catch (error) {
    console.error('Update user error:', error);

    return res.status(500).json({
      success: false,
      error: 'Server error',
      code: 'SERVER_ERROR'
    });
  }
};

exports.deleteUser = async (req, res) => {
  try {

    const { id } = req.params;

    const userRef = db.collection('users').doc(id);

    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }

    await userRef.delete();

    return res.status(200).json({
      success: true,
      message: 'User deleted successfully'
    });

  } catch (error) {

    console.error('Delete user error:', error);

    return res.status(500).json({
      success: false,
      error: 'Server error',
      code: 'SERVER_ERROR'
    });
  }
};