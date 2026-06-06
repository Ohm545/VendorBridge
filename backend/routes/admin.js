/**
 * Admin API Routes
 * All routes require: authenticateUser + authorizeRoles('admin')
 */
const express  = require('express');
const router   = express.Router();
const { authenticateUser, authorizeRoles } = require('../middleware/auth');
const { generalLimiter } = require('../middleware/rateLimiter');

const dashCtrl   = require('../controllers/admin/dashboardController');
const userCtrl   = require('../controllers/admin/userController');
const vendorCtrl = require('../controllers/admin/vendorController');
const analytCtrl = require('../controllers/admin/analyticsController');
const reportCtrl = require('../controllers/admin/reportsController');
const actCtrl    = require('../controllers/admin/activityController');
const notifCtrl  = require('../controllers/admin/notificationController');
const settCtrl   = require('../controllers/admin/settingsController');

// Apply auth to every admin API route
router.use(generalLimiter);
router.use(authenticateUser);
router.use(authorizeRoles('admin'));

// ── Dashboard ────────────────────────────────────────────
router.get('/dashboard/stats',         dashCtrl.getStats);
router.get('/dashboard/insights',      dashCtrl.getInsights);
router.get('/dashboard/monthly-trend', dashCtrl.getMonthlyTrend);

// ── User Management ──────────────────────────────────────
router.get('/users',                    userCtrl.getUsers);
router.get('/users/:id',                userCtrl.getUserById);
router.post('/users',                   userCtrl.createUser);
router.put('/users/:id',                userCtrl.updateUser);
router.patch('/users/:id/role',         userCtrl.changeRole);
router.patch('/users/:id/status',       userCtrl.toggleStatus);
router.post('/users/:id/reset-password', userCtrl.resetPassword);

// ── Vendor Management ────────────────────────────────────
router.get('/vendors/categories',       vendorCtrl.getCategories);
router.get('/vendors',                  vendorCtrl.getVendors);
router.get('/vendors/:id',              vendorCtrl.getVendorById);
router.post('/vendors',                 vendorCtrl.createVendor);
router.put('/vendors/:id',              vendorCtrl.updateVendor);
router.patch('/vendors/:id/status',     vendorCtrl.toggleStatus);
router.delete('/vendors/:id',           vendorCtrl.deleteVendor);

// ── Analytics ────────────────────────────────────────────
router.get('/analytics/overview',       analytCtrl.getProcurementOverview);
router.get('/analytics/rfq-funnel',     analytCtrl.getRfqFunnel);
router.get('/analytics/vendors',        analytCtrl.getVendorAnalytics);
router.get('/analytics/approvals',      analytCtrl.getApprovalAnalytics);
router.get('/analytics/spend',          analytCtrl.getSpendAnalytics);
router.get('/analytics/ai-insights',    analytCtrl.getAIInsights);

// ── Reports ──────────────────────────────────────────────
router.get('/reports/summary',          reportCtrl.getProcurementSummary);
router.get('/reports/:type',            reportCtrl.generateReport);

// ── Activity Logs ────────────────────────────────────────
router.get('/activity-logs',            actCtrl.getLogs);
router.get('/activity-logs/entity-types', actCtrl.getEntityTypes);

// ── Notifications ────────────────────────────────────────
router.get('/notifications',            notifCtrl.getNotifications);
router.get('/notifications/unread-count', notifCtrl.getUnreadCount);
router.patch('/notifications/mark-read', notifCtrl.markAsRead);
router.delete('/notifications/:id',     notifCtrl.deleteNotification);

// ── Settings ─────────────────────────────────────────────
router.get('/settings',                 settCtrl.getSettings);
router.put('/settings',                 settCtrl.updateSettings);

module.exports = router;
