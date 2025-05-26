const mongoose = require('mongoose');

const messageLogSchema = new mongoose.Schema({
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
    recipient_number: {
        type: String,
        required: true
    },
    recipient_name: {
        type: String,
        default: null
    },
    message_content: {
        type: String,
        required: true
    },
    message_type: {
        type: String,
        enum: ['text', 'image', 'media'],
        default: 'text'
    },
    image_url: {
        type: String,
        default: null
    },
    image_info: {
        size_bytes: Number,
        mime_type: String,
        download_duration_ms: Number
    },
    status: {
        type: String,
        enum: ['pending', 'sent', 'delivered', 'failed'],
        default: 'pending'
    },
    sent_at: {
        type: Date,
        default: null
    },
    delivered_at: {
        type: Date,
        default: null
    },
    error_message: {
        type: String,
        default: null
    },
    whatsapp_message_id: {
        type: String,
        default: null
    },
    created_at: {
        type: Date,
        default: Date.now
    }
});

// Index for faster queries
messageLogSchema.index({ user_id: 1, place_id: 1 });
messageLogSchema.index({ session_id: 1 });
messageLogSchema.index({ status: 1, created_at: -1 });
messageLogSchema.index({ whatsapp_message_id: 1 });

module.exports = mongoose.model('MessageLog', messageLogSchema);