/**
 * Manager Workflow Monitoring Controller
 */
const pool = require('../../config/db');

exports.getWorkflowStats = async (req, res) => {
  try {
    const result = await pool.query(`SELECT
      COUNT(*) FILTER (WHERE status NOT IN ('closed','cancelled')) AS active_rfqs,
      COUNT(*) FILTER (WHERE status='active') AS waiting_quotes,
      COUNT(*) FILTER (WHERE status='pending_approval') AS pending_approval,
      COUNT(*) FILTER (WHERE status='approved') AS approved,
      COUNT(*) FILTER (WHERE status='po_generated') AS po_generated,
      COUNT(*) FILTER (WHERE status='invoice_generated') AS invoice_generated,
      COUNT(*) FILTER (WHERE status='active' AND deadline < NOW()) AS overdue,
      COUNT(*) FILTER (WHERE status='active' AND deadline BETWEEN NOW() AND NOW()+INTERVAL '3 days') AS due_soon
      FROM rfqs`);
    return res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to load workflow stats.' });
  }
};

exports.getPipeline = async (req, res) => {
  try {
    const page   = Math.max(1, parseInt(req.query.page)||1);
    const limit  = Math.min(50, parseInt(req.query.limit)||15);
    const offset = (page-1)*limit;
    const { status, search, health } = req.query;

    let where = 'WHERE 1=1';
    const params = [];
    let idx = 1;
    if (status) { where += ` AND r.status=$${idx}`; params.push(status); idx++; }
    if (search) { where += ` AND (r.title ILIKE $${idx} OR r.product_category ILIKE $${idx})`; params.push(`%${search}%`); idx++; }
    if (health === 'no_quotes') { where += ` AND r.status='active' AND NOT EXISTS (SELECT 1 FROM quotations q WHERE q.rfq_id=r.id)`; }
    if (health === 'overdue')   { where += ` AND r.deadline < NOW() AND r.status NOT IN ('closed','cancelled','po_generated','invoice_generated')`; }
    if (health === 'over_budget') { where += ` AND EXISTS (SELECT 1 FROM quotations q WHERE q.rfq_id=r.id AND COALESCE(q.quoted_amount,q.amount) > r.expected_budget)`; }

    const countRes = await pool.query(`SELECT COUNT(*) FROM rfqs r ${where}`, params);
    const total = parseInt(countRes.rows[0].count);

    const result = await pool.query(`
      SELECT r.id, r.title, r.product_category, r.quantity, r.expected_budget, r.deadline, r.status, r.created_at,
        u.full_name AS created_by_name,
        (SELECT COUNT(*) FROM rfq_vendors rv WHERE rv.rfq_id=r.id) AS vendor_count,
        (SELECT COUNT(*) FROM quotations q WHERE q.rfq_id=r.id) AS quotation_count,
        (SELECT MIN(COALESCE(q.quoted_amount,q.amount)) FROM quotations q WHERE q.rfq_id=r.id) AS min_quote,
        (SELECT po.po_number FROM purchase_orders po WHERE po.rfq_id=r.id LIMIT 1) AS po_number,
        (SELECT a.status FROM approvals a WHERE a.rfq_id=r.id ORDER BY a.requested_at DESC LIMIT 1) AS approval_status,
        CASE WHEN r.deadline < NOW() AND r.status NOT IN ('closed','cancelled','po_generated','invoice_generated') THEN 'overdue'
             WHEN r.deadline BETWEEN NOW() AND NOW()+INTERVAL '3 days' THEN 'due_soon'
             ELSE 'on_track' END AS health
      FROM rfqs r LEFT JOIN users u ON u.id=r.created_by
      ${where}
      ORDER BY
        CASE WHEN r.deadline < NOW() THEN 0 ELSE 1 END,
        r.deadline ASC NULLS LAST, r.created_at DESC
      LIMIT $${idx} OFFSET $${idx+1}`,
      [...params, limit, offset]
    );

    return res.json({ success: true, data: { rfqs: result.rows, pagination: { total, page, limit, pages: Math.ceil(total/limit) } } });
  } catch (err) {
    console.error('Pipeline error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load pipeline.' });
  }
};

exports.getRfqDetail = async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT r.*, u.full_name AS created_by_name,
        (SELECT COUNT(*) FROM rfq_vendors rv WHERE rv.rfq_id=r.id) AS vendor_count,
        (SELECT COUNT(*) FROM quotations q WHERE q.rfq_id=r.id) AS quotation_count
      FROM rfqs r LEFT JOIN users u ON u.id=r.created_by WHERE r.id=$1`, [req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ success: false, message: 'RFQ not found.' });

    const vendors = await pool.query(`SELECT rv.*, v.vendor_name, v.email, v.contact_person,
      q.id AS quote_id, COALESCE(q.quoted_amount,q.amount) AS quoted_amount, q.delivery_days, q.status AS quote_status, q.submitted_at
      FROM rfq_vendors rv JOIN vendors v ON v.id=rv.vendor_id
      LEFT JOIN quotations q ON q.rfq_id=rv.rfq_id AND q.vendor_id=rv.vendor_id
      WHERE rv.rfq_id=$1`, [req.params.id]);

    const approvals = await pool.query(`SELECT a.*, u.full_name AS manager_name, v.vendor_name AS preferred_vendor
      FROM approvals a LEFT JOIN users u ON u.id=a.manager_id LEFT JOIN vendors v ON v.id=a.preferred_vendor_id
      WHERE a.rfq_id=$1 ORDER BY a.requested_at DESC`, [req.params.id]);

    return res.json({ success: true, rfq: r.rows[0], vendors: vendors.rows, approvals: approvals.rows });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed.' });
  }
};
