const { db } = require('../config/firebase');

const VOCAB_PROGRESS_COLLECTION = 'vocabProgress';

/**
 * POST /api/vocab/progress
 *
 * Body: { userId, words: [{word, correct}], level, sessionId? }
 * Called from ai-service after each successful voice transcription.
 *
 * Firestore document: vocabProgress/{userId}_{word}
 *   seenCount     : number of times the student used this word
 *   correctCount  : number of times it was recognised as correct
 *   lastSeen      : ISO timestamp
 *   level         : curriculum level (A1, A2, …)
 */
exports.trackVocabProgress = async (req, res) => {
  try {
    const { userId, words, level } = req.body;

    if (!userId || !Array.isArray(words) || words.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'userId and non-empty words array are required',
        code: 'INVALID_PAYLOAD',
      });
    }

    const now = new Date().toISOString();
    const batch = db.batch();

    for (const entry of words) {
      const word = (entry.word || '').trim();
      if (!word) continue;

      const docId = `${userId}_${word}`;
      const docRef = db.collection(VOCAB_PROGRESS_COLLECTION).doc(docId);

      // Use Firestore increment so concurrent writes don't clobber each other
      const { FieldValue } = require('firebase-admin/firestore');
      batch.set(
        docRef,
        {
          userId,
          word,
          level: level || 'A1',
          seenCount: FieldValue.increment(1),
          correctCount: entry.correct
            ? FieldValue.increment(1)
            : FieldValue.increment(0),
          lastSeen: now,
        },
        { merge: true }
      );
    }

    await batch.commit();

    return res.status(200).json({
      success: true,
      tracked: words.length,
    });
  } catch (error) {
    console.error('trackVocabProgress error:', error);
    return res.status(500).json({
      success: false,
      error: 'Server error',
      code: 'SERVER_ERROR',
    });
  }
};

/**
 * GET /api/vocab/progress/:userId
 *
 * Returns all tracked words for a student, sorted by seenCount desc.
 * Protected by internal-secret (called from ai-service or admin dashboard).
 */
exports.getVocabProgress = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId is required',
        code: 'INVALID_PAYLOAD',
      });
    }

    const snapshot = await db
      .collection(VOCAB_PROGRESS_COLLECTION)
      .where('userId', '==', userId)
      .orderBy('seenCount', 'desc')
      .get();

    const words = [];
    snapshot.forEach((doc) => words.push({ id: doc.id, ...doc.data() }));

    return res.status(200).json({
      success: true,
      userId,
      count: words.length,
      words,
    });
  } catch (error) {
    console.error('getVocabProgress error:', error);
    return res.status(500).json({
      success: false,
      error: 'Server error',
      code: 'SERVER_ERROR',
    });
  }
};
