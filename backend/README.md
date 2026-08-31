Medicare Backend (Node/Express + MongoDB)

Run locally
- cd into this folder: `cd backend`
- Install deps: `npm install`
- Create `.env` from template: `cp .env.example .env`
- Update `.env` values:
  - `PORT=5000`
  - `JWT_SECRET=please_change_me`
  - `MONGODB_URI=mongodb://127.0.0.1:27017/medicare` (or Atlas URI)
  - `USE_IN_MEMORY_DB=false` (set `true` only for fallback development mode)
  - `FORCE_HTTPS=false` (set `true` behind HTTPS proxy in production)
  - `CORS_ORIGINS=http://localhost:3000` (optional comma-separated allowlist; empty allows all in dev)
  - `GOOGLE_CLIENT_ID=...` (optional; for Google Sign-In)
  - `TWILIO_ACCOUNT_SID=...` (optional, for SMS)
  - `TWILIO_AUTH_TOKEN=...` (optional)
  - `TWILIO_FROM_NUMBER=+1xxxxxxxxxx` (optional; your Twilio phone number)
  - `TWILIO_VERIFY_SERVICE_SID=...` (optional)
  - `NOTIFY_TO_NUMBER=+1xxxxxxxxxx` (optional; your personal phone)
  - `AMBULANCE_CAN_DISPATCH=true` (set `false` to return unavailable + notify flow)
  - `AI_PROVIDER=auto` (optional; `auto`, `groq`, or `gemini`)
  - `GROQ_API_KEY=...` (recommended for free/fast AI)
  - `GROQ_CHAT_MODEL=llama-3.3-70b-versatile` (optional)
  - `GROQ_TRANSCRIBE_MODEL=whisper-large-v3-turbo` (optional)
  - `GEMINI_API_KEY=...` (optional fallback)
  - `SMTP_*` and `EMAIL_TO` (optional; for email notifications)
- Start: `npm start` (or `node server.js`)
- Run integration tests: `npm test`
  - Optional: set `TEST_MONGODB_URI` to use an existing MongoDB instance for tests instead of `mongodb-memory-server`.
- Health check: GET `http://localhost:5000/health`

API
- POST `/api/auth/register` { email, password } (passwords are hashed)
- POST `/api/auth/login` { email, password } -> { token }
- POST `/api/auth/google` { credential } -> { token }
- GET `/api/doctors` (MongoDB, supports q, specialty, accepting)
- POST `/api/doctors` (admin)
- PUT `/api/doctors/:id` (admin)
- DELETE `/api/doctors/:id` (admin)
- GET `/api/appointments` (auth)
  - Optional pagination query: `?page=1&limit=20&meta=true`
- POST `/api/appointments` { doctorId (Number), date, reason? } (auth)
- PUT `/api/appointments/:id` (auth)
- DELETE `/api/appointments/:id` (auth)
  - Doctor/admin can set `status=completed` to close booking after consultation.
 - POST `/api/prescriptions/ocr` (auth, multipart/form-data; field `file`) -> `{ text }`
 - POST `/api/voice/transcribe` (auth, multipart/form-data; field `file`, requires `GROQ_API_KEY` or `GEMINI_API_KEY`) -> `{ text }`
- GET `/api/doctor/dashboard` (doctor auth)
  - Optional pagination query: `?appointmentsPage=1&appointmentsLimit=20&txPage=1&txLimit=20`
