const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const fs = require('fs');
const path = require('path');
const Logger = require('../../utils/Logger');

/**
 * Factory for creating and managing WhatsApp clients
 * Implements Factory Pattern for client creation
 */
class WhatsAppClientFactory {
    constructor() {
        this.clients = new Map(); // sessionId => { client, sessionData }
        this.logger = new Logger('WhatsAppClientFactory');
    }

    /**
     * Generate unique session ID
     */
    generateSessionId(userId, placeId) {
        return `session_${userId}_${placeId}_${Date.now()}`;
    }

    /**
     * Create new WhatsApp client instance
     */
    async createClient(sessionId) {
        try {
            this.logger.info(`Creating new WhatsApp client for session: ${sessionId}`);

            const authPath = path.join(__dirname, '../../../.wwebjs_auth', `session-${sessionId}`);

            const client = new Client({
                authStrategy: new LocalAuth({ clientId: sessionId }),
                puppeteer: { 
                    headless: true,
                    args: [
                        '--no-sandbox', 
                        '--disable-setuid-sandbox',
                        '--disable-dev-shm-usage',
                        '--disable-accelerated-2d-canvas',
                        '--no-first-run',
                        '--no-zygote',
                        '--disable-gpu'
                    ] 
                }
            });

            return client;
        } catch (error) {
            this.logger.error(`Error creating client for session ${sessionId}:`, error);
            throw new Error(`Failed to create WhatsApp client: ${error.message}`);
        }
    }

    /**
     * Setup client event handlers
     */
    setupClientEventHandlers(client, sessionId, eventHandlers = {}) {
        this.logger.info(`Setting up event handlers for session: ${sessionId}`);

        // QR Code event
        client.on('qr', async (qr) => {
            try {
                this.logger.info(`QR code generated for session: ${sessionId}`);
                const qrDataURL = await qrcode.toDataURL(qr);
                if (eventHandlers.onQR) {
                    await eventHandlers.onQR(qrDataURL);
                }
            } catch (error) {
                this.logger.error(`Error generating QR for ${sessionId}:`, error);
            }
        });

        // Authentication events
        client.on('authenticated', async () => {
            try {
                this.logger.success(`Session ${sessionId} authenticated`);
                if (eventHandlers.onAuthenticated) {
                    await eventHandlers.onAuthenticated();
                }
            } catch (error) {
                this.logger.error(`Error in authenticated event for ${sessionId}:`, error);
            }
        });

        client.on('loading_screen', async () => {
            try {
                this.logger.info(`Session ${sessionId} loading screen`);
                if (eventHandlers.onLoadingScreen) {
                    await eventHandlers.onLoadingScreen();
                }
            } catch (error) {
                this.logger.error(`Error in loading_screen event for ${sessionId}:`, error);
            }
        });

        // Ready event
        client.on('ready', async () => {
            try {
                this.logger.success(`Session ${sessionId} is ready!`);
                const clientInfo = client.info;
                if (eventHandlers.onReady) {
                    await eventHandlers.onReady(clientInfo);
                }
            } catch (error) {
                this.logger.error(`Error in ready event for ${sessionId}:`, error);
            }
        });

        // Error events
        client.on('auth_failure', async (message) => {
            try {
                this.logger.error(`Auth failure for ${sessionId}:`, { message });
                if (eventHandlers.onAuthFailure) {
                    await eventHandlers.onAuthFailure(message);
                }
                await this.cleanupClient(sessionId);
            } catch (error) {
                this.logger.error(`Error handling auth failure for ${sessionId}:`, error);
            }
        });

        client.on('disconnected', async (reason) => {
            try {
                this.logger.warn(`Session ${sessionId} disconnected:`, { reason });
                if (eventHandlers.onDisconnected) {
                    await eventHandlers.onDisconnected(reason);
                }
                await this.cleanupClient(sessionId);
            } catch (error) {
                this.logger.error(`Error handling disconnect for ${sessionId}:`, error);
            }
        });

        // Message events
        client.on('message', async (message) => {
            try {
                if (eventHandlers.onMessage) {
                    await eventHandlers.onMessage(message);
                }
            } catch (error) {
                this.logger.error(`Error handling message for ${sessionId}:`, error);
            }
        });

        // Message acknowledgment events
        client.on('message_ack', async (message, ack) => {
            try {
                if (eventHandlers.onMessageAck) {
                    await eventHandlers.onMessageAck(message, ack);
                }
            } catch (error) {
                this.logger.error(`Error handling message ack for ${sessionId}:`, error);
            }
        });

        // Contact events
        client.on('contact_changed', async (message, oldId, newId, isContact) => {
            try {
                if (eventHandlers.onContactChanged) {
                    await eventHandlers.onContactChanged(message, oldId, newId, isContact);
                }
            } catch (error) {
                this.logger.error(`Error handling contact change for ${sessionId}:`, error);
            }
        });

        // Group events
        client.on('group_join', async (notification) => {
            try {
                if (eventHandlers.onGroupJoin) {
                    await eventHandlers.onGroupJoin(notification);
                }
            } catch (error) {
                this.logger.error(`Error handling group join for ${sessionId}:`, error);
            }
        });

        client.on('group_leave', async (notification) => {
            try {
                if (eventHandlers.onGroupLeave) {
                    await eventHandlers.onGroupLeave(notification);
                }
            } catch (error) {
                this.logger.error(`Error handling group leave for ${sessionId}:`, error);
            }
        });

        // State change events
        client.on('change_state', async (state) => {
            try {
                this.logger.info(`Session ${sessionId} state changed to: ${state}`);
                if (eventHandlers.onStateChange) {
                    await eventHandlers.onStateChange(state);
                }
            } catch (error) {
                this.logger.error(`Error handling state change for ${sessionId}:`, error);
            }
        });

        return client;
    }

