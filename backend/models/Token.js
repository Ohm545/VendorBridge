/**
 * Token model — email_verifications & password_resets
 */

const pool   = require('../config/db');
const crypto = require('crypto');

const Token = {
  // ── Email Verification ──────────────────────────────────

  async createVerificationToken(userId) {
    // Delete any existing tokens for this user
    await pool.query('DELETE FROM email_verifications WHERE user_id = $1', [userId]);

    const token     = crypto.randomBytes(64).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    await pool.query(
      `INSERT INTO email_verifications (user_id, token, expires_at)
       VALUES ($1, $2, $3)`,
      [userId, token, expiresAt]
    );

    return token;
  },

  async findVerificationToken(token) {
    const result = await pool.query(
      `SELECT ev.*, u.full_name, u.email, u.is_verified
       FROM email_verifications ev
       JOIN users u ON u.id = ev.user_id
       WHERE ev.token = $1`,
      [token]
    );
    return result.rows[0] || null;
  },

  async deleteVerificationToken(token) {
    await pool.query('DELETE FROM email_verifications WHERE token = $1', [token]);
  },

  // ── Password Reset ──────────────────────────────────────

  async createResetToken(userId) {
    // Delete any existing tokens for this user
    await pool.query('DELETE FROM password_resets WHERE user_id = $1', [userId]);

    const token     = crypto.randomBytes(64).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await pool.query(
      `INSERT INTO password_resets (user_id, token, expires_at)
       VALUES ($1, $2, $3)`,
      [userId, token, expiresAt]
    );

    return token;
  },

  async findResetToken(token) {
    const result = await pool.query(
      `SELECT pr.*, u.full_name, u.email
       FROM password_resets pr
       JOIN users u ON u.id = pr.user_id
       WHERE pr.token = $1`,
      [token]
    );
    return result.rows[0] || null;
  },

  async deleteResetToken(token) {
    await pool.query('DELETE FROM password_resets WHERE token = $1', [token]);
  },
};

module.exports = Token;
