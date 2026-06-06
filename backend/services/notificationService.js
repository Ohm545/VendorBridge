/**
 * Notification Service
 * Creates in-app notifications and (optionally) sends emails
 */

const pool = require('../config/db');

/**
 * Create an in-app notification for a specific user
 */
async function createNotification({ userId, title, message, type = 'info', link = null }) {
  try {
    const result = await pool.query(
      `INSERT INTO notifications (user_id, title, message, type, link)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [userId, title, message, type, link]
    );
    return result.rows[0];
  } catch (err) {
    console.error('Create notification error:', err.message);
    return null;
  }
}

/**
 * Broadcast notification to all admins
 */
async function notifyAdmins({ title, message, type = 'info', link = null }) {
  try {
    const admins = await pool.query(
      `SELECT id FROM users WHERE role = 'admin' AND status = 'active'`
    );
    for (const admin of admins.rows) {
      await createNotification({ userId: admin.id, title, message, type, link });
    }
  } catch (err) {
    console.error('Notify admins error:', err.message);
  }
}

/**
 * Mark notifications as read
 */
async function markRead(userId, notificationIds = []) {
  if (notificationIds.length === 0) {
    await pool.query(
      `UPDATE notifications SET is_read = TRUE WHERE user_id = $1`,
      [userId]
    );
  } else {
    await pool.query(
      `UPDATE notifications SET is_read = TRUE WHERE user_id = $1 AND id = ANY($2::uuid[])`,
      [userId, notificationIds]
    );
  }
}

/**
 * Get unread count for a user
 */
async function getUnreadCount(userId) {
  const result = await pool.query(
    `SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND is_read = FALSE`,
    [userId]
  );
  return parseInt(result.rows[0].count);
}

module.exports = { createNotification, notifyAdmins, markRead, getUnreadCount };
