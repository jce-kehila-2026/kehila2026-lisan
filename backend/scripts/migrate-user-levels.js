/**
 * migrate-user-levels.js
 *
 * Normalizes users.level to a CEFR code (A1 | A2 | B1 | B2) and sets
 * users.levelLabel (א1 | א2 | ב1 | ב2 | ג) for every student.
 *
 *   'א1'       -> level A1, label א1
 *   'ג'        -> level B2, label ג   (ג has no content of its own; it uses B2)
 *   'beginner' -> level A1, label א1
 *   unknown    -> level A1, label א1
 *
 * DRY-RUN by default: prints a table (uid, email, old level -> new level/label)
 * and writes nothing. Pass --apply to write the changes.
 *
 * Run from the backend folder:
 *   node scripts/migrate-user-levels.js            # dry run
 *   node scripts/migrate-user-levels.js --apply    # write changes
 */

const { normalizeLevel, getLevelLabel } = require('../src/lib/levels');

/**
 * Pure planning step (unit-tested). Given user records, returns the changes
 * needed. Only students are migrated; records already normalized are skipped.
 *
 * @param {Array<{id: string, email?: string, role?: string, level?: string, levelLabel?: string}>} users
 */
function planLevelMigration(users) {
  const changes = [];

  for (const user of users) {
    if (user.role !== 'student') continue;

    const newLevel = normalizeLevel(user.level);
    const newLabel = getLevelLabel(user.level, user.levelLabel);

    if (user.level === newLevel && user.levelLabel === newLabel) continue;

    changes.push({
      uid: user.id,
      email: user.email || '',
      oldLevel: user.level === undefined ? '(none)' : String(user.level),
      oldLabel: user.levelLabel === undefined ? '(none)' : String(user.levelLabel),
      newLevel,
      newLabel,
    });
  }

  return changes;
}

async function main() {
  const apply = process.argv.includes('--apply');

  require('dotenv').config();

  let db;
  try {
    ({ db } = require('../src/config/firebase'));
  } catch (err) {
    console.error('Failed to load Firebase config:', err.message);
    process.exit(1);
  }

  const snapshot = await db.collection('users').get();
  const users = [];
  snapshot.forEach((doc) => users.push({ id: doc.id, ...doc.data() }));

  const changes = planLevelMigration(users);

  console.log(`\nScanned ${users.length} users; ${changes.length} student(s) need a level update.\n`);

  if (changes.length > 0) {
    console.table(
      changes.map((c) => ({
        uid: c.uid,
        email: c.email,
        'old level': c.oldLevel,
        'old label': c.oldLabel,
        'new level': c.newLevel,
        'new label': c.newLabel,
      }))
    );
  }

  if (!apply) {
    console.log('\nDRY RUN — nothing was written. Re-run with --apply to write these changes.\n');
    return;
  }

  let updated = 0;
  let failed = 0;
  for (const change of changes) {
    try {
      await db.collection('users').doc(change.uid).update({
        level: change.newLevel,
        levelLabel: change.newLabel,
      });
      updated += 1;
    } catch (err) {
      console.error(`  ✗ ${change.uid} (${change.email}) — ${err.message}`);
      failed += 1;
    }
  }

  console.log(`\nDone. Updated: ${updated}, failed: ${failed}.\n`);
}

if (require.main === module) {
  main().then(
    () => process.exit(0),
    (err) => {
      console.error('Migration failed:', err);
      process.exit(1);
    }
  );
}

module.exports = { planLevelMigration };
