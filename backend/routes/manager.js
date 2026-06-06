/**
 * Manager API Routes — /api/manager/*
 * Requires: authenticateUser + authorizeRoles('manager')
 */
const express  = require('express');
const router   = express.Router();
const { authenticateUser, authorizeRoles } = require('../middleware/auth');
const { generalLimiter } = require('../middleware/rateLimiter');

const dashCtrl   = require('../controllers/manager/dashboardController');
const apprCtrl   = require('../controllers/manager/approvalController');
const wfCtrl     = require('../controllers/manager/workflowController');
const anlCtrl    = require('../controllers/manager/analyticsController');
const repCtrl    = require('../controllers/manager/reportsController');
const notifCtrl  = require('../controllers/manager/notificationController');

router.use(generalLimiter);
router.use(authenticateUser);
router.use(authorizeRoles('manager'));

// ── Dashboard ───────────────────────────────────────────
router.get('/dashboard/stats',         dashCtrl.getStats);
router.get('/dashboard/insights',      dashCtrl.getInsights);
router.get('/dashboard/monthly-trend', dashCtrl.getMonthlyTrend);

// ── Approvals ────────────────────────────────────────────
router.get('/approvals',                     apprCtrl.getApprovals);
router.get('/approvals/:id',                 apprCtrl.getApprovalDetail);
router.post('/approvals/:id/approve',        apprCtrl.approveRequest);
router.post('/approvals/:id/reject',         apprCtrl.rejectRequest);
router.patch('/approvals/:id/priority',      apprCtrl.setPriority);
router.get('/approvals/:id/history',         apprCtrl.getHistory);

// ── Workflow Monitoring ──────────────────────────────────
router.get('/workflow/stats',                wfCtrl.getWorkflowStats);
router.get('/workflow/pipeline',             wfCtrl.getPipeline);
router.get('/workflow/rfq/:id',              wfCtrl.getRfqDetail);

// ── Analytics ────────────────────────────────────────────
router.get('/analytics/approvals',           anlCtrl.getApprovalAnalytics);
router.get('/analytics/procurement-value',   anlCtrl.getProcurementValueAnalytics);
router.get('/analytics/vendors',             anlCtrl.getVendorAnalytics);
router.get('/analytics/officers',            anlCtrl.getOfficerAnalytics);

// ── Reports ─────────────────────────────────────────────
router.get('/reports/:type',                 repCtrl.generateReport);

// ── Notifications ────────────────────────────────────────
router.get('/notifications',                 notifCtrl.getNotifications);
router.get('/notifications/unread-count',    notifCtrl.getUnreadCount);
router.patch('/notifications/mark-read',     notifCtrl.markAsRead);

module.exports = router;
