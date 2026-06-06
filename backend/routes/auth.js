/**
 * Auth Routes
 */

const express  = require('express');
const router   = express.Router();
const passport = require('../config/passport');
const { body } = require('express-validator');

const authCtrl         = require('../controllers/authController');
const googleAuthCtrl   = require('../controllers/googleAuthController');
const firebaseAuthCtrl = require('../controllers/firebaseAuthController');
const { authLimiter, forgotPasswordLimiter } = require('../middleware/rateLimiter');
const { authenticateUser }                   = require('../middleware/auth');

// ── Validation schemas ────────────────────────────────────────

const signupValidation = [
  body('full_name')
    .trim()
    .notEmpty().withMessage('Full name is required.')
    .isLength({ min: 2, max: 100 }).withMessage('Full name must be 2–100 characters.'),

  body('company_name')
    .trim()
    .notEmpty().withMessage('Company name is required.')
    .isLength({ min: 2, max: 150 }).withMessage('Company name must be 2–150 characters.'),

  body('email')
    .trim()
    .notEmpty().withMessage('Email is required.')
    .isEmail().withMessage('Enter a valid email address.')
    .normalizeEmail(),

  body('password')
    .notEmpty().withMessage('Password is required.')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters.')
    .matches(/[A-Z]/).withMessage('Password must contain at least one uppercase letter.')
    .matches(/[a-z]/).withMessage('Password must contain at least one lowercase letter.')
    .matches(/[0-9]/).withMessage('Password must contain at least one number.')
    .matches(/[^A-Za-z0-9]/).withMessage('Password must contain at least one special character.'),

  body('confirm_password')
    .notEmpty().withMessage('Please confirm your password.')
    .custom((value, { req }) => {
      if (value !== req.body.password) {
        throw new Error('Passwords do not match.');
      }
      return true;
    }),
];

const loginValidation = [
  body('email')
    .trim().notEmpty().withMessage('Email is required.')
    .isEmail().withMessage('Enter a valid email.')
    .normalizeEmail(),
  body('password')
    .notEmpty().withMessage('Password is required.'),
];

const forgotPasswordValidation = [
  body('email')
    .trim().notEmpty().withMessage('Email is required.')
    .isEmail().withMessage('Enter a valid email.')
    .normalizeEmail(),
];

const resetPasswordValidation = [
  body('token').notEmpty().withMessage('Reset token is required.'),
  body('password')
    .notEmpty().withMessage('Password is required.')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters.')
    .matches(/[A-Z]/).withMessage('Password must contain at least one uppercase letter.')
    .matches(/[a-z]/).withMessage('Password must contain at least one lowercase letter.')
    .matches(/[0-9]/).withMessage('Password must contain at least one number.')
    .matches(/[^A-Za-z0-9]/).withMessage('Password must contain at least one special character.'),
  body('confirm_password')
    .notEmpty().withMessage('Please confirm your password.')
    .custom((value, { req }) => {
      if (value !== req.body.password) throw new Error('Passwords do not match.');
      return true;
    }),
];

// ── Routes ────────────────────────────────────────────────────

// Signup
router.post('/signup', authLimiter, signupValidation, authCtrl.signup);

// Email verification
router.get('/verify-email/:token', authCtrl.verifyEmail);

// Resend verification
router.get('/resend-verification', authLimiter, authCtrl.resendVerification);

// Login
router.post('/login', authLimiter, loginValidation, authCtrl.login);

// Forgot password
router.post('/forgot-password', forgotPasswordLimiter, forgotPasswordValidation, authCtrl.forgotPassword);

// Reset password
router.post('/reset-password', authLimiter, resetPasswordValidation, authCtrl.resetPassword);

// Logout
router.post('/logout', authCtrl.logout);

// Get current user (protected)
router.get('/me', authenticateUser, authCtrl.getMe);

// ── Google OAuth ──────────────────────────────────────────────

// Initiate Google OAuth
router.get('/google',
  passport.authenticate('google', { scope: ['profile', 'email'], session: false })
);

// Google OAuth callback
router.get('/google/callback',
  passport.authenticate('google', {
    failureRedirect: '/pages/login.html?error=google_failed',
    session: false,
  }),
  googleAuthCtrl.googleCallback
);

// ── Firebase Authentication ───────────────────────────────────

// Firebase ID Token Verification
router.post('/firebase/verify', authLimiter, [
  body('idToken').notEmpty().withMessage('Firebase ID token is required.')
], firebaseAuthCtrl.verifyFirebaseToken);

// Get Firebase User Info (protected)
router.get('/firebase/user', authenticateUser, firebaseAuthCtrl.getFirebaseUser);

module.exports = router;
