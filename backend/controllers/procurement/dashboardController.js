/**
 * Procurement Officer Dashboard Controller
 */
const pool = require('../../config/db');

exports.getStats = async (req, res) => {
  const uid = req.user.id;
  try {
    const [active, openRfqs, quotations, pendingAppr, approved, pos, invoices, spend] = await Promise.all([
      pool.query(`SELECT COUNT(*) FROM rfqs WHERE created_by=$1 AND status NOT IN ('closed','cancelled')`, [uid]),
      pool.query(`SELECT COUNT(*) FROM rfqs WHERE created_by=$1 AND status='active'`, [uid]),
      pool.query(`SELECT COUNT(*) FROM quotations q JOIN rfqs r ON r.id=q.rfq_id WHERE r.created_by=$1`, [uid]),
      pool.query(`SELECT COUNT(*) FROM approvals a JOIN rfqs r ON r.id=a.rfq_id WHERE r.created_by=$1 AND a.status='pending'`, [uid]),
      pool.query(`SELECT COUNT(*) FROM approvals a JOIN rfqs r ON r.id=a.rfq_id WHERE r.created_by=$1 AND a.status='approved'`, [uid]),
      pool.query(`SELECT COUNT(*) FROM purchase_orders WHERE created_by=$1`, [uid]),
      pool.query(`SELECT COUNT(*) FROM invoices i JOIN purchase_orders po ON po.id=i.po_id WHERE po.created_by=$1`, [uid]),
      pool.query(`SELECT COALESCE(SUM(po.amount),0) AS total FROM purchase_orders po WHERE po.created_by=$1 AND po.status!='cancelled'`, [uid]),
    ]);
    return res.json({ success: true, data: {
      active_rfqs:      parseInt(active.rows[0].count),
      open_rfqs:        parseInt(openRfqs.rows[0].count),
      received_quotations: parseInt(quotations.rows[0].count),
      pending_approvals: parseInt(pendingAppr.rows[0].count),
      approved_requests: parseInt(approved.rows[0].count),
      purchase_orders:  parseInt(pos.rows[0].count),
      invoices:         parseInt(invoices.rows[0].count),
      procurement_spend: parseFloat(spend.rows[0].total),
    }});
  } catch(err) {
    console.error('Procurement stats error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load stats.' });
  }
};

exports.getInsights = async (req, res) => {
  const uid = req.user.id;
  try {
    const insights = [];

    // RFQs awaiting vendor responses
    const awaitingRes = await pool.query(
      `SELECT COUNT(*) FROM rfqs r
       WHERE r.created_by=$1 AND r.status='active'
       AND NOT EXISTS (SELECT 1 FROM quotations q WHERE q.rfq_id=r.id)`, [uid]
    );
    const awaiting = parseInt(awaitingRes.rows[0].count);
    if (awaiting > 0) insights.push({ type:'warning', icon:'clock', text:`${awaiting} RFQ${awaiting>1?'s':''} awaiting vendor responses` });

    // RFQs ready for approval
    const readyRes = await pool.query(
      `SELECT COUNT(*) FROM rfqs r
       WHERE r.created_by=$1 AND r.status='quotation_received'
       AND r.preferred_vendor_id IS NOT NULL`, [uid]
    );
    const ready = parseInt(readyRes.rows[0].count);
    if (ready > 0) insights.push({ type:'info', icon:'check-circle', text:`${ready} RFQ${ready>1?'s':''} ready for approval request` });

    // Fastest vendor this month
    const fastVendorRes = await pool.query(
      `SELECT v.vendor_name,
         ROUND(AVG(EXTRACT(EPOCH FROM (q.submitted_at - rv.assigned_at))/3600),1) AS avg_hours
       FROM quotations q
       JOIN rfq_vendors rv ON rv.rfq_id=q.rfq_id AND rv.vendor_id=q.vendor_id
       JOIN vendors v ON v.id=q.vendor_id
       JOIN rfqs r ON r.id=q.rfq_id
       WHERE r.created_by=$1 AND q.submitted_at > NOW() - INTERVAL '30 days'
       GROUP BY v.id, v.vendor_name ORDER BY avg_hours ASC LIMIT 1`, [uid]
    );
    if (fastVendorRes.rows.length > 0) {
      insights.push({ type:'success', icon:'zap', text:`${fastVendorRes.rows[0].vendor_name} responded fastest this month (${fastVendorRes.rows[0].avg_hours}h avg)` });
    }

    // Average quotation turnaround
    const turnaroundRes = await pool.query(
      `SELECT ROUND(AVG(EXTRACT(EPOCH FROM (q.submitted_at - rv.assigned_at))/86400),1) AS avg_days
       FROM quotations q
       JOIN rfq_vendors rv ON rv.rfq_id=q.rfq_id AND rv.vendor_id=q.vendor_id
       JOIN rfqs r ON r.id=q.rfq_id WHERE r.created_by=$1`, [uid]
    );
    const avgDays = parseFloat(turnaroundRes.rows[0].avg_days);
    if (!isNaN(avgDays) && avgDays > 0) {
      insights.push({ type:'info', icon:'activity', text:`Average quotation turnaround: ${avgDays} days` });
    }

    // Pending approvals
    const apprRes = await pool.query(
      `SELECT COUNT(*) FROM approvals a JOIN rfqs r ON r.id=a.rfq_id WHERE r.created_by=$1 AND a.status='pending'`, [uid]
    );
    const pendingAppr = parseInt(apprRes.rows[0].count);
    if (pendingAppr > 0) insights.push({ type:'warning', icon:'alert-triangle', text:`${pendingAppr} approval request${pendingAppr>1?'s':''} pending with manager` });

    if (!insights.length) insights.push({ type:'success', icon:'check-circle', text:'All procurement activities are on track.' });

    return res.json({ success: true, insights });
  } catch(err) {
    console.error('Insights error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load insights.' });
  }
};

exports.getMonthlyTrend = async (req, res) => {
  const uid = req.user.id;
  try {
    const result = await pool.query(
      `SELECT
         TO_CHAR(m.month,'Mon') AS label,
         COALESCE(r.rfq_count,0) AS rfqs,
         COALESCE(p.po_count,0)  AS pos,
         COALESCE(s.spend,0)     AS spend
       FROM (
         SELECT generate_series(
           DATE_TRUNC('month', NOW() - INTERVAL '11 months'),
           DATE_TRUNC('month', NOW()), '1 month') AS month
       ) m
       LEFT JOIN (SELECT DATE_TRUNC('month',created_at) mo, COUNT(*) rfq_count FROM rfqs WHERE created_by=$1 GROUP BY mo) r ON r.mo=m.month
       LEFT JOIN (SELECT DATE_TRUNC('month',created_at) mo, COUNT(*) po_count FROM purchase_orders WHERE created_by=$1 GROUP BY mo) p ON p.mo=m.month
       LEFT JOIN (SELECT DATE_TRUNC('month',created_at) mo, COALESCE(SUM(amount),0) spend FROM purchase_orders WHERE created_by=$1 AND status!='cancelled' GROUP BY mo) s ON s.mo=m.month
       ORDER BY m.month ASC`, [uid]
    );
    return res.json({ success: true, data: result.rows });
  } catch(err) {
    return res.status(500).json({ success: false, message: 'Failed to load trend.' });
  }
};
