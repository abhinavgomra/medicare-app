const env = require('../config/env');
const AmbulanceRequest = require('../models/AmbulanceRequest');
const ClientLocation = require('../models/ClientLocation');
const emailService = require('../services/emailService');
const { sendSms } = require('../services/smsService');

function isFiniteNumber(value) {
    return typeof value === 'number' && Number.isFinite(value);
}

function normalizeObjectId(value) {
    const id = String(value || '').trim();
    return /^[a-fA-F0-9]{24}$/.test(id) ? id : '';
}

function normalizeClientId(req, rawClientId) {
    const clientId = String(rawClientId || '').trim();
    if (clientId) return clientId.slice(0, 128);
    return String(req.user?.email || '').trim().toLowerCase();
}

function isStaff(user) {
    return Boolean(user && ['admin', 'doctor'].includes(user.role));
}

function canAccessRequest(user, requestDoc) {
    if (!user || !requestDoc) return false;
    if (isStaff(user)) return true;
    return String(user.email || '').toLowerCase() === String(requestDoc.requesterEmail || '').toLowerCase();
}

function buildUpdate(status, user, note = '') {
    return {
        at: new Date(),
        status,
        actorEmail: String(user?.email || '').toLowerCase(),
        actorRole: String(user?.role || '').toLowerCase(),
        note: String(note || '').trim().slice(0, 500)
    };
}

async function sendUnavailableNotifications({ requesterEmail, location, userPhone }) {
    let emailSent = false;
    let smsSent = false;

    try {
        await emailService.sendAmbulanceLocationEmail({
            location,
            userEmail: requesterEmail,
            status: 'unavailable'
        });
        emailSent = true;
    } catch (_) { }

    const phone = String(userPhone || env.NOTIFY_TO_NUMBER || '').trim();
    if (phone) {
        const smsResult = await sendSms(phone, "We can't send an ambulance right now. Please stay safe and try again later.");
        smsSent = Boolean(smsResult && smsResult.sent);
    }

    return { smsSent, emailSent };
}

exports.requestAmbulance = async (req, res) => {
    try {
        const { location } = req.body || {};
        if (!location || !isFiniteNumber(location.lat) || !isFiniteNumber(location.lng)) {
            return res.status(400).json({ error: 'location with numeric lat and lng required' });
        }

        const requesterEmail = String(req.user?.email || '').toLowerCase();
        const requesterRole = String(req.user?.role || 'user');
        const canSendAmbulance = Boolean(env.AMBULANCE_CAN_DISPATCH);

        if (!canSendAmbulance) {
            const notifications = await sendUnavailableNotifications({
                requesterEmail,
                location,
                userPhone: req.headers['x-user-phone']
            });

            const created = await AmbulanceRequest.create({
                requesterEmail,
                requesterRole,
                location: { lat: location.lat, lng: location.lng },
                status: 'unavailable',
                notifications: { sms: notifications.smsSent, email: notifications.emailSent },
                updates: [buildUpdate('unavailable', req.user, 'No available ambulance at the moment')]
            });

            return res.status(503).json({
                error: "We can't send it right now.",
                requestId: String(created._id),
                notifications: { sms: notifications.smsSent, email: notifications.emailSent }
            });
        }

        const created = await AmbulanceRequest.create({
            requesterEmail,
            requesterRole,
            location: { lat: location.lat, lng: location.lng },
            status: 'requested',
            updates: [buildUpdate('requested', req.user)]
        });

        return res.status(201).json({ requestId: String(created._id), status: created.status });
    } catch (err) {
        console.error('Ambulance request error:', err);
        return res.status(500).json({ error: 'internal server error' });
    }
};

exports.getRequest = async (req, res) => {
    const id = normalizeObjectId(req.params.id);
    if (!id) return res.status(400).json({ error: 'invalid request id' });

    const requestDoc = await AmbulanceRequest.findById(id).lean();
    if (!requestDoc) return res.status(404).json({ error: 'not found' });
    if (!canAccessRequest(req.user, requestDoc)) return res.status(403).json({ error: 'forbidden' });
    return res.json(requestDoc);
};

