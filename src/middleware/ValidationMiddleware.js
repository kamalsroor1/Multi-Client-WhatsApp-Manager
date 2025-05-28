const ApiResponse = require('../utils/ApiResponse');
const Logger = require('../utils/Logger');

/**
 * Validation middleware for input validation
 */
class ValidationMiddleware {
    constructor() {
        this.logger = new Logger('ValidationMiddleware');
    }

    /**
     * Validate required user and place IDs
     */
    validateUserPlace = (req, res, next) => {
        const { user_id, place_id } = req.method === 'GET' ? req.query : req.body;

        if (!user_id || !place_id) {
            this.logger.warn('Missing user_id or place_id', { method: req.method, path: req.path });
            return ApiResponse.error(res, 'user_id and place_id are required', 400);
        }

        // Validate that they are numbers
        if (isNaN(parseInt(user_id)) || isNaN(parseInt(place_id))) {
            this.logger.warn('Invalid user_id or place_id format', { user_id, place_id });
            return ApiResponse.error(res, 'user_id and place_id must be valid numbers', 400);
        }

        next();
    }

    /**
     * Validate message content
     */
    validateMessage = (req, res, next) => {
        const { message, image_url } = req.body;

        if (!message && !image_url) {
            this.logger.warn('No message content provided');
            return ApiResponse.error(res, 'Either message or image_url is required', 400);
        }

        next();
    }

    /**
     * Validate image URL format
     */
    validateImageUrl = (req, res, next) => {
        const { image_url } = req.body;
        
        if (image_url) {
            try {
                const url = new URL(image_url);
                if (!['http:', 'https:'].includes(url.protocol)) {
                    this.logger.warn('Invalid image URL protocol', { image_url });
                    return ApiResponse.error(res, 'Invalid image URL protocol. Only HTTP and HTTPS are allowed.', 400);
                }
            } catch (error) {
                this.logger.warn('Invalid image URL format', { image_url, error: error.message });
                return ApiResponse.error(res, 'Invalid image URL format.', 400);
            }
        }
        
        next();
    }

    /**
     * Validate bulk message recipients
     */
    validateBulkRecipients = (req, res, next) => {
        const { recipients } = req.body;

        if (!recipients || !Array.isArray(recipients)) {
            this.logger.warn('Invalid recipients format');
            return ApiResponse.error(res, 'recipients array is required', 400);
        }

        if (recipients.length === 0) {
            this.logger.warn('Empty recipients array');
            return ApiResponse.error(res, 'recipients array cannot be empty', 400);
        }

        // Validate each recipient
        for (let i = 0; i < recipients.length; i++) {
            const recipient = recipients[i];
            if (!recipient.contact_id && !recipient.number) {
                this.logger.warn(`Invalid recipient at index ${i}`, { recipient });
                return ApiResponse.error(res, `Recipient at index ${i} must have either contact_id or number`, 400);
            }
        }

        next();
    }

    /**
     * Validate group creation data
     */
    validateGroupCreation = (req, res, next) => {
        const { name, contact_ids } = req.body;

        if (!name || typeof name !== 'string' || name.trim().length === 0) {
            this.logger.warn('Invalid group name');
            return ApiResponse.error(res, 'Group name is required and must be a non-empty string', 400);
        }

        if (!contact_ids || !Array.isArray(contact_ids) || contact_ids.length === 0) {
            this.logger.warn('Invalid contact_ids for group creation');
            return ApiResponse.error(res, 'contact_ids array is required and cannot be empty', 400);
        }

        next();
    }

    /**
     * Validate group update data
     */
    validateGroupUpdate = (req, res, next) => {
        const { contact_ids } = req.body;

        if (!contact_ids || !Array.isArray(contact_ids)) {
            this.logger.warn('Invalid contact_ids for group update');
            return ApiResponse.error(res, 'contact_ids array is required', 400);
        }

        next();
    }

    /**
     * Validate pagination parameters
     */
    validatePagination = (req, res, next) => {
        const { page, limit } = req.query;

        if (page && (isNaN(parseInt(page)) || parseInt(page) < 1)) {
            this.logger.warn('Invalid page parameter', { page });
            return ApiResponse.error(res, 'page must be a positive number', 400);
        }

        if (limit && (isNaN(parseInt(limit)) || parseInt(limit) < 1 || parseInt(limit) > 100)) {
            this.logger.warn('Invalid limit parameter', { limit });
            return ApiResponse.error(res, 'limit must be a number between 1 and 100', 400);
        }

        next();
    }

    /**
     * Validate contact ID parameter
     */
    validateContactId = (req, res, next) => {
        const { contact_id } = req.params;

        if (!contact_id || typeof contact_id !== 'string' || contact_id.trim().length === 0) {
            this.logger.warn('Invalid contact_id parameter', { contact_id });
            return ApiResponse.error(res, 'Valid contact_id is required', 400);
        }

        next();
    }

    /**
     * Validate group ID parameter
     */
    validateGroupId = (req, res, next) => {
        const { group_id } = req.params;

        if (!group_id || typeof group_id !== 'string' || group_id.trim().length === 0) {
            this.logger.warn('Invalid group_id parameter', { group_id });
            return ApiResponse.error(res, 'Valid group_id is required', 400);
        }

        next();
    }
}

module.exports = ValidationMiddleware;
