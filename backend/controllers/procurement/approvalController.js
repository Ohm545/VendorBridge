/**
 * Procurement Approval Request Controller
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

async function sendApprovalRequestEmail(to, managerName, rfq, vendorName) {
  try {
    await mailer().sendMail({
      from: process.env.EMAIL_FROM||'"VendorBridge" <noreply@vendorbridge.com>',
      to, subject: `Approval Required: ${rfq.title}`,
      html: `<div style="font-family:Inter,Arial,sans-serif;background:#f8fafc;padding:40px 20px;">
        <div style="background:#fff;border-radius:16px;padding:36px;max-width:520px;margin:0 auto;border:1px solid #e2e8f0;">
          <h2 style="color:#0a0f1e;margin:0 0 8px;">Approval Request</h2>
          <p style="color:#64748b;">Hi ${managerName},</p>
          <p style="color:#64748b;">A procurement approval is waiting for your review.</p>
          <div style="background:#f1f5f9;border-radius:10px;padding:16px 20px;margin:20px 0;">
            <p style="margin:0 0 6px;color:#334155;font-weight:600;">${rfq.title}</p>
            <p style="margin:0 0 4px;font-size:13px;color:#64748b;">Preferred Vendor: <strong>${vendorName}</strong></p>
            ${rfq.expected_budget?`<p style="margin:0;font-size:13px;color:#64748b;">Budget: ₹${parseFloat(rfq.expected_budget).toLocaleString('en-IN')}</p>`:''}
          </div>
          <a href="${process.env.FRONTEND_URL}/pages/login.html"
             style="display:inline-block;background:#0a0f1e;color:#fff;padding:12px 22px;border-radius:10px;text-decoration:none;font-weight:600;">
            Review & Approve</a>
        </div></div>`,
    });
  } catch(e) { console.error('Approval email error:', e.message); }
}

// GET /api/procurement/approvals
exports.getApprovals = async (req, res) => {
  const uid = req.user.id;
  try {
    const page   = Math.max(1, parseInt(req.query.page)||1);
    const limit  = Math.min(50, Math.max(1, parseInt(req.query.limit)||15));
    const offset = (page-1)*limit;
    const { status } = req.query;

    let where = 'WHERE r.created_by=$1';
    const params = [uid];
    let idx = 2;
    if (status) { where += ` AND a.status=$${idx}`; params.push(status); idx++; }

    const countRes = await pool.query(`SELECT COUNT(*) FROM approvals a JOIN rfqs r ON r.id=a.rfq_id ${where}`, params);
    const total = parseInt(countRes.rows[0].count);

    const result = await pool.query(
      `SELECT a.*, r.title AS rfq_title, r.product_category,
         v.vendor_name AS preferred_vendor_name,
         u.full_name AS manager_name, u.email AS manager_email
       FROM approvals a
       JOIN rfqs r ON r.id=a.rfq_id
       LEFT JOIN vendors v ON v.id=a.preferred_vendor_id
       LEFT JOIN users u ON u.id=a.manager_id
       ${where}
       ORDER BY a.requested_at DESC
       LIMIT $${idx} OFFSET $${idx+1}`,
      [...params, limit, offset]
    );
    return res.json({ success:true, data:{ approvals:result.rows, pagination:{ total, page, limit, pages:Math.ceil(total/limit) } } });
  } catch(err) {
    console.error('Get approvals error:', err.message);
    return res.status(500).json({ success:false, message:'Failed to fetch approvals.' });
  }
};

// POST /api/procurement/approvals — request approval
exports.requestApproval = async (req, res) => {
  const uid = req.user.id;
  const { rfq_id, preferred_vendor_id, notes } = req.body;
  if (!rfq_id || !preferred_vendor_id) {
    return res.status(422).json({ success:false, message:'RFQ and preferred vendor are required.' });
  }
  try {
    const rfqRes = await pool.query('SELECT * FROM rfqs WHERE id=$1 AND created_by=$2', [rfq_id, uid]);
    if (!rfqRes.rows.length) return res.status(404).json({ success:false, message:'RFQ not found.' });
    const rfq = rfqRes.rows[0];

    if (['po_generated','invoice_generated','closed'].includes(rfq.status)) {
      return res.status(400).json({ success:false, message:'RFQ is already processed.' });
    }

    // Find a manager to notify
    const managerRes = await pool.query(`SELECT id, full_name, email FROM users WHERE role='manager' AND status='active' LIMIT 1`);
    const manager = managerRes.rows[0] || null;

    const vendorRes = await pool.query('SELECT vendor_name FROM vendors WHERE id=$1', [preferred_vendor_id]);
    const vendorName = vendorRes.rows[0]?.vendor_name || 'Unknown';

    const apprRes = await pool.query(
      `INSERT INTO approvals (entity_type, entity_id, rfq_id, requested_by, manager_id, preferred_vendor_id, status, notes)
       VALUES ('rfq', $1, $1, $2, $3, $4, 'pending', $5) RETURNING *`,
      [rfq_id, uid, manager?.id||null, preferred_vendor_id, notes||null]
    );

    // Update RFQ status
    await pool.query(`UPDATE rfqs SET status='pending_approval', preferred_vendor_id=$1, updated_at=NOW() WHERE id=$2`, [preferred_vendor_id, rfq_id]);

    // Notify manager
    if (manager) {
      await createNotification({ userId:manager.id, title:'Approval Request', message:`Approval needed for RFQ: ${rfq.title}`, type:'warning' });
      sendApprovalRequestEmail(manager.email, manager.full_name, rfq, vendorName).catch(()=>{});
    }

    await log({ userId:uid, action:'APPROVAL_REQUESTED', entityType:'rfq', entityId:rfq_id, description:`Requested approval for RFQ: ${rfq.title} (Preferred: ${vendorName})` });

    return res.status(201).json({ success:true, message:'Approval request submitted.', approval:apprRes.rows[0] });
  } catch(err) {
    console.error('Request approval error:', err.message);
    return res.status(500).json({ success:false, message:'Failed to submit approval request.' });
  }
};
