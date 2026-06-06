/**
 * Admin Dashboard Controller
 * Provides all KPI metrics and smart insights
 */

const pool = require('../../config/db');

exports.getStats = async (req, res) => {
  try {
    const [
      usersRes, vendorsRes, rfqsRes, approvalsRes,
      poRes, invoicesRes, spendRes, quotationRes, assignedRes
    ] = await Promise.all([
      pool.query(`SELECT COUNT(*) FROM users WHERE role != 'admin'`),
      pool.query(`SELECT COUNT(*) FROM vendors`),
      pool.query(`SELECT COUNT(*) FROM rfqs WHERE status = 'active'`),
      pool.query(`SELECT COUNT(*) FROM approvals WHERE status = 'pending'`),
      pool.query(`SELECT COUNT(*) FROM purchase_orders`),
      pool.query(`SELECT COUNT(*) FROM invoices`),
      pool.query(`SELECT COALESCE(SUM(amount),0) AS total FROM purchase_orders WHERE status != 'cancelled'`),
      pool.query(`SELECT COUNT(*) FROM quotations`),
      pool.query(`SELECT COUNT(DISTINCT rfq_id) FROM rfq_vendors`),
    ]);

    const totalRfqs = parseInt(rfqsRes.rows[0].count) || 1;
    const totalQuotations = parseInt(quotationRes.rows[0].count);
    const totalAssigned = parseInt(assignedRes.rows[0].count);
    const vendorResponseRate = totalAssigned > 0
      ? Math.round((totalQuotations / totalAssigned) * 100)
      : 0;

    return res.json({
      success: true,
      data: {
        total_users:          parseInt(usersRes.rows[0].count),
        total_vendors:        parseInt(vendorsRes.rows[0].count),
        active_rfqs:          parseInt(rfqsRes.rows[0].count),
        pending_approvals:    parseInt(approvalsRes.rows[0].count),
        purchase_orders:      parseInt(poRes.rows[0].count),
        invoices:             parseInt(invoicesRes.rows[0].count),
        total_procurement_value: parseFloat(spendRes.rows[0].total),
        vendor_response_rate: vendorResponseRate,
      },
    });
  } catch (err) {
    console.error('Dashboard stats error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load dashboard stats.' });
  }
};

