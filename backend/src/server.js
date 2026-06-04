const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const dotenv = require('dotenv');

dotenv.config();

const authRoutes = require('./routes/auth');
const usersRoutes = require('./routes/users');
const transcriptsRoutes = require('./routes/transcripts');
const evaluationRoutes = require('./routes/evaluation');
const adminRoutes = require('./routes/admin');
const chatRoutes = require('./routes/chats');
const progressRoutes = require('./routes/progress');
const teacherRoutes = require('./routes/teacher');
const sharedChatsRoutes = require('./routes/sharedChats');
const notificationsRoutes = require('./routes/notifications');
const vocabRoutes = require('./routes/vocab');

require('./config/firebase');

function validateRequiredEnvVars() {
  const isProduction = (process.env.NODE_ENV || '').trim() === 'production';

  // Always required — server cannot function without these
  const alwaysRequired = ['JWT_SECRET', 'AI_SERVICE_URL'];
  // Required in production only
  const productionRequired = [
    'AI_SERVICE_INTERNAL_SECRET',
    'CORS_ALLOWED_ORIGINS',
    'FIREBASE_STORAGE_BUCKET',
  ];

  const requiredEnvVars = isProduction
    ? [...alwaysRequired, ...productionRequired]
    : alwaysRequired;

  const missing = requiredEnvVars.filter(
    (v) => !String(process.env[v] || '').trim()
  );

  // Firebase: must have either inline JSON or path env var
  const hasFirebaseInline = !!String(
    process.env.FIREBASE_SERVICE_ACCOUNT || ''
  ).trim();
  const hasFirebasePath = !!String(
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH || ''
  ).trim();
  if (!hasFirebaseInline && !hasFirebasePath) {
    missing.push('FIREBASE_SERVICE_ACCOUNT (or FIREBASE_SERVICE_ACCOUNT_PATH)');
  }

  // Warn about insecure dev secrets in production
  if (isProduction) {
    const jwtSecret = String(process.env.JWT_SECRET || '');
    if (jwtSecret.length < 32) {
      console.error(
        '[FATAL] JWT_SECRET is too short for production (need 32+ chars). ' +
        'Generate one with: openssl rand -hex 64'
      );
      process.exit(1);
    }
  }

  if (missing.length === 0) return;

  const msg = `Missing required env vars: ${missing.join(', ')}. ` +
    `Copy .env.production.example to .env and fill in real values.`;

  if (isProduction) {
    console.error(`[FATAL] ${msg}`);
    process.exit(1);
  }
  console.warn(`[startup warning] ${msg}`);
}

function parseAllowedOrigins() {
  const raw = String(process.env.CORS_ALLOWED_ORIGINS || '').trim();
  if (!raw) {
    return [
      'http://localhost:5173',
      'http://localhost:5174',
      'http://localhost:3000',
    ];
  }
  const list = raw.split(',').map((o) => o.trim()).filter(Boolean);
  if (list.includes('*')) {
    console.warn(
      '[CORS] CORS_ALLOWED_ORIGINS contains "*" — wide-open in production ' +
      'is dangerous. Restrict to your real frontend origin.'
    );
  }
  return list;
}

function createApp() {
  const app = express();
  const allowedOrigins = parseAllowedOrigins();
  const allowAll = allowedOrigins.includes('*');

  app.use(cors({
    origin: function (origin, callback) {
      if (allowAll || !origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
  }));

  app.use(morgan('dev'));
  app.use(express.json());

  app.get('/', (req, res) => {
    res.send('Lisan backend is running');
  });

  app.get('/api/health', (req, res) => {
    // Liveness probe — process responding, NO downstream checks
    res.status(200).json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: '1.0.0'
    });
  });

  app.get('/api/ready', async (req, res) => {
    // Readiness probe — verifies downstream dependencies are reachable
    const checks = {};
    let allOk = true;

    // Firestore ping
    try {
      const { db } = require('./config/firebase');
      await db.collection('_health').limit(1).get();
      checks.firestore = 'ok';
    } catch (err) {
      checks.firestore = `error: ${err.message}`;
      allOk = false;
    }

    // AI service ping
    try {
      const axios = require('axios');
      const aiBase = process.env.AI_SERVICE_URL || 'http://localhost:8000';
      const r = await axios.get(`${aiBase}/api/ai/health`, { timeout: 3000 });
      checks.ai_service = r.status === 200 ? 'ok' : `status_${r.status}`;
      if (r.status !== 200) allOk = false;
    } catch (err) {
      checks.ai_service = `unreachable: ${err.message}`;
      allOk = false;
    }

    res.status(allOk ? 200 : 503).json({
      status: allOk ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      checks,
    });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/users', usersRoutes);
  app.use('/api/transcripts', transcriptsRoutes);
  app.use('/api/evaluation', evaluationRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/chat', chatRoutes);
  app.use('/api/chats', chatRoutes);
  app.use('/api/progress', progressRoutes);
  app.use('/api/teacher', teacherRoutes);
  app.use('/api/shared-chats', sharedChatsRoutes);
  app.use('/api/notifications', notificationsRoutes);
  app.use('/api/vocab', vocabRoutes);

  return app;
}

const app = createApp();

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  validateRequiredEnvVars();
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

module.exports = {
  app,
  createApp,
  validateRequiredEnvVars,
  // Back-compat alias for any callers of the old name
  warnMissingEnvVars: validateRequiredEnvVars,
};
