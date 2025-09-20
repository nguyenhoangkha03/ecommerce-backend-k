const { Voucher, Order, User, sequelize } = require('../models');
const { AppError } = require('../middlewares/errorHandler');
const { Op } = require('sequelize');

/**
 * Validate voucher code for customer use
 */
const validateVoucher = async (req, res, next) => {
  try {
    const { code, orderValue, shippingCost = 0 } = req.body;
    const userId = req.user?.id;

    if (!code || !orderValue) {
      throw new AppError('Mã voucher và giá trị đơn hàng là bắt buộc', 400);
    }

    // Tìm voucher theo code
    const voucher = await Voucher.findOne({
      where: { 
        code: code.toUpperCase(),
        isActive: true 
      }
    });

    if (!voucher) {
      throw new AppError('Mã voucher không tồn tại', 404);
    }

    // Kiểm tra voucher có hợp lệ không
    const validationResult = voucher.canBeUsed(parseFloat(orderValue));
    if (!validationResult.valid) {
      throw new AppError(validationResult.reason, 400);
    }

    // Kiểm tra người dùng đã sử dụng voucher này chưa (nếu cần)
    if (userId && voucher.userLimit === 'first_time') {
      const existingOrder = await Order.findOne({
        where: {
          userId,
          voucherCode: code.toUpperCase(),
        }
      });

      if (existingOrder) {
        throw new AppError('Bạn đã sử dụng voucher này rồi', 400);
      }
    }

    // Tính toán discount
    const discount = voucher.calculateDiscount(parseFloat(orderValue), parseFloat(shippingCost));

    res.json({
      success: true,
      data: {
        voucher: {
          id: voucher.id,
          code: voucher.code,
          name: voucher.name,
          description: voucher.description,
          type: voucher.type,
          value: voucher.value,
          discount,
        },
        discount,
        message: `Áp dụng voucher thành công. Giảm ${discount.toLocaleString('vi-VN')}đ`,
      }
    });

  } catch (error) {
    next(error);
  }
};

/**
 * Get available vouchers for customer
 */
const getAvailableVouchers = async (req, res, next) => {
  try {
    const { orderValue, shippingCost } = req.query;
    const userId = req.user?.id;

    const now = new Date();
    const whereClause = {
      isActive: true,
      startDate: { [Op.lte]: now },
      endDate: { [Op.gte]: now },
      [Op.or]: [
        { usageLimit: null },
        { usageLimit: { [Op.gt]: sequelize.col('used_count') } }
      ]
    };

    // Lọc theo giá trị đơn hàng nếu có
    if (orderValue) {
      whereClause[Op.or] = [
        { minOrderValue: null },
        { minOrderValue: { [Op.lte]: parseFloat(orderValue) } }
      ];
    }

    const vouchers = await Voucher.findAll({
      where: whereClause,
      order: [['createdAt', 'DESC']],
      attributes: [
        'id', 'code', 'name', 'description', 'type', 'value', 
        'minOrderValue', 'maxDiscount', 'endDate'
      ]
    });

    // Thêm thông tin discount cho mỗi voucher
    const vouchersWithDiscount = vouchers.map(voucher => {
      const voucherData = voucher.toJSON();
      if (orderValue) {
        voucherData.potentialDiscount = voucher.calculateDiscount(
          parseFloat(orderValue), 
          parseFloat(shippingCost || 0)
        );
        voucherData.canUse = voucher.canBeUsed(parseFloat(orderValue)).valid;
      }
      return voucherData;
    });

    res.json({
      success: true,
      data: vouchersWithDiscount,
    });

  } catch (error) {
    next(error);
  }
};

/**
 * Get voucher for new users (users with no orders)
 */
const getNewUserVoucher = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    
    if (!userId) {
      throw new AppError('Bạn cần đăng nhập để xem voucher', 401);
    }

    // Check if user has any orders
    const existingOrders = await Order.findOne({
      where: { userId }
    });

    if (existingOrders) {
      return res.json({
        success: true,
        data: null,
        message: 'Voucher này chỉ dành cho khách hàng mới chưa có đơn hàng nào'
      });
    }

    // Find active new user vouchers
    const now = new Date();
    const newUserVoucher = await Voucher.findOne({
      where: {
        isActive: true,
        userLimit: 'first_time',
        startDate: { [Op.lte]: now },
        endDate: { [Op.gte]: now },
        [Op.or]: [
          { usageLimit: null },
          { usageLimit: { [Op.gt]: sequelize.col('used_count') } }
        ]
      },
      order: [['createdAt', 'DESC']], // Get the newest voucher first
      attributes: [
        'id', 'code', 'name', 'description', 'type', 'value', 
        'minOrderValue', 'maxDiscount', 'endDate'
      ]
    });

    if (!newUserVoucher) {
      return res.json({
        success: true,
        data: null,
        message: 'Hiện tại không có voucher nào dành cho khách hàng mới'
      });
    }

    // Check if user already used this voucher
    const voucherUsage = await Order.findOne({
      where: {
        userId,
        voucherCode: newUserVoucher.code
      }
    });

    if (voucherUsage) {
      return res.json({
        success: true,
        data: null,
        message: 'Bạn đã sử dụng voucher này rồi'
      });
    }

    res.json({
      success: true,
      data: newUserVoucher,
      message: 'Chúc mừng! Bạn có một voucher đặc biệt dành cho khách hàng mới'
    });

  } catch (error) {
    next(error);
  }
};

