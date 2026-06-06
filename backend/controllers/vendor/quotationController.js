/**
 * Vendor Quotation Controller
 */
const pool = require('../../config/db');
const { getVendorId } = require('./dashboardController');
const { log } = require('../../services/activityLogger');
const { createNotification } = require('../../services/notificationService');
const nodemailer = require('nodemailer');

function mailer() {
  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST, port: parseInt(process.env.EMAIL_PORT)||587,
    secure: process.env.EMAIL_SECURE==='true',
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
  });
}

async function notifyProcurementOfficer(rfqId, vendorName, rfqTitle, quotedAmount) {
  try {
    const officerRes = await pool.query(
      `SELECT u.id, u.full_name, u.email FROM rfqs r JOIN users u ON u.id=r.created_by WHERE r.id=$1`, [rfqId]
    );
    if (!officerRes.rows.length) return;
    const officer = officerRes.rows[0];
    await createNotification({ userId: officer.id, title: 'New Quotation Received',
      message: `${vendorName} submitted a quotation of ₹${parseFloat(quotedAmount).toLocaleString('en-IN')} for RFQ: ${rfqTitle}`,
      type: 'info', link: '/procurement/quotations' });
    await mailer().sendMail({
      from: process.env.EMAIL_FROM || '"VendorBridge" <noreply@vendorbridge.com>',
      to: officer.email,
      subject: `New Quotation: ${rfqTitle}`,
      html: `<div style="font-family:Inter,Arial,sans-serif;background:#f8fafc;padding:40px 20px;">
        <div style="background:#fff;border-radius:16px;padding:36px;max-width:520px;margin:0 auto;border:1px solid #e2e8f0;">
          <h2 style="color:#0a0f1e;margin:0 0 8px;">New Quotation Received</h2>
          <p style="color:#64748b;">Hi ${officer.full_name},</p>
          <div style="background:#f1f5f9;border-radius:10px;padding:16px 20px;margin:16px 0;">
            <p style="margin:0 0 6px;font-size:14px;color:#334155;"><strong>Vendor:</strong> ${vendorName}</p>
            <p style="margin:0 0 6px;font-size:14px;color:#334155;"><strong>RFQ:</strong> ${rfqTitle}</p>
            <p style="margin:0;font-size:14px;color:#334155;"><strong>Quoted Amount:</strong> ₹${parseFloat(quotedAmount).toLocaleString('en-IN')}</p>
          </div>
          <a href="${process.env.FRONTEND_URL}/procurement/quotations" style="display:inline-block;background:#0a0f1e;color:#fff;padding:12px 22px;border-radius:10px;text-decoration:none;font-weight:600;">
            View Quotations</a>
        </div></div>`,
    }).catch(()=>{});
  } catch(e) { console.error('Notify officer error:', e.message); }
}

// GET /api/vendor/quotations
exports.getMyQuotations = async (req, res) => {
  const uid = req.user.id;
  try {
    const vid = await getVendorId(uid);
    if (!vid) return res.status(404).json({ success: false, message: 'Vendor not found.' });

    const page   = Math.max(1, parseInt(req.query.page)||1);
    const limit  = Math.min(50, parseInt(req.query.limit)||15);
    const offset = (page-1)*limit;
    const { status, search } = req.query;

    let where = 'WHERE q.vendor_id=$1';
    const params = [vid];
    let idx = 2;
    if (status) { where += ` AND q.status=$${idx}`; params.push(status); idx++; }
    if (search) { where += ` AND r.title ILIKE $${idx}`; params.push(`%${search}%`); idx++; }

    const countRes = await pool.query(`SELECT COUNT(*) FROM quotations q JOIN rfqs r ON r.id=q.rfq_id ${where}`, params);
    const total = parseInt(countRes.rows[0].count);

    const result = await pool.query(`
      SELECT q.id, q.rfq_id, COALESCE(q.quoted_amount, q.amount) AS quoted_amount,
        q.delivery_days, q.remarks, q.attachment_url, q.status, q.submitted_at, q.updated_at,
        r.title AS rfq_title, r.product_category, r.deadline, r.status AS rfq_status,
        r.expected_budget,
        (SELECT po.po_number FROM purchase_orders po WHERE po.rfq_id=q.rfq_id AND po.vendor_id=q.vendor_id LIMIT 1) AS po_number,
        (SELECT i.invoice_number FROM invoices i JOIN purchase_orders po ON po.id=i.po_id WHERE po.rfq_id=q.rfq_id AND i.vendor_id=q.vendor_id LIMIT 1) AS invoice_number
      FROM quotations q JOIN rfqs r ON r.id=q.rfq_id
      ${where}
      ORDER BY q.submitted_at DESC
      LIMIT $${idx} OFFSET $${idx+1}`,
      [...params, limit, offset]
    );

    return res.json({ success: true, data: { quotations: result.rows, pagination: { total, page, limit, pages: Math.ceil(total/limit) } } });
  } catch (err) {
    console.error('Get quotations error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load quotations.' });
  }
};

