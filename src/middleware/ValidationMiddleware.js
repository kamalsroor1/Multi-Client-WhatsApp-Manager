const ApiResponse = require('../utils/ApiResponse');
const Logger = require('../utils/Logger');

/**
 * Validation middleware for request validation
 * Implements centralized validation logic
 */
class ValidationMiddleware {
    constructor() {
        this.logger = new Logger('ValidationMiddleware');
    }

    /**
     * Validate user and place parameters
     */
    validateUserPlace(req, res, next) {
        try {
            const { user_id, place_id } = req.method === 'GET' ? req.query : req.body;

            if (!user_id) {
                return ApiResponse.error(res, 'user_id is required', 400);
            }

            if (!place_id) {
                return ApiResponse.error(res, 'place_id is required', 400);
            }

            // Validate that they are valid integers
            if (!Number.isInteger(parseInt(user_id)) || parseInt(user_id) <= 0) {
                return ApiResponse.error(res, 'user_id must be a positive integer', 400);
            }

            if (!Number.isInteger(parseInt(place_id)) || parseInt(place_id) <= 0) {
                return ApiResponse.error(res, 'place_id must be a positive integer', 400);
            }

            next();
        } catch (error) {
            this.logger.error('Error in validateUserPlace:', error);
            return ApiResponse.error(res, 'Invalid user or place parameters', 400);
        }
    }

    /**
     * Validate pagination parameters
     */
    validatePagination(req, res, next) {
        try {
            const { page, limit } = req.query;

            if (page !== undefined) {
                const pageNum = parseInt(page);
                if (!Number.isInteger(pageNum) || pageNum < 1) {
                    return ApiResponse.error(res, 'page must be a positive integer', 400);
                }
            }

            if (limit !== undefined) {
                const limitNum = parseInt(limit);
                if (!Number.isInteger(limitNum) || limitNum < 1 || limitNum > 1000) {
                    return ApiResponse.error(res, 'limit must be between 1 and 1000', 400);
                }
            }

            next();
        } catch (error) {
            this.logger.error('Error in validatePagination:', error);
            return ApiResponse.error(res, 'Invalid pagination parameters', 400);
        }
    }

    /**
     * Validate group ID parameter
     */
    validateGroupId(req, res, next) {
        try {
            const { group_id } = req.params;

            if (!group_id) {
                return ApiResponse.error(res, 'group_id is required', 400);
            }

            // Basic validation - group_id should be a non-empty string
            if (typeof group_id !== 'string' || group_id.trim().length === 0) {
                return ApiResponse.error(res, 'group_id must be a non-empty string', 400);
            }

            // Length validation
            if (group_id.length > 255) {
                return ApiResponse.error(res, 'group_id too long', 400);
            }

            next();
        } catch (error) {
            this.logger.error('Error in validateGroupId:', error);
            return ApiResponse.error(res, 'Invalid group ID', 400);
        }
    }

    /**
     * Validate group search parameters
     */
    validateGroupSearch(req, res, next) {
        try {
            const { search, search_type } = req.query;
            
            // إذا كان هناك بحث، التحقق من صحته
            if (search !== undefined) {
                // التحقق من طول البحث
                if (search.trim().length < 1) {
                    return ApiResponse.error(res, 'Search term must be at least 1 character long', 400);
                }
                
                if (search.trim().length > 100) {
                    return ApiResponse.error(res, 'Search term must be less than 100 characters', 400);
                }

                // تنظيف المدخلات من الأحرف الخطيرة
                const sanitizedSearch = this.sanitizeSearchInput(search);
                if (sanitizedSearch !== search.trim()) {
                    return ApiResponse.error(res, 'Search term contains invalid characters', 400);
                }
            }

            // التحقق من نوع البحث
            if (search_type !== undefined) {
                const validSearchTypes = ['name', 'phone', 'all'];
                if (!validSearchTypes.includes(search_type)) {
                    return ApiResponse.error(res, 'search_type must be one of: name, phone, all', 400);
                }
            }

            next();
        } catch (error) {
            this.logger.error('Error in validateGroupSearch:', error);
            return ApiResponse.error(res, 'Invalid search parameters', 400);
        }
    }

    /**
     * Validate contact ID parameter
     */
    validateContactId(req, res, next) {
        try {
            const { contact_id } = req.params;

            if (!contact_id) {
                return ApiResponse.error(res, 'contact_id is required', 400);
            }

            if (typeof contact_id !== 'string' || contact_id.trim().length === 0) {
                return ApiResponse.error(res, 'contact_id must be a non-empty string', 400);
            }

            if (contact_id.length > 255) {
                return ApiResponse.error(res, 'contact_id too long', 400);
            }

            next();
        } catch (error) {
            this.logger.error('Error in validateContactId:', error);
            return ApiResponse.error(res, 'Invalid contact ID', 400);
        }
    }

    /**
     * Validate message content
     */
    validateMessage(req, res, next) {
        try {
            const { message } = req.body;

            if (!message) {
                return ApiResponse.error(res, 'message is required', 400);
            }

            if (typeof message !== 'string') {
                return ApiResponse.error(res, 'message must be a string', 400);
            }

            if (message.trim().length === 0) {
                return ApiResponse.error(res, 'message cannot be empty', 400);
            }

            if (message.length > 4096) {
                return ApiResponse.error(res, 'message too long (max 4096 characters)', 400);
            }

            next();
        } catch (error) {
            this.logger.error('Error in validateMessage:', error);
            return ApiResponse.error(res, 'Invalid message', 400);
        }
    }

