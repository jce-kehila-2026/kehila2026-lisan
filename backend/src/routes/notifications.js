const express = require('express');
const { db } = require('../config/firebase');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/my', requireAuth, async (req, res) => {
  try {
    const snapshot = await db
      .collection('notifications')
      .where('userId', '==', req.user.uid)
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get();

    const notifications = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data()
    }));

    return res.status(200).json({
      notifications
    });
  } catch (error) {
    console.error('Get notifications error:', error);

    return res.status(500).json({
      error: 'Failed to load notifications'
    });
  }
});

router.put('/:id/read', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const notificationRef = db.collection('notifications').doc(id);
    const notificationDoc = await notificationRef.get();

    if (!notificationDoc.exists) {
      return res.status(404).json({
        error: 'Notification not found'
      });
    }

    const notification = notificationDoc.data();

    if (notification.userId !== req.user.uid) {
      return res.status(403).json({
        error: 'You are not allowed to update this notification'
      });
    }

    await notificationRef.update({
      isRead: true,
      readAt: new Date().toISOString()
    });

    return res.status(200).json({
      message: 'Notification marked as read'
    });
  } catch (error) {
    console.error('Mark notification read error:', error);

    return res.status(500).json({
      error: 'Failed to mark notification as read'
    });
  }
});

module.exports = router;