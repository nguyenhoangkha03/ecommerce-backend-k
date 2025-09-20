const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

const OrderItem = sequelize.define(
  'OrderItem',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    orderId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'order_id' // Map to snake_case column name
    },
    productId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'product_id' // Map to snake_case column name
    },
    variantId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'variant_id' // Map to snake_case column name
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    sku: {
      type: DataTypes.STRING,
      allowNull: true
    },
    price: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false
    },
    quantity: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    subtotal: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false
    },
    image: {
      type: DataTypes.STRING,
      allowNull: true
    },
    attributes: {
      type: DataTypes.JSONB,
      defaultValue: {}
    },
    warrantyPackageIds: {
      type: DataTypes.ARRAY(DataTypes.UUID),
      allowNull: true,
      field: 'warranty_package_ids'
    },
    warrantyTotal: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0,
      field: 'warranty_total'
    },
  },
  {
    tableName: 'order_items',
    timestamps: true,
  }
);

module.exports = OrderItem;
