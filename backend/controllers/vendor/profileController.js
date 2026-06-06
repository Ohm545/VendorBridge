/**
 * Vendor Profile Controller
 */
const pool = require('../../config/db');
const { getVendorId } = require('./dashboardController');
const { log } = require('../../services/activityLogger');

exports.getProfile = async (req, res) => {
  const uid = req.user.id;
  try {
    const result = await pool.query(`SELECT v.*, u.email AS login_email, u.full_name, u.status AS account_status, u.created_at AS account_created
      FROM vendors v JOIN users u ON u.id=v.user_id WHERE v.user_id=$1`, [uid]);
    if (!result.rows.length) return res.status(404).json({ success: false, message: 'Vendor profile not found.' });
    return res.json({ success: true, profile: result.rows[0] });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to load profile.' });
  }
};

exports.updateProfile = async (req, res) => {
  const uid = req.user.id;
  const { contact_person, phone, address, company_name } = req.body;
  try {
    const vid = await getVendorId(uid);
    if (!vid) return res.status(404).json({ success: false, message: 'Vendor not found.' });

    const result = await pool.query(`UPDATE vendors SET
      contact_person=COALESCE($1,contact_person),
      phone=COALESCE($2,phone),
      address=COALESCE($3,address),
      company_name=COALESCE($4,company_name),
      updated_at=NOW()
      WHERE id=$5 RETURNING *`,
      [contact_person?.trim(), phone?.trim(), address?.trim(), company_name?.trim(), vid]);

    await log({ userId: uid, action: 'PROFILE_UPDATED', entityType: 'vendor', entityId: vid,
      description: `Vendor updated profile information` });

    return res.json({ success: true, message: 'Profile updated successfully.', vendor: result.rows[0] });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to update profile.' });
  }
};
