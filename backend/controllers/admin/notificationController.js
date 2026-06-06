/**
 * Admin Notifications Controller
 */
const pool = require('../../config/db');
const { markRead, getUnreadCount } = require('../../services/notificationService');

exports.getNotifications = async (req, res) => {
  try {
    const page   = Math.max(1, parseInt(req.query.page) || 1);
    const limit  = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const offset = (page - 1) * limit;
    const unread_only = req.query.unread === 'true';

    let where = `WHERE user_id = $1`;
    const params = [req.user.id];
    if (unread_only) { where += ` AND is_read = FALSE`; }

    const countRes = await pool.query(`SELECT COUNT(*) FROM notifications ${where}`, params);
    const total = parseInt(countRes.rows[0].count);

    const r = await pool.query(
      `SELECT * FROM notifications ${where} ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [req.user.id, limit, offset]
    );

    const unread = await getUnreadCount(req.user.id);

    return res.json({
      success: true,
      data: { notifications: r.rows, unread_count: unread, pagination: { total, page, limit, pages: Math.ceil(total / limit) } },
    });
  } catch (err) {
    console.error('Get notifications error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch notifications.' });
  }
};

exports.markAsRead = async (req, res) => {
  try {
    const { ids } = req.body; // array or empty for all
    await markRead(req.user.id, ids || []);
    const unread = await getUnreadCount(req.user.id);
    return res.json({ success: true, message: 'Notifications marked as read.', unread_count: unread });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to mark notifications.' });
  }
};

exports.getUnreadCount = async (req, res) => {
  try {
    const count = await getUnreadCount(req.user.id);
    return res.json({ success: true, unread_count: count });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to get count.' });
  }
};

exports.deleteNotification = async (req, res) => {
  try {
    await pool.query(
      `DELETE FROM notifications WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user.id]
    );
    return res.json({ success: true, message: 'Notification deleted.' });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to delete notification.' });
  }
};
