const express = require('express');
const router = express.Router();
const { authenticate } = require('../middlewares/authenticate');
const permissionService = require('../services/permissionService');

// Debug endpoint to check user status
router.get('/user-status', authenticate, async (req, res) => {
  try {
    const user = req.user;
    const userRole = await permissionService.getUserRole(user.id);
    const hasRolesRead = await permissionService.hasPermission(user.id, 'roles', 'read');
    
    res.json({
      status: 'success',
      data: {
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          roleId: user.roleId,
          isActive: user.isActive,
          isEmailVerified: user.isEmailVerified,
          provider: user.provider,
        },
        userRole,
        permissions: {
          rolesRead: hasRolesRead,
        }
      }
    });
  } catch (error) {
    console.error('Debug user status error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to get user status',
      error: error.message
    });
  }
});

module.exports = router;