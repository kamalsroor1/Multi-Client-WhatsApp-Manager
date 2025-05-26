const mongoose = require('mongoose');

const contactGroupSchema = new mongoose.Schema({
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
    group_id: {
        type: String,
        required: true,
        unique: true
    },
    name: {
        type: String,
        required: true
    },
    description: {
        type: String,
        default: null
    },
    contact_ids: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Contact'
    }],
    group_type: {
        type: String,
        enum: ['auto', 'manual', 'filtered'],
        default: 'manual'
    },
    filter_criteria: {
        last_interaction_days: Number,
        has_profile_picture: Boolean,
        is_business: Boolean,
        custom_filters: mongoose.Schema.Types.Mixed
    },
    created_at: {
        type: Date,
        default: Date.now
    },
    updated_at: {
        type: Date,
        default: Date.now
    },
    is_active: {
        type: Boolean,
        default: true
    }
});

// Indexes
contactGroupSchema.index({ user_id: 1, place_id: 1 });
contactGroupSchema.index({ session_id: 1 });
contactGroupSchema.index({ group_id: 1 });

module.exports = mongoose.model('ContactGroup', contactGroupSchema);