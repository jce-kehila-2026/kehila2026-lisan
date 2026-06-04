const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

function loadServiceAccount() {
  // Option A: inline JSON (preferred for prod / Docker)
  const inlineRaw = String(process.env.FIREBASE_SERVICE_ACCOUNT || '').trim();
  if (inlineRaw) {
    try {
      return JSON.parse(inlineRaw);
    } catch (err) {
      throw new Error(
        '[FATAL] FIREBASE_SERVICE_ACCOUNT env var is not valid JSON. ' +
        'Paste the full service-account JSON as a single line. ' +
        `Parse error: ${err.message}`
      );
    }
  }

  // Option B: explicit path env var
  const pathFromEnv = String(
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH || ''
  ).trim();
  if (pathFromEnv) {
    if (!fs.existsSync(pathFromEnv)) {
      throw new Error(
        `[FATAL] FIREBASE_SERVICE_ACCOUNT_PATH points to a non-existent ` +
        `file: ${pathFromEnv}`
      );
    }
    try {
      return JSON.parse(fs.readFileSync(pathFromEnv, 'utf8'));
    } catch (err) {
      throw new Error(
        `[FATAL] Failed to parse ${pathFromEnv}: ${err.message}`
      );
    }
  }

  // Option C: legacy default path (dev convenience)
  const legacyPath = path.join(__dirname, '../../privateKey.json');
  if (fs.existsSync(legacyPath)) {
    try {
      return JSON.parse(fs.readFileSync(legacyPath, 'utf8'));
    } catch (err) {
      throw new Error(
        `[FATAL] Failed to parse ${legacyPath}: ${err.message}`
      );
    }
  }

  throw new Error(
    '[FATAL] No Firebase credentials found. Set one of:\n' +
    '  1. FIREBASE_SERVICE_ACCOUNT env var with inline JSON (recommended)\n' +
    '  2. FIREBASE_SERVICE_ACCOUNT_PATH env var with path to JSON file\n' +
    '  3. Place serviceAccountKey.json at backend/privateKey.json'
  );
}

const serviceAccount = loadServiceAccount();

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || undefined,
  });
}

const db = admin.firestore();
const storage = admin.storage();
const bucket = process.env.FIREBASE_STORAGE_BUCKET
  ? storage.bucket(process.env.FIREBASE_STORAGE_BUCKET)
  : storage.bucket();

module.exports = { admin, db, storage, bucket };
