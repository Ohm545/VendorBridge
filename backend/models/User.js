/**
 * User model — database queries
 */

const pool = require('../config/db');

const User = {
  // Find user by email
  async findByEmail(email) {
    const result = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email.toLowerCase().trim()]
    );
    return result.rows[0] || null;
  },

  // Find user by id
  async findById(id) {
    const result = await pool.query(
      'SELECT * FROM users WHERE id = $1',
      [id]
    );
    return result.rows[0] || null;
  },

  // Find user by Google ID
  async findByGoogleId(googleId) {
    const result = await pool.query(
      'SELECT * FROM users WHERE google_id = $1',
      [googleId]
    );
    return result.rows[0] || null;
  },

  // Create a new user
  async create({ full_name, company_name, email, password_hash, role = 'procurement_officer', is_verified = false, google_id = null, auth_provider = 'local' }) {
    const result = await pool.query(
      `INSERT INTO users (full_name, company_name, email, password_hash, role, is_verified, google_id, auth_provider)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, full_name, company_name, email, role, is_verified, auth_provider, created_at`,
      [full_name.trim(), company_name.trim(), email.toLowerCase().trim(), password_hash, role, is_verified, google_id, auth_provider]
    );
    return result.rows[0];
  },

  // Mark user as verified
  async markVerified(userId) {
    const result = await pool.query(
      `UPDATE users SET is_verified = TRUE, updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [userId]
    );
    return result.rows[0] || null;
  },

  // Update password
  async updatePassword(userId, password_hash) {
    await pool.query(
      `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`,
      [password_hash, userId]
    );
  },

  // Link Google ID to existing account
  async linkGoogleId(userId, googleId) {
    const result = await pool.query(
      `UPDATE users SET google_id = $1, auth_provider = 'google', is_verified = TRUE, updated_at = NOW()
       WHERE id = $2 RETURNING *`,
      [googleId, userId]
    );
    return result.rows[0] || null;
  },

  // Safe user object (no password hash)
  toPublic(user) {
    const { password_hash, ...safeUser } = user;
    return safeUser;
  },
};

module.exports = User;
