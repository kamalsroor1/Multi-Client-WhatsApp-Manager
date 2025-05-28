const { MessageMedia } = require('whatsapp-web.js');
const MessageLog = require('../../../models/MessageLog');
const WhatsAppService = require('../whatsapp/WhatsAppService');
const ContactService = require('../contact/ContactService');
const GroupService = require('../contact/GroupService');
const Logger = require('../../utils/Logger');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

/**
 * Service for handling WhatsApp messages
 * Implements Single Responsibility Principle
 */
class MessageService {
    constructor() {
        this.whatsAppService = new WhatsAppService();
        this.contactService = new ContactService();
        this.groupService = new GroupService();
        this.logger = new Logger('MessageService');
    }

    /**
     * Send simple text message
     */
    async sendTextMessage(userId, placeId, phoneNumber, message) {
        try {
            this.logger.start(`Sending text message to ${phoneNumber}`);
            
            const result = await this.whatsAppService.sendMessage(userId, placeId, phoneNumber, message);
            
            // Log the message
            await this.createMessageLog({
                userId,
                placeId,
                sessionId: result.session_id || 'unknown',
                recipientNumber: phoneNumber,
                recipientName: 'Unknown',
                messageContent: message,
                messageType: 'text',
                status: 'sent',
                messageId: result.message_id
            });

            this.logger.success(`Text message sent successfully to ${phoneNumber}`);
            return result;
            
        } catch (error) {
            this.logger.error(`Error sending text message to ${phoneNumber}:`, error);
            
            // Log the failed message
            await this.createMessageLog({
                userId,
                placeId,
                sessionId: 'unknown',
                recipientNumber: phoneNumber,
                recipientName: 'Unknown',
                messageContent: message,
                messageType: 'text',
                status: 'failed',
                errorMessage: error.message
            });
            
            throw error;
        }
    }

    /**
     * Send media message with file
     */
    async sendMediaMessage(userId, placeId, phoneNumber, mediaPath, caption = '', mediaType = 'image') {
        try {
            this.logger.start(`Sending ${mediaType} message to ${phoneNumber}`);
            
            // Check if file exists
            if (!fs.existsSync(mediaPath)) {
                throw new Error(`Media file not found: ${mediaPath}`);
            }

            // Create media object
            const media = MessageMedia.fromFilePath(mediaPath);
            
            const result = await this.whatsAppService.sendMediaMessage(userId, placeId, phoneNumber, media, caption);
            
            // Log the message
            await this.createMessageLog({
                userId,
                placeId,
                sessionId: result.session_id || 'unknown',
                recipientNumber: phoneNumber,
                recipientName: 'Unknown',
                messageContent: caption,
                messageType: mediaType,
                status: 'sent',
                messageId: result.message_id,
                mediaPath: mediaPath
            });

            this.logger.success(`${mediaType} message sent successfully to ${phoneNumber}`);
            return result;
            
        } catch (error) {
            this.logger.error(`Error sending ${mediaType} message to ${phoneNumber}:`, error);
            
            // Log the failed message
            await this.createMessageLog({
                userId,
                placeId,
                sessionId: 'unknown',
                recipientNumber: phoneNumber,
                recipientName: 'Unknown',
                messageContent: caption,
                messageType: mediaType,
                status: 'failed',
                errorMessage: error.message,
                mediaPath: mediaPath
            });
            
            throw error;
        }
    }

    /**
     * Send media message from URL
     */
    async sendMediaFromUrl(userId, placeId, phoneNumber, mediaUrl, caption = '', mediaType = 'image') {
        try {
            this.logger.start(`Sending ${mediaType} from URL to ${phoneNumber}`);
            
            // Download media from URL
            const response = await fetch(mediaUrl);
            if (!response.ok) {
                throw new Error(`Failed to download media from URL: ${response.statusText}`);
            }
            
            const buffer = await response.buffer();
            const mimeType = response.headers.get('content-type') || this.getMimeTypeFromUrl(mediaUrl);
            
            // Create media object
            const media = new MessageMedia(mimeType, buffer.toString('base64'));
            
            const result = await this.whatsAppService.sendMediaMessage(userId, placeId, phoneNumber, media, caption);
            
            // Log the message
            await this.createMessageLog({
                userId,
                placeId,
                sessionId: result.session_id || 'unknown',
                recipientNumber: phoneNumber,
                recipientName: 'Unknown',
                messageContent: caption,
                messageType: mediaType,
                status: 'sent',
                messageId: result.message_id,
                mediaUrl: mediaUrl
            });

            this.logger.success(`${mediaType} from URL sent successfully to ${phoneNumber}`);
            return result;
            
        } catch (error) {
            this.logger.error(`Error sending ${mediaType} from URL to ${phoneNumber}:`, error);
            
            // Log the failed message
            await this.createMessageLog({
                userId,
                placeId,
                sessionId: 'unknown',
                recipientNumber: phoneNumber,
                recipientName: 'Unknown',
                messageContent: caption,
                messageType: mediaType,
                status: 'failed',
                errorMessage: error.message,
                mediaUrl: mediaUrl
            });
            
            throw error;
        }
    }

