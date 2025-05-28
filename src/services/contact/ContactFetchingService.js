const Logger = require('../../utils/Logger');
const ContactService = require('../contact/ContactService');

/**
 * Service for managing background contact fetching with cumulative sync and 90-day filtering
 * Uses existing model structure
 */
class ContactFetchingService {
    constructor() {
        this.logger = new Logger('ContactFetchingService');
        this.contactService = new ContactService();
        this.Contact = require('../../../models/Contact');
        this.ContactGroup = require('../../../models/ContactGroup');
    }

    /**
     * Fetch contacts in background with progress tracking, cumulative sync, and 90-day filtering
     */
    async fetchContactsInBackground(client, userId, placeId, sessionId, onProgressUpdate) {
        try {
            this.logger.start(`Background contact fetch with cumulative sync and 90-day filtering for session ${sessionId}`);
            
            // Notify start of fetching
            if (onProgressUpdate) {
                await onProgressUpdate({
                    status: 'fetching_contacts',
                    progress: 0,
                    message: 'بدء جلب جهات الاتصال من واتساب...'
                });
            }

            // Get all contacts from WhatsApp
            const contacts = await client.getContacts();
            const validContacts = this.filterValidContacts(contacts);
            
            this.logger.info(`Found ${validContacts.length} valid contacts for processing in session ${sessionId}`);

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
                        updatedContacts: updatedContacts.length,
                        message: `معالجة ${processedCount}/${totalContacts} جهة اتصال...`
                    });
                }

                this.logger.info(`Processed ${processedCount}/${totalContacts} contacts for session ${sessionId} (${newContactsAdded.length} new, ${updatedContacts.length} updated)`);
            }

            // Get contacts from last 90 days for group updating
            const contactsLast90Days = await this.getContactsLast90Days(userId, placeId);
            
            // Update groups with cumulative contact data (90-day filtered)
            await this.updateGroupsWithCumulativeContacts(userId, placeId, sessionId, contactsLast90Days);

            // Get final statistics
            const finalStats = await this.getFinalStatistics(userId, placeId);

            // Notify completion with cumulative stats
            if (onProgressUpdate) {
                await onProgressUpdate({
                    status: 'completed',
                    progress: 100,
                    processed: processedCount,
                    total: totalContacts,
                    newContacts: newContactsAdded.length,
                    updatedContacts: updatedContacts.length,
                    totalContacts: finalStats.totalContacts,
                    contactsLast90Days: finalStats.contactsLast90Days,
                    completed: true,
                    message: `تم إكمال المزامنة بنجاح! ${finalStats.contactsLast90Days} جهة اتصال من آخر 90 يوم`
                });
            }

            this.logger.success(`Cumulative contact sync completed for session ${sessionId}. ${newContactsAdded.length} new contacts added, ${updatedContacts.length} contacts updated. Total contacts last 90 days: ${finalStats.contactsLast90Days}`);
            
            return {
                success: true,
                processedCount,
                totalContacts: finalStats.totalContacts,
                contactsLast90Days: finalStats.contactsLast90Days,
                newContacts: newContactsAdded.length,
                updatedContacts: updatedContacts.length,
                cumulativeSync: true,
                dateFilter: '90_days'
            };

        } catch (error) {
            this.logger.error(`Background contact fetch failed for session ${sessionId}:`, error);
            
            // Notify error
            if (onProgressUpdate) {
                await onProgressUpdate({
                    status: 'error',
                    error: error.message,
                    message: `خطأ في المزامنة: ${error.message}`
                });
            }
            
            throw error;
        }
    }

    /**
     * Filter valid contacts from WhatsApp contacts list with enhanced validation
     * @param {Array} contacts - Raw contacts from WhatsApp
     * @returns {Array} - Filtered valid contacts
     */
    filterValidContacts(contacts) {
        if (!contacts || !Array.isArray(contacts)) {
            return [];
        }

        const validContacts = contacts.filter(contact => {
            // Skip contacts without proper ID
            if (!contact.id || !contact.id._serialized) {
                return false;
            }

            // Only process regular contacts (c.us server)
            if (contact.id?.server != 'c.us') {
                return false;
            }

            // Must be a WhatsApp contact
            if (!contact.isWAContact) {
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

            // Skip group contacts
            if (contact.isGroup) {
                return false;
            }

            return true;
        });

        this.logger.info(`Filtered ${validContacts.length} valid contacts from ${contacts.length} total contacts`);
        return validContacts;
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
            // Generate unique contact ID
            const contactId = `${userId}_${placeId}_${contact.id._serialized}`;

            // Check if contact exists
            const existingContact = await this.Contact.findOne({ 
                contact_id: contactId 
            });

            // Prepare contact data for saving
            const contactData = {
                user_id: userId,
                place_id: placeId,
                session_id: sessionId,
                contact_id: contactId,
                name: contact.name || contact.pushname || 'Unknown',
                number: contact.number,
                whatsapp_id: contact.id._serialized,
                profile_picture_url: null, // Will be fetched separately if needed
                is_business: contact.isBusiness || false,
                last_seen: contact.lastSeen ? new Date(contact.lastSeen * 1000) : null,
                last_interaction: new Date(), // Mark this sync as interaction
                status: 'active',
                tags: [],
                updated_at: new Date()
            };

            let savedContact;
            let isNew = false;

            if (existingContact) {
                // Update existing contact
                Object.assign(existingContact, contactData);
                savedContact = await existingContact.save();
            } else {
                // Create new contact
                contactData.created_at = new Date();
                savedContact = new this.Contact(contactData);
                await savedContact.save();
                isNew = true;
            }

            return {
                contact: savedContact,
                isNew: isNew
            };

        } catch (error) {
            this.logger.error(`Failed to process contact ${contact.id._serialized} for session ${sessionId}:`, error);
            throw error;
        }
    }

    /**
     * Get contacts from last 90 days
     * @param {string} userId - User ID
     * @param {string} placeId - Place ID
     * @returns {Array} - Contacts from last 90 days
     */
    async getContactsLast90Days(userId, placeId) {
        try {
            const ninetyDaysAgo = new Date();
            ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

            const contacts = await this.Contact.find({
                user_id: userId,
                place_id: placeId,
                status: 'active',
                $or: [
                    { last_interaction: { $gte: ninetyDaysAgo } },
                    { last_seen: { $gte: ninetyDaysAgo } },
                    { created_at: { $gte: ninetyDaysAgo } }
                ]
            });

            this.logger.info(`Found ${contacts.length} contacts from last 90 days for user ${userId}, place ${placeId}`);
            return contacts;
        } catch (error) {
            this.logger.error('Error getting contacts from last 90 days:', error);
            return [];
        }
    }

    /**
     * Get final statistics for user
     * @param {string} userId - User ID
     * @param {string} placeId - Place ID
     * @returns {Object} - Final statistics
     */
    async getFinalStatistics(userId, placeId) {
        try {
            const ninetyDaysAgo = new Date();
            ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

            const totalContacts = await this.Contact.countDocuments({
                user_id: userId,
                place_id: placeId,
                status: 'active'
            });

            const contactsLast90Days = await this.Contact.countDocuments({
                user_id: userId,
                place_id: placeId,
                status: 'active',
                $or: [
                    { last_interaction: { $gte: ninetyDaysAgo } },
                    { last_seen: { $gte: ninetyDaysAgo } },
                    { created_at: { $gte: ninetyDaysAgo } }
                ]
            });

            return {
                totalContacts,
                contactsLast90Days
            };
        } catch (error) {
            this.logger.error('Error getting final statistics:', error);
            return {
                totalContacts: 0,
                contactsLast90Days: 0
            };
        }
    }

    /**
     * Update groups with cumulative contact data (90-day filtered)
     * @param {string} userId - User ID
     * @param {string} placeId - Place ID
     * @param {string} sessionId - Session ID
     * @param {Array} contactsLast90Days - Contacts from last 90 days
     */
    async updateGroupsWithCumulativeContacts(userId, placeId, sessionId, contactsLast90Days) {
        try {
            this.logger.start(`Updating groups with cumulative contact data (90-day filtered) for session ${sessionId}`);
            
            // Check if default group exists
            const defaultGroup = await this.ContactGroup.findOne({
                user_id: userId,
                place_id: placeId,
                group_type: 'auto',
                name: 'جميع الارقام'
            });

            if (!defaultGroup) {
                // Create default group with all contacts from last 90 days
                const contactIds = contactsLast90Days.map(contact => contact._id);
                
                const newDefaultGroup = new this.ContactGroup({
                    user_id: userId,
                    place_id: placeId,
                    session_id: sessionId,
                    group_id: `default_${userId}_${placeId}`,
                    name: 'جميع الارقام',
                    description: 'جميع جهات الاتصال ',
                    contact_ids: contactIds,
                    group_type: 'auto',
                    filter_criteria: {
                        last_interaction_days: 90
                    },
                    is_active: true,
                    created_at: new Date(),
                    updated_at: new Date()
                });

                await newDefaultGroup.save();
                this.logger.info(`Created default group with ${contactIds.length} contacts from last 90 days`);
            } else {
                // Update existing default group with new contacts
                const contactIds = contactsLast90Days.map(contact => contact._id);
                
                defaultGroup.contact_ids = contactIds;
                defaultGroup.updated_at = new Date();
                await defaultGroup.save();
                
                this.logger.info(`Updated default group with ${contactIds.length} contacts from last 90 days`);
            }
            
            this.logger.success(`Groups updated with ${contactsLast90Days.length} contacts from last 90 days for session ${sessionId}`);
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
     * Get sync statistics for user with 90-day filtering
     * @param {string} userId - User ID
     * @param {string} placeId - Place ID
     * @returns {Object} - Sync statistics
     */
    async getSyncStatistics(userId, placeId) {
        try {
            const ninetyDaysAgo = new Date();
            ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

            const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
            
            const stats = await this.Contact.aggregate([
                { 
                    $match: { 
                        user_id: userId, 
                        place_id: placeId, 
                        status: 'active' 
                    } 
                },
                {
                    $group: {
                        _id: null,
                        total_contacts: { $sum: 1 },
                        contacts_last_90_days: {
                            $sum: {
                                $cond: [
                                    {
                                        $or: [
                                            { $gte: ['$last_interaction', ninetyDaysAgo] },
                                            { $gte: ['$last_seen', ninetyDaysAgo] },
                                            { $gte: ['$created_at', ninetyDaysAgo] }
                                        ]
                                    },
                                    1,
                                    0
                                ]
                            }
                        },
                        contacts_with_recent_sync: {
                            $sum: {
                                $cond: [
                                    { $gte: ['$last_interaction', twentyFourHoursAgo] },
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
                contacts_last_90_days: 0,
                contacts_with_recent_sync: 0
            };

            return {
                ...result,
                sync_coverage_percentage: result.total_contacts > 0 ? 
                    Math.round((result.contacts_with_recent_sync / result.total_contacts) * 100) : 0,
                last_90_days_percentage: result.total_contacts > 0 ? 
                    Math.round((result.contacts_last_90_days / result.total_contacts) * 100) : 0,
                date_filter: {
                    type: 'last_90_days',
                    from_date: ninetyDaysAgo.toISOString(),
                    to_date: new Date().toISOString()
                }
            };

        } catch (error) {
            this.logger.error('Error getting sync statistics:', error);
            throw error;
        }
    }
}

module.exports = ContactFetchingService;