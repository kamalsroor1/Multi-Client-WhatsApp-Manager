const mongoose = require('mongoose');

const whatsappSessionSchema = new mongoose.Schema({
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
        required: true,
        unique: true
    },
    status: {
        type: String,
        enum: ['initializing', 'qr_ready', 'authenticated','loading_screen', 'connected', 'disconnected', 'error'],
        default: 'initializing'
    },
    qr_code: {
        type: String,
        default: null
    },
    phone_number: {
        type: String,
        default: null
    },
    name: {
        type: String,
        default: null
    },
    total_contacts: {
        type: Number,
        default: 0
    },
    total_groups: {
        type: Number,
        default: 0
    },
    created_at: {
        type: Date,
        default: Date.now
    },
    updated_at: {
        type: Date,
        default: Date.now
    },
    connected_at: {
        type: Date,
        default: null
    },
    last_activity: {
        type: Date,
        default: Date.now
    },
    last_contacts_sync: {
        type: Date,
        default: null
    }
});

// Index for faster queries
whatsappSessionSchema.index({ user_id: 1, place_id: 1 });
whatsappSessionSchema.index({ session_id: 1 });

module.exports = mongoose.model('WhatsAppSession', whatsappSessionSchema);