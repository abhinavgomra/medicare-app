const http = require('http');
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const mongoose = require('mongoose');
const connectDatabase = require('./config/db');
const env = require('./config/env');
const errorHandler = require('./middleware/errorMiddleware');
const Doctor = require('./models/Doctor');

// Routes
const authRoutes = require('./routes/authRoutes');
const doctorRoutes = require('./routes/doctorRoutes');
const appointmentRoutes = require('./routes/appointmentRoutes');
const serviceRoutes = require('./routes/serviceRoutes');
const ambulanceRoutes = require('./routes/ambulanceRoutes');
const devRoutes = require('./routes/devRoutes');
const doctorPortalRoutes = require('./routes/doctorPortalRoutes');
const pharmacyRoutes = require('./routes/pharmacyRoutes');
const telemedicineRoutes = require('./routes/telemedicineRoutes');
const insuranceRoutes = require('./routes/insuranceRoutes');
const PharmacyProduct = require('./models/PharmacyProduct');
const { createCallSignaling } = require('./realtime/callSignaling');

const app = express();
const httpServer = http.createServer(app);

// Middleware
app.enable('trust proxy');
if (env.FORCE_HTTPS) {
  app.use((req, res, next) => {
    const host = String(req.hostname || '').toLowerCase();
    const isLocalHost = host === 'localhost' || host === '127.0.0.1';
    if (req.secure || isLocalHost) return next();
    return res.redirect(301, `https://${req.headers.host}${req.originalUrl}`);
  });
}
const allowedOrigins = new Set((env.CORS_ORIGINS || []).map((o) => String(o).trim()).filter(Boolean));
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.size === 0 || allowedOrigins.has(origin)) return callback(null, true);
    const corsError = new Error('cors_not_allowed');
    corsError.status = 403;
    return callback(corsError);
  }
}));
app.use(express.json({ limit: '1mb' }));
app.use(morgan('dev'));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});
// Health
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/doctors', doctorRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/doctor', doctorPortalRoutes);
app.use('/api/pharmacy', pharmacyRoutes);
app.use('/api/telemedicine', telemedicineRoutes);
app.use('/api', insuranceRoutes);
app.use('/api', serviceRoutes); // OCR, Voice, Verify, AI are mounted directly on /api
app.use('/api', ambulanceRoutes);
app.use('/api', devRoutes);

// Error Handler
app.use(errorHandler);

// Real-time signaling for WebRTC calls
createCallSignaling(httpServer);

async function seedDoctorsIfNeeded() {
  const count = await Doctor.countDocuments();
  if (count === 0) {
    const seedData = require('./data/doctors.json');
    await Doctor.insertMany(seedData);
    console.log(`Seeded ${seedData.length} doctors`);
  }

  const extras = require('./data/doctors_extra.json');
  if (Array.isArray(extras) && extras.length) {
    let upserts = 0;
    for (const d of extras) {
      await Doctor.findOneAndUpdate({ id: d.id }, d, { upsert: true, new: true });
      upserts += 1;
    }
    console.log(`Upserted extra doctors: ${upserts}`);
  }
}

async function seedPharmacyProductsIfNeeded() {
  const products = require('./data/pharmacy_products.json');
  if (!Array.isArray(products) || products.length === 0) return;
  let upserts = 0;
  for (const p of products) {
    await PharmacyProduct.findOneAndUpdate({ id: p.id }, p, { upsert: true, new: true });
    upserts += 1;
  }
  console.log(`Upserted pharmacy products: ${upserts}`);
}

// Start server
let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Received ${signal}. Shutting down gracefully...`);

  const forceExitTimer = setTimeout(() => {
    process.exit(1);
  }, 10_000);
  forceExitTimer.unref();

  httpServer.close(async () => {
    try {
      await mongoose.connection.close(false);
    } catch (_) { }
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

connectDatabase()
  .then(async () => {
    try {
      await seedDoctorsIfNeeded();
      await seedPharmacyProductsIfNeeded();
    } catch (e) {
      console.warn('Seeding skipped or failed:', e.message);
    }

    httpServer.listen(env.PORT, () => {
      console.log(`API running on port ${env.PORT}`);
    });
  })
  .catch((err) => {
    console.error('Failed to connect to DB:', err);
    process.exit(1);
  });
