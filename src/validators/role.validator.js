const { body, param, query } = require('express-validator');

/**
 * Validation cho assign role
 */
const assignRoleValidation = [
  param('userId')
    .isUUID()
    .withMessage('User ID must be a valid UUID'),
  
  body('roleName')
    .notEmpty()
    .withMessage('Role name is required')
    .isString()
    .withMessage('Role name must be a string')
    .isLength({ min: 2, max: 50 })
    .withMessage('Role name must be between 2 and 50 characters'),
];

/**
 * Validation cho get user role
 */
const getUserRoleValidation = [
  param('userId')
    .isUUID()
    .withMessage('User ID must be a valid UUID'),
];

/**
 * Validation cho get role by ID
 */
const getRoleByIdValidation = [
  param('id')
    .isUUID()
    .withMessage('Role ID must be a valid UUID'),
];

/**
 * Validation cho pagination
 */
const paginationValidation = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
    
  query('role')
    .optional()
    .isString()
    .withMessage('Role filter must be a string'),
];

module.exports = {
  assignRoleValidation,
  getUserRoleValidation,
  getRoleByIdValidation,
  paginationValidation,
};