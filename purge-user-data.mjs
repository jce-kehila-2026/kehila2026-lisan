/**
 * Lisan — learner data wipe (handover cleanup, step 2)
 * ----------------------------------------------------
 * Enumerates the LIVE Firestore collections with db.listCollections() and
 * deletes everything except an explicit keep-list. Nothing can be missed by
 * an out-of-date delete-list: anything new that appears in the database shows
 * up in the output and is treated as data to remove.
 *
 *   node purge-user-data.mjs              # DRY RUN — counts only, deletes nothing
 *   node purge-user-data.mjs --yes        # apply
 *   node purge-user-data.mjs auth-diff    # Firebase Auth identities vs users docs
 *
 * Credentials resolve exactly as backend/src/config/firebase.js does.
 */
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';

const ROOT = '/home/kodkod/Documents/Lissan/kehila2026-lisan';
const require = createRequire(`${ROOT}/backend/`);
const admin = require('firebase-admin');

const MODES = ['auth-diff', 'backup'];
const MODE = MODES.includes(process.argv[2]) ? process.argv[2] : 'purge';
const APPLY = process.argv.includes('--yes');

/**
 * The ONLY collections that survive. Everything else in the database is
 * deleted, including collections added after this script was written.
 * Subcollections of a kept collection (activities/{id}/turns) are kept with it.
 */
const KEEP = new Set(['words', 'transcripts', 'activities', 'rubrics', 'users']);

/** Real Storage prefix for voice recordings (buildVoiceStoragePath). */
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

const env = loadEnv(`${ROOT}/.env`);

