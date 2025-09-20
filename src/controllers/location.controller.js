const { VietnameseLocation } = require('../models');
const { AppError } = require('../middlewares/errorHandler');

// Get all provinces
const getProvinces = async (req, res, next) => {
  try {
    const provinces = await VietnameseLocation.findAll({
      where: { type: 'province' },
      order: [['name', 'ASC']],
      attributes: ['id', 'name', 'code']
    });

    res.status(200).json({
      status: 'success',
      data: provinces,
    });
  } catch (error) {
    next(error);
  }
};

// Get wards by province (Updated: Direct province -> ward relationship)
const getWardsByProvince = async (req, res, next) => {
  try {
    const { provinceId } = req.params;

    // Validate province exists
    const province = await VietnameseLocation.findOne({
      where: { id: provinceId, type: 'province' }
    });

    if (!province) {
      throw new AppError('Không tìm thấy tỉnh/thành phố', 404);
    }

    const wards = await VietnameseLocation.findAll({
      where: { 
        type: 'ward',
        parent_id: provinceId
      },
      order: [['name', 'ASC']],
      attributes: ['id', 'name', 'code']
    });

    res.status(200).json({
      status: 'success',
      data: wards,
    });
  } catch (error) {
    next(error);
  }
};

// Get full location hierarchy (Updated: Direct province -> ward relationship)
const getLocationHierarchy = async (req, res, next) => {
  try {
    const provinces = await VietnameseLocation.findAll({
      where: { type: 'province' },
      include: [
        {
          model: VietnameseLocation,
          as: 'children',
          where: { type: 'ward' },
          required: false,
          attributes: ['id', 'name', 'code']
        }
      ],
      order: [
        ['name', 'ASC'],
        [{ model: VietnameseLocation, as: 'children' }, 'name', 'ASC']
      ],
      attributes: ['id', 'name', 'code']
    });

    res.status(200).json({
      status: 'success',
      data: provinces,
    });
  } catch (error) {
    next(error);
  }
};

// Search locations by name
const searchLocations = async (req, res, next) => {
  try {
    const { q, type } = req.query;

    if (!q || q.trim().length < 2) {
      throw new AppError('Từ khóa tìm kiếm phải có ít nhất 2 ký tự', 400);
    }

    const whereClause = {
      name: {
        [require('sequelize').Op.like]: `%${q.trim()}%`
      }
    };

    if (type && ['province', 'ward'].includes(type)) {
      whereClause.type = type;
    }

    const locations = await VietnameseLocation.findAll({
      where: whereClause,
      limit: 20,
      order: [['name', 'ASC']],
      attributes: ['id', 'name', 'type', 'code', 'parent_id'],
      include: type !== 'province' ? [
        {
          model: VietnameseLocation,
          as: 'parent',
          attributes: ['id', 'name', 'type']
        }
      ] : []
    });

    res.status(200).json({
      status: 'success',
      data: locations,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getProvinces,
  getWardsByProvince,
  getLocationHierarchy,
  searchLocations,
};