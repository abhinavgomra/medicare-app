const mongoose = require('mongoose');

const insuranceProfileSchema = new mongoose.Schema(
    {
        userEmail: { type: String, required: true, lowercase: true, trim: true, unique: true, index: true },
        hasExistingInsurance: { type: Boolean, default: false },
        currentInsurers: { type: [String], default: [] },
        currentPolicyNumber: { type: String, default: '', trim: true, maxlength: 120 },
        insurancePlanType: {
            type: String,
            enum: ['none', 'individual', 'family-floater', 'employer', 'government', 'other'],
            default: 'none'
        },
        coverageAmount: { type: Number, default: null, min: 0 },
        coverageNotes: { type: String, default: '', trim: true, maxlength: 1000 },

        age: { type: Number, default: null, min: 0, max: 130 },
        gender: { type: String, enum: ['', 'male', 'female', 'other'], default: '' },
        annualIncome: { type: Number, default: null, min: 0 },
        occupationType: { type: String, default: '', trim: true, maxlength: 80 },
        state: { type: String, default: '', trim: true, maxlength: 80 },
        city: { type: String, default: '', trim: true, maxlength: 80 },
        dependentsCount: { type: Number, default: 0, min: 0, max: 20 },

        isBpl: { type: Boolean, default: false },
        hasRationCard: { type: Boolean, default: false },
        isPregnant: { type: Boolean, default: false },
        hasDisability: { type: Boolean, default: false },
        chronicConditions: { type: String, default: '', trim: true, maxlength: 1000 }
    },
    { timestamps: true }
);

insuranceProfileSchema.set('toJSON', {
    virtuals: true,
    versionKey: false,
    transform: function (_doc, ret) {
        ret.id = String(ret._id);
        delete ret._id;
        return ret;
    }
});

module.exports = mongoose.model('InsuranceProfile', insuranceProfileSchema);
