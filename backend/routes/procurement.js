/**
 * Procurement Officer API Routes
 * All routes: authenticateUser + authorizeRoles('procurement_officer')
 */
const express = require('express');
const router  = express.Router();
const { authenticateUser, authorizeRoles } = require('../middleware/auth');
const { generalLimiter } = require('../middleware/rateLimiter');

const dashCtrl   = require('../controllers/procurement/dashboardController');
const rfqCtrl    = require('../controllers/procurement/rfqController');
const quoteCtrl  = require('../controllers/procurement/quotationController');
const apprCtrl   = require('../controllers/procurement/approvalController');
const poCtrl     = require('../controllers/procurement/poController');
const invCtrl    = require('../controllers/procurement/invoiceController');
const repCtrl    = require('../controllers/procurement/reportsController');
const notifCtrl  = require('../controllers/procurement/notificationController');

router.use(generalLimiter);
router.use(authenticateUser);
router.use(authorizeRoles('procurement_officer'));

// ── Dashboard ────────────────────────────────────────────
router.get('/dashboard/stats',         dashCtrl.getStats);
router.get('/dashboard/insights',      dashCtrl.getInsights);
router.get('/dashboard/monthly-trend', dashCtrl.getMonthlyTrend);

// ── RFQs ─────────────────────────────────────────────────
router.get('/rfqs/categories',              rfqCtrl.getCategories);
router.get('/rfqs',                         rfqCtrl.getRfqs);
router.get('/rfqs/:id',                     rfqCtrl.getRfqById);
router.post('/rfqs',                        rfqCtrl.createRfq);
router.put('/rfqs/:id',                     rfqCtrl.updateRfq);
router.delete('/rfqs/:id',                  rfqCtrl.deleteRfq);
router.post('/rfqs/:id/assign-vendors',     rfqCtrl.assignVendors);
router.patch('/rfqs/:id/preferred-vendor',  rfqCtrl.setPreferredVendor);

// ── Quotations ────────────────────────────────────────────
router.get('/quotations',                   quoteCtrl.getQuotations);
router.get('/quotations/compare/:rfq_id',   quoteCtrl.compareQuotations);

// ── Approvals ─────────────────────────────────────────────
router.get('/approvals',                    apprCtrl.getApprovals);
router.post('/approvals',                   apprCtrl.requestApproval);

// ── Purchase Orders ───────────────────────────────────────
router.get('/purchase-orders',              poCtrl.getPOs);
router.get('/purchase-orders/:id',          poCtrl.getPOById);
router.post('/purchase-orders',             poCtrl.generatePO);

// ── Invoices ─────────────────────────────────────────────
router.get('/invoices',                     invCtrl.getInvoices);
router.get('/invoices/:id',                 invCtrl.getInvoiceById);
router.post('/invoices',                    invCtrl.generateInvoice);

// ── Reports ──────────────────────────────────────────────
router.get('/reports/analytics',            repCtrl.getAnalytics);
router.get('/reports/:type',                repCtrl.generateReport);

// ── Notifications ─────────────────────────────────────────
router.get('/notifications',                notifCtrl.getNotifications);
router.get('/notifications/unread-count',   notifCtrl.getUnreadCount);
router.patch('/notifications/mark-read',    notifCtrl.markAsRead);

// ── Vendor list (read-only for RFQ assignment) ────────────
router.get('/vendors', async (req, res) => {
  const pool = require('../config/db');
  try {
    const r = await pool.query(
      `SELECT id, vendor_name, company_name, email, contact_person, category, status
       FROM vendors WHERE status='active' ORDER BY vendor_name`
    );
    return res.json({ success:true, vendors:r.rows });
  } catch(e) { return res.status(500).json({ success:false, message:'Failed to fetch vendors.' }); }
});

module.exports = router;
