const express = require('express');
const router = express.Router();

// Import controllers
const analyticsController = require('../controllers/analytics.controller');

// Import middlewares
const { authenticate } = require('../middlewares/authenticate');
const { requirePermission } = require('../middlewares/permission');
const { auditMiddleware } = require('../services/adminAuditService');

// Middleware cho tất cả analytics routes
router.use(authenticate);
router.use(auditMiddleware);

/**
 * TEST ROUTES - Phase 1
 */
// GET /api/admin/analytics/test - Test permission cơ bản
router.get('/test', 
  requirePermission('analytics', 'read'), 
  analyticsController.testAnalyticsPermission
);

/**
 * BASIC ANALYTICS ROUTES - Phase 2
 */
// GET /api/admin/analytics/basic - Lấy thống kê cơ bản
router.get('/basic', 
  requirePermission('analytics', 'read'), 
  analyticsController.getBasicAnalytics
);

// GET /api/admin/analytics/charts - Lấy dữ liệu cho charts (30 ngày)
router.get('/charts', 
  requirePermission('analytics', 'read'), 
  analyticsController.getChartData
);

// GET /api/admin/analytics/enhanced-charts - Lấy dữ liệu cho enhanced charts (Phase 3)
router.get('/enhanced-charts', 
  requirePermission('analytics', 'read'), 
  analyticsController.getEnhancedChartData
);

/**
 * ADVANCED ANALYTICS ROUTES - Phase 4
 */
// GET /api/admin/analytics/customers - Customer Analytics & LTV (Phase 4.1)
router.get('/customers', 
  requirePermission('analytics', 'advanced'), 
  analyticsController.getCustomerAnalytics
);

// GET /api/admin/analytics/cohort - Cohort Analysis (Phase 4.2)
router.get('/cohort', 
  requirePermission('analytics', 'advanced'), 
  analyticsController.getCohortAnalysis
);

// GET /api/admin/analytics/advanced - Thống kê nâng cao (test endpoint)
router.get('/advanced', 
  requirePermission('analytics', 'advanced'), 
  analyticsController.getAdvancedAnalytics
);

/**
 * EXPORT ROUTES - Phase 4
 */
// GET /api/admin/analytics/export/test - Test export permission
router.get('/export/test', 
  requirePermission('analytics', 'export'), 
  analyticsController.testExportAnalytics
);

module.exports = router;