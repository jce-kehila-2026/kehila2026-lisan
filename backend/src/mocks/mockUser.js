const mockUser = {
  id: 'student_001',
  name: 'فاطمة',
  role: 'student',
  level: 'beginner',
  preferences: {
    language: 'ar',
    notificationsEnabled: true
  },
  progress: {
    lessonsCompleted: 5,
    currentStreak: 3,
    totalScore: 145
  }
};

const mockToken = 'mock-jwt-token-12345';

module.exports = {
  mockUser,
  mockToken
};