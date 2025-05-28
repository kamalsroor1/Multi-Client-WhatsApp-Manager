const WhatsAppService = require('../services/whatsapp/WhatsAppService');
const ContactService = require('../services/contact/ContactService');
const MessageService = require('../services/message/MessageService');
const ApiResponse = require('../utils/ApiResponse');
const Logger = require('../utils/Logger');

/**
 * Controller for WhatsApp operations
 * Implements Controller pattern for HTTP request handling
 */
class WhatsAppController {
    constructor() {
        this.whatsAppService = new WhatsAppService();
        this.contactService = new ContactService();
        this.messageService = new MessageService();
        this.logger = new Logger('WhatsAppController');
    }

    /**
     * Initialize WhatsApp session
     */
    async initializeSession(req, res) {
        try {
            const { user_id, place_id } = req.body;
            
            this.logger.info(`Initializing WhatsApp session for user ${user_id}, place ${place_id}`);
            
            const result = await this.whatsAppService.initializeClient(
                parseInt(user_id), 
                parseInt(place_id)
            );
            
            return ApiResponse.success(res, result, 'Session initialization started successfully');
        } catch (error) {
            this.logger.error('Error initializing WhatsApp session:', error);
            return ApiResponse.error(res, error.message, 500);
        }
    }

    /**
     * Get session status
     */
    async getSessionStatus(req, res) {
        try {
            const { user_id, place_id } = req.query;
            
            const status = await this.whatsAppService.getSessionStatus(
                parseInt(user_id), 
                parseInt(place_id)
            );

            return ApiResponse.success(res, status);
        } catch (error) {
            this.logger.error('Error getting session status:', error);
            return ApiResponse.error(res, error.message, 500);
        }
    }

    /**
     * Get contact fetching progress
     */
    async getContactProgress(req, res) {
        try {
            const { user_id, place_id } = req.query;

            const status = await this.whatsAppService.getSessionStatus(
                parseInt(user_id), 
                parseInt(place_id)
            );

            if (!status.session_exists) {
                return ApiResponse.error(res, 'No session found', 404);
            }

            const progressData = {
                session_id: status.session_id,
                status: status.status,
                contacts_fetch_progress: status.contacts_fetch_progress,
                contacts_fetch_completed: status.contacts_fetch_completed,
                contacts_fetch_error: status.contacts_fetch_error,
                total_contacts: status.total_contacts,
                total_groups: status.total_groups,
                last_contacts_sync: status.last_contacts_sync,
                is_fetching: status.status === 'fetching_contacts'
            };

            return ApiResponse.success(res, progressData);
        } catch (error) {
            this.logger.error('Error getting contact progress:', error);
            return ApiResponse.error(res, error.message, 500);
        }
    }

    /**
     * Start background contact fetch manually
     */
    async startContactFetch(req, res) {
        try {
            const { user_id, place_id } = req.body;
            
            this.logger.info(`Starting manual contact fetch for user ${user_id}, place ${place_id}`);
            
            const result = await this.whatsAppService.startBackgroundContactFetch(
                parseInt(user_id), 
                parseInt(place_id)
            );
            
            return ApiResponse.success(res, result, 'Background contact fetch started successfully');
        } catch (error) {
            this.logger.error('Error starting contact fetch:', error);
            return ApiResponse.error(res, error.message, 500);
        }
    }

    /**
     * Logout session
     */
    async logout(req, res) {
        try {
            const { user_id, place_id } = req.body;
            
            const result = await this.whatsAppService.logout(
                parseInt(user_id), 
                parseInt(place_id)
            );

            return ApiResponse.success(res, result, 'Session logged out successfully');
        } catch (error) {
            this.logger.error('Error during logout:', error);
            return ApiResponse.error(res, error.message, 500);
        }
    }

    /**
     * Test image URL validity
     */
    async testImageUrl(req, res) {
        try {
            const { image_url } = req.body;
            
            const result = await this.messageService.testImageUrl(image_url);
            
            if (result.success) {
                return ApiResponse.success(res, result, 'Image URL is valid');
            } else {
                return ApiResponse.error(res, result.error, 400, result.details);
            }
        } catch (error) {
            this.logger.error('Error testing image URL:', error);
            return ApiResponse.error(res, error.message, 500);
        }
    }

