const ContactService = require('../services/contact/ContactService');
const GroupService = require('../services/contact/GroupService');
const WhatsAppService = require('../services/whatsapp/WhatsAppService');
const ApiResponse = require('../utils/ApiResponse');
const Logger = require('../utils/Logger');

/**
 * Controller for contact operations
 * Implements Controller pattern for contact-related HTTP requests
 */
class ContactController {
    constructor() {
        this.contactService = new ContactService();
        this.groupService = new GroupService();
        this.whatsAppService = new WhatsAppService();
        this.logger = new Logger('ContactController');
    }

    /**
     * Get all contacts for a user with pagination and filters
     */
    async getAllContacts(req, res) {
        try {
            const { 
                user_id, 
                place_id, 
                page = 1, 
                limit = 50,
                search,
                is_business,
                has_profile_picture
            } = req.query;

            this.logger.info(`Getting contacts for user ${user_id}, place ${place_id}`);

            const filters = {};
            if (search) filters.search = search;
            if (is_business !== undefined) filters.is_business = is_business === 'true';
            if (has_profile_picture !== undefined) filters.has_profile_picture = has_profile_picture === 'true';

            const result = await this.contactService.getAllContacts(
                parseInt(user_id),
                parseInt(place_id),
                {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    ...filters
                }
            );

            return ApiResponse.success(res, result, `Found ${result.total} contacts`);
        } catch (error) {
            this.logger.error('Error getting all contacts:', error);
            return ApiResponse.error(res, error.message, 500);
        }
    }

    /**
     * Get all groups for a user
     */
    async getUserGroups(req, res) {
        try {
            const { user_id, place_id, page = 1, limit = 50 } = req.query;

            this.logger.info(`Getting groups for user ${user_id}, place ${place_id}`);

            const groups = await this.groupService.getUserGroups(
                parseInt(user_id), 
                parseInt(place_id),
                {
                    page: parseInt(page),
                    limit: parseInt(limit)
                }
            );

            return ApiResponse.success(res, groups, `Found ${groups.total || groups.length} groups`);
        } catch (error) {
            this.logger.error('Error getting user groups:', error);
            return ApiResponse.error(res, error.message, 500);
        }
    }

    /**
     * Get contacts by group ID
     */
    async getContactsByGroup(req, res) {
        try {
            const { user_id, place_id, page = 1, limit = 50 } = req.query;
            const { group_id } = req.params;

            this.logger.info(`Getting contacts for group ${group_id}`);

            const groupData = await this.groupService.getContactsByGroupId(
                parseInt(user_id), 
                parseInt(place_id),
                group_id,
                {
                    page: parseInt(page),
                    limit: parseInt(limit)
                }
            );

            return ApiResponse.success(res, groupData, `Found ${groupData.contacts.length} contacts in group`);
        } catch (error) {
            this.logger.error('Error getting group contacts:', error);
            return ApiResponse.error(res, error.message, 500);
        }
    }

    /**
     * Create custom group
     */
    async createGroup(req, res) {
        try {
            const { user_id, place_id, name, description, contact_ids } = req.body;

            // Validation
            if (!user_id || !place_id || !name || !contact_ids) {
                return ApiResponse.error(res, 'Missing required fields: user_id, place_id, name, contact_ids', 400);
            }

            if (!Array.isArray(contact_ids) || contact_ids.length === 0) {
                return ApiResponse.error(res, 'contact_ids must be a non-empty array', 400);
            }

            this.logger.info(`Creating group "${name}" with ${contact_ids.length} contacts`);

            // Get session ID from WhatsApp service
            const sessionStatus = await this.whatsAppService.getSessionStatus(
                parseInt(user_id), 
                parseInt(place_id)
            );
            
            if (!sessionStatus.session_exists) {
                return ApiResponse.error(res, 'No active session found', 400);
            }

            const group = await this.groupService.createCustomGroup(
                parseInt(user_id),
                parseInt(place_id),
                sessionStatus.session_id,
                { name, description, contact_ids }
            );

            return ApiResponse.created(res, group, 'Group created successfully');
        } catch (error) {
            this.logger.error('Error creating group:', error);
            return ApiResponse.error(res, error.message, 500);
        }
    }

    /**
     * Update group contacts
     */
    async updateGroupContacts(req, res) {
        try {
            const { user_id, place_id, contact_ids } = req.body;
            const { group_id } = req.params;

            // Validation
            if (!user_id || !place_id || !contact_ids) {
                return ApiResponse.error(res, 'Missing required fields: user_id, place_id, contact_ids', 400);
            }

            if (!Array.isArray(contact_ids)) {
                return ApiResponse.error(res, 'contact_ids must be an array', 400);
            }

            this.logger.info(`Updating group ${group_id} with ${contact_ids.length} contacts`);

            const result = await this.groupService.updateGroupContacts(
                parseInt(user_id),
                parseInt(place_id),
                group_id,
                contact_ids
            );

            return ApiResponse.success(res, result, 'Group contacts updated successfully');
        } catch (error) {
            this.logger.error('Error updating group contacts:', error);
            return ApiResponse.error(res, error.message, 500);
        }
    }

