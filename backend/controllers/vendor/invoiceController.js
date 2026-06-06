/**
 * Vendor Invoice Controller
 */
const pool = require('../../config/db');
const { getVendorId } = require('./dashboardController');
const { log } = require('../../services/activityLogger');

exports.getInvoices = async (req, res) => {
  const uid = req.user.id;
  try {
    const vid = await getVendorId(uid);
    if (!vid) return res.status(404).json({ success: false, message: 'Vendor not found.' });

    const page   = Math.max(1, parseInt(req.query.page)||1);
    const limit  = Math.min(50, parseInt(req.query.limit)||15);
    const offset = (page-1)*limit;
    const { status } = req.query;

    let where = 'WHERE i.vendor_id=$1';
    const params = [vid];
    let idx = 2;
    if (status) { where += ` AND i.status=$${idx}`; params.push(status); idx++; }

    const countRes = await pool.query(`SELECT COUNT(*) FROM invoices i ${where}`, params);
    const total = parseInt(countRes.rows[0].count);

    const result = await pool.query(`SELECT i.*, po.po_number, r.title AS rfq_title
      FROM invoices i
      LEFT JOIN purchase_orders po ON po.id=i.po_id
      LEFT JOIN rfqs r ON r.id=po.rfq_id
      ${where} ORDER BY i.created_at DESC
      LIMIT $${idx} OFFSET $${idx+1}`, [...params, limit, offset]);

    return res.json({ success: true, data: { invoices: result.rows, pagination: { total, page, limit, pages: Math.ceil(total/limit) } } });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to load invoices.' });
  }
};

exports.getInvoiceById = async (req, res) => {
  const uid = req.user.id;
  try {
    const vid = await getVendorId(uid);
    if (!vid) return res.status(404).json({ success: false, message: 'Vendor not found.' });

    const result = await pool.query(`SELECT i.*, po.po_number, po.amount AS po_amount, po.terms, po.delivery_date,
        r.title AS rfq_title, r.product_category,
        v.vendor_name, v.company_name, v.gst_number, v.contact_person, v.email AS vendor_email, v.address,
        s.company_name AS buyer_company, s.default_currency, s.tax_percentage, s.support_email
      FROM invoices i
      LEFT JOIN purchase_orders po ON po.id=i.po_id
      LEFT JOIN rfqs r ON r.id=po.rfq_id
      LEFT JOIN vendors v ON v.id=i.vendor_id
      LEFT JOIN settings s ON TRUE
      WHERE i.id=$1 AND i.vendor_id=$2`, [req.params.id, vid]);

    if (!result.rows.length) return res.status(404).json({ success: false, message: 'Invoice not found.' });

    await log({ userId: uid, action: 'INVOICE_VIEWED', entityType: 'invoice', entityId: req.params.id,
      description: `Vendor viewed invoice: ${result.rows[0].invoice_number}` });

    return res.json({ success: true, invoice: result.rows[0] });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to load invoice.' });
  }
};
