/**
 * Manager Approval Controller — Core module
 */
const pool     = require('../../config/db');
const { log }  = require('../../services/activityLogger');
const { createNotification } = require('../../services/notificationService');
const nodemailer = require('nodemailer');

function mailer() {
  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST, port: parseInt(process.env.EMAIL_PORT)||587,
    secure: process.env.EMAIL_SECURE==='true',
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
  });
}

async function sendDecisionEmail(to, name, rfqTitle, decision, remarks) {
  try {
    await mailer().sendMail({
      from: process.env.EMAIL_FROM || '"VendorBridge" <noreply@vendorbridge.com>',
      to, subject: `Approval ${decision === 'approved' ? 'Granted' : 'Rejected'}: ${rfqTitle}`,
      html: `<div style="font-family:Inter,Arial,sans-serif;background:#f8fafc;padding:40px 20px;">
        <div style="background:#fff;border-radius:16px;padding:36px;max-width:520px;margin:0 auto;border:1px solid #e2e8f0;">
          <h2 style="color:${decision==='approved'?'#16a34a':'#dc2626'};margin:0 0 8px;">
            ${decision==='approved'?'✅ Approval Granted':'❌ Request Rejected'}</h2>
          <p style="color:#64748b;">Hi ${name},</p>
          <p style="color:#64748b;">Your procurement approval request for <strong>${rfqTitle}</strong> has been <strong>${decision}</strong>.</p>
          ${remarks ? `<div style="background:#f1f5f9;border-radius:10px;padding:14px 18px;margin:16px 0;font-size:13px;color:#334155;"><strong>Remarks:</strong> ${remarks}</div>` : ''}
          <a href="${process.env.FRONTEND_URL}/procurement/approvals"
             style="display:inline-block;background:#0a0f1e;color:#fff;padding:12px 22px;border-radius:10px;text-decoration:none;font-weight:600;">
            View Approval Status</a>
        </div></div>`,
    });
  } catch (e) { console.error('Decision email error:', e.message); }
}

// GET /api/manager/approvals
exports.getApprovals = async (req, res) => {
  const mid = req.user.id;
  try {
    const page   = Math.max(1, parseInt(req.query.page)||1);
    const limit  = Math.min(50, parseInt(req.query.limit)||15);
    const offset = (page-1)*limit;
    const { status, from, to, vendor, officer, priority, category, search } = req.query;

    let where = 'WHERE a.manager_id=$1';
    const params = [mid];
    let idx = 2;
    if (status)   { where += ` AND a.status=$${idx}`;  params.push(status);   idx++; }
    if (priority) { where += ` AND a.priority=$${idx}`;params.push(priority); idx++; }
    if (from)     { where += ` AND a.requested_at>=$${idx}`; params.push(from); idx++; }
    if (to)       { where += ` AND a.requested_at<=$${idx}`; params.push(to);   idx++; }
    if (vendor)   { where += ` AND v.vendor_name ILIKE $${idx}`; params.push(`%${vendor}%`); idx++; }
    if (officer)  { where += ` AND u.full_name ILIKE $${idx}`;   params.push(`%${officer}%`); idx++; }
    if (category) { where += ` AND r.product_category=$${idx}`;  params.push(category); idx++; }
    if (search)   { where += ` AND (r.title ILIKE $${idx} OR v.vendor_name ILIKE $${idx})`; params.push(`%${search}%`); idx++; }

    const countRes = await pool.query(
      `SELECT COUNT(*) FROM approvals a
       JOIN rfqs r ON r.id=a.rfq_id
       LEFT JOIN vendors v ON v.id=a.preferred_vendor_id
       LEFT JOIN users u ON u.id=a.requested_by
       ${where}`, params
    );
    const total = parseInt(countRes.rows[0].count);

    const result = await pool.query(
      `SELECT a.id, a.status, a.priority, a.notes, a.requested_at, a.approved_at, a.resolved_at,
         r.id AS rfq_id, r.title AS rfq_title, r.product_category, r.expected_budget, r.deadline,
         v.vendor_name AS preferred_vendor, v.id AS vendor_id,
         u.full_name AS requested_by_name, u.email AS requested_by_email,
         EXTRACT(EPOCH FROM (NOW()-a.requested_at))/3600 AS pending_hours
       FROM approvals a
       JOIN rfqs r ON r.id=a.rfq_id
       LEFT JOIN vendors v ON v.id=a.preferred_vendor_id
       LEFT JOIN users u ON u.id=a.requested_by
       ${where}
       ORDER BY
         CASE a.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'normal' THEN 3 ELSE 4 END,
         a.requested_at ASC
       LIMIT $${idx} OFFSET $${idx+1}`,
      [...params, limit, offset]
    );

    return res.json({ success: true, data: { approvals: result.rows, pagination: { total, page, limit, pages: Math.ceil(total/limit) } } });
  } catch (err) {
    console.error('Get approvals error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch approvals.' });
  }
};

