const Contact = require('../../../models/Contact');
const Logger = require('../../utils/Logger');

/**
 * Service for managing contacts with cumulative sync
 * Implements Single Responsibility Principle
 */
class ContactService {
    constructor() {
        this.logger = new Logger('ContactService');
        this._groupService = null; // Lazy loading to avoid circular dependency
    }

    /**
     * Get GroupService instance with lazy loading
     */
    get groupService() {
        if (!this._groupService) {
            const GroupService = require('./GroupService');
            this._groupService = new GroupService();
        }
        return this._groupService;
    }

    /**
     * Generate unique contact ID
     */
    generateContactId(userId, placeId, whatsappId) {
        return `contact_${userId}_${placeId}_${whatsappId.replace('@c.us', '')}`;
    }

    /**
     * Save or update contacts from WhatsApp with cumulative sync
     */
    async saveContacts(userId, placeId, sessionId, contactsData) {
        try {
            this.logger.start(`Saving ${contactsData.length} contacts for user ${userId} with cumulative sync`);
            
            const savedContacts = [];
            const batchSize = 50; // Process contacts in batches
            
            for (let i = 0; i < contactsData.length; i += batchSize) {
                const batch = contactsData.slice(i, i + batchSize);
                const batchResults = await this.processBatch(batch, userId, placeId, sessionId);
                savedContacts.push(...batchResults);
                
                this.logger.progress('Saving contacts', i + batch.length, contactsData.length);
            }
            
            // Get all user contacts for group updating
            const allContacts = await this.getAllUserContacts(userId, placeId);
            
            // Create default groups with cumulative contacts
            await this.groupService.createDefaultGroups(userId, placeId, sessionId);
            
            this.logger.success(`Successfully saved ${savedContacts.length} contacts and updated groups with ${allContacts.length} cumulative contacts`);
            
            return savedContacts;
            
        } catch (error) {
            this.logger.error('Error saving contacts:', error);
            throw new Error(`Failed to save contacts: ${error.message}`);
        }
    }

    /**
     * Process batch of contacts
     */
    async processBatch(batch, userId, placeId, sessionId) {
        const savedContacts = [];
        
        for (const contactData of batch) {
            try {
                const contact = await this.saveOrUpdateContact(userId, placeId, sessionId, contactData);
                savedContacts.push(contact);
            } catch (error) {
                this.logger.warn(`Error processing contact ${contactData.number}:`, error);
                // Continue with other contacts
            }
        }
        
        return savedContacts;
    }

    /**
     * Save or update single contact - exposed method for cumulative sync
     */
    async saveOrUpdateContact(userId, placeId, sessionId, contactData) {
        const contactId = this.generateContactId(userId, placeId, contactData.whatsapp_id);
        
        let contact = await Contact.findOne({ contact_id: contactId });
        
        if (contact) {
            // Update existing contact
            contact = await this.updateExistingContact(contact, contactData);
            this.logger.debug(`Updated existing contact: ${contactData.number}`);
        } else {
            // Create new contact
            contact = await this.createNewContact(userId, placeId, sessionId, contactId, contactData);
            this.logger.debug(`Created new contact: ${contactData.number}`);
        }
        
        return contact;
    }

    /**
     * Update existing contact with new data
     */
    async updateExistingContact(contact, contactData) {
        // Only update fields that have new data
        if (contactData.name && contactData.name !== 'Unknown') {
            contact.name = contactData.name;
        }
        
        if (contactData.last_interaction) {
            contact.last_interaction = contactData.last_interaction;
        }
        
        if (contactData.last_seen) {
            contact.last_seen = contactData.last_seen;
        }
        
        if (contactData.is_business !== undefined) {
            contact.is_business = contactData.is_business;
        }
        
        if (contactData.profile_picture_url) {
            contact.profile_picture_url = contactData.profile_picture_url;
        }
        
        if (contactData.business_info) {
            contact.business_info = { ...contact.business_info, ...contactData.business_info };
        }
        
        contact.updated_at = new Date();
        
        await contact.save();
        return contact;
    }

    /**
     * Create new contact
     */
    async createNewContact(userId, placeId, sessionId, contactId, contactData) {
        const contact = new Contact({
            user_id: userId,
            place_id: placeId,
            session_id: sessionId,
            contact_id: contactId,
            name: contactData.name,
            number: contactData.number,
            whatsapp_id: contactData.whatsapp_id,
            profile_picture_url: contactData.profile_picture_url,
            is_business: contactData.is_business || false,
            business_info: contactData.business_info || {},
            last_interaction: contactData.last_interaction,
            last_seen: contactData.last_seen,
            status: 'active'
        });
        
        await contact.save();
        return contact;
    }

