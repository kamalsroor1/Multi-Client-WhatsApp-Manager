const mongoose = require('mongoose');

const contactSchema = new mongoose.Schema({
    user_id: {
        type: Number,
        required: true
    },
    place_id: {
        type: Number,
        required: true
    },
    session_id: {
        type: String,
        required: true
    },
    contact_id: {
        type: String,
        required: true,
        unique: true
    },
    name: {
        type: String,
        required: true
    },
    number: {
        type: String,
        required: true
    },
    whatsapp_id: {
        type: String,
        required: true
    },
    profile_picture_url: {
        type: String,
        default: null
    },
    is_business: {
        type: Boolean,
        default: false
    },
    business_info: {
        category: String,
        description: String,
        website: String
    },
    last_interaction: {
        type: Date,
        default: null
    },
    last_seen: {
        type: Date,
        default: null
    },
    status: {
        type: String,
        enum: ['active', 'blocked', 'deleted'],
        default: 'active'
    },
    tags: [String],
    custom_fields: mongoose.Schema.Types.Mixed,
    message_count: {
        type: Number,
        default: 0
    },
    last_message_date: {
        type: Date,
        default: null
    },
    created_at: {
        type: Date,
        default: Date.now
    },
    updated_at: {
        type: Date,
        default: Date.now
    }
});

// Indexes
contactSchema.index({ user_id: 1, place_id: 1 });
contactSchema.index({ session_id: 1 });
contactSchema.index({ contact_id: 1 });
contactSchema.index({ number: 1 });
contactSchema.index({ last_interaction: -1 });

module.exports = mongoose.model('Contact', contactSchema);