/**
 * Lisan — learner data wipe (handover cleanup, step 2)
 * ----------------------------------------------------
 * Deletes learner-generated data from Firestore and the matching audio files
 * in Firebase Storage. Curriculum content and the remaining admin account are
 * never touched.
 *
 * Run AFTER `admintool.mjs purge --yes`, when the only account left is the
 * handover admin. It clears the target collections wholesale rather than
 * filtering by uid.
 *
 *   node purge-user-data.mjs                 # DRY RUN — counts only, deletes nothing
 *   node purge-user-data.mjs --yes           # apply
 *   node purge-user-data.mjs --yes --include-pending-words
 *
 * Credentials come from FIREBASE_SERVICE_ACCOUNT / FIREBASE_STORAGE_BUCKET in
 * .env, exactly as the backend reads them.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire('/home/kodkod/Documents/Lissan/kehila2026-lisan/backend/');
const admin = require('firebase-admin');

const APPLY = process.argv.includes('--yes');
const INCLUDE_PENDING_WORDS = process.argv.includes('--include-pending-words');

// ---------------------------------------------------------------- config ---

/** Learner-generated. Wiped wholesale. */
const DELETE = [
  'chatSessions',    // chat docs; messages live in an array field on the doc
  'sharedChats',     // + its `messages` subcollection
  'audioRecordings', // + the audio objects in Storage
  'chatReviews',
  'studentAttempts',
  'gameProgress',
  'notifications',
  'tokenUsage',
];

/**
 * Teacher/admin-curated vocabulary awaiting approval into `words` — written
 * only by POST /api/admin/words (requireRole('admin','teacher')). It is not
 * learner-generated, so it is NOT wiped unless explicitly requested.
 */
const PENDING_WORDS = 'pendingWords';

/** Teaching material + the surviving admin. Never touched. */
const KEEP = ['words', 'transcripts', 'activities', 'rubrics', 'users'];

/**
 * Real Storage prefix for voice recordings, from
 * chatPersistenceService.buildVoiceStoragePath() — 'chat-audio/<uid>/...'.
 * (`audio-recordings` is the REST route, not a Storage path.)
 */
const AUDIO_PREFIX = 'chat-audio/';

// ------------------------------------------------------------------ init ---

function loadEnv(file) {
  const out = {};
  for (const raw of readFileSync(file, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i === -1) continue;
    out[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
  }
  return out;
}

const ROOT = '/home/kodkod/Documents/Lissan/kehila2026-lisan';
const env = loadEnv(`${ROOT}/.env`);

// Same resolution order as backend/src/config/firebase.js: the env var when it
// carries a real key, otherwise backend/privateKey.json. (In this checkout the
// env value is a stub with only type/project_id.)
function loadServiceAccount() {
  if (env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      const parsed = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT);
      if (typeof parsed.private_key === 'string' && parsed.private_key) return parsed;
    } catch {
      /* fall through */
    }
  }
  return JSON.parse(readFileSync(`${ROOT}/backend/privateKey.json`, 'utf8'));
}

const serviceAccount = loadServiceAccount();
const storageBucket = env.FIREBASE_STORAGE_BUCKET || `${serviceAccount.project_id}.appspot.com`;

admin.initializeApp({ credential: admin.credential.cert(serviceAccount), storageBucket });
const db = admin.firestore();
const bucket = admin.storage().bucket(storageBucket);

// ----------------------------------------------------------------- utils ---

const countDocs = async (name) => {
  try {
    return (await db.collection(name).count().get()).data().count;
  } catch {
    return (await db.collection(name).get()).size;
  }
};

/** Counts docs in every subcollection under a collection, one level down. */
async function countSubcollections(name) {
  const subs = {};
  const snap = await db.collection(name).get();
  for (const doc of snap.docs) {
    for (const sub of await doc.ref.listCollections()) {
      subs[sub.id] = (subs[sub.id] || 0) + (await sub.count().get()).data().count;
    }
  }
  return subs;
}

