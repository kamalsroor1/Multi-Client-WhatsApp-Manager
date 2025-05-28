const Logger = require('../../utils/Logger');
const ApiResponse = require('../../utils/ApiResponse');

/**
 * Service for group-related operations
 * Uses existing ContactGroup model structure
 */
class GroupService {
    constructor() {
        this.logger = new Logger('GroupService');
        // Initialize database connection with existing models
        this.Contact = require('../../../models/Contact');
        this.ContactGroup = require('../../../models/ContactGroup');
    }

    /**
     * Get contacts by group ID with search functionality and last 90 days filter
     */
    async getContactsByGroupId(userId, placeId, groupId, options = {}) {
        try {
            const { 
                page = 1, 
                limit = 50, 
                search, 
                search_type = 'all' 
            } = options;

            this.logger.info(`Getting contacts for group ${groupId} with 90-day filter`);

            // حساب تاريخ آخر 90 يوم
            const ninetyDaysAgo = new Date();
            ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

            // الحصول على معلومات المجموعة أولاً
            const group = await this.ContactGroup.findOne({
                group_id: groupId,
                user_id: userId,
                place_id: placeId,
                is_active: true
            });

            if (!group) {
                // إذا لم توجد المجموعة، ارجع مجموعة افتراضية لكل الجهات
                return this.getAllContactsAsGroup(userId, placeId, groupId, options);
            }

            // بناء الكويري للبحث مع فلتر آخر 90 يوم
            let contactQuery = {
                user_id: userId,
                place_id: placeId,
                status: 'active',
                // فلتر آخر 90 يوم
                $or: [
                    { last_interaction: { $gte: ninetyDaysAgo } },
                    { last_seen: { $gte: ninetyDaysAgo } },
                    { created_at: { $gte: ninetyDaysAgo } }
                ]
            };

            // إذا كانت المجموعة مخصصة، فلتر حسب contact_ids
            if (group.contact_ids && group.contact_ids.length > 0) {
                contactQuery._id = { $in: group.contact_ids };
            }

            // إضافة شروط البحث
            if (search && search.trim()) {
                const searchTerm = new RegExp(search.trim(), 'i'); // Case insensitive search
                
                if (search_type === 'name') {
                    contactQuery.name = searchTerm;
                } else if (search_type === 'phone') {
                    contactQuery.number = searchTerm;
                } else { // search_type === 'all'
                    contactQuery.$and = [
                        contactQuery.$or,
                        {
                            $or: [
                                { name: searchTerm },
                                { number: searchTerm }
                            ]
                        }
                    ];
                }
            }

            // حساب العدد الإجمالي
            const total = await this.Contact.countDocuments(contactQuery);

            // جلب الجهات مع التصفح
            const contacts = await this.Contact.find(contactQuery)
                .sort({ name: 1 })
                .skip((page - 1) * limit)
                .limit(parseInt(limit))
                .lean();

            const result = {
                group: {
                    id: group.group_id,
                    name: group.name,
                    description: group.description,
                    type: group.group_type || 'manual',
                    contact_count: total,
                    filter_applied: 'last_90_days'
                },
                contacts: contacts.map(contact => ({
                    id: contact._id,
                    contact_id: contact.contact_id,
                    whatsapp_id: contact.whatsapp_id,
                    name: contact.name,
                    phone_number: contact.number,
                    is_business: Boolean(contact.is_business),
                    profile_picture_url: contact.profile_picture_url,
                    last_seen: contact.last_seen,
                    last_interaction: contact.last_interaction,
                    tags: contact.tags || [],
                    status: contact.status,
                    created_at: contact.created_at
                })),
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total: total,
                    pages: Math.ceil(total / limit),
                    has_next: page < Math.ceil(total / limit),
                    has_prev: page > 1
                },
                search_info: search ? {
                    search_term: search,
                    search_type: search_type,
                    results_count: contacts.length
                } : null,
                date_filter: {
                    type: 'last_90_days',
                    from_date: ninetyDaysAgo.toISOString(),
                    to_date: new Date().toISOString()
                }
            };

            this.logger.info(`Retrieved ${result.contacts.length} contacts for group ${groupId} (last 90 days)${search ? ` with search: "${search}"` : ''}`);
            return result;

        } catch (error) {
            this.logger.error('Error getting contacts by group ID:', error);
            throw error;
        }
    }

    /**
     * Get all contacts as a default group when specific group not found
     */
    async getAllContactsAsGroup(userId, placeId, groupId, options = {}) {
        try {
            const { page = 1, limit = 50, search, search_type = 'all' } = options;
            
            const ninetyDaysAgo = new Date();
            ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

            let contactQuery = {
                user_id: userId,
                place_id: placeId,
                status: 'active',
                $or: [
                    { last_interaction: { $gte: ninetyDaysAgo } },
                    { last_seen: { $gte: ninetyDaysAgo } },
                    { created_at: { $gte: ninetyDaysAgo } }
                ]
            };

            // إضافة البحث
            if (search && search.trim()) {
                const searchTerm = new RegExp(search.trim(), 'i');
                if (search_type === 'name') {
                    contactQuery.name = searchTerm;
                } else if (search_type === 'phone') {
                    contactQuery.number = searchTerm;
                } else {
                    contactQuery.$and = [
                        contactQuery.$or,
                        {
                            $or: [
                                { name: searchTerm },
                                { number: searchTerm }
                            ]
                        }
                    ];
                }
            }

            const total = await this.Contact.countDocuments(contactQuery);
            const contacts = await this.Contact.find(contactQuery)
                .sort({ name: 1 })
                .skip((page - 1) * limit)
                .limit(parseInt(limit))
                .lean();

            return {
                group: {
                    id: groupId,
                    name: 'جميع الارقام',
                    description: 'جميع جهات الاتصال النشطة',
                    type: 'auto',
                    contact_count: total,
                    filter_applied: 'last_90_days'
                },
                contacts: contacts.map(contact => ({
                    id: contact._id,
                    contact_id: contact.contact_id,
                    whatsapp_id: contact.whatsapp_id,
                    name: contact.name,
                    phone_number: contact.number,
                    is_business: Boolean(contact.is_business),
                    profile_picture_url: contact.profile_picture_url,
                    last_seen: contact.last_seen,
                    last_interaction: contact.last_interaction,
                    tags: contact.tags || [],
                    status: contact.status,
                    created_at: contact.created_at
                })),
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total: total,
                    pages: Math.ceil(total / limit),
                    has_next: page < Math.ceil(total / limit),
                    has_prev: page > 1
                },
                search_info: search ? {
                    search_term: search,
                    search_type: search_type,
                    results_count: contacts.length
                } : null,
                date_filter: {
                    type: 'last_90_days',
                    from_date: ninetyDaysAgo.toISOString(),
                    to_date: new Date().toISOString()
                }
            };
        } catch (error) {
            this.logger.error('Error getting all contacts as group:', error);
            throw error;
        }
    }

    /**
     * Get all groups for a user with real data
     */
    async getUserGroups(userId, placeId, options = {}) {
        try {
            const { page = 1, limit = 50 } = options;

            this.logger.info(`Getting real groups for user ${userId}, place ${placeId}`);

            // جلب المجموعات من قاعدة البيانات
            const total = await this.ContactGroup.countDocuments({
                user_id: userId,
                place_id: placeId,
                is_active: true
            });

            const groups = await this.ContactGroup.find({
                user_id: userId,
                place_id: placeId,
                is_active: true
            })
            .sort({ created_at: -1 })
            .skip((page - 1) * limit)
            .limit(parseInt(limit))
            .lean();

            // حساب عدد الجهات لكل مجموعة مع فلتر آخر 90 يوم
            const ninetyDaysAgo = new Date();
            ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

            const groupsWithCounts = await Promise.all(
                groups.map(async (group) => {
                    let contactQuery = {
                        user_id: userId,
                        place_id: placeId,
                        status: 'active',
                        $or: [
                            { last_interaction: { $gte: ninetyDaysAgo } },
                            { last_seen: { $gte: ninetyDaysAgo } },
                            { created_at: { $gte: ninetyDaysAgo } }
                        ]
                    };

                    // إذا كانت المجموعة لها جهات محددة
                    if (group.contact_ids && group.contact_ids.length > 0) {
                        contactQuery._id = { $in: group.contact_ids };
                    }

                    const contactCount = await this.Contact.countDocuments(contactQuery);

                    return {
                        id: group.group_id,
                        name: group.name,
                        description: group.description,
                        type: group.group_type || 'manual',
                        contact_count: contactCount,
                        filter_applied: 'last_90_days',
                        created_at: group.created_at,
                        updated_at: group.updated_at
                    };
                })
            );

            // إضافة المجموعة الافتراضية "فريق العمل الرئيسي" إذا لم توجد
            // if (groups.length === 0) {
            //     const allContactsCount = await this.Contact.countDocuments({
            //         user_id: userId,
            //         place_id: placeId,
            //         status: 'active',
            //         $or: [
            //             { last_interaction: { $gte: ninetyDaysAgo } },
            //             { last_seen: { $gte: ninetyDaysAgo } },
            //             { created_at: { $gte: ninetyDaysAgo } }
            //         ]
            //     });

            //     groupsWithCounts.push({
            //         id: 'default_group',
            //         name: 'فريق العمل الرئيسي',
            //         description: 'جميع جهات الاتصال النشطة',
            //         type: 'auto',
            //         contact_count: allContactsCount,
            //         filter_applied: 'last_90_days',
            //         created_at: new Date(),
            //         updated_at: new Date()
            //     });
            // }

            return {
                groups: groupsWithCounts,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total: Math.max(total, 1), // على الأقل المجموعة الافتراضية
                    pages: Math.ceil(Math.max(total, 1) / limit),
                    has_next: page < Math.ceil(Math.max(total, 1) / limit),
                    has_prev: page > 1
                },
                date_filter: {
                    type: 'last_90_days',
                    from_date: ninetyDaysAgo.toISOString(),
                    to_date: new Date().toISOString()
                }
            };

        } catch (error) {
            this.logger.error('Error getting user groups:', error);
            throw error;
        }
    }

    /**
     * Create a custom group
     */
    async createCustomGroup(userId, placeId, sessionId, groupData) {
        try {
            const { name, description, contact_ids } = groupData;

            this.logger.info(`Creating custom group "${name}" with ${contact_ids.length} contacts`);

            const groupId = `custom_${Date.now()}_${userId}_${placeId}`;
            
            // إنشاء المجموعة
            const newGroup = new this.ContactGroup({
                user_id: userId,
                place_id: placeId,
                session_id: sessionId,
                group_id: groupId,
                name: name,
                description: description || '',
                contact_ids: contact_ids,
                group_type: 'manual',
                is_active: true,
                created_at: new Date(),
                updated_at: new Date()
            });

            await newGroup.save();

            this.logger.info(`Successfully created group ${groupId} with ${contact_ids.length} contacts`);
            
            return {
                id: groupId,
                name: name,
                description: description,
                type: 'manual',
                contact_count: contact_ids.length,
                created_at: newGroup.created_at,
                updated_at: newGroup.updated_at
            };

        } catch (error) {
            this.logger.error('Error creating custom group:', error);
            throw error;
        }
    }

    /**
     * Update group contacts
     */
    async updateGroupContacts(userId, placeId, groupId, contactIds) {
        try {
            this.logger.info(`Updating group ${groupId} with ${contactIds.length} contacts`);

            const result = await this.ContactGroup.updateOne(
                { 
                    group_id: groupId, 
                    user_id: userId, 
                    place_id: placeId,
                    is_active: true 
                },
                { 
                    contact_ids: contactIds,
                    updated_at: new Date()
                }
            );

            if (result.matchedCount === 0) {
                throw new Error('Group not found');
            }

            this.logger.info(`Successfully updated group ${groupId} with ${contactIds.length} contacts`);
            
            return {
                group_id: groupId,
                updated_contact_count: contactIds.length,
                updated_at: new Date().toISOString()
            };

        } catch (error) {
            this.logger.error('Error updating group contacts:', error);
            throw error;
        }
    }

    /**
     * Delete a group
     */
    async deleteGroup(userId, placeId, groupId) {
        try {
            this.logger.info(`Deleting group ${groupId}`);

            const result = await this.ContactGroup.updateOne(
                { 
                    group_id: groupId, 
                    user_id: userId, 
                    place_id: placeId 
                },
                { 
                    is_active: false,
                    updated_at: new Date()
                }
            );

            if (result.matchedCount === 0) {
                throw new Error('Group not found');
            }

            this.logger.info(`Successfully deleted group ${groupId}`);
            
            return {
                group_id: groupId,
                deleted: true,
                deleted_at: new Date().toISOString()
            };

        } catch (error) {
            this.logger.error('Error deleting group:', error);
            throw error;
        }
    }

    /**
     * Get group statistics with 90-day filter
     */
    async getGroupStatistics(userId, placeId) {
        try {
            const ninetyDaysAgo = new Date();
            ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

            // إحصائيات المجموعات
            const totalGroups = await this.ContactGroup.countDocuments({
                user_id: userId,
                place_id: placeId,
                is_active: true
            });

            const manualGroups = await this.ContactGroup.countDocuments({
                user_id: userId,
                place_id: placeId,
                is_active: true,
                group_type: 'manual'
            });

            const autoGroups = await this.ContactGroup.countDocuments({
                user_id: userId,
                place_id: placeId,
                is_active: true,
                group_type: 'auto'
            });

            // إحصائيات الجهات مع فلتر آخر 90 يوم
            const totalContactsLast90Days = await this.Contact.countDocuments({
                user_id: userId,
                place_id: placeId,
                status: 'active',
                $or: [
                    { last_interaction: { $gte: ninetyDaysAgo } },
                    { last_seen: { $gte: ninetyDaysAgo } },
                    { created_at: { $gte: ninetyDaysAgo } }
                ]
            });

            // أكثر المجموعات نشاطاً
            const mostActiveGroup = await this.ContactGroup.findOne({
                user_id: userId,
                place_id: placeId,
                is_active: true
            }).sort({ updated_at: -1 });

            const stats = {
                total_groups: totalGroups,
                manual_groups: manualGroups,
                auto_groups: autoGroups,
                total_contacts_last_90_days: totalContactsLast90Days,
                average_contacts_per_group: totalGroups > 0 ? Math.round(totalContactsLast90Days / totalGroups) : 0,
                most_active_group: mostActiveGroup ? {
                    id: mostActiveGroup.group_id,
                    name: mostActiveGroup.name,
                    last_updated: mostActiveGroup.updated_at
                } : null,
                date_filter: {
                    type: 'last_90_days',
                    from_date: ninetyDaysAgo.toISOString(),
                    to_date: new Date().toISOString()
                }
            };

            return stats;

        } catch (error) {
            this.logger.error('Error getting group statistics:', error);
            throw error;
        }
    }
}

module.exports = GroupService;