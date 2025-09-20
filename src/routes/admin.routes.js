const express = require('express');
const router = express.Router();

// Import controllers
const adminController = require('../controllers/admin.controller');

// Import middlewares
const { authenticate } = require('../middlewares/authenticate');
const { requirePermission } = require('../middlewares/permission');
const { validate } = require('../middlewares/validateRequest');
const { auditMiddleware } = require('../services/adminAuditService');

// Import validators
const {
  createProductValidation,
  updateProductValidation,
  updateUserValidation,
  paginationValidation,
  statsValidation,
  deleteValidation,
  getByIdValidation,
} = require('../validators/admin.validator');

// Middleware cho tất cả admin routes
router.use(authenticate);
router.use(auditMiddleware);

/**
 * DASHBOARD & STATISTICS ROUTES (Public for all admin users)
 */
// GET /api/admin/dashboard - Thống kê tổng quan (không yêu cầu quyền đặc biệt)
router.get('/dashboard', 
  adminController.getDashboardStats
);

// GET /api/admin/stats - Thống kê chi tiết theo thời gian (không yêu cầu quyền đặc biệt)
router.get(
  '/stats',
  validate(statsValidation),
  adminController.getDetailedStats
);

// GET /api/admin/dashboard/recent-orders - Đơn hàng gần đây cho dashboard (không yêu cầu quyền đặc biệt)
router.get('/dashboard/recent-orders', 
  adminController.getRecentOrdersForDashboard
);

/**
 * USER MANAGEMENT ROUTES
 */
// GET /api/admin/users - Lấy danh sách user với filter
router.get(
  '/users',
  requirePermission('users', 'read'),
  validate(paginationValidation),
  adminController.getAllUsers
);

// PUT /api/admin/users/:id - Cập nhật thông tin user
router.put(
  '/users/:id',
  requirePermission('users', 'update'),
  validate(updateUserValidation),
  adminController.updateUser
);

// DELETE /api/admin/users/:id - Xóa user
router.delete(
  '/users/:id',
  requirePermission('users', 'delete'),
  validate(deleteValidation),
  adminController.deleteUser
);

/**
 * PRODUCT MANAGEMENT ROUTES
 */
// GET /api/admin/products - Lấy danh sách sản phẩm với filter admin
router.get(
  '/products',
  requirePermission('products', 'read'),
  validate(paginationValidation),
  adminController.getAllProducts
);

// GET /api/admin/products/:id - Lấy chi tiết sản phẩm
router.get(
  '/products/:id',
  requirePermission('products', 'read'),
  validate(getByIdValidation),
  adminController.getProductById
);

// POST /api/admin/products - Tạo sản phẩm mới
router.post(
  '/products',
  requirePermission('products', 'create'),
  validate(createProductValidation),
  adminController.createProduct
);

// PUT /api/admin/products/:id - Cập nhật sản phẩm
router.put(
  '/products/:id',
  requirePermission('products', 'update'),
  validate(updateProductValidation),
  adminController.updateProduct
);

// DELETE /api/admin/products/:id - Xóa sản phẩm
router.delete(
  '/products/:id',
  requirePermission('products', 'delete'),
  validate(deleteValidation),
  adminController.deleteProduct
);

/**
 * REVIEW MANAGEMENT ROUTES
 */
// GET /api/admin/reviews - Lấy danh sách review
router.get(
  '/reviews',
  requirePermission('reviews', 'read'),
  validate(paginationValidation),
  adminController.getAllReviews
);

// DELETE /api/admin/reviews/:id - Xóa review
router.delete(
  '/reviews/:id',
  requirePermission('reviews', 'delete'),
  validate(deleteValidation),
  adminController.deleteReview
);

/**
 * ORDER MANAGEMENT ROUTES
 */
// GET /api/admin/orders - Lấy danh sách đơn hàng
router.get(
  '/orders',
  requirePermission('orders', 'read'),
  validate(paginationValidation),
  adminController.getAllOrders
);


/**
 * ANALYTICS ROUTES
 */
// Mount analytics routes at /api/admin/analytics
router.use('/analytics', require('./analytics.routes'));

module.exports = router;
