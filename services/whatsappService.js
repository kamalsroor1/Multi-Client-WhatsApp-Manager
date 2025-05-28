const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const WhatsAppSession = require('../models/WhatsAppSession');
const MessageLog = require('../models/MessageLog');
const contactService = require('./contactService');

const clients = {}; // session_id => { client, sessionData }

// Generate unique session ID
function generateSessionId(userId, placeId) {
    return `session_${userId}_${placeId}_${Date.now()}`;
}

// Download image from URL
async function downloadImageFromUrl(imageUrl) {
    try {
        const response = await axios({
            method: 'GET',
            url: imageUrl,
            responseType: 'arraybuffer',
            timeout: 30000, // 30 seconds timeout
            headers: {
                'User-Agent': 'WhatsApp-Integration-Service/1.0'
            }
        });

        // Validate response
        if (response.status !== 200) {
            throw new Error(`Failed to download image: HTTP ${response.status}`);
        }

        // Check if it's actually an image
        const contentType = response.headers['content-type'];
        if (!contentType || !contentType.startsWith('image/')) {
            throw new Error(`Invalid content type: ${contentType}. Expected image.`);
        }

        // Check file size (max 10MB)
        const contentLength = response.headers['content-length'];
        if (contentLength && parseInt(contentLength) > 10 * 1024 * 1024) {
            throw new Error('Image too large (max 10MB)');
        }

        return {
            buffer: Buffer.from(response.data),
            mimeType: contentType,
            size: response.data.byteLength
        };

    } catch (error) {
        if (error.code === 'ENOTFOUND') {
            throw new Error('Image URL not found or invalid');
        } else if (error.code === 'ETIMEDOUT') {
            throw new Error('Timeout downloading image');
        } else if (error.response) {
            throw new Error(`Failed to download image: ${error.response.status} ${error.response.statusText}`);
        } else {
            throw new Error(`Failed to download image: ${error.message}`);
        }
    }
}

// Validate image URL
function isValidImageUrl(url) {
    try {
        const parsedUrl = new URL(url);
        return ['http:', 'https:'].includes(parsedUrl.protocol);
    } catch {
        return false;
    }
}