    /**
     * Store client in memory
     */
    storeClient(sessionId, client, sessionData) {
        this.clients.set(sessionId, { 
            client, 
            sessionData,
            createdAt: new Date(),
            lastActivity: new Date()
        });
        this.logger.info(`Client stored for session: ${sessionId}`);
    }

    /**
     * Get client by session ID
     */
    getClient(sessionId) {
        const clientData = this.clients.get(sessionId);
        if (clientData) {
            // Update last activity
            clientData.lastActivity = new Date();
            return clientData.client;
        }
        return null;
    }

    /**
     * Get client data by session ID
     */
    getClientData(sessionId) {
        return this.clients.get(sessionId) || null;
    }

    /**
     * Check if client exists
     */
    hasClient(sessionId) {
        return this.clients.has(sessionId);
    }

    /**
     * Check if client is ready
     */
    async isClientReady(sessionId) {
        const client = this.getClient(sessionId);
        if (!client) {
            return false;
        }

        try {
            const state = await client.getState();
            return state === 'CONNECTED';
        } catch (error) {
            this.logger.warn(`Error checking client state for ${sessionId}:`, error);
            return false;
        }
    }

    /**
     * Remove client from memory
     */
    removeClient(sessionId) {
        if (this.clients.has(sessionId)) {
            this.clients.delete(sessionId);
            this.logger.info(`Client removed from memory for session: ${sessionId}`);
            return true;
        }
        return false;
    }

