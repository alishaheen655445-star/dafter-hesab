// -----------------------------------------------------------------------------
//  server.js — application entry point (Phase 1 skeleton).
//  Later phases add: parties, transactions, checks, loans, reminders, reports.
// -----------------------------------------------------------------------------
require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');

const { pool, testConnection } = require('./config/db');
const { CLIENT_DIR, UPLOAD_DIR } = require('./config/paths');
const authRoutes = require('./routes/authRoutes');
const partyRoutes = require('./routes/partyRoutes');
const transactionRoutes = require('./routes/transactionRoutes');
const checkRoutes = require('./routes/checkRoutes');
const loanRoutes = require('./routes/loanRoutes');
const reminderRoutes = require('./routes/reminderRoutes');
const reportRoutes = require('./routes/reportRoutes');
const backupRoutes = require('./routes/backupRoutes');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const app = express();
const PORT = process.env.PORT || 3100;

// --- Global middleware -------------------------------------------------------
// Strict CSP on purpose: the client is hand-written CSS/JS with system fonts and
// emoji icons, so NOTHING is loaded from a CDN. That keeps the packaged Android
// app working with no network at all (only the API calls go out).
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      'default-src': ["'self'"],
      'script-src': ["'self'"],
      // 'unsafe-inline' is needed ONLY for style="…" attributes in the markup.
      // Scripts stay strict ('self'), which is what actually matters for XSS.
      'style-src': ["'self'", "'unsafe-inline'"],
      'img-src': ["'self'", 'data:', 'blob:'],
      'connect-src': ["'self'"],
      'object-src': ["'none'"],
      'base-uri': ["'self'"],
      'frame-ancestors': ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));
app.use(cors());
// A backup file is the whole book: it gets its OWN (bigger) JSON limit, and this
// parser runs first on that path so the 2mb cap below never touches it
// (body-parser marks req._body and skips a body that is already parsed).
app.use('/api/backup/import', express.json({ limit: '20mb' }));
app.use(express.json({ limit: '2mb' }));
app.use(express.static(CLIENT_DIR));
// Serve uploaded images (transaction attachments, check photos, etc.)
app.use('/uploads', express.static(UPLOAD_DIR));

// --- Health check: proves server + DB are both alive -------------------------
app.get('/api/health', async (_req, res) => {
  try {
    const [rows] = await pool.query('SELECT 1 AS ok');
    res.json({
      success: true,
      message: 'daftar-hesab-app API is running',
      database: rows[0].ok === 1 ? 'connected' : 'unknown',
    });
  } catch (err) {
    // 500 = server/DB error; we do NOT leak err.message to the client (security)
    // eslint-disable-next-line no-console
    console.error('Health check DB error:', err.message);
    res.status(500).json({ success: false, message: 'Database connection failed' });
  }
});

// --- API routes --------------------------------------------------------------
app.use('/api/auth', authRoutes);
// Nested first: /api/parties/:partyId/transactions (mergeParams reads :partyId).
app.use('/api/parties/:partyId/transactions', transactionRoutes);
app.use('/api/parties', partyRoutes);
app.use('/api/checks', checkRoutes);
app.use('/api/loans', loanRoutes);
app.use('/api/reminders', reminderRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/backup', backupRoutes);

// --- Centralized 404 + error handling ----------------------------------------
app.use(notFound);
app.use(errorHandler);

// --- Start only after confirming the DB is reachable -------------------------
async function start() {
  try {
    await testConnection();
    app.listen(PORT, () => {
      // eslint-disable-next-line no-console
      console.log(`✔ daftar-hesab-app listening on http://localhost:${PORT}`);
      // eslint-disable-next-line no-console
      console.log(`✔ Try: http://localhost:${PORT}/api/health`);
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('✘ Could not connect to the database:', err.message);
    // eslint-disable-next-line no-console
    console.error('  Make sure MySQL (XAMPP) is running and DB "daftar_hesab_app" exists.');
    process.exit(1);
  }
}

start();