    /**
     * Send message to contact by ID
     */
    async sendMessage(userId, placeId, contactId, message, imageUrl = null) {
        try {
            this.logger.start(`Sending message to contact ${contactId}`);
            
            // Get client and session data
            const { client, sessionData } = await this.whatsAppService.getClientByCredentials(userId, placeId);
            
            // Get contact details
            const contact = await this.contactService.getContactById(userId, placeId, contactId);
            if (!contact) {
                throw new Error(`Contact not found: ${contactId}`);
            }
            
            // Handle image if provided
            let imageData = null;
            if (imageUrl) {
                imageData = await this.downloadImageFromUrl(imageUrl);
                this.logger.info(`Downloaded image for message: ${Math.round(imageData.buffer.length / 1024)}KB`);
            }
            
            // Create message log entry
            const messageLog = await this.createMessageLog({
                userId,
                placeId,
                sessionId: sessionData.session_id,
                recipientNumber: contact.phone_number,
                recipientName: contact.name,
                messageContent: message,
                messageType: imageUrl ? 'image' : 'text',
                status: 'pending'
            });
            
            try {
                // Send message via WhatsApp
                let result;
                const whatsappNumber = contact.phone_number.includes('@c.us') ? 
                    contact.phone_number : `${contact.phone_number}@c.us`;
                
                if (imageData) {
                    const media = new MessageMedia(imageData.mimeType, imageData.buffer.toString('base64'));
                    result = await client.sendMessage(whatsappNumber, media, { caption: message });
                } else {
                    result = await client.sendMessage(whatsappNumber, message);
                }
                
                // Update message log with success
                await this.updateMessageLogSuccess(messageLog, result.id._serialized);
                
                // Update session activity
                await this.whatsAppService.updateSessionActivity(sessionData.session_id);
                
                this.logger.success(`Message sent successfully to ${contact.phone_number}`);
                
                return {
                    success: true,
                    contact_id: contactId,
                    message_id: result.id._serialized,
                    recipient: {
                        name: contact.name,
                        number: contact.phone_number
                    },
                    message_type: imageUrl ? 'image' : 'text',
                    sent_at: new Date()
                };
                
            } catch (sendError) {
                // Update message log with failure
                await this.updateMessageLogFailure(messageLog, sendError.message);
                throw sendError;
            }
            
        } catch (error) {
            this.logger.error(`Error sending message to contact ${contactId}:`, error);
            throw new Error(`Failed to send message: ${error.message}`);
        }
    }

