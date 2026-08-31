const mongoose = require('mongoose');

const clientLocationSchema = new mongoose.Schema(
    {
        clientId: { type: String, required: true, trim: true, index: true, unique: true },
        lat: { type: Number, required: true },
        lng: { type: Number, required: true },
        updatedAt: { type: Date, default: Date.now, index: true }
    },
    { timestamps: true }
);

clientLocationSchema.set('toJSON', {
    virtuals: true,
    versionKey: false,
    transform: function (_doc, ret) {
        ret.id = String(ret._id);
        delete ret._id;
        return ret;
    }
});

module.exports = mongoose.model('ClientLocation', clientLocationSchema);

