const express = require('express');

const router = express.Router();

const adminController = require('../controllers/adminController');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/roles');

router.get('/users', requireAuth, requireRole('admin'), adminController.getAllUsers);

router.get('/chat/stats', requireAuth, requireRole('admin'), adminController.getChatStats);

router.post('/users', requireAuth, requireRole('admin'), adminController.createUser);

router.put('/users/:id', requireAuth, requireRole('admin'), adminController.updateUser);

router.delete('/users/:id', requireAuth, requireRole('admin'), adminController.deleteUser);

module.exports = router;