    /**
     * Send message to group
     */
    async sendMessageToGroup(userId, placeId, groupId, message, imageUrl = null) {
        try {
            this.logger.start(`Sending message to group ${groupId}`);
            
            // Get client and session data
            const { client, sessionData } = await this.whatsAppService.getClientByCredentials(userId, placeId);
            
            // Get group contacts
            const groupData = await this.groupService.getContactsByGroupId(userId, placeId, groupId);
            const contacts = groupData.contacts;
            
            if (contacts.length === 0) {
                throw new Error('No contacts found in group');
            }
            
            // Handle image if provided
            let imageData = null;
            if (imageUrl) {
                imageData = await this.downloadImageFromUrl(imageUrl);
                this.logger.info(`Downloaded image for group message: ${Math.round(imageData.buffer.length / 1024)}KB`);
            }
            
            const results = [];
            let sentCount = 0;
            let failedCount = 0;
            
            // Send to each contact in the group
            for (const contact of contacts) {
                let messageLog = null;
                try {
                    // Create message log for each recipient
                    messageLog = await this.createMessageLog({
                        userId,
                        placeId,
                        sessionId: sessionData.session_id,
                        recipientNumber: contact.phone_number,
                        recipientName: contact.name,
                        messageContent: message,
                        messageType: imageUrl ? 'image' : 'text',
                        groupId: groupId,
                        status: 'pending'
                    });
                    
                    // Send message
                    let result;
                    const whatsappNumber = contact.phone_number.includes('@c.us') ? 
                        contact.phone_number : `${contact.phone_number}@c.us`;
                    
                    if (imageData) {
                        const media = new MessageMedia(imageData.mimeType, imageData.buffer.toString('base64'));
                        result = await client.sendMessage(whatsappNumber, media, { caption: message });
                    } else {
                        result = await client.sendMessage(whatsappNumber, message);
                    }
                    
                    // Update message log with success
                    await this.updateMessageLogSuccess(messageLog, result.id._serialized);
                    
                    results.push({
                        contact_id: contact.contact_id,
                        number: contact.phone_number,
                        name: contact.name,
                        status: 'sent',
                        message_id: result.id._serialized
                    });
                    
                    sentCount++;
                    
                    // Add delay between messages to avoid rate limiting
                    if (sentCount < contacts.length) {
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    }
                    
                } catch (sendError) {
                    this.logger.error(`Error sending to ${contact.phone_number}:`, sendError);
                    
                    // Update message log with failure
                    if (messageLog) {
                        await this.updateMessageLogFailure(messageLog, sendError.message);
                    }
                    
                    results.push({
                        contact_id: contact.contact_id,
                        number: contact.phone_number,
                        name: contact.name,
                        status: 'failed',
                        error: sendError.message
                    });
                    
                    failedCount++;
                }
            }
            
            // Update session activity
            await this.whatsAppService.updateSessionActivity(sessionData.session_id);
            
            this.logger.success(`Group message completed: ${sentCount} sent, ${failedCount} failed`);
            
            return {
                success: true,
                group_id: groupId,
                group_name: groupData.group_info.name,
                total_contacts: contacts.length,
                results: results,
                summary: {
                    sent: sentCount,
                    failed: failedCount,
                    success_rate: Math.round((sentCount / contacts.length) * 100)
                },
                message_type: imageUrl ? 'image' : 'text',
                sent_at: new Date()
            };
            
        } catch (error) {
            this.logger.error(`Error sending message to group ${groupId}:`, error);
            throw new Error(`Failed to send group message: ${error.message}`);
        }
    }

    /**
     * Send bulk messages to multiple contacts
     */
    async sendBulkMessages(userId, placeId, contacts, message, options = {}) {
        try {
            this.logger.start(`Sending bulk messages to ${contacts.length} contacts`);
            
            const { client, sessionData } = await this.whatsAppService.getClientByCredentials(userId, placeId);
            
            const results = [];
            let sentCount = 0;
            let failedCount = 0;
            
            for (const contact of contacts) {
                let messageLog = null;
                try {
                    // Create message log
                    messageLog = await this.createMessageLog({
                        userId,
                        placeId,
                        sessionId: sessionData.session_id,
                        recipientNumber: contact.phone_number,
                        recipientName: contact.name,
                        messageContent: message,
                        messageType: 'text',
                        status: 'pending'
                    });
                    
                    // Send message
                    const whatsappNumber = contact.phone_number.includes('@c.us') ? 
                        contact.phone_number : `${contact.phone_number}@c.us`;
                    
                    const result = await client.sendMessage(whatsappNumber, message);
                    
                    // Update message log with success
                    await this.updateMessageLogSuccess(messageLog, result.id._serialized);
                    
                    results.push({
                        contact_id: contact.contact_id,
                        number: contact.phone_number,
                        name: contact.name,
                        status: 'sent',
                        message_id: result.id._serialized
                    });
                    
                    sentCount++;
                    
                    // Add delay between messages
                    if (sentCount < contacts.length) {
                        const delay = options.delay || 2000;
                        await new Promise(resolve => setTimeout(resolve, delay));
                    }
                    
                } catch (sendError) {
                    this.logger.error(`Error sending to ${contact.phone_number}:`, sendError);
                    
                    if (messageLog) {
                        await this.updateMessageLogFailure(messageLog, sendError.message);
                    }
                    
                    results.push({
                        contact_id: contact.contact_id,
                        number: contact.phone_number,
                        name: contact.name,
                        status: 'failed',
                        error: sendError.message
                    });
                    
                    failedCount++;
                }
            }
            
            // Update session activity
            await this.whatsAppService.updateSessionActivity(sessionData.session_id);
            
            this.logger.success(`Bulk messages completed: ${sentCount} sent, ${failedCount} failed`);
            
            return {
                success: true,
                total_contacts: contacts.length,
                results: results,
                summary: {
                    sent: sentCount,
                    failed: failedCount,
                    success_rate: Math.round((sentCount / contacts.length) * 100)
                },
                sent_at: new Date()
            };
            
        } catch (error) {
            this.logger.error('Error sending bulk messages:', error);
            throw new Error(`Failed to send bulk messages: ${error.message}`);
        }
    }

