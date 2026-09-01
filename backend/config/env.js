require('dotenv').config();

function parseCsv(value) {
    return String(value || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
}

const env = {
    PORT: process.env.PORT || 5000,
    JWT_SECRET: process.env.JWT_SECRET,
    MONGODB_URI: process.env.MONGODB_URI,
    USE_IN_MEMORY_DB: String(process.env.USE_IN_MEMORY_DB || 'true').toLowerCase() !== 'false',
    FORCE_HTTPS: String(process.env.FORCE_HTTPS || 'false').toLowerCase() === 'true',
    CORS_ORIGINS: parseCsv(process.env.CORS_ORIGINS || ''),

    // Google Auth (optional)
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,

    // Twilio
    TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID,
    TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN,
    TWILIO_FROM_NUMBER: process.env.TWILIO_FROM_NUMBER,
    TWILIO_VERIFY_SERVICE_SID: process.env.TWILIO_VERIFY_SERVICE_SID,
    NOTIFY_TO_NUMBER: process.env.NOTIFY_TO_NUMBER,
    AMBULANCE_CAN_DISPATCH: String(process.env.AMBULANCE_CAN_DISPATCH || 'true').toLowerCase() !== 'false',
    MOCK_TWILIO: String(process.env.MOCK_TWILIO || 'false').toLowerCase() === 'true',

    // AI
    AI_PROVIDER: String(process.env.AI_PROVIDER || 'auto').trim().toLowerCase(), // auto | groq | gemini
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    GEMINI_MODEL: String(process.env.GEMINI_MODEL || 'gemini-1.5-flash').trim(),
    GROQ_API_KEY: process.env.GROQ_API_KEY,
    GROQ_BASE_URL: String(process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1').trim(),
    GROQ_CHAT_MODEL: String(process.env.GROQ_CHAT_MODEL || 'llama-3.3-70b-versatile').trim(),
    GROQ_TRANSCRIBE_MODEL: String(process.env.GROQ_TRANSCRIBE_MODEL || 'whisper-large-v3-turbo').trim(),

    // Email
    EMAIL_TO: process.env.EMAIL_TO,
    SMTP_HOST: process.env.SMTP_HOST,
    SMTP_PORT: Number(process.env.SMTP_PORT || 587),
    SMTP_USER: process.env.SMTP_USER,
    SMTP_PASS: process.env.SMTP_PASS,

    // Telemedicine (WebRTC)
    TELEMEDICINE_STUN_SERVERS: parseCsv(process.env.TELEMEDICINE_STUN_SERVERS || 'stun:stun.l.google.com:19302'),
    TELEMEDICINE_TURN_SERVERS: parseCsv(process.env.TELEMEDICINE_TURN_SERVERS || ''),
    TELEMEDICINE_TURN_USERNAME: String(process.env.TELEMEDICINE_TURN_USERNAME || '').trim(),
    TELEMEDICINE_TURN_CREDENTIAL: String(process.env.TELEMEDICINE_TURN_CREDENTIAL || '').trim(),
    TELEMEDICINE_TWILIO_ICE_ENABLED: String(process.env.TELEMEDICINE_TWILIO_ICE_ENABLED || 'false').toLowerCase() === 'true',
    TELEMEDICINE_TWILIO_ICE_TTL: Number(process.env.TELEMEDICINE_TWILIO_ICE_TTL || 3600)
};

// Validation for critical secrets
const requiredSecrets = ['JWT_SECRET', 'MONGODB_URI'];
const missingSecrets = requiredSecrets.filter(key => !env[key]);

if (missingSecrets.length > 0) {
    if (env.USE_IN_MEMORY_DB && missingSecrets.includes('MONGODB_URI') && missingSecrets.length === 1) {
        // Allowed if using in-memory DB
    } else {
        console.warn(`[WARNING] Missing critical environment variables: ${missingSecrets.join(', ')}`);
        // In a strict production env, we might want to throw error here
        // throw new Error(\`Missing required environment variables: \${missingSecrets.join(', ')}\`);
    }
}

module.exports = env;
