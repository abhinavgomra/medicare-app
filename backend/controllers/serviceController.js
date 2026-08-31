const { createWorker } = require('tesseract.js');
const env = require('../config/env');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const OpenAI = require('openai');
const { toFile } = require('openai/uploads');
const { getSmsClient, getTwilioConfigStatus } = require('../services/smsService');
const User = require('../models/User');

const smsClient = getSmsClient();

function normalizePhoneToE164(phone) {
  const s = String(phone || '').replace(/\D/g, '');
  if (!s || s.length < 10) return null;
  if (s.length === 10 && (s.startsWith('6') || s.startsWith('7') || s.startsWith('8') || s.startsWith('9'))) {
    return '+91' + s;
  }
  if (s.length === 12 && s.startsWith('91')) return '+' + s;
  if (s.length === 11 && s.startsWith('0')) return normalizePhoneToE164(s.slice(1));
  if (s.length >= 10) return '+' + s;
  return null;
}

let geminiClient = null;
if (env.GEMINI_API_KEY) {
  geminiClient = new GoogleGenerativeAI(env.GEMINI_API_KEY);
}

let groqClient = null;
if (env.GROQ_API_KEY) {
  groqClient = new OpenAI({
    apiKey: env.GROQ_API_KEY,
    baseURL: env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1'
  });
}

function getAiProviderOrder() {
  if (env.AI_PROVIDER === 'gemini') return ['gemini', 'groq'];
  if (env.AI_PROVIDER === 'groq') return ['groq', 'gemini'];
  return ['groq', 'gemini'];
}

function hasAnyAiProvider() {
  return Boolean(groqClient || geminiClient);
}

async function transcribeWithGroq(file) {
  if (!groqClient) throw new Error('groq client unavailable');
  const mimeType = file.mimetype || 'audio/webm';
  const upload = await toFile(file.buffer, file.originalname || 'audio.webm', { type: mimeType });
  const response = await groqClient.audio.transcriptions.create({
    file: upload,
    model: env.GROQ_TRANSCRIBE_MODEL || 'whisper-large-v3-turbo'
  });
  return String(response?.text || '').trim();
}

async function transcribeWithGemini(file) {
  if (!geminiClient) throw new Error('gemini client unavailable');
  const model = geminiClient.getGenerativeModel({ model: env.GEMINI_MODEL || 'gemini-1.5-flash' });
  const mimeType = file.mimetype || 'audio/webm';
  const audioPart = {
    inlineData: {
      data: file.buffer.toString('base64'),
      mimeType
    }
  };
  const result = await model.generateContent([
    'Transcribe the following audio exactly as spoken. Return only the text.',
    audioPart
  ]);
  const response = await result.response;
  return String(response.text() || '').trim();
}

function getAssistantSystemPrompt() {
  return (
    "You are a careful, empathetic, health-oriented assistant. Communicate in the user's language (hi for Hindi, en for English).\n" +
    'SAFETY: You are NOT a doctor. Provide general information only and advise seeing a professional for diagnosis or emergencies.\n' +
    'STYLE: Short, clear bullet points when helpful. For urgent red flags, clearly recommend emergency services.'
  );
}

async function replyWithGroq(message, language) {
  if (!groqClient) throw new Error('groq client unavailable');
  const userPref = language && String(language).toLowerCase().startsWith('hi') ? 'hi' : 'en';
  const completion = await groqClient.chat.completions.create({
    model: env.GROQ_CHAT_MODEL || 'llama-3.3-70b-versatile',
    temperature: 0.2,
    messages: [
      { role: 'system', content: getAssistantSystemPrompt() },
      { role: 'user', content: `Language: ${userPref}. User: ${message}` }
    ]
  });
  const text = completion?.choices?.[0]?.message?.content;
  return String(text || '').trim();
}

async function replyWithGemini(message, language) {
  if (!geminiClient) throw new Error('gemini client unavailable');
  const userPref = language && String(language).toLowerCase().startsWith('hi') ? 'hi' : 'en';
  const model = geminiClient.getGenerativeModel({
    model: env.GEMINI_MODEL || 'gemini-1.5-flash',
    systemInstruction: getAssistantSystemPrompt()
  });
  const result = await model.generateContent(`Language: ${userPref}. User: ${message}`);
  const response = await result.response;
  return String(response.text() || '').trim();
}

let ocrWorker = null;
let ocrWorkerInitPromise = null;
let ocrQueue = Promise.resolve();

