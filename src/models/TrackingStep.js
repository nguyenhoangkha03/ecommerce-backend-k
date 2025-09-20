const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

const TrackingStep = sequelize.define(
  'TrackingStep',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    orderId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'order_id',
      references: {
        model: 'orders',
        key: 'id',
      },
    },
    stepNumber: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'step_number',
      validate: {
        min: 1,
        max: 5,
      },
    },
    stepName: {
      type: DataTypes.ENUM(
        'preparing',     // Chuẩn bị vận chuyển
        'picked_up',     // Lấy hàng thành công
        'in_transit',    // Đang trên đường giao
        'out_for_delivery', // Chuẩn bị giao hàng
        'delivered'      // Đã giao thành công
      ),
      allowNull: false,
      field: 'step_name',
    },
    status: {
      type: DataTypes.ENUM(
        'pending',    // Chưa thực hiện
        'completed',  // Hoàn thành
        'delayed',    // Chậm trễ
        'failed',     // Thất bại
        'on_hold'     // Tạm hoãn
      ),
      defaultValue: 'pending',
    },
    completedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'completed_at',
    },
    estimatedTime: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'estimated_time',
    },
    adminId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'admin_id',
      references: {
        model: 'users',
        key: 'id',
      },
    },
  },
  {
    tableName: 'tracking_steps',
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ['order_id', 'step_number'],
      },
    ],
  }
);

module.exports = TrackingStep;