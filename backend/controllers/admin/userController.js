/**
 * Admin User Management Controller
 */

const bcrypt   = require('bcryptjs');
const pool     = require('../../config/db');
const { generateTempPassword } = require('../../utils/passwordGen');
const { log }  = require('../../services/activityLogger');
const { notifyAdmins, createNotification } = require('../../services/notificationService');
const nodemailer = require('nodemailer');

const ALLOWED_ROLES = ['procurement_officer', 'manager', 'vendor'];

// ── Mailer ────────────────────────────────────────────────
function getTransporter() {
  return nodemailer.createTransport({
    host:   process.env.EMAIL_HOST,
    port:   parseInt(process.env.EMAIL_PORT) || 587,
    secure: process.env.EMAIL_SECURE === 'true',
    auth:   { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
  });
}

async function sendWelcomeEmail(to, fullName, tempPassword, role) {
  try {
    const transporter = getTransporter();
    await transporter.sendMail({
      from:    process.env.EMAIL_FROM || '"VendorBridge" <noreply@vendorbridge.com>',
      to,
      subject: 'Your VendorBridge Account',
      html: `
        <div style="font-family:Inter,Arial,sans-serif;background:#f8fafc;padding:40px 20px;">
          <div style="background:#fff;border-radius:16px;padding:40px;max-width:520px;margin:0 auto;border:1px solid #e2e8f0;">
            <h2 style="color:#0a0f1e;margin:0 0 8px;">Welcome to VendorBridge</h2>
            <p style="color:#64748b;">Hi ${fullName},</p>
            <p style="color:#64748b;">Your account has been created by an administrator. Here are your login details:</p>
            <div style="background:#f1f5f9;border-radius:10px;padding:16px 20px;margin:20px 0;">
              <p style="margin:0 0 8px;color:#334155;font-size:13px;"><strong>Email:</strong> ${to}</p>
              <p style="margin:0 0 8px;color:#334155;font-size:13px;"><strong>Temporary Password:</strong> <code style="background:#e2e8f0;padding:2px 8px;border-radius:4px;">${tempPassword}</code></p>
              <p style="margin:0;color:#334155;font-size:13px;"><strong>Role:</strong> ${role.replace('_', ' ').toUpperCase()}</p>
            </div>
            <p style="color:#dc2626;font-size:13px;">Please change your password immediately after logging in.</p>
            <a href="${process.env.FRONTEND_URL}/pages/login.html" style="display:inline-block;background:#0a0f1e;color:#fff;padding:13px 24px;border-radius:10px;text-decoration:none;font-weight:600;">Login Now</a>
            <p style="color:#94a3b8;font-size:12px;margin-top:24px;">VendorBridge — Procurement & Vendor Management ERP</p>
          </div>
        </div>`,
    });
  } catch (err) {
    console.error('Welcome email error:', err.message);
  }
}

// ── GET /api/admin/users ──────────────────────────────────
exports.getUsers = async (req, res) => {
  try {
    const page    = Math.max(1, parseInt(req.query.page) || 1);
    const limit   = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const offset  = (page - 1) * limit;
    const search  = (req.query.search || '').trim();
    const role    = req.query.role || '';
    const status  = req.query.status || '';

    let where = `WHERE role != 'admin'`;
    const params = [];
    let idx = 1;

    if (search) {
      where += ` AND (full_name ILIKE $${idx} OR email ILIKE $${idx} OR company_name ILIKE $${idx})`;
      params.push(`%${search}%`);
      idx++;
    }
    if (role) {
      where += ` AND role = $${idx}`;
      params.push(role);
      idx++;
    }
    if (status) {
      where += ` AND status = $${idx}`;
      params.push(status);
      idx++;
    }

    const countRes = await pool.query(`SELECT COUNT(*) FROM users ${where}`, params);
    const total = parseInt(countRes.rows[0].count);

    const usersRes = await pool.query(
      `SELECT id, full_name, company_name, email, role, is_verified, status, auth_provider, created_at, updated_at
       FROM users ${where}
       ORDER BY created_at DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, limit, offset]
    );

    return res.json({
      success: true,
      data: {
        users: usersRes.rows,
        pagination: { total, page, limit, pages: Math.ceil(total / limit) },
      },
    });
  } catch (err) {
    console.error('Get users error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch users.' });
  }
};

// ── GET /api/admin/users/:id ──────────────────────────────
exports.getUserById = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, full_name, company_name, email, role, is_verified, status, auth_provider, created_at, updated_at
       FROM users WHERE id = $1`,
      [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ success: false, message: 'User not found.' });
    return res.json({ success: true, user: result.rows[0] });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to fetch user.' });
  }
};

// ── POST /api/admin/users ─────────────────────────────────
exports.createUser = async (req, res) => {
  const { full_name, company_name, email, role } = req.body;

  if (!full_name || !company_name || !email || !role) {
    return res.status(422).json({ success: false, message: 'All fields are required.' });
  }
  if (!ALLOWED_ROLES.includes(role)) {
    return res.status(422).json({ success: false, message: 'Invalid role.' });
  }

  try {
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase().trim()]);
    if (existing.rows.length) {
      return res.status(409).json({ success: false, message: 'An account with this email already exists.' });
    }

    const tempPw = generateTempPassword();
    const salt   = await bcrypt.genSalt(12);
    const hash   = await bcrypt.hash(tempPw, salt);

    const userRes = await pool.query(
      `INSERT INTO users (full_name, company_name, email, password_hash, role, is_verified, status)
       VALUES ($1, $2, $3, $4, $5, TRUE, 'active')
       RETURNING id, full_name, company_name, email, role, is_verified, status, created_at`,
      [full_name.trim(), company_name.trim(), email.toLowerCase().trim(), hash, role]
    );
    const user = userRes.rows[0];

    // Send welcome email with temp password
    await sendWelcomeEmail(user.email, user.full_name, tempPw, role);

    // Log + notify
    await log({ userId: req.user.id, action: 'USER_CREATED', entityType: 'user', entityId: user.id,
      description: `Admin created user ${user.full_name} (${user.email}) with role ${role}` });

    await notifyAdmins({ title: 'New User Created', message: `${user.full_name} (${role}) was created by admin.`, type: 'info' });

    return res.status(201).json({ success: true, message: 'User created and welcome email sent.', user });
  } catch (err) {
    console.error('Create user error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to create user.' });
  }
};

