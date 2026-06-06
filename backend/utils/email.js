/**
 * Nodemailer email service
 */

const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host:   process.env.EMAIL_HOST   || 'smtp.gmail.com',
  port:   parseInt(process.env.EMAIL_PORT) || 587,
  secure: process.env.EMAIL_SECURE === 'true',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const FROM    = process.env.EMAIL_FROM || '"VendorBridge" <noreply@vendorbridge.com>';
const BASE_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

// ── Email verification ──────────────────────────────────────
async function sendVerificationEmail(to, fullName, token) {
  const link = `${BASE_URL}/auth/verify-email/${token}`;
  await transporter.sendMail({
    from:    FROM,
    to,
    subject: 'Verify your VendorBridge account',
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <style>
    body { font-family: 'Inter', Arial, sans-serif; background: #f8fafc; margin: 0; padding: 40px 20px; }
    .card { background: #fff; border-radius: 16px; padding: 40px; max-width: 520px; margin: 0 auto; border: 1px solid #e2e8f0; }
    .logo { display: flex; align-items: center; gap: 10px; margin-bottom: 32px; }
    .logo-box { width: 36px; height: 36px; background: #0a0f1e; border-radius: 8px; display: flex; align-items: center; justify-content: center; }
    .logo span { font-size: 18px; font-weight: 700; color: #0a0f1e; }
    h1 { font-size: 24px; font-weight: 700; color: #0a0f1e; margin: 0 0 12px; }
    p  { font-size: 15px; color: #64748b; line-height: 1.7; margin: 0 0 24px; }
    .btn { display: inline-block; background: #0a0f1e; color: #fff; padding: 14px 28px; border-radius: 10px; font-size: 15px; font-weight: 600; text-decoration: none; }
    .divider { border: none; border-top: 1px solid #e2e8f0; margin: 28px 0; }
    .footer { font-size: 13px; color: #94a3b8; text-align: center; margin-top: 32px; }
    .link { color: #2563eb; word-break: break-all; font-size: 13px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">
      <div class="logo-box">📦</div>
      <span>VendorBridge</span>
    </div>
    <h1>Verify your email</h1>
    <p>Hi ${fullName},</p>
    <p>Thanks for signing up for VendorBridge. Click the button below to verify your email address and activate your account.</p>
    <a href="${link}" class="btn">Verify Email Address</a>
    <hr class="divider"/>
    <p style="font-size:13px; color:#94a3b8;">If the button doesn't work, copy this link into your browser:</p>
    <a href="${link}" class="link">${link}</a>
    <p style="font-size:13px; color:#94a3b8; margin-top: 16px;">This link expires in 24 hours.</p>
    <div class="footer">VendorBridge — Procurement &amp; Vendor Management ERP<br/>You received this email because you created an account.</div>
  </div>
</body>
</html>`,
  });
}

// ── Password reset ──────────────────────────────────────────
async function sendPasswordResetEmail(to, fullName, token) {
  const link = `${BASE_URL}/pages/reset-password.html?token=${token}`;
  await transporter.sendMail({
    from:    FROM,
    to,
    subject: 'Reset your VendorBridge password',
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <style>
    body { font-family: 'Inter', Arial, sans-serif; background: #f8fafc; margin: 0; padding: 40px 20px; }
    .card { background: #fff; border-radius: 16px; padding: 40px; max-width: 520px; margin: 0 auto; border: 1px solid #e2e8f0; }
    .logo { display: flex; align-items: center; gap: 10px; margin-bottom: 32px; }
    .logo span { font-size: 18px; font-weight: 700; color: #0a0f1e; }
    h1 { font-size: 24px; font-weight: 700; color: #0a0f1e; margin: 0 0 12px; }
    p  { font-size: 15px; color: #64748b; line-height: 1.7; margin: 0 0 24px; }
    .btn { display: inline-block; background: #0a0f1e; color: #fff; padding: 14px 28px; border-radius: 10px; font-size: 15px; font-weight: 600; text-decoration: none; }
    .warn { background: #fffbeb; border: 1px solid #fcd34d; border-radius: 10px; padding: 14px 18px; font-size: 13px; color: #92400e; margin-top: 24px; }
    .divider { border: none; border-top: 1px solid #e2e8f0; margin: 28px 0; }
    .footer { font-size: 13px; color: #94a3b8; text-align: center; margin-top: 32px; }
    .link { color: #2563eb; word-break: break-all; font-size: 13px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">
      <span>📦 VendorBridge</span>
    </div>
    <h1>Reset your password</h1>
    <p>Hi ${fullName},</p>
    <p>We received a request to reset your VendorBridge password. Click the button below to choose a new password.</p>
    <a href="${link}" class="btn">Reset Password</a>
    <hr class="divider"/>
    <p style="font-size:13px; color:#94a3b8;">If the button doesn't work, copy this link:</p>
    <a href="${link}" class="link">${link}</a>
    <div class="warn">⚠️ This link expires in 1 hour. If you didn't request a password reset, you can safely ignore this email.</div>
    <div class="footer">VendorBridge — Procurement &amp; Vendor Management ERP</div>
  </div>
</body>
</html>`,
  });
}

module.exports = { sendVerificationEmail, sendPasswordResetEmail };