async function audioTargets() {
  // storagePath is recorded both on audioRecordings docs and on voice messages
  // embedded in chatSessions, so collect from both.
  const paths = new Set();
  const collect = (v) => {
    if (typeof v === 'string' && v && !v.startsWith('local-dev://')) paths.add(v);
  };
  for (const doc of (await db.collection('audioRecordings').get()).docs) {
    collect(doc.data()?.storagePath);
  }
  for (const doc of (await db.collection('chatSessions').get()).docs) {
    for (const m of doc.data()?.messages || []) collect(m?.storagePath);
  }

  let bucketExists = false;
  try {
    [bucketExists] = await bucket.exists();
  } catch {
    bucketExists = false;
  }

  let prefixFiles = [];
  if (bucketExists) {
    try {
      [prefixFiles] = await bucket.getFiles({ prefix: AUDIO_PREFIX });
    } catch (err) {
      console.log(`  ! could not list ${AUDIO_PREFIX}: ${err.message}`);
    }
  }
  return { fromDocs: [...paths], underPrefix: prefixFiles.map((f) => f.name), bucketExists };
}

// ------------------------------------------------------------------ main ---

async function main() {
  console.log(`\n${APPLY ? '*** APPLY — this deletes data ***' : 'DRY RUN — nothing will be deleted'}`);
  console.log(`project: ${serviceAccount.project_id}   bucket: ${storageBucket}\n`);

  const targets = [...DELETE, ...(INCLUDE_PENDING_WORDS ? [PENDING_WORDS] : [])];

  console.log('TO DELETE');
  console.log('-'.repeat(58));
  let total = 0;
  const subsByCollection = {};
  for (const name of targets) {
    const n = await countDocs(name);
    total += n;
    const subs = await countSubcollections(name);
    subsByCollection[name] = subs;
    const subTxt = Object.entries(subs).map(([k, v]) => `${k}:${v}`).join(', ');
    console.log(`  ${name.padEnd(20)} ${String(n).padStart(6)} docs${subTxt ? `   [sub: ${subTxt}]` : ''}`);
    total += Object.values(subs).reduce((a, b) => a + b, 0);
  }

  const audio = await audioTargets();
  if (!audio.bucketExists) {
    console.log(`  ${'(Storage audio)'.padEnd(20)}      — bucket "${storageBucket}" does not exist;`);
    console.log(`  ${''.padEnd(20)}        no audio objects to delete`);
  } else {
    console.log(`  ${'(Storage audio)'.padEnd(20)} ${String(audio.underPrefix.length).padStart(6)} files under ${AUDIO_PREFIX}`);
  }
  console.log(`  ${''.padEnd(20)} ${String(audio.fromDocs.length).padStart(6)} storagePath refs found in Firestore`);

  console.log(`\n  total Firestore documents to delete: ${total}`);

  if (!INCLUDE_PENDING_WORDS) {
    const n = await countDocs(PENDING_WORDS);
    console.log(`\n  NOT deleting ${PENDING_WORDS} (${n} docs) — teacher-curated vocabulary`);
    console.log(`  awaiting approval, not learner data. Add --include-pending-words to wipe it.`);
  }

  console.log('\nKEEP — untouched');
  console.log('-'.repeat(58));
  for (const name of KEEP) {
    console.log(`  ${name.padEnd(20)} ${String(await countDocs(name)).padStart(6)} docs`);
  }

  if (!APPLY) {
    console.log('\nDRY RUN — nothing was deleted. Re-run with --yes to apply.\n');
    return;
  }

  // guard: never let a KEEP collection end up in the delete set
  const collision = targets.filter((t) => KEEP.includes(t));
  if (collision.length) throw new Error(`refusing to delete protected collections: ${collision}`);

  console.log('\nDeleting...');
  for (const name of targets) {
    await db.recursiveDelete(db.collection(name)); // handles subcollections
    console.log(`  cleared ${name}`);
  }

  let removed = 0;
  for (const path of new Set([...audio.fromDocs, ...audio.underPrefix])) {
    try {
      await bucket.file(path).delete();
      removed += 1;
    } catch (err) {
      if (err.code !== 404) console.log(`  ! ${path}: ${err.message}`);
    }
  }
  console.log(`  deleted ${removed} audio file(s) from Storage`);

  console.log('\nRemaining counts');
  console.log('-'.repeat(58));
  for (const name of [...targets, ...KEEP]) {
    console.log(`  ${name.padEnd(20)} ${String(await countDocs(name)).padStart(6)} docs`);
  }
  console.log();
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(`\nERROR: ${err.message}\n`);
    process.exit(1);
  });
