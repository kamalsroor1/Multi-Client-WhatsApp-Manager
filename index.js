const express = require('express');
const multer = require('multer');
const whatsappClient = require('./services/whatsappService'); // تأكد من المسار الصحيح لملفك

const bodyParser = require('body-parser');


const app = express();

// Middlewares
app.use(bodyParser.json());

// إعداد multer لرفع الملفات
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB max
    },
    fileFilter: (req, file, cb) => {
        // قبول الصور فقط
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('يُسمح بالصور فقط'), false);
        }
    }
});

app.use(express.json());
app.use(express.static('public'));

// عرض QR وحالة الاتصال والأرقام في صفحة واحدة
app.get('/dashboard', async (req, res) => {
    const clientId = req.query.client_id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const search = req.query.search || '';
    
    if (!clientId) return res.status(400).send("client_id is required");

    await whatsappClient.initClient(clientId);
    const clientStatus = whatsappClient.getClientStatus(clientId);
    
    let contactsHtml = '';
    let paginationHtml = '';
    
    if (clientStatus.ready) {
        try {
            const allContacts = await whatsappClient.getContacts(clientId);
            
            // فلترة جهات الاتصال حسب البحث
            const filteredContacts = search ? 
                allContacts.filter(contact => 
                    contact.name.toLowerCase().includes(search.toLowerCase()) ||
                    contact.number.includes(search)
                ) : allContacts;
            
            const totalContacts = filteredContacts.length;
            const totalPages = Math.ceil(totalContacts / limit);
            const startIndex = (page - 1) * limit;
            const endIndex = startIndex + limit;
            const contacts = filteredContacts.slice(startIndex, endIndex);
            
            const tableRows = contacts.map((contact, index) => 
                `<tr>
                    <td>
                        <input type="checkbox" class="contact-checkbox" 
                               value="${contact.number}" 
                               data-name="${contact.name}"
                               onchange="dashboard.updateSelectedCount()">
                    </td>
                    <td>${startIndex + index + 1}</td>
                    <td>${contact.name}</td>
                    <td>${contact.number}</td>
                    <td><button onclick="dashboard.sendToNumber('${contact.number}')" class="btn-send">إرسال</button></td>
                </tr>`
            ).join('');
            
            // إنشاء Pagination
            let paginationButtons = '';
            const maxVisible = 5;
            let startPage = Math.max(1, page - Math.floor(maxVisible / 2));
            let endPage = Math.min(totalPages, startPage + maxVisible - 1);
            
            if (endPage - startPage + 1 < maxVisible) {
                startPage = Math.max(1, endPage - maxVisible + 1);
            }
            
            if (page > 1) {
                paginationButtons += `<button onclick="dashboard.changePage(1)" class="btn-page">الأولى</button>`;
                paginationButtons += `<button onclick="dashboard.changePage(${page - 1})" class="btn-page">السابقة</button>`;
            }
            
            for (let i = startPage; i <= endPage; i++) {
                const activeClass = i === page ? 'active' : '';
                paginationButtons += `<button onclick="dashboard.changePage(${i})" class="btn-page ${activeClass}">${i}</button>`;
            }
            
            if (page < totalPages) {
                paginationButtons += `<button onclick="dashboard.changePage(${page + 1})" class="btn-page">التالية</button>`;
                paginationButtons += `<button onclick="dashboard.changePage(${totalPages})" class="btn-page">الأخيرة</button>`;
            }
            
            paginationHtml = `
                <div class="pagination-container">
                    <div class="pagination-info">
                        عرض ${startIndex + 1} - ${Math.min(endIndex, totalContacts)} من ${totalContacts} جهة اتصال
                        ${search ? `| البحث عن: "${search}"` : ''}
                    </div>
                    <div class="pagination-controls">
                        <select onchange="dashboard.changeLimit(this.value)" class="limit-select">
                            <option value="10" ${limit === 10 ? 'selected' : ''}>10 في الصفحة</option>
                            <option value="20" ${limit === 20 ? 'selected' : ''}>20 في الصفحة</option>
                            <option value="50" ${limit === 50 ? 'selected' : ''}>50 في الصفحة</option>
                            <option value="100" ${limit === 100 ? 'selected' : ''}>100 في الصفحة</option>
                        </select>
                        <div class="pagination-buttons">${paginationButtons}</div>
                    </div>
                </div>
            `;
            
            contactsHtml = `
                <div class="search-section">
                    <div class="search-container">
                        <input type="text" id="searchInput" class="search-input" 
                               placeholder="البحث بالاسم أو الرقم..." value="${search}">
                        <button onclick="dashboard.performSearch()" class="search-btn">🔍 بحث</button>
                        ${search ? `<button onclick="dashboard.clearSearch()" class="clear-search-btn">✖️ مسح البحث</button>` : ''}
                    </div>
                    ${search && totalContacts === 0 ? 
                        `<div class="search-results">لم يتم العثور على نتائج للبحث "${search}"</div>` : 
                        search ? `<div class="search-results">تم العثور على ${totalContacts} نتيجة</div>` : ''
                    }
                </div>

                <div class="contacts-section">
                    <div class="contacts-header">
                        <h3>📞 جهات الاتصال (${allContacts.length})</h3>
                        <div class="selection-info">
                            <span id="selectedCount">0</span> محدد من ${contacts.length}
                            <button onclick="dashboard.selectAll()" class="btn-select-all">تحديد الكل</button>
                            <button onclick="dashboard.deselectAll()" class="btn-deselect-all">إلغاء التحديد</button>
                            <button onclick="dashboard.clearSelectedNumbers()" class="btn-deselect-all">مسح جميع المحفوظات</button>
                        </div>
                    </div>
                    
                    <div class="message-form">
                        <div class="message-input-section">
                            <textarea id="messageText" placeholder="اكتب رسالتك هنا..." rows="3"></textarea>
                            
                            
                          
                        </div>

             
                                   <!-- Image Upload Section -->
                    <div class="image-upload-section" id="imageUploadSection">
                        <h3 style="margin-top: 0; color: #128c7e; text-align: center;">إرفاق صورة (اختياري)</h3>
                        
                        <div class="image-upload-container">
                            <label for="imageInput" class="image-upload-label">
                                <div class="image-upload-icon">📷</div>
                                <div class="image-upload-text">اضغط هنا لاختيار صورة أو اسحب الصورة هنا</div>
                                <div class="image-upload-hint">يدعم: JPG, PNG, GIF - حد أقصى 10MB</div>
                            </label>
                            
                            <input type="file" id="imageInput" class="image-upload-input" accept="image/*" />
                            
                            <div class="image-preview-container" id="imagePreview">
                                <img id="" class="image-preview" alt="معاينة الصورة" />
                                <div id="imageInfo" class="image-info"></div>
                                <button type="button" id="removeImageBtn" class="remove-image-btn">إزالة الصورة</button>
                            </div>
                            
                            <div id="imageError" class="image-upload-error" style="display: none;"></div>
                        </div>
                    </div>

                                            
                        <div class="send-options">
                            <button onclick="dashboard.sendToSelected()" class="btn-send-selected">إرسال للمحدد</button>
                            <button onclick="dashboard.sendToAll()" class="btn-send-all">إرسال لجميع المحدد</button>
                            <div class="delay-info">
                                <label>⏱️ تأخير عشوائي: 5-10 ثواني</label>
                            </div>
                        </div>
                    </div>
                    
                    ${totalContacts > 0 ? paginationHtml : ''}
                    
                    ${totalContacts > 0 ? `
                    <div class="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th width="5%">
                                        <input type="checkbox" id="selectAllCheckbox" onchange="dashboard.toggleSelectAll()">
                                    </th>
                                    <th width="5%">#</th>
                                    <th width="40%">الاسم</th>
                                    <th width="30%">الرقم</th>
                                    <th width="20%">إجراء</th>
                                </tr>
                            </thead>
                            <tbody>${tableRows}</tbody>
                        </table>
                    </div>
                    
                    ${paginationHtml}` : ''}
                </div>
            `;
        } catch (err) {
            contactsHtml = `<div class="error">خطأ في جلب جهات الاتصال: ${err.message}</div>`;
        }
    }

    const html = `
        <!DOCTYPE html>
        <html dir="rtl">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>WhatsApp Dashboard - ${clientId}</title>
            <link rel="stylesheet" href="dashboard.css">
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <div class="header-content">
                        <h1>📱 WhatsApp Dashboard</h1>
                        <h2>Client ID: ${clientId}</h2>
                    </div>
                    <button onclick="logout()" class="logout-btn">👋 تسجيل خروج</button>
                </div>

                <div class="status-card">
                    ${getStatusContent(clientStatus)}
                </div>

                <div class="refresh-btn">
                    <button onclick="window.location.reload()" class="btn-refresh">🔄 تحديث</button>
                </div>

                <div class="sending-progress" id="sendingProgress">
                    <div id="progressText">جاري الإرسال...</div>
                    <div class="progress-bar">
                        <div class="progress-fill" id="progressFill"></div>
                    </div>
                    <div id="progressDetails"></div>
                </div>

                ${contactsHtml}
            </div>

            <script src="/dashboard.js"></script>
            <script>
                // تهيئة Dashboard Manager
                const dashboard = new DashboardManager('${clientId}', ${page}, ${limit});

                // Auto refresh every 5 seconds if not ready
                ${clientStatus.status !== 'authenticated' ? 'setTimeout(() => window.location.reload(), 5000);' : ''}

                // دالة تسجيل الخروج
                async function logout() {
                    if (!confirm('هل أنت متأكد من تسجيل الخروج؟')) return;
                    
                    try {
                        await fetch('/logout', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ client_id: '${clientId}' })
                        });
                        
                        dashboard.clearSelectedNumbers();
                        window.location.href = '/test';
                    } catch (error) {
                        alert('خطأ في تسجيل الخروج: ' + error.message);
                    }
                }
            </script>
        </body>
        </html>
    `;

    res.send(html);
});

