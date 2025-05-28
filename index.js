const express = require('express');
const cors = require('cors');
const connectDB = require('./config/database');
const whatsappService = require('./services/whatsappService');
const contactService = require('./services/contactService');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Connect to MongoDB
connectDB();

// Middlewares
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static('public'));

// Validation middleware for image URLs
const validateImageUrl = (req, res, next) => {
    const { image_url } = req.body;
    
    if (image_url) {
        try {
            const url = new URL(image_url);
            if (!['http:', 'https:'].includes(url.protocol)) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid image URL protocol. Only HTTP and HTTPS are allowed.'
                });
            }
        } catch (error) {
            return res.status(400).json({
                success: false,
                error: 'Invalid image URL format.'
            });
        }
    }
    
    next();
};

// API Routes for Laravel Integration

// Initialize WhatsApp session
app.post('/api/whatsapp/init', async (req, res) => {
    try {
        const { user_id, place_id } = req.body;

        if (!user_id || !place_id) {
            return res.status(400).json({ 
                success: false, 
                error: 'user_id and place_id are required' 
            });
        }

        const result = await whatsappService.initClient(user_id, place_id);

        res.json({
            success: true,
            data: result
        });

    } catch (error) {
        console.error('Error initializing WhatsApp:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// Get session status
app.get('/api/whatsapp/status', async (req, res) => {
    try {
        const { user_id, place_id } = req.query;

        if (!user_id || !place_id) {
            return res.status(400).json({ 
                success: false, 
                error: 'user_id and place_id are required' 
            });
        }

        const status = await whatsappService.getSessionStatus(
            parseInt(user_id), 
            parseInt(place_id)
        );

        res.json({
            success: true,
            data: status
        });

    } catch (error) {
        console.error('Error getting status:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// Get all groups for a user
app.get('/api/whatsapp/groups', async (req, res) => {
    try {
        const { user_id, place_id } = req.query;

        if (!user_id || !place_id) {
            return res.status(400).json({ 
                success: false, 
                error: 'user_id and place_id are required' 
            });
        }

        const groups = await contactService.getUserGroups(
            parseInt(user_id), 
            parseInt(place_id)
        );

        res.json({
            success: true,
            data: groups
        });

    } catch (error) {
        console.error('Error getting groups:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// Get contacts by group ID
app.get('/api/whatsapp/groups/:group_id/contacts', async (req, res) => {
    try {
        const { user_id, place_id } = req.query;
        const { group_id } = req.params;

        if (!user_id || !place_id) {
            return res.status(400).json({ 
                success: false, 
                error: 'user_id and place_id are required' 
            });
        }

        const groupData = await contactService.getContactsByGroupId(
            parseInt(user_id), 
            parseInt(place_id),
            group_id
        );

        res.json({
            success: true,
            data: groupData
        });

    } catch (error) {
        console.error('Error getting group contacts:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// Create custom group
app.post('/api/whatsapp/groups', async (req, res) => {
    try {
        const { user_id, place_id, name, description, contact_ids } = req.body;

        if (!user_id || !place_id || !name || !contact_ids) {
            return res.status(400).json({ 
                success: false, 
                error: 'user_id, place_id, name, and contact_ids are required' 
            });
        }

        // Get session ID
        const sessionStatus = await whatsappService.getSessionStatus(user_id, place_id);
        if (!sessionStatus.session_exists) {
            return res.status(400).json({ 
                success: false, 
                error: 'No active session found' 
            });
        }

        const group = await contactService.createCustomGroup(
            parseInt(user_id),
            parseInt(place_id),
            sessionStatus.session_id,
            { name, description, contact_ids }
        );

        res.json({
            success: true,
            data: group
        });

    } catch (error) {
        console.error('Error creating group:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// Update group contacts
app.put('/api/whatsapp/groups/:group_id/contacts', async (req, res) => {
    try {
        const { user_id, place_id, contact_ids } = req.body;
        const { group_id } = req.params;

        if (!user_id || !place_id || !contact_ids) {
            return res.status(400).json({ 
                success: false, 
                error: 'user_id, place_id, and contact_ids are required' 
            });
        }

        const result = await contactService.updateGroupContacts(
            parseInt(user_id),
            parseInt(place_id),
            group_id,
            contact_ids
        );

        res.json({
            success: true,
            data: result
        });

    } catch (error) {
        console.error('Error updating group contacts:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// Delete group
app.delete('/api/whatsapp/groups/:group_id', async (req, res) => {
    try {
        const { user_id, place_id } = req.query;
        const { group_id } = req.params;

        if (!user_id || !place_id) {
            return res.status(400).json({ 
                success: false, 
                error: 'user_id and place_id are required' 
            });
        }

        const result = await contactService.deleteGroup(
            parseInt(user_id),
            parseInt(place_id),
            group_id
        );

        res.json({
            success: true,
            data: result
        });

    } catch (error) {
        console.error('Error deleting group:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// Search contacts
app.get('/api/whatsapp/contacts/search', async (req, res) => {
    try {
        const { user_id, place_id, q, is_business, has_profile_picture, last_interaction_days, tags } = req.query;

        if (!user_id || !place_id) {
            return res.status(400).json({ 
                success: false, 
                error: 'user_id and place_id are required' 
            });
        }

        const filters = {};
        if (is_business !== undefined) filters.is_business = is_business === 'true';
        if (has_profile_picture !== undefined) filters.has_profile_picture = has_profile_picture === 'true';
        if (last_interaction_days) filters.last_interaction_days = parseInt(last_interaction_days);
        if (tags) filters.tags = tags.split(',');

        const contacts = await contactService.searchContacts(
            parseInt(user_id),
            parseInt(place_id),
            q,
            filters
        );

        res.json({
            success: true,
            data: contacts
        });

    } catch (error) {
        console.error('Error searching contacts:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// Get contact by ID
app.get('/api/whatsapp/contacts/:contact_id', async (req, res) => {
    try {
        const { user_id, place_id } = req.query;
        const { contact_id } = req.params;

        if (!user_id || !place_id) {
            return res.status(400).json({ 
                success: false, 
                error: 'user_id and place_id are required' 
            });
        }

        const contact = await contactService.getContactById(
            parseInt(user_id),
            parseInt(place_id),
            contact_id
        );

        res.json({
            success: true,
            data: contact
        });

    } catch (error) {
        console.error('Error getting contact:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// Send message to single contact (for Laravel Jobs)
app.post('/api/whatsapp/send-message', validateImageUrl, async (req, res) => {
    try {
        const { user_id, place_id, contact_id, message, image_url } = req.body;

        if (!user_id || !place_id || !contact_id) {
            return res.status(400).json({ 
                success: false, 
                error: 'user_id, place_id, and contact_id are required' 
            });
        }
 
        if (!message && !image_url) {
            return res.status(400).json({ 
                success: false, 
                error: 'Either message or image_url is required' 
            });
        }
 
        const result = await whatsappService.sendMessage(
            parseInt(user_id),
            parseInt(place_id),
            contact_id,
            message || '',
            image_url
        );
 
        res.json({
            success: true,
            data: result
        });
 
    } catch (error) {
        console.error('Error sending message:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
 });
 
 // Send message to group (for Laravel Jobs)
 app.post('/api/whatsapp/groups/:group_id/send-message', validateImageUrl, async (req, res) => {
    try {
        const { user_id, place_id, message, image_url } = req.body;
        const { group_id } = req.params;
 
        if (!user_id || !place_id) {
            return res.status(400).json({ 
                success: false, 
                error: 'user_id and place_id are required' 
            });
        }
 
        if (!message && !image_url) {
            return res.status(400).json({ 
                success: false, 
                error: 'Either message or image_url is required' 
            });
        }
 
        const result = await whatsappService.sendMessageToGroup(
            parseInt(user_id),
            parseInt(place_id),
            group_id,
            message || '',
            image_url
        );
 
        res.json({
            success: true,
            data: result
        });
 
    } catch (error) {
        console.error('Error sending message to group:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
 });
 
 // Bulk send messages (for Laravel batch jobs)
 app.post('/api/whatsapp/send-bulk-messages', validateImageUrl, async (req, res) => {
    try {
        const { user_id, place_id, recipients, message, image_url, delay_seconds = 0 } = req.body;
 
        if (!user_id || !place_id || !recipients || !Array.isArray(recipients)) {
            return res.status(400).json({ 
                success: false, 
                error: 'user_id, place_id, and recipients array are required' 
            });
        }
 
        if (!message && !image_url) {
            return res.status(400).json({ 
                success: false, 
                error: 'Either message or image_url is required' 
            });
        }
 
        // Validate recipients format
        for (const recipient of recipients) {
            if (!recipient.contact_id && !recipient.number) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'Each recipient must have either contact_id or number' 
                });
            }
        }
 
        const results = [];
        let totalSent = 0;
        let totalFailed = 0;
 
        for (let i = 0; i < recipients.length; i++) {
            const recipient = recipients[i];
            
            try {
                let result;
                if (recipient.contact_id) {
                    result = await whatsappService.sendMessage(
                        parseInt(user_id),
                        parseInt(place_id),
                        recipient.contact_id,
                        message || '',
                        image_url
                    );
                } else {
                    // If only number provided, search for contact first
                    const contacts = await contactService.searchContacts(
                        parseInt(user_id),
                        parseInt(place_id),
                        recipient.number
                    );
                    
                    if (contacts.length === 0) {
                        throw new Error(`Contact not found for number: ${recipient.number}`);
                    }
                    
                    result = await whatsappService.sendMessage(
                        parseInt(user_id),
                        parseInt(place_id),
                        contacts[0].contact_id,
                        message || '',
                        image_url
                    );
                }
 
                results.push({
                    recipient: recipient,
                    status: 'sent',
                    message_id: result.message_id
                });
                totalSent++;
 
                // Apply delay between messages if specified
                if (delay_seconds > 0 && i < recipients.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, delay_seconds * 1000));
                }
 
            } catch (error) {
                console.error(`Error sending to recipient ${i}:`, error);
                results.push({
                    recipient: recipient,
                    status: 'failed',
                    error: error.message
                });
                totalFailed++;
            }
        }
 
        res.json({
            success: true,
            data: {
                total_recipients: recipients.length,
                total_sent: totalSent,
                total_failed: totalFailed,
                results: results
            }
        });
 
    } catch (error) {
        console.error('Error sending bulk messages:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
 });
 
 // Get message logs
 app.get('/api/whatsapp/messages', async (req, res) => {
    try {
        const { user_id, place_id, page = 1, limit = 50 } = req.query;
 
        if (!user_id || !place_id) {
            return res.status(400).json({ 
                success: false, 
                error: 'user_id and place_id are required' 
            });
        }
 
        const logs = await whatsappService.getMessageLogs(
            parseInt(user_id),
            parseInt(place_id),
            parseInt(page),
            parseInt(limit)
        );
 
        res.json({
            success: true,
            data: logs
        });
 
    } catch (error) {
        console.error('Error getting message logs:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
 });
 
 // Logout session
 app.post('/api/whatsapp/logout', async (req, res) => {
    try {
        const { user_id, place_id } = req.body;
 
        if (!user_id || !place_id) {
            return res.status(400).json({ 
                success: false, 
                error: 'user_id and place_id are required' 
            });
        }
 
        const result = await whatsappService.logout(
            parseInt(user_id), 
            parseInt(place_id)
        );
 
        res.json({
            success: true,
            data: result
        });
 
    } catch (error) {
        console.error('Error during logout:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
 });
 
 // Health check endpoint
 app.get('/api/health', (req, res) => {
    res.json({ 
        success: true, 
        message: 'WhatsApp Integration Service is running',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        features: {
            image_support: 'URL-based',
            bulk_messaging: true,
            group_management: true,
            contact_search: true
        }
    });
 });
 
 // Test image URL endpoint
 app.post('/api/whatsapp/test-image-url', async (req, res) => {
    try {
        const { image_url } = req.body;
 
        if (!image_url) {
            return res.status(400).json({ 
                success: false, 
                error: 'image_url is required' 
            });
        }
 
        // Test image URL validity
        const axios = require('axios');
        
        try {
            const response = await axios({
                method: 'HEAD', // Only get headers, not the full image
                url: image_url,
                timeout: 10000,
                headers: {
                    'User-Agent': 'WhatsApp-Integration-Service/1.0'
                }
            });
 
            const contentType = response.headers['content-type'];
            const contentLength = response.headers['content-length'];
 
            if (!contentType || !contentType.startsWith('image/')) {
                return res.json({
                    success: false,
                    error: 'URL does not point to an image',
                    details: {
                        content_type: contentType,
                        status: response.status
                    }
                });
            }
 
            if (contentLength && parseInt(contentLength) > 10 * 1024 * 1024) {
                return res.json({
                    success: false,
                    error: 'Image too large (max 10MB)',
                    details: {
                        size_mb: Math.round(parseInt(contentLength) / 1024 / 1024 * 100) / 100
                    }
                });
            }
 
            res.json({
                success: true,
                message: 'Image URL is valid',
                details: {
                    content_type: contentType,
                    size_mb: contentLength ? Math.round(parseInt(contentLength) / 1024 / 1024 * 100) / 100 : 'unknown',
                    status: response.status
                }
            });
 
        } catch (testError) {
            res.json({
                success: false,
                error: 'Failed to access image URL',
                details: {
                    error_message: testError.message,
                    error_code: testError.code
                }
            });
        }
 
    } catch (error) {
        console.error('Error testing image URL:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
 });
 
 // Error handling middleware
 app.use((error, req, res, next) => {
    console.error('Unhandled error:', error);
    res.status(500).json({ 
        success: false, 
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
    });
 });
 
 // 404 handler
//  app.use('*', (req, res) => {
//     res.status(404).json({ 
//         success: false, 
//         error: 'Endpoint not found',
//         available_endpoints: {
//             'POST /api/whatsapp/init': 'Initialize WhatsApp session',
//             'GET /api/whatsapp/status': 'Get session status',
//             'GET /api/whatsapp/groups': 'Get user groups',
//             'POST /api/whatsapp/send-message': 'Send message to contact',
//             'POST /api/whatsapp/groups/:group_id/send-message': 'Send message to group',
//             'POST /api/whatsapp/send-bulk-messages': 'Send bulk messages',
//             'POST /api/whatsapp/test-image-url': 'Test image URL validity',
//             'GET /api/health': 'Health check'
//         }
//     });
//  });
 
 app.listen(PORT, () => {
    console.log(`🚀 WhatsApp Integration Service running on port ${PORT}`);
    console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
    console.log(`🖼️  Image support: URL-based downloading`);
    console.log(`📱 Ready for Laravel integration`);
 });
 
 // Graceful shutdown
 process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    process.exit(0);
 });
 
 process.on('SIGINT', () => {
    console.log('SIGINT received, shutting down gracefully');
    process.exit(0);
 });