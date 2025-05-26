const Contact = require('../models/Contact');
const ContactGroup = require('../models/ContactGroup');
const { v4: uuidv4 } = require('uuid');

// Generate unique contact ID
function generateContactId(userId, placeId, whatsappId) {
    return `contact_${userId}_${placeId}_${whatsappId}`;
}

// Generate unique group ID
function generateGroupId(userId, placeId, groupName) {
    return `group_${userId}_${placeId}_${groupName}_${Date.now()}`;
}

// Save or update contacts
async function saveContacts(userId, placeId, sessionId, contactsData) {
    try {
        const savedContacts = [];
        
        for (const contactData of contactsData) {
            const contactId = generateContactId(userId, placeId, contactData.whatsapp_id);
            
            let contact = await Contact.findOne({ contact_id: contactId });
            
            if (contact) {
                // Update existing contact
                contact.name = contactData.name;
                contact.last_interaction = contactData.last_interaction;
                contact.last_seen = contactData.last_seen;
                contact.is_business = contactData.is_business || false;
                contact.profile_picture_url = contactData.profile_picture_url;
                contact.updated_at = new Date();
            } else {
                // Create new contact
                contact = new Contact({
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
                    last_seen: contactData.last_seen
                });
            }
            
            await contact.save();
            savedContacts.push(contact);
        }
        
        // Create default groups
        await createDefaultGroups(userId, placeId, sessionId, savedContacts);
        
        return savedContacts;
        
    } catch (error) {
        console.error('Error saving contacts:', error);
        throw error;
    }
}

// Create default groups (all, last_90_days, business, etc.)
async function createDefaultGroups(userId, placeId, sessionId, contacts) {
    try {
        const now = new Date();
        const ninetyDaysAgo = new Date(now.getTime() - (90 * 24 * 60 * 60 * 1000));
        
        // Remove existing default groups
        await ContactGroup.deleteMany({
            user_id: userId,
            place_id: placeId,
            group_type: 'auto'
        });
        
        // Create "All Contacts" group
        const allContactsGroup = new ContactGroup({
            user_id: userId,
            place_id: placeId,
            session_id: sessionId,
            group_id: generateGroupId(userId, placeId, 'all'),
            name: 'All Contacts',
            description: 'All WhatsApp contacts',
            contact_ids: contacts.map(c => c._id),
            group_type: 'auto'
        });
        await allContactsGroup.save();
        
        // Create "Last 90 Days" group
        const recentContacts = contacts.filter(contact => 
            contact.last_interaction && contact.last_interaction >= ninetyDaysAgo
        );
        
        const recentGroup = new ContactGroup({
            user_id: userId,
            place_id: placeId,
            session_id: sessionId,
            group_id: generateGroupId(userId, placeId, 'recent'),
            name: 'Recent Contacts (90 days)',
            description: 'Contacts with activity in the last 90 days',
            contact_ids: recentContacts.map(c => c._id),
            group_type: 'auto',
            filter_criteria: {
                last_interaction_days: 90
            }
        });
        await recentGroup.save();
        
        // Create "Business Contacts" group
        const businessContacts = contacts.filter(contact => contact.is_business);
        
        if (businessContacts.length > 0) {
            const businessGroup = new ContactGroup({
                user_id: userId,
                place_id: placeId,
                session_id: sessionId,
                group_id: generateGroupId(userId, placeId, 'business'),
                name: 'Business Contacts',
                description: 'WhatsApp Business accounts',
                contact_ids: businessContacts.map(c => c._id),
                group_type: 'auto',
                filter_criteria: {
                    is_business: true
                }
            });
            await businessGroup.save();
        }
        
        // Create "With Profile Picture" group
        const contactsWithPicture = contacts.filter(contact => contact.profile_picture_url);
        
        if (contactsWithPicture.length > 0) {
            const pictureGroup = new ContactGroup({
                user_id: userId,
                place_id: placeId,
                session_id: sessionId,
                group_id: generateGroupId(userId, placeId, 'with_picture'),
                name: 'Contacts with Profile Picture',
                description: 'Contacts that have profile pictures',
                contact_ids: contactsWithPicture.map(c => c._id),
                group_type: 'auto',
                filter_criteria: {
                    has_profile_picture: true
                }
            });
            await pictureGroup.save();
        }
        
        console.log(`✅ Created default groups for user ${userId}, place ${placeId}`);
        
    } catch (error) {
        console.error('Error creating default groups:', error);
        throw error;
    }
}

// Get contacts by group ID
async function getContactsByGroupId(userId, placeId, groupId) {
    try {
        const group = await ContactGroup.findOne({
            user_id: userId,
            place_id: placeId,
            group_id: groupId,
            is_active: true
        }).populate('contact_ids');
        
        if (!group) {
            throw new Error('Group not found');
        }
        
        return {
            group_info: {
                group_id: group.group_id,
                name: group.name,
                description: group.description,
                group_type: group.group_type,
                total_contacts: group.contact_ids.length
            },
            contacts: group.contact_ids.map(contact => ({
                contact_id: contact.contact_id,
                name: contact.name,
                number: contact.number,
                is_business: contact.is_business,
                last_interaction: contact.last_interaction,
                profile_picture_url: contact.profile_picture_url
            }))
        };
        
    } catch (error) {
        console.error('Error getting contacts by group:', error);
        throw error;
    }
}

