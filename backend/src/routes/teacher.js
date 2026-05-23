const express = require('express');

const router = express.Router();

const teacherController = require('../controllers/teacherController');

const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/roles');

router.get(
  '/students',
  requireAuth,
  requireRole('teacher'),
  teacherController.getMyStudents
);

router.get(
  '/students/:studentId/progress',
  requireAuth,
  requireRole('teacher'),
  teacherController.getStudentProgress
);

router.get(
  '/students/:studentId/attempts',
  requireAuth,
  requireRole('teacher'),
  teacherController.getStudentAttempts
);

router.get(
  '/students/:studentId/chats',
  requireAuth,
  requireRole('teacher'),
  teacherController.getStudentChats
);

module.exports = router;