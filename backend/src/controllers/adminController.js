const { admin, db } = require('../config/firebase');
const bcrypt = require('bcrypt');
const fs = require('fs');
const path = require('path');

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

exports.getChatStats = async (req, res) => {
  try {
    const now = new Date();
    const startOfTodayUtc = new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      0,
      0,
      0,
      0
    ));

    const snapshot = await db.collection('chatSessions').get();

    let messagesToday = 0;
    let newConversationsToday = 0;
    const activeUserIds = new Set();

    snapshot.forEach((doc) => {
      const chat = doc.data() || {};
      const startedAtDate = normalizeFirestoreDate(chat.startedAt);

      if (startedAtDate && startedAtDate >= startOfTodayUtc) {
        newConversationsToday += 1;
      }

      const messages = Array.isArray(chat.messages) ? chat.messages : [];
      let hasMessageToday = false;

      for (const message of messages) {
        const messageDate = normalizeFirestoreDate(message?.createdAt);

        if (!messageDate || messageDate < startOfTodayUtc) {
          continue;
        }

        messagesToday += 1;
        hasMessageToday = true;
      }

      if (hasMessageToday && chat.userId) {
        activeUserIds.add(chat.userId);
      }
    });

    return res.status(200).json({
      success: true,
      stats: {
        asOf: now.toISOString(),
        messagesToday,
        newConversationsToday,
        activeUsersToday: activeUserIds.size
      }
    });
  } catch (error) {
    console.error('Get chat stats error:', error);

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

function normalizeFirestoreDate(value) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  if (typeof value.toDate === 'function') {
    const dateValue = value.toDate();

    return dateValue instanceof Date && !Number.isNaN(dateValue.getTime())
      ? dateValue
      : null;
  }

  return null;
}

const allowedLevels = ['A1', 'A2', 'B1', 'B2'];
const allowedLanguages = ['ar', 'he', 'en'];
const allowedAudioMimeTypes = [
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/wave',
  'audio/webm',
  'audio/mp4',
  'audio/m4a',
  'audio/x-m4a',
  'application/octet-stream'
];

const parseTags = (tags) => {
  if (!tags) {
    return [];
  }

  if (Array.isArray(tags)) {
    return tags.map((tag) => String(tag).trim()).filter(Boolean);
  }

  if (typeof tags === 'string') {
    try {
      const parsed = JSON.parse(tags);

      if (Array.isArray(parsed)) {
        return parsed.map((tag) => String(tag).trim()).filter(Boolean);
      }
    } catch (error) {
      return tags
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean);
    }
  }

  return [];
};

const parseJsonFile = (file) => {
  if (!file) {
    return {};
  }

  try {
    return JSON.parse(file.buffer.toString('utf8'));
  } catch (error) {
    throw new Error('Invalid JSON file');
  }
};

const validateAudioRecordingPayload = (payload, requireAudioFile = false) => {
  const errors = [];

  if (!payload.title || !String(payload.title).trim()) {
    errors.push('title is required');
  }

  if (!payload.level || !allowedLevels.includes(payload.level)) {
    errors.push('level must be one of A1, A2, B1, B2');
  }

  if (!payload.language || !allowedLanguages.includes(payload.language)) {
    errors.push('language must be one of ar, he, en');
  }

  if (!payload.category || !String(payload.category).trim()) {
    errors.push('category is required');
  }

  if (!payload.transcriptText || !String(payload.transcriptText).trim()) {
    errors.push('transcriptText is required');
  }

  if (requireAudioFile && !payload.audioFile) {
    errors.push('audioFile is required');
  }

  if (payload.audioFile && !allowedAudioMimeTypes.includes(payload.audioFile.mimetype)) {
    errors.push('audioFile must be a valid audio file');
  }

  return errors;
};

const saveFileLocally = async ({ file, relativePath }) => {
  const uploadRoot = path.join(__dirname, '../../uploads');
  const fullPath = path.join(uploadRoot, relativePath);
  const directory = path.dirname(fullPath);

  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(fullPath, file.buffer);

  return {
    url: `/uploads/${relativePath.replace(/\\/g, '/')}`,
    storagePath: relativePath.replace(/\\/g, '/'),
    storageProvider: 'local'
  };
};

const deleteLocalFile = async (storagePath) => {
  if (!storagePath) {
    return;
  }

  try {
    const uploadRoot = path.join(__dirname, '../../uploads');
    const fullPath = path.join(uploadRoot, storagePath);

    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }
  } catch (error) {
    console.warn('Failed to delete local file:', error.message);
  }
};

