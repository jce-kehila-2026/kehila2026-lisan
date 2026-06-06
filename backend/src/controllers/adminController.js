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
    const { studentId, level, isArchived } = req.query;

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

    const conversations = [];

    snapshot.forEach((doc) => {
      const data = doc.data();

      conversations.push({
        id: doc.id,
        userId: data.userId,
        title: data.title || 'שיחה',
        level: data.level || 'A1',
        isArchived: data.isArchived === true,
        messagesCount: Array.isArray(data.messages) ? data.messages.length : 0,
        startedAt: data.startedAt || null,
        updatedAt: data.updatedAt || null
      });
    });

    conversations.sort((a, b) => {
      const first = normalizeFirestoreDate(a.updatedAt)?.getTime() || 0;
      const second = normalizeFirestoreDate(b.updatedAt)?.getTime() || 0;
      return second - first;
    });

    return res.status(200).json({
      success: true,
      conversations
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