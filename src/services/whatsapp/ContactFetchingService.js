const Logger = require('../../utils/Logger');

/**
 * Service for managing background contact fetching
 * Implements Single Responsibility Principle
 */
class ContactFetchingService {
    constructor() {
        this.logger = new Logger('ContactFetchingService');
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
            
            this.logger.info(`Found ${validContacts.length} valid contacts to process`);
            
            // Process contacts in batches
            const contactsWithDetails = await this.processContactsInBatches(
                validContacts, 
                client, 
                sessionId,
                onProgressUpdate
            );
            
            // Import ContactService here to avoid circular dependency
            const ContactService = require('../contact/ContactService');
            const contactService = new ContactService();
            
            // Save contacts to database
            this.logger.info(`Saving ${contactsWithDetails.length} contacts to database...`);
            const savedContacts = await contactService.saveContacts(
                userId, 
                placeId, 
                sessionId, 
                contactsWithDetails
            );
            
            // Update final status
            if (onProgressUpdate) {
                await onProgressUpdate({
                    status: 'connected',
                    progress: 100,
                    completed: true,
                    total_contacts: savedContacts.length
                });
            }
            
            this.logger.complete(`Background contact fetch for session ${sessionId}: ${savedContacts.length} contacts`);
            
            return {
                success: true,
                total_contacts: savedContacts.length,
                processed_contacts: contactsWithDetails.length
            };
            
        } catch (error) {
            this.logger.error(`Error in background contact fetch for session ${sessionId}:`, error);
            
            // Update error status
            if (onProgressUpdate) {
                await onProgressUpdate({
                    status: 'connected',
                    progress: 0,
                    error: error.message
                });
            }
            
            throw error;
        }
    }

    /**
     * Filter valid WhatsApp contacts
     */
    filterValidContacts(contacts) {
        return contacts.filter(
            contact => contact.id?.server === 'c.us' && contact.isWAContact
        );
    }

    /**
     * Process contacts in batches to avoid overwhelming the system
     */
    async processContactsInBatches(validContacts, client, sessionId, onProgressUpdate) {
        const contactsWithDetails = [];
        const batchSize = 10; // Process 10 contacts at a time
        const totalContacts = validContacts.length;
        
        for (let i = 0; i < validContacts.length; i += batchSize) {
            const batch = validContacts.slice(i, i + batchSize);
            
            this.logger.debug(`Processing batch ${Math.ceil((i + 1) / batchSize)} of ${Math.ceil(totalContacts / batchSize)}`);
            
            // Process batch in parallel
            const batchPromises = batch.map(contact => 
                this.processSingleContact(contact, client)
            );
            
            // Wait for current batch to complete
            const batchResults = await Promise.allSettled(batchPromises);
            
            // Extract successful results
            const successfulResults = batchResults
                .filter(result => result.status === 'fulfilled')
                .map(result => result.value);
                
            contactsWithDetails.push(...successfulResults);
            
            // Update progress
            const progress = Math.round(((i + batchSize) / totalContacts) * 100);
            const currentProgress = Math.min(progress, 100);
            
            if (onProgressUpdate) {
                await onProgressUpdate({
                    status: 'fetching_contacts',
                    progress: currentProgress
                });
            }
            
            this.logger.progress(
                'Contact fetch progress', 
                Math.min(i + batchSize, totalContacts), 
                totalContacts
            );
            
            // Small delay between batches to prevent overwhelming
            if (i + batchSize < validContacts.length) {
                await this.delay(100);
            }
        }
        
        return contactsWithDetails;
    }

    /**
     * Process a single contact with timeout and error handling
     */
    async processSingleContact(contact, client) {
        try {
            // Validate contact object
            if (!contact || !contact.id || !contact.id.user) {
                throw new Error('Invalid contact object');
            }

            // Get profile picture with timeout
            const profilePicUrl = await this.getProfilePictureWithTimeout(
                client, 
                contact.id._serialized, 
                5000
            );
            
            return {
                name: contact.name || contact.pushname || contact.verifiedName || '-',
                number: contact.id.user,
                whatsapp_id: contact.id._serialized,
                profile_picture_url: profilePicUrl,
                is_business: contact.isBusiness || false,
                business_info: contact.businessProfile || {},
                last_interaction: contact.lastSeen || null,
                last_seen: contact.lastSeen || null
            };
        } catch (contactError) {
            this.logger.warn(`Error getting details for contact ${contact.id?.user || 'unknown'}:`, contactError);
            
            // Still return basic contact info on error
            return {
                name: contact.name || contact.pushname || '-',
                number: contact.id?.user || 'unknown',
                whatsapp_id: contact.id?._serialized || 'unknown',
                profile_picture_url: null,
                is_business: false,
                business_info: {},
                last_interaction: null,
                last_seen: null
            };
        }
    }

    /**
     * Get profile picture with timeout
     */
    async getProfilePictureWithTimeout(client, whatsappId, timeoutMs = 5000) {
        try {
            if (!whatsappId) {
                return null;
            }

            const profilePicPromise = client.getProfilePicUrl(whatsappId);
            
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('timeout')), timeoutMs)
            );
            
            return await Promise.race([profilePicPromise, timeoutPromise]);
        } catch (error) {
            // Return null if profile picture fetch fails
            return null;
        }
    }

    /**
     * Utility function for delays
     */
    async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Estimate time remaining for contact fetching
     */
    estimateTimeRemaining(processed, total, startTime) {
        if (processed === 0) return null;
        
        const elapsed = Date.now() - startTime;
        const avgTimePerContact = elapsed / processed;
        const remaining = (total - processed) * avgTimePerContact;
        
        return {
            estimated_remaining_ms: Math.round(remaining),
            estimated_remaining_minutes: Math.round(remaining / 60000),
            avg_time_per_contact_ms: Math.round(avgTimePerContact)
        };
    }

    /**
     * Get contact fetching statistics
     */
    getContactFetchingStats(validContacts, processedContacts, startTime) {
        const endTime = Date.now();
        const totalTime = endTime - startTime;
        
        return {
            total_found: validContacts.length,
            successfully_processed: processedContacts.length,
            failed_to_process: validContacts.length - processedContacts.length,
            total_time_ms: totalTime,
            total_time_minutes: Math.round(totalTime / 60000),
            avg_time_per_contact: Math.round(totalTime / processedContacts.length),
            success_rate: Math.round((processedContacts.length / validContacts.length) * 100)
        };
    }

    /**
     * Validate contact data before processing
     */
    validateContact(contact) {
        return contact && 
               contact.id && 
               contact.id.user &&
               contact.id._serialized &&
               contact.id.server === 'c.us' &&
               contact.isWAContact;
    }

    /**
     * Clean and format contact name
     */
    formatContactName(contact) {
        const name = contact.name || contact.pushname || contact.verifiedName;
        if (!name) return '-';
        
        // Clean name - remove special characters and trim
        return name.replace(/[^\w\s]/gi, '').trim().substring(0, 100) || '-';
    }

    /**
     * Get contact business information safely
     */
    getBusinessInfo(contact) {
        if (!contact.isBusiness || !contact.businessProfile) {
            return {};
        }

        return {
            business_name: contact.businessProfile.businessName || null,
            category: contact.businessProfile.category || null,
            description: contact.businessProfile.description || null,
            website: contact.businessProfile.website || null,
            email: contact.businessProfile.email || null,
            address: contact.businessProfile.address || null
        };
    }

    /**
     * Process contacts with retry mechanism
     */
    async processContactWithRetry(contact, client, maxRetries = 2) {
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                return await this.processSingleContact(contact, client);
            } catch (error) {
                if (attempt === maxRetries) {
                    // Last attempt failed, return basic info
                    this.logger.warn(`Failed to process contact ${contact.id?.user} after ${maxRetries + 1} attempts`);
                    return {
                        name: this.formatContactName(contact),
                        number: contact.id?.user || 'unknown',
                        whatsapp_id: contact.id?._serialized || 'unknown',
                        profile_picture_url: null,
                        is_business: false,
                        business_info: {},
                        last_interaction: null,
                        last_seen: null
                    };
                }
                
                // Wait before retry
                await this.delay(1000 * (attempt + 1));
            }
        }
    }
}

module.exports = ContactFetchingService;
