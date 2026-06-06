/**
 * VendorBridge — Express Server Entry Point
 */

require('dotenv').config();

const express      = require('express');
const cors         = require('cors');
const cookieParser = require('cookie-parser');
const path         = require('path');
const passport     = require('./config/passport');
const { generalLimiter } = require('./middleware/rateLimiter');

const authRoutes        = require('./routes/auth');
const adminRoutes       = require('./routes/admin');
const procurementRoutes = require('./routes/procurement');
const managerRoutes     = require('./routes/manager');
const vendorRoutes      = require('./routes/vendor');
const protectedRoutes   = require('./routes/protected');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Security headers ─────────────────────────────────────────
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// ── Middleware ────────────────────────────────────────────────
app.use(cors({
  origin:      process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(cookieParser());
app.use(passport.initialize());

// ── Rate limiting (global) ────────────────────────────────────
app.use('/api/', generalLimiter);

// ── Static files ─────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ── API Routes ────────────────────────────────────────────────
app.use('/auth',            authRoutes);
app.use('/api/admin',       adminRoutes);
app.use('/api/procurement', procurementRoutes);
app.use('/api/manager',     managerRoutes);
app.use('/api/vendor',      vendorRoutes);
app.use('/',                protectedRoutes);

// ── Health check ─────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── 404 handler ───────────────────────────────────────────────
app.use((req, res) => {
  if (req.accepts('html')) {
    return res.status(404).sendFile(path.join(__dirname, 'public', 'index.html'));
  }
  res.status(404).json({ success: false, message: 'Route not found.' });
});

// ── Global error handler ──────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.message);
  res.status(500).json({ success: false, message: 'Internal server error.' });
});

// ── Start server ──────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀 VendorBridge server running on http://localhost:${PORT}`);
  console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`   Static files: /public`);
  console.log(`   Auth routes:  /auth/*\n`);
});

module.exports = app;