    /**
     * Get chat history
     */
    async getChatHistory(userId, placeId, phoneNumber, limit = 50) {
        try {
            return await this.whatsAppService.getChatMessages(userId, placeId, phoneNumber, limit);
        } catch (error) {
            this.logger.error(`Error getting chat history for ${phoneNumber}:`, error);
            throw error;
        }
    }

    /**
     * Get message logs with pagination and filters
     */
    async getMessageLogs(userId, placeId, filters = {}, page = 1, limit = 50) {
        try {
            const skip = (page - 1) * limit;
            
            // Build query
            const query = { 
                user_id: userId, 
                place_id: placeId 
            };
            
            if (filters.status) query.status = filters.status;
            if (filters.message_type) query.message_type = filters.message_type;
            if (filters.group_id) query.group_id = filters.group_id;
            if (filters.recipient_number) query.recipient_number = { $regex: filters.recipient_number, $options: 'i' };
            if (filters.from_date) query.created_at = { $gte: new Date(filters.from_date) };
            if (filters.to_date) {
                if (query.created_at) {
                    query.created_at.$lte = new Date(filters.to_date);
                } else {
                    query.created_at = { $lte: new Date(filters.to_date) };
                }
            }
            
            const logs = await MessageLog.find(query)
                .sort({ created_at: -1 })
                .skip(skip)
                .limit(limit)
                .lean();

            const totalCount = await MessageLog.countDocuments(query);

            // Get statistics
            const stats = await this.getMessageStatistics(userId, placeId, filters);

            return {
                logs,
                pagination: {
                    current_page: page,
                    per_page: limit,
                    total: totalCount,
                    total_pages: Math.ceil(totalCount / limit),
                    has_next: page < Math.ceil(totalCount / limit),
                    has_prev: page > 1
                },
                statistics: stats,
                filters: filters
            };
        } catch (error) {
            this.logger.error('Error getting message logs:', error);
            throw new Error(`Failed to get message logs: ${error.message}`);
        }
    }

