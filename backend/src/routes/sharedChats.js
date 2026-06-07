const express = require('express');
const { db } = require('../config/firebase');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const USER_CHAT_TYPE = 'user';
const MAX_MESSAGE_LENGTH = 5000;

const getCurrentUser = async (uid) => {
  const userDoc = await db.collection('users').doc(uid).get();

  if (!userDoc.exists) {
    return null;
  }

  return {
    id: userDoc.id,
    ...userDoc.data()
  };
};

const normalizeTeacherIds = (user) => {
  if (Array.isArray(user.teacherIds)) {
    return user.teacherIds;
  }

  if (user.teacherId) {
    return [user.teacherId];
  }

  return [];
};

const normalizeRole = (role) => {
  return String(role || '').trim().toLowerCase();
};

const normalizeLevel = (level) => {
  const value = String(level || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[-_]/g, '');

  if (value.includes('a1') || value.includes('א1')) return 'a1';
  if (value.includes('a2') || value.includes('א2')) return 'a2';
  if (value.includes('b1') || value.includes('ב1')) return 'b1';
  if (value.includes('b2') || value.includes('ב2')) return 'b2';
  if (value.includes('c1') || value === 'ג') return 'c1';
  if (value.includes('c2') || value === 'ד') return 'c2';

  return value;
};

const normalizeParticipants = (participants) => {
  return [...new Set(participants)].sort();
};

const sameParticipants = (first, second) => {
  const a = normalizeParticipants(first || []);
  const b = normalizeParticipants(second || []);

  if (a.length !== b.length) {
    return false;
  }

  return a.every((id, index) => id === b[index]);
};

const createNotificationsForParticipants = async ({
  chat,
  senderId,
  senderName,
  messageText,
  chatId
}) => {
  const participants = Array.isArray(chat.participants)
    ? chat.participants
    : [];

  const receivers = participants.filter((id) => id !== senderId);

  const notifications = receivers.map((userId) => ({
    userId,
    type: 'shared_chat_message',
    title: 'הודעה חדשה',
    message: `${senderName} שלחה הודעה חדשה`,
    preview: messageText,
    relatedChatId: chatId,
    isRead: false,
    createdAt: new Date().toISOString()
  }));

  await Promise.all(
    notifications.map((notification) =>
      db.collection('notifications').add(notification)
    )
  );
};

const canChatWith = (currentUser, targetUser) => {
  if (!currentUser || !targetUser) {
    return false;
  }

  if (currentUser.id === targetUser.id) {
    return false;
  }

  const currentRole = normalizeRole(currentUser.role);
  const targetRole = normalizeRole(targetUser.role);

  if (currentRole === 'teacher' && targetRole === 'student') {
    const teacherIds = [
      ...(Array.isArray(targetUser.teacherIds) ? targetUser.teacherIds : []),
      ...(targetUser.teacherId ? [targetUser.teacherId] : [])
    ];

    return teacherIds.includes(currentUser.id);
  }

  if (currentRole === 'student' && targetRole === 'teacher') {
    const teacherIds = [
      ...(Array.isArray(currentUser.teacherIds) ? currentUser.teacherIds : []),
      ...(currentUser.teacherId ? [currentUser.teacherId] : [])
    ];

    return teacherIds.includes(targetUser.id);
  }

  if (currentRole === 'student' && targetRole === 'student') {
    const currentLevel = normalizeLevel(currentUser.level);
    const targetLevel = normalizeLevel(targetUser.level);

    return Boolean(currentLevel && targetLevel && currentLevel === targetLevel);
  }

  return false;
};

const validateParticipants = async (currentUser, participantIds) => {
  const uniqueParticipantIds = [...new Set(participantIds)];
  const targetUsers = [];

  for (const participantId of uniqueParticipantIds) {
    const targetUser = await getCurrentUser(participantId);

    if (!targetUser) {
      return {
        valid: false,
        error: 'One or more participants were not found'
      };
    }

    if (!canChatWith(currentUser, targetUser)) {
      return {
        valid: false,
        error: 'You are not allowed to chat with one or more participants'
      };
    }

    targetUsers.push(targetUser);
  }

  return {
    valid: true,
    targetUsers
  };
};

