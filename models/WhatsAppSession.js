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
    session_name: {
        type: String,
        required: true,
        default: function() {
            return `WhatsApp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        }
    },
    session_id: {
        type: String,
        required: true
    },
    status: {
        type: String,
        enum: ['initializing', 'qr_ready', 'authenticated', 'loading_screen', 'ready', 'fetching_contacts', 'connected', 'disconnected', 'error'],
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
    // Contact fetching progress tracking
    contacts_fetch_progress: {
        type: Number,
        default: 0,
        min: 0,
        max: 100
    },
    contacts_fetch_completed: {
        type: Boolean,
        default: false
    },
    contacts_fetch_error: {
        type: String,
        default: null
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
// Compound unique index to allow multiple sessions per user but unique session names per user
whatsappSessionSchema.index({ user_id: 1, session_name: 1 }, { unique: true });

// Middleware to update the updated_at field
whatsappSessionSchema.pre('save', function(next) {
    this.updated_at = Date.now();
    next();
});

module.exports = mongoose.model('WhatsAppSession', whatsappSessionSchema);