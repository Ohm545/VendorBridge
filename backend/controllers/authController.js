/**
 * Auth Controller
 * Handles: signup, verify-email, login, forgot-password, reset-password, logout, me
 */

const bcrypt  = require('bcryptjs');
const { validationResult } = require('express-validator');
const User    = require('../models/User');
const Token   = require('../models/Token');
const { signToken }              = require('../utils/jwt');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../utils/email');

// ── Role-based redirect map ──────────────────────────────────
const ROLE_REDIRECTS = {
  admin:                '/admin/dashboard',
  procurement_officer:  '/procurement/dashboard',
  manager:              '/manager/dashboard',
  vendor:               '/vendor/dashboard',
};

// ─────────────────────────────────────────────────────────────
// POST /auth/signup
// ─────────────────────────────────────────────────────────────
exports.signup = async (req, res) => {
  // Validate input
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({ success: false, errors: errors.array() });
  }

  const { full_name, company_name, email, password } = req.body;

  try {
    // Check duplicate email
    const existing = await User.findByEmail(email);
    if (existing) {
      return res.status(409).json({
        success: false,
        message: 'An account with this email already exists.',
      });
    }

    // Hash password
    const salt          = await bcrypt.genSalt(12);
    const password_hash = await bcrypt.hash(password, salt);

    // Create user (role always procurement_officer, is_verified false)
    const user = await User.create({
      full_name,
      company_name,
      email,
      password_hash,
      role:          'procurement_officer',
      is_verified:   false,
      auth_provider: 'local',
    });

    // Generate verification token & send email
    const token = await Token.createVerificationToken(user.id);
    await sendVerificationEmail(user.email, user.full_name, token);

    return res.status(201).json({
      success: true,
      message: 'Verification email sent. Please verify your email before logging in.',
    });
  } catch (err) {
    console.error('Signup error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error. Please try again.' });
  }
};

// ─────────────────────────────────────────────────────────────
// GET /auth/verify-email/:token
// ─────────────────────────────────────────────────────────────
exports.verifyEmail = async (req, res) => {
  const { token } = req.params;

  try {
    const record = await Token.findVerificationToken(token);

    if (!record) {
      return res.redirect('/pages/verify-error.html?reason=invalid');
    }

    if (new Date() > new Date(record.expires_at)) {
      await Token.deleteVerificationToken(token);
      return res.redirect('/pages/verify-error.html?reason=expired');
    }

    if (record.is_verified) {
      await Token.deleteVerificationToken(token);
      return res.redirect('/pages/login.html?verified=already');
    }

    // Mark verified & delete token
    await User.markVerified(record.user_id);
    await Token.deleteVerificationToken(token);

    return res.redirect('/pages/login.html?verified=true');
  } catch (err) {
    console.error('Email verification error:', err.message);
    return res.redirect('/pages/verify-error.html?reason=server');
  }
};

// ─────────────────────────────────────────────────────────────
// POST /auth/login
// ─────────────────────────────────────────────────────────────
exports.login = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({ success: false, errors: errors.array() });
  }

  const { email, password } = req.body;

  try {
    const user = await User.findByEmail(email);

    // Generic error to prevent user enumeration
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    // Google-only users have no password_hash
    if (!user.password_hash) {
      return res.status(401).json({
        success: false,
        message: 'This account uses Google Sign-In. Please continue with Google.',
      });
    }

    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    if (!user.is_verified) {
      return res.status(403).json({
        success: false,
        message: 'Please verify your email before logging in. Check your inbox for the verification link.',
        code:    'EMAIL_NOT_VERIFIED',
      });
    }

    // Sign JWT
    const token    = signToken(user);
    const redirect = ROLE_REDIRECTS[user.role] || '/procurement/dashboard';

    // Set HTTP-only cookie (optional — client can also use Authorization header)
    res.cookie('token', token, {
      httpOnly: true,
      secure:   process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge:   7 * 24 * 60 * 60 * 1000, // 7 days
    });

    return res.json({
      success: true,
      message: 'Login successful.',
      token,
      redirect,
      user: User.toPublic(user),
    });
  } catch (err) {
    console.error('Login error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error. Please try again.' });
  }
};

// ─────────────────────────────────────────────────────────────
// POST /auth/forgot-password
// ─────────────────────────────────────────────────────────────
exports.forgotPassword = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({ success: false, errors: errors.array() });
  }

  const { email } = req.body;

  try {
    const user = await User.findByEmail(email);

    // Always return success to prevent email enumeration
    if (!user || user.auth_provider === 'google') {
      return res.json({
        success: true,
        message: 'If an account with that email exists, a password reset link has been sent.',
      });
    }

    const token = await Token.createResetToken(user.id);
    await sendPasswordResetEmail(user.email, user.full_name, token);

    return res.json({
      success: true,
      message: 'If an account with that email exists, a password reset link has been sent.',
    });
  } catch (err) {
    console.error('Forgot password error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error. Please try again.' });
  }
};

// ─────────────────────────────────────────────────────────────
// POST /auth/reset-password
// ─────────────────────────────────────────────────────────────
exports.resetPassword = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({ success: false, errors: errors.array() });
  }

  const { token, password } = req.body;

  try {
    const record = await Token.findResetToken(token);

    if (!record) {
      return res.status(400).json({ success: false, message: 'Invalid or expired reset link.' });
    }

    if (new Date() > new Date(record.expires_at)) {
      await Token.deleteResetToken(token);
      return res.status(400).json({ success: false, message: 'Reset link has expired. Please request a new one.' });
    }

    // Hash new password
    const salt          = await bcrypt.genSalt(12);
    const password_hash = await bcrypt.hash(password, salt);

    await User.updatePassword(record.user_id, password_hash);
    await Token.deleteResetToken(token);

    return res.json({ success: true, message: 'Password updated successfully. You can now log in.' });
  } catch (err) {
    console.error('Reset password error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error. Please try again.' });
  }
};

// ─────────────────────────────────────────────────────────────
// POST /auth/logout
// ─────────────────────────────────────────────────────────────
exports.logout = (req, res) => {
  res.clearCookie('token', { httpOnly: true, sameSite: 'strict' });
  return res.json({ success: true, message: 'Logged out successfully.' });
};

// ─────────────────────────────────────────────────────────────
// GET /auth/me
// ─────────────────────────────────────────────────────────────
exports.getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }
    return res.json({ success: true, user: User.toPublic(user) });
  } catch (err) {
    console.error('GetMe error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ─────────────────────────────────────────────────────────────
// GET /auth/resend-verification
// ─────────────────────────────────────────────────────────────
exports.resendVerification = async (req, res) => {
  const { email } = req.query;
  if (!email) {
    return res.status(400).json({ success: false, message: 'Email is required.' });
  }

  try {
    const user = await User.findByEmail(email);
    if (!user || user.is_verified) {
      return res.json({ success: true, message: 'If the account exists and is unverified, a new email has been sent.' });
    }

    const token = await Token.createVerificationToken(user.id);
    await sendVerificationEmail(user.email, user.full_name, token);

    return res.json({ success: true, message: 'Verification email resent. Please check your inbox.' });
  } catch (err) {
    console.error('Resend verification error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};
