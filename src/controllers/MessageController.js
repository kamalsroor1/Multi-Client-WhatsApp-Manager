const MessageService = require('../services/message/MessageService');
const ContactService = require('../services/contact/ContactService');
const WhatsAppService = require('../services/whatsapp/WhatsAppService');
const ApiResponse = require('../utils/ApiResponse');
const Logger = require('../utils/Logger');

/**
 * Controller for message operations
 * Implements Controller pattern for message-related HTTP requests
 */
class MessageController {
    constructor() {
        this.messageService = new MessageService();
        this.contactService = new ContactService();
        this.whatsAppService = new WhatsAppService();
        this.logger = new Logger('MessageController');
    }

    /**
     * Send simple text message
     */
    async sendTextMessage(req, res) {
        try {
            const { user_id, place_id, phone_number, message } = req.body;

            // Validation
            if (!user_id || !place_id || !phone_number || !message) {
                return ApiResponse.error(res, 'Missing required fields: user_id, place_id, phone_number, message', 400);
            }

            this.logger.info(`Sending text message to ${phone_number}`);

            const result = await this.messageService.sendTextMessage(
                parseInt(user_id),
                parseInt(place_id),
                phone_number,
                message
            );

            return ApiResponse.success(res, result, 'Text message sent successfully');
        } catch (error) {
            this.logger.error('Error sending text message:', error);
            return ApiResponse.error(res, error.message, 500);
        }
    }

    /**
     * Send media message
     */
    async sendMediaMessage(req, res) {
        try {
            const { user_id, place_id, phone_number, caption = '', media_type = 'image' } = req.body;

            // Validation
            if (!user_id || !place_id || !phone_number) {
                return ApiResponse.error(res, 'Missing required fields: user_id, place_id, phone_number', 400);
            }

            if (!req.file) {
                return ApiResponse.error(res, 'No media file uploaded', 400);
            }

            this.logger.info(`Sending ${media_type} message to ${phone_number}`);

            const result = await this.messageService.sendMediaMessage(
                parseInt(user_id),
                parseInt(place_id),
                phone_number,
                req.file.path,
                caption,
                media_type
            );

            return ApiResponse.success(res, result, `${media_type} message sent successfully`);
        } catch (error) {
            this.logger.error('Error sending media message:', error);
            return ApiResponse.error(res, error.message, 500);
        }
    }

    /**
     * Send media from URL
     */
    async sendMediaFromUrl(req, res) {
        try {
            const { user_id, place_id, phone_number, media_url, caption = '', media_type = 'image' } = req.body;

            // Validation
            if (!user_id || !place_id || !phone_number || !media_url) {
                return ApiResponse.error(res, 'Missing required fields: user_id, place_id, phone_number, media_url', 400);
            }

            this.logger.info(`Sending ${media_type} from URL to ${phone_number}`);

            const result = await this.messageService.sendMediaFromUrl(
                parseInt(user_id),
                parseInt(place_id),
                phone_number,
                media_url,
                caption,
                media_type
            );

            return ApiResponse.success(res, result, `${media_type} from URL sent successfully`);
        } catch (error) {
            this.logger.error('Error sending media from URL:', error);
            return ApiResponse.error(res, error.message, 500);
        }
    }

    /**
     * Send message to contact by ID
     */
    async sendMessage(req, res) {
        try {
            const { user_id, place_id, contact_id, message, image_url } = req.body;

            // Validation
            if (!user_id || !place_id || !contact_id || (!message && !image_url)) {
                return ApiResponse.error(res, 'Missing required fields: user_id, place_id, contact_id, and either message or image_url', 400);
            }

            this.logger.info(`Sending message to contact ${contact_id}`);

            const result = await this.messageService.sendMessage(
                parseInt(user_id),
                parseInt(place_id),
                contact_id,
                message || '',
                image_url
            );

            return ApiResponse.success(res, result, 'Message sent successfully');
        } catch (error) {
            this.logger.error('Error sending message:', error);
            return ApiResponse.error(res, error.message, 500);
        }
    }

