/**
 * Admin Activity Logs Controller
 */
const pool = require('../../config/db');

exports.getLogs = async (req, res) => {
  try {
    const page   = Math.max(1, parseInt(req.query.page) || 1);
    const limit  = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
    const offset = (page - 1) * limit;
    const { search, entity_type, from, to } = req.query;

    let where = 'WHERE 1=1';
    const params = [];
    let idx = 1;

    if (search) {
      where += ` AND (al.description ILIKE $${idx} OR al.action ILIKE $${idx} OR u.full_name ILIKE $${idx})`;
      params.push(`%${search}%`); idx++;
    }
    if (entity_type) { where += ` AND al.entity_type = $${idx}`; params.push(entity_type); idx++; }
    if (from)        { where += ` AND al.created_at >= $${idx}`; params.push(from); idx++; }
    if (to)          { where += ` AND al.created_at <= $${idx}`; params.push(to); idx++; }

    const countRes = await pool.query(
      `SELECT COUNT(*) FROM activity_logs al LEFT JOIN users u ON u.id = al.user_id ${where}`, params
    );
    const total = parseInt(countRes.rows[0].count);

    const logsRes = await pool.query(
      `SELECT al.id, al.action, al.entity_type, al.entity_id, al.description,
              al.ip_address, al.created_at,
              u.full_name AS user_name, u.email AS user_email, u.role AS user_role
       FROM activity_logs al
       LEFT JOIN users u ON u.id = al.user_id
       ${where}
       ORDER BY al.created_at DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, limit, offset]
    );

    return res.json({
      success: true,
      data: { logs: logsRes.rows, pagination: { total, page, limit, pages: Math.ceil(total / limit) } },
    });
  } catch (err) {
    console.error('Get logs error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch activity logs.' });
  }
};

exports.getEntityTypes = async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT DISTINCT entity_type FROM activity_logs WHERE entity_type IS NOT NULL ORDER BY entity_type`
    );
    return res.json({ success: true, entity_types: r.rows.map(r => r.entity_type) });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to fetch entity types.' });
  }
};