exports.createAudioRecording = async (req, res) => {
  try {
    const audioFile = req.files?.audioFile?.[0] || null;
    const jsonFile = req.files?.jsonFile?.[0] || null;

    let jsonData = {};

    try {
      jsonData = parseJsonFile(jsonFile);
    } catch (error) {
      return res.status(400).json({
        success: false,
        error: error.message,
        code: 'INVALID_JSON_FILE'
      });
    }

    const payload = {
      ...jsonData,
      ...req.body,
      audioFile
    };

    const validationErrors = validateAudioRecordingPayload(payload, true);

    if (validationErrors.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid audio recording payload',
        details: validationErrors,
        code: 'VALIDATION_ERROR'
      });
    }

    const docRef = db.collection('audioRecordings').doc();
    const now = admin.firestore.FieldValue.serverTimestamp();

    const audioExtension = audioFile.originalname.split('.').pop() || 'audio';
    const audioPath = `audio-recordings/${docRef.id}/audio.${audioExtension}`;

    const uploadedAudio = await saveFileLocally({
      file: audioFile,
      relativePath: audioPath
    });

    let uploadedJson = null;

    if (jsonFile) {
      uploadedJson = await saveFileLocally({
        file: jsonFile,
        relativePath: `audio-recordings/${docRef.id}/metadata.json`
      });
    }

    const recordingData = {
      title: String(payload.title).trim(),
      description: payload.description ? String(payload.description).trim() : '',
      level: payload.level,
      language: payload.language,
      category: String(payload.category).trim(),
      transcriptText: String(payload.transcriptText).trim(),
      audioUrl: uploadedAudio.url,
      audioStoragePath: uploadedAudio.storagePath,
      audioStorageProvider: uploadedAudio.storageProvider,
      jsonUrl: uploadedJson?.url || '',
      jsonStoragePath: uploadedJson?.storagePath || '',
      jsonStorageProvider: uploadedJson?.storageProvider || '',
      duration: Number(payload.duration || 0),
      tags: parseTags(payload.tags),
      createdBy: req.user.uid,
      createdAt: now,
      updatedAt: now,
      isActive: payload.isActive === undefined
        ? true
        : payload.isActive === true || payload.isActive === 'true'
    };

    await docRef.set(recordingData);

    return res.status(201).json({
      success: true,
      recording: {
        id: docRef.id,
        ...recordingData
      }
    });
  } catch (error) {
    console.error('Create audio recording error:', error);

    return res.status(500).json({
      success: false,
      error: 'Server error',
      code: 'SERVER_ERROR'
    });
  }
};

exports.getAudioRecordings = async (req, res) => {
  try {
    const {
      level,
      language,
      category,
      isActive
    } = req.query;

    let query = db.collection('audioRecordings');

    if (level) {
      query = query.where('level', '==', level);
    }

    if (language) {
      query = query.where('language', '==', language);
    }

    if (category) {
      query = query.where('category', '==', category);
    }

    if (isActive !== undefined) {
      query = query.where('isActive', '==', isActive === 'true');
    }

    const snapshot = await query.get();

    const recordings = [];

    snapshot.forEach((doc) => {
      recordings.push({
        id: doc.id,
        ...doc.data()
      });
    });

    recordings.sort((a, b) => {
      const first = normalizeFirestoreDate(a.createdAt)?.getTime() || 0;
      const second = normalizeFirestoreDate(b.createdAt)?.getTime() || 0;

      return second - first;
    });

    return res.status(200).json({
      success: true,
      recordings
    });
  } catch (error) {
    console.error('Get audio recordings error:', error);

    return res.status(500).json({
      success: false,
      error: 'Server error',
      code: 'SERVER_ERROR'
    });
  }
};

exports.getAudioRecordingById = async (req, res) => {
  try {
    const { id } = req.params;

    const doc = await db.collection('audioRecordings').doc(id).get();

    if (!doc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Audio recording not found',
        code: 'AUDIO_RECORDING_NOT_FOUND'
      });
    }

    return res.status(200).json({
      success: true,
      recording: {
        id: doc.id,
        ...doc.data()
      }
    });
  } catch (error) {
    console.error('Get audio recording error:', error);

    return res.status(500).json({
      success: false,
      error: 'Server error',
      code: 'SERVER_ERROR'
    });
  }
};