// ── PUT /api/admin/users/:id ──────────────────────────────
exports.updateUser = async (req, res) => {
  const { full_name, company_name } = req.body;
  const { id } = req.params;

  try {
    const existing = await pool.query('SELECT id, role FROM users WHERE id = $1', [id]);
    if (!existing.rows.length) return res.status(404).json({ success: false, message: 'User not found.' });
    if (existing.rows[0].role === 'admin') {
      return res.status(403).json({ success: false, message: 'Cannot edit admin account.' });
    }

    const result = await pool.query(
      `UPDATE users SET full_name = COALESCE($1, full_name), company_name = COALESCE($2, company_name), updated_at = NOW()
       WHERE id = $3
       RETURNING id, full_name, company_name, email, role, is_verified, status`,
      [full_name?.trim(), company_name?.trim(), id]
    );

    await log({ userId: req.user.id, action: 'USER_UPDATED', entityType: 'user', entityId: id,
      description: `Admin updated user ${result.rows[0].full_name}` });

    return res.json({ success: true, message: 'User updated.', user: result.rows[0] });
  } catch (err) {
    console.error('Update user error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to update user.' });
  }
};

// ── PATCH /api/admin/users/:id/role ──────────────────────
exports.changeRole = async (req, res) => {
  const { role } = req.body;
  const { id }   = req.params;

  if (!role || !ALLOWED_ROLES.includes(role)) {
    return res.status(422).json({ success: false, message: 'Invalid role. Allowed: ' + ALLOWED_ROLES.join(', ') });
  }

  try {
    const existing = await pool.query('SELECT id, role, full_name, email FROM users WHERE id = $1', [id]);
    if (!existing.rows.length) return res.status(404).json({ success: false, message: 'User not found.' });
    if (existing.rows[0].role === 'admin') {
      return res.status(403).json({ success: false, message: 'Cannot change admin role.' });
    }

    const result = await pool.query(
      `UPDATE users SET role = $1, updated_at = NOW() WHERE id = $2 RETURNING id, full_name, email, role, status`,
      [role, id]
    );

    await log({ userId: req.user.id, action: 'ROLE_CHANGED', entityType: 'user', entityId: id,
      description: `Admin changed ${existing.rows[0].full_name}'s role from ${existing.rows[0].role} to ${role}` });

    return res.json({ success: true, message: 'Role updated.', user: result.rows[0] });
  } catch (err) {
    console.error('Change role error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to change role.' });
  }
};

// ── PATCH /api/admin/users/:id/status ────────────────────
exports.toggleStatus = async (req, res) => {
  const { status } = req.body;
  const { id }     = req.params;

  if (!['active','inactive','suspended'].includes(status)) {
    return res.status(422).json({ success: false, message: 'Invalid status.' });
  }

  try {
    const existing = await pool.query('SELECT id, role, full_name FROM users WHERE id = $1', [id]);
    if (!existing.rows.length) return res.status(404).json({ success: false, message: 'User not found.' });
    if (existing.rows[0].role === 'admin') {
      return res.status(403).json({ success: false, message: 'Cannot change admin status.' });
    }

    const result = await pool.query(
      `UPDATE users SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING id, full_name, email, role, status`,
      [status, id]
    );

    await log({ userId: req.user.id, action: 'USER_STATUS_CHANGED', entityType: 'user', entityId: id,
      description: `Admin set ${existing.rows[0].full_name}'s status to ${status}` });

    return res.json({ success: true, message: `User ${status}.`, user: result.rows[0] });
  } catch (err) {
    console.error('Toggle status error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to update status.' });
  }
};

// ── POST /api/admin/users/:id/reset-password ─────────────
exports.resetPassword = async (req, res) => {
  const { id } = req.params;

  try {
    const existing = await pool.query('SELECT id, role, full_name, email FROM users WHERE id = $1', [id]);
    if (!existing.rows.length) return res.status(404).json({ success: false, message: 'User not found.' });
    if (existing.rows[0].role === 'admin') {
      return res.status(403).json({ success: false, message: 'Cannot reset admin password from here.' });
    }

    const tempPw = generateTempPassword();
    const salt   = await bcrypt.genSalt(12);
    const hash   = await bcrypt.hash(tempPw, salt);

    await pool.query(`UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`, [hash, id]);

    const user = existing.rows[0];
    await sendWelcomeEmail(user.email, user.full_name, tempPw, existing.rows[0].role);

    await log({ userId: req.user.id, action: 'PASSWORD_RESET', entityType: 'user', entityId: id,
      description: `Admin reset password for ${user.full_name} (${user.email})` });

    return res.json({ success: true, message: 'Password reset. New temporary password sent via email.' });
  } catch (err) {
    console.error('Reset pw error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to reset password.' });
  }
};