    /**
     * Delete group
     */
    async deleteGroup(req, res) {
        try {
            const { user_id, place_id } = req.query;
            const { group_id } = req.params;

            if (!user_id || !place_id) {
                return ApiResponse.error(res, 'Missing required query parameters: user_id, place_id', 400);
            }

            this.logger.info(`Deleting group ${group_id}`);

            const result = await this.groupService.deleteGroup(
                parseInt(user_id),
                parseInt(place_id),
                group_id
            );

            return ApiResponse.success(res, result, 'Group deleted successfully');
        } catch (error) {
            this.logger.error('Error deleting group:', error);
            return ApiResponse.error(res, error.message, 500);
        }
    }

    /**
     * Search contacts
     */
    async searchContacts(req, res) {
        try {
            const { 
                user_id, 
                place_id, 
                q, 
                is_business, 
                has_profile_picture, 
                last_interaction_days, 
                tags,
                limit = 100,
                page = 1
            } = req.query;

            if (!user_id || !place_id) {
                return ApiResponse.error(res, 'Missing required query parameters: user_id, place_id', 400);
            }

            this.logger.info(`Searching contacts for user ${user_id} with query: "${q || 'all'}"`);

            const filters = {
                page: parseInt(page),
                limit: parseInt(limit)
            };
            
            if (is_business !== undefined) filters.is_business = is_business === 'true';
            if (has_profile_picture !== undefined) filters.has_profile_picture = has_profile_picture === 'true';
            if (last_interaction_days) filters.last_interaction_days = parseInt(last_interaction_days);
            if (tags) filters.tags = tags.split(',');

            const contacts = await this.contactService.searchContacts(
                parseInt(user_id),
                parseInt(place_id),
                q,
                filters
            );

            return ApiResponse.success(res, contacts, `Found ${contacts.total || contacts.length} contacts`);
        } catch (error) {
            this.logger.error('Error searching contacts:', error);
            return ApiResponse.error(res, error.message, 500);
        }
    }

    /**
     * Get contact by ID
     */
    async getContactById(req, res) {
        try {
            const { user_id, place_id } = req.query;
            const { contact_id } = req.params;

            if (!user_id || !place_id) {
                return ApiResponse.error(res, 'Missing required query parameters: user_id, place_id', 400);
            }

            this.logger.info(`Getting contact details for ${contact_id}`);

            const contact = await this.contactService.getContactById(
                parseInt(user_id),
                parseInt(place_id),
                contact_id
            );

            if (!contact) {
                return ApiResponse.error(res, 'Contact not found', 404);
            }

            return ApiResponse.success(res, contact, 'Contact details retrieved successfully');
        } catch (error) {
            this.logger.error('Error getting contact:', error);
            return ApiResponse.error(res, error.message, 500);
        }
    }

    /**
     * Update contact tags
     */
    async updateContactTags(req, res) {
        try {
            const { user_id, place_id, tags } = req.body;
            const { contact_id } = req.params;

            if (!user_id || !place_id || !tags) {
                return ApiResponse.error(res, 'Missing required fields: user_id, place_id, tags', 400);
            }

            if (!Array.isArray(tags)) {
                return ApiResponse.error(res, 'tags must be an array', 400);
            }

            this.logger.info(`Updating tags for contact ${contact_id}`);

            const contact = await this.contactService.updateContactTags(
                parseInt(user_id),
                parseInt(place_id),
                contact_id,
                tags
            );

            return ApiResponse.success(res, contact, 'Contact tags updated successfully');
        } catch (error) {
            this.logger.error('Error updating contact tags:', error);
            return ApiResponse.error(res, error.message, 500);
        }
    }

    /**
     * Update contact info
     */
    async updateContactInfo(req, res) {
        try {
            const { user_id, place_id, name, notes, tags } = req.body;
            const { contact_id } = req.params;

            if (!user_id || !place_id) {
                return ApiResponse.error(res, 'Missing required fields: user_id, place_id', 400);
            }

            this.logger.info(`Updating info for contact ${contact_id}`);

            const updateData = {};
            if (name !== undefined) updateData.name = name;
            if (notes !== undefined) updateData.notes = notes;
            if (tags !== undefined) {
                if (!Array.isArray(tags)) {
                    return ApiResponse.error(res, 'tags must be an array', 400);
                }
                updateData.tags = tags;
            }

            const contact = await this.contactService.updateContactInfo(
                parseInt(user_id),
                parseInt(place_id),
                contact_id,
                updateData
            );

            return ApiResponse.success(res, contact, 'Contact info updated successfully');
        } catch (error) {
            this.logger.error('Error updating contact info:', error);
            return ApiResponse.error(res, error.message, 500);
        }
    }