exports.updateAudioRecording = async (req, res) => {
  try {
    const { id } = req.params;

    const recordingRef = db.collection('audioRecordings').doc(id);
    const recordingDoc = await recordingRef.get();

    if (!recordingDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Audio recording not found',
        code: 'AUDIO_RECORDING_NOT_FOUND'
      });
    }

    const currentRecording = recordingDoc.data();

    const audioFile = req.files?.audioFile?.[0] || null;
    const jsonFile = req.files?.jsonFile?.[0] || null;

    let jsonData = {};

    try {
      jsonData = parseJsonFile(jsonFile);
    } catch (error) {
      return res.status(400).json({
        success: false,
        error: error.message,
        code: 'INVALID_JSON_FILE'
      });
    }

    const payload = {
      ...currentRecording,
      ...jsonData,
      ...req.body,
      audioFile
    };

    const validationErrors = validateAudioRecordingPayload(payload, false);

    if (validationErrors.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid audio recording payload',
        details: validationErrors,
        code: 'VALIDATION_ERROR'
      });
    }

    const updateData = {
      title: String(payload.title).trim(),
      description: payload.description ? String(payload.description).trim() : '',
      level: payload.level,
      language: payload.language,
      category: String(payload.category).trim(),
      transcriptText: String(payload.transcriptText).trim(),
      duration: Number(payload.duration || 0),
      tags: parseTags(payload.tags),
      isActive: payload.isActive === true || payload.isActive === 'true',
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    if (audioFile) {
      await deleteLocalFile(currentRecording.audioStoragePath);

      const audioExtension = audioFile.originalname.split('.').pop() || 'audio';
      const uploadedAudio = await saveFileLocally({
        file: audioFile,
        relativePath: `audio-recordings/${id}/audio.${audioExtension}`
      });

      updateData.audioUrl = uploadedAudio.url;
      updateData.audioStoragePath = uploadedAudio.storagePath;
      updateData.audioStorageProvider = uploadedAudio.storageProvider;
    }

    if (jsonFile) {
      await deleteLocalFile(currentRecording.jsonStoragePath);

      const uploadedJson = await saveFileLocally({
        file: jsonFile,
        relativePath: `audio-recordings/${id}/metadata.json`
      });

      updateData.jsonUrl = uploadedJson.url;
      updateData.jsonStoragePath = uploadedJson.storagePath;
      updateData.jsonStorageProvider = uploadedJson.storageProvider;
    }

    await recordingRef.update(updateData);

    return res.status(200).json({
      success: true,
      recording: {
        id,
        ...currentRecording,
        ...updateData
      }
    });
  } catch (error) {
    console.error('Update audio recording error:', error);

    return res.status(500).json({
      success: false,
      error: 'Server error',
      code: 'SERVER_ERROR'
    });
  }
};

exports.deleteAudioRecording = async (req, res) => {
  try {
    const { id } = req.params;

    const recordingRef = db.collection('audioRecordings').doc(id);
    const recordingDoc = await recordingRef.get();

    if (!recordingDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Audio recording not found',
        code: 'AUDIO_RECORDING_NOT_FOUND'
      });
    }

    const recording = recordingDoc.data();

    await deleteLocalFile(recording.audioStoragePath);
    await deleteLocalFile(recording.jsonStoragePath);

    await recordingRef.delete();

    return res.status(200).json({
      success: true,
      message: 'Audio recording deleted successfully'
    });
  } catch (error) {
    console.error('Delete audio recording error:', error);

    return res.status(500).json({
      success: false,
      error: 'Server error',
      code: 'SERVER_ERROR'
    });
  }
};

exports.getAllConversations = async (req, res) => {
  try {
    const {
      studentId,
      teacherId,
      level,
      isArchived,
      from,
      to,
      search,
      page = 1,
      limit = 20
    } = req.query;

    let query = db.collection('chatSessions');

    if (studentId) {
      query = query.where('userId', '==', studentId);
    }

    if (level) {
      query = query.where('level', '==', level);
    }

    if (isArchived !== undefined) {
      query = query.where('isArchived', '==', isArchived === 'true');
    }

    const snapshot = await query.get();

    let conversations = [];

    snapshot.forEach((doc) => {
      const data = doc.data();

      conversations.push({
        id: doc.id,
        userId: data.userId,
        title: data.title || 'שיחה',
        level: data.level || 'A1',
        isArchived: data.isArchived === true,
        messagesCount: Array.isArray(data.messages) ? data.messages.length : 0,
        messages: Array.isArray(data.messages) ? data.messages : [],
        startedAt: data.startedAt || null,
        updatedAt: data.updatedAt || null
      });
    });

    if (teacherId) {
      const studentSnapshot = await db
        .collection('users')
        .where('role', '==', 'student')
        .get();

      const allowedStudentIds = new Set();

      studentSnapshot.forEach((doc) => {
        const student = doc.data();
        const teacherIds = normalizeTeacherIds(student.teacherIds, student.teacherId);

        if (teacherIds.includes(teacherId)) {
          allowedStudentIds.add(doc.id);
        }
      });

      conversations = conversations.filter((conversation) =>
        allowedStudentIds.has(conversation.userId)
      );
    }

    if (from || to) {
      const fromDate = from ? new Date(from) : null;
      const toDate = to ? new Date(to) : null;

      conversations = conversations.filter((conversation) => {
        const updatedAt = normalizeFirestoreDate(conversation.updatedAt);

        if (!updatedAt) {
          return false;
        }

        if (fromDate && updatedAt < fromDate) {
          return false;
        }

        if (toDate && updatedAt > toDate) {
          return false;
        }

        return true;
      });
    }

    if (search) {
      const normalizedSearch = String(search).trim().toLowerCase();

      conversations = conversations.filter((conversation) => {
        const title = String(conversation.title || '').toLowerCase();

        const messagesText = conversation.messages
          .map((message) => `${message.text || ''} ${message.transcribedText || ''}`)
          .join(' ')
          .toLowerCase();

        return (
          title.includes(normalizedSearch) ||
          conversation.userId.toLowerCase().includes(normalizedSearch) ||
          messagesText.includes(normalizedSearch)
        );
      });
    }

    conversations.sort((a, b) => {
      const first = normalizeFirestoreDate(a.updatedAt)?.getTime() || 0;
      const second = normalizeFirestoreDate(b.updatedAt)?.getTime() || 0;
      return second - first;
    });

    const pageNumber = Math.max(Number(page) || 1, 1);
    const limitNumber = Math.min(Math.max(Number(limit) || 20, 1), 100);
    const total = conversations.length;
    const startIndex = (pageNumber - 1) * limitNumber;
    const paginatedConversations = conversations
      .slice(startIndex, startIndex + limitNumber)
      .map(({ messages, ...conversation }) => conversation);

    return res.status(200).json({
      success: true,
      conversations: paginatedConversations,
      pagination: {
        page: pageNumber,
        limit: limitNumber,
        total,
        totalPages: Math.ceil(total / limitNumber)
      }
    });
  } catch (error) {
    console.error('Get admin conversations error:', error);

    return res.status(500).json({
      success: false,
      error: 'Server error',
      code: 'SERVER_ERROR'
    });
  }
};

