/**
 * migrate-admin-to-teacher.js
 *
 * سكريبت لمرة وحدة: يحول كل المستخدمين role=admin في Firestore لـ role=teacher.
 *
 * شغّله من جوا مجلد backend:
 *   node scripts/migrate-admin-to-teacher.js
 *
 * بيطبع كل مستخدم تحوّل + ملخص نهائي.
 * آمن تماماً: بيعمل dry-run أول (يعرض الأسماء)، وبعدين يطلب تأكيد قبل الكتابة.
 */

require('dotenv').config();

const readline = require('readline');

let db;

try {
  ({ db } = require('../src/config/firebase'));
} catch (err) {
  console.error('Failed to load Firebase config:', err.message);
  process.exit(1);
}

async function findAdminUsers() {
  const snapshot = await db
    .collection('users')
    .where('role', '==', 'admin')
    .get();

  const users = [];

  snapshot.forEach((doc) => {
    const data = doc.data();

    users.push({
      id: doc.id,
      name: data.name || '(no name)',
      email: data.email || '(no email)',
    });
  });

  return users;
}

async function convertUsers(users) {
  let converted = 0;
  let failed = 0;

  for (const user of users) {
    try {
      await db.collection('users').doc(user.id).update({ role: 'teacher' });
      console.log(`  ✓ ${user.email} (${user.name}) → teacher`);
      converted += 1;
    } catch (err) {
      console.error(`  ✗ ${user.email} — failed: ${err.message}`);
      failed += 1;
    }
  }

  return { converted, failed };
}

async function main() {
  console.log('=== migrate-admin-to-teacher ===\n');

  console.log('Searching for admin users in Firestore...');
  const adminUsers = await findAdminUsers();

  if (adminUsers.length === 0) {
    console.log('No admin users found. Nothing to do.');
    process.exit(0);
  }

  console.log(`\nFound ${adminUsers.length} admin user(s):\n`);
  adminUsers.forEach((u) => console.log(`  • ${u.email} (${u.name})`));

  console.log('\nThese users will be changed from role=admin to role=teacher.');
  console.log('They will keep all their data and will log in via /teacher/login.\n');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  await new Promise((resolve) => {
    rl.question('Type "yes" to proceed, anything else to cancel: ', (answer) => {
      rl.close();

      if (answer.trim().toLowerCase() !== 'yes') {
        console.log('\nCancelled. No changes made.');
        process.exit(0);
      }

      resolve();
    });
  });

  console.log('\nConverting...\n');
  const { converted, failed } = await convertUsers(adminUsers);

  console.log(`\nDone. ${converted} converted, ${failed} failed.`);

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});