function loadServiceAccount() {
  if (env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      const parsed = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT);
      if (typeof parsed.private_key === 'string' && parsed.private_key) return parsed;
    } catch {
      /* fall through to the key file */
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

const count = async (ref) => {
  try {
    return (await ref.count().get()).data().count;
  } catch {
    return (await ref.get()).size;
  }
};

/** Doc count plus a per-subcollection breakdown, one level down. */
async function inspect(ref) {
  const docs = await count(ref);
  const subs = {};
  for (const doc of (await ref.get()).docs) {
    for (const sub of await doc.ref.listCollections()) {
      subs[sub.id] = (subs[sub.id] || 0) + (await count(sub));
    }
  }
  return { docs, subs };
}

const fmt = (name, info) => {
  const sub = Object.entries(info.subs).map(([k, v]) => `${k}:${v}`).join(', ');
  return `  ${name.padEnd(24)} ${String(info.docs).padStart(6)} docs${sub ? `   [sub: ${sub}]` : ''}`;
};

// ----------------------------------------------------------------- backup ---

/** Firestore types -> plain JSON, so the dump round-trips as readable data. */
function plain(value) {
  if (value === null || typeof value !== 'object') return value;
  if (typeof value.toDate === 'function') return { __timestamp: value.toDate().toISOString() };
  if (value._latitude !== undefined && value._longitude !== undefined) {
    return { __geopoint: [value._latitude, value._longitude] };
  }
  if (value.path && typeof value.path === 'string' && value.firestore) {
    return { __ref: value.path };
  }
  if (Array.isArray(value)) return value.map(plain);
  const out = {};
  for (const [k, v] of Object.entries(value)) out[k] = plain(v);
  return out;
}

/** Dumps a collection and every subcollection beneath it. Returns doc count. */
async function dumpCollection(ref, depth = 0) {
  const docs = {};
  let n = 0;
  for (const doc of (await ref.get()).docs) {
    const entry = { data: plain(doc.data() || {}) };
    n += 1;
    if (depth < 3) {
      const subs = await doc.ref.listCollections();
      if (subs.length) {
        entry.subcollections = {};
        for (const sub of subs) {
          const res = await dumpCollection(sub, depth + 1);
          entry.subcollections[sub.id] = res.docs;
          n += res.count;
        }
      }
    }
    docs[doc.id] = entry;
  }
  return { docs, count: n };
}

async function backup() {
  const stamp = new Date().toISOString().slice(0, 10);
  const file = `${ROOT}/backup-pre-wipe-${stamp}.json`;

  const live = (await db.listCollections()).map((c) => c.id).sort();
  const targets = live.filter((name) => !KEEP.has(name));

  console.log(`\nBacking up the collections the wipe would delete`);
  console.log(`project: ${serviceAccount.project_id}`);
  console.log(`collections: ${targets.join(', ')}\n`);

  const payload = {
    exportedAt: new Date().toISOString(),
    project: serviceAccount.project_id,
    note: 'Pre-wipe backup of learner-generated data. Contains personal data — do not commit.',
    collections: {},
  };

  let total = 0;
  for (const name of targets) {
    const { docs, count } = await dumpCollection(db.collection(name));
    payload.collections[name] = docs;
    total += count;
    console.log(`  ${name.padEnd(24)} ${String(count).padStart(6)} documents (incl. subcollections)`);
  }

  writeFileSync(file, JSON.stringify(payload, null, 2), 'utf8');

  // independent recount straight from the database, to check the dump is whole
  let expected = 0;
  for (const name of targets) {
    const info = await inspect(db.collection(name));
    expected += info.docs + Object.values(info.subs).reduce((a, b) => a + b, 0);
  }

  const size = (statSync(file).size / 1024 / 1024).toFixed(2);
  console.log(`\n  file:      ${file}`);
  console.log(`  size:      ${size} MB`);
  console.log(`  in file:   ${total} documents`);
  console.log(`  in db:     ${expected} documents`);
  console.log(total === expected ? '  MATCH — backup is complete\n' : '  *** MISMATCH — do not wipe ***\n');
  if (total !== expected) process.exitCode = 1;
}

// -------------------------------------------------------------- auth diff ---

async function listAuthUsers() {
  const users = [];
  let token;
  do {
    const page = await admin.auth().listUsers(1000, token);
    users.push(...page.users);
    token = page.pageToken;
  } while (token);
  return users;
}

async function authDiff() {
  console.log(`\nFirebase Auth vs Firestore \`users\`  —  project ${serviceAccount.project_id}\n`);

  const authUsers = await listAuthUsers();
  const snap = await db.collection('users').get();
  const profiles = new Map(snap.docs.map((d) => [d.id, d.data() || {}]));

  const orphanAuth = authUsers.filter((u) => !profiles.has(u.uid));
  const orphanDocs = [...profiles.keys()].filter((id) => !authUsers.some((u) => u.uid === id));

  console.log(`Auth identities: ${authUsers.length}   Firestore user docs: ${profiles.size}\n`);

  const pad = (s, n) => String(s ?? '').padEnd(n);
  console.log('ALL Auth identities');
  console.log('-'.repeat(96));
  console.log(`${pad('EMAIL', 34)}${pad('PROFILE?', 10)}${pad('CREATED', 22)}UID`);
  for (const u of authUsers) {
    console.log(
      `${pad(u.email || '(none)', 34)}${pad(profiles.has(u.uid) ? 'yes' : 'NO', 10)}` +
      `${pad((u.metadata?.creationTime || '').slice(0, 16), 22)}${u.uid}`
    );
  }

  console.log(`\nAuth identities WITHOUT a Firestore profile: ${orphanAuth.length}`);
  console.log('-'.repeat(96));
  for (const u of orphanAuth) {
    console.log(`  ${pad(u.email || '(none)', 34)}${u.uid}   created ${(u.metadata?.creationTime || '').slice(0, 16)}`);
  }
  if (!orphanAuth.length) console.log('  none');

  console.log(`\nFirestore user docs WITHOUT an Auth identity: ${orphanDocs.length}`);
  console.log('-'.repeat(96));
  for (const id of orphanDocs) {
    console.log(`  ${pad(profiles.get(id).email || '(no email field)', 34)}${id}`);
  }
  if (!orphanDocs.length) console.log('  none');

  console.log('\nNothing was deleted — this mode only reports.\n');
}

// ------------------------------------------------------------------ purge ---

async function audioTargets(deletable) {
  const paths = new Set();
  const collect = (v) => {
    if (typeof v === 'string' && v && !v.startsWith('local-dev://')) paths.add(v);
  };
  // storagePath can live on audioRecordings docs or on voice messages inside
  // chat documents, under either the current or the older schema.
  for (const name of deletable) {
    for (const doc of (await db.collection(name).get()).docs) {
      const data = doc.data() || {};
      collect(data.storagePath);
      collect(data.audioStoragePath);
      for (const m of data.messages || []) collect(m?.storagePath);
    }
  }

  let bucketExists = false;
  try {
    [bucketExists] = await bucket.exists();
  } catch {
    bucketExists = false;
  }

  let underPrefix = [];
  if (bucketExists) {
    try {
      const [files] = await bucket.getFiles({ prefix: AUDIO_PREFIX });
      underPrefix = files.map((f) => f.name);
    } catch (err) {
      console.log(`  ! could not list ${AUDIO_PREFIX}: ${err.message}`);
    }
  }
  return { fromDocs: [...paths], underPrefix, bucketExists };
}

async function purge() {
  console.log(`\n${APPLY ? '*** APPLY — this deletes data ***' : 'DRY RUN — nothing will be deleted'}`);
  console.log(`project: ${serviceAccount.project_id}   bucket: ${storageBucket}`);

  const live = (await db.listCollections()).map((c) => c.id).sort();
  console.log(`\nlive collections found: ${live.length}  —  ${live.join(', ')}\n`);

  const toDelete = live.filter((name) => !KEEP.has(name));
  const toKeep = live.filter((name) => KEEP.has(name));

  const missing = [...KEEP].filter((k) => !live.includes(k));
  if (missing.length) {
    console.log(`  ! keep-list names not present in the database: ${missing.join(', ')}`);
    console.log(`  ! (a typo here would silently delete real data — check the spelling)\n`);
  }

  console.log('TO DELETE — everything not on the keep-list');
  console.log('-'.repeat(70));
  let total = 0;
  for (const name of toDelete) {
    const info = await inspect(db.collection(name));
    console.log(fmt(name, info));
    total += info.docs + Object.values(info.subs).reduce((a, b) => a + b, 0);
  }
  if (!toDelete.length) console.log('  (nothing — database already clean)');

  const audio = await audioTargets(toDelete);
  if (!audio.bucketExists) {
    console.log(`  ${'(Storage audio)'.padEnd(24)}      — bucket "${storageBucket}" does not exist`);
  } else {
    console.log(`  ${'(Storage audio)'.padEnd(24)} ${String(audio.underPrefix.length).padStart(6)} files under ${AUDIO_PREFIX}`);
  }
  console.log(`  ${''.padEnd(24)} ${String(audio.fromDocs.length).padStart(6)} storagePath refs found in Firestore`);
  console.log(`\n  total documents to delete: ${total}`);

  console.log('\nKEEP — untouched');
  console.log('-'.repeat(70));
  for (const name of toKeep) {
    console.log(fmt(name, await inspect(db.collection(name))));
  }

  if (!APPLY) {
    console.log('\nDRY RUN — nothing was deleted. Re-run with --yes to apply.\n');
    return;
  }

  const collision = toDelete.filter((n) => KEEP.has(n));
  if (collision.length) throw new Error(`refusing to delete protected collections: ${collision}`);

  console.log('\nDeleting...');
  for (const name of toDelete) {
    await db.recursiveDelete(db.collection(name));
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

  const after = (await db.listCollections()).map((c) => c.id).sort();
  console.log('\nCollections remaining');
  console.log('-'.repeat(70));
  for (const name of after) console.log(fmt(name, await inspect(db.collection(name))));
  const leftover = after.filter((n) => !KEEP.has(n));
  console.log(leftover.length ? `\n  ! still present off the keep-list: ${leftover.join(', ')}\n` : '\n  only keep-list collections remain\n');
}

const RUN = { 'auth-diff': authDiff, backup, purge };

RUN[MODE]()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(`\nERROR: ${err.message}\n`);
    process.exit(1);
  });
