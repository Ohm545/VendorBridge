/**
 * Passport.js — Google OAuth 2.0 Strategy (Optional)
 */

const passport    = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const pool        = require('./db');

// Only initialize Google OAuth if credentials are provided
if (process.env.GOOGLE_CLIENT_ID && 
    process.env.GOOGLE_CLIENT_SECRET && 
    process.env.GOOGLE_CLIENT_ID !== 'your_google_client_id_here') {
  
  passport.use(
    new GoogleStrategy(
      {
        clientID:     process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL:  process.env.GOOGLE_CALLBACK_URL || '/auth/google/callback',
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          const email     = profile.emails?.[0]?.value;
          const googleId  = profile.id;
          const fullName  = profile.displayName || 'Unknown';

          if (!email) {
            return done(new Error('No email returned from Google'), null);
          }

          // 1. Check if user exists by google_id
          let result = await pool.query(
            'SELECT * FROM users WHERE google_id = $1',
            [googleId]
          );

          if (result.rows.length > 0) {
            // Existing Google user — login directly
            return done(null, result.rows[0]);
          }

          // 2. Check if user exists by email (email/password signup)
          result = await pool.query(
            'SELECT * FROM users WHERE email = $1',
            [email]
          );

          if (result.rows.length > 0) {
            // Link Google ID to existing account, keep existing role
            const updated = await pool.query(
              `UPDATE users
               SET google_id = $1, auth_provider = 'google', is_verified = TRUE, updated_at = NOW()
               WHERE email = $2
               RETURNING *`,
              [googleId, email]
            );
            return done(null, updated.rows[0]);
          }

        // 3. New user — create account
        const newUser = await pool.query(
          `INSERT INTO users (full_name, company_name, email, google_id, role, is_verified, auth_provider)
           VALUES ($1, $2, $3, $4, 'procurement_officer', TRUE, 'google')
           RETURNING *`,
          [fullName, 'Not Set', email, googleId]
        );

        return done(null, newUser.rows[0]);
      } catch (err) {
        return done(err, null);
      }
    })
  );
} else {
  console.log('   ⚠️  Google OAuth not configured (missing credentials)');
}

// Passport requires serialize/deserialize even though we use JWT (stateless)
passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
  try {
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    done(null, result.rows[0] || null);
  } catch (err) {
    done(err, null);
  }
});

module.exports = passport;