async function initClient(userId, placeId) {
    try {
        // Check if session already exists
        let sessionData = await WhatsAppSession.findOne({ 
            user_id: userId, 
            place_id: placeId,
            status: { $in: ['authenticated', 'connected'] }
        });

        if (sessionData && clients[sessionData.session_id]?.client) {
            return { success: true, session_id: sessionData.session_id, status: sessionData.status };
        }

        // Create new session
        const sessionId = generateSessionId(userId, placeId);
        
        sessionData = new WhatsAppSession({
            user_id: userId,
            place_id: placeId,
            session_id: sessionId,
            status: 'initializing'
        });
        
        await sessionData.save();

        const authPath = path.join(__dirname, '../.wwebjs_auth', `session-${sessionId}`);

        const client = new Client({
            authStrategy: new LocalAuth({ clientId: sessionId }),
            puppeteer: { 
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox'] 
            }
        });

        clients[sessionId] = { client, sessionData };

        // Event handlers (unchanged from previous version)
        client.on('qr', async (qr) => {
            try {
                const qrDataURL = await qrcode.toDataURL(qr);
                sessionData.qr_code = qrDataURL;
                sessionData.status = 'qr_ready';
                sessionData.updated_at = new Date();
                await sessionData.save();
                
                console.log(`🔄 QR generated for session ${sessionId}`);
            } catch (error) {
                console.error(`Error generating QR for ${sessionId}:`, error);
            }
        });

        client.on('authenticated', async () => {
            try {
                sessionData.status = 'authenticated';
                sessionData.qr_code = null;
                sessionData.updated_at = new Date();
                await sessionData.save();
                
                console.log(`✅ Session ${sessionId} authenticated`);
            } catch (error) {
                console.error(`Error updating auth status for ${sessionId}:`, error);
            }
        });


        // client.on('ready', () => {
        //     console.log(`✅ Session ${sessionId} is ready`);
        // });



        client.on('loading_screen', async () => {
            try {
                sessionData.status = 'loading_screen';
                sessionData.qr_code = null;
                sessionData.updated_at = new Date();
                await sessionData.save();
                
                console.log(`✅ Session ${sessionId} loading_screen`);
            } catch (error) {
                console.error(`Error updating auth status for ${sessionId}:`, error);
            }
        });

        client.on('ready', async () => {
            try {
                // Get phone number
                console.log('client.info',client.info);
                
                const clientInfo = client.info;
                sessionData.phone_number = clientInfo.wid.user;
                sessionData.name = clientInfo.wid.pushname;
                sessionData.status = 'ready';
                sessionData.connected_at = new Date();
                sessionData.qr_code = null;
                sessionData.updated_at = new Date();
                
                // Fetch and save contacts with full details
                const contacts = await getContactsInternal(client);
                const savedContacts = await contactService.saveContacts(userId, placeId, sessionId, contacts);
                
                sessionData.total_contacts = savedContacts.length;
                sessionData.last_contacts_sync = new Date();
                
                // Count groups
                const groups = await contactService.getUserGroups(userId, placeId);
                sessionData.total_groups = groups.length;
                
                await sessionData.save();
                
                console.log(`✅ Session ${sessionId} is ready with ${contacts.length} contacts and ${groups.length} groups`);
            } catch (error) {
                console.error(`Error in ready event for ${sessionId}:`, error);
                sessionData.status = 'error';
                await sessionData.save();
            }
        });

        client.on('auth_failure', async (message) => {
            try {
                console.error(`⚠️ Auth failure for ${sessionId}:`, message);
                
                sessionData.status = 'error';
                sessionData.updated_at = new Date();
                await sessionData.save();

                // Clean up
                await cleanupSession(sessionId, authPath);
            } catch (error) {
                console.error(`Error handling auth failure for ${sessionId}:`, error);
            }
        });

        client.on('disconnected', async (reason) => {
            try {
                console.log(`❌ Session ${sessionId} disconnected:`, reason);
                
                sessionData.status = 'disconnected';
                sessionData.updated_at = new Date();
                await sessionData.save();

                // Clean up
                await cleanupSession(sessionId, authPath);
            } catch (error) {
                console.error(`Error handling disconnect for ${sessionId}:`, error);
            }
        });

        client.initialize();

        return { success: true, session_id: sessionId, status: 'initializing' };

    } catch (error) {
        console.error('Error initializing client:', error);
        throw error;
    }
}

async function getContactsInternal(client) {
    try {
        const contacts = await client.getContacts();
        const contactsWithDetails = [];
        
        for (const contact of contacts) {
            if (contact.id?.server === 'c.us' && contact.isWAContact) {
                try {
                    // Get additional contact info
                    const profilePicUrl = await client.getProfilePicUrl(contact.id._serialized).catch(() => null);
                    
                    contactsWithDetails.push({
                        name: contact.name || contact.pushname || contact.verifiedName || '-',
                        number: contact.id.user,
                        whatsapp_id: contact.id._serialized,
                        profile_picture_url: profilePicUrl,
                        is_business: contact.isBusiness || false,
                        business_info: contact.businessProfile || {},
                        last_interaction: contact.lastSeen || null,
                        last_seen: contact.lastSeen || null
                    });
                } catch (contactError) {
                    console.warn(`Error getting details for contact ${contact.id.user}:`, contactError.message);
                    // Still add basic contact info
                    contactsWithDetails.push({
                        name: contact.name || contact.pushname || '-',
                        number: contact.id.user,
                        whatsapp_id: contact.id._serialized,
                        profile_picture_url: null,
                        is_business: false,
                        business_info: {},
                        last_interaction: null,
                        last_seen: null
                    });
                }
            }
        }
        
        return contactsWithDetails;
    } catch (error) {
        console.error('Error fetching contacts:', error);
        return [];
    }
}

