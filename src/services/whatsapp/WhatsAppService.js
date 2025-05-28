const WhatsAppSession = require('../../models/WhatsAppSession');
const WhatsAppClientFactory = require('./WhatsAppClientFactory');
const ContactFetchingService = require('../contact/ContactFetchingService');
const Logger = require('../../utils/Logger');

/**
 * Main WhatsApp service for session management
 * Implements Facade pattern to provide simple interface
 */
class WhatsAppService {
    constructor() {
        this.clientFactory = new WhatsAppClientFactory();
        this.contactFetchingService = new ContactFetchingService();
        this.logger = new Logger('WhatsAppService');
    }

    /**
     * Initialize WhatsApp client for user
     */
    async initializeClient(userId, placeId) {
        try {
            this.logger.start(`Initializing WhatsApp client for user ${userId}, place ${placeId}`);
            
            // Check if session already exists and is active
            const existingSession = await this.findActiveSession(userId, placeId);
            if (existingSession && this.clientFactory.hasClient(existingSession.session_id)) {
                this.logger.info(`Active session found: ${existingSession.session_id}`);
                return {
                    success: true,
                    session_id: existingSession.session_id,
                    status: existingSession.status,
                    message: 'Session already active'
                };
            }

            // Generate new session
            const sessionId = this.clientFactory.generateSessionId(userId, placeId);
            
            // Create session record
            const sessionData = await this.createSessionRecord(userId, placeId, sessionId);
            
            // Create WhatsApp client
            const client = await this.clientFactory.createClient(sessionId);
            
            // Setup event handlers
            const eventHandlers = this.createEventHandlers(sessionData);
            this.clientFactory.setupClientEventHandlers(client, sessionId, eventHandlers);
            
            // Store client
            this.clientFactory.storeClient(sessionId, client, sessionData);
            
            // Initialize client
            client.initialize();
            
            this.logger.success(`WhatsApp client initialized: ${sessionId}`);
            
            return {
                success: true,
                session_id: sessionId,
                status: 'initializing',
                message: 'Client initialization started'
            };
            
        } catch (error) {
            this.logger.error('Error initializing WhatsApp client:', error);
            throw new Error(`Failed to initialize WhatsApp client: ${error.message}`);
        }
    }

    /**
     * Get session status
     */
    async getSessionStatus(userId, placeId) {
        try {
            const sessionData = await WhatsAppSession.findOne({ 
                user_id: userId, 
                place_id: placeId 
            }).sort({ created_at: -1 });

            if (!sessionData) {
                return { 
                    status: 'not_initialized', 
                    session_exists: false,
                    message: 'No session found'
                };
            }

            // Check if client is actually ready
            const isClientReady = await this.clientFactory.isClientReady(sessionData.session_id);
            
            return {
                session_id: sessionData.session_id,
                status: sessionData.status,
                client_ready: isClientReady,
                qr_code: sessionData.qr_code,
                phone_number: sessionData.phone_number,
                name: sessionData.name,
                connected_at: sessionData.connected_at,
                session_exists: true,
                total_contacts: sessionData.total_contacts || 0,
                total_groups: sessionData.total_groups || 0,
                last_contacts_sync: sessionData.last_contacts_sync,
                contacts_fetch_progress: sessionData.contacts_fetch_progress || 0,
                contacts_fetch_completed: sessionData.contacts_fetch_completed || false,
                contacts_fetch_error: sessionData.contacts_fetch_error || null,
                last_activity: sessionData.last_activity,
                created_at: sessionData.created_at,
                updated_at: sessionData.updated_at
            };
        } catch (error) {
            this.logger.error('Error getting session status:', error);
            throw new Error(`Failed to get session status: ${error.message}`);
        }
    }

