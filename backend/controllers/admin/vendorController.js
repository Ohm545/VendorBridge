/**
 * Admin Vendor Management Controller
 */

const bcrypt = require('bcryptjs');
const pool   = require('../../config/db');
const { generateTempPassword } = require('../../utils/passwordGen');
const { log }  = require('../../services/activityLogger');
const { notifyAdmins } = require('../../services/notificationService');
const nodemailer = require('nodemailer');

function getTransporter() {
  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST, port: parseInt(process.env.EMAIL_PORT) || 587,
    secure: process.env.EMAIL_SECURE === 'true',
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
  });
}

async function sendVendorWelcomeEmail(to, fullName, tempPw) {
  try {
    await getTransporter().sendMail({
      from: process.env.EMAIL_FROM || '"VendorBridge" <noreply@vendorbridge.com>',
      to, subject: 'Your VendorBridge Vendor Account',
      html: `<div style="font-family:Inter,Arial,sans-serif;background:#f8fafc;padding:40px 20px;">
        <div style="background:#fff;border-radius:16px;padding:40px;max-width:520px;margin:0 auto;border:1px solid #e2e8f0;">
          <h2 style="color:#0a0f1e;margin:0 0 8px;">Welcome to VendorBridge</h2>
          <p style="color:#64748b;">Hi ${fullName}, your vendor account has been created.</p>
          <div style="background:#f1f5f9;border-radius:10px;padding:16px 20px;margin:20px 0;">
            <p style="margin:0 0 8px;color:#334155;font-size:13px;"><strong>Email:</strong> ${to}</p>
            <p style="margin:0;color:#334155;font-size:13px;"><strong>Temporary Password:</strong>
              <code style="background:#e2e8f0;padding:2px 8px;border-radius:4px;">${tempPw}</code></p>
          </div>
          <p style="color:#dc2626;font-size:13px;">Please change your password after first login.</p>
          <a href="${process.env.FRONTEND_URL}/pages/login.html"
             style="display:inline-block;background:#0a0f1e;color:#fff;padding:13px 24px;border-radius:10px;text-decoration:none;font-weight:600;">
            Login to Vendor Portal</a>
        </div></div>`,
    });
  } catch (e) { console.error('Vendor email error:', e.message); }
}

// GET /api/admin/vendors
exports.getVendors = async (req, res) => {
  try {
    const page   = Math.max(1, parseInt(req.query.page) || 1);
    const limit  = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const offset = (page - 1) * limit;
    const search = (req.query.search || '').trim();
    const status = req.query.status || '';
    const category = req.query.category || '';

    let where = 'WHERE 1=1';
    const params = [];
    let idx = 1;

    if (search) {
      where += ` AND (v.vendor_name ILIKE $${idx} OR v.company_name ILIKE $${idx} OR v.email ILIKE $${idx} OR v.contact_person ILIKE $${idx})`;
      params.push(`%${search}%`); idx++;
    }
    if (status) { where += ` AND v.status = $${idx}`; params.push(status); idx++; }
    if (category) { where += ` AND v.category = $${idx}`; params.push(category); idx++; }

    const countRes = await pool.query(`SELECT COUNT(*) FROM vendors v ${where}`, params);
    const total = parseInt(countRes.rows[0].count);

    const vendorsRes = await pool.query(
      `SELECT v.*,
         (SELECT COUNT(*) FROM rfq_vendors rv WHERE rv.vendor_id = v.id) AS assigned_rfqs,
         (SELECT COUNT(*) FROM quotations q WHERE q.vendor_id = v.id) AS submitted_quotations
       FROM vendors v ${where}
       ORDER BY v.created_at DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, limit, offset]
    );

    return res.json({
      success: true,
      data: { vendors: vendorsRes.rows, pagination: { total, page, limit, pages: Math.ceil(total / limit) } },
    });
  } catch (err) {
    console.error('Get vendors error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch vendors.' });
  }
};

// GET /api/admin/vendors/:id
exports.getVendorById = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT v.*,
         (SELECT COUNT(*) FROM rfq_vendors rv WHERE rv.vendor_id = v.id) AS assigned_rfqs,
         (SELECT COUNT(*) FROM quotations q WHERE q.vendor_id = v.id) AS submitted_quotations,
         (SELECT COUNT(*) FROM quotations q WHERE q.vendor_id = v.id AND q.status = 'approved') AS approved_quotations,
         (SELECT COUNT(*) FROM purchase_orders po WHERE po.vendor_id = v.id) AS purchase_orders,
         (SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (q.submitted_at - rv.assigned_at))/3600),0)
          FROM quotations q JOIN rfq_vendors rv ON rv.rfq_id = q.rfq_id AND rv.vendor_id = q.vendor_id
          WHERE q.vendor_id = v.id) AS avg_response_hours
       FROM vendors v WHERE v.id = $1`,
      [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ success: false, message: 'Vendor not found.' });
    return res.json({ success: true, vendor: result.rows[0] });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to fetch vendor.' });
  }
};

