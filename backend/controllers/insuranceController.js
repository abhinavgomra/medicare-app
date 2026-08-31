const InsuranceProfile = require('../models/InsuranceProfile');
const User = require('../models/User');

const OCCUPATIONS = new Set([
    'private_salaried',
    'factory_worker',
    'contract_worker',
    'government_employee',
    'central_pensioner',
    'state_pensioner',
    'self_employed',
    'student',
    'homemaker',
    'unemployed',
    'other'
]);

const PLAN_TYPES = new Set(['none', 'individual', 'family-floater', 'employer', 'government', 'other']);
const GENDERS = new Set(['', 'male', 'female', 'other']);

function toSafeString(value, max = 200) {
    return String(value || '').trim().slice(0, max);
}

function toSafeList(value, maxItems = 10, maxItemLength = 80) {
    const source = Array.isArray(value) ? value : String(value || '').split(/[,\n]/g);
    return source
        .map((entry) => toSafeString(entry, maxItemLength))
        .filter(Boolean)
        .slice(0, maxItems);
}

function toBoolean(value) {
    if (typeof value === 'boolean') return value;
    const normalized = String(value || '').trim().toLowerCase();
    return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on';
}

function toNullableNumber(value, { min = 0, max = Number.MAX_SAFE_INTEGER, integer = false } = {}) {
    if (value === '' || value === null || typeof value === 'undefined') return null;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return null;
    const normalized = integer ? Math.floor(parsed) : parsed;
    if (normalized < min || normalized > max) return null;
    return normalized;
}

function normalizeOccupation(value) {
    const normalized = toSafeString(value, 80).toLowerCase();
    return OCCUPATIONS.has(normalized) ? normalized : 'other';
}

function normalizePlanType(value) {
    const normalized = toSafeString(value, 40).toLowerCase();
    return PLAN_TYPES.has(normalized) ? normalized : 'none';
}

function normalizeGender(value) {
    const normalized = toSafeString(value, 10).toLowerCase();
    return GENDERS.has(normalized) ? normalized : '';
}

function normalizePayload(payload = {}) {
    return {
        hasExistingInsurance: toBoolean(payload.hasExistingInsurance),
        currentInsurers: toSafeList(payload.currentInsurers, 8, 80),
        currentPolicyNumber: toSafeString(payload.currentPolicyNumber, 120),
        insurancePlanType: normalizePlanType(payload.insurancePlanType),
        coverageAmount: toNullableNumber(payload.coverageAmount, { min: 0, max: 1000000000 }),
        coverageNotes: toSafeString(payload.coverageNotes, 1000),

        age: toNullableNumber(payload.age, { min: 0, max: 130, integer: true }),
        gender: normalizeGender(payload.gender),
        annualIncome: toNullableNumber(payload.annualIncome, { min: 0, max: 1000000000 }),
        occupationType: normalizeOccupation(payload.occupationType),
        state: toSafeString(payload.state, 80),
        city: toSafeString(payload.city, 80),
        dependentsCount: toNullableNumber(payload.dependentsCount, { min: 0, max: 20, integer: true }) || 0,

        isBpl: toBoolean(payload.isBpl),
        hasRationCard: toBoolean(payload.hasRationCard),
        isPregnant: toBoolean(payload.isPregnant),
        hasDisability: toBoolean(payload.hasDisability),
        chronicConditions: toSafeString(payload.chronicConditions, 1000)
    };
}

