const { Role, Permission, User } = require('../models');
const permissionService = require('../services/permissionService');

/**
 * GET /api/admin/roles - Lấy danh sách roles
 */
const getAllRoles = async (req, res) => {
  try {
    const roles = await Role.findAll({
      include: {
        model: Permission,
        as: 'permissions',
        through: { attributes: [] },
      },
      order: [['createdAt', 'DESC']],
    });

    res.json({
      status: 'success',
      data: roles,
    });
  } catch (error) {
    console.error('Get all roles error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Không thể lấy danh sách vai trò',
    });
  }
};

/**
 * POST /api/admin/roles - Tạo role mới
 */
const createRole = async (req, res) => {
  try {
    const { name, description } = req.body;

    // Validation
    if (!name || !name.trim()) {
      return res.status(400).json({
        status: 'error',
        message: 'Tên vai trò là bắt buộc',
      });
    }

    // Check if role name already exists
    const existingRole = await Role.findOne({
      where: { name: name.trim() }
    });

    if (existingRole) {
      return res.status(400).json({
        status: 'error',
        message: 'Tên vai trò này đã tồn tại',
      });
    }

    // Create new role
    const newRole = await Role.create({
      name: name.trim(),
      description: description?.trim() || '',
    });

    // Return created role with permissions (empty array)
    const roleWithPermissions = await Role.findByPk(newRole.id, {
      include: {
        model: Permission,
        as: 'permissions',
        through: { attributes: [] },
      },
    });

    res.status(201).json({
      status: 'success',
      data: roleWithPermissions,
      message: 'Vai trò đã được tạo thành công',
    });
  } catch (error) {
    console.error('Create role error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Không thể tạo vai trò',
    });
  }
};

/**
 * GET /api/admin/roles/:id - Lấy chi tiết role
 */
const getRoleById = async (req, res) => {
  try {
    const { id } = req.params;

    const role = await Role.findByPk(id, {
      include: {
        model: Permission,
        as: 'permissions',
        through: { attributes: [] },
      },
    });

    if (!role) {
      return res.status(404).json({
        status: 'error',
        message: 'Không tìm thấy vai trò',
      });
    }

    res.json({
      status: 'success',
      data: role,
    });
  } catch (error) {
    console.error('Get role by ID error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Không thể lấy thông tin vai trò',
    });
  }
};

/**
 * POST /api/admin/users/:userId/role - Assign role to user
 */
const assignRoleToUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const { roleName } = req.body;

    if (!roleName) {
      return res.status(400).json({
        status: 'error',
        message: 'Tên vai trò là bắt buộc',
      });
    }

    await permissionService.assignRole(userId, roleName);

    res.json({
      status: 'success',
      message: `Vai trò '${roleName}' đã được gán thành công`,
    });
  } catch (error) {
    console.error('Assign role error:', error);
    res.status(500).json({
      status: 'error',
      message: error.message || 'Không thể gán vai trò',
    });
  }
};

/**
 * GET /api/admin/users/:userId/role - Get user's role
 */
const getUserRole = async (req, res) => {
  try {
    const { userId } = req.params;

    const role = await permissionService.getUserRole(userId);

    if (!role) {
      return res.status(404).json({
        status: 'error',
        message: 'Không tìm thấy vai trò của người dùng',
      });
    }

    res.json({
      status: 'success',
      data: role,
    });
  } catch (error) {
    console.error('Get user role error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Không thể lấy vai trò của người dùng',
    });
  }
};

/**
 * GET /api/admin/my-permissions - Get current user permissions
 */
const getMyPermissions = async (req, res) => {
  try {
    const userId = req.user.id;

    // Get user with role and permissions
    const user = await User.findByPk(userId, {
      include: {
        model: Role,
        as: 'roleDetails',
        include: {
          model: Permission,
          as: 'permissions',
          through: { attributes: [] },
        },
      },
    });

    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'Không tìm thấy người dùng',
      });
    }

    // Legacy admin has full permissions
    if (user.role === 'admin') {
      res.json({
        status: 'success',
        data: {
          role: {
            id: 'legacy-admin',
            name: 'Legacy Admin',
            description: 'Quản trị viên cũ - Toàn quyền hệ thống'
          },
          permissions: [
            { id: 'admin-full', resource: '*', action: '*', description: 'Toàn quyền hệ thống' }
          ],
          isLegacyAdmin: true
        },
      });
      return;
    }

    // Return new role system permissions
    const permissions = user.roleDetails?.permissions || [];
    
    res.json({
      status: 'success',
      data: {
        role: user.roleDetails || null,
        permissions,
        isLegacyAdmin: false
      },
    });
  } catch (error) {
    console.error('Get my permissions error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Không thể lấy quyền hạn của người dùng',
    });
  }
};

/**
 * GET /api/admin/users-with-roles - Lấy danh sách users với roles
 */
