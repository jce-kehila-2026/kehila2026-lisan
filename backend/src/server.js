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

require('./config/firebase');

const app = express();
const PORT = process.env.PORT || 3000;

const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000'
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error('Not allowed by CORS'));
  }
}));

app.use(morgan('dev'));
app.use(express.json());

app.get('/', (req, res) => {
  res.send('Lisan backend is running');
});

app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/transcripts', transcriptsRoutes);
app.use('/api/evaluation', evaluationRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/chats', chatRoutes);
app.use('/api/progress', progressRoutes);
app.use('/api/teacher', teacherRoutes);
app.use('/api/shared-chats', sharedChatsRoutes);
app.use('/api/notifications', notificationsRoutes);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});