function evaluatePolicies(inputRaw = {}) {
    const input = normalizePayload(inputRaw);
    const annualIncome = input.annualIncome;
    const monthlyIncome = Number.isFinite(annualIncome) ? annualIncome / 12 : null;
    const hasChronicCondition = Boolean(toSafeString(input.chronicConditions, 1000));
    const eligiblePolicies = [];
    const guidance = [];

    const policyCatalog = [
        {
            code: 'PMJAY',
            name: 'Ayushman Bharat PM-JAY',
            coverage: 'Up to Rs 5,00,000 per family per year for hospitalization.',
            applyUrl: 'https://beneficiary.nha.gov.in',
            check: () => input.isBpl || input.hasRationCard || (annualIncome !== null && annualIncome <= 250000),
            why: () => {
                if (input.isBpl) return 'Marked as BPL family.';
                if (input.hasRationCard) return 'Ration card status indicates income-based eligibility.';
                return 'Annual income is within common PM-JAY threshold.';
            },
            notEligibleHint: 'Keep BPL/ration card and family records updated to verify PM-JAY eligibility.'
        },
        {
            code: 'ESIC',
            name: 'Employees State Insurance (ESIC)',
            coverage: 'Medical care plus cash benefits for insured workers and dependents.',
            applyUrl: 'https://portal.esic.gov.in/EmployeePortal/login.aspx',
            check: () => ['private_salaried', 'factory_worker', 'contract_worker'].includes(input.occupationType) && monthlyIncome !== null && monthlyIncome <= 21000,
            why: () => 'Occupation and income fit ESIC employee contribution criteria.',
            notEligibleHint: 'ESIC usually needs salaried/factory employment and monthly wages within ESIC limits.'
        },
        {
            code: 'CGHS',
            name: 'Central Government Health Scheme (CGHS)',
            coverage: 'Government-covered OPD/IPD services at CGHS wellness centers and empanelled hospitals.',
            applyUrl: 'https://cghs.mohfw.gov.in',
            check: () => ['government_employee', 'central_pensioner'].includes(input.occupationType),
            why: () => 'Occupation matches central government employee/pensioner category.',
            notEligibleHint: 'CGHS generally applies to central government employees and eligible pensioners.'
        },
        {
            code: 'PMMVY',
            name: 'Pradhan Mantri Matru Vandana Yojana (PMMVY)',
            coverage: 'Cash maternity benefit support for eligible pregnant women.',
            applyUrl: 'https://pmmvy.wcd.gov.in',
            check: () => input.gender === 'female' && input.isPregnant && input.age !== null && input.age >= 19 && input.age <= 45,
            why: () => 'Pregnancy and age conditions are aligned with maternity support eligibility.',
            notEligibleHint: 'PMMVY typically requires female beneficiary, active pregnancy, and age criteria.'
        },
        {
            code: 'NPHCE',
            name: 'National Programme for Health Care of the Elderly (NPHCE)',
            coverage: 'Geriatric care services through district hospitals and health centers.',
            applyUrl: 'https://dghs.mohfw.gov.in/national-programme-for-the-health-care-of-the-elderly.php',
            check: () => input.age !== null && input.age >= 60,
            why: () => 'Age is in senior-citizen bracket for public geriatric services.',
            notEligibleHint: 'Senior care programs generally begin from age 60 and above.'
        },
        {
            code: 'ADIP',
            name: 'Assistance to Disabled Persons (ADIP) Scheme',
            coverage: 'Support for assistive devices and rehabilitation services.',
            applyUrl: 'https://adip.depwd.gov.in/',
            check: () => input.hasDisability && (annualIncome === null || annualIncome <= 600000),
            why: () => 'Disability status with income profile fits common ADIP support bands.',
            notEligibleHint: 'ADIP needs certified disability and income proof.'
        },
        {
            code: 'RAN',
            name: 'Rashtriya Arogya Nidhi (Major Illness Support)',
            coverage: 'Financial aid for major life-threatening diseases at selected hospitals.',
            applyUrl: 'https://www.mohfw.gov.in/en/major-programmes/poor-patients-financial-support/poor-patients-financial-assistance/rashtriya-arogya-nidhi',
            check: () => hasChronicCondition && (input.isBpl || (annualIncome !== null && annualIncome <= 500000)),
            why: () => 'Chronic illness input with low-income/BPL indicator can qualify for support.',
            notEligibleHint: 'Major illness assistance usually requires disease documentation plus income eligibility.'
        }
    ];

    for (const policy of policyCatalog) {
        if (policy.check()) {
            eligiblePolicies.push({
                code: policy.code,
                name: policy.name,
                coverage: policy.coverage,
                applyUrl: policy.applyUrl,
                reason: policy.why(),
                action: 'Verify latest rules with official government portal or nearby health office.'
            });
        } else {
            guidance.push(policy.notEligibleHint);
        }
    }

    const distinctGuidance = [...new Set(guidance)].slice(0, 5);

    return {
        generatedAt: new Date().toISOString(),
        disclaimer: 'This is a guidance tool. Final eligibility depends on official verification and latest government rules.',
        eligiblePolicies,
        summary: {
            eligibleCount: eligiblePolicies.length,
            hasExistingInsurance: input.hasExistingInsurance,
            knownInsurers: input.currentInsurers.length
        },
        guidance: distinctGuidance
    };
}

