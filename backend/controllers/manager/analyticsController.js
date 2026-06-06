/**
 * Manager Analytics Controller
 */
const pool = require('../../config/db');

exports.getApprovalAnalytics = async (req, res) => {
  const mid = req.user.id;
  try {
    const [stats, sla, trend] = await Promise.all([
      pool.query(`SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE status='approved') AS approved,
        COUNT(*) FILTER (WHERE status='rejected') AS rejected,
        COUNT(*) FILTER (WHERE status='pending')  AS pending,
        ROUND(AVG(EXTRACT(EPOCH FROM (approved_at-requested_at))/3600) FILTER (WHERE status='approved' AND approved_at IS NOT NULL),1) AS avg_hours,
        ROUND(COUNT(*) FILTER (WHERE status='approved')::numeric / NULLIF(COUNT(*) FILTER (WHERE status IN ('approved','rejected')),0)*100,1) AS approval_rate
        FROM approvals WHERE manager_id=$1`, [mid]),
      pool.query(`SELECT
        COUNT(*) FILTER (WHERE EXTRACT(EPOCH FROM (COALESCE(resolved_at,NOW())-requested_at))/3600 <= 48) AS within_48h,
        COUNT(*) FILTER (WHERE EXTRACT(EPOCH FROM (COALESCE(resolved_at,NOW())-requested_at))/3600 > 48) AS breached,
        COUNT(*) AS total
        FROM approvals WHERE manager_id=$1 AND status IN ('approved','rejected')`, [mid]),
      pool.query(`SELECT TO_CHAR(DATE_TRUNC('month',m.month),'Mon YYYY') AS label,
        COALESCE(ap.approved,0) AS approved, COALESCE(rj.rejected,0) AS rejected
        FROM (SELECT generate_series(DATE_TRUNC('month',NOW()-INTERVAL '11 months'),DATE_TRUNC('month',NOW()),'1 month') AS month) m
        LEFT JOIN (SELECT DATE_TRUNC('month',approved_at) mo, COUNT(*) approved FROM approvals WHERE manager_id=$1 AND status='approved' GROUP BY mo) ap ON ap.mo=m.month
        LEFT JOIN (SELECT DATE_TRUNC('month',resolved_at) mo, COUNT(*) rejected FROM approvals WHERE manager_id=$1 AND status='rejected' GROUP BY mo) rj ON rj.mo=m.month
        ORDER BY m.month`, [mid]),
    ]);
    return res.json({ success: true, data: { stats: stats.rows[0], sla: sla.rows[0], trend: trend.rows } });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to load analytics.' });
  }
};

exports.getProcurementValueAnalytics = async (req, res) => {
  const mid = req.user.id;
  try {
    const [summary, monthly, byVendor] = await Promise.all([
      pool.query(`SELECT
        COALESCE(SUM(r.expected_budget) FILTER (WHERE a.status='approved'),0) AS approved_spend,
        COALESCE(SUM(r.expected_budget) FILTER (WHERE a.status='rejected'),0) AS rejected_spend,
        COALESCE(SUM(r.expected_budget) FILTER (WHERE a.status='pending'),0)  AS pending_spend
        FROM approvals a JOIN rfqs r ON r.id=a.rfq_id WHERE a.manager_id=$1`, [mid]),
      pool.query(`SELECT TO_CHAR(DATE_TRUNC('month',a.approved_at),'Mon') AS label,
        COALESCE(SUM(r.expected_budget),0) AS spend
        FROM approvals a JOIN rfqs r ON r.id=a.rfq_id
        WHERE a.manager_id=$1 AND a.status='approved' AND a.approved_at > NOW()-INTERVAL '12 months'
        GROUP BY DATE_TRUNC('month',a.approved_at) ORDER BY 1`, [mid]),
      pool.query(`SELECT v.vendor_name, COALESCE(SUM(r.expected_budget),0) AS spend, COUNT(*) AS count
        FROM approvals a JOIN rfqs r ON r.id=a.rfq_id LEFT JOIN vendors v ON v.id=a.preferred_vendor_id
        WHERE a.manager_id=$1 AND a.status='approved' AND a.preferred_vendor_id IS NOT NULL
        GROUP BY v.id, v.vendor_name ORDER BY spend DESC LIMIT 8`, [mid]),
    ]);
    return res.json({ success: true, data: { summary: summary.rows[0], monthly: monthly.rows, by_vendor: byVendor.rows } });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed.' });
  }
};

exports.getVendorAnalytics = async (req, res) => {
  const mid = req.user.id;
  try {
    const result = await pool.query(`SELECT v.id, v.vendor_name, v.category,
      COUNT(DISTINCT rv.rfq_id) AS assigned,
      COUNT(DISTINCT q.id) AS quoted,
      COUNT(DISTINCT a.id) FILTER (WHERE a.status='approved' AND a.preferred_vendor_id=v.id) AS approvals_as_preferred,
      CASE WHEN COUNT(DISTINCT rv.rfq_id)>0 THEN ROUND((COUNT(DISTINCT q.rfq_id)::numeric/COUNT(DISTINCT rv.rfq_id))*100) ELSE 0 END AS response_rate,
      CASE WHEN COUNT(DISTINCT a2.id)>0 THEN ROUND((COUNT(DISTINCT a.id) FILTER (WHERE a.preferred_vendor_id=v.id)::numeric/COUNT(DISTINCT a2.id))*100) ELSE 0 END AS approval_rate
      FROM vendors v
      LEFT JOIN rfq_vendors rv ON rv.vendor_id=v.id
      LEFT JOIN quotations q ON q.vendor_id=v.id
      LEFT JOIN approvals a ON a.preferred_vendor_id=v.id AND a.manager_id=$1
      LEFT JOIN approvals a2 ON a2.rfq_id IN (SELECT rfq_id FROM rfq_vendors WHERE vendor_id=v.id) AND a2.manager_id=$1
      WHERE v.status='active'
      GROUP BY v.id, v.vendor_name, v.category
      ORDER BY approvals_as_preferred DESC, response_rate DESC LIMIT 10`, [mid]);
    return res.json({ success: true, vendors: result.rows });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed.' });
  }
};

exports.getOfficerAnalytics = async (req, res) => {
  const mid = req.user.id;
  try {
    const result = await pool.query(`SELECT u.full_name, u.email,
      COUNT(DISTINCT r.id) AS rfqs_created,
      COUNT(DISTINCT a.id) AS approval_requests,
      COUNT(DISTINCT a.id) FILTER (WHERE a.status='approved') AS approved,
      COUNT(DISTINCT a.id) FILTER (WHERE a.status='rejected') AS rejected,
      CASE WHEN COUNT(DISTINCT a.id) FILTER (WHERE a.status IN ('approved','rejected'))>0
           THEN ROUND((COUNT(DISTINCT a.id) FILTER (WHERE a.status='approved')::numeric /
                       COUNT(DISTINCT a.id) FILTER (WHERE a.status IN ('approved','rejected')))*100)
           ELSE 0 END AS approval_rate
      FROM users u
      LEFT JOIN rfqs r ON r.created_by=u.id
      LEFT JOIN approvals a ON a.requested_by=u.id AND a.manager_id=$1
      WHERE u.role='procurement_officer' AND u.status='active'
      GROUP BY u.id, u.full_name, u.email ORDER BY rfqs_created DESC LIMIT 8`, [mid]);
    return res.json({ success: true, officers: result.rows });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed.' });
  }
};
