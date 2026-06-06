/**
 * Admin Analytics Controller with AI Insights
 */

const pool = require('../../config/db');
const aiService = require('../../services/aiService');

// GET /api/admin/analytics/overview
exports.getProcurementOverview = async (req, res) => {
  try {
    const [rfqs, approvals, pos, invoices, spend] = await Promise.all([
      pool.query(`SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE status='active')    AS open,
        COUNT(*) FILTER (WHERE status='closed')    AS closed,
        COUNT(*) FILTER (WHERE status='cancelled') AS cancelled
        FROM rfqs`),
      pool.query(`SELECT
        COUNT(*) FILTER (WHERE status='pending')  AS pending,
        COUNT(*) FILTER (WHERE status='approved') AS approved,
        COUNT(*) FILTER (WHERE status='rejected') AS rejected
        FROM approvals`),
      pool.query(`SELECT COUNT(*) AS total FROM purchase_orders WHERE status != 'cancelled'`),
      pool.query(`SELECT COUNT(*) AS total FROM invoices`),
      pool.query(`SELECT COALESCE(SUM(amount),0) AS total FROM purchase_orders WHERE status != 'cancelled'`),
    ]);

    return res.json({
      success: true,
      data: {
        rfqs: { ...rfqs.rows[0] },
        approvals: { ...approvals.rows[0] },
        purchase_orders: parseInt(pos.rows[0].total),
        invoices: parseInt(invoices.rows[0].total),
        total_spend: parseFloat(spend.rows[0].total),
      },
    });
  } catch (err) {
    console.error('Analytics overview error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load analytics.' });
  }
};

// GET /api/admin/analytics/rfq-funnel
exports.getRfqFunnel = async (req, res) => {
  try {
    const [created, assigned, submitted, approved, poGen, invGen] = await Promise.all([
      pool.query(`SELECT COUNT(*) FROM rfqs`),
      pool.query(`SELECT COUNT(DISTINCT rfq_id) FROM rfq_vendors`),
      pool.query(`SELECT COUNT(DISTINCT rfq_id) FROM quotations`),
      pool.query(`SELECT COUNT(DISTINCT entity_id) FROM approvals WHERE entity_type='rfq' AND status='approved'`),
      pool.query(`SELECT COUNT(DISTINCT rfq_id) FROM purchase_orders`),
      pool.query(`SELECT COUNT(DISTINCT po.rfq_id) FROM invoices i JOIN purchase_orders po ON po.id = i.po_id`),
    ]);

    const c = parseInt(created.rows[0].count);
    const a = parseInt(assigned.rows[0].count);
    const s = parseInt(submitted.rows[0].count);
    const ap = parseInt(approved.rows[0].count);
    const po = parseInt(poGen.rows[0].count);
    const inv = parseInt(invGen.rows[0].count);

    const pct = (n, d) => d > 0 ? Math.round((n / d) * 100) : 0;

    return res.json({
      success: true,
      funnel: [
        { stage: 'RFQs Created',       count: c,  pct: 100 },
        { stage: 'Vendors Assigned',    count: a,  pct: pct(a, c) },
        { stage: 'Quotations Received', count: s,  pct: pct(s, c) },
        { stage: 'Approvals Granted',   count: ap, pct: pct(ap, c) },
        { stage: 'POs Generated',       count: po, pct: pct(po, c) },
        { stage: 'Invoices Generated',  count: inv, pct: pct(inv, c) },
      ],
    });
  } catch (err) {
    console.error('RFQ funnel error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load funnel.' });
  }
};

