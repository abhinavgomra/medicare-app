const mongoose = require('mongoose');

const ambulanceUpdateSchema = new mongoose.Schema(
    {
        at: { type: Date, default: Date.now },
        status: { type: String, required: true, trim: true },
        actorEmail: { type: String, default: '', lowercase: true, trim: true },
        actorRole: { type: String, default: '', trim: true },
        note: { type: String, default: '', trim: true, maxlength: 500 }
    },
    { _id: false }
);

const ambulanceRequestSchema = new mongoose.Schema(
    {
        requesterEmail: { type: String, required: true, lowercase: true, trim: true, index: true },
        requesterRole: { type: String, enum: ['user', 'doctor', 'admin'], default: 'user' },
        location: {
            lat: { type: Number, required: true },
            lng: { type: Number, required: true }
        },
        status: {
            type: String,
            enum: ['requested', 'assigned', 'en_route', 'arrived', 'cancelled', 'unavailable'],
            default: 'requested',
            index: true
        },
        ambulanceId: { type: String, default: '', trim: true },
        notifications: {
            sms: { type: Boolean, default: false },
            email: { type: Boolean, default: false }
        },
        updates: { type: [ambulanceUpdateSchema], default: [] }
    },
    { timestamps: true }
);

ambulanceRequestSchema.set('toJSON', {
    virtuals: true,
    versionKey: false,
    transform: function (_doc, ret) {
        ret.id = String(ret._id);
        delete ret._id;
        return ret;
    }
});

module.exports = mongoose.model('AmbulanceRequest', ambulanceRequestSchema);

