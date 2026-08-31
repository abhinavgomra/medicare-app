const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/authMiddleware');
const insuranceController = require('../controllers/insuranceController');

router.get('/insurance/profile', authMiddleware, insuranceController.getInsuranceProfile);
router.put('/insurance/profile', authMiddleware, insuranceController.upsertInsuranceProfile);
router.post('/insurance/evaluate', authMiddleware, insuranceController.evaluateInsuranceEligibility);
router.get('/insurance/policies', authMiddleware, insuranceController.listGovernmentPolicies);

module.exports = router;
