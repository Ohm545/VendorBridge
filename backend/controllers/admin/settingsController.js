/**
 * Admin Settings Controller
 */
const pool = require('../../config/db');
const { log } = require('../../services/activityLogger');

exports.getSettings = async (req, res) => {
  try {
    const r = await pool.query(`SELECT id, company_name, company_logo, default_currency, tax_percentage, support_email, updated_at FROM settings LIMIT 1`);
    if (!r.rows.length) return res.status(404).json({ success: false, message: 'Settings not found.' });
    return res.json({ success: true, settings: r.rows[0] });
  } catch (err) {
    console.error('Get settings error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch settings.' });
  }
};

exports.updateSettings = async (req, res) => {
  const { company_name, default_currency, tax_percentage, support_email, company_logo } = req.body;

  try {
    const existing = await pool.query(`SELECT id FROM settings LIMIT 1`);
    let result;

    if (!existing.rows.length) {
      result = await pool.query(
        `INSERT INTO settings (company_name, default_currency, tax_percentage, support_email, company_logo)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [company_name || 'VendorBridge', default_currency || 'INR',
         tax_percentage || 18.00, support_email || '', company_logo || null]
      );
    } else {
      result = await pool.query(
        `UPDATE settings SET
           company_name     = COALESCE($1, company_name),
           default_currency = COALESCE($2, default_currency),
           tax_percentage   = COALESCE($3, tax_percentage),
           support_email    = COALESCE($4, support_email),
           company_logo     = COALESCE($5, company_logo),
           updated_at       = NOW()
         WHERE id = $6 RETURNING *`,
        [company_name, default_currency, tax_percentage, support_email, company_logo, existing.rows[0].id]
      );
    }

    await log({ userId: req.user.id, action: 'SETTINGS_UPDATED', entityType: 'settings', entityId: result.rows[0].id,
      description: `Admin updated system settings` });

    return res.json({ success: true, message: 'Settings saved.', settings: result.rows[0] });
  } catch (err) {
    console.error('Update settings error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to save settings.' });
  }
};
