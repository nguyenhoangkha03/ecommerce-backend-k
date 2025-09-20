const express = require('express');
const router = express.Router();
const { authenticate } = require('../middlewares/authenticate');
const { requirePermission } = require('../middlewares/permission');

// Test route với permission
router.get('/admin-only', 
  authenticate,
  requirePermission('test', 'read'),
  (req, res) => {
    res.json({
      status: 'success',
      message: 'Permission system works!',
      user: {
        id: req.user.id,
        email: req.user.email,
        role: req.user.role
      }
    });
  }
);

// Test route không cần permission
router.get('/public', (req, res) => {
  res.json({
    status: 'success',
    message: 'Public endpoint works!'
  });
});

module.exports = router;