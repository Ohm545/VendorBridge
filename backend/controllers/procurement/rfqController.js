/**
 * Procurement RFQ Controller
 */
const pool    = require('../../config/db');
const { log } = require('../../services/activityLogger');
const { createNotification, notifyAdmins } = require('../../services/notificationService');
const nodemailer = require('nodemailer');

function mailer() {
  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST, port: parseInt(process.env.EMAIL_PORT)||587,
    secure: process.env.EMAIL_SECURE==='true',
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
  });
}

async function sendRfqEmail(to, vendorName, rfq) {
  try {
    await mailer().sendMail({
      from: process.env.EMAIL_FROM || '"VendorBridge" <noreply@vendorbridge.com>',
      to, subject: `New RFQ Assignment: ${rfq.title}`,
      html: `<div style="font-family:Inter,Arial,sans-serif;background:#f8fafc;padding:40px 20px;">
        <div style="background:#fff;border-radius:16px;padding:36px;max-width:520px;margin:0 auto;border:1px solid #e2e8f0;">
          <h2 style="color:#0a0f1e;margin:0 0 8px;">New RFQ Assignment</h2>
          <p style="color:#64748b;">Hi ${vendorName},</p>
          <p style="color:#64748b;">You have been assigned a new RFQ on VendorBridge.</p>
          <div style="background:#f1f5f9;border-radius:10px;padding:16px 20px;margin:20px 0;">
            <p style="margin:0 0 6px;color:#334155;font-size:14px;"><strong>${rfq.title}</strong></p>
            ${rfq.product_category?`<p style="margin:0 0 4px;font-size:13px;color:#64748b;">Category: ${rfq.product_category}</p>`:''}
            ${rfq.quantity?`<p style="margin:0 0 4px;font-size:13px;color:#64748b;">Quantity: ${rfq.quantity}</p>`:''}
            ${rfq.deadline?`<p style="margin:0;font-size:13px;color:#dc2626;">Deadline: ${new Date(rfq.deadline).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'})}</p>`:''}
          </div>
          <p style="color:#64748b;font-size:13px;">Please log in to your vendor portal to view the RFQ details and submit your quotation.</p>
          <a href="${process.env.FRONTEND_URL}/pages/login.html"
             style="display:inline-block;background:#0a0f1e;color:#fff;padding:12px 22px;border-radius:10px;text-decoration:none;font-weight:600;">
            View RFQ & Submit Quote</a>
        </div></div>`,
    });
  } catch(e) { console.error('RFQ email error:', e.message); }
}

// GET /api/procurement/rfqs
exports.getRfqs = async (req, res) => {
  const uid = req.user.id;
  try {
    const page   = Math.max(1, parseInt(req.query.page)||1);
    const limit  = Math.min(100, Math.max(1, parseInt(req.query.limit)||15));
    const offset = (page-1)*limit;
    const { search, status, category } = req.query;

    let where = 'WHERE r.created_by=$1';
    const params = [uid];
    let idx = 2;
    if (search) { where += ` AND (r.title ILIKE $${idx} OR r.product_category ILIKE $${idx})`; params.push(`%${search}%`); idx++; }
    if (status) { where += ` AND r.status=$${idx}`; params.push(status); idx++; }
    if (category) { where += ` AND r.product_category=$${idx}`; params.push(category); idx++; }

    const countRes = await pool.query(`SELECT COUNT(*) FROM rfqs r ${where}`, params);
    const total = parseInt(countRes.rows[0].count);

    const rfqsRes = await pool.query(
      `SELECT r.*,
         (SELECT COUNT(*) FROM rfq_vendors rv WHERE rv.rfq_id=r.id) AS vendor_count,
         (SELECT COUNT(*) FROM quotations q WHERE q.rfq_id=r.id) AS quotation_count,
         (SELECT COUNT(*) FROM approvals a WHERE a.rfq_id=r.id AND a.status='approved') AS approved_count,
         (SELECT po.po_number FROM purchase_orders po WHERE po.rfq_id=r.id LIMIT 1) AS po_number,
         (SELECT i.invoice_number FROM invoices i JOIN purchase_orders po ON po.id=i.po_id WHERE po.rfq_id=r.id LIMIT 1) AS invoice_number
       FROM rfqs r ${where}
       ORDER BY r.created_at DESC
       LIMIT $${idx} OFFSET $${idx+1}`,
      [...params, limit, offset]
    );
    return res.json({ success:true, data:{ rfqs:rfqsRes.rows, pagination:{ total, page, limit, pages:Math.ceil(total/limit) } } });
  } catch(err) {
    console.error('Get RFQs error:', err.message);
    return res.status(500).json({ success:false, message:'Failed to fetch RFQs.' });
  }
};

// GET /api/procurement/rfqs/:id
exports.getRfqById = async (req, res) => {
  const uid = req.user.id;
  try {
    const r = await pool.query(
      `SELECT r.*,
         (SELECT COUNT(*) FROM rfq_vendors rv WHERE rv.rfq_id=r.id) AS vendor_count,
         (SELECT COUNT(*) FROM quotations q WHERE q.rfq_id=r.id) AS quotation_count
       FROM rfqs r WHERE r.id=$1 AND r.created_by=$2`, [req.params.id, uid]
    );
    if (!r.rows.length) return res.status(404).json({ success:false, message:'RFQ not found.' });

    // Vendors assigned
    const vendors = await pool.query(
      `SELECT rv.*, v.vendor_name, v.company_name, v.email, v.contact_person, v.phone,
         q.id AS quote_id, q.quoted_amount, q.delivery_days, q.remarks, q.status AS quote_status, q.submitted_at
       FROM rfq_vendors rv
       JOIN vendors v ON v.id=rv.vendor_id
       LEFT JOIN quotations q ON q.rfq_id=rv.rfq_id AND q.vendor_id=rv.vendor_id
       WHERE rv.rfq_id=$1 ORDER BY rv.assigned_at`, [req.params.id]
    );

    // Approvals
    const approvals = await pool.query(
      `SELECT a.*, u.full_name AS manager_name, u.email AS manager_email,
         v.vendor_name AS preferred_vendor_name
       FROM approvals a
       LEFT JOIN users u ON u.id=a.manager_id
       LEFT JOIN vendors v ON v.id=a.preferred_vendor_id
       WHERE a.rfq_id=$1 ORDER BY a.requested_at DESC`, [req.params.id]
    );

    // PO
    const pos = await pool.query(
      `SELECT po.*, v.vendor_name FROM purchase_orders po
       LEFT JOIN vendors v ON v.id=po.vendor_id WHERE po.rfq_id=$1`, [req.params.id]
    );

    // Invoices
    const invoices = await pool.query(
      `SELECT i.*, v.vendor_name FROM invoices i
       JOIN purchase_orders po ON po.id=i.po_id
       LEFT JOIN vendors v ON v.id=i.vendor_id WHERE po.rfq_id=$1`, [req.params.id]
    );

    // Activity
    const activity = await pool.query(
      `SELECT al.*, u.full_name AS user_name FROM activity_logs al
       LEFT JOIN users u ON u.id=al.user_id
       WHERE al.entity_type='rfq' AND al.entity_id=$1
       ORDER BY al.created_at DESC LIMIT 20`, [req.params.id]
    );

    return res.json({ success:true, rfq:r.rows[0], vendors:vendors.rows, approvals:approvals.rows, purchase_orders:pos.rows, invoices:invoices.rows, activity:activity.rows });
  } catch(err) {
    console.error('Get RFQ error:', err.message);
    return res.status(500).json({ success:false, message:'Failed to fetch RFQ.' });
  }
};

// POST /api/procurement/rfqs
exports.createRfq = async (req, res) => {
  const uid = req.user.id;
  const { title, description, product_category, quantity, expected_budget, delivery_location, deadline, vendor_ids, notes } = req.body;
  if (!title) return res.status(422).json({ success:false, message:'RFQ title is required.' });

  try {
    const rfqRes = await pool.query(
      `INSERT INTO rfqs (title, description, product_category, quantity, expected_budget, delivery_location, deadline, notes, created_by, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'draft') RETURNING *`,
      [title.trim(), description||null, product_category||null, quantity||null, expected_budget||null, delivery_location||null, deadline||null, notes||null, uid]
    );
    const rfq = rfqRes.rows[0];

    // Assign vendors
    const vendorEmails = [];
    if (vendor_ids && vendor_ids.length > 0) {
      for (const vid of vendor_ids) {
        await pool.query(
          `INSERT INTO rfq_vendors (rfq_id, vendor_id) VALUES ($1,$2) ON CONFLICT (rfq_id,vendor_id) DO NOTHING`,
          [rfq.id, vid]
        );
      }
      // Update status to active
      await pool.query(`UPDATE rfqs SET status='active' WHERE id=$1`, [rfq.id]);
      rfq.status = 'active';

      // Fetch vendor emails for notifications
      const vendorData = await pool.query(`SELECT email, contact_person, vendor_name FROM vendors WHERE id=ANY($1)`, [vendor_ids]);
      for (const v of vendorData.rows) {
        vendorEmails.push({ email: v.email, name: v.contact_person, vendor_name: v.vendor_name });
      }
    }

    await log({ userId:uid, action:'RFQ_CREATED', entityType:'rfq', entityId:rfq.id, description:`Created RFQ: ${title}` });
    await notifyAdmins({ title:'New RFQ Created', message:`Procurement Officer created RFQ: ${title}`, type:'info' });

    // Send emails async
    for (const v of vendorEmails) {
      sendRfqEmail(v.email, v.name||v.vendor_name, rfq).catch(()=>{});
    }

    return res.status(201).json({ success:true, message:'RFQ created successfully.', rfq });
  } catch(err) {
    console.error('Create RFQ error:', err.message);
    return res.status(500).json({ success:false, message:'Failed to create RFQ.' });
  }
};

// PUT /api/procurement/rfqs/:id
exports.updateRfq = async (req, res) => {
  const uid = req.user.id;
  const { title, description, product_category, quantity, expected_budget, delivery_location, deadline, notes } = req.body;
  try {
    const existing = await pool.query('SELECT id, status FROM rfqs WHERE id=$1 AND created_by=$2', [req.params.id, uid]);
    if (!existing.rows.length) return res.status(404).json({ success:false, message:'RFQ not found.' });
    if (['po_generated','invoice_generated','closed'].includes(existing.rows[0].status)) {
      return res.status(400).json({ success:false, message:`Cannot edit RFQ in ${existing.rows[0].status} status.` });
    }

    const result = await pool.query(
      `UPDATE rfqs SET
         title=COALESCE($1,title), description=COALESCE($2,description),
         product_category=COALESCE($3,product_category), quantity=COALESCE($4,quantity),
         expected_budget=COALESCE($5,expected_budget), delivery_location=COALESCE($6,delivery_location),
         deadline=COALESCE($7,deadline), notes=COALESCE($8,notes), updated_at=NOW()
       WHERE id=$9 AND created_by=$10 RETURNING *`,
      [title?.trim(), description, product_category, quantity, expected_budget, delivery_location, deadline, notes, req.params.id, uid]
    );
    await log({ userId:uid, action:'RFQ_UPDATED', entityType:'rfq', entityId:req.params.id, description:`Updated RFQ: ${result.rows[0].title}` });
    return res.json({ success:true, message:'RFQ updated.', rfq:result.rows[0] });
  } catch(err) {
    console.error('Update RFQ error:', err.message);
    return res.status(500).json({ success:false, message:'Failed to update RFQ.' });
  }
};

// DELETE /api/procurement/rfqs/:id
exports.deleteRfq = async (req, res) => {
  const uid = req.user.id;
  try {
    const existing = await pool.query('SELECT id, title, status FROM rfqs WHERE id=$1 AND created_by=$2', [req.params.id, uid]);
    if (!existing.rows.length) return res.status(404).json({ success:false, message:'RFQ not found.' });
    if (!['draft','cancelled'].includes(existing.rows[0].status)) {
      return res.status(400).json({ success:false, message:'Only draft or cancelled RFQs can be deleted.' });
    }
    await pool.query('DELETE FROM rfqs WHERE id=$1', [req.params.id]);
    await log({ userId:uid, action:'RFQ_DELETED', entityType:'rfq', entityId:req.params.id, description:`Deleted RFQ: ${existing.rows[0].title}` });
    return res.json({ success:true, message:'RFQ deleted.' });
  } catch(err) {
    return res.status(500).json({ success:false, message:'Failed to delete RFQ.' });
  }
};

// POST /api/procurement/rfqs/:id/assign-vendors
exports.assignVendors = async (req, res) => {
  const uid = req.user.id;
  const { vendor_ids } = req.body;
  if (!vendor_ids || !vendor_ids.length) return res.status(422).json({ success:false, message:'At least one vendor required.' });

  try {
    const rfqRes = await pool.query('SELECT * FROM rfqs WHERE id=$1 AND created_by=$2', [req.params.id, uid]);
    if (!rfqRes.rows.length) return res.status(404).json({ success:false, message:'RFQ not found.' });
    const rfq = rfqRes.rows[0];

    const newlyAssigned = [];
    for (const vid of vendor_ids) {
      const r = await pool.query(
        `INSERT INTO rfq_vendors (rfq_id, vendor_id) VALUES ($1,$2) ON CONFLICT (rfq_id,vendor_id) DO NOTHING RETURNING *`,
        [rfq.id, vid]
      );
      if (r.rows.length) newlyAssigned.push(vid);
    }

    if (rfq.status === 'draft') {
      await pool.query(`UPDATE rfqs SET status='active', updated_at=NOW() WHERE id=$1`, [rfq.id]);
    }

    // Email newly assigned vendors
    if (newlyAssigned.length) {
      const vData = await pool.query(`SELECT email, contact_person, vendor_name FROM vendors WHERE id=ANY($1)`, [newlyAssigned]);
      for (const v of vData.rows) sendRfqEmail(v.email, v.contact_person||v.vendor_name, rfq).catch(()=>{});
    }

    await log({ userId:uid, action:'VENDORS_ASSIGNED', entityType:'rfq', entityId:rfq.id, description:`Assigned ${vendor_ids.length} vendor(s) to RFQ: ${rfq.title}` });
    return res.json({ success:true, message:`${vendor_ids.length} vendor(s) assigned.` });
  } catch(err) {
    console.error('Assign vendors error:', err.message);
    return res.status(500).json({ success:false, message:'Failed to assign vendors.' });
  }
};

// PATCH /api/procurement/rfqs/:id/preferred-vendor
exports.setPreferredVendor = async (req, res) => {
  const uid = req.user.id;
  const { vendor_id } = req.body;
  try {
    const rfq = await pool.query('SELECT id, title FROM rfqs WHERE id=$1 AND created_by=$2', [req.params.id, uid]);
    if (!rfq.rows.length) return res.status(404).json({ success:false, message:'RFQ not found.' });

    await pool.query(
      `UPDATE rfqs SET preferred_vendor_id=$1, status='quotation_received', updated_at=NOW() WHERE id=$2`,
      [vendor_id, req.params.id]
    );
    await log({ userId:uid, action:'PREFERRED_VENDOR_SET', entityType:'rfq', entityId:req.params.id, description:`Set preferred vendor for RFQ: ${rfq.rows[0].title}` });
    return res.json({ success:true, message:'Preferred vendor set.' });
  } catch(err) {
    return res.status(500).json({ success:false, message:'Failed to set preferred vendor.' });
  }
};

// GET /api/procurement/rfqs/categories
exports.getCategories = async (req, res) => {
  try {
    const r = await pool.query(`SELECT DISTINCT product_category FROM rfqs WHERE product_category IS NOT NULL ORDER BY product_category`);
    return res.json({ success:true, categories: r.rows.map(r=>r.product_category) });
  } catch(e) { return res.status(500).json({ success:false, message:'Failed.' }); }
};
