const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

const Permission = sequelize.define(
  'Permission',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    resource: {
      type: DataTypes.STRING(50),
      allowNull: false,
      comment: 'Resource name (e.g., products, orders, users)',
    },
    action: {
      type: DataTypes.STRING(50),
      allowNull: false,
      comment: 'Action name (e.g., create, read, update, delete)',
    },
    description: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
  },
  {
    tableName: 'permissions',
    timestamps: true,
    underscored: true,
    indexes: [
      {
        fields: ['resource', 'action'],
        unique: true,
        name: 'unique_resource_action',
      },
      {
        fields: ['resource'],
      },
      {
        fields: ['action'],
      },
    ],
  }
);

module.exports = Permission;