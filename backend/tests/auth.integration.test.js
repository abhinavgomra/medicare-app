const request = require('supertest');
const bcrypt = require('bcryptjs');
const { createTestApp } = require('./helpers/createTestApp');
const User = require('../models/User');

describe('Auth integration', () => {
    const app = createTestApp();

    test('login works with valid credentials and /me returns profile', async () => {
        const hashedPassword = await bcrypt.hash('pass1234', 10);
        await User.create({
            email: 'patient@example.com',
            hashedPassword,
            role: 'user'
        });

        const loginRes = await request(app)
            .post('/api/auth/login')
            .send({ email: 'patient@example.com', password: 'pass1234' })
            .expect(200);

        expect(loginRes.body).toHaveProperty('token');
        expect(loginRes.body.email).toBe('patient@example.com');

        const meRes = await request(app)
            .get('/api/auth/me')
            .set('Authorization', `Bearer ${loginRes.body.token}`)
            .expect(200);

        expect(meRes.body.email).toBe('patient@example.com');
        expect(meRes.body.role).toBe('user');
    });

    test('login fails with wrong password', async () => {
        const hashedPassword = await bcrypt.hash('pass1234', 10);
        await User.create({
            email: 'patient2@example.com',
            hashedPassword,
            role: 'user'
        });

        await request(app)
            .post('/api/auth/login')
            .send({ email: 'patient2@example.com', password: 'wrong-pass' })
            .expect(401);
    });

    test('google login requires credential payload', async () => {
        const res = await request(app)
            .post('/api/auth/google')
            .send({})
            .expect(400);

        expect(res.body.error).toBe('google credential required');
    });
});