    /**
     * Send message to group
     */
    async sendMessageToGroup(req, res) {
        try {
            const { user_id, place_id, message, image_url } = req.body;
            const { group_id } = req.params;

            // Validation
            if (!user_id || !place_id || !group_id || (!message && !image_url)) {
                return ApiResponse.error(res, 'Missing required fields: user_id, place_id, group_id, and either message or image_url', 400);
            }

            this.logger.info(`Sending message to group ${group_id}`);

            const result = await this.messageService.sendMessageToGroup(
                parseInt(user_id),
                parseInt(place_id),
                group_id,
                message || '',
                image_url
            );

            return ApiResponse.success(res, result, 'Message sent to group successfully');
        } catch (error) {
            this.logger.error('Error sending message to group:', error);
            return ApiResponse.error(res, error.message, 500);
        }
    }

    /**
     * Send bulk messages to multiple contacts
     */
    async sendBulkMessages(req, res) {
        try {
            const { user_id, place_id, contacts, message, delay = 2000 } = req.body;

            // Validation
            if (!user_id || !place_id || !contacts || !message) {
                return ApiResponse.error(res, 'Missing required fields: user_id, place_id, contacts, message', 400);
            }

            if (!Array.isArray(contacts) || contacts.length === 0) {
                return ApiResponse.error(res, 'contacts must be a non-empty array', 400);
            }

            this.logger.info(`Sending bulk messages to ${contacts.length} contacts`);

            const result = await this.messageService.sendBulkMessages(
                parseInt(user_id),
                parseInt(place_id),
                contacts,
                message,
                { delay: parseInt(delay) }
            );

            return ApiResponse.success(res, result, 'Bulk messages processed successfully');
        } catch (error) {
            this.logger.error('Error sending bulk messages:', error);
            return ApiResponse.error(res, error.message, 500);
        }
    }

    /**
     * Send bulk messages (legacy endpoint)
     */
    async sendBulkMessagesLegacy(req, res) {
        try {
            const { user_id, place_id, recipients, message, image_url, delay_seconds = 2 } = req.body;

            // Validation
            if (!user_id || !place_id || !recipients || (!message && !image_url)) {
                return ApiResponse.error(res, 'Missing required fields: user_id, place_id, recipients, and either message or image_url', 400);
            }

            if (!Array.isArray(recipients) || recipients.length === 0) {
                return ApiResponse.error(res, 'recipients must be a non-empty array', 400);
            }

            this.logger.info(`Sending bulk messages to ${recipients.length} recipients`);

            const results = [];
            let totalSent = 0;
            let totalFailed = 0;
            const startTime = Date.now();

            for (let i = 0; i < recipients.length; i++) {
                const recipient = recipients[i];
                
                try {
                    let result;
                    if (recipient.contact_id) {
                        result = await this.messageService.sendMessage(
                            parseInt(user_id),
                            parseInt(place_id),
                            recipient.contact_id,
                            message || '',
                            image_url
                        );
                    } else if (recipient.phone_number) {
                        // Send directly to phone number
                        if (image_url) {
                            result = await this.messageService.sendMediaFromUrl(
                                parseInt(user_id),
                                parseInt(place_id),
                                recipient.phone_number,
                                image_url,
                                message || ''
                            );
                        } else {
                            result = await this.messageService.sendTextMessage(
                                parseInt(user_id),
                                parseInt(place_id),
                                recipient.phone_number,
                                message
                            );
                        }
                    } else {
                        throw new Error('Either contact_id or phone_number is required');
                    }

                    results.push({
                        recipient: recipient,
                        status: 'sent',
                        message_id: result.message_id,
                        sent_at: result.sent_at || new Date()
                    });
                    totalSent++;

                    // Apply delay between messages if specified
                    if (delay_seconds > 0 && i < recipients.length - 1) {
                        await new Promise(resolve => setTimeout(resolve, delay_seconds * 1000));
                    }

                } catch (error) {
                    this.logger.error(`Error sending to recipient ${i}:`, error);
                    results.push({
                        recipient: recipient,
                        status: 'failed',
                        error: error.message
                    });
                    totalFailed++;
                }
            }

            const processingTime = Math.round((Date.now() - startTime) / 1000);

            const responseData = {
                total_recipients: recipients.length,
                total_sent: totalSent,
                total_failed: totalFailed,
                success_rate: Math.round((totalSent / recipients.length) * 100),
                results: results,
                processed_at: new Date().toISOString(),
                processing_time_seconds: processingTime
            };

            return ApiResponse.success(res, responseData, 'Bulk messages processed');
        } catch (error) {
            this.logger.error('Error sending bulk messages:', error);
            return ApiResponse.error(res, error.message, 500);
        }
    }