exports.getInsights = async (req, res) => {
  try {
    const insights = [];

    // Pending approvals
    const pendingRes = await pool.query(`SELECT COUNT(*) FROM approvals WHERE status = 'pending'`);
    const pendingCount = parseInt(pendingRes.rows[0].count);
    if (pendingCount > 0) {
      insights.push({
        type: 'warning',
        icon: 'clock',
        text: `${pendingCount} approval${pendingCount > 1 ? 's' : ''} awaiting review`,
      });
    }

    // Overdue invoices
    const overdueRes = await pool.query(
      `SELECT COUNT(*) FROM invoices WHERE status = 'pending' AND due_date < NOW()`
    );
    const overdueCount = parseInt(overdueRes.rows[0].count);
    if (overdueCount > 0) {
      insights.push({ type: 'error', icon: 'alert-triangle', text: `${overdueCount} invoice${overdueCount > 1 ? 's' : ''} overdue` });
    }

    // Top vendor by quotations
    const topVendorRes = await pool.query(
      `SELECT v.vendor_name, COUNT(q.id) as q_count
       FROM vendors v
       LEFT JOIN quotations q ON q.vendor_id = v.id
       WHERE v.status = 'active'
       GROUP BY v.id, v.vendor_name
       ORDER BY q_count DESC LIMIT 1`
    );
    if (topVendorRes.rows.length > 0 && parseInt(topVendorRes.rows[0].q_count) > 0) {
      insights.push({
        type: 'success', icon: 'star',
        text: `${topVendorRes.rows[0].vendor_name} has highest quotation activity`,
      });
    }

    // Monthly spend trend
    const spendTrendRes = await pool.query(
      `SELECT
         COALESCE(SUM(CASE WHEN DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW()) THEN amount END), 0) AS this_month,
         COALESCE(SUM(CASE WHEN DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW() - INTERVAL '1 month') THEN amount END), 0) AS last_month
       FROM purchase_orders WHERE status != 'cancelled'`
    );
    const thisMonth = parseFloat(spendTrendRes.rows[0].this_month);
    const lastMonth = parseFloat(spendTrendRes.rows[0].last_month);
    if (lastMonth > 0 && thisMonth > 0) {
      const pct = Math.round(((thisMonth - lastMonth) / lastMonth) * 100);
      insights.push({
        type: pct >= 0 ? 'info' : 'warning',
        icon: pct >= 0 ? 'trending-up' : 'trending-down',
        text: `Monthly procurement ${pct >= 0 ? 'increased' : 'decreased'} by ${Math.abs(pct)}% vs last month`,
      });
    }

    // New users this week
    const newUsersRes = await pool.query(
      `SELECT COUNT(*) FROM users WHERE created_at > NOW() - INTERVAL '7 days' AND role != 'admin'`
    );
    const newUsers = parseInt(newUsersRes.rows[0].count);
    if (newUsers > 0) {
      insights.push({ type: 'info', icon: 'user-plus', text: `${newUsers} new user${newUsers > 1 ? 's' : ''} registered this week` });
    }

    // Vendors not responded this month
    const noResponseRes = await pool.query(
      `SELECT COUNT(DISTINCT rv.vendor_id) FROM rfq_vendors rv
       LEFT JOIN quotations q ON q.vendor_id = rv.vendor_id AND q.rfq_id = rv.rfq_id
       WHERE rv.assigned_at > DATE_TRUNC('month', NOW()) AND q.id IS NULL`
    );
    const noResponse = parseInt(noResponseRes.rows[0].count);
    if (noResponse > 0) {
      insights.push({ type: 'warning', icon: 'mail-x', text: `${noResponse} vendor${noResponse > 1 ? 's' : ''} have not responded to RFQs this month` });
    }

    if (insights.length === 0) {
      insights.push({ type: 'success', icon: 'check-circle', text: 'All systems running smoothly. No urgent issues.' });
    }

    return res.json({ success: true, insights });
  } catch (err) {
    console.error('Insights error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load insights.' });
  }
};

exports.getMonthlyTrend = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         TO_CHAR(m.month, 'Mon YYYY') AS label,
         TO_CHAR(m.month, 'YYYY-MM') AS period,
         COALESCE(r.rfq_count, 0)    AS rfqs,
         COALESCE(p.po_count, 0)     AS pos,
         COALESCE(i.inv_count, 0)    AS invoices,
         COALESCE(s.spend, 0)        AS spend
       FROM (
         SELECT generate_series(
           DATE_TRUNC('month', NOW() - INTERVAL '11 months'),
           DATE_TRUNC('month', NOW()),
           '1 month'
         ) AS month
       ) m
       LEFT JOIN (
         SELECT DATE_TRUNC('month', created_at) AS mo, COUNT(*) AS rfq_count FROM rfqs GROUP BY mo
       ) r ON r.mo = m.month
       LEFT JOIN (
         SELECT DATE_TRUNC('month', created_at) AS mo, COUNT(*) AS po_count FROM purchase_orders GROUP BY mo
       ) p ON p.mo = m.month
       LEFT JOIN (
         SELECT DATE_TRUNC('month', created_at) AS mo, COUNT(*) AS inv_count FROM invoices GROUP BY mo
       ) i ON i.mo = m.month
       LEFT JOIN (
         SELECT DATE_TRUNC('month', created_at) AS mo, COALESCE(SUM(amount),0) AS spend
         FROM purchase_orders WHERE status != 'cancelled' GROUP BY mo
       ) s ON s.mo = m.month
       ORDER BY m.month ASC`
    );
    return res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('Monthly trend error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load trend data.' });
  }
};
