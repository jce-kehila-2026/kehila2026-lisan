const { db } = require('../config/firebase');

const normalizeTeacherIds = (student) => {
  const teacherIds = [];

  if (Array.isArray(student.teacherIds)) {
    teacherIds.push(...student.teacherIds);
  }

  if (student.teacherId) {
    teacherIds.push(student.teacherId);
  }

  return [...new Set(teacherIds)];
};

const isTeacherAssignedToStudent = (student, teacherId) => {
  return normalizeTeacherIds(student).includes(teacherId);
};

exports.getMyStudents = async (req, res) => {
  try {
    const teacherId = req.user.uid;

    const snapshot = await db
      .collection('users')
      .where('role', '==', 'student')
      .get();

    const students = [];

    snapshot.forEach((doc) => {
      const data = doc.data();

      if (!isTeacherAssignedToStudent(data, teacherId)) {
        return;
      }

      students.push({
        id: doc.id,
        name: data.name || '',
        email: data.email || '',
        level: data.level || '',
        language: data.language || 'ar',
        isActive: data.isActive ?? true,
        teacherId: data.teacherId || null,
        teacherIds: normalizeTeacherIds(data),
        createdAt: data.createdAt || null,
        lastLoginAt: data.lastLoginAt || null,
      });
    });

    return res.status(200).json({
      success: true,
      students,
    });
  } catch (error) {
    console.error('Get teacher students error:', error);

    return res.status(500).json({
      success: false,
      error: 'Server error',
      code: 'SERVER_ERROR',
    });
  }
};

exports.getStudentProgress = async (req, res) => {
  try {
    const teacherId = req.user.uid;
    const { studentId } = req.params;

    const studentDoc = await db.collection('users').doc(studentId).get();

    if (!studentDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Student not found',
        code: 'STUDENT_NOT_FOUND',
      });
    }

    const student = studentDoc.data();

    if (
      student.role !== 'student' ||
      !isTeacherAssignedToStudent(student, teacherId)
    ) {
      return res.status(403).json({
        success: false,
        error: 'Access denied',
        code: 'ACCESS_DENIED',
      });
    }

    const attemptsSnapshot = await db
      .collection('studentAttempts')
      .where('userId', '==', studentId)
      .get();

    const chatsSnapshot = await db
      .collection('chatSessions')
      .where('userId', '==', studentId)
      .get();

    let correctMeaningCount = 0;

    attemptsSnapshot.forEach((doc) => {
      const attempt = doc.data();

      if (attempt.aiEvaluation?.isMeaningCorrect === true) {
        correctMeaningCount++;
      }
    });

    const totalAttempts = attemptsSnapshot.size;
    const totalChats = chatsSnapshot.size;

    return res.status(200).json({
      success: true,
      progress: {
        studentId,
        name: student.name || '',
        email: student.email || '',
        level: student.level || '',
        totalAttempts,
        correctMeaningCount,
        totalChats,
        accuracy:
          totalAttempts > 0
            ? Math.round((correctMeaningCount / totalAttempts) * 100)
            : 0,
        pronunciationUsage: student.pronunciationUsage || {
          monthlyLimit: 30,
          usedThisMonth: 0,
        },
      },
    });
  } catch (error) {
    console.error('Get student progress error:', error);

    return res.status(500).json({
      success: false,
      error: 'Server error',
      code: 'SERVER_ERROR',
    });
  }
};

exports.getStudentAttempts = async (req, res) => {
  try {
    const teacherId = req.user.uid;
    const { studentId } = req.params;

    const studentDoc = await db.collection('users').doc(studentId).get();

    if (!studentDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Student not found',
        code: 'STUDENT_NOT_FOUND',
      });
    }

    const student = studentDoc.data();

    if (
      student.role !== 'student' ||
      !isTeacherAssignedToStudent(student, teacherId)
    ) {
      return res.status(403).json({
        success: false,
        error: 'Access denied',
        code: 'ACCESS_DENIED',
      });
    }

    const snapshot = await db
      .collection('studentAttempts')
      .where('userId', '==', studentId)
      .get();

    const attempts = [];

    snapshot.forEach((doc) => {
      attempts.push({
        id: doc.id,
        ...doc.data(),
      });
    });

    return res.status(200).json({
      success: true,
      count: attempts.length,
      attempts,
    });
  } catch (error) {
    console.error('Get student attempts error:', error);

    return res.status(500).json({
      success: false,
      error: 'Server error',
      code: 'SERVER_ERROR',
    });
  }
};

exports.getStudentChats = async (req, res) => {
  try {
    const teacherId = req.user.uid;
    const { studentId } = req.params;

    const studentDoc = await db.collection('users').doc(studentId).get();

    if (!studentDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Student not found',
        code: 'STUDENT_NOT_FOUND',
      });
    }

    const student = studentDoc.data();

    if (
      student.role !== 'student' ||
      !isTeacherAssignedToStudent(student, teacherId)
    ) {
      return res.status(403).json({
        success: false,
        error: 'Access denied',
        code: 'ACCESS_DENIED',
      });
    }

    const snapshot = await db
      .collection('chatSessions')
      .where('userId', '==', studentId)
      .get();

    const chats = [];

    snapshot.forEach((doc) => {
      const data = doc.data();

      chats.push({
        id: doc.id,
        userId: data.userId,
        title: data.title,
        level: data.level,
        startedAt: data.startedAt || null,
        updatedAt: data.updatedAt || null,
        messagesCount: data.messages ? data.messages.length : 0,
      });
    });

    return res.status(200).json({
      success: true,
      chats,
    });
  } catch (error) {
    console.error('Get student chats error:', error);

    return res.status(500).json({
      success: false,
      error: 'Server error',
      code: 'SERVER_ERROR',
    });
  }
};