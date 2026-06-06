/**
 * Google OAuth Controller
 * Handles the callback after Google authentication
 */

const { signToken } = require('../utils/jwt');
const User          = require('../models/User');

const ROLE_REDIRECTS = {
  admin:                '/admin/dashboard',
  procurement_officer:  '/procurement/dashboard',
  manager:              '/manager/dashboard',
  vendor:               '/vendor/dashboard',
};

exports.googleCallback = (req, res) => {
  try {
    const user  = req.user; // set by Passport
    const token = signToken(user);
    const redirect = ROLE_REDIRECTS[user.role] || '/procurement/dashboard';

    // Set HTTP-only cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure:   process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge:   7 * 24 * 60 * 60 * 1000,
    });

    // Redirect with token in query param so frontend JS can store it
    return res.redirect(
      `/pages/oauth-success.html?token=${encodeURIComponent(token)}&redirect=${encodeURIComponent(redirect)}&role=${encodeURIComponent(user.role)}`
    );
  } catch (err) {
    console.error('Google callback error:', err.message);
    return res.redirect('/pages/login.html?error=google_auth_failed');
  }
};
