const {
  TrackingStep,
  TrackingDetail,
  Order,
  OrderItem,
  User,
  sequelize,
} = require('../models');
const { AppError } = require('../middlewares/errorHandler');

// Tạo tracking steps mặc định cho đơn hàng mới
const createDefaultTrackingSteps = async (orderId, adminId = null) => {
  const transaction = await sequelize.transaction();

  try {
    const steps = [
      {
        orderId,
        stepNumber: 1,
        stepName: 'preparing',
        status: 'completed',
        completedAt: new Date(),
        adminId,
      },
      {
        orderId,
        stepNumber: 2,
        stepName: 'picked_up',
        status: 'pending',
        adminId,
      },
      {
        orderId,
        stepNumber: 3,
        stepName: 'in_transit',
        status: 'pending',
        adminId,
      },
      {
        orderId,
        stepNumber: 4,
        stepName: 'out_for_delivery',
        status: 'pending',
        adminId,
      },
      {
        orderId,
        stepNumber: 5,
        stepName: 'delivered',
        status: 'pending',
        adminId,
      },
    ];

    const createdSteps = await TrackingStep.bulkCreate(steps, { transaction });

    // Tạo detail mặc định cho bước đầu tiên
    await TrackingDetail.create(
      {
        trackingStepId: createdSteps[0].id,
        location: 'Kho BadmintonShop - 421c Đường Trần Chiên, Cần Thơ',
        description: 'Đang chuẩn bị kiện hàng của bạn và sẽ được bàn giao cho đơn vị vận chuyển',
        updatedByAdmin: adminId,
      },
      { transaction }
    );

    await transaction.commit();
    return createdSteps;
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

// Lấy tracking information của một đơn hàng
const getOrderTracking = async (req, res, next) => {
  try {
    const { orderNumber } = req.params;
    const userId = req.user.id;

    const order = await Order.findOne({
      where: { number: orderNumber, userId },
      include: [
        {
          model: TrackingStep,
          as: 'trackingSteps',
          include: [
            {
              model: TrackingDetail,
              as: 'detail',
            },
            {
              model: User,
              as: 'admin',
              attributes: ['id', 'firstName', 'lastName'],
            },
          ],
          order: [['stepNumber', 'ASC']],
        },
        {
          model: OrderItem,
          as: 'items',
          attributes: ['id', 'name', 'image', 'price', 'quantity', 'subtotal'],
        },
      ],
    });

    if (!order) {
      throw new AppError('Không tìm thấy đơn hàng', 404);
    }

    // Nếu đơn hàng chưa có tracking steps, tạo mặc định
    if (!order.trackingSteps || order.trackingSteps.length === 0) {
      await createDefaultTrackingSteps(order.id);
      
      // Lấy lại order với tracking steps
      const updatedOrder = await Order.findOne({
        where: { number: orderNumber, userId },
        include: [
          {
            model: TrackingStep,
            as: 'trackingSteps',
            include: [
              {
                model: TrackingDetail,
                as: 'detail',
              },
            ],
            order: [['stepNumber', 'ASC']],
          },
          {
            model: OrderItem,
            as: 'items',
            attributes: ['id', 'name', 'image', 'price', 'quantity', 'subtotal'],
          },
        ],
      });

      return res.status(200).json({
        status: 'success',
        data: {
          order: updatedOrder,
          trackingSteps: updatedOrder.trackingSteps,
        },
      });
    }

    res.status(200).json({
      status: 'success',
      data: {
        order,
        trackingSteps: order.trackingSteps,
      },
    });
  } catch (error) {
    next(error);
  }
};

// [ADMIN] Lấy danh sách tất cả đơn hàng cần quản lý tracking
const getAllOrdersForTracking = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, status, stepName } = req.query;
    const offset = (page - 1) * limit;

    const whereClause = {};
    const stepWhereClause = {};

    if (status) {
      whereClause.status = status;
    }
    if (stepName) {
      stepWhereClause.stepName = stepName;
    }

    const orders = await Order.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: TrackingStep,
          as: 'trackingSteps',
          where: stepWhereClause,
          required: Object.keys(stepWhereClause).length > 0,
          include: [
            {
              model: TrackingDetail,
              as: 'detail',
            },
          ],
          order: [['stepNumber', 'ASC']],
        },
        {
          model: User,
          attributes: ['id', 'firstName', 'lastName', 'email'],
        },
      ],
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['createdAt', 'DESC']],
      distinct: true,
    });

    res.status(200).json({
      status: 'success',
      data: {
        orders: orders.rows,
        total: orders.count,
        page: parseInt(page),
        totalPages: Math.ceil(orders.count / limit),
      },
    });
  } catch (error) {
    next(error);
  }
};

