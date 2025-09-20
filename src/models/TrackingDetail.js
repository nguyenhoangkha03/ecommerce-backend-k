const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

const TrackingDetail = sequelize.define(
  'TrackingDetail',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    trackingStepId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'tracking_step_id',
      references: {
        model: 'tracking_steps',
        key: 'id',
      },
    },
    location: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Vị trí hiện tại của kiện hàng',
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Mô tả chi tiết trạng thái',
    },
    // Thông tin shipper (cho bước 4 - Chuẩn bị giao hàng)
    shipperName: {
      type: DataTypes.STRING,
      allowNull: true,
      field: 'shipper_name',
    },
    shipperPhone: {
      type: DataTypes.STRING,
      allowNull: true,
      field: 'shipper_phone',
    },
    // Hình ảnh proof of delivery (cho bước 5 - Đã giao)
    proofImages: {
      type: DataTypes.JSON,
      allowNull: true,
      field: 'proof_images',
      comment: 'Array chứa đường dẫn các hình ảnh proof',
    },
    // Xử lý vấn đề
    hasIssue: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'has_issue',
    },
    issueReason: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'issue_reason',
      comment: 'Nguyên nhân gặp vấn đề',
    },
    issueType: {
      type: DataTypes.ENUM(
        'address_incorrect',  // Địa chỉ không đúng
        'customer_unavailable', // Khách hàng không có mặt
        'weather_delay',      // Chậm trễ do thời tiết
        'vehicle_breakdown',  // Xe hỏng
        'other'              // Khác
      ),
      allowNull: true,
      field: 'issue_type',
    },
    estimatedResolution: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'estimated_resolution',
      comment: 'Thời gian dự kiến giải quyết vấn đề',
    },
    adminNotes: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'admin_notes',
      comment: 'Ghi chú từ admin',
    },
    // Thông tin admin cập nhật
    updatedByAdmin: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'updated_by_admin',
      references: {
        model: 'users',
        key: 'id',
      },
    },
  },
  {
    tableName: 'tracking_details',
    timestamps: true,
  }
);

module.exports = TrackingDetail;