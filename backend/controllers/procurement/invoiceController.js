/**
 * Procurement — Invoice Controller
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

async function sendInvoiceEmail(to, vendorName, inv) {
  try {
    await mailer().sendMail({
      from: process.env.EMAIL_FROM||'"VendorBridge" <noreply@vendorbridge.com>',
      to, subject: `Invoice Generated: ${inv.invoice_number}`,
      html: `<div style="font-family:Inter,Arial,sans-serif;background:#f8fafc;padding:40px 20px;">
        <div style="background:#fff;border-radius:16px;padding:36px;max-width:520px;margin:0 auto;border:1px solid #e2e8f0;">
          <h2 style="color:#0a0f1e;margin:0 0 8px;">Invoice: ${inv.invoice_number}</h2>
          <p style="color:#64748b;">Hi ${vendorName},</p>
          <p style="color:#64748b;">An invoice has been generated for your recent delivery.</p>
          <div style="background:#f1f5f9;border-radius:10px;padding:16px 20px;margin:20px 0;">
            <div style="display:flex;justify-content:space-between;font-size:13px;color:#334155;margin-bottom:6px;"><span>Amount</span><span>₹${parseFloat(inv.amount).toLocaleString('en-IN')}</span></div>
            <div style="display:flex;justify-content:space-between;font-size:13px;color:#334155;margin-bottom:6px;"><span>Tax (${parseFloat(inv.tax_rate||18)}%)</span><span>₹${parseFloat(inv.tax_amount).toLocaleString('en-IN')}</span></div>
            <div style="display:flex;justify-content:space-between;font-size:14px;color:#0a0f1e;font-weight:700;border-top:1px solid #e2e8f0;padding-top:8px;"><span>Total</span><span>₹${parseFloat(inv.total_amount).toLocaleString('en-IN')}</span></div>
          </div>
          <a href="${process.env.FRONTEND_URL}/pages/login.html"
             style="display:inline-block;background:#0a0f1e;color:#fff;padding:12px 22px;border-radius:10px;text-decoration:none;font-weight:600;">
            View Invoice</a>
        </div></div>`,
    });
  } catch(e) { console.error('Invoice email error:', e.message); }
}

function generateInvNumber() {
  const d = new Date();
  return `INV-${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}-${Math.floor(Math.random()*90000+10000)}`;
}

// GET /api/procurement/invoices
exports.getInvoices = async (req, res) => {
  const uid = req.user.id;
  try {
    const page   = Math.max(1, parseInt(req.query.page)||1);
    const limit  = Math.min(50, parseInt(req.query.limit)||15);
    const offset = (page-1)*limit;
    const { status, search } = req.query;

    let where = 'WHERE po.created_by=$1';
    const params = [uid];
    let idx = 2;
    if (status) { where += ` AND i.status=$${idx}`; params.push(status); idx++; }
    if (search) { where += ` AND (i.invoice_number ILIKE $${idx} OR v.vendor_name ILIKE $${idx})`; params.push(`%${search}%`); idx++; }

    const countRes = await pool.query(
      `SELECT COUNT(*) FROM invoices i JOIN purchase_orders po ON po.id=i.po_id LEFT JOIN vendors v ON v.id=i.vendor_id ${where}`, params
    );
    const total = parseInt(countRes.rows[0].count);

    const result = await pool.query(
      `SELECT i.*, v.vendor_name, v.email AS vendor_email,
         po.po_number, r.title AS rfq_title
       FROM invoices i
       JOIN purchase_orders po ON po.id=i.po_id
       LEFT JOIN vendors v ON v.id=i.vendor_id
       LEFT JOIN rfqs r ON r.id=po.rfq_id
       ${where}
       ORDER BY i.created_at DESC
       LIMIT $${idx} OFFSET $${idx+1}`,
      [...params, limit, offset]
    );
    return res.json({ success:true, data:{ invoices:result.rows, pagination:{ total, page, limit, pages:Math.ceil(total/limit) } } });
  } catch(err) {
    console.error('Get invoices error:', err.message);
    return res.status(500).json({ success:false, message:'Failed to fetch invoices.' });
  }
};

// POST /api/procurement/invoices — generate from PO
exports.generateInvoice = async (req, res) => {
  const uid = req.user.id;
  const { po_id, due_date, notes } = req.body;
  if (!po_id) return res.status(422).json({ success:false, message:'PO ID is required.' });

  try {
    const poRes = await pool.query(
      `SELECT po.*, v.email AS vendor_email, v.contact_person, v.vendor_name,
         r.title AS rfq_title
       FROM purchase_orders po
       LEFT JOIN vendors v ON v.id=po.vendor_id
       LEFT JOIN rfqs r ON r.id=po.rfq_id
       WHERE po.id=$1 AND po.created_by=$2`, [po_id, uid]
    );
    if (!poRes.rows.length) return res.status(404).json({ success:false, message:'Purchase order not found.' });
    const po = poRes.rows[0];

    if (!['issued','acknowledged','delivered'].includes(po.status)) {
      return res.status(400).json({ success:false, message:`Cannot generate invoice for PO in ${po.status} status.` });
    }

    // Check if invoice already exists
    const existingInv = await pool.query('SELECT id FROM invoices WHERE po_id=$1', [po_id]);
    if (existingInv.rows.length) {
      return res.status(409).json({ success:false, message:'An invoice already exists for this PO.' });
    }

    // Get tax rate from settings
    const settingsRes = await pool.query('SELECT tax_percentage FROM settings LIMIT 1');
    const taxRate  = parseFloat(settingsRes.rows[0]?.tax_percentage || 18);
    const amount   = parseFloat(po.amount);
    const taxAmt   = parseFloat((amount * taxRate / 100).toFixed(2));
    const totalAmt = parseFloat((amount + taxAmt).toFixed(2));

    let invNumber;
    let attempts = 0;
    do {
      invNumber = generateInvNumber();
      const exists = await pool.query('SELECT id FROM invoices WHERE invoice_number=$1', [invNumber]);
      if (!exists.rows.length) break;
      attempts++;
    } while (attempts < 5);

    const dueDate = due_date || new Date(Date.now() + 30*24*60*60*1000).toISOString();

    const invRes = await pool.query(
      `INSERT INTO invoices (invoice_number, po_id, vendor_id, amount, tax_amount, total_amount, currency, status, due_date, notes, generated_at)
       VALUES ($1,$2,$3,$4,$5,$6,'INR','pending',$7,$8,NOW())
       RETURNING *`,
      [invNumber, po_id, po.vendor_id, amount, taxAmt, totalAmt, dueDate, notes||null]
    );
    const inv = { ...invRes.rows[0], tax_rate: taxRate };

    // Update RFQ status
    if (po.rfq_id) {
      await pool.query(`UPDATE rfqs SET status='invoice_generated', updated_at=NOW() WHERE id=$1`, [po.rfq_id]);
    }

    // Notify vendor
    if (po.vendor_email) {
      const vendorUserRes = await pool.query('SELECT id FROM users WHERE email=$1', [po.vendor_email]);
      if (vendorUserRes.rows.length) {
        await createNotification({ userId:vendorUserRes.rows[0].id, title:'Invoice Generated', message:`Invoice ${invNumber} has been issued.`, type:'info' }).catch(()=>{});
      }
      sendInvoiceEmail(po.vendor_email, po.contact_person||po.vendor_name, inv).catch(()=>{});
    }

    await log({ userId:uid, action:'INVOICE_GENERATED', entityType:'invoice', entityId:inv.id, description:`Generated invoice ${invNumber} for PO: ${po.po_number}` });

    return res.status(201).json({ success:true, message:`Invoice ${invNumber} generated.`, invoice:inv });
  } catch(err) {
    console.error('Generate invoice error:', err.message);
    return res.status(500).json({ success:false, message:'Failed to generate invoice.' });
  }
};

// GET /api/procurement/invoices/:id
exports.getInvoiceById = async (req, res) => {
  const uid = req.user.id;
  try {
    const result = await pool.query(
      `SELECT i.*, v.vendor_name, v.email AS vendor_email, v.contact_person, v.address,
         po.po_number, po.amount AS po_amount, po.terms,
         r.title AS rfq_title, r.product_category,
         s.company_name, s.default_currency, s.tax_percentage
       FROM invoices i
       JOIN purchase_orders po ON po.id=i.po_id
       LEFT JOIN vendors v ON v.id=i.vendor_id
       LEFT JOIN rfqs r ON r.id=po.rfq_id
       LEFT JOIN settings s ON TRUE
       WHERE i.id=$1 AND po.created_by=$2`, [req.params.id, uid]
    );
    if (!result.rows.length) return res.status(404).json({ success:false, message:'Invoice not found.' });
    return res.json({ success:true, invoice:result.rows[0] });
  } catch(err) {
    return res.status(500).json({ success:false, message:'Failed to fetch invoice.' });
  }
};