exports.cancelRequest = async (req, res) => {
    const id = normalizeObjectId(req.params.id);
    if (!id) return res.status(400).json({ error: 'invalid request id' });

    const requestDoc = await AmbulanceRequest.findById(id);
    if (!requestDoc) return res.status(404).json({ error: 'not found' });
    if (!canAccessRequest(req.user, requestDoc)) return res.status(403).json({ error: 'forbidden' });
    if (requestDoc.status === 'arrived') return res.status(400).json({ error: 'cannot cancel after arrival' });

    requestDoc.status = 'cancelled';
    requestDoc.updates.push(buildUpdate('cancelled', req.user));
    await requestDoc.save();
    return res.json({ id: String(requestDoc._id), status: requestDoc.status });
};

exports.assignRequest = async (req, res) => {
    const id = normalizeObjectId(req.params.id);
    if (!id) return res.status(400).json({ error: 'invalid request id' });
    if (!isStaff(req.user)) return res.status(403).json({ error: 'staff access required' });

    const { ambulanceId } = req.body || {};
    const requestDoc = await AmbulanceRequest.findById(id);
    if (!requestDoc) return res.status(404).json({ error: 'not found' });

    requestDoc.status = 'assigned';
    requestDoc.ambulanceId = String(ambulanceId || `AMB-${String(requestDoc._id).slice(-6)}`).trim().slice(0, 64);
    requestDoc.updates.push(buildUpdate('assigned', req.user));
    await requestDoc.save();

    return res.json({ id: String(requestDoc._id), status: requestDoc.status, ambulanceId: requestDoc.ambulanceId });
};

exports.enRoute = async (req, res) => {
    const id = normalizeObjectId(req.params.id);
    if (!id) return res.status(400).json({ error: 'invalid request id' });
    if (!isStaff(req.user)) return res.status(403).json({ error: 'staff access required' });

    const requestDoc = await AmbulanceRequest.findById(id);
    if (!requestDoc) return res.status(404).json({ error: 'not found' });
    requestDoc.status = 'en_route';
    requestDoc.updates.push(buildUpdate('en_route', req.user));
    await requestDoc.save();

    return res.json({ id: String(requestDoc._id), status: requestDoc.status });
};

exports.arrived = async (req, res) => {
    const id = normalizeObjectId(req.params.id);
    if (!id) return res.status(400).json({ error: 'invalid request id' });
    if (!isStaff(req.user)) return res.status(403).json({ error: 'staff access required' });

    const requestDoc = await AmbulanceRequest.findById(id);
    if (!requestDoc) return res.status(404).json({ error: 'not found' });
    requestDoc.status = 'arrived';
    requestDoc.updates.push(buildUpdate('arrived', req.user));
    await requestDoc.save();

    return res.json({ id: String(requestDoc._id), status: requestDoc.status });
};

exports.updateLocation = async (req, res) => {
    const { clientId: rawClientId, lat, lng } = req.body || {};
    if (!isFiniteNumber(lat) || !isFiniteNumber(lng)) {
        return res.status(400).json({ error: 'lat and lng required' });
    }

    const clientId = normalizeClientId(req, rawClientId);
    if (!clientId) return res.status(400).json({ error: 'clientId required' });

    if (!isStaff(req.user) && clientId !== String(req.user?.email || '').toLowerCase()) {
        return res.status(403).json({ error: 'forbidden' });
    }

    const doc = await ClientLocation.findOneAndUpdate(
        { clientId },
        { clientId, lat, lng, updatedAt: new Date() },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();

    return res.json({ clientId: doc.clientId, lat: doc.lat, lng: doc.lng, updatedAt: doc.updatedAt });
};

exports.getLocation = async (req, res) => {
    const clientId = normalizeClientId(req, req.params.clientId);
    if (!clientId) return res.status(400).json({ error: 'clientId required' });

    if (!isStaff(req.user) && clientId !== String(req.user?.email || '').toLowerCase()) {
        return res.status(403).json({ error: 'forbidden' });
    }

    const doc = await ClientLocation.findOne({ clientId }).lean();
    if (!doc) return res.status(404).json({ error: 'not found' });
    return res.json({ clientId: doc.clientId, lat: doc.lat, lng: doc.lng, updatedAt: doc.updatedAt });
};