// [ADMIN] Cập nhật tracking step
const updateTrackingStep = async (req, res, next) => {
  const transaction = await sequelize.transaction();

  try {
    const { stepId } = req.params;
    const adminId = req.user.id;
    const {
      status,
      completedAt,
      estimatedTime,
      location,
      description,
      shipperName,
      shipperPhone,
      proofImages,
      hasIssue,
      issueReason,
      issueType,
      estimatedResolution,
      adminNotes,
    } = req.body;

    const trackingStep = await TrackingStep.findByPk(stepId, {
      include: [{ model: TrackingDetail, as: 'detail' }],
      transaction,
    });

    if (!trackingStep) {
      throw new AppError('Không tìm thấy tracking step', 404);
    }

    // Cập nhật tracking step
    await trackingStep.update(
      {
        status,
        completedAt: status === 'completed' ? completedAt || new Date() : null,
        estimatedTime,
        adminId,
      },
      { transaction }
    );

    // Cập nhật hoặc tạo tracking detail
    let trackingDetail = trackingStep.detail;
    
    if (trackingDetail) {
      await trackingDetail.update(
        {
          location,
          description,
          shipperName,
          shipperPhone,
          proofImages,
          hasIssue: hasIssue || false,
          issueReason,
          issueType,
          estimatedResolution,
          adminNotes,
          updatedByAdmin: adminId,
        },
        { transaction }
      );
    } else {
      trackingDetail = await TrackingDetail.create(
        {
          trackingStepId: stepId,
          location,
          description,
          shipperName,
          shipperPhone,
          proofImages,
          hasIssue: hasIssue || false,
          issueReason,
          issueType,
          estimatedResolution,
          adminNotes,
          updatedByAdmin: adminId,
        },
        { transaction }
      );
    }

    // Cập nhật current_tracking_step trong orders nếu step completed
    if (status === 'completed') {
      const updateData = { currentTrackingStep: trackingStep.stepNumber };
      
      // Nếu step "delivered" hoàn thành, tự động cập nhật order status thành "delivered"
      if (trackingStep.stepName === 'delivered') {
        updateData.status = 'delivered';
        
        // Tự động cập nhật payment status thành "paid" cho COD orders
        const order = await Order.findByPk(trackingStep.orderId, { transaction });
        if (order && order.paymentMethod === 'cod' && order.paymentStatus === 'pending') {
          updateData.paymentStatus = 'paid';
        }
      }
      
      await Order.update(
        updateData,
        { 
          where: { id: trackingStep.orderId },
          transaction 
        }
      );
    }

    await transaction.commit();

    // Lấy lại data đã cập nhật
    const updatedStep = await TrackingStep.findByPk(stepId, {
      include: [
        { model: TrackingDetail, as: 'detail' },
        { model: User, as: 'admin', attributes: ['id', 'firstName', 'lastName'] },
      ],
    });

    res.status(200).json({
      status: 'success',
      message: 'Cập nhật tracking thành công',
      data: updatedStep,
    });
  } catch (error) {
    await transaction.rollback();
    next(error);
  }
};

// [ADMIN] Tạo tracking steps cho đơn hàng (nếu chưa có)
const initializeOrderTracking = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const adminId = req.user.id;

    const order = await Order.findByPk(orderId);
    if (!order) {
      throw new AppError('Không tìm thấy đơn hàng', 404);
    }

    // Kiểm tra xem đã có tracking steps chưa
    const existingSteps = await TrackingStep.findAll({
      where: { orderId },
    });

    if (existingSteps.length > 0) {
      throw new AppError('Đơn hàng đã có tracking steps', 400);
    }

    const trackingSteps = await createDefaultTrackingSteps(orderId, adminId);

    res.status(201).json({
      status: 'success',
      message: 'Khởi tạo tracking thành công',
      data: trackingSteps,
    });
  } catch (error) {
    next(error);
  }
};

// [ADMIN] Lấy thống kê tracking
const getTrackingStatistics = async (req, res, next) => {
  try {
    const stats = await TrackingStep.findAll({
      attributes: [
        'stepName',
        'status',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
      ],
      group: ['stepName', 'status'],
    });

    // Thống kê số đơn hàng có vấn đề
    const issueStats = await TrackingDetail.findAll({
      attributes: [
        'issueType',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
      ],
      where: { hasIssue: true },
      group: ['issueType'],
    });

    res.status(200).json({
      status: 'success',
      data: {
        stepStats: stats,
        issueStats: issueStats,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createDefaultTrackingSteps,
  getOrderTracking,
  getAllOrdersForTracking,
  updateTrackingStep,
  initializeOrderTracking,
  getTrackingStatistics,
};