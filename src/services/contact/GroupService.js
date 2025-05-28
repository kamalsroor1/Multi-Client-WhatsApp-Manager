const ContactGroup = require('../../models/ContactGroup');
const ContactService = require('./ContactService');
const Logger = require('../../utils/Logger');

/**
 * Service for managing contact groups
 * Implements Single Responsibility Principle
 */
class GroupService {
    constructor() {
        this.contactService = new ContactService();
        this.logger = new Logger('GroupService');
    }

    /**
     * Generate unique group ID
     */
    generateGroupId(userId, placeId, groupName) {
        const cleanName = groupName.replace(/\s+/g, '_').toLowerCase().replace(/[^a-z0-9_]/g, '');
        return `group_${userId}_${placeId}_${cleanName}_${Date.now()}`;
    }

    /**
     * Create default groups when contacts are imported
     */
    async createDefaultGroups(userId, placeId, sessionId, contacts) {
        try {
            this.logger.start(`Creating default groups for user ${userId}`);
            
            const now = new Date();
            const ninetyDaysAgo = new Date(now.getTime() - (90 * 24 * 60 * 60 * 1000));
            
            // Remove existing default groups
            await ContactGroup.deleteMany({
                user_id: userId,
                place_id: placeId,
                group_type: 'auto'
            });
            
            const groupsToCreate = [];
            
            // All Contacts group
            groupsToCreate.push({
                user_id: userId,
                place_id: placeId,
                session_id: sessionId,
                group_id: this.generateGroupId(userId, placeId, 'all'),
                name: 'All Contacts',
                description: 'All WhatsApp contacts',
                contact_ids: contacts.map(c => c._id),
                group_type: 'auto',
                filter_criteria: {}
            });
            
            // Recent Contacts group (last 90 days)
            const recentContacts = contacts.filter(contact => 
                contact.last_interaction && contact.last_interaction >= ninetyDaysAgo
            );
            
            if (recentContacts.length > 0) {
                groupsToCreate.push({
                    user_id: userId,
                    place_id: placeId,
                    session_id: sessionId,
                    group_id: this.generateGroupId(userId, placeId, 'recent'),
                    name: 'Recent Contacts (90 days)',
                    description: 'Contacts with activity in the last 90 days',
                    contact_ids: recentContacts.map(c => c._id),
                    group_type: 'auto',
                    filter_criteria: {
                        last_interaction_days: 90
                    }
                });
            }
            
            // Business Contacts group
            const businessContacts = contacts.filter(contact => contact.is_business);
            
            if (businessContacts.length > 0) {
                groupsToCreate.push({
                    user_id: userId,
                    place_id: placeId,
                    session_id: sessionId,
                    group_id: this.generateGroupId(userId, placeId, 'business'),
                    name: 'Business Contacts',
                    description: 'WhatsApp Business accounts',
                    contact_ids: businessContacts.map(c => c._id),
                    group_type: 'auto',
                    filter_criteria: {
                        is_business: true
                    }
                });
            }
            
            // Contacts with Profile Picture group
            const contactsWithPicture = contacts.filter(contact => 
                contact.profile_picture_url && contact.profile_picture_url.trim() !== ''
            );
            
            if (contactsWithPicture.length > 0) {
                groupsToCreate.push({
                    user_id: userId,
                    place_id: placeId,
                    session_id: sessionId,
                    group_id: this.generateGroupId(userId, placeId, 'with_picture'),
                    name: 'Contacts with Profile Picture',
                    description: 'Contacts that have profile pictures',
                    contact_ids: contactsWithPicture.map(c => c._id),
                    group_type: 'auto',
                    filter_criteria: {
                        has_profile_picture: true
                    }
                });
            }
            
            // Create all groups
            const createdGroups = await ContactGroup.insertMany(groupsToCreate);
            
            this.logger.success(`Created ${createdGroups.length} default groups for user ${userId}`);
            
            return createdGroups;
            
        } catch (error) {
            this.logger.error('Error creating default groups:', error);
            throw new Error(`Failed to create default groups: ${error.message}`);
        }
    }

    /**
     * Get all groups for a user
     */
    async getUserGroups(userId, placeId) {
        try {
            const groups = await ContactGroup.find({
                user_id: userId,
                place_id: placeId,
                is_active: true
            })
            .select('group_id name description group_type contact_ids created_at filter_criteria')
            .sort({ group_type: 1, name: 1 })
            .lean();
            
            return groups.map(group => this.formatGroupResponse(group));
            
        } catch (error) {
            this.logger.error('Error getting user groups:', error);
            throw new Error(`Failed to get user groups: ${error.message}`);
        }
    }