exports.getConversationById = async (req, res) => {
  try {
    const { id } = req.params;

    const doc = await db.collection('chatSessions').doc(id).get();

    if (!doc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Conversation not found',
        code: 'CONVERSATION_NOT_FOUND'
      });
    }

    return res.status(200).json({
      success: true,
      conversation: {
        id: doc.id,
        ...doc.data()
      }
    });
  } catch (error) {
    console.error('Get admin conversation error:', error);

    return res.status(500).json({
      success: false,
      error: 'Server error',
      code: 'SERVER_ERROR'
    });
  }
};

exports.getPendingWords = async (req, res) => {
  try {
    const snapshot = await db
      .collection('pendingWords')
      .orderBy('createdAt', 'desc')
      .get();

    const words = [];

    snapshot.forEach((doc) => {
      words.push({
        id: doc.id,
        ...doc.data()
      });
    });

    return res.status(200).json({
      success: true,
      words
    });
  } catch (error) {
    console.error('Get pending words error:', error);

    return res.status(500).json({
      success: false,
      error: 'Server error',
      code: 'SERVER_ERROR'
    });
  }
};

exports.createWord = async (req, res) => {
  try {
    const {
      word,
      translation,
      level,
      language,
      notes
    } = req.body;

    if (!word || !translation) {
      return res.status(400).json({
        success: false,
        error: 'word and translation are required',
        code: 'VALIDATION_ERROR'
      });
    }

    if (level && !allowedLevels.includes(level)) {
      return res.status(400).json({
        success: false,
        error: 'level must be one of A1, A2, B1, B2',
        code: 'VALIDATION_ERROR'
      });
    }

    if (language && !allowedLanguages.includes(language)) {
      return res.status(400).json({
        success: false,
        error: 'language must be one of ar, he, en',
        code: 'VALIDATION_ERROR'
      });
    }

    const docRef = await db.collection('pendingWords').add({
      word: String(word).trim(),
      translation: String(translation).trim(),
      level: level || 'A1',
      language: language || 'he',
      notes: notes || '',
      status: 'pending',
      createdBy: req.user.uid,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return res.status(201).json({
      success: true,
      id: docRef.id
    });
  } catch (error) {
    console.error('Create word error:', error);

    return res.status(500).json({
      success: false,
      error: 'Server error',
      code: 'SERVER_ERROR'
    });
  }
};

exports.approveWord = async (req, res) => {
  try {
    const { id } = req.params;

    const pendingRef = db.collection('pendingWords').doc(id);
    const pendingDoc = await pendingRef.get();

    if (!pendingDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Word not found',
        code: 'WORD_NOT_FOUND'
      });
    }

    const data = pendingDoc.data();

    const approvedRef = await db.collection('words').add({
      ...data,
      status: 'approved',
      reviewedBy: req.user.uid,
      reviewedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    await pendingRef.delete();

    return res.status(200).json({
      success: true,
      wordId: approvedRef.id
    });
  } catch (error) {
    console.error('Approve word error:', error);

    return res.status(500).json({
      success: false,
      error: 'Server error',
      code: 'SERVER_ERROR'
    });
  }
};

exports.rejectWord = async (req, res) => {
  try {
    const { id } = req.params;
    const { notes } = req.body;

    const wordRef = db.collection('pendingWords').doc(id);

    const wordDoc = await wordRef.get();

    if (!wordDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Word not found',
        code: 'WORD_NOT_FOUND'
      });
    }

    await wordRef.update({
      status: 'rejected',
      rejectionNotes: notes || '',
      reviewedBy: req.user.uid,
      reviewedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return res.status(200).json({
      success: true,
      message: 'Word rejected successfully'
    });
  } catch (error) {
    console.error('Reject word error:', error);

    return res.status(500).json({
      success: false,
      error: 'Server error',
      code: 'SERVER_ERROR'
    });
  }
};

// ─────────────────────────────────────────────────────────────────────────
// Full Analytics (GET /api/admin/analytics/full)
// Standalone, read-only aggregation endpoint for the /admin/analytics page.
// Every section reads from a real Firestore collection and is wrapped in
// its own try/catch so a missing or empty collection never fails the
// response — it just contributes 0 / [] to that section. No mock data,
// no random numbers. Does not touch any existing logic in this file.
// ─────────────────────────────────────────────────────────────────────────

const safeNumber = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
};

const average = (numbers) => {
  const valid = numbers.filter(
    (value) => typeof value === 'number' && Number.isFinite(value)
  );

  if (valid.length === 0) {
    return 0;
  }

  const sum = valid.reduce((total, value) => total + value, 0);

  return Math.round((sum / valid.length) * 10) / 10;
};

const isWithinRange = (date, fromDate, toDate) => {
  if (!fromDate && !toDate) {
    return true;
  }

  if (!date) {
    return false;
  }

  if (fromDate && date < fromDate) {
    return false;
  }

  if (toDate && date > toDate) {
    return false;
  }

  return true;
};

exports.getFullAnalytics = async (req, res) => {
  try {
    const { from, to, search } = req.query;

    const fromDate = from ? new Date(from) : null;
    // A plain 'YYYY-MM-DD' value parses to UTC midnight, which would make
    // the selected end day itself fall outside the range. Push it to the
    // last instant of that day so the whole day is included.
    const toDate = to
      ? new Date(new Date(to).setUTCHours(23, 59, 59, 999))
      : null;
    const normalizedSearch = search ? String(search).trim().toLowerCase() : '';

    // ---- 1) Users (students / teachers / everyone) ----
    let allUsers = [];

    try {
      const snapshot = await db.collection('users').get();

      snapshot.forEach((doc) => {
        const data = doc.data() || {};

        allUsers.push({
          id: doc.id,
          name: data.name || '',
          email: data.email || '',
          role: data.role || '',
          level: data.level || '',
          isActive: data.isActive ?? true,
          teacherIds: normalizeTeacherIds(data.teacherIds, data.teacherId),
          createdAt: data.createdAt || null,
          lastLoginAt: data.lastLoginAt || null,
          failedLoginAttempts: safeNumber(data.failedLoginAttempts)
        });
      });
    } catch (error) {
      console.error('Analytics: failed to load users:', error.message);
    }

    const students = allUsers.filter((item) => item.role === 'student');
    const teachers = allUsers.filter((item) => item.role === 'teacher');
    const activeUsers = allUsers.filter((item) => item.isActive !== false);

    // ---- 2) Chat sessions (AI tutor conversations + voice messages) ----
    let chatSessions = [];

    try {
      const snapshot = await db.collection('chatSessions').get();

      snapshot.forEach((doc) => {
        const data = doc.data() || {};

        chatSessions.push({
          id: doc.id,
          userId: data.userId || null,
          level: allowedLevels.includes(data.level) ? data.level : null,
          isArchived: data.isArchived === true,
          startedAt: data.startedAt || null,
          updatedAt: data.updatedAt || null,
          messages: Array.isArray(data.messages) ? data.messages : []
        });
      });
    } catch (error) {
      console.error('Analytics: failed to load chatSessions:', error.message);
    }

    const chatSessionsInRange = (fromDate || toDate)
      ? chatSessions.filter((chat) =>
          isWithinRange(normalizeFirestoreDate(chat.startedAt), fromDate, toDate)
        )
      : chatSessions;

    let totalAiMessages = 0;
    let totalVoiceRecordings = 0;
    const aiMessagesByLevel = { A1: 0, A2: 0, B1: 0, B2: 0 };
    const aiMessagesByStudent = {};
    const voiceByLevel = { A1: 0, A2: 0, B1: 0, B2: 0 };
    const voiceByStudent = {};

    chatSessionsInRange.forEach((chat) => {
      chat.messages.forEach((message) => {
        if (!message) {
          return;
        }

        totalAiMessages += 1;

        if (chat.level) {
          aiMessagesByLevel[chat.level] += 1;
        }

        if (chat.userId) {
          aiMessagesByStudent[chat.userId] =
            (aiMessagesByStudent[chat.userId] || 0) + 1;
        }

        if (message.sender === 'user' && message.type === 'voice') {
          totalVoiceRecordings += 1;

          if (chat.level) {
            voiceByLevel[chat.level] += 1;
          }

          if (chat.userId) {
            voiceByStudent[chat.userId] = (voiceByStudent[chat.userId] || 0) + 1;
          }
        }
      });
    });

    // ---- 3) Student attempts (pronunciation / speaking evaluation) ----
    let studentAttempts = [];

    try {
      const snapshot = await db.collection('studentAttempts').get();

      snapshot.forEach((doc) => {
        const data = doc.data() || {};

        studentAttempts.push({
          id: doc.id,
          userId: data.userId || null,
          aiEvaluation: data.aiEvaluation || null,
          createdAt: data.createdAt || null
        });
      });
    } catch (error) {
      console.error('Analytics: failed to load studentAttempts:', error.message);
    }

    const attemptsInRange = (fromDate || toDate)
      ? studentAttempts.filter((attempt) =>
          isWithinRange(normalizeFirestoreDate(attempt.createdAt), fromDate, toDate)
        )
      : studentAttempts;

    let failedEvaluations = 0;
    const pronunciationScores = [];

    attemptsInRange.forEach((attempt) => {
      if (!attempt.aiEvaluation) {
        failedEvaluations += 1;
      }

      const pronunciationScore = attempt.aiEvaluation?.scores?.pronunciation;

      if (typeof pronunciationScore === 'number') {
        pronunciationScores.push(pronunciationScore);
      }
    });

    // ---- 3b) Vocabulary game progress ----
    // studentAttempts (above) has no write path anywhere in this codebase
    // (backend, frontend, or ai-service), so in real usage it reads back
    // empty. gameProgress is the one progress collection the app actually
    // writes to (see progressController.completeGameLevel /
    // components/VocabGame.jsx), so it gives a genuine, non-zero signal.
    let gameProgressDocs = [];

    try {
      const snapshot = await db.collection('gameProgress').get();

      snapshot.forEach((doc) => {
        const data = doc.data() || {};
        const categories =
          data.categories && typeof data.categories === 'object' ? data.categories : {};
        const levelsCompleted = Object.values(categories).reduce(
          (sum, levels) => sum + (Array.isArray(levels) ? levels.length : 0),
          0
        );

        gameProgressDocs.push({
          userId: data.userId || doc.id,
          levelsCompleted
        });
      });
    } catch (error) {
      console.error('Analytics: failed to load gameProgress:', error.message);
    }

    const gameLevelsByStudent = {};
    gameProgressDocs.forEach((entry) => {
      gameLevelsByStudent[entry.userId] = entry.levelsCompleted;
    });

    const totalGameLevelsCompleted = gameProgressDocs.reduce(
      (sum, entry) => sum + entry.levelsCompleted,
      0
    );
    const studentsWithGameActivity = gameProgressDocs.filter(
      (entry) => entry.levelsCompleted > 0
    ).length;

    // ---- 4) Shared chats (student-teacher / student-student messaging) ----
    let sharedChats = [];

    try {
      const snapshot = await db.collection('sharedChats').get();

      snapshot.forEach((doc) => {
        const data = doc.data() || {};

        sharedChats.push({
          id: doc.id,
          participants: Array.isArray(data.participants) ? data.participants : [],
          participantRoles: data.participantRoles || {},
          unreadBy: Array.isArray(data.unreadBy) ? data.unreadBy : [],
          updatedAt: data.updatedAt || null,
          createdAt: data.createdAt || null
        });
      });
    } catch (error) {
      console.error('Analytics: failed to load sharedChats:', error.message);
    }

    let studentTeacherChats = 0;
    let studentStudentChats = 0;
    let totalUnreadMessages = 0;
    const participantFrequency = {};

    sharedChats.forEach((chat) => {
      const roles = Object.values(chat.participantRoles || {});

      if (roles.includes('teacher') && roles.includes('student')) {
        studentTeacherChats += 1;
      } else if (roles.length > 0 && roles.every((role) => role === 'student')) {
        studentStudentChats += 1;
      }

      totalUnreadMessages += chat.unreadBy.length;

      chat.participants.forEach((uid) => {
        participantFrequency[uid] = (participantFrequency[uid] || 0) + 1;
      });
    });

    let totalSharedMessages = 0;

    try {
      const messagesSnapshot = await db.collectionGroup('messages').get();
      totalSharedMessages = messagesSnapshot.size;
    } catch (error) {
      console.error('Analytics: failed to load shared chat messages:', error.message);
    }

    const topSharedChatUsers = Object.entries(participantFrequency)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([uid, count]) => {
        const user = allUsers.find((item) => item.id === uid);

        return {
          id: uid,
          name: user?.name || user?.email || uid,
          role: user?.role || '',
          chatsCount: count
        };
      });

    // ---- 5) Vocabulary (pendingWords + words) ----
    let pendingWordsDocs = [];
    let approvedWordsDocs = [];

    try {
      const snapshot = await db.collection('pendingWords').get();
      snapshot.forEach((doc) => pendingWordsDocs.push(doc.data() || {}));
    } catch (error) {
      console.error('Analytics: failed to load pendingWords:', error.message);
    }

    try {
      const snapshot = await db.collection('words').get();
      snapshot.forEach((doc) => approvedWordsDocs.push(doc.data() || {}));
    } catch (error) {
      console.error('Analytics: failed to load words:', error.message);
    }

    const pendingWordsCount = pendingWordsDocs.filter(
      (word) => (word.status || 'pending') === 'pending'
    ).length;
    const rejectedWordsCount = pendingWordsDocs.filter(
      (word) => word.status === 'rejected'
    ).length;
    const approvedWordsCount = approvedWordsDocs.length;

    const wordsByLevel = { A1: 0, A2: 0, B1: 0, B2: 0 };

    [...pendingWordsDocs, ...approvedWordsDocs].forEach((word) => {
      if (allowedLevels.includes(word.level)) {
        wordsByLevel[word.level] += 1;
      }
    });

    // ---- 6) Chat reviews (used for the teachers table) ----
    let chatReviews = [];

    try {
      const snapshot = await db.collection('chatReviews').get();

      snapshot.forEach((doc) => {
        const data = doc.data() || {};

        chatReviews.push({
          id: doc.id,
          userId: data.userId || null,
          reviewedBy: data.reviewedBy || null,
          status: data.status || 'pending',
          createdAt: data.createdAt || null
        });
      });
    } catch (error) {
      console.error('Analytics: failed to load chatReviews:', error.message);
    }

    // ---- 7) System (best-effort; no dedicated error-log collection exists) ----
    const totalFailedLoginAttempts = allUsers.reduce(
      (sum, user) => sum + safeNumber(user.failedLoginAttempts),
      0
    );

    // ---- Build per-student rows ----
    const studentRows = students.map((student) => {
      const chatsForStudent = chatSessionsInRange.filter(
        (chat) => chat.userId === student.id
      );
      const attemptsForStudent = attemptsInRange.filter(
        (attempt) => attempt.userId === student.id
      );
      const totalAttempts = attemptsForStudent.length;
      const correctForStudent = attemptsForStudent.filter(
        (attempt) => attempt.aiEvaluation?.isMeaningCorrect === true
      ).length;
      const accuracy =
        totalAttempts > 0
          ? Math.round((correctForStudent / totalAttempts) * 100)
          : 0;

      const teacherNames = student.teacherIds
        .map((teacherId) => teachers.find((teacher) => teacher.id === teacherId)?.name)
        .filter(Boolean);

      return {
        id: student.id,
        name: student.name,
        email: student.email,
        level: student.level,
        teacherNames,
        lastLoginAt: student.lastLoginAt,
        aiChatsCount: chatsForStudent.length,
        aiMessagesCount: aiMessagesByStudent[student.id] || 0,
        voiceRecordingsCount: voiceByStudent[student.id] || 0,
        averageProgress: accuracy,
        gameLevelsCompleted: gameLevelsByStudent[student.id] || 0,
        sharedChatsCount: participantFrequency[student.id] || 0,
        status: student.isActive === false ? 'inactive' : 'active'
      };
    });

    const filteredStudentRows = normalizedSearch
      ? studentRows.filter(
          (row) =>
            row.name.toLowerCase().includes(normalizedSearch) ||
            row.email.toLowerCase().includes(normalizedSearch)
        )
      : studentRows;

    // ---- Build per-teacher rows ----
    const teacherRows = teachers.map((teacher) => {
      const assignedStudents = students.filter((student) =>
        student.teacherIds.includes(teacher.id)
      );
      const assignedStudentIds = new Set(assignedStudents.map((student) => student.id));

      const messagesWithStudentsCount = sharedChats.filter(
        (chat) =>
          chat.participants.includes(teacher.id) &&
          chat.participants.some((uid) => assignedStudentIds.has(uid))
      ).length;

      const reviewsCount = chatReviews.filter(
        (review) => review.reviewedBy === teacher.id
      ).length;

      const progressValues = assignedStudents.map((student) => {
        const row = studentRows.find((item) => item.id === student.id);
        return row ? row.averageProgress : 0;
      });

      return {
        id: teacher.id,
        name: teacher.name,
        email: teacher.email,
        studentsCount: assignedStudents.length,
        messagesWithStudentsCount,
        reviewsCount,
        averageStudentsProgress: average(progressValues),
        lastActivityAt: teacher.lastLoginAt,
        status: teacher.isActive === false ? 'inactive' : 'active'
      };
    });

    const filteredTeacherRows = normalizedSearch
      ? teacherRows.filter(
          (row) =>
            row.name.toLowerCase().includes(normalizedSearch) ||
            row.email.toLowerCase().includes(normalizedSearch)
        )
      : teacherRows;

    // ---- Progress aggregation ----
    const overallAverageProgress = average(studentRows.map((row) => row.averageProgress));

    const progressByLevel = {};
    allowedLevels.forEach((level) => {
      const values = studentRows
        .filter((row) => row.level === level)
        .map((row) => row.averageProgress);
      progressByLevel[level] = average(values);
    });

    const sortedByProgress = [...studentRows].sort(
      (a, b) => b.averageProgress - a.averageProgress
    );
    const topStudents = sortedByProgress.slice(0, 5);
    const bottomStudents = [...sortedByProgress].reverse().slice(0, 5);

    // ---- AI usage leaders ----
    const topAiUsers = [...studentRows]
      .filter((row) => row.aiMessagesCount > 0)
      .sort((a, b) => b.aiMessagesCount - a.aiMessagesCount)
      .slice(0, 5);

    const topGameStudents = [...studentRows]
      .filter((row) => row.gameLevelsCompleted > 0)
      .sort((a, b) => b.gameLevelsCompleted - a.gameLevelsCompleted)
      .slice(0, 5);

    // ---- Audio by-student breakdown ----
    const audioByStudent = students
      .map((student) => ({
        id: student.id,
        name: student.name,
        recordings: voiceByStudent[student.id] || 0
      }))
      .filter((item) => item.recordings > 0)
      .sort((a, b) => b.recordings - a.recordings)
      .slice(0, 10);

    const studentsByLevel = allowedLevels.reduce((acc, level) => {
      acc[level] = students.filter((student) => student.level === level).length;
      return acc;
    }, {});

    return res.status(200).json({
      success: true,
      generatedAt: new Date().toISOString(),
      filters: {
        from: from || null,
        to: to || null,
        search: search || null
      },
      overview: {
        totalStudents: students.length,
        totalTeachers: teachers.length,
        totalUsers: allUsers.length,
        activeUsers: activeUsers.length,
        totalAiChats: chatSessionsInRange.length,
        totalAiMessages,
        totalSharedChats: sharedChats.length,
        totalAudioRecordings: totalVoiceRecordings,
        pendingWordsCount,
        averageProgress: overallAverageProgress
      },
      students: filteredStudentRows,
      teachers: filteredTeacherRows,
      progress: {
        overallAverage: overallAverageProgress,
        byLevel: progressByLevel,
        topStudents,
        bottomStudents,
        details: studentRows,
        vocabularyGame: {
          studentsWithActivity: studentsWithGameActivity,
          totalLevelsCompleted: totalGameLevelsCompleted,
          averageLevelsPerStudent: average(
            studentRows.map((row) => row.gameLevelsCompleted)
          ),
          topStudents: topGameStudents
        }
      },
      ai: {
        totalChats: chatSessionsInRange.length,
        totalMessages: totalAiMessages,
        messagesByLevel: aiMessagesByLevel,
        topStudentsByUsage: topAiUsers,
        errors: [],
        quotaErrors: [],
        averageResponseTimeMs: 0
      },
      sharedChats: {
        totalChats: sharedChats.length,
        totalMessages: totalSharedMessages,
        studentTeacherChats,
        studentStudentChats,
        unreadMessages: totalUnreadMessages,
        topUsers: topSharedChatUsers
      },
      vocabulary: {
        totalWords: pendingWordsDocs.length + approvedWordsDocs.length,
        pendingWords: pendingWordsCount,
        approvedWords: approvedWordsCount,
        rejectedWords: rejectedWordsCount,
        byLevel: wordsByLevel
      },
      audio: {
        totalRecordings: totalVoiceRecordings,
        byLevel: voiceByLevel,
        byStudent: audioByStudent,
        averagePronunciationScore: average(pronunciationScores),
        failedEvaluations
      },
      system: {
        apiErrors: [],
        firebaseErrors: [],
        quotaErrors: [],
        failedLoginAttempts: totalFailedLoginAttempts,
        recentErrors: []
      },
      charts: {
        messagesByLevel: aiMessagesByLevel,
        wordsByLevel,
        progressByLevel,
        studentsByLevel
      }
    });
  } catch (error) {
    console.error('Get full analytics error:', error);

    return res.status(500).json({
      success: false,
      error: 'Server error',
      code: 'SERVER_ERROR'
    });
  }
};