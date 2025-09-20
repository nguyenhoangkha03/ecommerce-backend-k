const express = require('express');
const router = express.Router();

// Import controllers
const roleController = require('../controllers/role.controller');

// Import middlewares
const { authenticate } = require('../middlewares/authenticate');
const { requirePermission } = require('../middlewares/permission');
const { validate } = require('../middlewares/validateRequest');

// Import validators
const {
  assignRoleValidation,
  getUserRoleValidation,
  getRoleByIdValidation,
  paginationValidation,
} = require('../validators/role.validator');

// Middleware cho tất cả role routes
router.use(authenticate);

/**
 * USER PERMISSION ROUTES
 */
// GET /api/admin/my-permissions - Get current user permissions
router.get(
  '/my-permissions',
  roleController.getMyPermissions
);

/**
 * ROLE MANAGEMENT ROUTES
 */
// GET /api/admin/roles - Lấy danh sách roles  
router.get(
  '/',
  // Tạm thời comment permission check
  // requirePermission('roles', 'read'),
  roleController.getAllRoles
);

// POST /api/admin/roles - Tạo role mới
router.post(
  '/',
  // Tạm thời comment permission check
  // requirePermission('roles', 'create'),
  roleController.createRole
);

// GET /api/admin/users-with-roles - Lấy danh sách users với roles
// *** IMPORTANT: Đặt route cụ thể trước route dynamic /:id ***
router.get(
  '/users-with-roles',
  // Tạm thời comment permission check
  // requirePermission('users', 'read'),
  validate(paginationValidation),
  roleController.getUsersWithRoles
);

/**
 * USER ROLE ASSIGNMENT ROUTES
 */
// POST /api/admin/users/:userId/role - Assign role to user
router.post(
  '/users/:userId/role',
  // Tạm thời comment permission check
  // requirePermission('roles', 'assign'),
  // validate(assignRoleValidation),
  roleController.assignRoleToUser
);

// GET /api/admin/users/:userId/role - Get user's role
router.get(
  '/users/:userId/role',
  // Tạm thời comment permission check
  // requirePermission('roles', 'read'),
  // validate(getUserRoleValidation),
  roleController.getUserRole
);

// DELETE /api/admin/users/:userId/role - Remove role from user
router.delete(
  '/users/:userId/role',
  // Tạm thời comment permission check
  // requirePermission('roles', 'assign'),
  roleController.removeRoleFromUser
);

// DELETE /api/admin/roles/:roleId/users - Remove role from all users
router.delete(
  '/:roleId/users',
  // Tạm thời comment permission check
  // requirePermission('roles', 'assign'),
  roleController.removeRoleFromAllUsers
);

// GET /api/admin/roles/:id - Lấy chi tiết role
router.get(
  '/:id',
  // Tạm thời comment permission check
  // requirePermission('roles', 'read'),
  // validate(getRoleByIdValidation),
  roleController.getRoleById
);

// PUT /api/admin/roles/:id - Cập nhật role
router.put(
  '/:id',
  // Tạm thời comment permission check
  // requirePermission('roles', 'update'),
  roleController.updateRole
);

// DELETE /api/admin/roles/:id - Xóa role
router.delete(
  '/:id',
  // Tạm thời comment permission check
  // requirePermission('roles', 'delete'),
  roleController.deleteRole
);

// PUT /api/admin/roles/:roleId/permissions - Gán permissions cho role
router.put(
  '/:roleId/permissions',
  // Tạm thời comment permission check
  // requirePermission('roles', 'manage'),
  roleController.updateRolePermissions
);

module.exports = router;