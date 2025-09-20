const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

const VietnameseLocation = sequelize.define(
  'VietnameseLocation',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    type: {
      type: DataTypes.ENUM('province', 'ward'),
      allowNull: false
    },
    code: {
      type: DataTypes.STRING(10),
      allowNull: true
    },
    parent_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    }
  },
  {
    tableName: 'vietnamese_locations',
    timestamps: true,
    indexes: [
      {
        fields: ['type']
      },
      {
        fields: ['parent_id']
      },
      {
        fields: ['code']
      }
    ]
  }
);

// Define associations
VietnameseLocation.hasMany(VietnameseLocation, {
  as: 'children',
  foreignKey: 'parent_id'
});

VietnameseLocation.belongsTo(VietnameseLocation, {
  as: 'parent',
  foreignKey: 'parent_id'
});

module.exports = VietnameseLocation;