    /**
     * Get all user contacts for cumulative operations
     */
    async getAllUserContacts(userId, placeId) {
        try {
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
     * Get contact by ID
     */
    async getContactById(userId, placeId, contactId) {
        try {
            const contact = await Contact.findOne({
                user_id: userId,
                place_id: placeId,
                contact_id: contactId,
                status: 'active'
            });
            
            if (!contact) {
                throw new Error(`Contact not found: ${contactId}`);
            }
            
            return this.formatContactResponse(contact);
            
        } catch (error) {
            this.logger.error(`Error getting contact ${contactId}:`, error);
            throw new Error(`Failed to get contact: ${error.message}`);
        }
    }

    /**
     * Search contacts with filters
     */
    async searchContacts(userId, placeId, query, filters = {}) {
        try {
            const searchCriteria = this.buildSearchCriteria(userId, placeId, query, filters);
            
            const contacts = await Contact.find(searchCriteria)
                .select('contact_id name number is_business last_interaction profile_picture_url tags')
                .sort({ name: 1 })
                .limit(filters.limit || 100)
                .lean();
            
            return contacts.map(contact => this.formatContactSearchResult(contact));
            
        } catch (error) {
            this.logger.error('Error searching contacts:', error);
            throw new Error(`Failed to search contacts: ${error.message}`);
        }
    }

    /**
     * Build search criteria
     */
    buildSearchCriteria(userId, placeId, query, filters) {
        const searchCriteria = {
            user_id: userId,
            place_id: placeId,
            status: 'active'
        };
        
        // Text search
        if (query) {
            searchCriteria.$or = [
                { name: { $regex: query, $options: 'i' } },
                { number: { $regex: query, $options: 'i' } }
            ];
        }
        
        // Apply filters
        if (filters.is_business !== undefined) {
            searchCriteria.is_business = filters.is_business;
        }
        
        if (filters.has_profile_picture !== undefined) {
            if (filters.has_profile_picture) {
                searchCriteria.profile_picture_url = { $ne: null, $ne: '' };
            } else {
                searchCriteria.$or = [
                    { profile_picture_url: null },
                    { profile_picture_url: '' }
                ];
            }
        }
        
        if (filters.last_interaction_days) {
            const daysAgo = new Date();
            daysAgo.setDate(daysAgo.getDate() - filters.last_interaction_days);
            searchCriteria.last_interaction = { $gte: daysAgo };
        }
        
        if (filters.tags && filters.tags.length > 0) {
            searchCriteria.tags = { $in: filters.tags };
        }
        
        return searchCriteria;
    }

    /**
     * Update contact tags
     */
    async updateContactTags(userId, placeId, contactId, tags) {
        try {
            const contact = await Contact.findOneAndUpdate(
                {
                    user_id: userId,
                    place_id: placeId,
                    contact_id: contactId,
                    status: 'active'
                },
                {
                    tags: tags,
                    updated_at: new Date()
                },
                { new: true }
            );

            if (!contact) {
                throw new Error(`Contact not found: ${contactId}`);
            }

            this.logger.info(`Updated tags for contact ${contactId}: ${tags.join(', ')}`);
            return this.formatContactResponse(contact);

        } catch (error) {
            this.logger.error(`Error updating contact tags for ${contactId}:`, error);
            throw new Error(`Failed to update contact tags: ${error.message}`);
        }
    }

    /**
     * Update contact custom fields
     */
    async updateContactCustomFields(userId, placeId, contactId, customFields) {
        try {
            const contact = await Contact.findOneAndUpdate(
                {
                    user_id: userId,
                    place_id: placeId,
                    contact_id: contactId,
                    status: 'active'
                },
                {
                    custom_fields: customFields,
                    updated_at: new Date()
                },
                { new: true }
            );

            if (!contact) {
                throw new Error(`Contact not found: ${contactId}`);
            }

            this.logger.info(`Updated custom fields for contact ${contactId}`);
            return this.formatContactResponse(contact);

        } catch (error) {
            this.logger.error(`Error updating contact custom fields for ${contactId}:`, error);
            throw new Error(`Failed to update contact custom fields: ${error.message}`);
        }
    }

    /**
     * Get contact statistics with cumulative data
     */
    async getContactStatistics(userId, placeId) {
        try {
            const stats = await Contact.aggregate([
                { $match: { user_id: userId, place_id: placeId, status: 'active' } },
                {
                    $group: {
                        _id: null,
                        total_contacts: { $sum: 1 },
                        business_contacts: {
                            $sum: { $cond: [{ $eq: ['$is_business', true] }, 1, 0] }
                        },
                        contacts_with_picture: {
                            $sum: { $cond: [{ $ne: ['$profile_picture_url', null] }, 1, 0] }
                        },
                        contacts_with_recent_interaction: {
                            $sum: {
                                $cond: [
                                    {
                                        $gte: [
                                            '$last_interaction',
                                            new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // 30 days ago
                                        ]
                                    },
                                    1,
                                    0
                                ]
                            }
                        },
                        contacts_synced_today: {
                            $sum: {
                                $cond: [
                                    {
                                        $gte: [
                                            '$updated_at',
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
                business_contacts: 0,
                contacts_with_picture: 0,
                contacts_with_recent_interaction: 0,
                contacts_synced_today: 0
            };

            return {
                ...result,
                personal_contacts: result.total_contacts - result.business_contacts,
                business_percentage: result.total_contacts > 0 ? 
                    Math.round((result.business_contacts / result.total_contacts) * 100) : 0,
                picture_percentage: result.total_contacts > 0 ? 
                    Math.round((result.contacts_with_picture / result.total_contacts) * 100) : 0,
                recent_interaction_percentage: result.total_contacts > 0 ? 
                    Math.round((result.contacts_with_recent_interaction / result.total_contacts) * 100) : 0,
                sync_today_percentage: result.total_contacts > 0 ? 
                    Math.round((result.contacts_synced_today / result.total_contacts) * 100) : 0
            };

        } catch (error) {
            this.logger.error('Error getting contact statistics:', error);
            throw new Error(`Failed to get contact statistics: ${error.message}`);
        }
    }

    /**
     * Delete contact (soft delete)
     */
    async deleteContact(userId, placeId, contactId) {
        try {
            const contact = await Contact.findOneAndUpdate(
                {
                    user_id: userId,
                    place_id: placeId,
                    contact_id: contactId,
                    status: 'active'
                },
                {
                    status: 'deleted',
                    deleted_at: new Date(),
                    updated_at: new Date()
                }
            );

            if (!contact) {
                throw new Error(`Contact not found: ${contactId}`);
            }

            this.logger.info(`Contact deleted: ${contactId}`);
            return { success: true, message: 'Contact deleted successfully' };

        } catch (error) {
            this.logger.error(`Error deleting contact ${contactId}:`, error);
            throw new Error(`Failed to delete contact: ${error.message}`);
        }
    }

    /**
     * Format contact response
     */
    formatContactResponse(contact) {
        return {
            contact_id: contact.contact_id,
            name: contact.name,
            number: contact.number,
            whatsapp_id: contact.whatsapp_id,
            is_business: contact.is_business,
            business_info: contact.business_info,
            last_interaction: contact.last_interaction,
            last_seen: contact.last_seen,
            profile_picture_url: contact.profile_picture_url,
            tags: contact.tags || [],
            custom_fields: contact.custom_fields || {},
            message_count: contact.message_count || 0,
            last_message_date: contact.last_message_date,
            created_at: contact.created_at,
            updated_at: contact.updated_at
        };
    }

    /**
     * Format contact search result
     */
    formatContactSearchResult(contact) {
        return {
            contact_id: contact.contact_id,
            name: contact.name,
            number: contact.number,
            is_business: contact.is_business,
            last_interaction: contact.last_interaction,
            profile_picture_url: contact.profile_picture_url,
            tags: contact.tags || []
        };
    }

    /**
     * Bulk update contacts
     */
    async bulkUpdateContacts(userId, placeId, updates) {
        try {
            this.logger.start(`Bulk updating ${updates.length} contacts`);
            
            const results = [];
            
            for (const update of updates) {
                try {
                    const contact = await Contact.findOneAndUpdate(
                        {
                            user_id: userId,
                            place_id: placeId,
                            contact_id: update.contact_id,
                            status: 'active'
                        },
                        {
                            ...update.data,
                            updated_at: new Date()
                        },
                        { new: true }
                    );

                    if (contact) {
                        results.push({
                            contact_id: update.contact_id,
                            status: 'success',
                            data: this.formatContactResponse(contact)
                        });
                    } else {
                        results.push({
                            contact_id: update.contact_id,
                            status: 'failed',
                            error: 'Contact not found'
                        });
                    }
                } catch (error) {
                    results.push({
                        contact_id: update.contact_id,
                        status: 'failed',
                        error: error.message
                    });
                }
            }

            this.logger.success(`Bulk update completed: ${results.filter(r => r.status === 'success').length} succeeded`);
            
            return {
                total: updates.length,
                successful: results.filter(r => r.status === 'success').length,
                failed: results.filter(r => r.status === 'failed').length,
                results
            };

        } catch (error) {
            this.logger.error('Error in bulk update contacts:', error);
            throw new Error(`Failed to bulk update contacts: ${error.message}`);
        }
    }
}

module.exports = ContactService;
