const admin = require('firebase-admin');
const path = require('path');

let serviceAccount;

if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
} else {
  serviceAccount = require(path.join(__dirname, '../../privateKey.json'));
}

const storageBucket =
  process.env.FIREBASE_STORAGE_BUCKET ||
  `${serviceAccount.project_id}.appspot.com`;

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket
  });
}

const db = admin.firestore();
const bucket = admin.storage().bucket(storageBucket);

module.exports = { admin, db, bucket };