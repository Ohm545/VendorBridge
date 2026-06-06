/**
 * Manager Notifications Controller
 */
const pool = require('../../config/db');
const { getUnreadCount, markRead } = require('../../services/notificationService');

exports.getNotifications = async (req, res) => {
  const uid = req.user.id;
  const page = Math.max(1, parseInt(req.query.page)||1);
  const limit = Math.min(50, parseInt(req.query.limit)||20);
  const offset = (page-1)*limit;
  const unreadOnly = req.query.unread === 'true';
  try {
    let where = 'WHERE user_id=$1';
    if (unreadOnly) where += ' AND is_read=FALSE';
    const countRes = await pool.query(`SELECT COUNT(*) FROM notifications ${where}`, [uid]);
    const total = parseInt(countRes.rows[0].count);
    const r = await pool.query(`SELECT * FROM notifications ${where} ORDER BY created_at DESC LIMIT $2 OFFSET $3`, [uid, limit, offset]);
    const unread = await getUnreadCount(uid);
    return res.json({ success: true, data: { notifications: r.rows, unread_count: unread, pagination: { total, page, limit, pages: Math.ceil(total/limit) } } });
  } catch (err) { return res.status(500).json({ success: false, message: 'Failed.' }); }
};

exports.markAsRead = async (req, res) => {
  try {
    await markRead(req.user.id, req.body.ids || []);
    const unread = await getUnreadCount(req.user.id);
    return res.json({ success: true, unread_count: unread });
  } catch (err) { return res.status(500).json({ success: false, message: 'Failed.' }); }
};

exports.getUnreadCount = async (req, res) => {
  try {
    const count = await getUnreadCount(req.user.id);
    return res.json({ success: true, unread_count: count });
  } catch (err) { return res.status(500).json({ success: false, message: 'Failed.' }); }
};
