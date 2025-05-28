const ApiResponse = require('../utils/ApiResponse');
const Logger = require('../utils/Logger');

/**
 * Error handling middleware
 */
class ErrorMiddleware {
    constructor() {
        this.logger = new Logger('ErrorMiddleware');
    }

    /**
     * Global error handler
     */
    handleError = (error, req, res, next) => {
        this.logger.error('Unhandled error:', error);

        // Default error response
        let statusCode = 500;
        let message = 'Internal server error';

        // Handle specific error types
        if (error.name === 'ValidationError') {
            statusCode = 400;
            message = error.message;
        } else if (error.name === 'CastError') {
            statusCode = 400;
            message = 'Invalid ID format';
        } else if (error.code === 11000) {
            statusCode = 409;
            message = 'Duplicate entry found';
        } else if (error.name === 'MongoError') {
            statusCode = 500;
            message = 'Database error occurred';
        } else if (error.message) {
            message = process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong';
        }

        const details = process.env.NODE_ENV === 'development' ? {
            stack: error.stack,
            name: error.name,
            ...(error.code && { code: error.code })
        } : null;

        return ApiResponse.error(res, message, statusCode, details);
    }

    /**
     * Handle 404 - Route not found
     */
    handle404 = (req, res) => {
        this.logger.warn(`404 - Route not found: ${req.method} ${req.originalUrl}`);
        
        return ApiResponse.error(res, `Route ${req.originalUrl} not found`, 404, {
            method: req.method,
            path: req.originalUrl,
            // available_endpoints: {
            //     'POST /api/whatsapp/init': 'Initialize WhatsApp session',
            //     'GET /api/whatsapp/status': 'Get session status',
            //     'GET /api/whatsapp/contacts/progress': 'Get contact fetching progress',
            //     'GET /api/whatsapp/groups': 'Get user groups',
            //     'GET /api/whatsapp/groups/:group_id/contacts': 'Get contacts by group',
            //     'POST /api/whatsapp/groups': 'Create custom group',
            //     'PUT /api/whatsapp/groups/:group_id/contacts': 'Update group contacts',
            //     'DELETE /api/whatsapp/groups/:group_id': 'Delete group',
            //     'GET /api/whatsapp/contacts/search': 'Search contacts',
            //     'GET /api/whatsapp/contacts/:contact_id': 'Get contact by ID',
            //     'POST /api/whatsapp/send-message': 'Send message to contact',
            //     'POST /api/whatsapp/groups/:group_id/send-message': 'Send message to group',
            //     'POST /api/whatsapp/send-bulk-messages': 'Send bulk messages',
            //     'GET /api/whatsapp/messages': 'Get message logs',
            //     'POST /api/whatsapp/logout': 'Logout session',
            //     'POST /api/whatsapp/test-image-url': 'Test image URL validity',
            //     'GET /api/health': 'Health check'
            // }
        });
    }

    /**
     * Async error wrapper - wraps async functions to catch errors
     */
    asyncHandler = (fn) => {
        return (req, res, next) => {
            Promise.resolve(fn(req, res, next)).catch(next);
        };
    }

    /**
     * Rate limiting error handler
     */
    handleRateLimit = (req, res) => {
        this.logger.warn(`Rate limit exceeded for ${req.ip}`);
        return ApiResponse.error(res, 'Too many requests, please try again later', 429, {
            retryAfter: '60 seconds',
            ip: req.ip
        });
    }

    /**
     * Handle timeout errors
     */
    handleTimeout = (req, res) => {
        this.logger.warn(`Request timeout for ${req.method} ${req.path}`);
        return ApiResponse.error(res, 'Request timeout', 408);
    }

    /**
     * Handle payload too large errors
     */
    handlePayloadTooLarge = (req, res) => {
        this.logger.warn(`Payload too large for ${req.method} ${req.path}`);
        return ApiResponse.error(res, 'Payload too large', 413);
    }

    /**
     * Handle authentication errors
     */
    handleAuthError = (req, res) => {
        this.logger.warn(`Authentication failed for ${req.path}`);
        return ApiResponse.error(res, 'Authentication required', 401);
    }

    /**
     * Handle authorization errors
     */
    handleAuthorizationError = (req, res) => {
        this.logger.warn(`Authorization failed for ${req.path}`);
        return ApiResponse.error(res, 'Insufficient permissions', 403);
    }
}

module.exports = ErrorMiddleware;
