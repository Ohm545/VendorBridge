/**
 * Vendor Dashboard Controller
 */
const pool = require('../../config/db');

async function getVendorId(userId) {
  const r = await pool.query('SELECT id FROM vendors WHERE user_id=$1', [userId]);
  return r.rows[0]?.id || null;
}

exports.getStats = async (req, res) => {
  const uid = req.user.id;
  try {
    const vid = await getVendorId(uid);
    if (!vid) return res.status(404).json({ success: false, message: 'Vendor profile not found.' });

    const [assigned, pending, submitted, approved, pos, invoices, respRate, score] = await Promise.all([
      pool.query(`SELECT COUNT(*) FROM rfq_vendors WHERE vendor_id=$1`, [vid]),
      pool.query(`SELECT COUNT(*) FROM rfq_vendors rv WHERE rv.vendor_id=$1
        AND NOT EXISTS (SELECT 1 FROM quotations q WHERE q.rfq_id=rv.rfq_id AND q.vendor_id=$1)
        AND EXISTS (SELECT 1 FROM rfqs r WHERE r.id=rv.rfq_id AND r.status='active' AND (r.deadline IS NULL OR r.deadline > NOW()))`, [vid]),
      pool.query(`SELECT COUNT(*) FROM quotations WHERE vendor_id=$1`, [vid]),
      pool.query(`SELECT COUNT(*) FROM quotations WHERE vendor_id=$1 AND status='approved'`, [vid]),
      pool.query(`SELECT COUNT(*) FROM purchase_orders WHERE vendor_id=$1`, [vid]),
      pool.query(`SELECT COUNT(*) FROM invoices WHERE vendor_id=$1`, [vid]),
      pool.query(`SELECT
        CASE WHEN COUNT(DISTINCT rv.rfq_id)>0
          THEN ROUND((COUNT(DISTINCT q.rfq_id)::numeric / COUNT(DISTINCT rv.rfq_id))*100)
          ELSE 0 END AS rate
        FROM rfq_vendors rv LEFT JOIN quotations q ON q.vendor_id=rv.vendor_id AND q.rfq_id=rv.rfq_id
        WHERE rv.vendor_id=$1`, [vid]),
      // Score: response_rate*0.4 + approval_rate*0.4 + avg_speed*0.2
      pool.query(`SELECT
        LEAST(100, ROUND(
          (CASE WHEN COUNT(rv.rfq_id)>0 THEN (COUNT(q.id)::numeric/COUNT(rv.rfq_id))*40 ELSE 0 END) +
          (CASE WHEN COUNT(q.id)>0 THEN (COUNT(q.id) FILTER (WHERE q.status='approved')::numeric/COUNT(q.id))*40 ELSE 0 END) +
          (CASE WHEN AVG(EXTRACT(EPOCH FROM (q.submitted_at - rv.assigned_at))/86400) < 3 THEN 20
                WHEN AVG(EXTRACT(EPOCH FROM (q.submitted_at - rv.assigned_at))/86400) < 7 THEN 10 ELSE 5 END)
        )) AS score
        FROM rfq_vendors rv
        LEFT JOIN quotations q ON q.vendor_id=rv.vendor_id AND q.rfq_id=rv.rfq_id
        WHERE rv.vendor_id=$1`, [vid]),
    ]);

    return res.json({ success: true, data: {
      assigned_rfqs:       parseInt(assigned.rows[0].count),
      pending_quotations:  parseInt(pending.rows[0].count),
      submitted_quotations:parseInt(submitted.rows[0].count),
      approved_quotations: parseInt(approved.rows[0].count),
      purchase_orders:     parseInt(pos.rows[0].count),
      invoices:            parseInt(invoices.rows[0].count),
      response_rate:       parseInt(respRate.rows[0].rate),
      performance_score:   parseInt(score.rows[0].score) || 0,
    }});
  } catch (err) {
    console.error('Vendor stats error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load stats.' });
  }
};

