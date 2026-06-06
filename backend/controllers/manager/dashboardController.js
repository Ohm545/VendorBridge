/**
 * Manager Dashboard Controller
 */
const pool = require('../../config/db');

exports.getStats = async (req, res) => {
  const mid = req.user.id;
  try {
    const [pending, approved, rejected, avgTime, highVal, totalVal, highPri, sla] = await Promise.all([
      pool.query(`SELECT COUNT(*) FROM approvals WHERE manager_id=$1 AND status='pending'`, [mid]),
      pool.query(`SELECT COUNT(*) FROM approvals WHERE manager_id=$1 AND status='approved'`, [mid]),
      pool.query(`SELECT COUNT(*) FROM approvals WHERE manager_id=$1 AND status='rejected'`, [mid]),
      pool.query(`SELECT ROUND(AVG(EXTRACT(EPOCH FROM (approved_at - requested_at))/3600),1) AS avg_hours
                  FROM approvals WHERE manager_id=$1 AND status='approved' AND approved_at IS NOT NULL`, [mid]),
      pool.query(`SELECT COUNT(*) FROM approvals a
                  JOIN rfqs r ON r.id=a.rfq_id
                  WHERE a.manager_id=$1 AND a.status='pending'
                  AND r.expected_budget > 1000000`, [mid]),
      pool.query(`SELECT COALESCE(SUM(r.expected_budget),0) AS total
                  FROM approvals a JOIN rfqs r ON r.id=a.rfq_id
                  WHERE a.manager_id=$1 AND a.status='pending'`, [mid]),
      pool.query(`SELECT COUNT(*) FROM approvals WHERE manager_id=$1 AND status='pending' AND priority IN ('high','urgent')`, [mid]),
      pool.query(`SELECT
                    COUNT(*) AS total,
                    COUNT(*) FILTER (WHERE EXTRACT(EPOCH FROM (COALESCE(approved_at,NOW())-requested_at))/3600 <= 48) AS within_sla
                  FROM approvals WHERE manager_id=$1 AND status IN ('approved','rejected')`, [mid]),
    ]);

    const slaData = sla.rows[0];
    const slaCompliance = parseInt(slaData.total) > 0
      ? Math.round((parseInt(slaData.within_sla) / parseInt(slaData.total)) * 100)
      : 100;

    return res.json({ success: true, data: {
      pending_approvals:         parseInt(pending.rows[0].count),
      approved_requests:         parseInt(approved.rows[0].count),
      rejected_requests:         parseInt(rejected.rows[0].count),
      avg_approval_hours:        parseFloat(avgTime.rows[0].avg_hours) || 0,
      high_value_pending:        parseInt(highVal.rows[0].count),
      total_value_pending:       parseFloat(totalVal.rows[0].total),
      high_priority_pending:     parseInt(highPri.rows[0].count),
      sla_compliance_pct:        slaCompliance,
    }});
  } catch (err) {
    console.error('Manager stats error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load stats.' });
  }
};

