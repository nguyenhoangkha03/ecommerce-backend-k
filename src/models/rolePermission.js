const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

const RolePermission = sequelize.define(
  'RolePermission',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    roleId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'role_id',
      references: {
        model: 'roles',
        key: 'id',
      },
    },
    permissionId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'permission_id',
      references: {
        model: 'permissions',
        key: 'id',
      },
    },
  },
  {
    tableName: 'role_permissions',
    timestamps: true,
    underscored: true,
    indexes: [
      {
        fields: ['role_id', 'permission_id'],
        unique: true,
        name: 'unique_role_permission',
      },
    ],
  }
);

module.exports = RolePermission;