    /**
     * Get contacts by group ID
     */
    async getContactsByGroupId(userId, placeId, groupId) {
        try {
            const group = await ContactGroup.findOne({
                user_id: userId,
                place_id: placeId,
                group_id: groupId,
                is_active: true
            }).populate('contact_ids');
            
            if (!group) {
                throw new Error(`Group not found: ${groupId}`);
            }
            
            // Filter out inactive contacts
            const activeContacts = group.contact_ids.filter(contact => 
                contact.status === 'active'
            );
            
            return {
                group_info: {
                    group_id: group.group_id,
                    name: group.name,
                    description: group.description,
                    group_type: group.group_type,
                    total_contacts: activeContacts.length,
                    filter_criteria: group.filter_criteria,
                    created_at: group.created_at,
                    updated_at: group.updated_at
                },
                contacts: activeContacts.map(contact => ({
                    contact_id: contact.contact_id,
                    name: contact.name,
                    number: contact.number,
                    is_business: contact.is_business,
                    last_interaction: contact.last_interaction,
                    profile_picture_url: contact.profile_picture_url,
                    tags: contact.tags || []
                }))
            };
            
        } catch (error) {
            this.logger.error(`Error getting contacts for group ${groupId}:`, error);
            throw new Error(`Failed to get group contacts: ${error.message}`);
        }
    }

    /**
     * Create custom group
     */
    async createCustomGroup(userId, placeId, sessionId, groupData) {
        try {
            const { name, description, contact_ids } = groupData;
            
            this.logger.start(`Creating custom group: ${name}`);
            
            // Validate contact IDs belong to user
            const validContacts = await this.validateContactIds(userId, placeId, contact_ids);
            
            if (validContacts.length !== contact_ids.length) {
                throw new Error('Some contact IDs are invalid or do not belong to this user');
            }
            
            // Check if group name already exists
            const existingGroup = await ContactGroup.findOne({
                user_id: userId,
                place_id: placeId,
                name: name,
                is_active: true
            });
            
            if (existingGroup) {
                throw new Error(`Group with name '${name}' already exists`);
            }
            
            const group = new ContactGroup({
                user_id: userId,
                place_id: placeId,
                session_id: sessionId,
                group_id: this.generateGroupId(userId, placeId, name),
                name: name.trim(),
                description: description?.trim() || '',
                contact_ids: validContacts.map(c => c._id),
                group_type: 'manual'
            });
            
            await group.save();
            
            this.logger.success(`Created custom group: ${name} with ${validContacts.length} contacts`);
            
            return this.formatGroupResponse({
                ...group.toObject(),
                contact_ids: validContacts
            });
            
        } catch (error) {
            this.logger.error('Error creating custom group:', error);
            throw new Error(`Failed to create custom group: ${error.message}`);
        }
    }

    /**
     * Update group contacts
     */
    async updateGroupContacts(userId, placeId, groupId, contactIds) {
        try {
            this.logger.start(`Updating contacts for group: ${groupId}`);
            
            const group = await ContactGroup.findOne({
                user_id: userId,
                place_id: placeId,
                group_id: groupId,
                group_type: 'manual',
                is_active: true
            });
            
            if (!group) {
                throw new Error('Group not found or cannot be modified (only manual groups can be updated)');
            }
            
            // Validate contact IDs
            const validContacts = await this.validateContactIds(userId, placeId, contactIds);
            
            if (validContacts.length !== contactIds.length) {
                throw new Error('Some contact IDs are invalid or do not belong to this user');
            }
            
            group.contact_ids = validContacts.map(c => c._id);
            group.updated_at = new Date();
            
            await group.save();
            
            this.logger.success(`Updated group ${groupId} with ${validContacts.length} contacts`);
            
            return {
                group_id: group.group_id,
                name: group.name,
                contacts_count: group.contact_ids.length,
                updated_at: group.updated_at
            };
            
        } catch (error) {
            this.logger.error(`Error updating group contacts for ${groupId}:`, error);
            throw new Error(`Failed to update group contacts: ${error.message}`);
        }
    }

    /**
     * Delete group
     */
    async deleteGroup(userId, placeId, groupId) {
        try {
            this.logger.start(`Deleting group: ${groupId}`);
            
            const group = await ContactGroup.findOne({
                user_id: userId,
                place_id: placeId,
                group_id: groupId,
                group_type: 'manual', // Only allow deletion of manual groups
                is_active: true
            });
            
            if (!group) {
                throw new Error('Group not found or cannot be deleted (only manual groups can be deleted)');
            }
            
            group.is_active = false;
            group.deleted_at = new Date();
            group.updated_at = new Date();
            await group.save();
            
            this.logger.success(`Group deleted: ${groupId}`);
            
            return { 
                success: true,
                message: 'Group deleted successfully',
                group_id: groupId,
                deleted_at: group.deleted_at
            };
            
        } catch (error) {
            this.logger.error(`Error deleting group ${groupId}:`, error);
            throw new Error(`Failed to delete group: ${error.message}`);
        }
    }

