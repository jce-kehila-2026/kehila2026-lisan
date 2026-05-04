const admin = require('./src/config/firebase');
const bcrypt = require('bcrypt');

const db = admin.firestore();

async function seedUsers() {
  const users = [
    { email: 'student@test.com', role: 'student' },
    { email: 'expert@test.com', role: 'expert' },
    { email: 'admin@test.com', role: 'admin' }
  ];

  const password = 'Test1234!';
  const passwordHash = await bcrypt.hash(password, 10);

  for (const user of users) {
    await db.collection('users').add({
      email: user.email,
      passwordHash,
      name: 'Test User',
      role: user.role,
      language: 'ar',
      level: 'beginner',
      failedLoginAttempts: 0,
      lockedUntil: null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      lastLoginAt: null
    });
  }

  console.log('Users seeded successfully');
}

seedUsers();