const Logger = require('../../utils/Logger');
const ContactService = require('../contact/ContactService');

/**
 * Service for managing background contact fetching with cumulative sync
 * Implements Single Responsibility Principle
 */
class ContactFetchingService {
    constructor() {
        this.logger = new Logger('ContactFetchingService');
        this.contactService = new ContactService();
    }

    /**
     * Fetch contacts in background with progress tracking and cumulative sync
     */
    async fetchContactsInBackground(client, userId, placeId, sessionId, onProgressUpdate) {
        try {
            this.logger.start(`Background contact fetch with cumulative sync for session ${sessionId}`);
            
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
            
            this.logger.info(`Found ${validContacts.length} valid contacts for cumulative sync in session ${sessionId}`);

            // Process contacts in batches for better performance
            const batchSize = 50;
            const totalContacts = validContacts.length;
            let processedCount = 0;
            const newContactsAdded = [];
            const updatedContacts = [];

            for (let i = 0; i < validContacts.length; i += batchSize) {
                const batch = validContacts.slice(i, i + batchSize);
                
                // Process batch with cumulative sync tracking
                const batchResults = await this.processBatchWithSync(batch, userId, placeId, sessionId);
                newContactsAdded.push(...batchResults.newContacts);
                updatedContacts.push(...batchResults.updatedContacts);
                
                processedCount += batch.length;
                const progress = Math.floor((processedCount / totalContacts) * 100);

                // Update progress
                if (onProgressUpdate) {
                    await onProgressUpdate({
                        status: 'processing_contacts',
                        progress: progress,
                        processed: processedCount,
                        total: totalContacts,
                        newContacts: newContactsAdded.length,
                        updatedContacts: updatedContacts.length
                    });
                }

                this.logger.info(`Processed ${processedCount}/${totalContacts} contacts for session ${sessionId} (${newContactsAdded.length} new, ${updatedContacts.length} updated)`);
            }

            // Get all contacts for group updating
            const allContacts = await this.getAllUserContacts(userId, placeId);
            
            // Update groups with cumulative contact data
            await this.updateGroupsWithCumulativeContacts(userId, placeId, sessionId, allContacts);

            // Notify completion with cumulative stats
            if (onProgressUpdate) {
                await onProgressUpdate({
                    status: 'completed',
                    progress: 100,
                    processed: processedCount,
                    total: totalContacts,
                    newContacts: newContactsAdded.length,
                    updatedContacts: updatedContacts.length,
                    totalContacts: allContacts.length,
                    completed: true
                });
            }

            this.logger.success(`Cumulative contact sync completed for session ${sessionId}. ${newContactsAdded.length} new contacts added, ${updatedContacts.length} contacts updated. Total contacts: ${allContacts.length}`);
            
            return {
                success: true,
                processedCount,
                totalContacts: allContacts.length,
                newContacts: newContactsAdded.length,
                updatedContacts: updatedContacts.length,
                cumulativeSync: true
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
     * Process a batch of contacts with sync tracking
     * @param {Array} batch - Batch of contacts to process
     * @param {string} userId - User ID
     * @param {string} placeId - Place ID  
     * @param {string} sessionId - Session ID
     * @returns {Object} - Results with new and updated contacts
     */
    async processBatchWithSync(batch, userId, placeId, sessionId) {
        const newContacts = [];
        const updatedContacts = [];

        for (const contact of batch) {
            try {
                const result = await this.processContactWithSync(contact, userId, placeId, sessionId);
                if (result.isNew) {
                    newContacts.push(result.contact);
                } else {
                    updatedContacts.push(result.contact);
                }
            } catch (error) {
                this.logger.warn(`Failed to process contact ${contact.id._serialized} for session ${sessionId}:`, error);
            }
        }

        return { newContacts, updatedContacts };
    }

    /**
     * Process individual contact with sync tracking
     * @param {Object} contact - WhatsApp contact object
     * @param {string} userId - User ID
     * @param {string} placeId - Place ID
     * @param {string} sessionId - Session ID
     * @returns {Object} - Result with contact and isNew flag
     */
    async processContactWithSync(contact, userId, placeId, sessionId) {
        try {
            // Prepare contact data for saving
            const contactData = {
                whatsapp_id: contact.id._serialized,
                name: contact.name || contact.pushname || 'Unknown',
                number: contact.number,
                is_business: contact.isBusiness || false,
                profile_picture_url: null, // Will be fetched separately if needed
                last_seen: contact.lastSeen || null,
                is_group: contact.isGroup || false,
                last_interaction: new Date() // Mark this sync as interaction
            };

            // Check if contact exists
            const Contact = require('../../../models/Contact');
            const contactId = this.contactService.generateContactId(userId, placeId, contact.id._serialized);
            const existingContact = await Contact.findOne({ contact_id: contactId });

            // Save contact using ContactService (will update if exists, create if new)
            const savedContact = await this.contactService.saveOrUpdateContact(userId, placeId, sessionId, contactData);

            return {
                contact: savedContact,
                isNew: !existingContact // True if contact didn't exist before
            };

        } catch (error) {
            this.logger.error(`Failed to process contact ${contact.id._serialized} for session ${sessionId}:`, error);
            throw error;
        }
    }

    /**
     * Get all user contacts for group updating
     * @param {string} userId - User ID
     * @param {string} placeId - Place ID
     * @returns {Array} - All user contacts
     */
    async getAllUserContacts(userId, placeId) {
        try {
            const Contact = require('../../../models/Contact');
            const contacts = await Contact.find({
                user_id: userId,
                place_id: placeId,
                status: 'active'
            });

            return contacts;
        } catch (error) {
            this.logger.error('Error getting all user contacts:', error);
            return [];
        }
    }

    /**
     * Update groups with cumulative contact data
     * @param {string} userId - User ID
     * @param {string} placeId - Place ID
     * @param {string} sessionId - Session ID
     * @param {Array} allContacts - All user contacts
     */
    async updateGroupsWithCumulativeContacts(userId, placeId, sessionId, allContacts) {
        try {
            this.logger.start(`Updating groups with cumulative contact data for session ${sessionId}`);
            
            // Get GroupService
            const GroupService = require('./GroupService');
            const groupService = new GroupService();
            
            // Update groups with all contacts (cumulative)
            await groupService.createDefaultGroups(userId, placeId, sessionId, allContacts);
            
            this.logger.success(`Groups updated with ${allContacts.length} cumulative contacts for session ${sessionId}`);
        } catch (error) {
            this.logger.error('Error updating groups with cumulative contacts:', error);
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

    /**
     * Get sync statistics for user
     * @param {string} userId - User ID
     * @param {string} placeId - Place ID
     * @returns {Object} - Sync statistics
     */
    async getSyncStatistics(userId, placeId) {
        try {
            const Contact = require('../../../models/Contact');
            
            const stats = await Contact.aggregate([
                { $match: { user_id: userId, place_id: placeId, status: 'active' } },
                {
                    $group: {
                        _id: null,
                        total_contacts: { $sum: 1 },
                        contacts_with_recent_sync: {
                            $sum: {
                                $cond: [
                                    {
                                        $gte: [
                                            '$last_interaction',
                                            new Date(Date.now() - 24 * 60 * 60 * 1000) // 24 hours ago
                                        ]
                                    },
                                    1,
                                    0
                                ]
                            }
                        }
                    }
                }
            ]);

            const result = stats[0] || {
                total_contacts: 0,
                contacts_with_recent_sync: 0
            };

            return {
                ...result,
                sync_coverage_percentage: result.total_contacts > 0 ? 
                    Math.round((result.contacts_with_recent_sync / result.total_contacts) * 100) : 0
            };

        } catch (error) {
            this.logger.error('Error getting sync statistics:', error);
            throw error;
        }
    }
}

module.exports = ContactFetchingService;