const { admin, db } = require('./src/config/firebase');

async function seedEvaluationContext() {
  try {

    // =========================
    // User
    // =========================

    await db.collection('users').doc('test_user').set({

      name: 'Test Student',

      level: 'A1',

      role: 'student',

      currentUnitId: 'unit_a1_01',

      currentActivityId: 'a1_booking_appointment',

      pronunciationUsage: {
        monthlyLimit: 30,
        usedThisMonth: 10
      }
    });

    // =========================
    // Activity
    // =========================

    await db
      .collection('activities')
      .doc('a1_booking_appointment')
      .set({

        unitId: 'unit_a1_01',

        level: 'A1',

        skill: 'speaking',

        title: 'קביעת תור',

        topic: 'booking an appointment',

        activityMode: 'guided_conversation',

        analysisDepth: 'meaning_only',

        targetVocabulary: [
          'לקבוע תור',
          'תעודת זהות',
          'שעה'
        ],

        targetGrammar: [
          'אני רוצה',
          'אפשר'
        ],

        expectedPatterns: [
          'אני רוצה לקבוע תור',
          'אפשר לקבוע תור?'
        ],

        referenceText:
          'אני רוצה לקבוע תור',

        strictness: 'low',

        maxFeedbackItems: 1,

        feedbackLanguage: 'he',

        supportLanguage: 'ar',

        allowAdvancedCorrectLanguage: true,

        simplifyAdvancedLanguage: true,

        isActive: true
      });

    // =========================
    // Turn
    // =========================

    await db
      .collection('activities')
      .doc('a1_booking_appointment')
      .collection('turns')
      .doc('turn_01')
      .set({

        order: 1,

        speaker: 'bot',

        botTextHe:
          'שלום, איך אפשר לעזור?',

        expectedStudentAction:
          'ask_to_book_appointment',

        expectedPatterns: [
          'אני רוצה לקבוע תור',
          'אפשר לקבוע תור?'
        ],

        referenceText:
          'אני רוצה לקבוע תור',

        rubricId:
          'rubric_booking_appointment'
      });

    // =========================
    // Rubric
    // =========================

    await db
      .collection('rubrics')
      .doc('rubric_booking_appointment')
      .set({

        activityId:
          'a1_booking_appointment',

        level: 'A1',

        expectedMeaning:
          'הסטודנט צריך לבקש לקבוע תור.',

        requiredElements: [
          'request_appointment'
        ],

        acceptablePatterns: [
          'אני רוצה לקבוע תור',
          'אפשר לקבוע תור?',
          'ברצוני לקבוע פגישה'
        ],

        commonMistakes: [
          {
            wrong: 'לעשות תור',

            correct: 'לקבוע תור',

            type: 'vocabulary',

            explanationHeSimple:
              'בעברית אומרים לקבוע תור.'
          }
        ],

        correctionPolicy: {

          maxCorrections: 1,

          correctOnlyLevelRelevant: true,

          ignoreAdvancedStylisticIssues: true,

          doNotPunishAdvancedCorrectHebrew: true
        }
      });

    console.log(
      '✅ Evaluation context seeded successfully'
    );

  } catch (error) {

    console.error(
      '❌ Seed error:',
      error
    );
  }
}

seedEvaluationContext();