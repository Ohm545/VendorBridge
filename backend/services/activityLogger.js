/**
 * Activity Logger Service
 * Automatically logs all significant actions to activity_logs table
 */

const pool = require('../config/db');

async function log({ userId = null, action, entityType = null, entityId = null, description, ipAddress = null }) {
  try {
    await pool.query(
      `INSERT INTO activity_logs (user_id, action, entity_type, entity_id, description, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId, action, entityType, entityId, description, ipAddress]
    );
  } catch (err) {
    // Never let logging errors crash the app
    console.error('Activity log error:', err.message);
  }
}

async function logRequest(req, action, entityType, entityId, description) {
  await log({
    userId:     req.user?.id || null,
    action,
    entityType,
    entityId,
    description,
    ipAddress:  req.ip || req.connection?.remoteAddress || null,
  });
}

module.exports = { log, logRequest };
