const { User, Role, Permission, RolePermission } = require('../models');

/**
 * Check if user has specific permission
 */
const hasPermission = async (userId, resource, action) => {
  try {
    // Get user with role and permissions
    const user = await User.findByPk(userId, {
      include: {
        model: Role,
        as: 'roleDetails',
        include: {
          model: Permission,
          as: 'permissions',
          through: { attributes: [] }, // Exclude junction table attributes
        },
      },
    });

    if (!user) {
      return false;
    }

    // Legacy admin check - keep for backward compatibility
    if (user.role === 'admin') {
      return true;
    }

    // New role-based permission check
    if (user.roleDetails && user.roleDetails.permissions) {
      return user.roleDetails.permissions.some(
        permission => 
          permission.resource === resource && 
          permission.action === action
      );
    }
    return false;
  } catch (error) {
    console.error('Permission check error:', error);
    return false;
  }
};

/**
 * Get user's role details
 */
const getUserRole = async (userId) => {
  try {
    const user = await User.findByPk(userId, {
      include: {
        model: Role,
        as: 'roleDetails',
      },
    });
    
    return user?.roleDetails || null;
  } catch (error) {
    console.error('Get user role error:', error);
    return null;
  }
};

/**
 * Assign role to user
 */
const assignRole = async (userId, roleName) => {
  try {
    const role = await Role.findOne({ where: { name: roleName } });
    if (!role) {
      throw new Error(`Không tìm thấy vai trò '${roleName}'`);
    }

    const user = await User.findByPk(userId);
    if (!user) {
      throw new Error('Không tìm thấy người dùng');
    }

    await user.update({ roleId: role.id });
    return true;
  } catch (error) {
    console.error('Assign role error:', error);
    throw error;
  }
};

module.exports = {
  hasPermission,
  getUserRole,
  assignRole,
};