    /**
     * Send message through WhatsApp
     */
    async sendMessage(userId, placeId, phoneNumber, message, options = {}) {
        try {
            this.logger.info(`Sending message for user ${userId}, place ${placeId} to ${phoneNumber}`);
            
            const { client, sessionData } = await this.getClientByCredentials(userId, placeId);
            
            // Format phone number
            const chatId = phoneNumber.includes('@c.us') ? phoneNumber : `${phoneNumber}@c.us`;
            
            // Send message
            const sentMessage = await client.sendMessage(chatId, message, options);
            
            // Update session activity
            await this.updateSessionActivity(sessionData.session_id);
            
            this.logger.success(`Message sent successfully to ${phoneNumber}`);
            
            return {
                success: true,
                message_id: sentMessage.id._serialized,
                timestamp: sentMessage.timestamp,
                to: phoneNumber,
                message: message
            };
            
        } catch (error) {
            this.logger.error(`Error sending message to ${phoneNumber}:`, error);
            throw new Error(`Failed to send message: ${error.message}`);
        }
    }

    /**
     * Send media message
     */
    async sendMediaMessage(userId, placeId, phoneNumber, media, caption = '', options = {}) {
        try {
            this.logger.info(`Sending media message for user ${userId}, place ${placeId} to ${phoneNumber}`);
            
            const { client, sessionData } = await this.getClientByCredentials(userId, placeId);
            
            // Format phone number
            const chatId = phoneNumber.includes('@c.us') ? phoneNumber : `${phoneNumber}@c.us`;
            
            // Prepare media object
            const mediaMessage = {
                media: media,
                caption: caption,
                ...options
            };
            
            // Send media message
            const sentMessage = await client.sendMessage(chatId, mediaMessage);
            
            // Update session activity
            await this.updateSessionActivity(sessionData.session_id);
            
            this.logger.success(`Media message sent successfully to ${phoneNumber}`);
            
            return {
                success: true,
                message_id: sentMessage.id._serialized,
                timestamp: sentMessage.timestamp,
                to: phoneNumber,
                type: 'media',
                caption: caption
            };
            
        } catch (error) {
            this.logger.error(`Error sending media message to ${phoneNumber}:`, error);
            throw new Error(`Failed to send media message: ${error.message}`);
        }
    }

    /**
     * Get chat messages
     */
    async getChatMessages(userId, placeId, phoneNumber, limit = 50) {
        try {
            const { client, sessionData } = await this.getClientByCredentials(userId, placeId);
            
            const chatId = phoneNumber.includes('@c.us') ? phoneNumber : `${phoneNumber}@c.us`;
            const chat = await client.getChatById(chatId);
            const messages = await chat.fetchMessages({ limit });
            
            // Update session activity
            await this.updateSessionActivity(sessionData.session_id);
            
            return {
                success: true,
                chat_id: chatId,
                messages: messages.map(msg => ({
                    id: msg.id._serialized,
                    body: msg.body,
                    type: msg.type,
                    timestamp: msg.timestamp,
                    from: msg.from,
                    to: msg.to,
                    fromMe: msg.fromMe,
                    hasMedia: msg.hasMedia
                }))
            };
            
        } catch (error) {
            this.logger.error(`Error getting chat messages for ${phoneNumber}:`, error);
            throw new Error(`Failed to get chat messages: ${error.message}`);
        }
    }

    /**
     * Get all chats
     */
    async getAllChats(userId, placeId) {
        try {
            const { client, sessionData } = await this.getClientByCredentials(userId, placeId);
            
            const chats = await client.getChats();
            
            // Update session activity
            await this.updateSessionActivity(sessionData.session_id);
            
            return {
                success: true,
                chats: chats.map(chat => ({
                    id: chat.id._serialized,
                    name: chat.name,
                    isGroup: chat.isGroup,
                    isReadOnly: chat.isReadOnly,
                    unreadCount: chat.unreadCount,
                    timestamp: chat.timestamp,
                    lastMessage: chat.lastMessage ? {
                        body: chat.lastMessage.body,
                        type: chat.lastMessage.type,
                        timestamp: chat.lastMessage.timestamp,
                        fromMe: chat.lastMessage.fromMe
                    } : null
                }))
            };
            
        } catch (error) {
            this.logger.error('Error getting all chats:', error);
            throw new Error(`Failed to get chats: ${error.message}`);
        }
    }

