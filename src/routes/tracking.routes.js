const express = require('express');
const router = express.Router();
const trackingController = require('../controllers/tracking.controller');
const { authenticate } = require('../middlewares/authenticate');
const { requirePermission } = require('../middlewares/permission');

// Public routes (cho customer tracking)
router.get('/order/:orderNumber', authenticate, trackingController.getOrderTracking);

// Admin routes with permission-based protection
router.use(authenticate);

// Lấy danh sách đơn hàng để quản lý tracking
router.get('/admin/orders', requirePermission('tracking', 'read'), trackingController.getAllOrdersForTracking);

// Khởi tạo tracking cho đơn hàng
router.post('/admin/orders/:orderId/initialize', requirePermission('tracking', 'create'), trackingController.initializeOrderTracking);

// Cập nhật tracking step
router.put('/admin/steps/:stepId', requirePermission('tracking', 'update'), trackingController.updateTrackingStep);

// Thống kê tracking
router.get('/admin/statistics', requirePermission('tracking', 'read'), trackingController.getTrackingStatistics);

module.exports = router;