    /**
     * Validate contact IDs belong to user
     */
    async validateContactIds(userId, placeId, contactIds) {
        const Contact = require('../../models/Contact');
        
        return await Contact.find({
            user_id: userId,
            place_id: placeId,
            contact_id: { $in: contactIds },
            status: 'active'
        });
    }

    /**
     * Update group name and description
     */
    async updateGroupInfo(userId, placeId, groupId, updateData) {
        try {
            const { name, description } = updateData;
            
            const group = await ContactGroup.findOne({
                user_id: userId,
                place_id: placeId,
                group_id: groupId,
                group_type: 'manual',
                is_active: true
            });
            
            if (!group) {
                throw new Error('Group not found or cannot be modified');
            }
            
            // Check if new name already exists (if name is being changed)
            if (name && name !== group.name) {
                const existingGroup = await ContactGroup.findOne({
                    user_id: userId,
                    place_id: placeId,
                    name: name.trim(),
                    is_active: true,
                    _id: { $ne: group._id }
                });
                
                if (existingGroup) {
                    throw new Error(`Group with name '${name}' already exists`);
                }
                
                group.name = name.trim();
            }
            
            if (description !== undefined) {
                group.description = description?.trim() || '';
            }
            
            group.updated_at = new Date();
            await group.save();
            
            this.logger.success(`Updated group info: ${groupId}`);
            
            return this.formatGroupResponse(group.toObject());
            
        } catch (error) {
            this.logger.error(`Error updating group info for ${groupId}:`, error);
            throw new Error(`Failed to update group info: ${error.message}`);
        }
    }

    /**
     * Get group statistics
     */
    async getGroupStatistics(userId, placeId) {
        try {
            const stats = await ContactGroup.aggregate([
                { $match: { user_id: userId, place_id: placeId, is_active: true } },
                {
                    $group: {
                        _id: '$group_type',
                        count: { $sum: 1 },
                        total_contacts: { $sum: { $size: '$contact_ids' } }
                    }
                }
            ]);

            const result = {
                total_groups: 0,
                manual_groups: 0,
                auto_groups: 0,
                total_contacts_in_groups: 0
            };

            stats.forEach(stat => {
                result.total_groups += stat.count;
                result.total_contacts_in_groups += stat.total_contacts;
                
                if (stat._id === 'manual') {
                    result.manual_groups = stat.count;
                } else if (stat._id === 'auto') {
                    result.auto_groups = stat.count;
                }
            });

            return result;

        } catch (error) {
            this.logger.error('Error getting group statistics:', error);
            throw new Error(`Failed to get group statistics: ${error.message}`);
        }
    }

    /**
     * Format group response
     */
    formatGroupResponse(group) {
        return {
            group_id: group.group_id,
            name: group.name,
            description: group.description,
            group_type: group.group_type,
            contacts_count: Array.isArray(group.contact_ids) ? group.contact_ids.length : 0,
            filter_criteria: group.filter_criteria || {},
            created_at: group.created_at,
            updated_at: group.updated_at
        };
    }

    /**
     * Duplicate group
     */
    async duplicateGroup(userId, placeId, sessionId, groupId, newName) {
        try {
            const originalGroup = await ContactGroup.findOne({
                user_id: userId,
                place_id: placeId,
                group_id: groupId,
                is_active: true
            });

            if (!originalGroup) {
                throw new Error(`Group not found: ${groupId}`);
            }

            // Check if new name already exists
            const existingGroup = await ContactGroup.findOne({
                user_id: userId,
                place_id: placeId,
                name: newName.trim(),
                is_active: true
            });

            if (existingGroup) {
                throw new Error(`Group with name '${newName}' already exists`);
            }

            const duplicatedGroup = new ContactGroup({
                user_id: userId,
                place_id: placeId,
                session_id: sessionId,
                group_id: this.generateGroupId(userId, placeId, newName),
                name: newName.trim(),
                description: `Copy of ${originalGroup.name}`,
                contact_ids: [...originalGroup.contact_ids],
                group_type: 'manual', // Always create as manual group
                filter_criteria: {}
            });

            await duplicatedGroup.save();

            this.logger.success(`Duplicated group ${groupId} as ${newName}`);

            return this.formatGroupResponse(duplicatedGroup.toObject());

        } catch (error) {
            this.logger.error(`Error duplicating group ${groupId}:`, error);
            throw new Error(`Failed to duplicate group: ${error.message}`);
        }
    }

    /**
     * Get group by ID
     */
    async getGroupById(userId, placeId, groupId) {
        try {
            const group = await ContactGroup.findOne({
                user_id: userId,
                place_id: placeId,
                group_id: groupId,
                is_active: true
            }).lean();

            if (!group) {
                throw new Error(`Group not found: ${groupId}`);
            }

            return this.formatGroupResponse(group);

        } catch (error) {
            this.logger.error(`Error getting group ${groupId}:`, error);
            throw new Error(`Failed to get group: ${error.message}`);
        }
    }
}

module.exports = GroupService;