    /**
     * Get contact statistics
     */
    async getContactStatistics(req, res) {
        try {
            const { user_id, place_id } = req.query;

            if (!user_id || !place_id) {
                return ApiResponse.error(res, 'Missing required query parameters: user_id, place_id', 400);
            }

            const stats = await this.contactService.getContactStatistics(
                parseInt(user_id),
                parseInt(place_id)
            );

            return ApiResponse.success(res, stats, 'Contact statistics retrieved successfully');
        } catch (error) {
            this.logger.error('Error getting contact statistics:', error);
            return ApiResponse.error(res, error.message, 500);
        }
    }

    /**
     * Get group statistics
     */
    async getGroupStatistics(req, res) {
        try {
            const { user_id, place_id } = req.query;

            if (!user_id || !place_id) {
                return ApiResponse.error(res, 'Missing required query parameters: user_id, place_id', 400);
            }

            const stats = await this.groupService.getGroupStatistics(
                parseInt(user_id),
                parseInt(place_id)
            );

            return ApiResponse.success(res, stats, 'Group statistics retrieved successfully');
        } catch (error) {
            this.logger.error('Error getting group statistics:', error);
            return ApiResponse.error(res, error.message, 500);
        }
    }

    /**
     * Duplicate group
     */
    async duplicateGroup(req, res) {
        try {
            const { user_id, place_id, new_name } = req.body;
            const { group_id } = req.params;

            if (!user_id || !place_id || !new_name) {
                return ApiResponse.error(res, 'Missing required fields: user_id, place_id, new_name', 400);
            }

            this.logger.info(`Duplicating group ${group_id} as "${new_name}"`);

            // Get session ID
            const sessionStatus = await this.whatsAppService.getSessionStatus(
                parseInt(user_id), 
                parseInt(place_id)
            );
            
            if (!sessionStatus.session_exists) {
                return ApiResponse.error(res, 'No active session found', 400);
            }

            const duplicatedGroup = await this.groupService.duplicateGroup(
                parseInt(user_id),
                parseInt(place_id),
                sessionStatus.session_id,
                group_id,
                new_name
            );

            return ApiResponse.created(res, duplicatedGroup, 'Group duplicated successfully');
        } catch (error) {
            this.logger.error('Error duplicating group:', error);
            return ApiResponse.error(res, error.message, 500);
        }
    }

    /**
     * Update group info (name and description)
     */
    async updateGroupInfo(req, res) {
        try {
            const { user_id, place_id, name, description } = req.body;
            const { group_id } = req.params;

            if (!user_id || !place_id) {
                return ApiResponse.error(res, 'Missing required fields: user_id, place_id', 400);
            }

            if (!name && !description) {
                return ApiResponse.error(res, 'At least one field (name or description) must be provided', 400);
            }

            this.logger.info(`Updating info for group ${group_id}`);

            const updateData = {};
            if (name) updateData.name = name;
            if (description !== undefined) updateData.description = description;

            const result = await this.groupService.updateGroupInfo(
                parseInt(user_id),
                parseInt(place_id),
                group_id,
                updateData
            );

            return ApiResponse.success(res, result, 'Group info updated successfully');
        } catch (error) {
            this.logger.error('Error updating group info:', error);
            return ApiResponse.error(res, error.message, 500);
        }
    }

    /**
     * Get group by ID
     */
    async getGroupById(req, res) {
        try {
            const { user_id, place_id } = req.query;
            const { group_id } = req.params;

            if (!user_id || !place_id) {
                return ApiResponse.error(res, 'Missing required query parameters: user_id, place_id', 400);
            }

            this.logger.info(`Getting group details for ${group_id}`);

            const group = await this.groupService.getGroupById(
                parseInt(user_id),
                parseInt(place_id),
                group_id
            );

            if (!group) {
                return ApiResponse.error(res, 'Group not found', 404);
            }

            return ApiResponse.success(res, group, 'Group details retrieved successfully');
        } catch (error) {
            this.logger.error('Error getting group:', error);
            return ApiResponse.error(res, error.message, 500);
        }
    }

