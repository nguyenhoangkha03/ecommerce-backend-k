const permissionService = require('../services/permissionService');

/**
 * Middleware để check permission
 * @param {string} resource 
 * @param {string} action 
 * @returns {Function} Express middleware
 */
const requirePermission = (resource, action) => {
  return async (req, res, next) => {
    try {
      // Kiểm tra user đã authenticate chưa
      if (!req.user) {
        return res.status(401).json({
          status: 'error',
          message: 'Authentication required'
        });
      }

      // Check permission sử dụng service
      const hasPermission = await permissionService.hasPermission(
        req.user.id, 
        resource, 
        action
      );

      if (!hasPermission) {
        return res.status(403).json({
          status: 'fail',
          message: 'Bạn không có quyền thực hiện hành động này',
          error: {
            statusCode: 403,
            status: 'fail',
            isOperational: true
          },
          stack: `Error: Bạn không có quyền thực hiện hành động này\n    at requirePermission (permission.js)`
        });
      }

      next();

    } catch (error) {
      console.error('Permission middleware error:', error);
      return res.status(500).json({
        status: 'error',
        message: 'Permission check failed'
      });
    }
  };
};

module.exports = {
  requirePermission,
};