const { db } = require('../config/firebase');

exports.getMyAttempts = async (req, res) => {
  try {
    const userId = req.user.uid;

    const snapshot = await db
      .collection('studentAttempts')
      .where('userId', '==', userId)
      .get();

    const attempts = [];

    snapshot.forEach(doc => {
      attempts.push({
        id: doc.id,
        ...doc.data()
      });
    });

    return res.status(200).json({
      success: true,
      count: attempts.length,
      attempts
    });
  } catch (error) {
    console.error('Get my attempts error:', error);

    return res.status(500).json({
      success: false,
      error: 'Server error',
      code: 'SERVER_ERROR'
    });
  }
};

exports.getMyProgress = async (req, res) => {
  try {
    const userId = req.user.uid;

    const userDoc = await db
      .collection('users')
      .doc(userId)
      .get();

    if (!userDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }

    const user = userDoc.data();

    const attemptsSnapshot = await db
      .collection('studentAttempts')
      .where('userId', '==', userId)
      .get();

    const chatsSnapshot = await db
      .collection('chatSessions')
      .where('userId', '==', userId)
      .get();

    let correctMeaningCount = 0;

    attemptsSnapshot.forEach(doc => {
      const attempt = doc.data();

      if (attempt.aiEvaluation?.isMeaningCorrect === true) {
        correctMeaningCount++;
      }
    });

    const totalAttempts = attemptsSnapshot.size;
    const totalChats = chatsSnapshot.size;

    const pronunciationUsage = user.pronunciationUsage || {
      monthlyLimit: 30,
      usedThisMonth: 0
    };

    return res.status(200).json({
      success: true,
      progress: {
        userId,
        name: user.name,
        role: user.role,
        level: user.level,
        totalAttempts,
        correctMeaningCount,
        totalChats,
        pronunciationUsage,
        accuracy:
          totalAttempts > 0
            ? Math.round((correctMeaningCount / totalAttempts) * 100)
            : 0
      }
    });
  } catch (error) {
    console.error('Get my progress error:', error);

    return res.status(500).json({
      success: false,
      error: 'Server error',
      code: 'SERVER_ERROR'
    });
  }
};