    /**
     * Bulk update contacts
     */
    async bulkUpdateContacts(req, res) {
        try {
            const { user_id, place_id, updates } = req.body;

            if (!user_id || !place_id || !updates) {
                return ApiResponse.error(res, 'Missing required fields: user_id, place_id, updates', 400);
            }

            if (!Array.isArray(updates) || updates.length === 0) {
                return ApiResponse.error(res, 'updates must be a non-empty array', 400);
            }

            this.logger.info(`Bulk updating ${updates.length} contacts`);

            const result = await this.contactService.bulkUpdateContacts(
                parseInt(user_id),
                parseInt(place_id),
                updates
            );

            return ApiResponse.success(res, result, `Bulk update completed: ${result.successful} successful, ${result.failed} failed`);
        } catch (error) {
            this.logger.error('Error in bulk update contacts:', error);
            return ApiResponse.error(res, error.message, 500);
        }
    }

    /**
     * Delete contact
     */
    async deleteContact(req, res) {
        try {
            const { user_id, place_id } = req.query;
            const { contact_id } = req.params;

            if (!user_id || !place_id) {
                return ApiResponse.error(res, 'Missing required query parameters: user_id, place_id', 400);
            }

            this.logger.info(`Deleting contact ${contact_id}`);

            const result = await this.contactService.deleteContact(
                parseInt(user_id),
                parseInt(place_id),
                contact_id
            );

            return ApiResponse.success(res, result, 'Contact deleted successfully');
        } catch (error) {
            this.logger.error('Error deleting contact:', error);
            return ApiResponse.error(res, error.message, 500);
        }
    }

    /**
     * Export contacts to CSV
     */
    async exportContacts(req, res) {
        try {
            const { user_id, place_id, format = 'csv' } = req.query;

            if (!user_id || !place_id) {
                return ApiResponse.error(res, 'Missing required query parameters: user_id, place_id', 400);
            }

            this.logger.info(`Exporting contacts for user ${user_id}, place ${place_id}`);

            const exportData = await this.contactService.exportContacts(
                parseInt(user_id),
                parseInt(place_id),
                format
            );

            // Set appropriate headers for file download
            res.setHeader('Content-Type', format === 'json' ? 'application/json' : 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename=contacts_${user_id}_${place_id}.${format}`);

            return res.send(exportData);
        } catch (error) {
            this.logger.error('Error exporting contacts:', error);
            return ApiResponse.error(res, error.message, 500);
        }
    }

    /**
     * Import contacts from CSV
     */
    async importContacts(req, res) {
        try {
            const { user_id, place_id } = req.body;

            if (!user_id || !place_id) {
                return ApiResponse.error(res, 'Missing required fields: user_id, place_id', 400);
            }

            if (!req.file) {
                return ApiResponse.error(res, 'No file uploaded', 400);
            }

            this.logger.info(`Importing contacts for user ${user_id}, place ${place_id}`);

            const result = await this.contactService.importContacts(
                parseInt(user_id),
                parseInt(place_id),
                req.file
            );

            return ApiResponse.success(res, result, `Import completed: ${result.imported} contacts imported, ${result.failed} failed`);
        } catch (error) {
            this.logger.error('Error importing contacts:', error);
            return ApiResponse.error(res, error.message, 500);
        }
    }

    /**
     * Sync contacts from WhatsApp
     */
    async syncContacts(req, res) {
        try {
            const { user_id, place_id } = req.body;

            if (!user_id || !place_id) {
                return ApiResponse.error(res, 'Missing required fields: user_id, place_id', 400);
            }

            this.logger.info(`Syncing contacts for user ${user_id}, place ${place_id}`);

            const result = await this.whatsAppService.syncContacts(
                parseInt(user_id),
                parseInt(place_id)
            );

            return ApiResponse.success(res, result, 'Contact sync completed successfully');
        } catch (error) {
            this.logger.error('Error syncing contacts:', error);
            return ApiResponse.error(res, error.message, 500);
        }
    }

    /**
     * Get contact sync status
     */
    async getContactSyncStatus(req, res) {
        try {
            const { user_id, place_id } = req.query;

            if (!user_id || !place_id) {
                return ApiResponse.error(res, 'Missing required query parameters: user_id, place_id', 400);
            }

            const sessionStatus = await this.whatsAppService.getSessionStatus(
                parseInt(user_id),
                parseInt(place_id)
            );

            const syncStatus = {
                session_exists: sessionStatus.session_exists,
                session_status: sessionStatus.status,
                contacts_fetch_progress: sessionStatus.contacts_fetch_progress || 0,
                contacts_fetch_completed: sessionStatus.contacts_fetch_completed || false,
                contacts_fetch_error: sessionStatus.contacts_fetch_error || null,
                last_contacts_sync: sessionStatus.last_contacts_sync || null,
                total_contacts: sessionStatus.total_contacts || 0
            };

            return ApiResponse.success(res, syncStatus, 'Contact sync status retrieved successfully');
        } catch (error) {
            this.logger.error('Error getting contact sync status:', error);
            return ApiResponse.error(res, error.message, 500);
        }
    }
}

module.exports = ContactController;