// GET /api/admin/analytics/vendors
exports.getVendorAnalytics = async (req, res) => {
  try {
    const topVendors = await pool.query(
      `SELECT v.id, v.vendor_name, v.category,
         COUNT(DISTINCT rv.rfq_id) AS assigned_rfqs,
         COUNT(DISTINCT q.id)      AS quotations,
         COUNT(DISTINCT q.id) FILTER (WHERE q.status='approved') AS approved,
         CASE WHEN COUNT(DISTINCT rv.rfq_id)>0
              THEN ROUND((COUNT(DISTINCT q.rfq_id)::numeric / COUNT(DISTINCT rv.rfq_id)) * 100)
              ELSE 0 END AS response_rate,
         CASE WHEN COUNT(DISTINCT q.id)>0
              THEN ROUND((COUNT(DISTINCT q.id) FILTER (WHERE q.status='approved')::numeric / COUNT(DISTINCT q.id)) * 100)
              ELSE 0 END AS approval_rate
       FROM vendors v
       LEFT JOIN rfq_vendors rv ON rv.vendor_id = v.id
       LEFT JOIN quotations q   ON q.vendor_id  = v.id
       WHERE v.status = 'active'
       GROUP BY v.id, v.vendor_name, v.category
       ORDER BY quotations DESC, response_rate DESC
       LIMIT 10`
    );

    return res.json({ success: true, vendors: topVendors.rows });
  } catch (err) {
    console.error('Vendor analytics error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load vendor analytics.' });
  }
};

