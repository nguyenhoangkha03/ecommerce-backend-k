const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

const Contact = sequelize.define(
  'Contact',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        notEmpty: {
          msg: 'Tên không được để trống',
        },
        len: {
          args: [2, 100],
          msg: 'Tên phải có từ 2 đến 100 ký tự',
        },
      },
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        notEmpty: {
          msg: 'Email không được để trống',
        },
        isEmail: {
          msg: 'Email không hợp lệ',
        },
      },
    },
    subject: {
      type: DataTypes.ENUM('general', 'support', 'feedback', 'partnership'),
      allowNull: false,
      validate: {
        notEmpty: {
          msg: 'Chủ đề không được để trống',
        },
      },
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: false,
      validate: {
        notEmpty: {
          msg: 'Tin nhắn không được để trống',
        },
        len: {
          args: [10, 2000],
          msg: 'Tin nhắn phải có từ 10 đến 2000 ký tự',
        },
      },
    },
    status: {
      type: DataTypes.STRING,
      defaultValue: 'pending',
      allowNull: false,
      validate: {
        isIn: [['pending', 'in_progress', 'resolved', 'closed']]
      }
    },
    adminNotes: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'admin_notes',
    },
    respondedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'responded_at',
    },
    isRead: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'is_read',
    },
    priority: {
      type: DataTypes.STRING,
      defaultValue: 'medium',
      allowNull: false,
      validate: {
        isIn: [['low', 'medium', 'high', 'urgent']]
      }
    },
  },
  {
    tableName: 'contacts',
    timestamps: true,
    underscored: true,
    freezeTableName: true,
    indexes: [
      {
        fields: ['email'],
      },
      {
        fields: ['status'],
      },
      {
        fields: ['subject'],
      },
      {
        fields: ['createdAt'],
      },
      {
        fields: ['isRead'],
      },
    ],
  }
);

module.exports = Contact;