    /**
     * Logout and cleanup session
     */
    async logout(userId, placeId) {
        try {
            this.logger.start(`Logging out session for user ${userId}, place ${placeId}`);
            
            const sessionData = await WhatsAppSession.findOne({ 
                user_id: userId, 
                place_id: placeId 
            }).sort({ created_at: -1 });

            if (!sessionData) {
                throw new Error('No session found to logout');
            }

            const client = this.clientFactory.getClient(sessionData.session_id);
            if (client) {
                try {
                    await client.logout();
                    await client.destroy();
                } catch (clientError) {
                    this.logger.warn('Error during client logout:', clientError);
                }
            }

            // Update session status
            sessionData.status = 'disconnected';
            sessionData.updated_at = new Date();
            await sessionData.save();

            // Cleanup client
            await this.clientFactory.cleanupClient(sessionData.session_id);

            this.logger.success(`Session logged out: ${sessionData.session_id}`);
            
            return { 
                success: true, 
                message: 'Session logged out successfully',
                session_id: sessionData.session_id
            };

        } catch (error) {
            this.logger.error('Error during logout:', error);
            throw new Error(`Logout failed: ${error.message}`);
        }
    }

    /**
     * Restart session
     */
    async restartSession(userId, placeId) {
        try {
            this.logger.start(`Restarting session for user ${userId}, place ${placeId}`);
            
            // First logout current session
            await this.logout(userId, placeId);
            
            // Wait a moment for cleanup
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Initialize new session
            const result = await this.initializeClient(userId, placeId);
            
            this.logger.success(`Session restarted for user ${userId}, place ${placeId}`);
            
            return {
                ...result,
                message: 'Session restarted successfully'
            };
            
        } catch (error) {
            this.logger.error(`Error restarting session:`, error);
            throw new Error(`Failed to restart session: ${error.message}`);
        }
    }

    /**
     * Get client by session credentials
     */
    async getClientByCredentials(userId, placeId) {
        const sessionData = await WhatsAppSession.findOne({ 
            user_id: userId, 
            place_id: placeId,
            status: { $in: ['ready', 'connected', 'fetching_contacts'] }
        });

        if (!sessionData) {
            throw new Error('No active session found');
        }

        const client = this.clientFactory.getClient(sessionData.session_id);
        if (!client) {
            throw new Error('Client not available');
        }

        // Check if client is actually ready
        const isReady = await this.clientFactory.isClientReady(sessionData.session_id);
        if (!isReady) {
            throw new Error('Client is not ready');
        }

        return { client, sessionData };
    }

    /**
     * Update session activity timestamp
     */
    async updateSessionActivity(sessionId) {
        try {
            await WhatsAppSession.findOneAndUpdate(
                { session_id: sessionId },
                { 
                    last_activity: new Date(),
                    updated_at: new Date()
                }
            );
        } catch (error) {
            this.logger.warn(`Failed to update session activity for ${sessionId}:`, error);
        }
    }

    /**
     * Find active session for user
     */
    async findActiveSession(userId, placeId) {
        return await WhatsAppSession.findOne({ 
            user_id: userId, 
            place_id: placeId,
            status: { $in: ['authenticated', 'connected', 'ready', 'fetching_contacts'] }
        });
    }

    /**
     * Create session record in database
     */
    async createSessionRecord(userId, placeId, sessionId) {
        try {
            const sessionData = new WhatsAppSession({
                user_id: userId,
                place_id: placeId,
                session_id: sessionId,
                status: 'initializing',
                contacts_fetch_progress: 0,
                contacts_fetch_completed: false,
                created_at: new Date(),
                updated_at: new Date()
            });
            
            await sessionData.save();
            this.logger.info(`Session record created: ${sessionId}`);
            
            return sessionData;
        } catch (error) {
            this.logger.error(`Error creating session record for ${sessionId}:`, error);
            throw error;
        }
    }

