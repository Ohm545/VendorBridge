/**
 * Procurement Reports Controller
 */
const pool = require('../../config/db');

function toCSV(rows) {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map(h => {
      const v = row[h] == null ? '' : String(row[h]);
      return v.includes(',') || v.includes('"') || v.includes('\n') ? `"${v.replace(/"/g, '""')}"` : v;
    }).join(','));
  }
  return lines.join('\n');
}

// GET /api/procurement/reports/analytics
exports.getAnalytics = async (req, res) => {
  const uid = req.user.id;
  try {
    const [rfqStats, quotStats, apprStats, spendStats, vendorPerf] = await Promise.all([
      pool.query(`SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE status='active') AS active,
        COUNT(*) FILTER (WHERE status IN ('approved','po_generated','invoice_generated')) AS approved,
        COUNT(*) FILTER (WHERE status='rejected') AS rejected
        FROM rfqs WHERE created_by=$1`, [uid]),
      pool.query(`SELECT COUNT(*) AS total,
        ROUND(AVG(EXTRACT(EPOCH FROM (q.submitted_at - rv.assigned_at))/86400),1) AS avg_turnaround_days
        FROM quotations q JOIN rfq_vendors rv ON rv.rfq_id=q.rfq_id AND rv.vendor_id=q.vendor_id
        JOIN rfqs r ON r.id=q.rfq_id WHERE r.created_by=$1`, [uid]),
      pool.query(`SELECT
        COUNT(*) FILTER (WHERE a.status='approved') AS approved,
        COUNT(*) FILTER (WHERE a.status='rejected') AS rejected,
        COUNT(*) FILTER (WHERE a.status='pending')  AS pending
        FROM approvals a JOIN rfqs r ON r.id=a.rfq_id WHERE r.created_by=$1`, [uid]),
      pool.query(`SELECT COALESCE(SUM(amount),0) AS total_spend, COUNT(*) AS total_pos
        FROM purchase_orders WHERE created_by=$1 AND status!='cancelled'`, [uid]),
      pool.query(`SELECT v.vendor_name,
        COUNT(DISTINCT rv.rfq_id) AS assigned,
        COUNT(DISTINCT q.id) AS quoted,
        CASE WHEN COUNT(DISTINCT rv.rfq_id)>0
             THEN ROUND((COUNT(DISTINCT q.rfq_id)::numeric/COUNT(DISTINCT rv.rfq_id))*100)
             ELSE 0 END AS response_rate
        FROM rfq_vendors rv
        JOIN vendors v ON v.id=rv.vendor_id
        LEFT JOIN quotations q ON q.vendor_id=rv.vendor_id AND q.rfq_id=rv.rfq_id
        JOIN rfqs r ON r.id=rv.rfq_id WHERE r.created_by=$1
        GROUP BY v.id, v.vendor_name ORDER BY quoted DESC LIMIT 5`, [uid]),
    ]);

    return res.json({ success:true, data:{
      rfqs:         rfqStats.rows[0],
      quotations:   quotStats.rows[0],
      approvals:    apprStats.rows[0],
      spend:        spendStats.rows[0],
      vendor_performance: vendorPerf.rows,
    }});
  } catch(err) {
    console.error('Analytics error:', err.message);
    return res.status(500).json({ success:false, message:'Failed to load analytics.' });
  }
};