/**
 * Admin: Get all vouchers
 */
const getAllVouchers = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 10,
      search,
      isActive,
      type,
      sortBy = 'createdAt',
      sortOrder = 'DESC'
    } = req.query;

    const offset = (page - 1) * limit;
    const whereClause = {};

    // Search filter
    if (search) {
      whereClause[Op.or] = [
        { code: { [Op.iLike]: `%${search}%` } },
        { name: { [Op.iLike]: `%${search}%` } }
      ];
    }

    // Status filter
    if (isActive !== undefined) {
      whereClause.isActive = isActive === 'true';
    }

    // Type filter
    if (type) {
      whereClause.type = type;
    }

    const { count, rows: vouchers } = await Voucher.findAndCountAll({
      where: whereClause,
      order: [[sortBy, sortOrder]],
      limit: parseInt(limit),
      offset: parseInt(offset),
    });

    res.json({
      success: true,
      data: {
        vouchers,
        pagination: {
          total: count,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(count / limit),
        }
      }
    });

  } catch (error) {
    next(error);
  }
};

/**
 * Admin: Create voucher
 */
const createVoucher = async (req, res, next) => {
  try {
    const voucherData = req.body;

    // Validate dates
    if (new Date(voucherData.startDate) >= new Date(voucherData.endDate)) {
      throw new AppError('Ngày bắt đầu phải trước ngày kết thúc', 400);
    }

    // Validate percentage value
    if (voucherData.type === 'percentage' && voucherData.value > 100) {
      throw new AppError('Giá trị phần trăm không được vượt quá 100%', 400);
    }

    const voucher = await Voucher.create(voucherData);

    res.status(201).json({
      success: true,
      data: voucher,
      message: 'Tạo voucher thành công',
    });

  } catch (error) {
    next(error);
  }
};

/**
 * Admin: Update voucher
 */
const updateVoucher = async (req, res, next) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const voucher = await Voucher.findByPk(id);
    if (!voucher) {
      throw new AppError('Không tìm thấy voucher', 404);
    }

    // Validate dates if updating
    if (updateData.startDate && updateData.endDate) {
      if (new Date(updateData.startDate) >= new Date(updateData.endDate)) {
        throw new AppError('Ngày bắt đầu phải trước ngày kết thúc', 400);
      }
    }

    await voucher.update(updateData);

    res.json({
      success: true,
      data: voucher,
      message: 'Cập nhật voucher thành công',
    });

  } catch (error) {
    next(error);
  }
};

/**
 * Admin: Delete voucher
 */
const deleteVoucher = async (req, res, next) => {
  try {
    const { id } = req.params;

    const voucher = await Voucher.findByPk(id);
    if (!voucher) {
      throw new AppError('Không tìm thấy voucher', 404);
    }

    await voucher.destroy();

    res.json({
      success: true,
      message: 'Xóa voucher thành công',
    });

  } catch (error) {
    next(error);
  }
};

/**
 * Admin: Get voucher statistics
 */
const getVoucherStats = async (req, res, next) => {
  try {
    const totalVouchers = await Voucher.count();
    const activeVouchers = await Voucher.count({ where: { isActive: true } });
    const expiredVouchers = await Voucher.count({
      where: { endDate: { [Op.lt]: new Date() } }
    });

    // Most used vouchers
    const mostUsedVouchers = await Voucher.findAll({
      order: [['usedCount', 'DESC']],
      limit: 5,
      attributes: ['code', 'name', 'usedCount', 'usageLimit']
    });

    res.json({
      success: true,
      data: {
        totalVouchers,
        activeVouchers,
        expiredVouchers,
        mostUsedVouchers,
      }
    });

  } catch (error) {
    next(error);
  }
};

module.exports = {
  validateVoucher,
  getAvailableVouchers,
  getNewUserVoucher,
  getAllVouchers,
  createVoucher,
  updateVoucher,
  deleteVoucher,
  getVoucherStats,
};