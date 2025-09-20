const express = require('express');
const router = express.Router();
const locationController = require('../controllers/location.controller');

// Public routes - no authentication required for location data
router.get('/provinces', locationController.getProvinces);
router.get('/wards/:provinceId', locationController.getWardsByProvince);
router.get('/hierarchy', locationController.getLocationHierarchy);
router.get('/search', locationController.searchLocations);

module.exports = router;