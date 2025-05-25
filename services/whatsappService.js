const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const fs = require('fs');
const path = require('path');

const clients = {}; // clientId => { client, qr, ready, status, error }

async function initClient(clientId) {
    if (clients[clientId]?.client) return;

    const authPath = path.join(__dirname, '.wwebjs_auth', `client-${clientId}`);

    const client = new Client({
        authStrategy: new LocalAuth({ clientId: `client-${clientId}` }),
        // puppeteer: { headless: true }
        puppeteer: { 
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox'] 
        }
    });

    clients[clientId] = { 
        client, 
        qr: null, 
        ready: false, 
        status: 'initializing', // initializing, qr_ready, authenticated, error
        error: null 
    };

    client.on('qr', async (qr) => {
        clients[clientId].qr = await qrcode.toDataURL(qr);
        clients[clientId].ready = false;
        clients[clientId].status = 'qr_ready';
        clients[clientId].error = null;
        console.log(`🔄 QR generated for ${clientId}`);
        // هنا يمكنك إضافة منطق لبث الـ QR إلى الواجهة الأمامية إذا كنت تستخدم Socket.IO
        // io.to(clientId).emit('qr', clients[clientId].qr);
        // io.to(clientId).emit('status', clients[clientId].status);
    });

    client.on('ready', () => {
        clients[clientId].qr = null;
        clients[clientId].ready = true;
        clients[clientId].status = 'authenticated';
        clients[clientId].error = null;
        console.log(`✅ Client ${clientId} is ready`);
        // io.to(clientId).emit('status', clients[clientId].status);
        // io.to(clientId).emit('message', 'تم الاتصال بالواتساب بنجاح!');
        // io.to(clientId).emit('qr', null);
    });

    client.on('auth_failure', async (message) => {
        console.error(`⚠️ Auth failure for ${clientId}:`, message);
        
        clients[clientId].status = 'error';
        clients[clientId].error = 'Authentication failed';

        // حذف ملفات الجلسة
        if (fs.existsSync(authPath)) {
            fs.rmSync(authPath, { recursive: true, force: true });
            console.log(`🗑️ Deleted session folder for ${clientId}`);
        }

        // حذف الكائن من الذاكرة
        delete clients[clientId];

        // إعادة التهيئة
        console.log(`🔁 Reinitializing client ${clientId} after auth failure...`);
        await initClient(clientId);
        // io.to(clientId).emit('status', clients[clientId]?.status || 'error');
        // io.to(clientId).emit('message', clients[clientId]?.error || 'Authentication failed');
    });

    client.on('disconnected', async (reason) => {
        console.log(`❌ Client ${clientId} disconnected:`, reason);
        
        clients[clientId].status = 'error';
        clients[clientId].error = `Disconnected: ${reason}`;

        // حذف ملفات الجلسة
        if (fs.existsSync(authPath)) {
            fs.rmSync(authPath, { recursive: true, force: true });
            console.log(`🗑️ Deleted session folder for ${clientId}`);
        }

        // حذف الكائن من الذاكرة
        delete clients[clientId];

        // إعادة التهيئة
        console.log(`🔁 Reinitializing client ${clientId} after disconnect...`);
        await initClient(clientId);
        // io.to(clientId).emit('status', clients[clientId]?.status || 'error');
        // io.to(clientId).emit('message', clients[clientId]?.error || `Disconnected: ${reason}`);
    });

    client.initialize();
}

function getClientStatus(clientId) {
    return clients[clientId] || { status: 'not_initialized', ready: false, qr: null, error: null };
}

function getClient(clientId) {
    if (!clients[clientId]?.client) {
        throw new Error(`Client ${clientId} is not initialized`);
    }
    return clients[clientId].client;
}

function isReady(clientId) {
    return clients[clientId]?.ready || false;
}

async function sendMessage(clientId, number, message, imageBuffer = null, imageMimeType = null) {
    if (!isReady(clientId)) throw new Error('Client not ready');
    const client = clients[clientId].client;
    
    if (imageBuffer && imageMimeType) {
        // إرسال صورة مع نص
        const media = new MessageMedia(imageMimeType, imageBuffer.toString('base64'));
        return await client.sendMessage(`${number}@c.us`, media, { caption: message });
    } else if (message) {
        // إرسال نص فقط
        return await client.sendMessage(`${number}@c.us`, message);
    } else {
        throw new Error('No message or image provided');
    }
}

async function getContacts(clientId) {
    if (!isReady(clientId)) throw new Error('Client not ready');
    const client = clients[clientId].client;
    const contacts = await client.getContacts();
    const uniqueContacts = {};

    return contacts
        .filter(contact => contact.id?.server === 'c.us')
        .filter(contact => contact.isWAContact)
        // .filter(contact => {
        //     if (uniqueContacts[contact.id.user]) return false;
        //     uniqueContacts[contact.id.user] = true;
        //     return true;
        // })
        .map(contact => ({
            name: contact.name || contact.pushname || '-',
            number: contact.id.user
        }));
}

async function logout(clientId) {
    if (clients[clientId]?.client) {
        await clients[clientId].client.logout();
        await clients[clientId].client.destroy();
        
        // حذف ملفات الجلسة
        const authPath = path.join(__dirname, '.wwebjs_auth', `client-${clientId}`);
        if (fs.existsSync(authPath)) {
            fs.rmSync(authPath, { recursive: true, force: true });
            console.log(`🗑️ Deleted session folder for ${clientId}`);
        }
        
        delete clients[clientId];
        console.log(`👋 Client ${clientId} logged out`);
    }
}

module.exports = { initClient, getClientStatus, isReady, sendMessage, getClient, getContacts, logout };