// GET /api/manager/approvals/:id — full detail with quotations
exports.getApprovalDetail = async (req, res) => {
  const mid = req.user.id;
  try {
    const apprRes = await pool.query(
      `SELECT a.*, r.*, r.id AS rfq_id, r.title AS rfq_title,
         v.vendor_name AS preferred_vendor_name, v.id AS preferred_vendor_id,
         u.full_name AS requested_by_name, u.email AS requested_by_email, u.company_name
       FROM approvals a
       JOIN rfqs r ON r.id=a.rfq_id
       LEFT JOIN vendors v ON v.id=a.preferred_vendor_id
       LEFT JOIN users u ON u.id=a.requested_by
       WHERE a.id=$1 AND a.manager_id=$2`, [req.params.id, mid]
    );
    if (!apprRes.rows.length) return res.status(404).json({ success: false, message: 'Approval not found.' });
    const approval = apprRes.rows[0];

    // All quotations for this RFQ with vendor scores
    const quotesRes = await pool.query(`
      SELECT q.*, v.vendor_name, v.company_name, v.email AS vendor_email, v.category,
        COALESCE(q.quoted_amount, q.amount) AS final_amount,
        (SELECT COUNT(*) FROM rfq_vendors rv WHERE rv.vendor_id=v.id) AS total_assigned,
        (SELECT COUNT(*) FROM quotations q2 WHERE q2.vendor_id=v.id) AS total_quoted,
        (SELECT COUNT(*) FROM quotations q2 WHERE q2.vendor_id=v.id AND q2.status='approved') AS total_approved,
        (SELECT COUNT(*) FROM purchase_orders po WHERE po.vendor_id=v.id) AS total_pos
      FROM quotations q
      JOIN vendors v ON v.id=q.vendor_id
      WHERE q.rfq_id=$1
      ORDER BY COALESCE(q.quoted_amount,q.amount) ASC`, [approval.rfq_id]
    );

    // Add scores to each quotation
    const quotes = quotesRes.rows;
    const minAmount = Math.min(...quotes.map(q => parseFloat(q.final_amount)||Infinity), Infinity);
    const minDays   = Math.min(...quotes.filter(q=>q.delivery_days).map(q=>q.delivery_days), 999);
    const scored = quotes.map(q => {
      const amount = parseFloat(q.final_amount)||0;
      const days   = parseInt(q.delivery_days)||999;
      const ta     = parseInt(q.total_assigned)||1;
      const responseRate  = ta > 0 ? Math.round((parseInt(q.total_quoted)/ta)*100) : 0;
      const approvalRate  = parseInt(q.total_quoted) > 0 ? Math.round((parseInt(q.total_approved)/parseInt(q.total_quoted))*100) : 0;
      const priceScore    = minAmount > 0 && amount > 0 ? Math.round((minAmount/amount)*40) : 20;
      const delivScore    = minDays < 999 && days < 999 ? Math.round((minDays/days)*30) : 15;
      const reliabScore   = Math.round(responseRate*0.15 + approvalRate*0.15);
      return { ...q, score: Math.min(100, priceScore+delivScore+reliabScore), response_rate: responseRate, approval_rate: approvalRate };
    });
    scored.sort((a,b) => b.score - a.score);

    // Assigned vendors
    const vendorsRes = await pool.query(`
      SELECT rv.*, v.vendor_name, v.email, v.contact_person
      FROM rfq_vendors rv JOIN vendors v ON v.id=rv.vendor_id
      WHERE rv.rfq_id=$1`, [approval.rfq_id]
    );

    // Approval history
    const historyRes = await pool.query(`
      SELECT ah.*, u.full_name AS performed_by_name
      FROM approval_history ah
      LEFT JOIN users u ON u.id=ah.performed_by
      WHERE ah.approval_id=$1 ORDER BY ah.performed_at ASC`, [req.params.id]
    );

    // Activity logs
    const activityRes = await pool.query(`
      SELECT al.*, u.full_name AS user_name FROM activity_logs al
      LEFT JOIN users u ON u.id=al.user_id
      WHERE al.entity_type='rfq' AND al.entity_id=$1
      ORDER BY al.created_at DESC LIMIT 15`, [approval.rfq_id]
    );

    // Log "viewed" in history
    await pool.query(
      `INSERT INTO approval_history (approval_id, action, performed_by, remarks)
       VALUES ($1, 'viewed', $2, 'Manager viewed approval detail')
       ON CONFLICT DO NOTHING`, [req.params.id, mid]
    ).catch(()=>{});

    await log({ userId: mid, action: 'APPROVAL_VIEWED', entityType: 'approval', entityId: req.params.id,
      description: `Manager viewed approval for RFQ: ${approval.rfq_title}` });

    return res.json({ success: true, approval, quotations: scored, vendors: vendorsRes.rows, history: historyRes.rows, activity: activityRes.rows });
  } catch (err) {
    console.error('Get approval detail error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch approval detail.' });
  }
};