    /**
     * Get chat history
     */
    async getChatHistory(req, res) {
        try {
            const { user_id, place_id, phone_number, limit = 50 } = req.query;

            // Validation
            if (!user_id || !place_id || !phone_number) {
                return ApiResponse.error(res, 'Missing required query parameters: user_id, place_id, phone_number', 400);
            }

            this.logger.info(`Getting chat history for ${phone_number}`);

            const result = await this.messageService.getChatHistory(
                parseInt(user_id),
                parseInt(place_id),
                phone_number,
                parseInt(limit)
            );

            return ApiResponse.success(res, result, 'Chat history retrieved successfully');
        } catch (error) {
            this.logger.error('Error getting chat history:', error);
            return ApiResponse.error(res, error.message, 500);
        }
    }

    /**
     * Get message logs with pagination and filters
     */
    async getMessageLogs(req, res) {
        try {
            const { 
                user_id, 
                place_id, 
                page = 1, 
                limit = 50, 
                status, 
                message_type, 
                from_date,
                to_date,
                recipient_number,
                group_id
            } = req.query;

            // Validation
            if (!user_id || !place_id) {
                return ApiResponse.error(res, 'Missing required query parameters: user_id, place_id', 400);
            }

            // Build filters
            const filters = {};
            if (status) filters.status = status;
            if (message_type) filters.message_type = message_type;
            if (from_date) filters.from_date = from_date;
            if (to_date) filters.to_date = to_date;
            if (recipient_number) filters.recipient_number = recipient_number;
            if (group_id) filters.group_id = group_id;

            const logs = await this.messageService.getMessageLogs(
                parseInt(user_id),
                parseInt(place_id),
                filters,
                parseInt(page),
                parseInt(limit)
            );

            return ApiResponse.success(res, logs, 'Message logs retrieved successfully');
        } catch (error) {
            this.logger.error('Error getting message logs:', error);
            return ApiResponse.error(res, error.message, 500);
        }
    }

    /**
     * Get message statistics
     */
    async getMessageStatistics(req, res) {
        try {
            const { user_id, place_id, from_date, to_date } = req.query;

            // Validation
            if (!user_id || !place_id) {
                return ApiResponse.error(res, 'Missing required query parameters: user_id, place_id', 400);
            }

            const filters = {};
            if (from_date) filters.from_date = from_date;
            if (to_date) filters.to_date = to_date;

            const stats = await this.messageService.getMessageStatistics(
                parseInt(user_id),
                parseInt(place_id),
                filters
            );

            return ApiResponse.success(res, stats, 'Message statistics retrieved successfully');
        } catch (error) {
            this.logger.error('Error getting message statistics:', error);
            return ApiResponse.error(res, error.message, 500);
        }
    }

    /**
     * Delete message logs
     */
    async deleteMessageLogs(req, res) {
        try {
            const { user_id, place_id, filters = {} } = req.body;

            // Validation
            if (!user_id || !place_id) {
                return ApiResponse.error(res, 'Missing required fields: user_id, place_id', 400);
            }

            this.logger.info(`Deleting message logs for user ${user_id}, place ${place_id}`);

            const result = await this.messageService.deleteMessageLogs(
                parseInt(user_id),
                parseInt(place_id),
                filters
            );

            return ApiResponse.success(res, result, 'Message logs deleted successfully');
        } catch (error) {
            this.logger.error('Error deleting message logs:', error);
            return ApiResponse.error(res, error.message, 500);
        }
    }

