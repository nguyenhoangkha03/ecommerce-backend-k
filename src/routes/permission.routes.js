const express = require('express');
const router = express.Router();

// Import controllers
const permissionController = require('../controllers/permission.controller');

// Import middlewares
const { authenticate } = require('../middlewares/authenticate');
const { requirePermission } = require('../middlewares/permission');

// Middleware cho tất cả permission routes
router.use(authenticate);

/**
 * PERMISSION MANAGEMENT ROUTES
 */
// GET /api/admin/permissions - Lấy danh sách permissions  
router.get(
  '/',
  // Tạm thời comment permission check
  // requirePermission('permissions', 'read'),
  permissionController.getAllPermissions
);

// POST /api/admin/permissions - Tạo permission mới
router.post(
  '/',
  // Tạm thời comment permission check
  // requirePermission('permissions', 'create'),
  permissionController.createPermission
);

// GET /api/admin/permissions/:id - Lấy chi tiết permission
router.get(
  '/:id',
  // Tạm thời comment permission check
  // requirePermission('permissions', 'read'),
  permissionController.getPermissionById
);

// PUT /api/admin/permissions/:id - Cập nhật permission
router.put(
  '/:id',
  // Tạm thời comment permission check
  // requirePermission('permissions', 'update'),
  permissionController.updatePermission
);

// DELETE /api/admin/permissions/:id - Xóa permission
router.delete(
  '/:id',
  // Tạm thời comment permission check
  // requirePermission('permissions', 'delete'),
  permissionController.deletePermission
);

module.exports = router;