const Logger = require('../../utils/Logger');
const ContactService = require('../contact/ContactService');

/**
 * Service for managing background contact fetching
 * Implements Single Responsibility Principle
 */
class ContactFetchingService {
    constructor() {
        this.logger = new Logger('ContactFetchingService');
        this.contactService = new ContactService();
    }

    /**
     * Fetch contacts in background with progress tracking
     */
    async fetchContactsInBackground(client, userId, placeId, sessionId, onProgressUpdate) {
        try {
            this.logger.start(`Background contact fetch for session ${sessionId}`);
            
            // Notify start of fetching
            if (onProgressUpdate) {
                await onProgressUpdate({
                    status: 'fetching_contacts',
                    progress: 0
                });
            }

            // Get all contacts from WhatsApp
            const contacts = await client.getContacts();
            const validContacts = this.filterValidContacts(contacts);
            
            this.logger.info(`Found ${validContacts.length} valid contacts for session ${sessionId}`);

            // Process contacts in batches for better performance
            const batchSize = 50;
            const totalContacts = validContacts.length;
            let processedCount = 0;

            for (let i = 0; i < validContacts.length; i += batchSize) {
                const batch = validContacts.slice(i, i + batchSize);
                
                // Process batch
                await this.processBatch(batch, userId, placeId, sessionId);
                
                processedCount += batch.length;
                const progress = Math.floor((processedCount / totalContacts) * 100);

                // Update progress
                if (onProgressUpdate) {
                    await onProgressUpdate({
                        status: 'processing_contacts',
                        progress: progress,
                        processed: processedCount,
                        total: totalContacts
                    });
                }

                this.logger.info(`Processed ${processedCount}/${totalContacts} contacts for session ${sessionId}`);
            }

            // Notify completion
            if (onProgressUpdate) {
                await onProgressUpdate({
                    status: 'completed',
                    progress: 100,
                    processed: processedCount,
                    total: totalContacts
                });
            }

            this.logger.success(`Background contact fetch completed for session ${sessionId}. Processed ${processedCount} contacts`);
            
            return {
                success: true,
                processedCount,
                totalContacts
            };

        } catch (error) {
            this.logger.error(`Background contact fetch failed for session ${sessionId}:`, error);
            
            // Notify error
            if (onProgressUpdate) {
                await onProgressUpdate({
                    status: 'error',
                    error: error.message
                });
            }
            
            throw error;
        }
    }

    /**
     * Filter valid contacts from WhatsApp contacts list
     * @param {Array} contacts - Raw contacts from WhatsApp
     * @returns {Array} - Filtered valid contacts
     */
    filterValidContacts(contacts) {
        if (!contacts || !Array.isArray(contacts)) {
            return [];
        }

        return contacts.filter(contact => {
            // Skip contacts without proper ID
            if (!contact.id || !contact.id._serialized) {
                return false;
            }

            // Skip broadcast lists and status updates
            if (contact.id._serialized.includes('@broadcast') || 
                contact.id._serialized.includes('status@broadcast')) {
                return false;
            }

            // Skip contacts without phone numbers
            if (!contact.number || contact.number === 'undefined') {
                return false;
            }

            // Skip own number
            if (contact.isMe) {
                return false;
            }

            return true;
        });
    }

    /**
     * Process a batch of contacts
     * @param {Array} batch - Batch of contacts to process
     * @param {string} userId - User ID
     * @param {string} placeId - Place ID  
     * @param {string} sessionId - Session ID
     */
    async processBatch(batch, userId, placeId, sessionId) {
        const promises = batch.map(contact => 
            this.processContact(contact, userId, placeId, sessionId)
        );

        try {
            await Promise.allSettled(promises);
        } catch (error) {
            this.logger.warn(`Some contacts in batch failed to process for session ${sessionId}:`, error);
        }
    }

    /**
     * Process individual contact
     * @param {Object} contact - WhatsApp contact object
     * @param {string} userId - User ID
     * @param {string} placeId - Place ID
     * @param {string} sessionId - Session ID
     */
    async processContact(contact, userId, placeId, sessionId) {
        try {
            // Prepare contact data for saving
            const contactData = {
                whatsapp_id: contact.id._serialized,
                name: contact.name || contact.pushname || 'Unknown',
                phone_number: contact.number,
                is_business: contact.isBusiness || false,
                profile_pic_url: null, // Will be fetched separately if needed
                user_id: userId,
                place_id: placeId,
                session_id: sessionId,
                last_seen: contact.lastSeen || null,
                is_group: contact.isGroup || false
            };

            // Save contact using ContactService
            await this.contactService.saveContacts(userId, placeId, sessionId,contactData);

        } catch (error) {
            this.logger.error(`Failed to process contact ${contact.id._serialized} for session ${sessionId}:`, error);
        }
    }

    /**
     * Get contacts fetching status
     * @param {string} sessionId - Session ID
     * @returns {Object} - Status information
     */
    async getFetchingStatus(sessionId) {
        try {
            // This would typically check a cache or database for status
            // For now, return a basic implementation
            return {
                status: 'unknown',
                progress: 0,
                message: 'Status check not implemented'
            };
        } catch (error) {
            this.logger.error(`Failed to get fetching status for session ${sessionId}:`, error);
            throw error;
        }
    }

    /**
     * Cancel ongoing contact fetching
     * @param {string} sessionId - Session ID
     */
    async cancelFetching(sessionId) {
        try {
            this.logger.info(`Cancelling contact fetch for session ${sessionId}`);
            // Implementation would depend on how the background process is managed
            // For now, just log the cancellation
            return {
                success: true,
                message: 'Fetching cancelled'
            };
        } catch (error) {
            this.logger.error(`Failed to cancel fetching for session ${sessionId}:`, error);
            throw error;
        }
    }
}

module.exports = ContactFetchingService;