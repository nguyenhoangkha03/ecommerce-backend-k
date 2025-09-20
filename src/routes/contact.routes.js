const express = require('express');
const router = express.Router();
const {
  createContact,
  getAllContacts,
  getContactById,
  updateContactStatus,
  deleteContact,
  getContactStats,
} = require('../controllers/contact.controller');
const { authenticate } = require('../middlewares/authenticate');
const { requirePermission } = require('../middlewares/permission');
const { validateExpressValidator } = require('../middlewares/validateRequest');
const { body, param, query } = require('express-validator');

// Validation rules for creating contact
const createContactValidation = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Tên không được để trống')
    .isLength({ min: 2, max: 100 })
    .withMessage('Tên phải có từ 2 đến 100 ký tự'),
  body('email')
    .trim()
    .notEmpty()
    .withMessage('Email không được để trống')
    .isEmail()
    .withMessage('Email không hợp lệ')
    .normalizeEmail(),
  body('subject')
    .notEmpty()
    .withMessage('Chủ đề không được để trống')
    .isIn(['general', 'support', 'feedback', 'partnership'])
    .withMessage('Chủ đề không hợp lệ'),
  body('message')
    .trim()
    .notEmpty()
    .withMessage('Tin nhắn không được để trống')
    .isLength({ min: 10, max: 2000 })
    .withMessage('Tin nhắn phải có từ 10 đến 2000 ký tự'),
];

// Validation rules for updating contact status
const updateContactStatusValidation = [
  param('id').isUUID().withMessage('ID không hợp lệ'),
  body('status')
    .optional()
    .isIn(['pending', 'in_progress', 'resolved', 'closed'])
    .withMessage('Trạng thái không hợp lệ'),
  body('priority')
    .optional()
    .isIn(['low', 'medium', 'high', 'urgent'])
    .withMessage('Mức độ ưu tiên không hợp lệ'),
  body('adminNotes')
    .optional()
    .isLength({ max: 1000 })
    .withMessage('Ghi chú admin không được vượt quá 1000 ký tự'),
];

// Validation rules for getting contacts with filters
const getContactsValidation = [
  query('page').optional().isInt({ min: 1 }).withMessage('Trang phải là số nguyên dương'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Giới hạn phải từ 1 đến 100'),
  query('status')
    .optional()
    .isIn(['pending', 'in_progress', 'resolved', 'closed'])
    .withMessage('Trạng thái không hợp lệ'),
  query('subject')
    .optional()
    .isIn(['general', 'support', 'feedback', 'partnership'])
    .withMessage('Chủ đề không hợp lệ'),
  query('sortBy')
    .optional()
    .isIn(['createdAt', 'name', 'email', 'subject', 'status', 'priority'])
    .withMessage('Trường sắp xếp không hợp lệ'),
  query('sortOrder')
    .optional()
    .isIn(['ASC', 'DESC', 'asc', 'desc'])
    .withMessage('Thứ tự sắp xếp không hợp lệ'),
];

// ==================== PUBLIC ROUTES ====================

// POST /api/contact - Create new contact message (Public)
router.post(
  '/',
  createContactValidation,
  validateExpressValidator,
  createContact
);

// ==================== ADMIN ROUTES ====================

// GET /api/contact - Get all contacts with filters and pagination (Admin)
router.get(
  '/',
  authenticate,
  requirePermission('contacts', 'read'),
  getContactsValidation,
  validateExpressValidator,
  getAllContacts
);

// GET /api/contact/stats - Get contact statistics (Admin)
router.get(
  '/stats',
  authenticate,
  requirePermission('contacts', 'read'),
  getContactStats
);

// GET /api/contact/:id - Get single contact by ID (Admin)
router.get(
  '/:id',
  authenticate,
  requirePermission('contacts', 'read'),
  param('id').isUUID().withMessage('ID không hợp lệ'),
  validateExpressValidator,
  getContactById
);

// PUT /api/contact/:id/status - Update contact status (Admin)
router.put(
  '/:id/status',
  authenticate,
  requirePermission('contacts', 'update'),
  updateContactStatusValidation,
  validateExpressValidator,
  updateContactStatus
);

// DELETE /api/contact/:id - Delete contact (Admin)
router.delete(
  '/:id',
  authenticate,
  requirePermission('contacts', 'delete'),
  param('id').isUUID().withMessage('ID không hợp lệ'),
  validateExpressValidator,
  deleteContact
);

module.exports = router;