// POST /api/manager/approvals/:id/approve
exports.approveRequest = async (req, res) => {
  const mid = req.user.id;
  const { notes } = req.body;
  try {
    const apprRes = await pool.query(
      `SELECT a.*, r.title AS rfq_title, u.full_name AS officer_name, u.email AS officer_email
       FROM approvals a JOIN rfqs r ON r.id=a.rfq_id JOIN users u ON u.id=a.requested_by
       WHERE a.id=$1 AND a.manager_id=$2`, [req.params.id, mid]
    );
    if (!apprRes.rows.length) return res.status(404).json({ success: false, message: 'Approval not found.' });
    const appr = apprRes.rows[0];
    if (appr.status !== 'pending') return res.status(400).json({ success: false, message: `Cannot approve — status is already ${appr.status}.` });

    await pool.query(
      `UPDATE approvals SET status='approved', approved_by=$1, approved_at=NOW(), resolved_at=NOW(), notes=COALESCE($2,notes), updated_at=NOW()
       WHERE id=$3`, [mid, notes||null, req.params.id]
    );

    // Update RFQ status
    await pool.query(`UPDATE rfqs SET status='approved', updated_at=NOW() WHERE id=$1`, [appr.rfq_id]);

    // Notify procurement officer
    await createNotification({ userId: appr.requested_by, title: 'Approval Granted ✅',
      message: `Your request for RFQ "${appr.rfq_title}" has been approved. You can now generate a Purchase Order.`,
      type: 'success', link: '/procurement/approvals' });

    sendDecisionEmail(appr.officer_email, appr.officer_name, appr.rfq_title, 'approved', notes).catch(()=>{});

    await log({ userId: mid, action: 'APPROVAL_APPROVED', entityType: 'approval', entityId: req.params.id,
      description: `Manager approved RFQ: ${appr.rfq_title}` });

    return res.json({ success: true, message: 'Request approved. Procurement Officer notified.' });
  } catch (err) {
    console.error('Approve error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to approve request.' });
  }
};

// POST /api/manager/approvals/:id/reject
exports.rejectRequest = async (req, res) => {
  const mid = req.user.id;
  const { remarks } = req.body;
  if (!remarks || !remarks.trim()) return res.status(422).json({ success: false, message: 'Rejection reason is required.' });

  try {
    const apprRes = await pool.query(
      `SELECT a.*, r.title AS rfq_title, u.full_name AS officer_name, u.email AS officer_email
       FROM approvals a JOIN rfqs r ON r.id=a.rfq_id JOIN users u ON u.id=a.requested_by
       WHERE a.id=$1 AND a.manager_id=$2`, [req.params.id, mid]
    );
    if (!apprRes.rows.length) return res.status(404).json({ success: false, message: 'Approval not found.' });
    const appr = apprRes.rows[0];
    if (appr.status !== 'pending') return res.status(400).json({ success: false, message: `Cannot reject — status is ${appr.status}.` });

    await pool.query(
      `UPDATE approvals SET status='rejected', approved_by=$1, resolved_at=NOW(), notes=$2, updated_at=NOW()
       WHERE id=$3`, [mid, remarks.trim(), req.params.id]
    );
    await pool.query(`UPDATE rfqs SET status='rejected', updated_at=NOW() WHERE id=$1`, [appr.rfq_id]);

    await createNotification({ userId: appr.requested_by, title: 'Approval Rejected ❌',
      message: `Your request for RFQ "${appr.rfq_title}" was rejected. Reason: ${remarks}`,
      type: 'error', link: '/procurement/approvals' });

    sendDecisionEmail(appr.officer_email, appr.officer_name, appr.rfq_title, 'rejected', remarks).catch(()=>{});

    await log({ userId: mid, action: 'APPROVAL_REJECTED', entityType: 'approval', entityId: req.params.id,
      description: `Manager rejected RFQ: ${appr.rfq_title}. Reason: ${remarks}` });

    return res.json({ success: true, message: 'Request rejected. Procurement Officer notified.' });
  } catch (err) {
    console.error('Reject error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to reject request.' });
  }
};

// PATCH /api/manager/approvals/:id/priority
exports.setPriority = async (req, res) => {
  const { priority } = req.body;
  const valid = ['low','normal','high','urgent'];
  if (!valid.includes(priority)) return res.status(422).json({ success: false, message: 'Invalid priority.' });
  try {
    await pool.query(`UPDATE approvals SET priority=$1 WHERE id=$2 AND manager_id=$3`, [priority, req.params.id, req.user.id]);
    return res.json({ success: true, message: 'Priority updated.' });
  } catch (err) { return res.status(500).json({ success: false, message: 'Failed.' }); }
};

// GET /api/manager/approvals/history/:id
exports.getHistory = async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT ah.*, u.full_name AS performed_by_name FROM approval_history ah
       LEFT JOIN users u ON u.id=ah.performed_by
       WHERE ah.approval_id=$1 ORDER BY ah.performed_at ASC`, [req.params.id]
    );
    return res.json({ success: true, history: r.rows });
  } catch (err) { return res.status(500).json({ success: false, message: 'Failed.' }); }
};
