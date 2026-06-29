/**
 * One-time migration: copy users from the Firestore `users` collection into
 * Firebase Authentication, preserving their existing bcrypt passwords.
 *
 * - Each Firebase Auth user gets uid === Firestore doc id, so the existing
 *   profile docs (role/level/teacherIds/...) stay linked with no remapping.
 * - bcrypt hashes are imported directly (Firebase Auth supports BCRYPT), so
 *   every student's current password keeps working.
 * - Idempotent: importUsers upserts by uid, so re-running is safe.
 *
 * Run:  cd backend && node scripts/migrate-users-to-auth.js
 */
const { admin, db } = require('../src/config/firebase');

async function main() {
  const snapshot = await db.collection('users').get();
  console.log(`Found ${snapshot.size} user docs in Firestore.`);

  const toImport = [];
  const skipped = [];

  snapshot.forEach((doc) => {
    const data = doc.data();
    const email = String(data.email || '').trim().toLowerCase();
    const passwordHash = data.passwordHash;

    if (!email) {
      skipped.push({ id: doc.id, reason: 'no email' });
      return;
    }

    const record = {
      uid: doc.id,
      email,
      emailVerified: true,
      disabled: data.isActive === false,
      displayName: data.name || undefined,
    };

    // Preserve the existing bcrypt password if present; users without a hash
    // are still created (admin can set a password later).
    if (passwordHash) {
      record.passwordHash = Buffer.from(String(passwordHash));
    } else {
      skipped.push({ id: doc.id, reason: 'no passwordHash (created without password)' });
    }

    toImport.push(record);
  });

  if (toImport.length === 0) {
    console.log('Nothing to import.');
    return;
  }

  // importUsers handles up to 1000 records per call.
  const result = await admin.auth().importUsers(toImport, {
    hash: { algorithm: 'BCRYPT' },
  });

  console.log(`\nImport complete: success=${result.successCount}, failures=${result.failureCount}`);

  if (result.errors.length > 0) {
    console.log('\nPer-record errors:');
    result.errors.forEach((e) => {
      const rec = toImport[e.index];
      console.log(`  - ${rec.email} (uid=${rec.uid}): ${e.error.message}`);
    });
  }

  if (skipped.length > 0) {
    console.log('\nNotes:');
    skipped.forEach((s) => console.log(`  - ${s.id}: ${s.reason}`));
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
