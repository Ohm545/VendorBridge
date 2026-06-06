const express = require('express');
const router  = express.Router();
const { authenticateUser, authorizeRoles } = require('../middleware/auth');
const { generalLimiter } = require('../middleware/rateLimiter');

const dashCtrl  = require('../controllers/vendor/dashboardController');
const rfqCtrl   = require('../controllers/vendor/rfqController');
const quoteCtrl = require('../controllers/vendor/quotationController');
const poCtrl    = require('../controllers/vendor/poController');
const invCtrl   = require('../controllers/vendor/invoiceController');
const perfCtrl  = require('../controllers/vendor/performanceController');
const profCtrl  = require('../controllers/vendor/profileController');
const notifCtrl = require('../controllers/vendor/notificationController');

router.use(generalLimiter);
router.use(authenticateUser);
router.use(authorizeRoles('vendor'));

router.get('/dashboard/stats',         dashCtrl.getStats);
router.get('/dashboard/insights',      dashCtrl.getInsights);
router.get('/dashboard/monthly-trend', dashCtrl.getMonthlyTrend);

router.get('/rfqs/categories',         rfqCtrl.getCategories);
router.get('/rfqs',                    rfqCtrl.getAssignedRfqs);
router.get('/rfqs/:id',                rfqCtrl.getRfqDetail);

router.get('/quotations',              quoteCtrl.getMyQuotations);
router.post('/quotations',             quoteCtrl.submitQuotation);
router.put('/quotations/:id',          quoteCtrl.editQuotation);

router.get('/purchase-orders',         poCtrl.getPOs);
router.get('/purchase-orders/:id',     poCtrl.getPOById);

router.get('/invoices',                invCtrl.getInvoices);
router.get('/invoices/:id',            invCtrl.getInvoiceById);

router.get('/performance',             perfCtrl.getPerformance);

router.get('/profile',                 profCtrl.getProfile);
router.put('/profile',                 profCtrl.updateProfile);

router.get('/notifications',           notifCtrl.getNotifications);
router.get('/notifications/unread-count', notifCtrl.getUnreadCount);
router.patch('/notifications/mark-read',  notifCtrl.markAsRead);

module.exports = router;