// GET /api/admin/analytics/approvals
exports.getApprovalAnalytics = async (req, res) => {
  try {
    const stats = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE status='pending')  AS pending,
         COUNT(*) FILTER (WHERE status='approved') AS approved,
         COUNT(*) FILTER (WHERE status='rejected') AS rejected,
         ROUND(AVG(EXTRACT(EPOCH FROM (resolved_at - requested_at))/3600) FILTER (WHERE resolved_at IS NOT NULL), 1) AS avg_hours
       FROM approvals`
    );

    const fastest = await pool.query(
      `SELECT u.full_name, COUNT(*) AS count,
         ROUND(AVG(EXTRACT(EPOCH FROM (a.resolved_at - a.requested_at))/3600), 1) AS avg_hours
       FROM approvals a
       JOIN users u ON u.id = a.approved_by
       WHERE a.status='approved' AND a.resolved_at IS NOT NULL
       GROUP BY u.id, u.full_name
       ORDER BY avg_hours ASC LIMIT 3`
    );

    const slowest = await pool.query(
      `SELECT u.full_name, COUNT(*) AS count,
         ROUND(AVG(EXTRACT(EPOCH FROM (a.resolved_at - a.requested_at))/3600), 1) AS avg_hours
       FROM approvals a
       JOIN users u ON u.id = a.approved_by
       WHERE a.status='approved' AND a.resolved_at IS NOT NULL
       GROUP BY u.id, u.full_name
       ORDER BY avg_hours DESC LIMIT 3`
    );

    return res.json({
      success: true,
      data: { stats: stats.rows[0], fastest: fastest.rows, slowest: slowest.rows },
    });
  } catch (err) {
    console.error('Approval analytics error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load approval analytics.' });
  }
};

// GET /api/admin/analytics/spend
exports.getSpendAnalytics = async (req, res) => {
  try {
    const { period = 'monthly' } = req.query;

    let trunc, interval;
    if (period === 'quarterly') { trunc = 'quarter'; interval = '11 quarters'; }
    else if (period === 'yearly') { trunc = 'year'; interval = '4 years'; }
    else { trunc = 'month'; interval = '11 months'; }

    const trend = await pool.query(
      `SELECT DATE_TRUNC($1, created_at) AS period,
         COALESCE(SUM(amount),0) AS spend, COUNT(*) AS po_count
       FROM purchase_orders
       WHERE status != 'cancelled' AND created_at >= DATE_TRUNC($1, NOW() - INTERVAL '${interval}')
       GROUP BY period ORDER BY period ASC`,
      [trunc]
    );

    const byCategory = await pool.query(
      `SELECT v.category, COALESCE(SUM(po.amount),0) AS spend, COUNT(po.id) AS pos
       FROM purchase_orders po
       JOIN vendors v ON v.id = po.vendor_id
       WHERE po.status != 'cancelled'
       GROUP BY v.category
       ORDER BY spend DESC LIMIT 8`
    );

    const byVendor = await pool.query(
      `SELECT v.vendor_name, COALESCE(SUM(po.amount),0) AS spend, COUNT(po.id) AS pos
       FROM purchase_orders po
       JOIN vendors v ON v.id = po.vendor_id
       WHERE po.status != 'cancelled'
       GROUP BY v.id, v.vendor_name
       ORDER BY spend DESC LIMIT 8`
    );

    return res.json({
      success: true,
      data: { trend: trend.rows, by_category: byCategory.rows, by_vendor: byVendor.rows },
    });
  } catch (err) {
    console.error('Spend analytics error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load spend analytics.' });
  }
};

// GET /api/admin/analytics/ai-insights
exports.getAIInsights = async (req, res) => {
  try {
    const { type = 'spending', period = '30' } = req.query;

    let insights = {};

    switch (type) {
      case 'spending':
        // Get recent spending data
        const spendData = await pool.query(`
          SELECT 
            DATE_TRUNC('week', created_at) as week,
            SUM(amount) as total_amount,
            COUNT(*) as transaction_count,
            AVG(amount) as avg_amount
          FROM purchase_orders 
          WHERE created_at >= NOW() - INTERVAL '${parseInt(period)} days'
          AND status != 'cancelled'
          GROUP BY week
          ORDER BY week DESC
        `);

        insights = await aiService.analyzeSpendingTrends({
          period_days: parseInt(period),
          spending_data: spendData.rows,
          summary: {
            total_transactions: spendData.rows.reduce((sum, row) => sum + parseInt(row.transaction_count), 0),
            total_amount: spendData.rows.reduce((sum, row) => sum + parseFloat(row.total_amount), 0)
          }
        });
        break;

      case 'vendors':
        // Get vendor performance data
        const vendorData = await pool.query(`
          SELECT 
            v.vendor_name,
            v.category,
            COUNT(DISTINCT rv.rfq_id) as rfqs_assigned,
            COUNT(DISTINCT q.id) as quotations_submitted,
            COUNT(DISTINCT CASE WHEN q.status = 'approved' THEN q.id END) as quotes_approved,
            AVG(q.quoted_amount) as avg_quote_amount,
            AVG(q.delivery_days) as avg_delivery_days
          FROM vendors v
          LEFT JOIN rfq_vendors rv ON v.id = rv.vendor_id
          LEFT JOIN quotations q ON v.id = q.vendor_id
          WHERE v.status = 'active'
          GROUP BY v.id, v.vendor_name, v.category
          HAVING COUNT(DISTINCT rv.rfq_id) > 0
        `);

        insights = await aiService.analyzeVendorPerformance({
          vendors: vendorData.rows,
          analysis_period: parseInt(period)
        });
        break;

      case 'approvals':
        // Get approval workflow data
        const approvalData = await pool.query(`
          SELECT 
            status,
            COUNT(*) as count,
            AVG(EXTRACT(EPOCH FROM (COALESCE(resolved_at, NOW()) - requested_at))/3600) as avg_hours,
            priority,
            DATE_TRUNC('day', requested_at) as request_date
          FROM approvals
          WHERE requested_at >= NOW() - INTERVAL '${parseInt(period)} days'
          GROUP BY status, priority, DATE_TRUNC('day', requested_at)
          ORDER BY request_date DESC
        `);

        insights = await aiService.predictApprovalBottlenecks({
          approvals: approvalData.rows,
          period_days: parseInt(period)
        });
        break;

      case 'rfq':
        // Get RFQ performance data
        const rfqData = await pool.query(`
          SELECT 
            r.status,
            r.product_category,
            COUNT(*) as rfq_count,
            AVG(r.expected_budget) as avg_budget,
            COUNT(DISTINCT rv.vendor_id) as vendors_per_rfq,
            COUNT(DISTINCT q.id) as quotations_received,
            AVG(EXTRACT(EPOCH FROM (r.updated_at - r.created_at))/24) as avg_completion_days
          FROM rfqs r
          LEFT JOIN rfq_vendors rv ON r.id = rv.rfq_id
          LEFT JOIN quotations q ON r.id = q.rfq_id
          WHERE r.created_at >= NOW() - INTERVAL '${parseInt(period)} days'
          GROUP BY r.status, r.product_category
        `);

        insights = await aiService.generateRFQInsights({
          rfqs: rfqData.rows,
          analysis_period: parseInt(period)
        });
        break;

      default:
        return res.status(400).json({ success: false, message: 'Invalid insight type' });
    }

    return res.json({
      success: true,
      data: {
        type,
        period: parseInt(period),
        generated_at: new Date().toISOString(),
        insights
      }
    });

  } catch (error) {
    console.error('AI Insights Error:', error.message);
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to generate AI insights',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};