exports.getInsights = async (req, res) => {
  const mid = req.user.id;
  try {
    const insights = [];

    const pendingRes = await pool.query(`SELECT COUNT(*) FROM approvals WHERE manager_id=$1 AND status='pending'`, [mid]);
    const pending = parseInt(pendingRes.rows[0].count);
    if (pending > 0) insights.push({ type: 'warning', icon: 'clock', text: `${pending} RFQ${pending>1?'s':''} require your approval` });

    const highValRes = await pool.query(`SELECT COALESCE(SUM(r.expected_budget),0) AS total FROM approvals a
      JOIN rfqs r ON r.id=a.rfq_id WHERE a.manager_id=$1 AND a.status='pending'`, [mid]);
    const hv = parseFloat(highValRes.rows[0].total);
    if (hv > 0) insights.push({ type: 'info', icon: 'trending-up', text: `₹${(hv/100000).toFixed(1)}L procurement value pending your review` });

    const slaRes = await pool.query(`SELECT COUNT(*) FROM approvals
      WHERE manager_id=$1 AND status='pending'
      AND EXTRACT(EPOCH FROM (NOW()-requested_at))/3600 > 48`, [mid]);
    const slaBreached = parseInt(slaRes.rows[0].count);
    if (slaBreached > 0) insights.push({ type: 'error', icon: 'alert-triangle', text: `${slaBreached} approval${slaBreached>1?'s':''} exceeded 48-hour SLA` });

    const topVendorRes = await pool.query(`SELECT v.vendor_name, COUNT(*) AS cnt
      FROM approvals a JOIN vendors v ON v.id=a.preferred_vendor_id
      WHERE a.manager_id=$1 AND a.status='approved' AND a.preferred_vendor_id IS NOT NULL
      AND a.approved_at > NOW() - INTERVAL '30 days'
      GROUP BY v.id, v.vendor_name ORDER BY cnt DESC LIMIT 1`, [mid]);
    if (topVendorRes.rows.length > 0) {
      insights.push({ type: 'success', icon: 'star', text: `${topVendorRes.rows[0].vendor_name} selected most frequently this month` });
    }

    const avgImpRes = await pool.query(`SELECT
      ROUND(AVG(CASE WHEN approved_at > NOW()-INTERVAL '30 days' THEN EXTRACT(EPOCH FROM (approved_at-requested_at))/3600 END),1) AS this_month,
      ROUND(AVG(CASE WHEN approved_at BETWEEN NOW()-INTERVAL '60 days' AND NOW()-INTERVAL '30 days' THEN EXTRACT(EPOCH FROM (approved_at-requested_at))/3600 END),1) AS last_month
      FROM approvals WHERE manager_id=$1 AND status='approved' AND approved_at IS NOT NULL`, [mid]);
    const tm = parseFloat(avgImpRes.rows[0].this_month);
    const lm = parseFloat(avgImpRes.rows[0].last_month);
    if (!isNaN(tm) && !isNaN(lm) && lm > 0) {
      const pct = Math.round(((lm - tm) / lm) * 100);
      if (pct > 0) insights.push({ type: 'success', icon: 'zap', text: `Average approval time improved by ${pct}% this month` });
    }

    if (!insights.length) insights.push({ type: 'success', icon: 'check-circle', text: 'All approvals are up to date. Great work!' });
    return res.json({ success: true, insights });
  } catch (err) {
    console.error('Insights error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load insights.' });
  }
};

exports.getMonthlyTrend = async (req, res) => {
  const mid = req.user.id;
  try {
    const result = await pool.query(`
      SELECT TO_CHAR(m.month,'Mon') AS label,
        COALESCE(ap.approved,0) AS approved,
        COALESCE(rj.rejected,0) AS rejected,
        COALESCE(pn.pending,0)  AS pending
      FROM (SELECT generate_series(DATE_TRUNC('month',NOW()-INTERVAL '11 months'), DATE_TRUNC('month',NOW()), '1 month') AS month) m
      LEFT JOIN (SELECT DATE_TRUNC('month',approved_at) mo, COUNT(*) approved FROM approvals WHERE manager_id=$1 AND status='approved' GROUP BY mo) ap ON ap.mo=m.month
      LEFT JOIN (SELECT DATE_TRUNC('month',resolved_at) mo, COUNT(*) rejected FROM approvals WHERE manager_id=$1 AND status='rejected' GROUP BY mo) rj ON rj.mo=m.month
      LEFT JOIN (SELECT DATE_TRUNC('month',requested_at) mo, COUNT(*) pending FROM approvals WHERE manager_id=$1 GROUP BY mo) pn ON pn.mo=m.month
      ORDER BY m.month ASC`, [mid]);
    return res.json({ success: true, data: result.rows });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to load trend.' });
  }
};