function getStatusContent(clientStatus) {
    switch (clientStatus.status) {
        case 'initializing':
            return `
                <div class="loader"></div>
                <h3>⏳ جاري التهيئة...</h3>
                <p>يرجى الانتظار، جاري تحضير الاتصال...</p>
            `;
        
        case 'qr_ready':
            return `
                <h3>📷 امسح QR Code</h3>
                <p>افتح WhatsApp على هاتفك واذهب إلى الإعدادات > الأجهزة المرتبطة > ربط جهاز</p>
                <div class="qr-container">
                    <img src="${clientStatus.qr}" alt="QR Code" />
                </div>
                <p><small>ينتهي QR Code خلال دقيقتين</small></p>
            `;
        
        case 'authenticated':
            return `
                <div class="success">
                    <h3>✅ متصل بنجاح!</h3>
                    <p>WhatsApp جاهز للاستخدام</p>
                </div>
            `;
        
        case 'error':
            return `
                <div class="error">
                    <h3>❌ خطأ في الاتصال</h3>
                    <p>${clientStatus.error}</p>
                    <p>جاري إعادة المحاولة...</p>
                </div>
            `;
        
        default:
            return `
                <div class="loader"></div>
                <h3>🔄 جاري البدء...</h3>
            `;
    }
}

// API لإرسال رسالة مع أو بدون صورة
app.post('/send-message', upload.single('image'), async (req, res) => {
    const { client_id, number, message } = req.body;
    const imageFile = req.file;
    
    try {
        let imageBuffer = null;
        let imageMimeType = null;
        
        if (imageFile) {
            imageBuffer = imageFile.buffer;
            imageMimeType = imageFile.mimetype;
        }
        
        await whatsappClient.sendMessage(client_id, number, message, imageBuffer, imageMimeType);
        res.json({ success: true });
    } catch (err) {
        console.error('Send message error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// API لتسجيل الخروج
app.post('/logout', async (req, res) => {
    const { client_id } = req.body;
    try {
        await whatsappClient.logout(client_id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// الصفحة الرئيسية
app.get('/test', (req, res) => {
    console.log('test');
    
    res.send(`
        <!DOCTYPE html>
        <html dir="rtl">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>WhatsApp Multi-Client Dashboard</title>
            <link rel="stylesheet" href="dashboard.css">
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>📱 WhatsApp Multi-Client Dashboard</h1>
                </div>
                
                <div class="status-card">
                    <h3>🚀 ابدأ جلسة جديدة</h3>
                    <p>أدخل معرف العميل للبدء:</p>
                    <div style="display: flex; gap: 10px; justify-content: center; align-items: center; margin-top: 20px;">
                        <input type="text" id="clientIdInput" placeholder="مثال: client1" 
                               style="padding: 10px; border: 1px solid #ddd; border-radius: 5px; font-size: 16px;">
                        <button onclick="startClient()" class="btn-refresh">🚀 ابدأ</button>
                    </div>
                </div>
            </div>

            <script>
                function startClient() {
                    const clientId = document.getElementById('clientIdInput').value.trim();
                    if (!clientId) {
                        alert('الرجاء إدخال معرف العميل');
                        return;
                    }
                    window.location.href = '/dashboard?client_id=' + encodeURIComponent(clientId);
                }
                
                document.getElementById('clientIdInput').addEventListener('keypress', function(e) {
                    if (e.key === 'Enter') {
                        startClient();
                    }
                });
            </script>
        </body>
        </html>
    `);
});



// ... (rest of your existing Node.js code)

// API to get dashboard data (status, contacts, pagination info)
app.get('/api/dashboard-data', async (req, res) => { // Changed route to /api/dashboard-data
    const clientId = req.query.client_id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const search = req.query.search || '';

    if (!clientId) {
        return res.status(400).json({ success: false, error: "client_id is required" });
    }

    try {
        await whatsappClient.initClient(clientId);
        const clientStatus = whatsappClient.getClientStatus(clientId);

        let contacts = [];
        let totalContacts = 0;
        let totalPages = 0;
        let startIndex = 0;
        let endIndex = 0;

        if (clientStatus.ready) {
            const allContacts = await whatsappClient.getContacts(clientId);

            const filteredContacts = search ?
                allContacts.filter(contact =>
                    contact.name.toLowerCase().includes(search.toLowerCase()) ||
                    contact.number.includes(search)
                ) : allContacts;

            totalContacts = filteredContacts.length;
            totalPages = Math.ceil(totalContacts / limit);
            startIndex = (page - 1) * limit;
            endIndex = startIndex + limit;
            contacts = filteredContacts.slice(startIndex, endIndex);
        }

        res.json({
            success: true,
            clientId: clientId,
            clientStatus: clientStatus,
            contacts: contacts,
            pagination: {
                page: page,
                limit: limit,
                totalContacts: totalContacts,
                totalPages: totalPages,
                startIndex: startIndex,
                endIndex: endIndex,
                search: search
            }
        });

    } catch (err) {
        console.error('Error fetching dashboard data:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});




// API لتسجيل الدخول / إنشاء العميل
app.post('/api/create-client', async (req, res) => {
    const clientId = req.body.client_id;

    if (!clientId) {
        return res.status(400).json({ success: false, error: 'Client ID is required.' });
    }

    // تحقق مما إذا كان العميل موجودًا بالفعل
    const existingClientStatus = whatsappClient.getClientStatus(clientId);
    if (existingClientStatus.status !== 'not_initialized') {
        return res.json({
            success: true,
            status: existingClientStatus.status,
            message: `Client ${clientId} already exists. Current status: ${existingClientStatus.status}.`,
            qr: existingClientStatus.qr,
        });
    }

    try {
        await whatsappClient.initClient(clientId);
        const clientData = whatsappClient.getClientStatus(clientId);
        console.log(`Client ${clientId} initialized.`);
        res.json({
            success: true,
            status: clientData.status,
            message: 'جاري تهيئة الواتساب...',
            qr: clientData.qr, // قد يكون null في البداية، يتم تحديثه عند حدث 'qr'
            client_id: clientId
        });
    } catch (err) {
        console.error(`Error initializing client ${clientId}:`, err);
        res.status(500).json({ success: false, error: `Initialization error: ${err.message}` });
    }
});

// Endpoint للحصول على الحالة الحالية لعميل معين
app.get('/api/client-status', (req, res) => {
    const clientId = req.query.client_id;
    if (!clientId) {
        return res.status(400).json({ success: false, error: 'Client ID is required.' });
    }

    const clientData = whatsappClient.getClientStatus(clientId);
    
    if (clientData.status === 'not_initialized' && !clientData.client) {
        return res.status(404).json({ success: false, error: 'Client not found or ID missing.' });
    }

    let message = '';
    switch (clientData.status) {
        case 'initializing':
            message = 'جاري تهيئة الواتساب...';
            break;
        case 'qr_ready':
            message = 'الرجاء مسح رمز QR من الواتساب.';
            break;
        case 'authenticated':
            message = 'تم الاتصال بالواتساب بنجاح!';
            break;
        case 'error':
            message = `خطأ: ${clientData.error}`;
            break;
        default:
            message = 'حالة غير معروفة.';
    }

    res.json({
        success: true,
        clientStatus: {
            status: clientData.status,
            message: message,
            qr: clientData.qr,
            ready: clientData.ready
        },
    });
});

// Endpoint لتسجيل الخروج من عميل
app.post('/api/logout', async (req, res) => {
    const clientId = req.body.client_id;
    if (!clientId) {
        return res.status(400).json({ success: false, error: 'Client ID is required.' });
    }

    try {
        await whatsappClient.logout(clientId);
        console.log(`Client ${clientId} logged out.`);
        res.json({ success: true, message: 'Client logged out successfully.' });
    } catch (error) {
        console.error(`Error logging out client ${clientId}:`, error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Endpoint لإرسال رسالة
app.post('/api/send-message', async (req, res) => {
    const { clientId, number, message, imageBuffer, imageMimeType } = req.body;

    if (!clientId || !number || (!message && !imageBuffer)) {
        return res.status(400).json({ success: false, error: 'Client ID, number, and either message or image are required.' });
    }

    try {
        await whatsappClient.sendMessage(clientId, number, message, imageBuffer, imageMimeType);
        res.json({ success: true, message: 'Message sent successfully.' });
    } catch (error) {
        console.error(`Error sending message for client ${clientId}:`, error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Endpoint للحصول على جهات الاتصال
app.get('/api/get-contacts', async (req, res) => {
    const clientId = req.query.client_id;

    if (!clientId) {
        return res.status(400).json({ success: false, error: 'Client ID is required.' });
    }

    try {
        const contacts = await whatsappClient.getContacts(clientId);
        res.json({ success: true, contacts: contacts });
    } catch (error) {
        console.error(`Error getting contacts for client ${clientId}:`, error);
        res.status(500).json({ success: false, error: error.message });
    }
});



// معالجة أخطاء multer
app.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ success: false, error: 'حجم الملف كبير جداً (الحد الأقصى 10MB)' });
        }
    }
    if (error.message === 'يُسمح بالصور فقط') {
        return res.status(400).json({ success: false, error: error.message });
    }
    next(error);
});

app.listen(5000, () => console.log('Server running on http://localhost:5000'));