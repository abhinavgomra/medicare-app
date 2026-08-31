const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authMiddleware } = require('../middleware/authMiddleware');
const { createRateLimiter } = require('../middleware/rateLimitMiddleware');

const signupCodeLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 5 });
const registerLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 10 });
const loginLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 20 });
const googleLoginLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 20 });

router.post('/send-signup-code', signupCodeLimiter, authController.sendSignupCode);
router.post('/register', registerLimiter, authController.register);
router.post('/login', loginLimiter, authController.login);
router.post('/google', googleLoginLimiter, authController.googleLogin);
router.get('/me', authMiddleware, authController.getMe);
router.put('/me', authMiddleware, authController.updateProfile);
router.put('/me/phone', authMiddleware, authController.updatePhone);

module.exports = router;
