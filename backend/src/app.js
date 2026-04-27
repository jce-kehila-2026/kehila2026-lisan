const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const dotenv = require('dotenv');

// Load env variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Routes
const authRoutes = require('./routes/auth');
const usersRoutes = require('./routes/users');
require('./config/firebase');

// =========================
// CORS Configuration
// =========================
const allowedOrigins = [
  'http://localhost:5173', // Vite
  'http://localhost:3000'  // fallback
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS'));
  }
}));

// =========================
// Middleware
// =========================
app.use(morgan('dev'));
app.use(express.json());

// =========================
// Routes
// =========================
app.get('/', (req, res) => {
  res.send('Lisan backend is running');
});

// Health Check
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// Auth routes
app.use('/api/auth', authRoutes);

// Users routes
app.use('/api/users', usersRoutes);

// =========================
// Start Server
// =========================
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});