async function getOcrWorker() {
  if (ocrWorker) return ocrWorker;
  if (!ocrWorkerInitPromise) {
    ocrWorkerInitPromise = (async () => {
      const worker = await createWorker();
      await worker.loadLanguage('eng');
      await worker.initialize('eng');
      ocrWorker = worker;
      return worker;
    })().catch((err) => {
      ocrWorkerInitPromise = null;
      throw err;
    });
  }
  return ocrWorkerInitPromise;
}

function enqueueOcrTask(task) {
  const run = ocrQueue.then(task);
  ocrQueue = run.catch(() => { });
  return run;
}

exports.ocrPrescription = async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'file required' });
  try {
    const { data } = await enqueueOcrTask(async () => {
      const worker = await getOcrWorker();
      return worker.recognize(req.file.buffer);
    });
    res.json({ text: data?.text || '' });
  } catch (err) {
    console.error('OCR Error:', err);
    res.status(500).json({ error: 'ocr_failed', details: err.message });
  }
};

exports.transcribeVoice = async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'file required' });
  if (!hasAnyAiProvider()) {
    return res.status(400).json({
      error: 'voice_disabled_no_provider',
      details: 'Set GROQ_API_KEY (recommended) or GEMINI_API_KEY in backend .env'
    });
  }

  let lastErr = null;
  for (const provider of getAiProviderOrder()) {
    try {
      if (provider === 'groq' && groqClient) {
        const text = await transcribeWithGroq(req.file);
        return res.json({ text: text || '', provider: 'groq', model: env.GROQ_TRANSCRIBE_MODEL });
      }
      if (provider === 'gemini' && geminiClient) {
        const text = await transcribeWithGemini(req.file);
        return res.json({ text: text || '', provider: 'gemini', model: env.GEMINI_MODEL });
      }
    } catch (err) {
      lastErr = err;
      console.warn(`Voice transcription failed on ${provider}:`, err.message);
    }
  }

  return res.status(500).json({
    error: 'transcription_failed',
    details: lastErr ? lastErr.message : 'all providers failed'
  });
};

exports.startVerify = async (req, res) => {
  try {
    const twilioConfig = getTwilioConfigStatus();
    if (!smsClient || !env.TWILIO_VERIFY_SERVICE_SID) {
      return res.status(400).json({
        error: 'Phone verification (SMS) is not configured. Set up Twilio Verify in .env',
        details: twilioConfig.issues.join('; ') || 'Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_VERIFY_SERVICE_SID'
      });
    }
    const { phone } = req.body || {};
    if (!phone) return res.status(400).json({ error: 'phone required' });
    const e164 = normalizePhoneToE164(phone) || phone;
    const result = await smsClient.verify.v2.services(env.TWILIO_VERIFY_SERVICE_SID)
      .verifications.create({ to: e164, channel: 'sms' });
    return res.json({ sid: result.sid, status: result.status });
  } catch (err) {
    console.error('Verify Start Error:', err);
    const msg = err.code === 21211
      ? 'Invalid phone number format. Use e.g. +919876543210 or 9876543210'
      : err.code === 20003
        ? 'Twilio authentication failed. Check TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN'
        : err.message;
    return res.status(500).json({ error: 'verify_start_failed', details: msg });
  }
};

exports.checkVerify = async (req, res) => {
  try {
    const twilioConfig = getTwilioConfigStatus();
    if (!smsClient || !env.TWILIO_VERIFY_SERVICE_SID) {
      return res.status(400).json({
        error: 'Phone verification is not configured',
        details: twilioConfig.issues.join('; ') || 'Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_VERIFY_SERVICE_SID'
      });
    }
    const { phone, code } = req.body || {};
    if (!phone || !code) return res.status(400).json({ error: 'phone and code required' });
    const e164 = normalizePhoneToE164(phone) || phone;
    const check = await smsClient.verify.v2.services(env.TWILIO_VERIFY_SERVICE_SID)
      .verificationChecks.create({ to: e164, code: String(code).trim() });
    const valid = check.status === 'approved';
    if (valid && req.user) {
      await User.findOneAndUpdate(
        { email: req.user.email },
        { phoneVerified: true, phone: e164 }
      );
    }
    return res.json({ status: check.status, valid });
  } catch (err) {
    console.error('Verify Check Error:', err);
    const msg = err.code === 20404
      ? 'Invalid or expired code. Request a new one.'
      : err.code === 20003
        ? 'Twilio authentication failed. Check TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN'
        : err.message;
    return res.status(500).json({ error: 'verify_check_failed', details: msg });
  }
};