    /**
     * Cleanup client and associated files
     */
    async cleanupClient(sessionId) {
        try {
            this.logger.start(`Cleaning up client for session: ${sessionId}`);

            // Get client and destroy it first
            const clientData = this.clients.get(sessionId);
            if (clientData && clientData.client) {
                try {
                    await clientData.client.destroy();
                    this.logger.info(`Client destroyed for session: ${sessionId}`);
                } catch (error) {
                    this.logger.warn(`Error destroying client for ${sessionId}:`, error);
                }
            }

            // Remove from memory
            this.removeClient(sessionId);

            // Remove auth files
            const authPath = path.join(__dirname, '../../../.wwebjs_auth', `session-${sessionId}`);
            if (fs.existsSync(authPath)) {
                fs.rmSync(authPath, { recursive: true, force: true });
                this.logger.info(`Deleted session folder for ${sessionId}`);
            }

            this.logger.success(`Client cleanup completed for session: ${sessionId}`);
            return true;
        } catch (error) {
            this.logger.error(`Error cleaning up session ${sessionId}:`, error);
            throw error;
        }
    }

    /**
     * Get all active sessions
     */
    getActiveSessions() {
        return Array.from(this.clients.keys());
    }

    /**
     * Get session info
     */
    getSessionInfo(sessionId) {
        const clientData = this.getClientData(sessionId);
        if (!clientData) {
            return null;
        }

        return {
            sessionId,
            createdAt: clientData.createdAt,
            lastActivity: clientData.lastActivity,
            sessionData: clientData.sessionData,
            isActive: true
        };
    }

    /**
     * Get all sessions info
     */
    getAllSessionsInfo() {
        const sessions = [];
        for (const sessionId of this.clients.keys()) {
            const info = this.getSessionInfo(sessionId);
            if (info) {
                sessions.push(info);
            }
        }
        return sessions;
    }

    /**
     * Get client statistics
     */
    getStats() {
        return {
            total_active_clients: this.clients.size,
            active_sessions: this.getActiveSessions(),
            sessions_info: this.getAllSessionsInfo()
        };
    }

    /**
     * Clean up inactive sessions
     */
    async cleanupInactiveSessions(maxInactiveHours = 24) {
        const now = new Date();
        const maxInactiveTime = maxInactiveHours * 60 * 60 * 1000; // Convert to milliseconds
        const sessionsToCleanup = [];

        for (const [sessionId, clientData] of this.clients) {
            const inactiveTime = now - clientData.lastActivity;
            if (inactiveTime > maxInactiveTime) {
                sessionsToCleanup.push(sessionId);
            }
        }

        this.logger.info(`Cleaning up ${sessionsToCleanup.length} inactive sessions`);

        for (const sessionId of sessionsToCleanup) {
            try {
                await this.cleanupClient(sessionId);
            } catch (error) {
                this.logger.error(`Error cleaning up inactive session ${sessionId}:`, error);
            }
        }

        return sessionsToCleanup.length;
    }

    /**
     * Gracefully shutdown all clients
     */
    async shutdownAllClients() {
        this.logger.info('Shutting down all WhatsApp clients...');
        
        const shutdownPromises = [];
        for (const [sessionId, { client }] of this.clients) {
            shutdownPromises.push(
                client.destroy().catch(error => 
                    this.logger.error(`Error destroying client ${sessionId}:`, error)
                )
            );
        }

        await Promise.allSettled(shutdownPromises);
        this.clients.clear();
        
        this.logger.success('All clients shut down successfully');
    }

    /**
     * Restart client
     */
    async restartClient(sessionId) {
        try {
            this.logger.info(`Restarting client for session: ${sessionId}`);
            
            const clientData = this.getClientData(sessionId);
            if (!clientData) {
                throw new Error(`Session ${sessionId} not found`);
            }

            // Store session data
            const sessionData = clientData.sessionData;

            // Cleanup current client
            await this.cleanupClient(sessionId);

            // Create new client
            const newClient = await this.createClient(sessionId);
            
            // Store new client
            this.storeClient(sessionId, newClient, sessionData);

            this.logger.success(`Client restarted for session: ${sessionId}`);
            return newClient;
        } catch (error) {
            this.logger.error(`Error restarting client for ${sessionId}:`, error);
            throw error;
        }
    }
}

module.exports = WhatsAppClientFactory;