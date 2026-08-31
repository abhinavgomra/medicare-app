const request = require('supertest');
const jwt = require('jsonwebtoken');
const { createTestApp } = require('./helpers/createTestApp');
const User = require('../models/User');

function tokenFor(payload) {
    return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '2h' });
}

describe('Ambulance integration', () => {
    const app = createTestApp();

    test('ambulance request is stored in MongoDB and protected by role/access rules', async () => {
        const patientEmail = 'ambulance.patient@example.com';
        const otherEmail = 'ambulance.other@example.com';
        const adminEmail = 'ambulance.admin@example.com';

        await User.create({ email: patientEmail, hashedPassword: 'x', role: 'user' });
        await User.create({ email: otherEmail, hashedPassword: 'x', role: 'user' });
        await User.create({ email: adminEmail, hashedPassword: 'x', role: 'admin' });

        const patientToken = tokenFor({ email: patientEmail, role: 'user' });
        const otherToken = tokenFor({ email: otherEmail, role: 'user' });
        const adminToken = tokenFor({ email: adminEmail, role: 'admin' });

        const createRes = await request(app)
            .post('/api/ambulance/request')
            .set('Authorization', `Bearer ${patientToken}`)
            .send({ location: { lat: 28.6139, lng: 77.2090 } })
            .expect(201);

        expect(createRes.body).toHaveProperty('requestId');
        expect(createRes.body.status).toBe('requested');
        const requestId = createRes.body.requestId;

        await request(app)
            .get(`/api/ambulance/request/${requestId}`)
            .set('Authorization', `Bearer ${patientToken}`)
            .expect(200);

        await request(app)
            .get(`/api/ambulance/request/${requestId}`)
            .set('Authorization', `Bearer ${otherToken}`)
            .expect(403);

        await request(app)
            .post(`/api/ambulance/request/${requestId}/assign`)
            .set('Authorization', `Bearer ${patientToken}`)
            .send({ ambulanceId: 'AMB-XYZ' })
            .expect(403);

        const assignRes = await request(app)
            .post(`/api/ambulance/request/${requestId}/assign`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ ambulanceId: 'AMB-XYZ' })
            .expect(200);
        expect(assignRes.body.status).toBe('assigned');
    });

    test('location endpoints require ownership or staff role', async () => {
        const patientEmail = 'location.patient@example.com';
        const otherEmail = 'location.other@example.com';

        const patientToken = tokenFor({ email: patientEmail, role: 'user' });
        const otherToken = tokenFor({ email: otherEmail, role: 'user' });

        await request(app)
            .post('/api/location/update')
            .set('Authorization', `Bearer ${patientToken}`)
            .send({ lat: 12.91, lng: 77.61 })
            .expect(200);

        await request(app)
            .get(`/api/location/${encodeURIComponent(patientEmail)}`)
            .set('Authorization', `Bearer ${patientToken}`)
            .expect(200);

        await request(app)
            .get(`/api/location/${encodeURIComponent(patientEmail)}`)
            .set('Authorization', `Bearer ${otherToken}`)
            .expect(403);
    });
});