const getChatTitle = (currentUser, targetUsers) => {
  if (targetUsers.length === 1) {
    return targetUsers[0].name || targetUsers[0].email || 'שיחה';
  }

  if (normalizeRole(currentUser.role) === 'teacher') {
    return `שיחה קבוצתית עם ${targetUsers.length} תלמידות`;
  }

  return 'שיחה קבוצתית';
};

const findExistingChat = async (participants) => {
  const normalizedParticipants = normalizeParticipants(participants);

  const snapshot = await db
    .collection('sharedChats')
    .where('participants', 'array-contains', normalizedParticipants[0])
    .get();

  const existingDoc = snapshot.docs.find((doc) => {
    const chat = doc.data();

    return (
      (chat.type || USER_CHAT_TYPE) === USER_CHAT_TYPE &&
      sameParticipants(chat.participants, normalizedParticipants)
    );
  });

  if (!existingDoc) {
    return null;
  }

  return {
    id: existingDoc.id,
    ...existingDoc.data()
  };
};

router.post('/', requireAuth, async (req, res) => {
  try {
    const { participantIds = [] } = req.body;

    if (!Array.isArray(participantIds) || participantIds.length === 0) {
      return res.status(400).json({
        error: 'participantIds is required'
      });
    }

    const currentUser = await getCurrentUser(req.user.uid);

    if (!currentUser) {
      return res.status(404).json({
        error: 'Current user was not found'
      });
    }

    const validation = await validateParticipants(currentUser, participantIds);

    if (!validation.valid) {
      return res.status(403).json({
        error: validation.error
      });
    }

    const participants = normalizeParticipants([
      currentUser.id,
      ...participantIds
    ]);

    const existingChat = await findExistingChat(participants);

    if (existingChat) {
      return res.status(200).json({
        message: 'Shared chat already exists',
        chatId: existingChat.id,
        existing: true
      });
    }

    const sharedChat = {
      type: USER_CHAT_TYPE,
      participants,
      participantRoles: {
        [currentUser.id]: currentUser.role,
        ...validation.targetUsers.reduce((roles, user) => {
          roles[user.id] = user.role;
          return roles;
        }, {})
      },
      participantNames: {
        [currentUser.id]: currentUser.name || currentUser.email || 'User',
        ...validation.targetUsers.reduce((names, user) => {
          names[user.id] = user.name || user.email || 'User';
          return names;
        }, {})
      },
      title: getChatTitle(currentUser, validation.targetUsers),
      createdBy: currentUser.id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastMessage: '',
      lastMessageSenderId: null,
      unreadBy: []
    };

    const docRef = await db.collection('sharedChats').add(sharedChat);

    return res.status(201).json({
      message: 'Shared chat created',
      chatId: docRef.id,
      existing: false
    });
  } catch (error) {
    console.error('Create shared chat error:', error);

    return res.status(500).json({
      error: 'Failed to create shared chat'
    });
  }
});

router.get('/my', requireAuth, async (req, res) => {
  try {
    const snapshot = await db
      .collection('sharedChats')
      .where('participants', 'array-contains', req.user.uid)
      .get();

    const chats = snapshot.docs
      .map((doc) => ({
        id: doc.id,
        ...doc.data()
      }))
      .filter((chat) => (chat.type || USER_CHAT_TYPE) === USER_CHAT_TYPE);

    chats.sort((a, b) => {
      return new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0);
    });

    return res.status(200).json({
      chats
    });
  } catch (error) {
    console.error('Get shared chats error:', error);

    return res.status(500).json({
      error: 'Failed to load shared chats'
    });
  }
});

