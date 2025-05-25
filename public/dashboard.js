class DashboardManager {
    constructor(clientId, currentPage, currentLimit) {
        this.clientId = clientId;
        this.currentPage = currentPage;
        this.currentLimit = currentLimit;
        this.selectedNumbers = this.loadSelectedNumbers();
        this.searchQuery = this.getSearchQuery();
        this.selectedImage = null;
        
        this.init();
    }

    init() {
        // تطبيق التحديدات المحفوظة
        this.applySelectedNumbers();
        
        // تطبيق البحث المحفوظ
        if (this.searchQuery) {
            const searchInput = document.getElementById('searchInput');
            if (searchInput) {
                searchInput.value = this.searchQuery;
            }
        }
        
        // تحديث العداد
        this.updateSelectedCount();
        
        // إضافة مستمعين للأحداث
        this.attachEventListeners();
    }

    attachEventListeners() {
        // البحث
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.performSearch();
                }
            });
        }

        // رفع الصورة
        const imageInput = document.getElementById('imageInput');
        if (imageInput) {
            imageInput.addEventListener('change', (e) => {
                this.handleImageUpload(e);
            });
        }

        // إزالة الصورة
        const removeImageBtn = document.getElementById('removeImageBtn');
        if (removeImageBtn) {
            removeImageBtn.addEventListener('click', () => {
                this.removeSelectedImage();
            });
        }

        // تحديث التحديد عند تغيير الصفحة
        window.addEventListener('beforeunload', () => {
            this.saveSelectedNumbers();
        });
    }

    // إدارة الصور
    handleImageUpload(event) {

        console.log(event);
        
        const file = event.target.files[0];
        if (file && file.type.startsWith('image/')) {
            if (file.size > 5 * 1024 * 1024) { // 5MB limit
                alert('حجم الصورة كبير جداً. يجب أن يكون أقل من 5 ميجابايت');
                return;
            }

            const reader = new FileReader();
            reader.onload = (e) => {
                this.selectedImage = {
                    file: file,
                    preview: e.target.result,
                    name: file.name,
                    size: this.formatFileSize(file.size)
                };
                this.displayImagePreview();
            };
            reader.readAsDataURL(file);
        } else {
            alert('يرجى اختيار ملف صورة صالح');
        }
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    displayImagePreview() {
        const previewContainer = document.getElementById('imagePreview');
        if (previewContainer && this.selectedImage) {
            previewContainer.innerHTML = `
                <div class="image-preview-content">
                    <img class="image-preview" src="${this.selectedImage.preview}" alt="معاينة الصورة" />
                    <div class="image-info">
                        <span class="image-name">${this.selectedImage.name}</span>
                        <span class="image-size">${this.selectedImage.size}</span>
                    </div>
                    <button type="button" id="removeImageBtn" class="remove-image-btn">×</button>
                </div>
            `;
            previewContainer.style.display = 'block';
            
            // إعادة ربط حدث إزالة الصورة
            const removeBtn = document.getElementById('removeImageBtn');
            if (removeBtn) {
                removeBtn.addEventListener('click', () => {
                    this.removeSelectedImage();
                });
            }
        }
    }

    removeSelectedImage() {
        this.selectedImage = null;
        const imageInput = document.getElementById('imageInput');
        const previewContainer = document.getElementById('imagePreview');
        
        if (imageInput) {
            imageInput.value = '';
        }
        
        if (previewContainer) {
            previewContainer.style.display = 'none';
            previewContainer.innerHTML = '';
        }
    }

    // إدارة التحديدات المحفوظة
    saveSelectedNumbers() {
        const selected = [];
        document.querySelectorAll('.contact-checkbox:checked').forEach(checkbox => {
            selected.push({
                number: checkbox.value,
                name: checkbox.dataset.name
            });
        });
        
        // حفظ في localStorage مع معرف العميل
        const storageKey = `selected_${this.clientId}`;
        const allSelected = JSON.parse(localStorage.getItem(storageKey) || '[]');
        
        // إزالة الأرقام الحالية من القائمة المحفوظة
        const currentNumbers = Array.from(document.querySelectorAll('.contact-checkbox')).map(cb => cb.value);
        const filteredSelected = allSelected.filter(item => !currentNumbers.includes(item.number));
        
        // إضافة الأرقام المحددة حالياً
        const updatedSelected = [...filteredSelected, ...selected];
        
        localStorage.setItem(storageKey, JSON.stringify(updatedSelected));
    }

    loadSelectedNumbers() {
        const storageKey = `selected_${this.clientId}`;
        return JSON.parse(localStorage.getItem(storageKey) || '[]');
    }

    applySelectedNumbers() {
        const selectedNumbers = this.selectedNumbers.map(item => item.number);
        document.querySelectorAll('.contact-checkbox').forEach(checkbox => {
            if (selectedNumbers.includes(checkbox.value)) {
                checkbox.checked = true;
            }
        });
    }

    clearSelectedNumbers() {
        const storageKey = `selected_${this.clientId}`;
        localStorage.removeItem(storageKey);
        this.selectedNumbers = [];
    }

    // إدارة البحث
    getSearchQuery() {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get('search') || '';
    }

    performSearch() {
        const searchInput = document.getElementById('searchInput');
        const query = searchInput.value.trim();
        
        // حفظ التحديدات قبل البحث
        this.saveSelectedNumbers();
        
        const url = new URL(window.location);
        if (query) {
            url.searchParams.set('search', query);
        } else {
            url.searchParams.delete('search');
        }
        url.searchParams.set('page', '1'); // العودة للصفحة الأولى عند البحث
        
        window.location.href = url.toString();
    }

    clearSearch() {
        const url = new URL(window.location);
        url.searchParams.delete('search');
        url.searchParams.set('page', '1');
        
        window.location.href = url.toString();
    }

    // إدارة الصفحات
    changePage(page) {
        this.saveSelectedNumbers();
        const url = new URL(window.location);
        url.searchParams.set('page', page);
        window.location.href = url.toString();
    }

    changeLimit(limit) {
        this.saveSelectedNumbers();
        const url = new URL(window.location);
        url.searchParams.set('limit', limit);
        url.searchParams.set('page', '1');
        window.location.href = url.toString();
    }

    // إدارة التحديد
    updateSelectedCount() {
        const checkboxes = document.querySelectorAll('.contact-checkbox:checked');
        const selectedCountElement = document.getElementById('selectedCount');
        if (selectedCountElement) {
            selectedCountElement.textContent = checkboxes.length;
        }
        
        // تحديث لون الصفوف المحددة
        document.querySelectorAll('.contact-checkbox').forEach(checkbox => {
            const row = checkbox.closest('tr');
            if (checkbox.checked) {
                row.classList.add('selected');
            } else {
                row.classList.remove('selected');
            }
        });

        // تحديث checkbox "تحديد الكل"
        const selectAllCheckbox = document.getElementById('selectAllCheckbox');
        const allCheckboxes = document.querySelectorAll('.contact-checkbox');
        const checkedCheckboxes = document.querySelectorAll('.contact-checkbox:checked');
        
        if (selectAllCheckbox && allCheckboxes.length > 0) {
            selectAllCheckbox.checked = checkedCheckboxes.length === allCheckboxes.length;
            selectAllCheckbox.indeterminate = checkedCheckboxes.length > 0 && checkedCheckboxes.length < allCheckboxes.length;
        }
    }

    selectAll() {
        document.querySelectorAll('.contact-checkbox').forEach(checkbox => {
            checkbox.checked = true;
        });
        const selectAllCheckbox = document.getElementById('selectAllCheckbox');
        if (selectAllCheckbox) selectAllCheckbox.checked = true;
        this.updateSelectedCount();
    }

    deselectAll() {
        document.querySelectorAll('.contact-checkbox').forEach(checkbox => {
            checkbox.checked = false;
        });
        const selectAllCheckbox = document.getElementById('selectAllCheckbox');
        if (selectAllCheckbox) selectAllCheckbox.checked = false;
        this.updateSelectedCount();
    }

    toggleSelectAll() {
        const selectAllCheckbox = document.getElementById('selectAllCheckbox');
        document.querySelectorAll('.contact-checkbox').forEach(checkbox => {
            checkbox.checked = selectAllCheckbox.checked;
        });
        this.updateSelectedCount();
    }

    // إدارة الإرسال
    getRandomDelay() {
        return Math.floor(Math.random() * 6000) + 5000; // 5-10 ثواني
    }

    async sendToNumber(number) {
        const message = document.getElementById('messageText').value;
        if (!message.trim() && !this.selectedImage) {
            alert('الرجاء كتابة رسالة أو اختيار صورة أولاً');
            return;
        }
        
        try {
            const formData = new FormData();
            formData.append('client_id', this.clientId);
            formData.append('number', number);
            formData.append('message', message);
            
            if (this.selectedImage) {
                formData.append('image', this.selectedImage.file);
            }
            
            const response = await fetch('/send-message', {
                method: 'POST',
                body: formData
            });
            
            const data = await response.json();
            if (data.success) {
                this.showNotification('تم إرسال الرسالة بنجاح!', 'success');
            } else {
                this.showNotification('فشل في إرسال الرسالة: ' + data.error, 'error');
            }
        } catch (error) {
            this.showNotification('خطأ: ' + error.message, 'error');
        }
    }

    sendToSelected() {
        const message = document.getElementById('messageText').value;
        if (!message.trim() && !this.selectedImage) {
            alert('الرجاء كتابة رسالة أو اختيار صورة أولاً');
            return;
        }

        const selectedCheckboxes = document.querySelectorAll('.contact-checkbox:checked');
        if (selectedCheckboxes.length === 0) {
            alert('الرجاء تحديد جهات الاتصال أولاً');
            return;
        }
        
        const messageType = this.selectedImage ? 'رسالة مع صورة' : 'رسالة نصية';
        if (!confirm(`هل أنت متأكد من إرسال ${messageType} لـ ${selectedCheckboxes.length} جهة اتصال؟`)) {
            return;
        }

        this.sendBulkMessages(selectedCheckboxes, message);
    }

    sendToAll() {
        const message = document.getElementById('messageText').value;
        if (!message.trim() && !this.selectedImage) {
            alert('الرجاء كتابة رسالة أو اختيار صورة أولاً');
            return;
        }
        
        const messageType = this.selectedImage ? 'رسالة مع صورة' : 'رسالة نصية';
        if (!confirm(`هل أنت متأكد من إرسال ${messageType} لجميع ${this.getTotalSelectedCount()} جهة اتصال؟`)) {
            return;
        }

        // إرسال لجميع المحددين (في جميع الصفحات)
        this.sendToAllSelected(message);
    }

    getTotalSelectedCount() {
        // حساب إجمالي المحددين من جميع الصفحات
        const currentSelected = document.querySelectorAll('.contact-checkbox:checked').length;
        const savedSelected = this.selectedNumbers.length;
        const currentNumbers = Array.from(document.querySelectorAll('.contact-checkbox')).map(cb => cb.value);
        const savedNotInCurrent = this.selectedNumbers.filter(item => !currentNumbers.includes(item.number)).length;
        
        return currentSelected + savedNotInCurrent;
    }

    async sendToAllSelected(message) {
        // جمع جميع الأرقام المحددة من جميع الصفحات
        this.saveSelectedNumbers(); // حفظ التحديدات الحالية
        const allSelected = this.loadSelectedNumbers();
        
        if (allSelected.length === 0) {
            alert('لا توجد جهات اتصال محددة');
            return;
        }

        this.showSendingProgress(allSelected.length);
        
        let completed = 0;
        let successful = 0;
        let failed = 0;
        
        for (let i = 0; i < allSelected.length; i++) {
            const contact = allSelected[i];
            const delay = this.getRandomDelay();
            
            setTimeout(async () => {
                this.updateProgressText(`جاري الإرسال إلى: ${contact.name} (${contact.number})`);
                
                try {
                    const formData = new FormData();
                    formData.append('client_id', this.clientId);
                    formData.append('number', contact.number);
                    formData.append('message', message);
                    
                    if (this.selectedImage) {
                        formData.append('image', this.selectedImage.file);
                    }
                    
                    const response = await fetch('/send-message', {
                        method: 'POST',
                        body: formData
                    });
                    
                    const data = await response.json();
                    completed++;
                    
                    if (data.success) {
                        successful++;
                    } else {
                        failed++;
                    }
                } catch (error) {
                    completed++;
                    failed++;
                }
                
                this.updateProgress(completed, allSelected.length, successful, failed);
                
                if (completed === allSelected.length) {
                    this.finishSending(successful, failed);
                }
            }, i * delay);
        }
    }

    sendBulkMessages(checkboxes, message) {
        this.showSendingProgress(checkboxes.length);
        
        let completed = 0;
        let successful = 0;
        let failed = 0;
        const total = checkboxes.length;
        
        checkboxes.forEach((checkbox, index) => {
            const number = checkbox.value;
            const name = checkbox.dataset.name;
            const delay = this.getRandomDelay();
            
            setTimeout(async () => {
                this.updateProgressText(`جاري الإرسال إلى: ${name} (${number})`);
                
                try {
                    const formData = new FormData();
                    formData.append('client_id', this.clientId);
                    formData.append('number', number);
                    formData.append('message', message);
                    
                    if (this.selectedImage) {
                        formData.append('image', this.selectedImage.file);
                    }
                    
                    const response = await fetch('/send-message', {
                        method: 'POST',
                        body: formData
                    });
                    
                    const data = await response.json();
                    completed++;
                    
                    if (data.success) {
                        successful++;
                        const row = checkbox.closest('tr');
                        row.style.backgroundColor = '#d4edda';
                    } else {
                        failed++;
                        const row = checkbox.closest('tr');
                        row.style.backgroundColor = '#f8d7da';
                    }
                } catch (error) {
                    completed++;
                    failed++;
                    const row = checkbox.closest('tr');
                    row.style.backgroundColor = '#f8d7da';
                }
                
                this.updateProgress(completed, total, successful, failed);
                
                if (completed === total) {
                    this.finishSending(successful, failed);
                }
            }, index * delay);
        });
    }

    showSendingProgress(total) {
        const progressModal = document.createElement('div');
        progressModal.id = 'sendingProgressModal';
        progressModal.innerHTML = `
            <div class="modal fade show" style="display: block; background: rgba(0,0,0,0.5);">
                <div class="modal-dialog modal-dialog-centered">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">جاري الإرسال...</h5>
                        </div>
                        <div class="modal-body">
                            <div class="progress mb-3">
                                <div class="progress-bar" role="progressbar" style="width: 0%"></div>
                            </div>
                            <div id="progressText">التحضير للإرسال...</div>
                            <div id="progressStats" class="mt-2">
                                <small class="text-muted">
                                    المكتمل: <span id="completedCount">0</span>/${total} | 
                                    النجح: <span id="successCount">0</span> | 
                                    فشل: <span id="failedCount">0</span>
                                </small>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(progressModal);
    }

    updateProgressText(text) {
        const progressText = document.getElementById('progressText');
        if (progressText) {
            progressText.textContent = text;
        }
    }

    updateProgress(completed, total, successful, failed) {
        const progressBar = document.querySelector('#sendingProgressModal .progress-bar');
        const completedCount = document.getElementById('completedCount');
        const successCount = document.getElementById('successCount');
        const failedCount = document.getElementById('failedCount');
        
        if (progressBar) {
            const percentage = (completed / total) * 100;
            progressBar.style.width = percentage + '%';
            progressBar.textContent = Math.round(percentage) + '%';
        }
        
        if (completedCount) completedCount.textContent = completed;
        if (successCount) successCount.textContent = successful;
        if (failedCount) failedCount.textContent = failed;
    }

    finishSending(successful, failed) {
        setTimeout(() => {
            const progressModal = document.getElementById('sendingProgressModal');
            if (progressModal) {
                progressModal.remove();
            }
            
            const message = `تم الانتهاء من الإرسال!\nنجح: ${successful}\nفشل: ${failed}`;
            alert(message);
            
            // إعادة تحميل الصفحة لتحديث البيانات
            location.reload();
        }, 2000);
    }

    showNotification(message, type) {
        const notification = document.createElement('div');
        notification.className = `alert alert-${type === 'success' ? 'success' : 'danger'} alert-dismissible fade show`;
        notification.style.position = 'fixed';
        notification.style.top = '20px';
        notification.style.right = '20px';
        notification.style.zIndex = '9999';
        notification.style.minWidth = '300px';
        
        notification.innerHTML = `
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        `;
        
        document.body.appendChild(notification);
        
        // إزالة الإشعار تلقائياً بعد 5 ثواني
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 5000);
    }

    // طرق إضافية للتحكم في الواجهة
    toggleMessageArea() {
        const messageArea = document.getElementById('messageArea');
        if (messageArea) {
            messageArea.style.display = messageArea.style.display === 'none' ? 'block' : 'none';
        }
    }

    exportSelected() {
        const selected = this.loadSelectedNumbers();
        if (selected.length === 0) {
            alert('لا توجد جهات اتصال محددة للتصدير');
            return;
        }
        
        const csvContent = 'الاسم,الرقم\n' + selected.map(item => `"${item.name}","${item.number}"`).join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        
        if (link.download !== undefined) {
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            link.setAttribute('download', 'selected_contacts.csv');
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    }

    // طريقة لتنظيف المحفوظات
    clearAllStorage() {
        if (confirm('هل أنت متأكد من حذف جميع البيانات المحفوظة؟')) {
            const storageKey = `selected_${this.clientId}`;
            localStorage.removeItem(storageKey);
            this.selectedNumbers = [];
            this.updateSelectedCount();
            this.showNotification('تم حذف جميع البيانات المحفوظة', 'success');
        }
    }

    
}






// تأكد من توفر الكلاس للاستخدام العالمي
window.DashboardManager = DashboardManager;