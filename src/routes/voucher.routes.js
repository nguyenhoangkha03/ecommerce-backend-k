const express = require('express');
const router = express.Router();
const {
  validateVoucher,
  getAvailableVouchers,
  getNewUserVoucher,
  getAllVouchers,
  createVoucher,
  updateVoucher,
  deleteVoucher,
  getVoucherStats,
} = require('../controllers/voucher.controller');
const { authenticate } = require('../middlewares/authenticate');
const { authorize } = require('../middlewares/authorize');
const { requirePermission } = require('../middlewares/permission');

// Customer routes (require authentication)
router.post('/validate', authenticate, validateVoucher);
router.get('/available', authenticate, getAvailableVouchers);
router.get('/new-user', authenticate, getNewUserVoucher);

// Admin routes (require voucher permissions)
router.get('/admin', authenticate, requirePermission('vouchers', 'read'), getAllVouchers);
router.post('/admin', authenticate, requirePermission('vouchers', 'create'), createVoucher);
router.put('/admin/:id', authenticate, requirePermission('vouchers', 'update'), updateVoucher);
router.delete('/admin/:id', authenticate, requirePermission('vouchers', 'delete'), deleteVoucher);
router.get('/admin/stats', authenticate, requirePermission('vouchers', 'read'), getVoucherStats);

module.exports = router;