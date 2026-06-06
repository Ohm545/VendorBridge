/**
 * Vendor Purchase Orders Controller
 */
const pool = require('../../config/db');
const { getVendorId } = require('./dashboardController');
const { log } = require('../../services/activityLogger');

exports.getPOs = async (req, res) => {
  const uid = req.user.id;
  try {
    const vid = await getVendorId(uid);
    if (!vid) return res.status(404).json({ success: false, message: 'Vendor not found.' });

    const page   = Math.max(1, parseInt(req.query.page)||1);
    const limit  = Math.min(50, parseInt(req.query.limit)||15);
    const offset = (page-1)*limit;
    const { status, search } = req.query;

    let where = 'WHERE po.vendor_id=$1';
    const params = [vid];
    let idx = 2;
    if (status) { where += ` AND po.status=$${idx}`; params.push(status); idx++; }
    if (search) { where += ` AND (po.po_number ILIKE $${idx} OR r.title ILIKE $${idx})`; params.push(`%${search}%`); idx++; }

    const countRes = await pool.query(`SELECT COUNT(*) FROM purchase_orders po LEFT JOIN rfqs r ON r.id=po.rfq_id ${where}`, params);
    const total = parseInt(countRes.rows[0].count);

    const result = await pool.query(`SELECT po.*, r.title AS rfq_title, r.product_category, r.quantity,
        u.full_name AS issued_by_name,
        (SELECT i.invoice_number FROM invoices i WHERE i.po_id=po.id LIMIT 1) AS invoice_number
      FROM purchase_orders po
      LEFT JOIN rfqs r ON r.id=po.rfq_id
      LEFT JOIN users u ON u.id=po.created_by
      ${where} ORDER BY po.created_at DESC
      LIMIT $${idx} OFFSET $${idx+1}`,
      [...params, limit, offset]);

    return res.json({ success: true, data: { purchase_orders: result.rows, pagination: { total, page, limit, pages: Math.ceil(total/limit) } } });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to load purchase orders.' });
  }
};

exports.getPOById = async (req, res) => {
  const uid = req.user.id;
  try {
    const vid = await getVendorId(uid);
    if (!vid) return res.status(404).json({ success: false, message: 'Vendor not found.' });

    const result = await pool.query(`SELECT po.*, r.title AS rfq_title, r.description AS rfq_description,
        r.product_category, r.quantity, r.delivery_location,
        u.full_name AS issued_by_name, u.email AS issued_by_email,
        v.vendor_name, v.company_name, v.gst_number, v.contact_person, v.email AS vendor_email, v.address,
        ab.full_name AS approved_by_name,
        s.company_name AS company, s.default_currency, s.tax_percentage
      FROM purchase_orders po
      LEFT JOIN rfqs r ON r.id=po.rfq_id
      LEFT JOIN vendors v ON v.id=po.vendor_id
      LEFT JOIN users u ON u.id=po.created_by
      LEFT JOIN users ab ON ab.id=po.approved_by
      LEFT JOIN settings s ON TRUE
      WHERE po.id=$1 AND po.vendor_id=$2`, [req.params.id, vid]);

    if (!result.rows.length) return res.status(404).json({ success: false, message: 'PO not found or not accessible.' });

    const invoice = await pool.query(`SELECT * FROM invoices WHERE po_id=$1`, [req.params.id]);

    await log({ userId: uid, action: 'PO_VIEWED', entityType: 'purchase_order', entityId: req.params.id,
      description: `Vendor viewed PO: ${result.rows[0].po_number}` });

    return res.json({ success: true, purchase_order: result.rows[0], invoice: invoice.rows[0]||null });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to load PO.' });
  }
};
