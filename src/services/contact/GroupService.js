const Logger = require('../../utils/Logger');
const ApiResponse = require('../../utils/ApiResponse');

/**
 * Service for group-related operations
 * Implements business logic for group management
 */
class GroupService {
    constructor() {
        this.logger = new Logger('GroupService');
        // Initialize database connection
        this.Contact = require('../../../models/Contact');
        this.Group = require('../../../models/Group');
        this.GroupContact = require('../../../models/GroupContact');
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
            const group = await this.Group.findOne({
                id: groupId,
                user_id: userId,
                place_id: placeId
            });

            if (!group) {
                throw new Error('Group not found');
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

            // إضافة شروط البحث
            if (search && search.trim()) {
                const searchTerm = new RegExp(search.trim(), 'i'); // Case insensitive search
                
                if (search_type === 'name') {
                    contactQuery.$and = [
                        contactQuery.$or,
                        {
                            $or: [
                                { name: searchTerm },
                                { formatted_name: searchTerm }
                            ]
                        }
                    ];
                } else if (search_type === 'phone') {
                    contactQuery.phone_number = searchTerm;
                } else { // search_type === 'all'
                    contactQuery.$and = [
                        contactQuery.$or,
                        {
                            $or: [
                                { name: searchTerm },
                                { formatted_name: searchTerm },
                                { phone_number: searchTerm }
                            ]
                        }
                    ];
                }
            }

            // إذا كانت المجموعة مخصصة، نحتاج للفلترة حسب الأعضاء
            if (group.type === 'custom') {
                const groupContacts = await this.GroupContact.find({
                    group_id: groupId,
                    user_id: userId,
                    place_id: placeId
                }).select('contact_id');

                const contactIds = groupContacts.map(gc => gc.contact_id);
                contactQuery.id = { $in: contactIds };
            }

            // حساب العدد الإجمالي
            const total = await this.Contact.countDocuments(contactQuery);

            // جلب الجهات مع التصفح
            const contacts = await this.Contact.find(contactQuery)
                .sort({ name: 1 })
                .skip((page - 1) * limit)
                .limit(parseInt(limit))
                .lean();

            // إضافة معلومات إضافة للمجموعة لكل جهة اتصال
            let contactsWithGroupInfo = contacts;
            if (group.type === 'custom') {
                const groupContactsInfo = await this.GroupContact.find({
                    group_id: groupId,
                    contact_id: { $in: contacts.map(c => c.id) }
                }).lean();

                const groupContactsMap = {};
                groupContactsInfo.forEach(gc => {
                    groupContactsMap[gc.contact_id] = gc;
                });

                contactsWithGroupInfo = contacts.map(contact => ({
                    ...contact,
                    added_to_group_at: groupContactsMap[contact.id]?.added_at || null
                }));
            }

            const result = {
                group: {
                    id: group.id,
                    name: group.name,
                    description: group.description,
                    type: group.type,
                    contact_count: total,
                    filter_applied: 'last_90_days'
                },
                contacts: contactsWithGroupInfo.map(contact => ({
                    id: contact.id,
                    whatsapp_id: contact.whatsapp_id,
                    name: contact.name,
                    formatted_name: contact.formatted_name,
                    phone_number: contact.phone_number,
                    is_business: Boolean(contact.is_business),
                    profile_picture_url: contact.profile_picture_url,
                    last_seen: contact.last_seen,
                    last_interaction: contact.last_interaction,
                    tags: contact.tags || [],
                    notes: contact.notes,
                    added_to_group_at: contact.added_to_group_at,
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
     * Get all groups for a user with real data
     */
    async getUserGroups(userId, placeId, options = {}) {
        try {
            const { page = 1, limit = 50 } = options;

            this.logger.info(`Getting real groups for user ${userId}, place ${placeId}`);

            // جلب المجموعات من قاعدة البيانات
            const total = await this.Group.countDocuments({
                user_id: userId,
                place_id: placeId,
                status: 'active'
            });

            const groups = await this.Group.find({
                user_id: userId,
                place_id: placeId,
                status: 'active'
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
                    let contactCount = 0;

                    if (group.type === 'custom') {
                        // للمجموعات المخصصة، عد الأعضاء مع فلتر آخر 90 يوم
                        const groupContacts = await this.GroupContact.find({
                            group_id: group.id,
                            user_id: userId,
                            place_id: placeId
                        }).select('contact_id');

                        const contactIds = groupContacts.map(gc => gc.contact_id);

                        contactCount = await this.Contact.countDocuments({
                            id: { $in: contactIds },
                            user_id: userId,
                            place_id: placeId,
                            status: 'active',
                            $or: [
                                { last_interaction: { $gte: ninetyDaysAgo } },
                                { last_seen: { $gte: ninetyDaysAgo } },
                                { created_at: { $gte: ninetyDaysAgo } }
                            ]
                        });
                    } else {
                        // للمجموعات التلقائية (مثل كل الجهات)، عد جميع الجهات مع فلتر آخر 90 يوم
                        contactCount = await this.Contact.countDocuments({
                            user_id: userId,
                            place_id: placeId,
                            status: 'active',
                            $or: [
                                { last_interaction: { $gte: ninetyDaysAgo } },
                                { last_seen: { $gte: ninetyDaysAgo } },
                                { created_at: { $gte: ninetyDaysAgo } }
                            ]
                        });
                    }

                    return {
                        ...group,
                        contact_count: contactCount,
                        filter_applied: 'last_90_days'
                    };
                })
            );

            // إذا لم توجد مجموعات، أنشئ المجموعات الافتراضية
            if (groups.length === 0) {
                await this.createDefaultGroups(userId, placeId);
                // أعد تشغيل الدالة بعد إنشاء المجموعات الافتراضية
                return this.getUserGroups(userId, placeId, options);
            }

            return {
                groups: groupsWithCounts,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total: total,
                    pages: Math.ceil(total / limit),
                    has_next: page < Math.ceil(total / limit),
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
     * Create default groups for a user
     */
    async createDefaultGroups(userId, placeId, sessionId = null) {
        try {
            this.logger.info(`Creating default groups for user ${userId}, place ${placeId}`);

            // تحقق من وجود المجموعات الافتراضية
            const existingGroups = await this.Group.find({
                user_id: userId,
                place_id: placeId,
                type: 'system'
            });

            const defaultGroups = [
                {
                    id: `all_contacts_${userId}_${placeId}`,
                    name: 'جميع الجهات',
                    description: 'جميع جهات الاتصال المحفوظة',
                    type: 'system'
                },
                {
                    id: `business_contacts_${userId}_${placeId}`,
                    name: 'جهات العمل',
                    description: 'جهات الاتصال التجارية',
                    type: 'system'
                },
                {
                    id: `recent_contacts_${userId}_${placeId}`,
                    name: 'الجهات الحديثة',
                    description: 'جهات الاتصال من آخر 30 يوم',
                    type: 'system'
                }
            ];

            // إنشاء المجموعات المفقودة
            for (const groupData of defaultGroups) {
                const existingGroup = existingGroups.find(g => g.id === groupData.id);
                
                if (!existingGroup) {
                    const newGroup = new this.Group({
                        ...groupData,
                        user_id: userId,
                        place_id: placeId,
                        session_id: sessionId,
                        status: 'active',
                        created_at: new Date(),
                        updated_at: new Date()
                    });

                    await newGroup.save();
                    this.logger.info(`Created default group: ${groupData.name}`);
                }
            }

            this.logger.success(`Default groups ensured for user ${userId}, place ${placeId}`);

        } catch (error) {
            this.logger.error('Error creating default groups:', error);
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
            const newGroup = new this.Group({
                id: groupId,
                name: name,
                description: description || '',
                type: 'custom',
                user_id: userId,
                place_id: placeId,
                session_id: sessionId,
                status: 'active',
                created_at: new Date(),
                updated_at: new Date()
            });

            await newGroup.save();

            // إضافة الجهات للمجموعة
            const groupContacts = contact_ids.map(contactId => ({
                group_id: groupId,
                contact_id: contactId,
                user_id: userId,
                place_id: placeId,
                added_at: new Date()
            }));

            await this.GroupContact.insertMany(groupContacts);

            this.logger.info(`Successfully created group ${groupId} with ${contact_ids.length} contacts`);
            
            return {
                ...newGroup.toObject(),
                contact_count: contact_ids.length
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

            // حذف الجهات الحالية
            await this.GroupContact.deleteMany({
                group_id: groupId,
                user_id: userId,
                place_id: placeId
            });

            // إضافة الجهات الجديدة
            if (contactIds.length > 0) {
                const groupContacts = contactIds.map(contactId => ({
                    group_id: groupId,
                    contact_id: contactId,
                    user_id: userId,
                    place_id: placeId,
                    added_at: new Date()
                }));

                await this.GroupContact.insertMany(groupContacts);
            }

            // تحديث تاريخ التعديل
            await this.Group.updateOne(
                { id: groupId, user_id: userId, place_id: placeId },
                { updated_at: new Date() }
            );

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

            // حذف علاقات المجموعة
            await this.GroupContact.deleteMany({
                group_id: groupId,
                user_id: userId,
                place_id: placeId
            });

            // حذف المجموعة (أو تعطيلها)
            await this.Group.updateOne(
                { id: groupId, user_id: userId, place_id: placeId },
                { 
                    status: 'deleted',
                    deleted_at: new Date(),
                    updated_at: new Date()
                }
            );

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
            const totalGroups = await this.Group.countDocuments({
                user_id: userId,
                place_id: placeId,
                status: 'active'
            });

            const customGroups = await this.Group.countDocuments({
                user_id: userId,
                place_id: placeId,
                status: 'active',
                type: 'custom'
            });

            const systemGroups = await this.Group.countDocuments({
                user_id: userId,
                place_id: placeId,
                status: 'active',
                type: 'system'
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
            const mostActiveGroup = await this.Group.findOne({
                user_id: userId,
                place_id: placeId,
                status: 'active'
            }).sort({ updated_at: -1 });

            const stats = {
                total_groups: totalGroups,
                custom_groups: customGroups,
                system_groups: systemGroups,
                total_contacts_last_90_days: totalContactsLast90Days,
                average_contacts_per_group: totalGroups > 0 ? Math.round(totalContactsLast90Days / totalGroups) : 0,
                most_active_group: mostActiveGroup ? {
                    id: mostActiveGroup.id,
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