/**
 * Vendor Performance Controller
 */
const pool = require('../../config/db');
const { getVendorId } = require('./dashboardController');

exports.getPerformance = async (req, res) => {
  const uid = req.user.id;
  try {
    const vid = await getVendorId(uid);
    if (!vid) return res.status(404).json({ success: false, message: 'Vendor not found.' });

    const [kpis, monthly, scoreBreakdown] = await Promise.all([
      pool.query(`SELECT
        COUNT(DISTINCT rv.rfq_id) AS assigned,
        COUNT(DISTINCT q.id) AS submitted,
        COUNT(DISTINCT q.id) FILTER (WHERE q.status='approved') AS won,
        COUNT(DISTINCT q.id) FILTER (WHERE q.status='rejected') AS lost,
        COUNT(DISTINCT po.id) AS purchase_orders,
        ROUND(AVG(EXTRACT(EPOCH FROM (q.submitted_at - rv.assigned_at))/86400) FILTER (WHERE q.submitted_at IS NOT NULL),1) AS avg_days,
        CASE WHEN COUNT(DISTINCT rv.rfq_id)>0
          THEN ROUND((COUNT(DISTINCT q.rfq_id)::numeric/COUNT(DISTINCT rv.rfq_id))*100) ELSE 0 END AS response_rate,
        CASE WHEN COUNT(DISTINCT q.id)>0
          THEN ROUND((COUNT(DISTINCT q.id) FILTER (WHERE q.status='approved')::numeric/COUNT(DISTINCT q.id))*100) ELSE 0 END AS success_rate
        FROM rfq_vendors rv
        LEFT JOIN quotations q ON q.vendor_id=rv.vendor_id AND q.rfq_id=rv.rfq_id
        LEFT JOIN purchase_orders po ON po.vendor_id=$1
        WHERE rv.vendor_id=$1`, [vid]),

      pool.query(`SELECT TO_CHAR(m.month,'Mon') AS label,
        COALESCE(rq.rfqs,0) AS rfqs, COALESCE(qt.quotes,0) AS quotes, COALESCE(p.pos,0) AS pos
        FROM (SELECT generate_series(DATE_TRUNC('month',NOW()-INTERVAL '11 months'),DATE_TRUNC('month',NOW()),'1 month') AS month) m
        LEFT JOIN (SELECT DATE_TRUNC('month',assigned_at) mo, COUNT(*) rfqs FROM rfq_vendors WHERE vendor_id=$1 GROUP BY mo) rq ON rq.mo=m.month
        LEFT JOIN (SELECT DATE_TRUNC('month',submitted_at) mo, COUNT(*) quotes FROM quotations WHERE vendor_id=$1 GROUP BY mo) qt ON qt.mo=m.month
        LEFT JOIN (SELECT DATE_TRUNC('month',created_at) mo, COUNT(*) pos FROM purchase_orders WHERE vendor_id=$1 GROUP BY mo) p ON p.mo=m.month
        ORDER BY m.month`, [vid]),

      pool.query(`SELECT
        CASE WHEN COUNT(rv.rfq_id)>0 THEN ROUND((COUNT(q.id)::numeric/COUNT(rv.rfq_id))*40) ELSE 0 END AS response_score,
        CASE WHEN COUNT(q.id)>0 THEN ROUND((COUNT(q.id) FILTER (WHERE q.status='approved')::numeric/COUNT(q.id))*40) ELSE 0 END AS approval_score,
        CASE WHEN AVG(EXTRACT(EPOCH FROM (q.submitted_at - rv.assigned_at))/86400) < 3 THEN 20
             WHEN AVG(EXTRACT(EPOCH FROM (q.submitted_at - rv.assigned_at))/86400) < 7 THEN 10 ELSE 5 END AS speed_score
        FROM rfq_vendors rv
        LEFT JOIN quotations q ON q.vendor_id=rv.vendor_id AND q.rfq_id=rv.rfq_id
        WHERE rv.vendor_id=$1`, [vid]),
    ]);

    const sb = scoreBreakdown.rows[0];
    const totalScore = Math.min(100, parseInt(sb.response_score||0) + parseInt(sb.approval_score||0) + parseInt(sb.speed_score||0));

    return res.json({ success: true, data: {
      kpis: kpis.rows[0],
      monthly: monthly.rows,
      score: totalScore,
      score_breakdown: { response: parseInt(sb.response_score||0), approval: parseInt(sb.approval_score||0), speed: parseInt(sb.speed_score||0) },
    }});
  } catch (err) {
    console.error('Performance error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load performance.' });
  }
};