    /**
     * Retry failed message
     */
    async retryFailedMessage(req, res) {
        try {
            const { message_log_id } = req.params;
            const { user_id, place_id } = req.body;

            // Validation
            if (!user_id || !place_id) {
                return ApiResponse.error(res, 'Missing required fields: user_id, place_id', 400);
            }

            // Get the failed message log
            const MessageLog = require('../models/MessageLog');
            const messageLog = await MessageLog.findById(message_log_id);

            if (!messageLog) {
                return ApiResponse.error(res, 'Message log not found', 404);
            }

            if (messageLog.user_id !== parseInt(user_id) || messageLog.place_id !== parseInt(place_id)) {
                return ApiResponse.error(res, 'Unauthorized access to message log', 403);
            }

            if (messageLog.status !== 'failed') {
                return ApiResponse.error(res, 'Only failed messages can be retried', 400);
            }

            this.logger.info(`Retrying failed message ${message_log_id}`);

            // Retry sending the message
            let result;
            if (messageLog.message_type === 'text') {
                result = await this.messageService.sendTextMessage(
                    parseInt(user_id),
                    parseInt(place_id),
                    messageLog.recipient_number,
                    messageLog.message_content
                );
            } else {
                // For media messages, we'll send as text for now
                result = await this.messageService.sendTextMessage(
                    parseInt(user_id),
                    parseInt(place_id),
                    messageLog.recipient_number,
                    messageLog.message_content
                );
            }

            return ApiResponse.success(res, result, 'Message retried successfully');
        } catch (error) {
            this.logger.error('Error retrying failed message:', error);
            return ApiResponse.error(res, error.message, 500);
        }
    }

    /**
     * Test image URL
     */
    async testImageUrl(req, res) {
        try {
            const { image_url } = req.body;

            if (!image_url) {
                return ApiResponse.error(res, 'Missing required field: image_url', 400);
            }

            const result = await this.messageService.testImageUrl(image_url);

            return ApiResponse.success(res, result, 'Image URL tested successfully');
        } catch (error) {
            this.logger.error('Error testing image URL:', error);
            return ApiResponse.error(res, error.message, 500);
        }
    }

    /**
     * Validate message content and recipients
     */
    async validateMessage(req, res) {
        try {
            const { user_id, place_id, recipients, message, image_url } = req.body;

            // Validation
            if (!user_id || !place_id) {
                return ApiResponse.error(res, 'Missing required fields: user_id, place_id', 400);
            }

            const validation = {
                valid: true,
                warnings: [],
                errors: [],
                estimated_cost: 0,
                estimated_time_minutes: 0
            };

            // Validate message content
            if (!message && !image_url) {
                validation.errors.push('Either message or image_url is required');
                validation.valid = false;
            }

            if (message && message.length > 4000) {
                validation.warnings.push('Message is very long and might be truncated');
            }

            // Validate recipients
            if (!recipients || recipients.length === 0) {
                validation.errors.push('At least one recipient is required');
                validation.valid = false;
            }

            if (recipients && recipients.length > 1000) {
                validation.warnings.push('Large recipient list might take a long time to process');
            }

            // Validate image URL if provided
            if (image_url) {
                try {
                    const imageValidation = await this.messageService.testImageUrl(image_url);
                    if (!imageValidation.valid) {
                        validation.errors.push(`Image URL validation failed: ${imageValidation.error}`);
                        validation.valid = false;
                    }
                } catch (imageError) {
                    validation.warnings.push('Could not validate image URL');
                }
            }

            // Calculate estimates
            if (recipients && recipients.length > 0) {
                validation.estimated_time_minutes = Math.ceil(recipients.length * 2 / 60); // 2 seconds per message
                validation.estimated_cost = recipients.length * 0.01; // Placeholder cost
            }

            return ApiResponse.success(res, validation, 'Message validation completed');
        } catch (error) {
            this.logger.error('Error validating message:', error);
            return ApiResponse.error(res, error.message, 500);
        }
    }

