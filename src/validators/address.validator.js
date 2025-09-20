const Joi = require('joi');

// Enhanced address validation schema for Shopee-style format
const enhancedAddressSchema = Joi.object({
  // New required fields
  receiverName: Joi.string()
    .min(2)
    .max(50)
    .pattern(/^[a-zA-ZÀ-ỹ\s]+$/)
    .required()
    .messages({
      'string.empty': 'Tên người nhận không được để trống',
      'any.required': 'Tên người nhận là trường bắt buộc',
      'string.min': 'Tên người nhận phải có ít nhất 2 ký tự',
      'string.max': 'Tên người nhận không được quá 50 ký tự',
      'string.pattern.base': 'Tên người nhận chỉ được chứa chữ cái và khoảng trắng',
    }),
  phone: Joi.string()
    .pattern(/^(0[3|5|7|8|9])[0-9]{8}$|^(84[3|5|7|8|9])[0-9]{8}$/)
    .required()
    .messages({
      'string.empty': 'Số điện thoại không được để trống',
      'any.required': 'Số điện thoại là trường bắt buộc',
      'string.pattern.base': 'Số điện thoại không đúng định dạng Việt Nam',
    }),
  province: Joi.string().required().messages({
    'string.empty': 'Tỉnh/Thành phố không được để trống',
    'any.required': 'Tỉnh/Thành phố là trường bắt buộc',
  }),
  // district: Removed - Vietnam now uses province->ward structure only
  ward: Joi.string().required().messages({
    'string.empty': 'Phường/Xã không được để trống',
    'any.required': 'Phường/Xã là trường bắt buộc',
  }),
  detailAddress: Joi.string()
    .min(5)
    .max(200)
    .required()
    .messages({
      'string.empty': 'Địa chỉ cụ thể không được để trống',
      'any.required': 'Địa chỉ cụ thể là trường bắt buộc',
      'string.min': 'Địa chỉ cụ thể phải có ít nhất 5 ký tự',
      'string.max': 'Địa chỉ cụ thể không được quá 200 ký tự',
    }),
  
  // Optional fields
  addressLabel: Joi.string().valid('home', 'office', 'other').default('home'),
  notes: Joi.string().allow('').optional(),
  
  // Location IDs (optional, for better referencing)
  provinceId: Joi.number().integer().optional(),
  // districtId: Removed - Vietnam now uses province->ward structure only
  wardId: Joi.number().integer().optional(),
  
  // System fields
  isDefault: Joi.boolean().default(false),
  
  // Legacy fields (for backward compatibility)
  zip: Joi.string().default('00000'),
  country: Joi.string().default('VN'),
  name: Joi.string().allow('').optional(),
  firstName: Joi.string().allow('').optional(),
  lastName: Joi.string().allow('').optional(),
  company: Joi.string().allow('').optional(),
  address1: Joi.string().allow('').optional(),
  address2: Joi.string().allow('').optional(),
  city: Joi.string().allow('').optional(),
  state: Joi.string().allow('').optional(),
});

// Legacy address validation schema (kept for backward compatibility)
const addressSchema = Joi.object({
  name: Joi.string().allow('').optional(),
  firstName: Joi.string().required().messages({
    'string.empty': 'Tên không được để trống',
    'any.required': 'Tên là trường bắt buộc',
  }),
  lastName: Joi.string().required().messages({
    'string.empty': 'Họ không được để trống',
    'any.required': 'Họ là trường bắt buộc',
  }),
  company: Joi.string().allow('').optional(),
  address1: Joi.string().required().messages({
    'string.empty': 'Địa chỉ không được để trống',
    'any.required': 'Địa chỉ là trường bắt buộc',
  }),
  address2: Joi.string().allow('').optional(),
  city: Joi.string().required().messages({
    'string.empty': 'Thành phố không được để trống',
    'any.required': 'Thành phố là trường bắt buộc',
  }),
  state: Joi.string().required().messages({
    'string.empty': 'Tỉnh/Thành phố không được để trống',
    'any.required': 'Tỉnh/Thành phố là trường bắt buộc',
  }),
  zip: Joi.string().required().messages({
    'string.empty': 'Mã bưu điện không được để trống',
    'any.required': 'Mã bưu điện là trường bắt buộc',
  }),
  country: Joi.string().required().messages({
    'string.empty': 'Quốc gia không được để trống',
    'any.required': 'Quốc gia là trường bắt buộc',
  }),
  phone: Joi.string().allow('').optional(),
  isDefault: Joi.boolean().default(false),
});

module.exports = {
  addressSchema, // Legacy schema
  enhancedAddressSchema, // New Shopee-style schema (Vietnamese)
};
