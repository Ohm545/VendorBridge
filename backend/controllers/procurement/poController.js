/**
 * Procurement — Purchase Order Controller
 */
const pool    = require('../../config/db');
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

async function sendPoEmail(to, vendorName, po, rfqTitle) {
  try {
    await mailer().sendMail({
      from: process.env.EMAIL_FROM||'"VendorBridge" <noreply@vendorbridge.com>',
      to, subject: `Purchase Order Generated: ${po.po_number}`,
      html: `<div style="font-family:Inter,Arial,sans-serif;background:#f8fafc;padding:40px 20px;">
        <div style="background:#fff;border-radius:16px;padding:36px;max-width:520px;margin:0 auto;border:1px solid #e2e8f0;">
          <h2 style="color:#0a0f1e;margin:0 0 8px;">Purchase Order: ${po.po_number}</h2>
          <p style="color:#64748b;">Hi ${vendorName},</p>
          <p style="color:#64748b;">A Purchase Order has been generated for you.</p>
          <div style="background:#f1f5f9;border-radius:10px;padding:16px 20px;margin:20px 0;">
            <p style="margin:0 0 6px;color:#334155;font-size:13px;"><strong>PO Number:</strong> ${po.po_number}</p>
            <p style="margin:0 0 6px;color:#334155;font-size:13px;"><strong>RFQ:</strong> ${rfqTitle}</p>
            <p style="margin:0 0 6px;color:#334155;font-size:13px;"><strong>Amount:</strong> ₹${parseFloat(po.amount).toLocaleString('en-IN')}</p>
            ${po.delivery_date?`<p style="margin:0;color:#334155;font-size:13px;"><strong>Expected Delivery:</strong> ${new Date(po.delivery_date).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'})}</p>`:''}
          </div>
          <p style="color:#64748b;font-size:13px;">Please log in to acknowledge this purchase order.</p>
          <a href="${process.env.FRONTEND_URL}/pages/login.html"
             style="display:inline-block;background:#0a0f1e;color:#fff;padding:12px 22px;border-radius:10px;text-decoration:none;font-weight:600;">
            View Purchase Order</a>
        </div></div>`,
    });
  } catch(e) { console.error('PO email error:', e.message); }
}

function generatePoNumber() {
  const d = new Date();
  return `PO-${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}-${Math.floor(Math.random()*90000+10000)}`;
}

// GET /api/procurement/purchase-orders
exports.getPOs = async (req, res) => {
  const uid = req.user.id;
  try {
    const page   = Math.max(1, parseInt(req.query.page)||1);
    const limit  = Math.min(50, Math.max(1, parseInt(req.query.limit)||15));
    const offset = (page-1)*limit;
    const { status, search } = req.query;

    let where = 'WHERE po.created_by=$1';
    const params = [uid];
    let idx = 2;
    if (status) { where += ` AND po.status=$${idx}`; params.push(status); idx++; }
    if (search) { where += ` AND (po.po_number ILIKE $${idx} OR v.vendor_name ILIKE $${idx})`; params.push(`%${search}%`); idx++; }

    const countRes = await pool.query(`SELECT COUNT(*) FROM purchase_orders po LEFT JOIN vendors v ON v.id=po.vendor_id ${where}`, params);
    const total = parseInt(countRes.rows[0].count);

    const result = await pool.query(
      `SELECT po.*, v.vendor_name, v.email AS vendor_email,
         r.title AS rfq_title, r.product_category,
         (SELECT i.invoice_number FROM invoices i WHERE i.po_id=po.id LIMIT 1) AS invoice_number
       FROM purchase_orders po
       LEFT JOIN vendors v ON v.id=po.vendor_id
       LEFT JOIN rfqs r ON r.id=po.rfq_id
       ${where}
       ORDER BY po.created_at DESC
       LIMIT $${idx} OFFSET $${idx+1}`,
      [...params, limit, offset]
    );
    return res.json({ success:true, data:{ purchase_orders:result.rows, pagination:{ total, page, limit, pages:Math.ceil(total/limit) } } });
  } catch(err) {
    console.error('Get POs error:', err.message);
    return res.status(500).json({ success:false, message:'Failed to fetch purchase orders.' });
  }
};

// GET /api/procurement/purchase-orders/:id
exports.getPOById = async (req, res) => {
  const uid = req.user.id;
  try {
    const result = await pool.query(
      `SELECT po.*, v.vendor_name, v.email AS vendor_email, v.contact_person,
         r.title AS rfq_title, r.product_category, r.quantity,
         u.full_name AS approved_by_name,
         (SELECT i.* FROM invoices i WHERE i.po_id=po.id LIMIT 1) AS invoice
       FROM purchase_orders po
       LEFT JOIN vendors v ON v.id=po.vendor_id
       LEFT JOIN rfqs r ON r.id=po.rfq_id
       LEFT JOIN users u ON u.id=po.approved_by
       WHERE po.id=$1 AND po.created_by=$2`, [req.params.id, uid]
    );
    if (!result.rows.length) return res.status(404).json({ success:false, message:'Purchase order not found.' });
    return res.json({ success:true, purchase_order:result.rows[0] });
  } catch(err) {
    return res.status(500).json({ success:false, message:'Failed to fetch PO.' });
  }
};

// POST /api/procurement/purchase-orders — generate from approved RFQ
exports.generatePO = async (req, res) => {
  const uid = req.user.id;
  const { rfq_id, delivery_date, terms, notes } = req.body;
  if (!rfq_id) return res.status(422).json({ success:false, message:'RFQ ID is required.' });

  try {
    // Verify RFQ is approved
    const rfqRes = await pool.query('SELECT * FROM rfqs WHERE id=$1 AND created_by=$2', [rfq_id, uid]);
    if (!rfqRes.rows.length) return res.status(404).json({ success:false, message:'RFQ not found.' });
    const rfq = rfqRes.rows[0];

    if (rfq.status !== 'approved') {
      return res.status(400).json({ success:false, message:`RFQ must be approved before generating PO. Current status: ${rfq.status}` });
    }
    if (!rfq.preferred_vendor_id) {
      return res.status(400).json({ success:false, message:'No preferred vendor set for this RFQ.' });
    }

    // Check if PO already exists
    const existingPo = await pool.query('SELECT id FROM purchase_orders WHERE rfq_id=$1', [rfq_id]);
    if (existingPo.rows.length) {
      return res.status(409).json({ success:false, message:'A purchase order already exists for this RFQ.' });
    }

    // Get approved quotation amount
    const quoteRes = await pool.query(
      `SELECT COALESCE(quoted_amount, amount) AS amount FROM quotations
       WHERE rfq_id=$1 AND vendor_id=$2 ORDER BY submitted_at DESC LIMIT 1`,
      [rfq_id, rfq.preferred_vendor_id]
    );
    const amount = quoteRes.rows.length ? parseFloat(quoteRes.rows[0].amount) : (rfq.expected_budget || 0);

    // Get approval reference
    const apprRes = await pool.query(`SELECT approved_by FROM approvals WHERE rfq_id=$1 AND status='approved' LIMIT 1`, [rfq_id]);

    let poNumber;
    let attempts = 0;
    do {
      poNumber = generatePoNumber();
      const exists = await pool.query('SELECT id FROM purchase_orders WHERE po_number=$1', [poNumber]);
      if (!exists.rows.length) break;
      attempts++;
    } while (attempts < 5);

    const poRes = await pool.query(
      `INSERT INTO purchase_orders (po_number, rfq_id, vendor_id, quotation_id, created_by, approved_by, amount, currency, status, delivery_date, terms, notes)
       VALUES ($1,$2,$3,
         (SELECT id FROM quotations WHERE rfq_id=$2 AND vendor_id=$3 ORDER BY submitted_at DESC LIMIT 1),
         $4,$5,$6,'INR','issued',$7,$8,$9)
       RETURNING *`,
      [poNumber, rfq_id, rfq.preferred_vendor_id, uid, apprRes.rows[0]?.approved_by||null, amount, delivery_date||null, terms||null, notes||null]
    );
    const po = poRes.rows[0];

    // Update RFQ status
    await pool.query(`UPDATE rfqs SET status='po_generated', updated_at=NOW() WHERE id=$1`, [rfq_id]);

    // Notify vendor
    const vendorRes = await pool.query('SELECT email, contact_person, vendor_name FROM vendors WHERE id=$1', [rfq.preferred_vendor_id]);
    if (vendorRes.rows.length) {
      const v = vendorRes.rows[0];
      await createNotification({
        userId: (await pool.query('SELECT id FROM users WHERE email=$1', [v.email])).rows[0]?.id,
        title: 'Purchase Order Generated',
        message: `PO ${poNumber} has been issued for RFQ: ${rfq.title}`,
        type: 'success'
      }).catch(()=>{});
      sendPoEmail(v.email, v.contact_person||v.vendor_name, po, rfq.title).catch(()=>{});
    }

    await log({ userId:uid, action:'PO_GENERATED', entityType:'purchase_order', entityId:po.id, description:`Generated PO ${poNumber} for RFQ: ${rfq.title}` });

    return res.status(201).json({ success:true, message:`Purchase Order ${poNumber} generated.`, purchase_order:po });
  } catch(err) {
    console.error('Generate PO error:', err.message);
    return res.status(500).json({ success:false, message:'Failed to generate purchase order.' });
  }
};