const getUsersWithRoles = async (req, res) => {
  try {
    const { page = 1, limit = 10, role: roleFilter } = req.query;
    const offset = (page - 1) * limit;

    const whereClause = {};
    if (roleFilter) {
      whereClause.role = roleFilter;
    }

    const { count, rows: users } = await User.findAndCountAll({
      where: whereClause,
      include: {
        model: Role,
        as: 'roleDetails',
        required: false,
      },
      attributes: ['id', 'email', 'firstName', 'lastName', 'role', 'roleId', 'createdAt'],
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['createdAt', 'DESC']],
    });

    res.json({
      status: 'success',
      data: {
        users,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(count / limit),
          totalItems: count,
          itemsPerPage: parseInt(limit),
        },
      },
    });
  } catch (error) {
    console.error('Get users with roles error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Không thể lấy danh sách người dùng với vai trò',
    });
  }
};

/**
 * PUT /api/admin/roles/:roleId/permissions - Gán permissions cho role
 */
const updateRolePermissions = async (req, res) => {
  try {
    const { roleId } = req.params;
    const { permissionIds } = req.body;
    const currentUser = req.user;

    // Validation
    if (!Array.isArray(permissionIds)) {
      return res.status(400).json({
        status: 'error',
        message: 'ID quyền hạn phải là một mảng',
      });
    }

    // Find role
    const role = await Role.findByPk(roleId);
    if (!role) {
      return res.status(404).json({
        status: 'error',
        message: 'Không tìm thấy vai trò',
      });
    }

    // ✅ ROLE PERMISSIONS PROTECTION (Updated: No Super Admin role)
    // 1. Bảo vệ role hệ thống quan trọng - chỉ legacy admin
    const protectedRoles = ['system_admin', 'root', 'superuser', 'admin'];
    if (protectedRoles.includes(role.name.toLowerCase()) && currentUser.role !== 'admin') {
      return res.status(403).json({
        status: 'error',
        message: 'Chỉ Legacy Admin mới có thể thay đổi quyền của role hệ thống',
        code: 'INSUFFICIENT_PRIVILEGES_SYSTEM_ROLE'
      });
    }

    // Verify all permission IDs exist and check for dangerous permissions
    if (permissionIds.length > 0) {
      const existingPermissions = await Permission.findAll({
        where: { id: permissionIds }
      });
      
      if (existingPermissions.length !== permissionIds.length) {
        return res.status(400).json({
          status: 'error',
          message: 'Một số ID quyền hạn không hợp lệ',
        });
      }

      // 2. Kiểm tra quyền nguy hiểm được gán - chỉ legacy admin
      if (currentUser.role !== 'admin') {
        const dangerousPermissions = existingPermissions.filter(perm => 
          // Wildcard permissions
          (perm.resource === '*' || perm.action === '*') ||
          // Role management permissions
          (perm.resource === 'roles' && ['update', 'manage', 'assign'].includes(perm.action)) ||
          // System critical permissions
          (['users', 'permissions', 'system'].includes(perm.resource) && 
           ['manage', 'admin', 'root'].includes(perm.action))
        );

        if (dangerousPermissions.length > 0) {
          return res.status(403).json({
            status: 'error',
            message: 'Chỉ Legacy Admin mới có thể gán quyền hệ thống quan trọng',
            code: 'INSUFFICIENT_PRIVILEGES_DANGEROUS_PERMISSIONS',
            details: {
              dangerousPermissions: dangerousPermissions.map(p => `${p.resource}:${p.action}`)
            }
          });
        }
      }
    }

    // Update role permissions (replace all)
    await role.setPermissions(permissionIds);

    // Return updated role with permissions
    const updatedRole = await Role.findByPk(roleId, {
      include: {
        model: Permission,
        as: 'permissions',
        through: { attributes: [] },
      },
    });

    res.json({
      status: 'success',
      data: updatedRole,
      message: 'Quyền hạn vai trò đã được cập nhật thành công',
    });
  } catch (error) {
    console.error('Update role permissions error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Không thể cập nhật quyền hạn vai trò',
    });
  }
};

/**
 * PUT /api/admin/roles/:id - Cập nhật role
 */