function profileResponse(doc, fallbackEmail = '') {
    if (doc) return doc.toJSON ? doc.toJSON() : doc;
    return {
        userEmail: String(fallbackEmail || '').toLowerCase(),
        hasExistingInsurance: false,
        currentInsurers: [],
        currentPolicyNumber: '',
        insurancePlanType: 'none',
        coverageAmount: null,
        coverageNotes: '',
        age: null,
        gender: '',
        annualIncome: null,
        occupationType: 'other',
        state: '',
        city: '',
        dependentsCount: 0,
        isBpl: false,
        hasRationCard: false,
        isPregnant: false,
        hasDisability: false,
        chronicConditions: ''
    };
}

exports.getInsuranceProfile = async (req, res) => {
    try {
        const userEmail = String(req.user?.email || '').toLowerCase();
        const [profile, user] = await Promise.all([
            InsuranceProfile.findOne({ userEmail }),
            User.findOne({ email: userEmail }).lean()
        ]);

        const baseProfile = profileResponse(profile, userEmail);
        if (baseProfile.age === null && typeof user?.age === 'number') baseProfile.age = user.age;
        if (!baseProfile.gender && user?.gender) baseProfile.gender = normalizeGender(user.gender);

        return res.json({
            profile: baseProfile,
            recommendations: evaluatePolicies(baseProfile)
        });
    } catch (_err) {
        return res.status(500).json({ error: 'failed_to_fetch_insurance_profile' });
    }
};

exports.upsertInsuranceProfile = async (req, res) => {
    try {
        const userEmail = String(req.user?.email || '').toLowerCase();
        const payload = normalizePayload(req.body || {});

        const saved = await InsuranceProfile.findOneAndUpdate(
            { userEmail },
            { userEmail, ...payload },
            { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
        );

        const profile = profileResponse(saved, userEmail);
        return res.json({
            profile,
            recommendations: evaluatePolicies(profile)
        });
    } catch (_err) {
        return res.status(400).json({ error: 'invalid_insurance_payload' });
    }
};

exports.evaluateInsuranceEligibility = async (req, res) => {
    try {
        const input = normalizePayload(req.body || {});
        return res.json(evaluatePolicies(input));
    } catch (_err) {
        return res.status(400).json({ error: 'invalid_insurance_evaluation_payload' });
    }
};

exports.listGovernmentPolicies = async (_req, res) => {
    return res.json({
        policies: [
            { code: 'PMJAY', name: 'Ayushman Bharat PM-JAY', applyUrl: 'https://beneficiary.nha.gov.in' },
            { code: 'ESIC', name: 'Employees State Insurance (ESIC)', applyUrl: 'https://portal.esic.gov.in/EmployeePortal/login.aspx' },
            { code: 'CGHS', name: 'Central Government Health Scheme (CGHS)', applyUrl: 'https://cghs.mohfw.gov.in' },
            { code: 'PMMVY', name: 'Pradhan Mantri Matru Vandana Yojana (PMMVY)', applyUrl: 'https://pmmvy.wcd.gov.in' },
            { code: 'NPHCE', name: 'National Programme for Health Care of the Elderly (NPHCE)', applyUrl: 'https://dghs.mohfw.gov.in/national-programme-for-the-health-care-of-the-elderly.php' },
            { code: 'ADIP', name: 'Assistance to Disabled Persons (ADIP) Scheme', applyUrl: 'https://adip.depwd.gov.in/' },
            { code: 'RAN', name: 'Rashtriya Arogya Nidhi', applyUrl: 'https://www.mohfw.gov.in/en/major-programmes/poor-patients-financial-support/poor-patients-financial-assistance/rashtriya-arogya-nidhi' }
        ]
    });
};
