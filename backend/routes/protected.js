/**
 * Protected routes — serves HTML pages for each module
 */
const express = require('express');
const router  = express.Router();
const path    = require('path');
const { authenticateUser, authorizeRoles } = require('../middleware/auth');

// ── Procurement Officer pages ─────────────────────────────────
const procPages = {
  'dashboard':       'dashboard.html',
  'rfqs':            'rfqs.html',
  'quotations':      'quotations.html',
  'approvals':       'approvals.html',
  'purchase-orders': 'purchase-orders.html',
  'invoices':        'invoices.html',
  'reports':         'reports.html',
  'notifications':   'notifications.html',
};

Object.entries(procPages).forEach(([route, file]) => {
  router.get(`/procurement/${route}`, (req, res) => {
    res.sendFile(path.join(__dirname, '../public/procurement', file));
  });
});

router.get('/procurement', (req, res) => res.redirect('/procurement/dashboard'));

// ── Admin HTML dashboard ──────────────────────────────────────
router.get('/admin/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/admin/dashboard.html'));
});

const adminPages = {
  'users':          'users.html',
  'vendors':        'vendors.html',
  'analytics':      'analytics.html',
  'reports':        'reports.html',
  'activity':       'activity.html',
  'notifications':  'notifications.html',
  'settings':       'settings.html',
};

Object.entries(adminPages).forEach(([route, file]) => {
  router.get(`/admin/${route}`, (req, res) => {
    res.sendFile(path.join(__dirname, '../public/admin', file));
  });
});

router.get('/admin', (req, res) => res.redirect('/admin/dashboard'));

// ── Manager / Vendor stubs ────────────────────────────────────
const managerPages = {
  'dashboard':    'dashboard.html',
  'approvals':    'approvals.html',
  'workflow':     'workflow.html',
  'analytics':    'analytics.html',
  'reports':      'reports.html',
  'notifications':'notifications.html',
};
Object.entries(managerPages).forEach(([route, file]) => {
  router.get(`/manager/${route}`, (req, res) => {
    res.sendFile(path.join(__dirname, '../public/manager', file));
  });
});
router.get('/manager', (req, res) => res.redirect('/manager/dashboard'));

router.get('/vendor/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/vendor', 'dashboard.html'));
});
const vendorPages = { 'rfqs':'rfqs.html','quotations':'quotations.html','purchase-orders':'purchase-orders.html','invoices':'invoices.html','performance':'performance.html','notifications':'notifications.html','profile':'profile.html' };
Object.entries(vendorPages).forEach(([route,file]) => {
  router.get(`/vendor/${route}`, (req,res) => res.sendFile(path.join(__dirname,'../public/vendor',file)));
});
router.get('/vendor', (req,res) => res.redirect('/vendor/dashboard'));

module.exports = router;