- GET `/api/pharmacy/products` (public; supports `q`, `category`, `inStock`, `prescription`)
- GET `/api/pharmacy/admin/products` (admin; supports `q`, `category`, `active`, `inStock`, `prescription`, paginated)
- POST `/api/pharmacy/products` (admin)
- PUT `/api/pharmacy/products/:id` (admin)
- POST `/api/pharmacy/orders` (auth; body: `{ items: [{ productId, qty }], notes?, deliveryAddress? }`)
- GET `/api/pharmacy/orders` (auth; paginated)
- POST `/api/pharmacy/orders/:id/cancel` (auth; owner/admin)
- PUT `/api/pharmacy/orders/:id/status` (admin)
- POST `/api/ambulance/request` (auth)
- GET `/api/ambulance/request/:id` (auth; owner or staff)
- POST `/api/ambulance/request/:id/cancel` (auth; owner or staff)
- POST `/api/ambulance/request/:id/assign` (auth; staff only)
- POST `/api/ambulance/request/:id/en-route` (auth; staff only)
- POST `/api/ambulance/request/:id/arrived` (auth; staff only)
- POST `/api/location/update` (auth; owner or staff)
- GET `/api/location/:clientId` (auth; owner or staff)
- GET `/api/insurance/profile` (auth; get saved insurance details + policy recommendations)
- PUT `/api/insurance/profile` (auth; save insurance details and eligibility inputs)
- POST `/api/insurance/evaluate` (auth; evaluate government policy eligibility from form input)
- GET `/api/insurance/policies` (auth; list supported government policy catalog)
- WebSocket signaling on `/socket.io` (auth required, JWT in socket auth token)
- GET `/api/telemedicine/ice-servers` (auth; returns STUN/TURN config for WebRTC)
- GET `/api/telemedicine/appointments` (auth; appointment list for telemedicine room authorization)
- GET `/api/telemedicine/appointments/:appointmentId/messages` (auth; chat/care-point history)
- POST `/api/telemedicine/appointments/:appointmentId/messages` (auth; save chat/care-point message)

Notes:
- Doctors, users, ambulance requests, and location updates are stored in MongoDB.
- Insurance profile and eligibility input are stored per user in MongoDB.
- To seed doctors from `data/doctors.json`, run the seed script (see below).
- If Twilio env vars are set, successful logins and appointment bookings will send an SMS to `NOTIFY_TO_NUMBER`.

Roles
- First registered user becomes `admin` automatically.
- Admin can create/update/delete doctors.
- Admin can manage pharmacy products and update pharmacy order status.

Telemedicine (WebRTC signaling)
- Frontend page: `/telemedicine`
- Select the same booked appointment in two authorized participant accounts.
- Socket events used: `join-room`, `offer`, `answer`, `ice-candidate`, `end-call`, `leave-room`.
- `join-room` requires `appointmentId` and backend verifies caller access.
- Telemedicine events are logged in MongoDB collection `telemedicineevents`.
- Phase 4 UX additions:
  - Reconnect-aware signaling flow with timeline events.
  - Device permission diagnostics (camera/mic denied or unavailable).
  - Live call quality panel (RTT and packet loss from WebRTC stats).
  - In-call chat between doctor and patient with persisted message history.
  - Doctor-only care-point notes to share important post-call instructions.
  - Doctor/admin can complete booking after consultation.
- Phase 2 env vars:
  - `TELEMEDICINE_STUN_SERVERS` (comma-separated, defaults to Google STUN)
  - `TELEMEDICINE_TURN_SERVERS` (comma-separated)
  - `TELEMEDICINE_TURN_USERNAME`
  - `TELEMEDICINE_TURN_CREDENTIAL`
  - `TELEMEDICINE_TWILIO_ICE_ENABLED` (set `true` to fetch short-lived TURN/STUN via Twilio)
  - `TELEMEDICINE_TWILIO_ICE_TTL` (seconds, default `3600`)

Doctor fields you can customize
- `id` (Number), `name` (String), `specialty` (String), `rating` (Number), `experience` (Number), `location` (String), `languages` (String[]), `acceptingNew` (Boolean), `fees` (Number), `clinicHours` (String), `images` (String[])

Seeding doctors
- `node scripts/seedDoctors.js`

Groq AI setup (recommended)
- Create Groq API key from `https://console.groq.com/keys`
- In `.env` set:
  - `AI_PROVIDER=groq` (or `auto` for Groq first, Gemini fallback)
  - `GROQ_API_KEY=...`
  - Optional models:
    - `GROQ_CHAT_MODEL=llama-3.3-70b-versatile`
    - `GROQ_TRANSCRIBE_MODEL=whisper-large-v3-turbo`
- Restart backend.
