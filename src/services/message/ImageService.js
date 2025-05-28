const axios = require('axios');
const Logger = require('../../utils/Logger');

/**
 * Service for handling image operations
 * Implements Single Responsibility Principle
 */
class ImageService {
    constructor() {
        this.logger = new Logger('ImageService');
        this.maxSizeBytes = 10 * 1024 * 1024; // 10MB
        this.allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    }

    /**
     * Validate image URL format
     */
    isValidImageUrl(url) {
        try {
            const parsedUrl = new URL(url);
            return ['http:', 'https:'].includes(parsedUrl.protocol);
        } catch {
            return false;
        }
    }

    /**
     * Download image from URL with validation
     */
    async downloadImageFromUrl(imageUrl) {
        try {
            this.logger.info(`Downloading image from: ${imageUrl}`);
            
            if (!this.isValidImageUrl(imageUrl)) {
                throw new Error('Invalid image URL format');
            }

            const response = await axios({
                method: 'GET',
                url: imageUrl,
                responseType: 'arraybuffer',
                timeout: 30000, // 30 seconds timeout
                headers: {
                    'User-Agent': 'WhatsApp-Integration-Service/2.0'
                },
                maxContentLength: this.maxSizeBytes,
                maxBodyLength: this.maxSizeBytes
            });

            // Validate response
            if (response.status !== 200) {
                throw new Error(`Failed to download image: HTTP ${response.status}`);
            }

            // Check content type
            const contentType = response.headers['content-type'];
            if (!contentType || !contentType.startsWith('image/')) {
                throw new Error(`Invalid content type: ${contentType}. Expected image.`);
            }

            // Check file size
            const contentLength = response.headers['content-length'];
            if (contentLength && parseInt(contentLength) > this.maxSizeBytes) {
                throw new Error('Image too large (max 10MB)');
            }

            const imageData = {
                buffer: Buffer.from(response.data),
                mimeType: contentType,
                size: response.data.byteLength,
                sizeKB: Math.round(response.data.byteLength / 1024),
                sizeMB: Math.round(response.data.byteLength / 1024 / 1024 * 100) / 100
            };

            this.logger.success(`Image downloaded successfully: ${imageData.sizeKB}KB, type: ${imageData.mimeType}`);
            
            return imageData;

        } catch (error) {
            this.logger.error(`Error downloading image from ${imageUrl}:`, error);
            
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

    /**
     * Test image URL validity without downloading full image
     */
    async testImageUrl(imageUrl) {
        try {
            this.logger.info(`Testing image URL: ${imageUrl}`);
            
            if (!imageUrl) {
                throw new Error('Image URL is required');
            }

            if (!this.isValidImageUrl(imageUrl)) {
                return {
                    success: false,
                    error: 'Invalid image URL format',
                    details: {
                        url: imageUrl,
                        valid_protocols: ['http:', 'https:']
                    }
                };
            }

            // Use HEAD request to get headers only
            const response = await axios({
                method: 'HEAD',
                url: imageUrl,
                timeout: 10000,
                headers: {
                    'User-Agent': 'WhatsApp-Integration-Service/2.0'
                }
            });

            const contentType = response.headers['content-type'];
            const contentLength = response.headers['content-length'];

            if (!contentType || !contentType.startsWith('image/')) {
                return {
                    success: false,
                    error: 'URL does not point to an image',
                    details: {
                        content_type: contentType,
                        status: response.status
                    }
                };
            }

            if (contentLength && parseInt(contentLength) > this.maxSizeBytes) {
                return {
                    success: false,
                    error: 'Image too large (max 10MB)',
                    details: {
                        size_mb: Math.round(parseInt(contentLength) / 1024 / 1024 * 100) / 100
                    }
                };
            }

            const result = {
                success: true,
                message: 'Image URL is valid',
                details: {
                    content_type: contentType,
                    size_mb: contentLength ? Math.round(parseInt(contentLength) / 1024 / 1024 * 100) / 100 : 'unknown',
                    size_kb: contentLength ? Math.round(parseInt(contentLength) / 1024) : 'unknown',
                    status: response.status,
                    server: response.headers['server'] || 'unknown'
                }
            };

            this.logger.success(`Image URL test passed: ${imageUrl}`);
            return result;

        } catch (error) {
            this.logger.error(`Error testing image URL ${imageUrl}:`, error);
            
            return {
                success: false,
                error: 'Failed to access image URL',
                details: {
                    error_message: error.message,
                    error_code: error.code,
                    url: imageUrl
                }
            };
        }
    }

    /**
     * Get image metadata without downloading
     */
    async getImageMetadata(imageUrl) {
        try {
            const response = await axios({
                method: 'HEAD',
                url: imageUrl,
                timeout: 10000,
                headers: {
                    'User-Agent': 'WhatsApp-Integration-Service/2.0'
                }
            });

            return {
                contentType: response.headers['content-type'],
                contentLength: response.headers['content-length'],
                lastModified: response.headers['last-modified'],
                server: response.headers['server'],
                statusCode: response.status,
                isValid: response.headers['content-type']?.startsWith('image/') || false,
                sizeBytes: parseInt(response.headers['content-length']) || null,
                sizeMB: response.headers['content-length'] ? 
                    Math.round(parseInt(response.headers['content-length']) / 1024 / 1024 * 100) / 100 : null
            };
        } catch (error) {
            this.logger.error(`Error getting image metadata for ${imageUrl}:`, error);
            throw error;
        }
    }

    /**
     * Validate image constraints
     */
    validateImageConstraints(imageData) {
        const errors = [];

        if (imageData.size > this.maxSizeBytes) {
            errors.push(`Image size ${imageData.sizeMB}MB exceeds maximum allowed size of 10MB`);
        }

        if (!this.allowedTypes.includes(imageData.mimeType)) {
            errors.push(`Image type ${imageData.mimeType} is not supported. Allowed types: ${this.allowedTypes.join(', ')}`);
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }

    /**
     * Get supported image formats
     */
    getSupportedFormats() {
        return {
            types: this.allowedTypes,
            maxSizeMB: this.maxSizeBytes / 1024 / 1024,
            maxSizeBytes: this.maxSizeBytes
        };
    }
}

module.exports = ImageService;