    /**
     * Create event handlers for WhatsApp client
     */
    createEventHandlers(sessionData) {
        return {
            onQR: async (qrDataURL) => {
                try {
                    sessionData.qr_code = qrDataURL;
                    sessionData.status = 'qr_ready';
                    sessionData.updated_at = new Date();
                    await sessionData.save();
                    this.logger.info(`QR code ready for session: ${sessionData.session_id}`);
                } catch (error) {
                    this.logger.error(`Error updating QR code for ${sessionData.session_id}:`, error);
                }
            },

            onAuthenticated: async () => {
                try {
                    sessionData.status = 'authenticated';
                    sessionData.qr_code = null;
                    sessionData.updated_at = new Date();
                    await sessionData.save();
                    this.logger.success(`Session authenticated: ${sessionData.session_id}`);
                } catch (error) {
                    this.logger.error(`Error updating authenticated status for ${sessionData.session_id}:`, error);
                }
            },

            onLoadingScreen: async () => {
                try {
                    sessionData.status = 'loading_screen';
                    sessionData.qr_code = null;
                    sessionData.updated_at = new Date();
                    await sessionData.save();
                    this.logger.info(`Loading screen for session: ${sessionData.session_id}`);
                } catch (error) {
                    this.logger.error(`Error updating loading screen status for ${sessionData.session_id}:`, error);
                }
            },

            onReady: async (clientInfo) => {
                try {
                    // Update session with client info
                    sessionData.phone_number = clientInfo.wid.user;
                    sessionData.name = clientInfo.pushname;
                    sessionData.status = 'ready';
                    sessionData.connected_at = new Date();
                    sessionData.qr_code = null;
                    sessionData.updated_at = new Date();
                    await sessionData.save();
                    
                    this.logger.success(`Session ready: ${sessionData.session_id}`);
                    
                    // Start background contact fetching
                    this.startBackgroundContactFetch(sessionData);
                } catch (error) {
                    this.logger.error(`Error updating ready status for ${sessionData.session_id}:`, error);
                }
            },

            onAuthFailure: async (message) => {
                try {
                    sessionData.status = 'error';
                    sessionData.contacts_fetch_error = `Auth failure: ${message}`;
                    sessionData.updated_at = new Date();
                    await sessionData.save();
                    this.logger.error(`Auth failure for session ${sessionData.session_id}:`, { message });
                } catch (error) {
                    this.logger.error(`Error updating auth failure status for ${sessionData.session_id}:`, error);
                }
            },

            onDisconnected: async (reason) => {
                try {
                    sessionData.status = 'disconnected';
                    sessionData.updated_at = new Date();
                    await sessionData.save();
                    this.logger.warn(`Session disconnected ${sessionData.session_id}:`, { reason });
                } catch (error) {
                    this.logger.error(`Error updating disconnected status for ${sessionData.session_id}:`, error);
                }
            },

            onMessage: async (message) => {
                try {
                    // Update last activity when receiving messages
                    await this.updateSessionActivity(sessionData.session_id);
                } catch (error) {
                    this.logger.warn(`Error updating activity on message for ${sessionData.session_id}:`, error);
                }
            }
        };
    }

    /**
     * Start background contact fetching
     */
    async startBackgroundContactFetch(sessionData) {
        try {
            const client = this.clientFactory.getClient(sessionData.session_id);
            if (!client) {
                throw new Error('Client not available for contact fetch');
            }

            this.logger.start(`Background contact fetch for session: ${sessionData.session_id}`);

            // Create progress update callback
            const onProgressUpdate = async (progress) => {
                try {
                    const updateData = {
                        updated_at: new Date()
                    };

                    if (progress.status) updateData.status = progress.status;
                    if (typeof progress.progress === 'number') updateData.contacts_fetch_progress = progress.progress;
                    if (typeof progress.completed === 'boolean') updateData.contacts_fetch_completed = progress.completed;
                    if (progress.error) updateData.contacts_fetch_error = progress.error;
                    if (progress.total) updateData.total_contacts = progress.total;
                    if (progress.completed === true) updateData.last_contacts_sync = new Date();

                    await WhatsAppSession.findOneAndUpdate(
                        { session_id: sessionData.session_id },
                        updateData
                    );
                } catch (error) {
                    this.logger.error(`Error updating contact fetch progress for ${sessionData.session_id}:`, error);
                }
            };

            // Start fetching in background (non-blocking)
            this.contactFetchingService.fetchContactsInBackground(
                client,
                sessionData.user_id,
                sessionData.place_id,
                sessionData.session_id,
                onProgressUpdate
            ).catch(error => {
                this.logger.error(`Background contact fetch failed for ${sessionData.session_id}:`, error);
                // Update error status
                onProgressUpdate({
                    status: 'error',
                    error: error.message,
                    completed: false
                });
            });

        } catch (error) {
            this.logger.error(`Error starting background contact fetch:`, error);
        }
    }