// GET /api/procurement/reports/:type
exports.generateReport = async (req, res) => {
  const uid = req.user.id;
  const { type } = req.params;
  const { from, to, status, vendor, format='json' } = req.query;

  let query, params;

  const dateWhere = (alias='created_at', idx=1) => {
    const conds = []; const ps = [];
    let i = idx;
    if (from) { conds.push(`${alias} >= $${i}`); ps.push(from); i++; }
    if (to)   { conds.push(`${alias} <= $${i}`); ps.push(to); i++; }
    return { conds, ps, idx: i };
  };

  try {
    let rows = [];

    if (type === 'rfqs') {
      let where = 'WHERE r.created_by=$1'; params = [uid]; let idx=2;
      if (from)   { where += ` AND r.created_at>=$${idx}`; params.push(from); idx++; }
      if (to)     { where += ` AND r.created_at<=$${idx}`; params.push(to); idx++; }
      if (status) { where += ` AND r.status=$${idx}`; params.push(status); idx++; }
      const r = await pool.query(`SELECT r.id, r.title, r.product_category, r.quantity, r.expected_budget,
        r.delivery_location, r.deadline, r.status,
        (SELECT COUNT(*) FROM rfq_vendors rv WHERE rv.rfq_id=r.id) AS vendors,
        (SELECT COUNT(*) FROM quotations q WHERE q.rfq_id=r.id) AS quotations,
        r.created_at FROM rfqs r ${where} ORDER BY r.created_at DESC`, params);
      rows = r.rows;

    } else if (type === 'quotations') {
      let where = 'WHERE r.created_by=$1'; params=[uid]; let idx=2;
      if (from) { where += ` AND q.submitted_at>=$${idx}`; params.push(from); idx++; }
      if (to)   { where += ` AND q.submitted_at<=$${idx}`; params.push(to); idx++; }
      if (vendor) { where += ` AND v.vendor_name ILIKE $${idx}`; params.push(`%${vendor}%`); idx++; }
      if (status) { where += ` AND q.status=$${idx}`; params.push(status); idx++; }
      const r = await pool.query(`SELECT r.title AS rfq_title, v.vendor_name,
        COALESCE(q.quoted_amount,q.amount) AS amount, q.delivery_days, q.remarks, q.status, q.submitted_at
        FROM quotations q JOIN rfqs r ON r.id=q.rfq_id JOIN vendors v ON v.id=q.vendor_id
        ${where} ORDER BY q.submitted_at DESC`, params);
      rows = r.rows;

    } else if (type === 'purchase_orders') {
      let where = 'WHERE po.created_by=$1'; params=[uid]; let idx=2;
      if (from) { where += ` AND po.created_at>=$${idx}`; params.push(from); idx++; }
      if (to)   { where += ` AND po.created_at<=$${idx}`; params.push(to); idx++; }
      if (status) { where += ` AND po.status=$${idx}`; params.push(status); idx++; }
      if (vendor) { where += ` AND v.vendor_name ILIKE $${idx}`; params.push(`%${vendor}%`); idx++; }
      const r = await pool.query(`SELECT po.po_number, v.vendor_name, r.title AS rfq_title,
        po.amount, po.currency, po.status, po.issued_at, po.delivery_date
        FROM purchase_orders po LEFT JOIN vendors v ON v.id=po.vendor_id
        LEFT JOIN rfqs r ON r.id=po.rfq_id ${where} ORDER BY po.created_at DESC`, params);
      rows = r.rows;

    } else if (type === 'invoices') {
      let where = 'WHERE po.created_by=$1'; params=[uid]; let idx=2;
      if (from) { where += ` AND i.created_at>=$${idx}`; params.push(from); idx++; }
      if (to)   { where += ` AND i.created_at<=$${idx}`; params.push(to); idx++; }
      if (status) { where += ` AND i.status=$${idx}`; params.push(status); idx++; }
      const r = await pool.query(`SELECT i.invoice_number, v.vendor_name, po.po_number,
        i.amount, i.tax_amount, i.total_amount, i.status, i.due_date, i.created_at
        FROM invoices i JOIN purchase_orders po ON po.id=i.po_id
        LEFT JOIN vendors v ON v.id=i.vendor_id ${where} ORDER BY i.created_at DESC`, params);
      rows = r.rows;

    } else if (type === 'approvals') {
      let where = 'WHERE r.created_by=$1'; params=[uid]; let idx=2;
      if (from) { where += ` AND a.requested_at>=$${idx}`; params.push(from); idx++; }
      if (to)   { where += ` AND a.requested_at<=$${idx}`; params.push(to); idx++; }
      if (status) { where += ` AND a.status=$${idx}`; params.push(status); idx++; }
      const r = await pool.query(`SELECT r.title AS rfq_title, v.vendor_name AS preferred_vendor,
        u.full_name AS manager, a.status, a.notes, a.requested_at, a.resolved_at
        FROM approvals a JOIN rfqs r ON r.id=a.rfq_id
        LEFT JOIN vendors v ON v.id=a.preferred_vendor_id
        LEFT JOIN users u ON u.id=a.manager_id ${where} ORDER BY a.requested_at DESC`, params);
      rows = r.rows;

    } else {
      return res.status(400).json({ success:false, message:`Unknown report type: ${type}` });
    }

    if (format === 'csv') {
      const csv = toCSV(rows);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${type}_report_${new Date().toISOString().slice(0,10)}.csv"`);
      return res.send(csv);
    }

    return res.json({ success:true, type, total:rows.length, data:rows });
  } catch(err) {
    console.error('Report error:', err.message);
    return res.status(500).json({ success:false, message:'Failed to generate report.' });
  }
};
