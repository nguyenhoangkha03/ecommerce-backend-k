const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

const Address = sequelize.define(
  'Address',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false
    },
    // Legacy fields (kept for backward compatibility)
    name: {
      type: DataTypes.STRING,
      allowNull: true
    },
    firstName: {
      type: DataTypes.STRING,
      allowNull: true // Made nullable as we use receiverName now
    },
    lastName: {
      type: DataTypes.STRING,
      allowNull: true // Made nullable as we use receiverName now
    },
    company: {
      type: DataTypes.STRING,
      allowNull: true
    },
    address1: {
      type: DataTypes.STRING,
      allowNull: true // Made nullable as we use detailAddress now
    },
    address2: {
      type: DataTypes.STRING,
      allowNull: true
    },
    city: {
      type: DataTypes.STRING,
      allowNull: true // Made nullable as we use district now
    },
    state: {
      type: DataTypes.STRING,
      allowNull: true // Made nullable as we use province now
    },
    zip: {
      type: DataTypes.STRING,
      allowNull: false
    },
    country: {
      type: DataTypes.STRING,
      allowNull: false
    },
    phone: {
      type: DataTypes.STRING,
      allowNull: true
    },
    isDefault: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    
    // New enhanced fields for Shopee-style address
    receiverName: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    addressLabel: {
      type: DataTypes.ENUM('home', 'office', 'other'),
      allowNull: false,
      defaultValue: 'home'
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    ward: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    district: {
      type: DataTypes.STRING(255),
      allowNull: true // Made nullable - Vietnam now uses province->ward structure only
    },
    province: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    detailAddress: {
      type: DataTypes.STRING(500),
      allowNull: false
    },
    
    // Location IDs for better referencing
    provinceId: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    districtId: {
      type: DataTypes.INTEGER,
      allowNull: true // Made nullable - Vietnam now uses province->ward structure only
    },
    wardId: {
      type: DataTypes.INTEGER,
      allowNull: true
    }
  },
  {
    tableName: 'addresses',
    timestamps: true,
  }
);

module.exports = Address;
