const { admin, db } = require('../config/firebase');

exports.createChat = async (req, res) => {
  try {
    const { title, level } = req.body;

    const userId = req.user.uid;

    const chatData = {
      userId,
      title: title || 'New Chat',
      level: level || 'A1',
      startedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      messages: []
    };

    const docRef = await db
      .collection('chatSessions')
      .add(chatData);

    return res.status(201).json({
      success: true,
      chat: {
        id: docRef.id,
        ...chatData,
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Create chat error:', error);

    return res.status(500).json({
      success: false,
      error: 'Server error',
      code: 'SERVER_ERROR'
    });
  }
};

exports.getMyChats = async (req, res) => {
  try {
    const userId = req.user.uid;

    const snapshot = await db
      .collection('chatSessions')
      .where('userId', '==', userId)
      .get();

    const chats = [];

    snapshot.forEach(doc => {
      const data = doc.data();

      chats.push({
        id: doc.id,
        userId: data.userId,
        title: data.title,
        level: data.level,
        startedAt: data.startedAt || null,
        updatedAt: data.updatedAt || null,
        messagesCount: data.messages ? data.messages.length : 0
      });
    });

    return res.status(200).json({
      success: true,
      chats
    });
  } catch (error) {
    console.error('Get my chats error:', error);

    return res.status(500).json({
      success: false,
      error: 'Server error',
      code: 'SERVER_ERROR'
    });
  }
};

exports.getChatById = async (req, res) => {
  try {
    const userId = req.user.uid;
    const { chatId } = req.params;

    const chatDoc = await db
      .collection('chatSessions')
      .doc(chatId)
      .get();

    if (!chatDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Chat not found',
        code: 'CHAT_NOT_FOUND'
      });
    }

    const chat = chatDoc.data();

    if (chat.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied',
        code: 'ACCESS_DENIED'
      });
    }

    return res.status(200).json({
      success: true,
      chat: {
        id: chatDoc.id,
        ...chat
      }
    });
  } catch (error) {
    console.error('Get chat by id error:', error);

    return res.status(500).json({
      success: false,
      error: 'Server error',
      code: 'SERVER_ERROR'
    });
  }
};

exports.addMessage = async (req, res) => {
  try {
    const userId = req.user.uid;
    const { chatId } = req.params;
    const { sender, text } = req.body;

    if (!sender || !text) {
      return res.status(400).json({
        success: false,
        error: 'sender and text are required',
        code: 'MISSING_REQUIRED_FIELDS'
      });
    }

    const allowedSenders = ['user', 'ai'];

    if (!allowedSenders.includes(sender)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid sender',
        code: 'INVALID_SENDER'
      });
    }

    const chatRef = db
      .collection('chatSessions')
      .doc(chatId);

    const chatDoc = await chatRef.get();

    if (!chatDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Chat not found',
        code: 'CHAT_NOT_FOUND'
      });
    }

    const chat = chatDoc.data();

    if (chat.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied',
        code: 'ACCESS_DENIED'
      });
    }

    const message = {
      sender,
      text,
      createdAt: new Date().toISOString()
    };

    await chatRef.update({
      messages: admin.firestore.FieldValue.arrayUnion(message),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return res.status(201).json({
      success: true,
      message
    });
  } catch (error) {
    console.error('Add message error:', error);

    return res.status(500).json({
      success: false,
      error: 'Server error',
      code: 'SERVER_ERROR'
    });
  }
};