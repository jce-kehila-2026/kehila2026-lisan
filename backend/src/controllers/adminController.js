const { admin, db } = require('../config/firebase');
const bcrypt = require('bcrypt');

const normalizeTeacherIds = (teacherIds, teacherId) => {
  if (Array.isArray(teacherIds)) {
    return [...new Set(teacherIds.filter(Boolean))];
  }

  if (teacherId) {
    return [teacherId];
  }

  return [];
};

const validateTeacherIds = async (teacherIds) => {
  for (const teacherId of teacherIds) {
    const teacherDoc = await db.collection('users').doc(teacherId).get();

    if (!teacherDoc.exists) {
      return {
        valid: false,
        error: `Teacher ${teacherId} was not found`
      };
    }

    const teacher = teacherDoc.data();

    if (teacher.role !== 'teacher') {
      return {
        valid: false,
        error: `User ${teacherId} is not a teacher`
      };
    }
  }

  return {
    valid: true
  };
};

exports.getAllUsers = async (req, res) => {
  try {
    const snapshot = await db.collection('users').get();

    const users = [];

    snapshot.forEach((doc) => {
      const data = doc.data();

      users.push({
        id: doc.id,
        email: data.email,
        name: data.name,
        role: data.role,
        level: data.level,
        language: data.language,
        isActive: data.isActive ?? true,
        teacherIds: normalizeTeacherIds(data.teacherIds, data.teacherId),
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
      language,
      teacherIds,
      teacherId
    } = req.body;

    if (!email || !password || !name || !role) {
      return res.status(400).json({
        success: false,
        error: 'email, password, name, and role are required',
        code: 'MISSING_REQUIRED_FIELDS'
      });
    }

    const allowedRoles = ['student', 'teacher', 'admin'];

    if (!allowedRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid role',
        code: 'INVALID_ROLE'
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        error: 'Password must be at least 6 characters',
        code: 'WEAK_PASSWORD'
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const existingUserSnapshot = await db
      .collection('users')
      .where('email', '==', normalizedEmail)
      .limit(1)
      .get();

    if (!existingUserSnapshot.empty) {
      return res.status(409).json({
        success: false,
        error: 'User already exists',
        code: 'USER_ALREADY_EXISTS'
      });
    }

    const normalizedTeacherIds = normalizeTeacherIds(teacherIds, teacherId);

    if (role === 'student' && normalizedTeacherIds.length > 0) {
      const validation = await validateTeacherIds(normalizedTeacherIds);

      if (!validation.valid) {
        return res.status(400).json({
          success: false,
          error: validation.error,
          code: 'INVALID_TEACHERS'
        });
      }
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const userData = {
      email: normalizedEmail,
      passwordHash,
      name,
      role,
      level: role === 'student' ? level || 'A1' : '',
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

    if (role === 'student') {
      userData.teacherIds = normalizedTeacherIds;
    }

    const docRef = await db.collection('users').add(userData);

    return res.status(201).json({
      success: true,
      user: {
        id: docRef.id,
        email: normalizedEmail,
        name,
        role,
        level: userData.level,
        language: userData.language,
        isActive: true,
        teacherIds: userData.teacherIds || []
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

    const userRef = db.collection('users').doc(id);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }

    const allowedFields = [
      'name',
      'email',
      'role',
      'level',
      'language',
      'isActive'
    ];

    const updateData = {};

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        if (field === 'email') {
          updateData.email = req.body.email.trim().toLowerCase();
        } else {
          updateData[field] = req.body[field];
        }
      }
    }

    if (updateData.role !== undefined) {
      const allowedRoles = ['student', 'teacher', 'admin'];

      if (!allowedRoles.includes(updateData.role)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid role',
          code: 'INVALID_ROLE'
        });
      }

      if (updateData.role !== 'student') {
        updateData.level = '';
      }
    }

    const normalizedTeacherIds = normalizeTeacherIds(
      req.body.teacherIds,
      req.body.teacherId
    );

    if (
      req.body.teacherIds !== undefined ||
      req.body.teacherId !== undefined
    ) {
      const validation = await validateTeacherIds(normalizedTeacherIds);

      if (!validation.valid) {
        return res.status(400).json({
          success: false,
          error: validation.error,
          code: 'INVALID_TEACHERS'
        });
      }

      updateData.teacherIds = normalizedTeacherIds;
    }

    if (updateData.email) {
      const existingUserSnapshot = await db
        .collection('users')
        .where('email', '==', updateData.email)
        .limit(1)
        .get();

      if (!existingUserSnapshot.empty) {
        const existingDoc = existingUserSnapshot.docs[0];

        if (existingDoc.id !== id) {
          return res.status(409).json({
            success: false,
            error: 'Email already exists',
            code: 'EMAIL_ALREADY_EXISTS'
          });
        }
      }
    }

    if (req.body.password !== undefined && req.body.password !== '') {
      if (req.body.password.length < 6) {
        return res.status(400).json({
          success: false,
          error: 'Password must be at least 6 characters',
          code: 'WEAK_PASSWORD'
        });
      }

      updateData.passwordHash = await bcrypt.hash(req.body.password, 10);
      updateData.failedLoginAttempts = 0;
      updateData.lockedUntil = null;
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid fields provided',
        code: 'NO_VALID_FIELDS'
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