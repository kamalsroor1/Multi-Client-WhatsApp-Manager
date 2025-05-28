# 🔍 تحديث البحث في جهات الاتصال - WhatsApp Manager

## ✨ الميزات الجديدة المضافة

تم إضافة خاصية البحث المتقدم في endpoint `/api/whatsapp/groups/:group_id/contacts` مع الميزات التالية:

### 🔍 أنواع البحث المدعومة:

1. **البحث بالاسم** (`search_type=name`)
   - البحث في اسم جهة الاتصال
   - البحث في الاسم المنسق

2. **البحث بالرقم** (`search_type=phone`) 
   - البحث في رقم الهاتف
   - يدعم البحث الجزئي في الأرقام

3. **البحث الشامل** (`search_type=all` - الافتراضي)
   - البحث في الاسم والرقم معاً
   - أفضل خيار للبحث العام

## 📝 أمثلة على الاستخدام

### البحث الأساسي (كل النتائج)
```bash
GET /api/whatsapp/groups/group123/contacts?user_id=1&place_id=1
```

### البحث بالاسم فقط
```bash
GET /api/whatsapp/groups/group123/contacts?user_id=1&place_id=1&search=أحمد&search_type=name
```

### البحث بالرقم فقط
```bash
GET /api/whatsapp/groups/group123/contacts?user_id=1&place_id=1&search=0123456789&search_type=phone
```

### البحث الشامل (الافتراضي)
```bash
GET /api/whatsapp/groups/group123/contacts?user_id=1&place_id=1&search=محمد&search_type=all
```

### البحث مع التصفح
```bash
GET /api/whatsapp/groups/group123/contacts?user_id=1&place_id=1&search=علي&page=2&limit=10
```

## 📋 المعاملات المدعومة

| المعامل | النوع | مطلوب | الوصف |
|---------|------|--------|-------|
| `user_id` | integer | ✅ | معرف المستخدم |
| `place_id` | integer | ✅ | معرف المكان |
| `search` | string | ❌ | نص البحث (1-100 حرف) |
| `search_type` | string | ❌ | نوع البحث: `name`, `phone`, `all` |
| `page` | integer | ❌ | رقم الصفحة (افتراضي: 1) |
| `limit` | integer | ❌ | عدد النتائج (افتراضي: 50، أقصى: 1000) |

## 📊 مثال على الاستجابة

```json
{
    "success": true,
    "data": {
        "group": {
            "id": "group123",
            "name": "فريق العمل الرئيسي",
            "description": "مجموعة العمل الأساسية",
            "type": "custom",
            "contact_count": 25
        },
        "contacts": [
            {
                "id": "contact_1",
                "whatsapp_id": "201234567890@c.us",
                "name": "أحمد محمد علي",
                "formatted_name": "أحمد محمد",
                "phone_number": "+201234567890",
                "is_business": false,
                "profile_picture_url": "https://example.com/avatar1.jpg",
                "last_seen": "2024-01-15T10:30:00Z",
                "tags": ["عميل", "مهم"],
                "notes": "عميل مهم جداً",
                "added_to_group_at": "2024-01-10T08:00:00Z"
            }
        ],
        "pagination": {
            "page": 1,
            "limit": 50,
            "total": 5,
            "pages": 1,
            "has_next": false,
            "has_prev": false
        },
        "search_info": {
            "search_term": "أحمد",
            "search_type": "all",
            "results_count": 1
        }
    },
    "message": "Found 1 contacts matching \"أحمد\" in group"
}
```

## ⚠️ رسائل الأخطاء

### خطأ في طول البحث
```json
{
    "success": false,
    "message": "Search term must be at least 1 character long",
    "error_code": 400
}
```

### خطأ في نوع البحث
```json
{
    "success": false,
    "message": "search_type must be one of: name, phone, all",
    "error_code": 400
}
```

### خطأ في الأحرف المستخدمة
```json
{
    "success": false,
    "message": "Search term contains invalid characters",
    "error_code": 400
}
```

## 🛡️ الأمان والحماية

- **تنظيف المدخلات**: إزالة الأحرف الخطيرة تلقائياً
- **الحد الأقصى**: 100 حرف لنص البحث
- **الحماية من SQL Injection**: استخدام Prepared Statements
- **التحقق من الصلاحيات**: التأكد من صحة user_id و place_id

## 💡 نصائح للاستخدام الأمثل

1. **استخدم `search_type=phone`** عند البحث بالأرقام لتحسين الأداء
2. **استخدم `search_type=name`** عند البحث بالأسماء فقط
3. **البحث غير حساس لحالة الأحرف** (case-insensitive)
4. **يدعم البحث الجزئي** - مثلاً "أحم" سيجد "أحمد"
5. **استخدم التصفح** لتحسين الأداء مع النتائج الكثيرة

## 🔧 التحديثات التقنية

### الملفات المحدثة:
- ✅ `src/controllers/ContactController.js` - إضافة دعم البحث
- ✅ `src/services/contact/GroupService.js` - تطبيق منطق البحث
- ✅ `src/middleware/ValidationMiddleware.js` - التحقق من صحة البحث
- ✅ `index.js` - إضافة validation middleware للبحث

### الميزات الجديدة:
- 🔍 البحث بالاسم والرقم
- 📄 معلومات البحث في الاستجابة
- 🛡️ التحقق الشامل من المدخلات
- 📊 إحصائيات البحث

## 🚀 إصدار v2.1.0

هذا التحديث يرفع المشروع إلى الإصدار v2.1.0 مع:
- خاصية البحث المتقدم
- تحسينات في الأمان
- دعم أفضل للغة العربية
- توثيق شامل

---

**تم التطوير بواسطة**: فريق تطوير WhatsApp Manager  
**التاريخ**: مايو 2025  
**الإصدار**: v2.1.0