    /**
     * Manual contact sync
     */
    async syncContacts(userId, placeId) {
        try {
            const { client, sessionData } = await this.getClientByCredentials(userId, placeId);
            
            this.logger.start(`Manual contact sync for session: ${sessionData.session_id}`);
            
            // Create progress callback
            const onProgressUpdate = async (progress) => {
                const updateData = {
                    contacts_fetch_progress: progress.progress || 0,
                    contacts_fetch_completed: progress.completed || false,
                    contacts_fetch_error: progress.error || null,
                    updated_at: new Date()
                };
                
                if (progress.total) updateData.total_contacts = progress.total;
                if (progress.completed === true) updateData.last_contacts_sync = new Date();
                
                await WhatsAppSession.findOneAndUpdate(
                    { session_id: sessionData.session_id },
                    updateData
                );
            };
            
            // Start contact fetching
            const result = await this.contactFetchingService.fetchContactsInBackground(
                client,
                sessionData.user_id,
                sessionData.place_id,
                sessionData.session_id,
                onProgressUpdate
            );
            
            return {
                success: true,
                ...result,
                message: 'Contact sync completed successfully'
            };
            
        } catch (error) {
            this.logger.error('Error in manual contact sync:', error);
            throw new Error(`Contact sync failed: ${error.message}`);
        }
    }

    /**
     * Get factory statistics
     */
    getStats() {
        return this.clientFactory.getStats();
    }

    /**
     * Health check for all sessions
     */
    async healthCheck() {
        try {
            const stats = this.getStats();
            const activeSessions = await WhatsAppSession.find({
                status: { $in: ['ready', 'connected', 'fetching_contacts'] }
            });
            
            return {
                service_status: 'healthy',
                active_clients: stats.total_active_clients,
                active_sessions_db: activeSessions.length,
                sessions: stats.active_sessions,
                timestamp: new Date()
            };
        } catch (error) {
            this.logger.error('Health check failed:', error);
            return {
                service_status: 'unhealthy',
                error: error.message,
                timestamp: new Date()
            };
        }
    }

    /**
     * Cleanup inactive sessions
     */
    async cleanupInactiveSessions(maxInactiveHours = 24) {
        try {
            const cleanedCount = await this.clientFactory.cleanupInactiveSessions(maxInactiveHours);
            
            // Also cleanup database records
            const cutoffTime = new Date(Date.now() - (maxInactiveHours * 60 * 60 * 1000));
            const dbCleanup = await WhatsAppSession.updateMany(
                {
                    last_activity: { $lt: cutoffTime },
                    status: { $in: ['ready', 'connected', 'fetching_contacts'] }
                },
                {
                    status: 'inactive',
                    updated_at: new Date()
                }
            );
            
            this.logger.info(`Cleaned up ${cleanedCount} client sessions and ${dbCleanup.modifiedCount} database records`);
            
            return {
                cleaned_clients: cleanedCount,
                cleaned_db_records: dbCleanup.modifiedCount
            };
        } catch (error) {
            this.logger.error('Error cleaning up inactive sessions:', error);
            throw error;
        }
    }

    /**
     * Graceful shutdown
     */
    async shutdown() {
        this.logger.info('Shutting down WhatsApp service...');
        await this.clientFactory.shutdownAllClients();
        this.logger.success('WhatsApp service shut down successfully');
    }
}

module.exports = WhatsAppService;