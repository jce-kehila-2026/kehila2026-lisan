/**
 * check-bucket.js — detect the real Firebase Storage bucket + prove upload works.
 *
 * Phase 0.1: the configured bucket (lisan-238bb.appspot.com) 404s. New Firebase
 * projects use the `.firebasestorage.app` domain. This script tests candidate
 * names with bucket.exists(), then does a real upload→read→delete round-trip on
 * the working one so we KNOW storage works (not just guess the name).
 *
 *   node scripts/check-bucket.js
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const admin = require('firebase-admin');

const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT
  ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
  : require(path.join(__dirname, '..', 'privateKey.json'));

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

const projectId = serviceAccount.project_id;
const candidates = [
  process.env.FIREBASE_STORAGE_BUCKET,           // whatever is configured now
  `${projectId}.firebasestorage.app`,            // new-style default
  `${projectId}.appspot.com`,                    // legacy default
].filter(Boolean);

(async () => {
  console.log(`project_id: ${projectId}`);
  let working = null;
  const seen = new Set();
  for (const name of candidates) {
    if (seen.has(name)) continue;
    seen.add(name);
    try {
      const [exists] = await admin.storage().bucket(name).exists();
      console.log(`  ${exists ? 'EXISTS ' : 'missing'}  ${name}`);
      if (exists && !working) working = name;
    } catch (e) {
      console.log(`  ERROR   ${name} -> ${e.message}`);
    }
  }

  if (!working) {
    console.log('\nNO bucket found. Enable Firebase Storage in the Console ' +
      '(Build → Storage → Get started) and re-run, or pass the exact name.');
    process.exit(2);
  }

  console.log(`\n=> Working bucket: ${working}`);

  // Real upload → read → delete round-trip
  const bucket = admin.storage().bucket(working);
  const objectPath = `diagnostics/check-bucket-${Date.now()}.txt`;
  const file = bucket.file(objectPath);
  const payload = Buffer.from('lisan storage check ' + new Date().toISOString());
  try {
    await file.save(payload, { contentType: 'text/plain', resumable: false });
    const [readBack] = await file.download();
    const [signedUrl] = await file.getSignedUrl({ action: 'read', expires: '2030-01-01' });
    await file.delete();
    const ok = readBack.equals(payload);
    console.log(`upload round-trip: ${ok ? 'OK' : 'MISMATCH'} (read ${readBack.length}B)`);
    console.log(`sample signed URL: ${signedUrl.slice(0, 80)}...`);
    console.log(`\nSET backend/.env: FIREBASE_STORAGE_BUCKET=${working}`);
    process.exit(ok ? 0 : 3);
  } catch (e) {
    console.log(`upload round-trip FAILED: ${e.message}`);
    process.exit(4);
  }
})();
