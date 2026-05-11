const fs = require('fs');
const path = require('path');

const admin = require('./src/config/firebase');

const db = admin.firestore();

const BASE_DIR = path.join(__dirname, '..', 'content', 'transcripts');

const levels = ['A1', 'A2', 'B1', 'B2'];

async function uploadTranscripts() {
  try {
    for (const level of levels) {

      const levelPath = path.join(BASE_DIR, level);

      const files = fs.readdirSync(levelPath);

      for (const file of files) {

        if (!file.endsWith('.txt')) continue;

        const filePath = path.join(levelPath, file);

        const text = fs.readFileSync(filePath, 'utf8');

        const transcriptData = {
          level,
          fileName: file,
          text,
          language: 'he',
          source: 'lisan_curriculum',
          uploadedAt: admin.firestore.FieldValue.serverTimestamp()
        };

        await db.collection('transcripts').add(transcriptData);

        console.log(`✅ Uploaded: ${level}/${file}`);
      }
    }

    console.log('🔥 All transcripts uploaded successfully');

  } catch (error) {
    console.error('❌ Upload error:', error);
  }
}

uploadTranscripts();