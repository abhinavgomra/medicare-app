const request = require('supertest');
const jwt = require('jsonwebtoken');
const { createTestApp } = require('./helpers/createTestApp');
const Appointment = require('../models/Appointment');
const Doctor = require('../models/Doctor');

function tokenFor(payload) {
    return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '2h' });
}

describe('Telemedicine integration', () => {
    const app = createTestApp();

    test('ice servers endpoint returns auth-protected fallback configuration', async () => {
        const patientToken = tokenFor({ email: 'ice.patient@example.com', role: 'user' });

        const res = await request(app)
            .get('/api/telemedicine/ice-servers')
            .set('Authorization', `Bearer ${patientToken}`)
            .expect(200);

        expect(Array.isArray(res.body.iceServers)).toBe(true);
        expect(res.body.iceServers.length).toBeGreaterThan(0);
        expect(typeof res.body.hasTurn).toBe('boolean');
    });

    test('patient and doctor can access appointment; care-point is doctor/admin only', async () => {
        const patientEmail = 'patient.tele@example.com';
        const doctorEmail = 'doctor.tele@example.com';
        const doctorId = 9001;

        await Doctor.create({
            id: doctorId,
            name: 'Dr Test',
            specialty: 'General'
        });

        const appointment = await Appointment.create({
            doctorId,
            date: '2026-03-01T10:00:00.000Z',
            appointmentDate: new Date('2026-03-01T10:00:00.000Z'),
            reason: 'follow up',
            createdBy: patientEmail,
            status: 'booked'
        });

        const patientToken = tokenFor({ email: patientEmail, role: 'user' });
        const doctorToken = tokenFor({ email: doctorEmail, role: 'doctor', doctorId });

        const listRes = await request(app)
            .get('/api/telemedicine/appointments?page=1&limit=10&status=booked')
            .set('Authorization', `Bearer ${patientToken}`)
            .expect(200);
        expect(Array.isArray(listRes.body.items)).toBe(true);
        expect(listRes.body.items).toHaveLength(1);
        expect(listRes.body.items[0].id).toBe(String(appointment._id));

        await request(app)
            .post(`/api/telemedicine/appointments/${appointment._id}/messages`)
            .set('Authorization', `Bearer ${patientToken}`)
            .send({ type: 'care-point', text: 'Take medicine after food' })
            .expect(403);

        await request(app)
            .post(`/api/telemedicine/appointments/${appointment._id}/messages`)
            .set('Authorization', `Bearer ${doctorToken}`)
            .send({ type: 'care-point', text: 'Take medicine after food' })
            .expect(201);

        const msgRes = await request(app)
            .get(`/api/telemedicine/appointments/${appointment._id}/messages?limit=10`)
            .set('Authorization', `Bearer ${patientToken}`)
            .expect(200);
        expect(Array.isArray(msgRes.body.items)).toBe(true);
        expect(msgRes.body.items).toHaveLength(1);
        expect(msgRes.body.items[0].messageType).toBe('care-point');
    });
});
