/**
 * Admin Reports Controller — CSV + JSON exports
 */

const pool = require('../../config/db');

function buildDateFilter(from, to, col = 'created_at') {
  const conditions = [];
  const params = [];
  let idx = 1;
  if (from) { conditions.push(`${col} >= $${idx}`); params.push(from); idx++; }
  if (to)   { conditions.push(`${col} <= $${idx}`); params.push(to);   idx++; }
  return { conditions, params, idx };
}

function toCSV(rows) {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const lines   = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map(h => {
      const v = row[h] == null ? '' : String(row[h]);
      return v.includes(',') || v.includes('"') || v.includes('\n')
        ? `"${v.replace(/"/g, '""')}"` : v;
    }).join(','));
  }
  return lines.join('\n');
}

// ── Helpers ────────────────────────────────────────────────

async function getUsersReport(filters) {
  const { from, to, role, status } = filters;
  let where = `WHERE role != 'admin'`;
  const params = [];
  let idx = 1;
  if (from)   { where += ` AND created_at >= $${idx}`; params.push(from); idx++; }
  if (to)     { where += ` AND created_at <= $${idx}`; params.push(to);   idx++; }
  if (role)   { where += ` AND role = $${idx}`;  params.push(role);  idx++; }
  if (status) { where += ` AND status = $${idx}`; params.push(status); idx++; }
  const r = await pool.query(
    `SELECT id, full_name, company_name, email, role, is_verified, status, auth_provider, created_at FROM users ${where} ORDER BY created_at DESC`, params);
  return r.rows;
}

async function getVendorsReport(filters) {
  const { from, to, status, category } = filters;
  let where = 'WHERE 1=1';
  const params = [];
  let idx = 1;
  if (from)     { where += ` AND v.created_at >= $${idx}`; params.push(from); idx++; }
  if (to)       { where += ` AND v.created_at <= $${idx}`; params.push(to);   idx++; }
  if (status)   { where += ` AND v.status = $${idx}`;   params.push(status);   idx++; }
  if (category) { where += ` AND v.category = $${idx}`; params.push(category); idx++; }
  const r = await pool.query(
    `SELECT v.id, v.vendor_name, v.company_name, v.gst_number, v.contact_person, v.email,
       v.phone, v.address, v.category, v.status, v.created_at,
       (SELECT COUNT(*) FROM rfq_vendors rv WHERE rv.vendor_id=v.id) AS assigned_rfqs,
       (SELECT COUNT(*) FROM quotations q  WHERE q.vendor_id=v.id)   AS quotations
     FROM vendors v ${where} ORDER BY v.created_at DESC`, params);
  return r.rows;
}

async function getRfqsReport(filters) {
  const { from, to, status } = filters;
  let where = 'WHERE 1=1';
  const params = [];
  let idx = 1;
  if (from)   { where += ` AND r.created_at >= $${idx}`; params.push(from); idx++; }
  if (to)     { where += ` AND r.created_at <= $${idx}`; params.push(to);   idx++; }
  if (status) { where += ` AND r.status = $${idx}`;  params.push(status);   idx++; }
  const res = await pool.query(
    `SELECT r.id, r.title, r.status, r.deadline, u.full_name AS created_by,
       (SELECT COUNT(*) FROM rfq_vendors rv WHERE rv.rfq_id=r.id) AS vendors_assigned,
       (SELECT COUNT(*) FROM quotations q WHERE q.rfq_id=r.id) AS quotations_received,
       r.created_at
     FROM rfqs r LEFT JOIN users u ON u.id=r.created_by ${where} ORDER BY r.created_at DESC`, params);
  return res.rows;
}

async function getPOReport(filters) {
  const { from, to, status, vendor } = filters;
  let where = 'WHERE 1=1';
  const params = [];
  let idx = 1;
  if (from)   { where += ` AND po.created_at >= $${idx}`; params.push(from);   idx++; }
  if (to)     { where += ` AND po.created_at <= $${idx}`; params.push(to);     idx++; }
  if (status) { where += ` AND po.status = $${idx}`;  params.push(status);     idx++; }
  if (vendor) { where += ` AND v.vendor_name ILIKE $${idx}`; params.push(`%${vendor}%`); idx++; }
  const res = await pool.query(
    `SELECT po.id, po.po_number, v.vendor_name, po.amount, po.currency,
       po.status, u.full_name AS created_by, po.issued_at, po.created_at
     FROM purchase_orders po
     LEFT JOIN vendors v ON v.id=po.vendor_id
     LEFT JOIN users u   ON u.id=po.created_by
     ${where} ORDER BY po.created_at DESC`, params);
  return res.rows;
}