    /**
     * Get message templates
     */
    async getMessageTemplates(req, res) {
        try {
            const { user_id, place_id } = req.query;

            // Validation
            if (!user_id || !place_id) {
                return ApiResponse.error(res, 'Missing required query parameters: user_id, place_id', 400);
            }

            // This would return saved message templates from database
            const templates = [
                {
                    id: 'welcome',
                    name: 'Welcome Message',
                    content: 'Welcome to our service! We\'re glad to have you.',
                    variables: ['name'],
                    category: 'greeting'
                },
                {
                    id: 'follow_up',
                    name: 'Follow Up',
                    content: 'Hi {name}, just following up on our previous conversation.',
                    variables: ['name'],
                    category: 'follow_up'
                },
                {
                    id: 'appointment_reminder',
                    name: 'Appointment Reminder',
                    content: 'Hi {name}, this is a reminder about your appointment on {date} at {time}.',
                    variables: ['name', 'date', 'time'],
                    category: 'reminder'
                },
                {
                    id: 'thank_you',
                    name: 'Thank You',
                    content: 'Thank you for your business, {name}! We appreciate your support.',
                    variables: ['name'],
                    category: 'appreciation'
                }
            ];

            return ApiResponse.success(res, templates, 'Message templates retrieved successfully');
        } catch (error) {
            this.logger.error('Error getting message templates:', error);
            return ApiResponse.error(res, error.message, 500);
        }
    }

    /**
     * Get message sending status
     */
    async getMessageStatus(req, res) {
        try {
            const { user_id, place_id } = req.query;

            // Validation
            if (!user_id || !place_id) {
                return ApiResponse.error(res, 'Missing required query parameters: user_id, place_id', 400);
            }

            // Get recent message activity
            const recentLogs = await this.messageService.getMessageLogs(
                parseInt(user_id),
                parseInt(place_id),
                { from_date: new Date(Date.now() - 24 * 60 * 60 * 1000) }, // Last 24 hours
                1,
                10
            );

            // Get session status
            const sessionStatus = await this.whatsAppService.getSessionStatus(
                parseInt(user_id),
                parseInt(place_id)
            );

            const status = {
                session_ready: sessionStatus.session_exists && sessionStatus.status === 'ready',
                session_status: sessionStatus.status,
                can_send_messages: sessionStatus.session_exists && ['ready', 'connected'].includes(sessionStatus.status),
                recent_messages: recentLogs.logs || [],
                last_activity: sessionStatus.last_activity
            };

            return ApiResponse.success(res, status, 'Message status retrieved successfully');
        } catch (error) {
            this.logger.error('Error getting message status:', error);
            return ApiResponse.error(res, error.message, 500);
        }
    }

    /**
     * Schedule message (placeholder for future implementation)
     */
    async scheduleMessage(req, res) {
        try {
            const { user_id, place_id, recipients, message, scheduled_time } = req.body;

            // Validation
            if (!user_id || !place_id || !recipients || !message || !scheduled_time) {
                return ApiResponse.error(res, 'Missing required fields: user_id, place_id, recipients, message, scheduled_time', 400);
            }

            // This would be implemented with a job queue like Bull or Agenda
            const scheduledMessage = {
                id: `scheduled_${Date.now()}`,
                user_id: parseInt(user_id),
                place_id: parseInt(place_id),
                recipients,
                message,
                scheduled_time: new Date(scheduled_time),
                status: 'scheduled',
                created_at: new Date()
            };

            // For now, just return a placeholder response
            return ApiResponse.success(res, scheduledMessage, 'Message scheduled successfully (placeholder implementation)');
        } catch (error) {
            this.logger.error('Error scheduling message:', error);
            return ApiResponse.error(res, error.message, 500);
        }
    }
}

module.exports = MessageController;