async function cleanupSession(sessionId, authPath) {
    try {
        // Remove from memory
        if (clients[sessionId]) {
            delete clients[sessionId];
        }

        // Remove auth files
        if (fs.existsSync(authPath)) {
            fs.rmSync(authPath, { recursive: true, force: true });
            console.log(`🗑️ Deleted session folder for ${sessionId}`);
        }
    } catch (error) {
        console.error(`Error cleaning up session ${sessionId}:`, error);
    }
}

async function getSessionStatus(userId, placeId) {
    try {
        const sessionData = await WhatsAppSession.findOne({ 
            user_id: userId, 
            place_id: placeId 
        }).sort({ created_at: -1 });

        if (!sessionData) {
            return { status: 'not_initialized', session_exists: false };
        }

        return {
            session_id: sessionData.session_id,
            status: sessionData.status,
            qr_code: sessionData.qr_code,
            phone_number: sessionData.phone_number,
            connected_at: sessionData.connected_at,
            session_exists: true,
            total_contacts: sessionData.total_contacts,
            total_groups: sessionData.total_groups,
            last_contacts_sync: sessionData.last_contacts_sync
        };
    } catch (error) {
        console.error('Error getting session status:', error);
        throw error;
    }
}

async function sendMessageToGroup(userId, placeId, groupId, message, imageUrl = null) {
    try {
        const sessionData = await WhatsAppSession.findOne({ 
            user_id: userId, 
            place_id: placeId,
            status: 'connected'
        });

        if (!sessionData) {
            throw new Error('No active session found');
        }

        const client = clients[sessionData.session_id]?.client;
        if (!client) {
            throw new Error('Client not available');
        }

        // Get contacts from group
        const groupData = await contactService.getContactsByGroupId(userId, placeId, groupId);
        const contacts = groupData.contacts;

        if (contacts.length === 0) {
            throw new Error('No contacts found in group');
        }

        // Download image if URL provided
        let imageData = null;
        if (imageUrl) {
            if (!isValidImageUrl(imageUrl)) {
                throw new Error('Invalid image URL provided');
            }
            
            try {
                imageData = await downloadImageFromUrl(imageUrl);
                console.log(`✅ Downloaded image: ${imageData.size} bytes, type: ${imageData.mimeType}`);
            } catch (downloadError) {
                throw new Error(`Failed to download image: ${downloadError.message}`);
            }
        }

        const results = [];
        
        for (const contact of contacts) {
            try {
                // Create message log
                const messageLog = new MessageLog({
                    user_id: userId,
                    place_id: placeId,
                    session_id: sessionData.session_id,
                    recipient_number: contact.number,
                    recipient_name: contact.name,
                    message_content: message,
                    message_type: imageUrl ? 'image' : 'text',
                    status: 'pending'
                });

                let result;
                if (imageData) {
                    const media = new MessageMedia(imageData.mimeType, imageData.buffer.toString('base64'));
                    result = await client.sendMessage(`${contact.number}@c.us`, media, { caption: message });
                    messageLog.message_type = 'image';
                } else {
                    result = await client.sendMessage(`${contact.number}@c.us`, message);
                }

                // Update message log
                messageLog.status = 'sent';
                messageLog.sent_at = new Date();
                await messageLog.save();

                results.push({
                    contact_id: contact.contact_id,
                    number: contact.number,
                    name: contact.name,
                    status: 'sent',
                    message_id: result.id._serialized
                });

            } catch (sendError) {
                console.error(`Error sending to ${contact.number}:`, sendError);
                
                // Update message log with error
                const messageLog = new MessageLog({
                    user_id: userId,
                    place_id: placeId,
                    session_id: sessionData.session_id,
                    recipient_number: contact.number,
                    recipient_name: contact.name,
                    message_content: message,
                    message_type: imageUrl ? 'image' : 'text',
                    status: 'failed',
                    error_message: sendError.message
                });
                await messageLog.save();

                results.push({
                    contact_id: contact.contact_id,
                    number: contact.number,
                    name: contact.name,
                    status: 'failed',
                    error: sendError.message
                });
            }
        }

        // Update session activity
        sessionData.last_activity = new Date();
        await sessionData.save();

        return {
            success: true,
            group_id: groupId,
            group_name: groupData.group_info.name,
            total_contacts: contacts.length,
            results: results,
            summary: {
                sent: results.filter(r => r.status === 'sent').length,
                failed: results.filter(r => r.status === 'failed').length
            }
        };

    } catch (error) {
        console.error('Error sending message to group:', error);
        throw error;
    }
}

