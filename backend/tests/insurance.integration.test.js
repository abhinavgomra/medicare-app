const request = require('supertest');
const jwt = require('jsonwebtoken');
const { createTestApp } = require('./helpers/createTestApp');
const User = require('../models/User');

function tokenFor(payload) {
    return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '2h' });
}

describe('Insurance integration', () => {
    const app = createTestApp();

    test('profile endpoints save insurance data and return policy recommendations', async () => {
        const email = 'insurance.user@example.com';
        await User.create({ email, hashedPassword: 'x', role: 'user' });
        const token = tokenFor({ email, role: 'user' });

        const initial = await request(app)
            .get('/api/insurance/profile')
            .set('Authorization', `Bearer ${token}`)
            .expect(200);
        expect(initial.body).toHaveProperty('profile');
        expect(initial.body).toHaveProperty('recommendations');
        expect(initial.body.profile.userEmail).toBe(email);

        const saveRes = await request(app)
            .put('/api/insurance/profile')
            .set('Authorization', `Bearer ${token}`)
            .send({
                hasExistingInsurance: true,
                currentInsurers: ['Star Health', 'ESIC'],
                currentPolicyNumber: 'POL-001',
                insurancePlanType: 'individual',
                coverageAmount: 500000,
                age: 30,
                gender: 'female',
                annualIncome: 180000,
                occupationType: 'private_salaried',
                isBpl: false,
                hasRationCard: true,
                isPregnant: true,
                hasDisability: false,
                chronicConditions: ''
            })
            .expect(200);

        expect(saveRes.body.profile.hasExistingInsurance).toBe(true);
        expect(Array.isArray(saveRes.body.profile.currentInsurers)).toBe(true);
        expect(saveRes.body.profile.currentInsurers).toContain('Star Health');

        const eligibleCodes = (saveRes.body.recommendations.eligiblePolicies || []).map((p) => p.code);
        expect(eligibleCodes).toContain('PMJAY');
        expect(eligibleCodes).toContain('ESIC');
        expect(eligibleCodes).toContain('PMMVY');
        expect((saveRes.body.recommendations.eligiblePolicies || []).every((p) => typeof p.applyUrl === 'string' && p.applyUrl.startsWith('http'))).toBe(true);

        const evalRes = await request(app)
            .post('/api/insurance/evaluate')
            .set('Authorization', `Bearer ${token}`)
            .send({
                age: 65,
                gender: 'male',
                annualIncome: 700000,
                occupationType: 'state_pensioner',
                hasDisability: true,
                chronicConditions: 'Kidney disease'
            })
            .expect(200);

        const evalCodes = (evalRes.body.eligiblePolicies || []).map((p) => p.code);
        expect(evalCodes).toContain('NPHCE');
        expect(evalCodes).not.toContain('ADIP');
    });

    test('policy list endpoint returns supported government policies', async () => {
        const email = 'insurance.list@example.com';
        await User.create({ email, hashedPassword: 'x', role: 'user' });
        const token = tokenFor({ email, role: 'user' });

        const res = await request(app)
            .get('/api/insurance/policies')
            .set('Authorization', `Bearer ${token}`)
            .expect(200);

        expect(Array.isArray(res.body.policies)).toBe(true);
        expect(res.body.policies.length).toBeGreaterThan(3);
        expect(res.body.policies.some((p) => p.code === 'PMJAY')).toBe(true);
        expect(res.body.policies.every((p) => typeof p.applyUrl === 'string' && p.applyUrl.startsWith('http'))).toBe(true);
    });
});