// Get all groups for a user
async function getUserGroups(userId, placeId) {
    try {
        const groups = await ContactGroup.find({
            user_id: userId,
            place_id: placeId,
            is_active: true
        }).select('group_id name description group_type contact_ids created_at');
        
        return groups.map(group => ({
            group_id: group.group_id,
            name: group.name,
            description: group.description,
            group_type: group.group_type,
            contacts_count: group.contact_ids.length,
            created_at: group.created_at
        }));
        
    } catch (error) {
        console.error('Error getting user groups:', error);
        throw error;
    }
}

// Create custom group
async function createCustomGroup(userId, placeId, sessionId, groupData) {
    try {
        const { name, description, contact_ids } = groupData;
        
        // Validate contact IDs belong to user
        const contacts = await Contact.find({
            user_id: userId,
            place_id: placeId,
            contact_id: { $in: contact_ids }
        });
        
        if (contacts.length !== contact_ids.length) {
            throw new Error('Some contact IDs are invalid');
        }
        
        const group = new ContactGroup({
            user_id: userId,
            place_id: placeId,
            session_id: sessionId,
            group_id: generateGroupId(userId, placeId, name.replace(/\s+/g, '_').toLowerCase()),
            name: name,
            description: description,
            contact_ids: contacts.map(c => c._id),
            group_type: 'manual'
        });
        
        await group.save();
        
        return {
            group_id: group.group_id,
            name: group.name,
            description: group.description,
            contacts_count: group.contact_ids.length
        };
        
    } catch (error) {
        console.error('Error creating custom group:', error);
        throw error;
    }
}

// Update group contacts
async function updateGroupContacts(userId, placeId, groupId, contactIds) {
    try {
        const group = await ContactGroup.findOne({
            user_id: userId,
            place_id: placeId,
            group_id: groupId,
            group_type: 'manual'
        });
        
        if (!group) {
            throw new Error('Group not found or cannot be modified');
        }
        
        // Validate contact IDs
        const contacts = await Contact.find({
            user_id: userId,
            place_id: placeId,
            contact_id: { $in: contactIds }
        });
        
        if (contacts.length !== contactIds.length) {
            throw new Error('Some contact IDs are invalid');
        }
        
        group.contact_ids = contacts.map(c => c._id);
        group.updated_at = new Date();
        
        await group.save();
        
        return {
            group_id: group.group_id,
            contacts_count: group.contact_ids.length
        };
        
    } catch (error) {
        console.error('Error updating group contacts:', error);
        throw error;
    }
}

// Delete group
async function deleteGroup(userId, placeId, groupId) {
    try {
        const group = await ContactGroup.findOne({
            user_id: userId,
            place_id: placeId,
            group_id: groupId,
            group_type: 'manual' // Only allow deletion of manual groups
        });
        
        if (!group) {
            throw new Error('Group not found or cannot be deleted');
        }
        
        group.is_active = false;
        group.updated_at = new Date();
        await group.save();
        
        return { success: true };
        
    } catch (error) {
        console.error('Error deleting group:', error);
        throw error;
    }
}

// Get contact by ID
async function getContactById(userId, placeId, contactId) {
    try {
        const contact = await Contact.findOne({
            user_id: userId,
            place_id: placeId,
            contact_id: contactId
        });
        
        if (!contact) {
            throw new Error('Contact not found');
        }
        
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
            tags: contact.tags,
            custom_fields: contact.custom_fields,
            message_count: contact.message_count,
            last_message_date: contact.last_message_date
        };
        
    } catch (error) {
        console.error('Error getting contact by ID:', error);
        throw error;
    }
}

// Search contacts
async function searchContacts(userId, placeId, query, filters = {}) {
    try {
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
                searchCriteria.profile_picture_url = { $ne: null };
            } else {
                searchCriteria.profile_picture_url = null;
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
        
        const contacts = await Contact.find(searchCriteria)
            .select('contact_id name number is_business last_interaction profile_picture_url tags')
            .sort({ name: 1 })
            .limit(100);
        
        return contacts.map(contact => ({
            contact_id: contact.contact_id,
            name: contact.name,
            number: contact.number,
            is_business: contact.is_business,
            last_interaction: contact.last_interaction,
            profile_picture_url: contact.profile_picture_url,
            tags: contact.tags
        }));
        
    } catch (error) {
        console.error('Error searching contacts:', error);
        throw error;
    }
}

module.exports = {
    saveContacts,
    getContactsByGroupId,
    getUserGroups,
    createCustomGroup,
    updateGroupContacts,
    deleteGroup,
    getContactById,
    searchContacts,
    createDefaultGroups
};