async function sendMessage(userId, placeId, contactId, message, imageUrl = null) {
    try {
        const sessionData = await WhatsAppSession.findOne({ 
            user_id: userId, 
            place_id: placeId,
            status: 'connected'
        });

        if (!sessionData) {
            throw new Error('No active session found');
        }

        const client = clients[sessionData.session_id]?.client;
        if (!client) {
            throw new Error('Client not available');
        }

        // Get contact details
        const contact = await contactService.getContactById(userId, placeId, contactId);

        // Download image if URL provided
        let imageData = null;
        if (imageUrl) {
            if (!isValidImageUrl(imageUrl)) {
                throw new Error('Invalid image URL provided');
            }
            
            try {
                imageData = await downloadImageFromUrl(imageUrl);
                console.log(`✅ Downloaded image: ${imageData.size} bytes, type: ${imageData.mimeType}`);
            } catch (downloadError) {
                throw new Error(`Failed to download image: ${downloadError.message}`);
            }
        }

        // Create message log
        const messageLog = new MessageLog({
            user_id: userId,
            place_id: placeId,
            session_id: sessionData.session_id,
            recipient_number: contact.number,
            recipient_name: contact.name,
            message_content: message,
            message_type: imageUrl ? 'image' : 'text',
            status: 'pending'
        });

        try {
            let result;
            if (imageData) {
                const media = new MessageMedia(imageData.mimeType, imageData.buffer.toString('base64'));
                result = await client.sendMessage(`${contact.number}@c.us`, media, { caption: message });
                messageLog.message_type = 'image';
            } else {
                result = await client.sendMessage(`${contact.number}@c.us`, message);
            }

            // Update message log
            messageLog.status = 'sent';
            messageLog.sent_at = new Date();
            await messageLog.save();

            // Update session activity
            sessionData.last_activity = new Date();
            await sessionData.save();

            return { 
                success: true, 
                contact_id: contactId,
                message_id: result.id._serialized 
            };

        } catch (sendError) {
            messageLog.status = 'failed';
            messageLog.error_message = sendError.message;
            await messageLog.save();
            throw sendError;
        }

    } catch (error) {
        console.error('Error sending message:', error);
        throw error;
    }
}

async function logout(userId, placeId) {
    try {
        const sessionData = await WhatsAppSession.findOne({ 
            user_id: userId, 
            place_id: placeId 
        }).sort({ created_at: -1 });

        if (!sessionData) {
            throw new Error('No session found');
        }

        const client = clients[sessionData.session_id]?.client;
        if (client) {
            await client.logout();
            await client.destroy();
        }

        // Update session status
        sessionData.status = 'disconnected';
        sessionData.updated_at = new Date();
        await sessionData.save();

        // Clean up
        const authPath = path.join(__dirname, '../.wwebjs_auth', `session-${sessionData.session_id}`);
        await cleanupSession(sessionData.session_id, authPath);

        console.log(`👋 Session ${sessionData.session_id} logged out`);
        return { success: true };

    } catch (error) {
        console.error('Error during logout:', error);
        throw error;
    }
}

// Get message logs for a user
async function getMessageLogs(userId, placeId, page = 1, limit = 50) {
    try {
        const skip = (page - 1) * limit;
        
        const logs = await MessageLog.find({ 
            user_id: userId, 
            place_id: placeId 
        })
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limit);

        const totalCount = await MessageLog.countDocuments({ 
            user_id: userId, 
            place_id: placeId 
        });

        return {
            logs,
            pagination: {
                current_page: page,
                per_page: limit,
                total: totalCount,
                total_pages: Math.ceil(totalCount / limit)
            }
        };
    } catch (error) {
        console.error('Error getting message logs:', error);
        throw error;
    }
}

module.exports = { 
    initClient, 
    getSessionStatus, 
    sendMessage,
    sendMessageToGroup,
    logout,
    getMessageLogs
};