const express = require('express');
const authRoutes = require('../../routes/authRoutes');
const telemedicineRoutes = require('../../routes/telemedicineRoutes');
const ambulanceRoutes = require('../../routes/ambulanceRoutes');
const insuranceRoutes = require('../../routes/insuranceRoutes');
const errorHandler = require('../../middleware/errorMiddleware');

function createTestApp() {
    const app = express();
    app.use(express.json({ limit: '1mb' }));
    app.get('/health', (_req, res) => res.json({ status: 'ok' }));
    app.use('/api/auth', authRoutes);
    app.use('/api/telemedicine', telemedicineRoutes);
    app.use('/api', insuranceRoutes);
    app.use('/api', ambulanceRoutes);
    app.use(errorHandler);
    return app;
}

module.exports = { createTestApp };