// POST /api/vendor/quotations — submit
exports.submitQuotation = async (req, res) => {
  const uid = req.user.id;
  const { rfq_id, quoted_amount, delivery_days, remarks, attachment_url } = req.body;

  if (!rfq_id || !quoted_amount || !delivery_days) {
    return res.status(422).json({ success: false, message: 'Quoted amount and delivery days are required.' });
  }

  try {
    const vid = await getVendorId(uid);
    if (!vid) return res.status(404).json({ success: false, message: 'Vendor not found.' });

    // Verify assignment
    const assigned = await pool.query(`SELECT rv.*, r.title, r.deadline, r.status
      FROM rfq_vendors rv JOIN rfqs r ON r.id=rv.rfq_id
      WHERE rv.rfq_id=$1 AND rv.vendor_id=$2`, [rfq_id, vid]);
    if (!assigned.rows.length) return res.status(403).json({ success: false, message: 'You are not assigned to this RFQ.' });

    const rfq = assigned.rows[0];
    if (rfq.deadline && new Date() > new Date(rfq.deadline)) {
      return res.status(400).json({ success: false, message: 'RFQ deadline has passed. Quotations are no longer accepted.' });
    }
    if (!['active','draft'].includes(rfq.status)) {
      return res.status(400).json({ success: false, message: `Cannot submit quotation — RFQ status is ${rfq.status}.` });
    }

    // Check existing quotation
    const existing = await pool.query(`SELECT id, status FROM quotations WHERE rfq_id=$1 AND vendor_id=$2`, [rfq_id, vid]);
    if (existing.rows.length) {
      if (['approved','rejected'].includes(existing.rows[0].status)) {
        return res.status(409).json({ success: false, message: 'Your quotation has already been processed.' });
      }
      // Update existing
      const updated = await pool.query(`UPDATE quotations SET
        quoted_amount=$1, amount=$1, delivery_days=$2, remarks=$3,
        attachment_url=COALESCE($4,attachment_url), updated_at=NOW()
        WHERE id=$5 RETURNING *`,
        [parseFloat(quoted_amount), parseInt(delivery_days), remarks||null, attachment_url||null, existing.rows[0].id]);

      await log({ userId: uid, action: 'QUOTATION_UPDATED', entityType: 'quotation', entityId: existing.rows[0].id,
        description: `Vendor updated quotation for RFQ: ${rfq.title}` });

      return res.json({ success: true, message: 'Quotation updated successfully.', quotation: updated.rows[0] });
    }

    // Insert new quotation
    const result = await pool.query(`INSERT INTO quotations
      (rfq_id, vendor_id, quoted_amount, amount, delivery_days, remarks, attachment_url, status)
      VALUES ($1,$2,$3,$3,$4,$5,$6,'submitted') RETURNING *`,
      [rfq_id, vid, parseFloat(quoted_amount), parseInt(delivery_days), remarks||null, attachment_url||null]
    );
    const quotation = result.rows[0];

    // Update RFQ status to quotation_received
    await pool.query(`UPDATE rfqs SET status='quotation_received', updated_at=NOW() WHERE id=$1 AND status='active'`, [rfq_id]);

    // Update rfq_vendors status
    await pool.query(`UPDATE rfq_vendors SET status='responded' WHERE rfq_id=$1 AND vendor_id=$2`, [rfq_id, vid]);

    await log({ userId: uid, action: 'QUOTATION_SUBMITTED', entityType: 'quotation', entityId: quotation.id,
      description: `Vendor submitted quotation of ₹${quoted_amount} for RFQ: ${rfq.title}` });

    // Get vendor name for notification
    const vendorRes = await pool.query(`SELECT vendor_name FROM vendors WHERE id=$1`, [vid]);
    const vendorName = vendorRes.rows[0]?.vendor_name || 'Vendor';
    notifyProcurementOfficer(rfq_id, vendorName, rfq.title, quoted_amount).catch(()=>{});

    return res.status(201).json({ success: true, message: 'Quotation submitted successfully!', quotation });
  } catch (err) {
    console.error('Submit quotation error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to submit quotation.' });
  }
};

// PUT /api/vendor/quotations/:id — edit
exports.editQuotation = async (req, res) => {
  const uid = req.user.id;
  const { quoted_amount, delivery_days, remarks, attachment_url } = req.body;
  try {
    const vid = await getVendorId(uid);
    if (!vid) return res.status(404).json({ success: false, message: 'Vendor not found.' });

    const qRes = await pool.query(`SELECT q.*, r.deadline, r.title FROM quotations q
      JOIN rfqs r ON r.id=q.rfq_id WHERE q.id=$1 AND q.vendor_id=$2`, [req.params.id, vid]);
    if (!qRes.rows.length) return res.status(404).json({ success: false, message: 'Quotation not found.' });

    const q = qRes.rows[0];
    if (['approved','rejected'].includes(q.status)) {
      return res.status(400).json({ success: false, message: 'Cannot edit a processed quotation.' });
    }
    if (q.deadline && new Date() > new Date(q.deadline)) {
      return res.status(400).json({ success: false, message: 'RFQ deadline has passed.' });
    }

    const updated = await pool.query(`UPDATE quotations SET
      quoted_amount=COALESCE($1,quoted_amount), amount=COALESCE($1,amount),
      delivery_days=COALESCE($2,delivery_days), remarks=COALESCE($3,remarks),
      attachment_url=COALESCE($4,attachment_url), updated_at=NOW()
      WHERE id=$5 RETURNING *`,
      [quoted_amount?parseFloat(quoted_amount):null, delivery_days?parseInt(delivery_days):null, remarks, attachment_url, req.params.id]);

    await log({ userId: uid, action: 'QUOTATION_UPDATED', entityType: 'quotation', entityId: req.params.id,
      description: `Vendor edited quotation for RFQ: ${q.title}` });

    return res.json({ success: true, message: 'Quotation updated.', quotation: updated.rows[0] });
  } catch (err) {
    console.error('Edit quotation error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to edit quotation.' });
  }
};