function buildHeuristicHealthReply(message, language) {
  const text = String(message || '').toLowerCase();
  const isHindi = /[\u0900-\u097F]/.test(message) || (language && String(language).toLowerCase().startsWith('hi'));
  const has = (keywords) => keywords.some((keyword) => text.includes(keyword));
  const urgent = has([
    'chest pain',
    'severe bleeding',
    'unconscious',
    'stroke',
    'heart attack',
    'difficulty breathing',
    'shortness of breath',
    'fits',
    'seizure',
    'high fever with confusion'
  ]);

  if (isHindi) {
    if (urgent) {
      return 'यह आपातकाल जैसा लग रहा है। तुरंत नजदीकी अस्पताल जाएं या 112/911 पर कॉल करें।';
    }

    const tips = [];
    if (has(['fever', 'temperature', 'bukhar', 'बुखार'])) {
      tips.push('बुखार: पानी ज्यादा पिएं, आराम करें, तापमान मॉनिटर करें।');
    }
    if (has(['cough', 'cold', 'khansi', 'खांसी', 'sore throat', 'गला'])) {
      tips.push('खांसी/सर्दी: गरम पानी लें, आराम करें, सांस लेने में दिक्कत हो तो डॉक्टर से तुरंत बात करें।');
    }
    if (has(['headache', 'migraine', 'सिर दर्द'])) {
      tips.push('सिर दर्द: पानी पिएं, स्क्रीन टाइम कम करें, दर्द बहुत ज्यादा हो तो जांच कराएं।');
    }
    if (has(['stomach', 'vomit', 'nausea', 'diarrhea', 'पेट', 'उल्टी', 'दस्त'])) {
      tips.push('पेट की समस्या: ORS/तरल लें, डिहाइड्रेशन से बचें, लगातार उल्टी/दस्त में डॉक्टर से मिलें।');
    }

    if (!tips.length) {
      tips.push('लक्षणों की अवधि, तीव्रता और अन्य समस्याएं (जैसे बुखार, दर्द, सांस) बताएं ताकि बेहतर मार्गदर्शन मिल सके।');
    }

    return `मैं डॉक्टर नहीं हूं, पर सामान्य मार्गदर्शन दे सकता हूं:\n- ${tips.join('\n- ')}\n- सही निदान के लिए डॉक्टर से सलाह लें।`;
  }

  if (urgent) {
    return 'This sounds urgent. Please go to the nearest emergency room or call emergency services immediately.';
  }

  const tips = [];
  if (has(['fever', 'temperature', 'chills'])) {
    tips.push('For fever: hydrate, rest, and monitor temperature regularly.');
  }
  if (has(['cough', 'cold', 'sore throat', 'runny nose'])) {
    tips.push('For cough/cold: warm fluids, rest, and seek care if breathing worsens.');
  }
  if (has(['headache', 'migraine', 'dizziness'])) {
    tips.push('For headache: hydration, less screen strain, and medical review if severe or persistent.');
  }
  if (has(['stomach', 'vomit', 'nausea', 'diarrhea', 'abdominal'])) {
    tips.push('For stomach symptoms: oral fluids/ORS, light diet, and watch for dehydration.');
  }

  if (!tips.length) {
    tips.push('Share symptom duration, severity, age, and related signs (fever/pain/breathing) for better guidance.');
  }

  return `I am not a doctor, but here is general guidance:\n- ${tips.join('\n- ')}\n- Please consult a doctor for diagnosis and treatment.`;
}

exports.healthAssistant = async (req, res) => {
  try {
    const { message, language } = req.body || {};
    if (!message || typeof message !== 'string') return res.status(400).json({ error: 'message required' });

    if (hasAnyAiProvider()) {
      let lastErr = null;
      for (const provider of getAiProviderOrder()) {
        try {
          if (provider === 'groq' && groqClient) {
            const reply = await replyWithGroq(message, language);
            if (reply) return res.json({ reply, provider: 'groq', model: env.GROQ_CHAT_MODEL });
          }
          if (provider === 'gemini' && geminiClient) {
            const reply = await replyWithGemini(message, language);
            if (reply) return res.json({ reply, provider: 'gemini', model: env.GEMINI_MODEL });
          }
        } catch (err) {
          lastErr = err;
          console.warn(`AI assistant failed on ${provider}:`, err.message);
        }
      }
      if (lastErr) console.warn('All AI providers failed, falling back to heuristics.');
    }

    const reply = buildHeuristicHealthReply(message, language);
    return res.json({ reply });
  } catch (err) {
    console.error('Health Assistant Error:', err);
    return res.status(500).json({ error: 'assistant_failed' });
  }
};
