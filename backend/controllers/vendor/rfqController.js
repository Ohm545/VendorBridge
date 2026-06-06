/**
 * Vendor RFQ Controller — view only assigned RFQs
 */
const pool = require('../../config/db');
const { getVendorId } = require('./dashboardController');
const { log } = require('../../services/activityLogger');

exports.getAssignedRfqs = async (req, res) => {
  const uid = req.user.id;
  try {
    const vid = await getVendorId(uid);
    if (!vid) return res.status(404).json({ success: false, message: 'Vendor not found.' });

    const page   = Math.max(1, parseInt(req.query.page)||1);
    const limit  = Math.min(50, parseInt(req.query.limit)||15);
    const offset = (page-1)*limit;
    const { status, category, search, from, to } = req.query;

    let where = 'WHERE rv.vendor_id=$1';
    const params = [vid];
    let idx = 2;
    if (status)   { where += ` AND r.status=$${idx}`;   params.push(status);   idx++; }
    if (category) { where += ` AND r.product_category=$${idx}`; params.push(category); idx++; }
    if (search)   { where += ` AND r.title ILIKE $${idx}`; params.push(`%${search}%`); idx++; }
    if (from)     { where += ` AND rv.assigned_at>=$${idx}`; params.push(from); idx++; }
    if (to)       { where += ` AND rv.assigned_at<=$${idx}`; params.push(to);   idx++; }

    const countRes = await pool.query(`SELECT COUNT(*) FROM rfq_vendors rv JOIN rfqs r ON r.id=rv.rfq_id ${where}`, params);
    const total = parseInt(countRes.rows[0].count);

    const result = await pool.query(`
      SELECT r.id, r.title, r.description, r.product_category, r.quantity, r.expected_budget,
        r.delivery_location, r.deadline, r.status, r.notes,
        rv.assigned_at, rv.status AS assignment_status,
        q.id AS quote_id, q.quoted_amount, q.delivery_days, q.status AS quote_status, q.submitted_at,
        CASE WHEN r.deadline < NOW() THEN true ELSE false END AS is_expired
      FROM rfq_vendors rv
      JOIN rfqs r ON r.id=rv.rfq_id
      LEFT JOIN quotations q ON q.rfq_id=r.id AND q.vendor_id=$1
      ${where}
      ORDER BY
        CASE WHEN r.deadline < NOW() THEN 2 ELSE 1 END,
        r.deadline ASC NULLS LAST, rv.assigned_at DESC
      LIMIT $${idx} OFFSET $${idx+1}`,
      [...params, limit, offset]
    );

    return res.json({ success: true, data: { rfqs: result.rows, pagination: { total, page, limit, pages: Math.ceil(total/limit) } } });
  } catch (err) {
    console.error('Get vendor RFQs error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load RFQs.' });
  }
};

exports.getRfqDetail = async (req, res) => {
  const uid = req.user.id;
  try {
    const vid = await getVendorId(uid);
    if (!vid) return res.status(404).json({ success: false, message: 'Vendor not found.' });

    // Verify assignment
    const assignRes = await pool.query(`SELECT rv.*, r.*
      FROM rfq_vendors rv JOIN rfqs r ON r.id=rv.rfq_id
      WHERE rv.rfq_id=$1 AND rv.vendor_id=$2`, [req.params.id, vid]);
    if (!assignRes.rows.length) return res.status(403).json({ success: false, message: 'RFQ not assigned to you.' });
    const rfq = assignRes.rows[0];

    // My quotation for this RFQ
    const quoteRes = await pool.query(`SELECT * FROM quotations WHERE rfq_id=$1 AND vendor_id=$2`, [req.params.id, vid]);

    // PO for this RFQ (if any, for this vendor)
    const poRes = await pool.query(`SELECT po.*, u.full_name AS approved_by_name
      FROM purchase_orders po LEFT JOIN users u ON u.id=po.approved_by
      WHERE po.rfq_id=$1 AND po.vendor_id=$2`, [req.params.id, vid]);

    // Invoice
    const invRes = await pool.query(`SELECT i.* FROM invoices i
      JOIN purchase_orders po ON po.id=i.po_id
      WHERE po.rfq_id=$1 AND i.vendor_id=$2`, [req.params.id, vid]);

    await log({ userId: uid, action: 'RFQ_VIEWED', entityType: 'rfq', entityId: req.params.id,
      description: `Vendor viewed RFQ: ${rfq.title}` });

    return res.json({ success: true, rfq, quotation: quoteRes.rows[0]||null, purchase_order: poRes.rows[0]||null, invoice: invRes.rows[0]||null });
  } catch (err) {
    console.error('Get RFQ detail error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed.' });
  }
};

exports.getCategories = async (req, res) => {
  const uid = req.user.id;
  try {
    const vid = await getVendorId(uid);
    if (!vid) return res.json({ success: true, categories: [] });
    const r = await pool.query(`SELECT DISTINCT r.product_category FROM rfqs r
      JOIN rfq_vendors rv ON rv.rfq_id=r.id WHERE rv.vendor_id=$1 AND r.product_category IS NOT NULL ORDER BY r.product_category`, [vid]);
    return res.json({ success: true, categories: r.rows.map(x=>x.product_category) });
  } catch (err) { return res.status(500).json({ success: false, message: 'Failed.' }); }
};