    /**
     * Get message statistics
     */
    async getMessageStatistics(userId, placeId, filters = {}) {
        try {
            // Build match query
            const matchQuery = { user_id: userId, place_id: placeId };
            
            if (filters.from_date) matchQuery.created_at = { $gte: new Date(filters.from_date) };
            if (filters.to_date) {
                if (matchQuery.created_at) {
                    matchQuery.created_at.$lte = new Date(filters.to_date);
                } else {
                    matchQuery.created_at = { $lte: new Date(filters.to_date) };
                }
            }
            
            const stats = await MessageLog.aggregate([
                { $match: matchQuery },
                {
                    $group: {
                        _id: null,
                        total_messages: { $sum: 1 },
                        sent_messages: {
                            $sum: { $cond: [{ $eq: ['$status', 'sent'] }, 1, 0] }
                        },
                        failed_messages: {
                            $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] }
                        },
                        pending_messages: {
                            $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] }
                        },
                        text_messages: {
                            $sum: { $cond: [{ $eq: ['$message_type', 'text'] }, 1, 0] }
                        },
                        image_messages: {
                            $sum: { $cond: [{ $eq: ['$message_type', 'image'] }, 1, 0] }
                        },
                        media_messages: {
                            $sum: { $cond: [{ $in: ['$message_type', ['image', 'video', 'audio', 'document']] }, 1, 0] }
                        }
                    }
                }
            ]);

            const result = stats[0] || {
                total_messages: 0,
                sent_messages: 0,
                failed_messages: 0,
                pending_messages: 0,
                text_messages: 0,
                image_messages: 0,
                media_messages: 0
            };

            return {
                ...result,
                success_rate: result.total_messages > 0 ? 
                    Math.round((result.sent_messages / result.total_messages) * 100) : 0,
                failure_rate: result.total_messages > 0 ? 
                    Math.round((result.failed_messages / result.total_messages) * 100) : 0
            };
        } catch (error) {
            this.logger.error('Error getting message statistics:', error);
            return {
                total_messages: 0,
                sent_messages: 0,
                failed_messages: 0,
                pending_messages: 0,
                text_messages: 0,
                image_messages: 0,
                media_messages: 0,
                success_rate: 0,
                failure_rate: 0
            };
        }
    }

    /**
     * Download image from URL
     */
    async downloadImageFromUrl(imageUrl) {
        try {
            const response = await fetch(imageUrl);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const buffer = await response.buffer();
            const mimeType = response.headers.get('content-type') || this.getMimeTypeFromUrl(imageUrl);
            
            return {
                buffer,
                mimeType,
                size: buffer.length
            };
        } catch (error) {
            this.logger.error(`Error downloading image from ${imageUrl}:`, error);
            throw new Error(`Failed to download image: ${error.message}`);
        }
    }

    /**
     * Get MIME type from URL
     */
    getMimeTypeFromUrl(url) {
        const extension = path.extname(url).toLowerCase();
        const mimeTypes = {
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.gif': 'image/gif',
            '.webp': 'image/webp',
            '.mp4': 'video/mp4',
            '.mp3': 'audio/mpeg',
            '.pdf': 'application/pdf'
        };
        
        return mimeTypes[extension] || 'application/octet-stream';
    }

    /**
     * Test image URL
     */
    async testImageUrl(imageUrl) {
        try {
            const response = await fetch(imageUrl, { method: 'HEAD' });
            const contentType = response.headers.get('content-type');
            const contentLength = response.headers.get('content-length');
            
            return {
                valid: response.ok,
                status: response.status,
                content_type: contentType,
                content_length: contentLength,
                is_image: contentType && contentType.startsWith('image/'),
                url: imageUrl
            };
        } catch (error) {
            return {
                valid: false,
                error: error.message,
                url: imageUrl
            };
        }
    }

    /**
     * Create message log entry
     */
    async createMessageLog(logData) {
        try {
            const messageLog = new MessageLog({
                user_id: logData.userId,
                place_id: logData.placeId,
                session_id: logData.sessionId,
                recipient_number: logData.recipientNumber,
                recipient_name: logData.recipientName,
                message_content: logData.messageContent,
                message_type: logData.messageType,
                group_id: logData.groupId || null,
                status: logData.status,
                message_id: logData.messageId || null,
                error_message: logData.errorMessage || null,
                media_path: logData.mediaPath || null,
                media_url: logData.mediaUrl || null,
                created_at: new Date()
            });
            
            await messageLog.save();
            return messageLog;
        } catch (error) {
            this.logger.error('Error creating message log:', error);
            throw error;
        }
    }

    /**
     * Update message log with success
     */
    async updateMessageLogSuccess(messageLog, messageId) {
        try {
            messageLog.status = 'sent';
            messageLog.message_id = messageId;
            messageLog.sent_at = new Date();
            messageLog.updated_at = new Date();
            await messageLog.save();
        } catch (error) {
            this.logger.warn('Error updating message log success:', error);
        }
    }

    /**
     * Update message log with failure
     */
    async updateMessageLogFailure(messageLog, errorMessage) {
        try {
            messageLog.status = 'failed';
            messageLog.error_message = errorMessage;
            messageLog.failed_at = new Date();
            messageLog.updated_at = new Date();
            await messageLog.save();
        } catch (error) {
            this.logger.warn('Error updating message log failure:', error);
        }
    }

    /**
     * Delete message logs
     */
    async deleteMessageLogs(userId, placeId, filters = {}) {
        try {
            const query = { 
                user_id: userId, 
                place_id: placeId 
            };
            
            if (filters.status) query.status = filters.status;
            if (filters.older_than_days) {
                const cutoffDate = new Date();
                cutoffDate.setDate(cutoffDate.getDate() - filters.older_than_days);
                query.created_at = { $lt: cutoffDate };
            }
            
            const result = await MessageLog.deleteMany(query);
            
            this.logger.info(`Deleted ${result.deletedCount} message logs`);
            
            return {
                deleted_count: result.deletedCount,
                success: true
            };
        } catch (error) {
            this.logger.error('Error deleting message logs:', error);
            throw new Error(`Failed to delete message logs: ${error.message}`);
        }
    }
}

module.exports = MessageService;