    /**
     * Validate image URL
     */
    validateImageUrl(req, res, next) {
        try {
            const { image_url } = req.body;

            // Image URL is optional
            if (!image_url) {
                return next();
            }

            if (typeof image_url !== 'string') {
                return ApiResponse.error(res, 'image_url must be a string', 400);
            }

            // Basic URL validation
            try {
                new URL(image_url);
            } catch (urlError) {
                return ApiResponse.error(res, 'image_url must be a valid URL', 400);
            }

            // Check if URL looks like an image
            const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'];
            const hasImageExtension = imageExtensions.some(ext => 
                image_url.toLowerCase().includes(ext)
            );

            if (!hasImageExtension && !image_url.includes('image') && !image_url.includes('photo')) {
                this.logger.warn(`Potentially non-image URL: ${image_url}`);
            }

            next();
        } catch (error) {
            this.logger.error('Error in validateImageUrl:', error);
            return ApiResponse.error(res, 'Invalid image URL', 400);
        }
    }

    /**
     * Validate group creation data
     */
    validateGroupCreation(req, res, next) {
        try {
            const { name, contact_ids } = req.body;

            if (!name) {
                return ApiResponse.error(res, 'Group name is required', 400);
            }

            if (typeof name !== 'string' || name.trim().length === 0) {
                return ApiResponse.error(res, 'Group name must be a non-empty string', 400);
            }

            if (name.length > 100) {
                return ApiResponse.error(res, 'Group name too long (max 100 characters)', 400);
            }

            if (!contact_ids || !Array.isArray(contact_ids)) {
                return ApiResponse.error(res, 'contact_ids must be an array', 400);
            }

            if (contact_ids.length === 0) {
                return ApiResponse.error(res, 'At least one contact is required', 400);
            }

            if (contact_ids.length > 1000) {
                return ApiResponse.error(res, 'Too many contacts (max 1000)', 400);
            }

            // Validate each contact ID
            for (const contactId of contact_ids) {
                if (typeof contactId !== 'string' || contactId.trim().length === 0) {
                    return ApiResponse.error(res, 'All contact IDs must be non-empty strings', 400);
                }
            }

            next();
        } catch (error) {
            this.logger.error('Error in validateGroupCreation:', error);
            return ApiResponse.error(res, 'Invalid group creation data', 400);
        }
    }

    /**
     * Validate group update data
     */
    validateGroupUpdate(req, res, next) {
        try {
            const { contact_ids } = req.body;

            if (!contact_ids || !Array.isArray(contact_ids)) {
                return ApiResponse.error(res, 'contact_ids must be an array', 400);
            }

            if (contact_ids.length > 1000) {
                return ApiResponse.error(res, 'Too many contacts (max 1000)', 400);
            }

            // Validate each contact ID
            for (const contactId of contact_ids) {
                if (typeof contactId !== 'string' || contactId.trim().length === 0) {
                    return ApiResponse.error(res, 'All contact IDs must be non-empty strings', 400);
                }
            }

            next();
        } catch (error) {
            this.logger.error('Error in validateGroupUpdate:', error);
            return ApiResponse.error(res, 'Invalid group update data', 400);
        }
    }

    /**
     * Validate bulk recipients for messaging
     */
    validateBulkRecipients(req, res, next) {
        try {
            const { recipients } = req.body;

            if (!recipients || !Array.isArray(recipients)) {
                return ApiResponse.error(res, 'recipients must be an array', 400);
            }

            if (recipients.length === 0) {
                return ApiResponse.error(res, 'At least one recipient is required', 400);
            }

            if (recipients.length > 100) {
                return ApiResponse.error(res, 'Too many recipients (max 100 per request)', 400);
            }

            // Validate each recipient
            for (const recipient of recipients) {
                if (typeof recipient !== 'string' || recipient.trim().length === 0) {
                    return ApiResponse.error(res, 'All recipients must be non-empty strings', 400);
                }
            }

            next();
        } catch (error) {
            this.logger.error('Error in validateBulkRecipients:', error);
            return ApiResponse.error(res, 'Invalid bulk recipients data', 400);
        }
    }

    /**
     * Validate phone number format (helper method)
     */
    validatePhoneFormat(phone) {
        // إزالة المسافات والرموز الخاصة
        const cleanPhone = phone.replace(/[\s\-\(\)]/g, '');
        
        // التحقق من أن الرقم يحتوي على أرقام فقط (مع إمكانية وجود + في البداية)
        const phoneRegex = /^\+?[0-9]{8,15}$/;
        
        return phoneRegex.test(cleanPhone);
    }

    /**
     * Sanitize search input (helper method)
     */
    sanitizeSearchInput(searchTerm) {
        if (!searchTerm) return '';
        
        // إزالة الأحرف الخطيرة وSQL injection
        return searchTerm
            .trim()
            .replace(/[<>'";&]/g, '') // إزالة أحرف خطيرة
            .substring(0, 100); // الحد الأقصى 100 حرف
    }

    /**
     * Generic validation helper for required fields
     */
    validateRequiredFields(data, requiredFields) {
        const missing = [];
        
        for (const field of requiredFields) {
            if (data[field] === undefined || data[field] === null || data[field] === '') {
                missing.push(field);
            }
        }
        
        return missing;
    }

    /**
     * Validate email format (helper method)
     */
    validateEmailFormat(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    /**
     * Validate string length
     */
    validateStringLength(str, minLength = 0, maxLength = 255) {
        if (typeof str !== 'string') return false;
        return str.length >= minLength && str.length <= maxLength;
    }

    /**
     * Validate array of strings
     */
    validateStringArray(arr, maxItems = 100) {
        if (!Array.isArray(arr)) return false;
        if (arr.length > maxItems) return false;
        
        return arr.every(item => typeof item === 'string' && item.trim().length > 0);
    }
}

module.exports = ValidationMiddleware;