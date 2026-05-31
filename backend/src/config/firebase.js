const admin = require('firebase-admin');
const path = require('path');

let serviceAccount;

if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
} else {
  serviceAccount = require(path.join(__dirname, '../../privateKey.json'));
}

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