async function getInvoicesReport(filters) {
  const { from, to, status } = filters;
  let where = 'WHERE 1=1';
  const params = [];
  let idx = 1;
  if (from)   { where += ` AND i.created_at >= $${idx}`; params.push(from); idx++; }
  if (to)     { where += ` AND i.created_at <= $${idx}`; params.push(to);   idx++; }
  if (status) { where += ` AND i.status = $${idx}`;  params.push(status);   idx++; }
  const res = await pool.query(
    `SELECT i.id, i.invoice_number, v.vendor_name, po.po_number,
       i.amount, i.tax_amount, i.total_amount, i.currency,
       i.status, i.due_date, i.paid_at, i.created_at
     FROM invoices i
     LEFT JOIN vendors v        ON v.id=i.vendor_id
     LEFT JOIN purchase_orders po ON po.id=i.po_id
     ${where} ORDER BY i.created_at DESC`, params);
  return res.rows;
}

async function getApprovalsReport(filters) {
  const { from, to, status } = filters;
  let where = 'WHERE 1=1';
  const params = [];
  let idx = 1;
  if (from)   { where += ` AND a.requested_at >= $${idx}`; params.push(from); idx++; }
  if (to)     { where += ` AND a.requested_at <= $${idx}`; params.push(to);   idx++; }
  if (status) { where += ` AND a.status = $${idx}`;  params.push(status);     idx++; }
  const res = await pool.query(
    `SELECT a.id, a.entity_type, a.status, a.notes,
       u1.full_name AS requested_by, u2.full_name AS approved_by,
       a.requested_at, a.resolved_at
     FROM approvals a
     LEFT JOIN users u1 ON u1.id=a.requested_by
     LEFT JOIN users u2 ON u2.id=a.approved_by
     ${where} ORDER BY a.requested_at DESC`, params);
  return res.rows;
}

const REPORT_MAP = {
  users:     getUsersReport,
  vendors:   getVendorsReport,
  rfqs:      getRfqsReport,
  purchase_orders: getPOReport,
  invoices:  getInvoicesReport,
  approvals: getApprovalsReport,
};

// GET /api/admin/reports/:type
exports.generateReport = async (req, res) => {
  const { type } = req.params;
  const { format = 'json', from, to, status, category, role, vendor } = req.query;

  const fn = REPORT_MAP[type];
  if (!fn) return res.status(400).json({ success: false, message: `Unknown report type: ${type}` });

  try {
    const rows = await fn({ from, to, status, category, role, vendor });

    if (format === 'csv') {
      const csv = toCSV(rows);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${type}_report_${new Date().toISOString().slice(0,10)}.csv"`);
      return res.send(csv);
    }

    return res.json({ success: true, type, total: rows.length, data: rows });
  } catch (err) {
    console.error('Report error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to generate report.' });
  }
};

// GET /api/admin/reports/summary
exports.getProcurementSummary = async (req, res) => {
  try {
    const { from, to } = req.query;
    let dateFilter = 'WHERE 1=1';
    const params = [];
    let idx = 1;
    if (from) { dateFilter += ` AND po.created_at >= $${idx}`; params.push(from); idx++; }
    if (to)   { dateFilter += ` AND po.created_at <= $${idx}`; params.push(to);   idx++; }

    const summary = await pool.query(
      `SELECT
         COUNT(DISTINCT po.id)   AS total_pos,
         COUNT(DISTINCT po.vendor_id) AS unique_vendors,
         COALESCE(SUM(po.amount),0) AS total_spend,
         COALESCE(AVG(po.amount),0) AS avg_po_value,
         COALESCE(MAX(po.amount),0) AS max_po_value,
         COALESCE(MIN(po.amount) FILTER (WHERE po.amount>0),0) AS min_po_value
       FROM purchase_orders po ${dateFilter}`, params
    );

    return res.json({ success: true, summary: summary.rows[0] });
  } catch (err) {
    console.error('Summary error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to generate summary.' });
  }
};