const updateRole = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description } = req.body;
    const currentUser = req.user;

    // Validation
    if (!name || !name.trim()) {
      return res.status(400).json({
        status: 'error',
        message: 'Tên vai trò là bắt buộc',
      });
    }

    // Find role to be updated
    const role = await Role.findByPk(id);
    if (!role) {
      return res.status(404).json({
        status: 'error',
        message: 'Không tìm thấy vai trò',
      });
    }

    // ✅ ROLE HIERARCHY PROTECTION (Updated: No Super Admin role)
    // 1. Ngăn tạo super_admin role (không còn được phép)
    if (name.trim().toLowerCase() === 'super_admin') {
      return res.status(403).json({
        status: 'error',
        message: 'Không được phép tạo hoặc đổi tên thành Super Admin. Hệ thống sử dụng Legacy Admin.',
        code: 'SUPER_ADMIN_FORBIDDEN'
      });
    }

    // 2. Bảo vệ các role hệ thống quan trọng - chỉ legacy admin mới được sửa
    const protectedRoles = ['system_admin', 'root', 'superuser', 'admin'];
    if (protectedRoles.includes(role.name.toLowerCase()) && currentUser.role !== 'admin') {
      return res.status(403).json({
        status: 'error',
        message: 'Chỉ Legacy Admin mới có thể chỉnh sửa role hệ thống này',
        code: 'PROTECTED_SYSTEM_ROLE'
      });
    }

    if (protectedRoles.includes(name.trim().toLowerCase()) && currentUser.role !== 'admin') {
      return res.status(403).json({
        status: 'error',
        message: 'Chỉ Legacy Admin mới có thể tạo role hệ thống',
        code: 'CANNOT_CREATE_SYSTEM_ROLE'
      });
    }

    // Check if role name already exists (excluding current role)
    const existingRole = await Role.findOne({
      where: { 
        name: name.trim(),
        id: { [require('sequelize').Op.ne]: id }
      }
    });

    if (existingRole) {
      return res.status(400).json({
        status: 'error',
        message: 'Tên vai trò này đã tồn tại',
      });
    }

    // Update role
    await role.update({
      name: name.trim(),
      description: description?.trim() || '',
    });

    // Return updated role with permissions
    const updatedRole = await Role.findByPk(id, {
      include: {
        model: Permission,
        as: 'permissions',
        through: { attributes: [] },
      },
    });

    res.json({
      status: 'success',
      data: updatedRole,
      message: 'Vai trò đã được cập nhật thành công',
    });
  } catch (error) {
    console.error('Update role error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Không thể cập nhật vai trò',
    });
  }
};

/**
 * DELETE /api/admin/roles/:id - Xóa role
 */
const deleteRole = async (req, res) => {
  try {
    const { id } = req.params;

    // Find role
    const role = await Role.findByPk(id);
    if (!role) {
      return res.status(404).json({
        status: 'error',
        message: 'Không tìm thấy vai trò',
      });
    }

    // Check if role is being used by any users
    const usersWithRole = await User.count({
      where: { roleId: id }
    });

    if (usersWithRole > 0) {
      return res.status(400).json({
        status: 'error',
        message: `Không thể xóa vai trò. Hiện có ${usersWithRole} người dùng đang được gán vai trò này. Vui lòng gỡ vai trò khỏi người dùng trước khi xóa.`,
        details: {
          usersCount: usersWithRole,
          suggestion: 'Đi tới "Quản lý Người dùng" để gỡ vai trò khỏi các người dùng'
        }
      });
    }

    // Manually remove role-permission associations first
    await role.setPermissions([]);

    // Delete role
    await role.destroy();

    res.json({
      status: 'success',
      message: 'Vai trò đã được xóa thành công',
    });
  } catch (error) {
    console.error('Delete role error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Không thể xóa vai trò',
    });
  }
};

/**
 * DELETE /api/admin/users/:userId/role - Remove role from user
 */
const removeRoleFromUser = async (req, res) => {
  try {
    const { userId } = req.params;

    // Find user
    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'Không tìm thấy người dùng',
      });
    }

    // Check if user has a role
    if (!user.roleId) {
      return res.status(400).json({
        status: 'error',
        message: 'Người dùng chưa được gán vai trò nào',
      });
    }

    // Get current role name for response
    const currentRole = await Role.findByPk(user.roleId);
    const roleName = currentRole?.name || 'Unknown';

    // Remove role from user
    await user.update({ roleId: null });

    res.json({
      status: 'success',
      message: `Đã gỡ vai trò '${roleName}' khỏi người dùng thành công`,
    });
  } catch (error) {
    console.error('Remove role from user error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Không thể gỡ vai trò khỏi người dùng',
    });
  }
};

/**
 * DELETE /api/admin/roles/:roleId/users - Remove role from all users
 */
const removeRoleFromAllUsers = async (req, res) => {
  try {
    const { roleId } = req.params;

    // Find role
    const role = await Role.findByPk(roleId);
    if (!role) {
      return res.status(404).json({
        status: 'error',
        message: 'Không tìm thấy vai trò',
      });
    }

    // Count users with this role
    const usersWithRole = await User.count({
      where: { roleId: roleId }
    });

    if (usersWithRole === 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Không có người dùng nào được gán vai trò này',
      });
    }

    // Remove role from all users
    await User.update(
      { roleId: null },
      { where: { roleId: roleId } }
    );

    res.json({
      status: 'success',
      message: `Đã gỡ vai trò '${role.name}' khỏi ${usersWithRole} người dùng thành công`,
      data: {
        roleName: role.name,
        affectedUsers: usersWithRole
      }
    });
  } catch (error) {
    console.error('Remove role from all users error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Không thể gỡ vai trò khỏi người dùng',
    });
  }
};

module.exports = {
  getAllRoles,
  getRoleById,
  createRole,
  updateRole,
  deleteRole,
  assignRoleToUser,
  removeRoleFromUser,
  removeRoleFromAllUsers,
  getUserRole,
  getMyPermissions,
  getUsersWithRoles,
  updateRolePermissions,
};