// GET /api/admin/vendors/categories
exports.getCategories = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT DISTINCT category FROM vendors WHERE category IS NOT NULL AND category != '' ORDER BY category`
    );
    return res.json({ success: true, categories: result.rows.map(r => r.category) });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to fetch categories.' });
  }
};

// POST /api/admin/vendors
exports.createVendor = async (req, res) => {
  const { vendor_name, company_name, gst_number, contact_person, email, phone, address, category } = req.body;

  if (!vendor_name || !company_name || !contact_person || !email) {
    return res.status(422).json({ success: false, message: 'Vendor name, company, contact person and email are required.' });
  }

  try {
    const existing = await pool.query('SELECT id FROM vendors WHERE email = $1', [email.toLowerCase().trim()]);
    if (existing.rows.length) return res.status(409).json({ success: false, message: 'A vendor with this email already exists.' });

    const vendorRes = await pool.query(
      `INSERT INTO vendors (vendor_name, company_name, gst_number, contact_person, email, phone, address, category)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [vendor_name.trim(), company_name.trim(), gst_number?.trim() || null,
       contact_person.trim(), email.toLowerCase().trim(), phone?.trim() || null,
       address?.trim() || null, category?.trim() || null]
    );
    const vendor = vendorRes.rows[0];

    // Auto-create user account for vendor
    const userExists = await pool.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase().trim()]);
    let vendorUserId = null;

    if (!userExists.rows.length) {
      const tempPw = generateTempPassword();
      const salt   = await bcrypt.genSalt(12);
      const hash   = await bcrypt.hash(tempPw, salt);

      const userRes = await pool.query(
        `INSERT INTO users (full_name, company_name, email, password_hash, role, is_verified, status)
         VALUES ($1,$2,$3,$4,'vendor',TRUE,'active') RETURNING id`,
        [contact_person.trim(), company_name.trim(), email.toLowerCase().trim(), hash]
      );
      vendorUserId = userRes.rows[0].id;
      await pool.query(`UPDATE vendors SET user_id = $1 WHERE id = $2`, [vendorUserId, vendor.id]);
      await sendVendorWelcomeEmail(email, contact_person, tempPw);
    } else {
      vendorUserId = userExists.rows[0].id;
      await pool.query(`UPDATE vendors SET user_id = $1 WHERE id = $2`, [vendorUserId, vendor.id]);
    }

    await log({ userId: req.user.id, action: 'VENDOR_CREATED', entityType: 'vendor', entityId: vendor.id,
      description: `Admin created vendor ${vendor_name} (${email})` });
    await notifyAdmins({ title: 'New Vendor Added', message: `${vendor_name} has been added to the vendor registry.`, type: 'success' });

    return res.status(201).json({ success: true, message: 'Vendor created and account emailed.', vendor });
  } catch (err) {
    console.error('Create vendor error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to create vendor.' });
  }
};

// PUT /api/admin/vendors/:id
exports.updateVendor = async (req, res) => {
  const { vendor_name, company_name, gst_number, contact_person, phone, address, category } = req.body;
  const { id } = req.params;

  try {
    const existing = await pool.query('SELECT id FROM vendors WHERE id = $1', [id]);
    if (!existing.rows.length) return res.status(404).json({ success: false, message: 'Vendor not found.' });

    const result = await pool.query(
      `UPDATE vendors SET
         vendor_name    = COALESCE($1, vendor_name),
         company_name   = COALESCE($2, company_name),
         gst_number     = COALESCE($3, gst_number),
         contact_person = COALESCE($4, contact_person),
         phone          = COALESCE($5, phone),
         address        = COALESCE($6, address),
         category       = COALESCE($7, category),
         updated_at     = NOW()
       WHERE id = $8 RETURNING *`,
      [vendor_name?.trim(), company_name?.trim(), gst_number?.trim(), contact_person?.trim(),
       phone?.trim(), address?.trim(), category?.trim(), id]
    );

    await log({ userId: req.user.id, action: 'VENDOR_UPDATED', entityType: 'vendor', entityId: id,
      description: `Admin updated vendor ${result.rows[0].vendor_name}` });

    return res.json({ success: true, message: 'Vendor updated.', vendor: result.rows[0] });
  } catch (err) {
    console.error('Update vendor error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to update vendor.' });
  }
};

// PATCH /api/admin/vendors/:id/status
exports.toggleStatus = async (req, res) => {
  const { status } = req.body;
  if (!['active','inactive'].includes(status)) return res.status(422).json({ success: false, message: 'Invalid status.' });

  try {
    const result = await pool.query(
      `UPDATE vendors SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [status, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ success: false, message: 'Vendor not found.' });

    await log({ userId: req.user.id, action: 'VENDOR_STATUS_CHANGED', entityType: 'vendor', entityId: req.params.id,
      description: `Admin set vendor ${result.rows[0].vendor_name} status to ${status}` });

    return res.json({ success: true, message: `Vendor ${status}.`, vendor: result.rows[0] });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to update vendor status.' });
  }
};

// DELETE /api/admin/vendors/:id
exports.deleteVendor = async (req, res) => {
  try {
    const existing = await pool.query('SELECT id, vendor_name FROM vendors WHERE id = $1', [req.params.id]);
    if (!existing.rows.length) return res.status(404).json({ success: false, message: 'Vendor not found.' });

    await pool.query('DELETE FROM vendors WHERE id = $1', [req.params.id]);

    await log({ userId: req.user.id, action: 'VENDOR_DELETED', entityType: 'vendor', entityId: req.params.id,
      description: `Admin deleted vendor ${existing.rows[0].vendor_name}` });

    return res.json({ success: true, message: 'Vendor deleted.' });
  } catch (err) {
    console.error('Delete vendor error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to delete vendor.' });
  }
};
