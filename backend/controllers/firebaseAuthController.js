/**
 * Firebase Authentication Controller
 * Handles Firebase Auth integration alongside existing JWT auth
 */

const { auth } = require('../config/firebase');
const pool = require('../config/db');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Verify Firebase ID token and sync with local user
exports.verifyFirebaseToken = async (req, res) => {
  try {
    const { idToken } = req.body;
    
    if (!idToken) {
      return res.status(400).json({ success: false, message: 'Firebase ID token required' });
    }

    if (!auth) {
      return res.status(500).json({ success: false, message: 'Firebase not configured' });
    }

    // Verify Firebase token
    const decodedToken = await auth.verifyIdToken(idToken);
    const { uid, email, name, picture } = decodedToken;

    if (!email) {
      return res.status(400).json({ success: false, message: 'Email required from Firebase' });
    }

    // Check if user exists in our database
    let user = await User.findByEmail(email);

    if (!user) {
      // Create new user with Firebase info
      const userData = {
        full_name: name || 'Firebase User',
        company_name: 'Firebase Company', // Default, user can update
        email: email,
        role: 'procurement_officer', // Default role
        is_verified: true,
        auth_provider: 'firebase',
        firebase_uid: uid
      };

      const result = await pool.query(
        `INSERT INTO users (full_name, company_name, email, role, is_verified, auth_provider, firebase_uid, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
         RETURNING *`,
        [userData.full_name, userData.company_name, userData.email, userData.role, userData.is_verified, userData.auth_provider, userData.firebase_uid]
      );

      user = result.rows[0];
    } else if (!user.firebase_uid) {
      // Link Firebase to existing user
      await pool.query(
        'UPDATE users SET firebase_uid = $1, auth_provider = $2, is_verified = TRUE WHERE id = $3',
        [uid, 'firebase', user.id]
      );
      user.firebase_uid = uid;
      user.auth_provider = 'firebase';
    }

    // Generate JWT token for our app
    const jwtToken = jwt.sign(
      { 
        id: user.id, 
        email: user.email, 
        role: user.role,
        auth_provider: 'firebase'
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    // Set secure cookie
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    };

    res.cookie('token', jwtToken, cookieOptions);

    // Return user data
    return res.json({
      success: true,
      message: 'Firebase authentication successful',
      user: {
        id: user.id,
        full_name: user.full_name,
        email: user.email,
        role: user.role,
        company_name: user.company_name,
        is_verified: user.is_verified,
        auth_provider: user.auth_provider
      },
      redirectUrl: user.role === 'admin' ? '/admin/dashboard.html' : 
                   user.role === 'manager' ? '/manager/dashboard.html' :
                   user.role === 'vendor' ? '/vendor/dashboard.html' :
                   '/procurement/dashboard.html'
    });

  } catch (error) {
    console.error('Firebase auth error:', error.message);
    
    if (error.code === 'auth/id-token-expired') {
      return res.status(401).json({ success: false, message: 'Firebase token expired' });
    }
    
    if (error.code === 'auth/argument-error') {
      return res.status(400).json({ success: false, message: 'Invalid Firebase token' });
    }

    return res.status(500).json({ success: false, message: 'Firebase authentication failed' });
  }
};

// Get current Firebase user info
exports.getFirebaseUser = async (req, res) => {
  try {
    const { firebase_uid } = req.user;
    
    if (!firebase_uid || !auth) {
      return res.status(400).json({ success: false, message: 'No Firebase integration' });
    }

    const firebaseUser = await auth.getUser(firebase_uid);
    
    return res.json({
      success: true,
      firebase_user: {
        uid: firebaseUser.uid,
        email: firebaseUser.email,
        displayName: firebaseUser.displayName,
        photoURL: firebaseUser.photoURL,
        emailVerified: firebaseUser.emailVerified,
        lastSignInTime: firebaseUser.metadata.lastSignInTime,
        creationTime: firebaseUser.metadata.creationTime
      }
    });

  } catch (error) {
    console.error('Get Firebase user error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to get Firebase user info' });
  }
};

module.exports = exports;