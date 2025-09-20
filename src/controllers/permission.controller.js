const { Permission } = require('../models');

/**
 * GET /api/admin/permissions - Lấy danh sách permissions
 */
const getAllPermissions = async (req, res) => {
  try {
    const permissions = await Permission.findAll({
      order: [['resource', 'ASC'], ['action', 'ASC']],
    });

    res.json({
      status: 'success',
      data: permissions,
    });
  } catch (error) {
    console.error('Get all permissions error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Không thể lấy danh sách quyền hạn',
    });
  }
};

/**
 * POST /api/admin/permissions - Tạo permission mới
 */
const createPermission = async (req, res) => {
  try {
    const { resource, action, description } = req.body;
    const currentUser = req.user;

    // Validation
    if (!resource || !resource.trim()) {
      return res.status(400).json({
        status: 'error',
        message: 'Tài nguyên là bắt buộc',
      });
    }

    if (!action || !action.trim()) {
      return res.status(400).json({
        status: 'error',
        message: 'Hành động là bắt buộc',
      });
    }

    // ✅ CRITICAL PERMISSION PROTECTION
    const resourceTrimmed = resource.trim().toLowerCase();
    const actionTrimmed = action.trim().toLowerCase();

    // 1. Bảo vệ quyền toàn cục (*:* hoặc *:action hoặc resource:*) - chỉ legacy admin
    if ((resourceTrimmed === '*' || actionTrimmed === '*') && currentUser.role !== 'admin') {
      return res.status(403).json({
        status: 'error',
        message: 'Chỉ Legacy Admin mới có thể tạo quyền toàn cục (wildcard)',
        code: 'INSUFFICIENT_PRIVILEGES_WILDCARD'
      });
    }

    // 2. Bảo vệ quyền hệ thống quan trọng - chỉ legacy admin
    const systemResources = ['users', 'roles', 'permissions', 'system', 'admin', 'config'];
    const criticalActions = ['manage', 'admin', 'root', 'system'];
    
    if (systemResources.includes(resourceTrimmed) && criticalActions.includes(actionTrimmed) && currentUser.role !== 'admin') {
      return res.status(403).json({
        status: 'error',
        message: 'Chỉ Legacy Admin mới có thể tạo quyền hệ thống quan trọng',
        code: 'INSUFFICIENT_PRIVILEGES_SYSTEM'
      });
    }

    // 3. Bảo vệ quyền tự thăng cấp - chỉ legacy admin
    if (resourceTrimmed === 'roles' && ['update', 'manage', 'assign'].includes(actionTrimmed) && currentUser.role !== 'admin') {
      return res.status(403).json({
        status: 'error',
        message: 'Chỉ Legacy Admin mới có thể tạo quyền quản lý vai trò',
        code: 'INSUFFICIENT_PRIVILEGES_ROLE_MANAGEMENT'
      });
    }

    // Check if permission already exists
    const existingPermission = await Permission.findOne({
      where: { 
        resource: resourceTrimmed,
        action: actionTrimmed
      }
    });

    if (existingPermission) {
      return res.status(400).json({
        status: 'error',
        message: 'Quyền hạn này đã tồn tại',
      });
    }

    // Create new permission
    const newPermission = await Permission.create({
      resource: resourceTrimmed,
      action: actionTrimmed,
      description: description?.trim() || '',
    });

    res.status(201).json({
      status: 'success',
      data: newPermission,
      message: 'Quyền hạn đã được tạo thành công',
    });
  } catch (error) {
    console.error('Create permission error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Không thể tạo quyền hạn',
    });
  }
};

/**
 * GET /api/admin/permissions/:id - Lấy chi tiết permission
 */
const getPermissionById = async (req, res) => {
  try {
    const { id } = req.params;

    const permission = await Permission.findByPk(id);

    if (!permission) {
      return res.status(404).json({
        status: 'error',
        message: 'Không tìm thấy quyền hạn',
      });
    }

    res.json({
      status: 'success',
      data: permission,
    });
  } catch (error) {
    console.error('Get permission by ID error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Không thể lấy thông tin quyền hạn',
    });
  }
};

/**
 * PUT /api/admin/permissions/:id - Cập nhật permission
 */
const updatePermission = async (req, res) => {
  try {
    const { id } = req.params;
    const { resource, action, description } = req.body;

    // Validation
    if (!resource || !resource.trim()) {
      return res.status(400).json({
        status: 'error',
        message: 'Tài nguyên là bắt buộc',
      });
    }

    if (!action || !action.trim()) {
      return res.status(400).json({
        status: 'error',
        message: 'Hành động là bắt buộc',
      });
    }

    // Find permission
    const permission = await Permission.findByPk(id);
    if (!permission) {
      return res.status(404).json({
        status: 'error',
        message: 'Không tìm thấy quyền hạn',
      });
    }

    // Check if permission already exists (excluding current permission)
    const existingPermission = await Permission.findOne({
      where: { 
        resource: resource.trim().toLowerCase(),
        action: action.trim().toLowerCase(),
        id: { [require('sequelize').Op.ne]: id }
      }
    });

    if (existingPermission) {
      return res.status(400).json({
        status: 'error',
        message: 'Quyền hạn này đã tồn tại',
      });
    }

    // Update permission
    await permission.update({
      resource: resource.trim().toLowerCase(),
      action: action.trim().toLowerCase(),
      description: description?.trim() || '',
    });

    res.json({
      status: 'success',
      data: permission,
      message: 'Quyền hạn đã được cập nhật thành công',
    });
  } catch (error) {
    console.error('Update permission error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Không thể cập nhật quyền hạn',
    });
  }
};

/**
 * DELETE /api/admin/permissions/:id - Xóa permission
 */
const deletePermission = async (req, res) => {
  try {
    const { id } = req.params;
    const { Role } = require('../models');

    // Find permission
    const permission = await Permission.findByPk(id);
    if (!permission) {
      return res.status(404).json({
        status: 'error',
        message: 'Không tìm thấy quyền hạn',
      });
    }

    // Check if permission is being used by any roles
    const rolesWithPermission = await Role.findAll({
      include: {
        model: Permission,
        as: 'permissions',
        where: { id: id },
        through: { attributes: [] }
      }
    });

    if (rolesWithPermission.length > 0) {
      const roleNames = rolesWithPermission.map(role => role.name).join(', ');
      return res.status(400).json({
        status: 'error',
        message: `Không thể xóa quyền hạn. Hiện có ${rolesWithPermission.length} vai trò đang sử dụng quyền này: ${roleNames}. Vui lòng gỡ quyền khỏi các vai trò trước khi xóa.`,
        details: {
          rolesCount: rolesWithPermission.length,
          roleNames: roleNames,
          suggestion: 'Đi tới "Danh sách Vai trò" để gỡ quyền khỏi các vai trò'
        }
      });
    }

    // Delete permission
    await permission.destroy();

    res.json({
      status: 'success',
      message: 'Quyền hạn đã được xóa thành công',
    });
  } catch (error) {
    console.error('Delete permission error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Không thể xóa quyền hạn',
    });
  }
};

module.exports = {
  getAllPermissions,
  createPermission,
  getPermissionById,
  updatePermission,
  deletePermission,
};