router.post('/:id/messages', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { text } = req.body;

    if (!text || !text.trim()) {
      return res.status(400).json({
        error: 'Message text is required'
      });
    }

    if (text.length > MAX_MESSAGE_LENGTH) {
      return res.status(400).json({
        error: 'Message is too long'
      });
    }

    const chatRef = db.collection('sharedChats').doc(id);
    const chatDoc = await chatRef.get();

    if (!chatDoc.exists) {
      return res.status(404).json({
        error: 'Shared chat not found'
      });
    }

    const chat = chatDoc.data();

    if ((chat.type || USER_CHAT_TYPE) !== USER_CHAT_TYPE) {
      return res.status(400).json({
        error: 'This is not a user chat'
      });
    }

    if (!chat.participants?.includes(req.user.uid)) {
      return res.status(403).json({
        error: 'You are not a participant in this chat'
      });
    }

    const message = {
      senderId: req.user.uid,
      text: text.trim(),
      createdAt: new Date().toISOString()
    };

    const messageRef = await chatRef.collection('messages').add(message);

    const unreadBy = (chat.participants || []).filter(
      (participantId) => participantId !== req.user.uid
    );

    await chatRef.update({
      updatedAt: new Date().toISOString(),
      lastMessage: message.text,
      lastMessageSenderId: req.user.uid,
      unreadBy
    });

    const senderName = chat.participantNames?.[req.user.uid] || 'משתמש';

    await createNotificationsForParticipants({
      chat,
      senderId: req.user.uid,
      senderName,
      messageText: message.text,
      chatId: id
    });

    return res.status(201).json({
      message: {
        id: messageRef.id,
        ...message
      }
    });
  } catch (error) {
    console.error('Add shared chat message error:', error);

    return res.status(500).json({
      error: 'Failed to add message'
    });
  }
});

router.get('/available-users', requireAuth, async (req, res) => {
  try {
    const currentUser = await getCurrentUser(req.user.uid);

    if (!currentUser) {
      return res.status(404).json({
        error: 'Current user was not found'
      });
    }

    const snapshot = await db.collection('users').get();

    const users = snapshot.docs
      .map((doc) => ({
        id: doc.id,
        ...doc.data()
      }))
      .filter((user) => canChatWith(currentUser, user))
      .map((user) => ({
        id: user.id,
        name: user.name || user.email || 'User',
        email: user.email || '',
        role: user.role,
        level: user.level || 'A1'
      }));

    return res.status(200).json({
      users
    });
  } catch (error) {
    console.error('Get available users error:', error);

    return res.status(500).json({
      error: 'Failed to load available users'
    });
  }
});

router.get('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const chatRef = db.collection('sharedChats').doc(id);
    const chatDoc = await chatRef.get();

    if (!chatDoc.exists) {
      return res.status(404).json({
        error: 'Shared chat not found'
      });
    }

    const chat = chatDoc.data();

    if ((chat.type || USER_CHAT_TYPE) !== USER_CHAT_TYPE) {
      return res.status(400).json({
        error: 'This is not a user chat'
      });
    }

    if (!chat.participants?.includes(req.user.uid)) {
      return res.status(403).json({
        error: 'You are not a participant in this chat'
      });
    }

    const unreadBy = Array.isArray(chat.unreadBy)
      ? chat.unreadBy.filter((participantId) => participantId !== req.user.uid)
      : [];

    await chatRef.update({
      unreadBy
    });

    const messagesSnapshot = await chatRef
      .collection('messages')
      .orderBy('createdAt', 'asc')
      .get();

    const messages = messagesSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data()
    }));

    return res.status(200).json({
      chat: {
        id: chatDoc.id,
        ...chat,
        unreadBy
      },
      messages
    });
  } catch (error) {
    console.error('Get shared chat error:', error);

    return res.status(500).json({
      error: 'Failed to load shared chat'
    });
  }
});

module.exports = router;