    /**
     * Get service statistics
     */
    async getServiceStats(req, res) {
        try {
            const stats = this.whatsAppService.getStats();
            
            return ApiResponse.success(res, {
                ...stats,
                uptime: process.uptime(),
                memory_usage: process.memoryUsage(),
                node_version: process.version,
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            this.logger.error('Error getting service stats:', error);
            return ApiResponse.error(res, error.message, 500);
        }
    }

    /**
     * Health check
     */
    async healthCheck(req, res) {
        try {
            const stats = this.whatsAppService.getStats();
            
            const healthData = {
                status: 'healthy',
                message: 'WhatsApp Integration Service is running',
                timestamp: new Date().toISOString(),
                version: '2.0.0',
                uptime_seconds: Math.floor(process.uptime()),
                active_sessions: stats.total_active_clients,
                features: {
                    image_support: 'URL-based',
                    bulk_messaging: true,
                    group_management: true,
                    contact_search: true,
                    background_contact_fetching: 'ON DEMAND',
                    clean_architecture: true,
                    error_handling: true,
                    logging: true,
                    validation: true
                },
                environment: {
                    node_version: process.version,
                    platform: process.platform,
                    arch: process.arch
                }
            };

            return ApiResponse.success(res, healthData);
        } catch (error) {
            this.logger.error('Error in health check:', error);
            return ApiResponse.error(res, 'Service unhealthy', 503, {
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }
    }

    /**
     * Restart session (logout and re-initialize)
     */
    async restartSession(req, res) {
        try {
            const { user_id, place_id } = req.body;
            
            this.logger.info(`Restarting session for user ${user_id}, place ${place_id}`);
            
            // First logout existing session
            try {
                await this.whatsAppService.logout(
                    parseInt(user_id), 
                    parseInt(place_id)
                );
            } catch (logoutError) {
                this.logger.warn('Error during logout in restart:', logoutError);
                // Continue with initialization even if logout fails
            }
            
            // Wait a bit before re-initializing
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Initialize new session
            const result = await this.whatsAppService.initializeClient(
                parseInt(user_id), 
                parseInt(place_id)
            );
            
            return ApiResponse.success(res, result, 'Session restarted successfully');
        } catch (error) {
            this.logger.error('Error restarting session:', error);
            return ApiResponse.error(res, error.message, 500);
        }
    }

    /**
     * Get session info with detailed status
     */
    async getSessionInfo(req, res) {
        try {
            const { user_id, place_id } = req.query;
            
            const status = await this.whatsAppService.getSessionStatus(
                parseInt(user_id), 
                parseInt(place_id)
            );

            if (!status.session_exists) {
                return ApiResponse.error(res, 'No session found', 404);
            }

            // Get additional statistics if session is active
            let additionalInfo = {};
            if (status.status === 'connected' || status.status === 'ready') {
                try {
                    const contactStats = await this.contactService.getContactStatistics(
                        parseInt(user_id), 
                        parseInt(place_id)
                    );
                    additionalInfo.contact_statistics = contactStats;
                } catch (statsError) {
                    this.logger.warn('Error getting contact statistics:', statsError);
                }
            }

            const sessionInfo = {
                ...status,
                ...additionalInfo,
                session_health: this.getSessionHealth(status),
                recommendations: this.getSessionRecommendations(status)
            };

            return ApiResponse.success(res, sessionInfo);
        } catch (error) {
            this.logger.error('Error getting session info:', error);
            return ApiResponse.error(res, error.message, 500);
        }
    }

    /**
     * Get session health status
     */
    getSessionHealth(status) {
        if (!status.session_exists) {
            return { status: 'not_initialized', score: 0 };
        }

        let score = 0;
        let issues = [];

        // Check session status
        if (status.status === 'connected' || status.status === 'ready') {
            score += 40;
        } else if (status.status === 'authenticated') {
            score += 30;
        } else if (status.status === 'qr_ready') {
            score += 20;
        } else if (status.status === 'error') {
            issues.push('Session has errors');
        }

        // Check contact sync
        if (status.contacts_fetch_completed) {
            score += 30;
        } else if (status.contacts_fetch_progress > 0) {
            score += 15;
        } else if (status.contacts_fetch_error) {
            issues.push('Contact fetching failed');
        }

        // Check recent activity
        if (status.last_activity) {
            const timeSinceActivity = Date.now() - new Date(status.last_activity).getTime();
            if (timeSinceActivity < 24 * 60 * 60 * 1000) { // Less than 24 hours
                score += 20;
            } else if (timeSinceActivity < 7 * 24 * 60 * 60 * 1000) { // Less than 7 days
                score += 10;
            } else {
                issues.push('No recent activity');
            }
        }

        // Check contacts and groups
        if (status.total_contacts > 0) {
            score += 10;
        }

        return {
            status: score >= 80 ? 'excellent' : score >= 60 ? 'good' : score >= 40 ? 'fair' : 'poor',
            score: Math.min(score, 100),
            issues
        };
    }

    /**
     * Get session recommendations
     */
    getSessionRecommendations(status) {
        const recommendations = [];

        if (!status.session_exists) {
            recommendations.push('Initialize a new WhatsApp session to get started');
            return recommendations;
        }

        if (status.status === 'qr_ready') {
            recommendations.push('Scan the QR code with your WhatsApp mobile app to authenticate');
        }

        if (status.status === 'error') {
            recommendations.push('Restart the session to resolve authentication issues');
        }

        if (status.contacts_fetch_error) {
            recommendations.push('Use the contact fetch API to re-sync contacts');
        }

        if (status.total_contacts === 0 && status.status === 'ready') {
            recommendations.push('Use the contact fetch API to start contact synchronization');
        }

        if (status.last_activity) {
            const timeSinceActivity = Date.now() - new Date(status.last_activity).getTime();
            if (timeSinceActivity > 7 * 24 * 60 * 60 * 1000) {
                recommendations.push('Consider restarting the session due to inactivity');
            }
        }

        if (recommendations.length === 0) {
            recommendations.push('Session is healthy and ready for messaging');
        }

        return recommendations;
    }
}

module.exports = WhatsAppController;
