const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

const Voucher = sequelize.define(
  'Voucher',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    code: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      validate: {
        len: [3, 20],
        isUppercase: true,
      },
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    type: {
      type: DataTypes.ENUM('percentage', 'fixed_amount', 'free_shipping'),
      allowNull: false,
      defaultValue: 'fixed_amount',
    },
    value: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      validate: {
        min: 0,
      },
    },
    minOrderValue: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      defaultValue: 0,
      field: 'min_order_value',
    },
    maxDiscount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      field: 'max_discount',
    },
    startDate: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'start_date',
    },
    endDate: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'end_date',
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      field: 'is_active',
    },
    usageLimit: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'usage_limit',
      validate: {
        min: 1,
      },
    },
    usedCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: 'used_count',
      validate: {
        min: 0,
      },
    },
    // Ràng buộc người dùng (null = tất cả người dùng)
    userLimit: {
      type: DataTypes.ENUM('all', 'first_time', 'existing'),
      defaultValue: 'all',
      field: 'user_limit',
    },
    // Danh mục áp dụng (null = tất cả danh mục)
    applicableCategories: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'applicable_categories',
      get() {
        const value = this.getDataValue('applicableCategories');
        if (!value) return [];
        try {
          return typeof value === 'string' ? JSON.parse(value) : value;
        } catch (error) {
          return [];
        }
      },
      set(value) {
        this.setDataValue(
          'applicableCategories',
          Array.isArray(value) ? JSON.stringify(value) : JSON.stringify(value || [])
        );
      },
    },
  },
  {
    tableName: 'vouchers',
    timestamps: true,
    indexes: [
      {
        fields: ['code'],
        unique: true,
      },
      {
        fields: ['is_active'],
      },
      {
        fields: ['start_date', 'end_date'],
      },
    ],
    hooks: {
      beforeValidate: (voucher) => {
        // Chuyển code thành uppercase
        if (voucher.code) {
          voucher.code = voucher.code.toUpperCase();
        }
      },
      beforeCreate: (voucher) => {
        // Validate startDate < endDate
        if (voucher.startDate >= voucher.endDate) {
          throw new Error('Ngày bắt đầu phải trước ngày kết thúc');
        }
      },
      beforeUpdate: (voucher) => {
        // Validate startDate < endDate
        if (voucher.startDate >= voucher.endDate) {
          throw new Error('Ngày bắt đầu phải trước ngày kết thúc');
        }
        
        // Không cho phép usedCount > usageLimit
        if (voucher.usageLimit && voucher.usedCount > voucher.usageLimit) {
          throw new Error('Số lần sử dụng không thể vượt quá giới hạn');
        }
      },
    },
  }
);

// Instance methods
Voucher.prototype.isValid = function() {
  const now = new Date();
  return (
    this.isActive &&
    now >= this.startDate &&
    now <= this.endDate &&
    (!this.usageLimit || this.usedCount < this.usageLimit)
  );
};

Voucher.prototype.canBeUsed = function(orderValue, userType = 'existing') {
  if (!this.isValid()) {
    return { valid: false, reason: 'Voucher không hợp lệ hoặc đã hết hạn' };
  }

  if (this.minOrderValue && orderValue < this.minOrderValue) {
    return { 
      valid: false, 
      reason: `Đơn hàng tối thiểu ${this.minOrderValue.toLocaleString('vi-VN')}đ` 
    };
  }

  if (this.userLimit !== 'all') {
    if (this.userLimit === 'first_time' && userType !== 'first_time') {
      return { valid: false, reason: 'Voucher chỉ dành cho khách hàng mới' };
    }
  }

  return { valid: true };
};

Voucher.prototype.calculateDiscount = function(orderValue, shippingCost = 0) {
  let discount = 0;

  switch (this.type) {
    case 'percentage':
      discount = (orderValue * this.value) / 100;
      if (this.maxDiscount && discount > this.maxDiscount) {
        discount = this.maxDiscount;
      }
      break;
    
    case 'fixed_amount':
      discount = Math.min(this.value, orderValue);
      break;
    
    case 'free_shipping':
      discount = Math.min(shippingCost, this.value || shippingCost);
      break;
    
    default:
      discount = 0;
  }

  return Math.round(discount);
};

module.exports = Voucher;