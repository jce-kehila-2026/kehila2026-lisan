const { db } = require('../config/firebase');

async function getEvaluationContext({
  userId,
  activityId,
  turnId
}) {

  // =========================
  // 1) Get user
  // =========================

  const userDoc = await db
    .collection('users')
    .doc(userId)
    .get();

  if (!userDoc.exists) {
    throw {
      code: 'USER_NOT_FOUND',
      message: 'User not found'
    };
  }

  const user = userDoc.data();

  // =========================
  // 2) Get activity
  // =========================

  const activityDoc = await db
    .collection('activities')
    .doc(activityId)
    .get();

  if (!activityDoc.exists) {
    throw {
      code: 'ACTIVITY_NOT_FOUND',
      message: 'Activity not found'
    };
  }

  const activity = activityDoc.data();

  // =========================
  // 3) Get turn (optional)
  // =========================

  let currentTurn = null;

  if (turnId) {

    const turnDoc = await db
      .collection('activities')
      .doc(activityId)
      .collection('turns')
      .doc(turnId)
      .get();

    if (turnDoc.exists) {
      currentTurn = turnDoc.data();
    }
  }

  // =========================
  // 4) Get rubric
  // =========================

  let rubric = {};

  if (currentTurn?.rubricId) {

    const rubricDoc = await db
      .collection('rubrics')
      .doc(currentTurn.rubricId)
      .get();

    if (rubricDoc.exists) {
      rubric = rubricDoc.data();
    }
  }

  // =========================
  // 5) Build normalized context
  // =========================

  const level =
    user.level ||
    activity.level ||
    'A1';

  const monthlyLimit =
    user.pronunciationUsage?.monthlyLimit || 30;

  const usedThisMonth =
    user.pronunciationUsage?.usedThisMonth || 0;

  return {

    userId,
    activityId,
    turnId: turnId || null,

    level,

    skill:
      activity.skill || 'speaking',

    activity: {

      title:
        activity.title || '',

      topic:
        activity.topic || '',

      activityMode:
        activity.activityMode ||
        'guided_conversation',

      analysisDepth:
        activity.analysisDepth ||
        (level === 'A1' || level === 'A2'
          ? 'meaning_only'
          : 'standard'),

      targetVocabulary:
        activity.targetVocabulary || [],

      targetGrammar:
        activity.targetGrammar || [],

      expectedPatterns:
        activity.expectedPatterns || [],

      referenceText:
        activity.referenceText || '',

      strictness:
        activity.strictness || 'low',

      maxFeedbackItems:
        activity.maxFeedbackItems ||
        (level === 'A1' || level === 'A2'
          ? 1
          : 2),

      feedbackLanguage:
        activity.feedbackLanguage || 'he',

      supportLanguage:
        activity.supportLanguage || 'ar',

      allowAdvancedCorrectLanguage:
        activity.allowAdvancedCorrectLanguage ?? true,

      simplifyAdvancedLanguage:
        activity.simplifyAdvancedLanguage ?? true
    },

    currentTurn: currentTurn
      ? {
          botTextHe:
            currentTurn.botTextHe || '',

          expectedStudentAction:
            currentTurn.expectedStudentAction || '',

          expectedPatterns:
            currentTurn.expectedPatterns || [],

          referenceText:
            currentTurn.referenceText || ''
        }
      : null,

    rubric: {

      expectedMeaning:
        rubric.expectedMeaning || '',

      requiredElements:
        rubric.requiredElements || [],

      acceptablePatterns:
        rubric.acceptablePatterns || [],

      commonMistakes:
        rubric.commonMistakes || [],

      correctionPolicy:
        rubric.correctionPolicy || {
          maxCorrections: 1,
          correctOnlyLevelRelevant: true,
          ignoreAdvancedStylisticIssues: true,
          doNotPunishAdvancedCorrectHebrew: true
        }
    },

    limits: {

      remainingPronunciationChecks:
        monthlyLimit - usedThisMonth,

      monthlyPronunciationLimit:
        monthlyLimit
    }
  };
}

async function saveStudentAttempt({
  userId,
  activityId,
  turnId,
  recognizedTextHe,
  aiEvaluation,
  usage
}) {
  const attemptData = {
    userId,
    activityId,
    turnId: turnId || null,
    level: usage?.level || null,
    recognizedTextHe,
    referenceText: usage?.referenceText || '',
    aiEvaluation: aiEvaluation || null,
    usedAzurePronunciation: usage?.usedAzurePronunciation || false,
    costMode: usage?.costMode || 'standard',
    createdAt: new Date().toISOString()
  };

  const docRef = await db
    .collection('studentAttempts')
    .add(attemptData);

  return {
    id: docRef.id,
    ...attemptData
  };
}

module.exports = {
  getEvaluationContext,
  saveStudentAttempt
};