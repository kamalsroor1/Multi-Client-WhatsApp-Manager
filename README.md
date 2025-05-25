📲 Multi-Client WhatsApp Manager using whatsapp-web.js
This project uses whatsapp-web.js to create and manage multiple WhatsApp clients based on a clientId. It supports QR generation, authentication, messaging, logout, and retrieving contacts — all per client.

🚀 Features
✅ Multi-client support

🔐 Auto-authentication with LocalAuth

🔄 Automatic reinitialization on auth failure or disconnect

🖼️ Send text messages or images

📇 Retrieve WhatsApp contacts

📤 Logout and delete session data

🧠 Track client state: initializing, qr_ready, authenticated, error

🧱 Client Structure
js
نسخ
تحرير
const clients = {
  clientId: {
    client,   // WhatsApp client instance
    qr,       // QR code image in base64 format
    ready,    // Is the client ready?
    status,   // Current status
    error     // Any error message
  }
};
🛠️ Core Functions
Function	Description
initClient(clientId)	Initialize a new WhatsApp client and register event handlers
getClientStatus(clientId)	Get current status of a client
getClient(clientId)	Get the WhatsApp client instance
isReady(clientId)	Check if the client is authenticated and ready
sendMessage(clientId, number, message, imageBuffer, mimeType)	Send a text or image message
getContacts(clientId)	Retrieve WhatsApp contacts
logout(clientId)	Log out and delete session files

🧪 Example Usage
js
نسخ
تحرير
await initClient('store-1');

if (isReady('store-1')) {
    await sendMessage('store-1', '20123456789', 'Hello from WhatsApp bot!');
}
📦 Requirements
Node.js (v14 or newer)

whatsapp-web.js

qrcode

Chrome or a working Puppeteer installation

Install dependencies:

bash
نسخ
تحرير
npm install whatsapp-web.js qrcode
📂 Important Directories
.wwebjs_auth/ — Stores session files for each client (e.g., client-store-1, client-user-5, etc.)

📌 Notes
If a client fails to authenticate or gets disconnected, the session files are deleted and the client is automatically reinitialized.

QR codes are generated as base64 strings and can be rendered easily in a frontend application.

📄 License
This project is open-source and free to use or modify.

