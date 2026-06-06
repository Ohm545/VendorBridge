/**
 * Manager Reports Controller
 */
const pool = require('../../config/db');
const { log } = require('../../services/activityLogger');

function toCSV(rows) {
  if (!rows.length) return '';
  const h = Object.keys(rows[0]);
  return [h.join(','), ...rows.map(r => h.map(k => {
    const v = r[k] == null ? '' : String(r[k]);
    return v.includes(',') || v.includes('"') ? `"${v.replace(/"/g,'""')}"` : v;
  }).join(','))].join('\n');
}

exports.generateReport = async (req, res) => {
  const mid = req.user.id;
  const { type } = req.params;
  const { from, to, status, vendor, officer, category, format = 'json' } = req.query;

  let rows = [];
  try {
    if (type === 'approvals') {
      let w = 'WHERE a.manager_id=$1'; const p = [mid]; let i = 2;
      if (from) { w += ` AND a.requested_at>=$${i}`; p.push(from); i++; }
      if (to)   { w += ` AND a.requested_at<=$${i}`; p.push(to);   i++; }
      if (status) { w += ` AND a.status=$${i}`; p.push(status); i++; }
      if (vendor) { w += ` AND v.vendor_name ILIKE $${i}`; p.push(`%${vendor}%`); i++; }
      const r = await pool.query(`SELECT r.title AS rfq_title, r.product_category, r.expected_budget,
        v.vendor_name AS preferred_vendor, u.full_name AS requested_by,
        a.status, a.priority, a.notes AS remarks, a.requested_at, a.approved_at
        FROM approvals a JOIN rfqs r ON r.id=a.rfq_id
        LEFT JOIN vendors v ON v.id=a.preferred_vendor_id
        LEFT JOIN users u ON u.id=a.requested_by
        ${w} ORDER BY a.requested_at DESC`, p);
      rows = r.rows;

    } else if (type === 'rfqs') {
      let w = 'WHERE 1=1'; const p = []; let i = 1;
      if (from) { w += ` AND r.created_at>=$${i}`; p.push(from); i++; }
      if (to)   { w += ` AND r.created_at<=$${i}`; p.push(to);   i++; }
      if (status) { w += ` AND r.status=$${i}`; p.push(status); i++; }
      if (category) { w += ` AND r.product_category=$${i}`; p.push(category); i++; }
      const r = await pool.query(`SELECT r.title, r.product_category, r.quantity, r.expected_budget,
        r.delivery_location, r.deadline, r.status, u.full_name AS created_by,
        (SELECT COUNT(*) FROM rfq_vendors rv WHERE rv.rfq_id=r.id) AS vendors,
        (SELECT COUNT(*) FROM quotations q WHERE q.rfq_id=r.id) AS quotations,
        r.created_at FROM rfqs r LEFT JOIN users u ON u.id=r.created_by ${w} ORDER BY r.created_at DESC`, p);
      rows = r.rows;

    } else if (type === 'vendors') {
      const r = await pool.query(`SELECT v.vendor_name, v.company_name, v.category, v.status,
        (SELECT COUNT(*) FROM rfq_vendors rv WHERE rv.vendor_id=v.id) AS assigned_rfqs,
        (SELECT COUNT(*) FROM quotations q WHERE q.vendor_id=v.id) AS quotations,
        (SELECT COUNT(*) FROM approvals a WHERE a.preferred_vendor_id=v.id AND a.manager_id=$1 AND a.status='approved') AS approvals
        FROM vendors v ORDER BY v.vendor_name`, [mid]);
      rows = r.rows;

    } else if (type === 'performance') {
      const r = await pool.query(`SELECT u.full_name AS officer, u.email,
        COUNT(DISTINCT rfq.id) AS rfqs, COUNT(DISTINCT a.id) AS requests,
        COUNT(DISTINCT a.id) FILTER (WHERE a.status='approved') AS approved,
        COUNT(DISTINCT a.id) FILTER (WHERE a.status='rejected') AS rejected
        FROM users u LEFT JOIN rfqs rfq ON rfq.created_by=u.id
        LEFT JOIN approvals a ON a.requested_by=u.id AND a.manager_id=$1
        WHERE u.role='procurement_officer' GROUP BY u.id, u.full_name, u.email ORDER BY rfqs DESC`, [mid]);
      rows = r.rows;

    } else if (type === 'workflow') {
      const r = await pool.query(`SELECT r.title, r.product_category, r.status,
        r.deadline, r.expected_budget, u.full_name AS created_by,
        CASE WHEN r.deadline < NOW() AND r.status NOT IN ('closed','cancelled','po_generated','invoice_generated') THEN 'Overdue'
             WHEN r.deadline BETWEEN NOW() AND NOW()+INTERVAL '3 days' THEN 'Due Soon'
             ELSE 'On Track' END AS health,
        (SELECT COUNT(*) FROM rfq_vendors rv WHERE rv.rfq_id=r.id) AS vendors_assigned,
        (SELECT COUNT(*) FROM quotations q WHERE q.rfq_id=r.id) AS quotes_received,
        r.created_at FROM rfqs r LEFT JOIN users u ON u.id=r.created_by ORDER BY r.created_at DESC`);
      rows = r.rows;

    } else {
      return res.status(400).json({ success: false, message: `Unknown report: ${type}` });
    }

    await log({ userId: mid, action: 'REPORT_GENERATED', entityType: 'report', entityId: null, description: `Manager generated ${type} report` });

    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${type}_report_${new Date().toISOString().slice(0,10)}.csv"`);
      return res.send(toCSV(rows));
    }
    return res.json({ success: true, type, total: rows.length, data: rows });
  } catch (err) {
    console.error('Report error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to generate report.' });
  }
};
