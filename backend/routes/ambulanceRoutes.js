const express = require('express');
const router = express.Router();
const ambulanceController = require('../controllers/ambulanceController');
const { authMiddleware, staffOnly } = require('../middleware/authMiddleware');

// Ambulance
router.post('/ambulance/request', authMiddleware, ambulanceController.requestAmbulance);
router.get('/ambulance/request/:id', authMiddleware, ambulanceController.getRequest);
router.post('/ambulance/request/:id/cancel', authMiddleware, ambulanceController.cancelRequest);
router.post('/ambulance/request/:id/assign', authMiddleware, staffOnly, ambulanceController.assignRequest);
router.post('/ambulance/request/:id/en-route', authMiddleware, staffOnly, ambulanceController.enRoute);
router.post('/ambulance/request/:id/arrived', authMiddleware, staffOnly, ambulanceController.arrived);

// Location
router.post('/location/update', authMiddleware, ambulanceController.updateLocation);
router.get('/location/:clientId', authMiddleware, ambulanceController.getLocation);

module.exports = router;