exports.getInsights = async (req, res) => {
  const uid = req.user.id;
  try {
    const vid = await getVendorId(uid);
    if (!vid) return res.json({ success: true, insights: [] });
    const insights = [];

    const urgentRes = await pool.query(`SELECT COUNT(*) FROM rfq_vendors rv
      JOIN rfqs r ON r.id=rv.rfq_id
      WHERE rv.vendor_id=$1 AND r.status='active'
      AND NOT EXISTS (SELECT 1 FROM quotations q WHERE q.rfq_id=rv.rfq_id AND q.vendor_id=$1)
      AND r.deadline BETWEEN NOW() AND NOW()+INTERVAL '3 days'`, [vid]);
    const urgent = parseInt(urgentRes.rows[0].count);
    if (urgent > 0) insights.push({ type:'error', icon:'alert-triangle', text:`${urgent} RFQ deadline${urgent>1?'s':''} within 3 days — submit quotations now` });

    const pendingRes = await pool.query(`SELECT COUNT(*) FROM rfq_vendors rv
      JOIN rfqs r ON r.id=rv.rfq_id WHERE rv.vendor_id=$1 AND r.status='active'
      AND NOT EXISTS (SELECT 1 FROM quotations q WHERE q.rfq_id=rv.rfq_id AND q.vendor_id=$1)`, [vid]);
    const pending = parseInt(pendingRes.rows[0].count);
    if (pending > 0) insights.push({ type:'warning', icon:'clock', text:`${pending} RFQ${pending>1?'s':''} awaiting your quotation submission` });

    const poRes = await pool.query(`SELECT COUNT(*) FROM purchase_orders WHERE vendor_id=$1 AND created_at > NOW()-INTERVAL '7 days'`, [vid]);
    const pos = parseInt(poRes.rows[0].count);
    if (pos > 0) insights.push({ type:'success', icon:'check-circle', text:`${pos} purchase order${pos>1?'s':''} received this week` });

    const rateRes = await pool.query(`SELECT
      CASE WHEN COUNT(rv.rfq_id)>0 THEN ROUND((COUNT(q.id)::numeric/COUNT(rv.rfq_id))*100) ELSE 0 END AS rate
      FROM rfq_vendors rv LEFT JOIN quotations q ON q.vendor_id=rv.vendor_id AND q.rfq_id=rv.rfq_id
      WHERE rv.vendor_id=$1 AND rv.assigned_at > NOW()-INTERVAL '30 days'`, [vid]);
    const rate = parseInt(rateRes.rows[0].rate);
    if (rate > 0) insights.push({ type:'info', icon:'trending-up', text:`Your response rate this month: ${rate}%` });

    const avgRes = await pool.query(`SELECT ROUND(AVG(EXTRACT(EPOCH FROM (q.submitted_at - rv.assigned_at))/86400),1) AS avg_days
      FROM quotations q JOIN rfq_vendors rv ON rv.vendor_id=q.vendor_id AND rv.rfq_id=q.rfq_id
      WHERE q.vendor_id=$1 AND q.submitted_at > NOW()-INTERVAL '30 days'`, [vid]);
    const avg = parseFloat(avgRes.rows[0].avg_days);
    if (!isNaN(avg) && avg > 0) insights.push({ type:'info', icon:'activity', text:`Average quotation response time: ${avg} days` });

    if (!insights.length) insights.push({ type:'success', icon:'check-circle', text:'All caught up! No pending actions.' });
    return res.json({ success: true, insights });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to load insights.' });
  }
};

exports.getMonthlyTrend = async (req, res) => {
  const uid = req.user.id;
  try {
    const vid = await getVendorId(uid);
    if (!vid) return res.json({ success: true, data: [] });
    const r = await pool.query(`SELECT TO_CHAR(m.month,'Mon') AS label,
      COALESCE(rq.rfqs,0) AS rfqs, COALESCE(qt.quotes,0) AS quotes, COALESCE(p.pos,0) AS pos
      FROM (SELECT generate_series(DATE_TRUNC('month',NOW()-INTERVAL '11 months'),DATE_TRUNC('month',NOW()),'1 month') AS month) m
      LEFT JOIN (SELECT DATE_TRUNC('month',assigned_at) mo, COUNT(*) rfqs FROM rfq_vendors WHERE vendor_id=$1 GROUP BY mo) rq ON rq.mo=m.month
      LEFT JOIN (SELECT DATE_TRUNC('month',submitted_at) mo, COUNT(*) quotes FROM quotations WHERE vendor_id=$1 GROUP BY mo) qt ON qt.mo=m.month
      LEFT JOIN (SELECT DATE_TRUNC('month',created_at) mo, COUNT(*) pos FROM purchase_orders WHERE vendor_id=$1 GROUP BY mo) p ON p.mo=m.month
      ORDER BY m.month`, [vid]);
    return res.json({ success: true, data: r.rows });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed.' });
  }
};

module.exports = { ...exports, getVendorId };
