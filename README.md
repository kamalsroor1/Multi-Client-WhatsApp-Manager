# Multi-Client WhatsApp Manager

A robust Node.js service for managing multiple WhatsApp sessions with Laravel integration support. Features include bulk messaging, group management, contact organization, and **background contact fetching for improved performance**.

## 🆕 Latest Updates

### Background Contact Fetching
- **Optimized Performance**: Contact fetching now runs in background after session is ready
- **Progress Tracking**: Real-time progress updates during contact synchronization  
- **Non-blocking**: WhatsApp session becomes ready immediately, contacts load in background
- **Batch Processing**: Contacts processed in batches of 10 to prevent overwhelming
- **Progress API**: New endpoint to track contact fetching progress

## 🚀 Features

- **Multi-Session Support**: Manage multiple WhatsApp sessions simultaneously
- **Laravel Integration**: RESTful API designed for Laravel queue jobs
- **Background Processing**: Contact fetching runs in background for better UX
- **Bulk Messaging**: Send messages to multiple contacts with delays
- **Group Management**: Create custom contact groups and send group messages
- **Image Support**: Send images via URL with validation
- **Progress Tracking**: Monitor contact synchronization progress
- **Message Logging**: Track all sent messages with status
- **Contact Search**: Advanced filtering and search capabilities
- **Error Handling**: Comprehensive error logging and handling

## 📋 Requirements

- Node.js 16+
- MongoDB
- Chrome/Chromium (for WhatsApp Web)

## 🛠️ Installation

1. **Clone Repository**
```bash
git clone https://github.com/kamalsroor1/Multi-Client-WhatsApp-Manager.git
cd Multi-Client-WhatsApp-Manager
```

2. **Install Dependencies**
```bash
npm install
```

3. **Environment Setup**
```bash
cp .env.example .env
# Edit .env with your MongoDB connection
```

4. **Start Service**
```bash
npm start
```

## 📡 API Endpoints

### Session Management

#### Initialize WhatsApp Session
```http
POST /api/whatsapp/init
Content-Type: application/json

{
    "user_id": 1,
    "place_id": 1
}
```

#### Get Session Status
```http
GET /api/whatsapp/status?user_id=1&place_id=1
```

**Response includes:**
- Session status (`initializing`, `qr_ready`, `ready`, `fetching_contacts`, `connected`)
- QR code (if available)
- Phone number
- Contact/group counts

#### 🆕 Get Contact Fetching Progress
```http
GET /api/whatsapp/contacts/progress?user_id=1&place_id=1
```

**Response:**
```json
{
  "success": true,
  "data": {
    "session_id": "session_1_1_1234567890",
    "status": "fetching_contacts",
    "contacts_fetch_progress": 75,
    "contacts_fetch_completed": false,
    "contacts_fetch_error": null,
    "total_contacts": 150,
    "total_groups": 5,
    "is_fetching": true
  }
}
```

### Messaging

#### Send Message to Contact
```http
POST /api/whatsapp/send-message
Content-Type: application/json

{
    "user_id": 1,
    "place_id": 1,
    "contact_id": "contact_uuid",
    "message": "Hello from API!",
    "image_url": "https://example.com/image.jpg" // optional
}
```

#### Send Message to Group
```http
POST /api/whatsapp/groups/{group_id}/send-message
Content-Type: application/json

{
    "user_id": 1,
    "place_id": 1,
    "message": "Group message",
    "image_url": "https://example.com/image.jpg" // optional
}
```

#### Bulk Send Messages
```http
POST /api/whatsapp/send-bulk-messages
Content-Type: application/json

{
    "user_id": 1,
    "place_id": 1,
    "recipients": [
        {"contact_id": "uuid1"},
        {"contact_id": "uuid2"}
    ],
    "message": "Bulk message",
    "delay_seconds": 2,
    "image_url": "https://example.com/image.jpg" // optional
}
```

### Contact & Group Management

#### Search Contacts
```http
GET /api/whatsapp/contacts/search?user_id=1&place_id=1&q=john&is_business=true
```

#### Get Groups
```http
GET /api/whatsapp/groups?user_id=1&place_id=1
```

#### Create Custom Group
```http
POST /api/whatsapp/groups
Content-Type: application/json

{
    "user_id": 1,
    "place_id": 1,
    "name": "Marketing Team",
    "description": "Marketing contacts",
    "contact_ids": ["uuid1", "uuid2"]
}
```

## 🔄 Background Contact Fetching Process

### How It Works
1. **Session Ready**: WhatsApp session becomes ready immediately after authentication
2. **Background Start**: Contact fetching starts automatically in background
3. **Batch Processing**: Contacts processed in batches of 10 for optimal performance
4. **Progress Updates**: Database updated with progress percentage every batch
5. **Completion**: Session marked as `connected` when all contacts are fetched

### Monitoring Progress
```javascript
// Poll progress endpoint every 2 seconds
const checkProgress = async () => {
    const response = await fetch('/api/whatsapp/contacts/progress?user_id=1&place_id=1');
    const data = await response.json();
    
    console.log(`Progress: ${data.data.contacts_fetch_progress}%`);
    
    if (!data.data.contacts_fetch_completed && data.data.is_fetching) {
        setTimeout(checkProgress, 2000); // Check again in 2 seconds
    }
};
```

## 🎯 Laravel Integration Example

### Queue Job for Background Processing
```php
<?php

namespace App\Jobs;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class SendWhatsAppMessage implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    protected $userId;
    protected $placeId;
    protected $contactId;
    protected $message;
    protected $imageUrl;

    public function __construct($userId, $placeId, $contactId, $message, $imageUrl = null)
    {
        $this->userId = $userId;
        $this->placeId = $placeId;
        $this->contactId = $contactId;
        $this->message = $message;
        $this->imageUrl = $imageUrl;
    }

    public function handle()
    {
        try {
            // Check if session is ready
            $statusResponse = Http::get(config('whatsapp.service_url') . '/api/whatsapp/status', [
                'user_id' => $this->userId,
                'place_id' => $this->placeId
            ]);

            if (!$statusResponse->successful()) {
                throw new \Exception('Failed to get session status');
            }

            $status = $statusResponse->json()['data']['status'];
            
            // If still fetching contacts, wait and retry
            if ($status === 'fetching_contacts') {
                $this->release(30); // Retry in 30 seconds
                return;
            }

            if (!in_array($status, ['ready', 'connected'])) {
                throw new \Exception("Session not ready. Status: {$status}");
            }

            // Send message
            $response = Http::post(config('whatsapp.service_url') . '/api/whatsapp/send-message', [
                'user_id' => $this->userId,
                'place_id' => $this->placeId,
                'contact_id' => $this->contactId,
                'message' => $this->message,
                'image_url' => $this->imageUrl
            ]);

            if (!$response->successful()) {
                throw new \Exception('Failed to send message: ' . $response->body());
            }

            Log::info('WhatsApp message sent successfully', [
                'contact_id' => $this->contactId,
                'message_id' => $response->json()['data']['message_id']
            ]);

        } catch (\Exception $e) {
            Log::error('Failed to send WhatsApp message', [
                'error' => $e->getMessage(),
                'contact_id' => $this->contactId
            ]);
            
            throw $e; // Re-throw to trigger job failure
        }
    }
}
```

### Service Class
```php
<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use App\Jobs\SendWhatsAppMessage;

class WhatsAppService
{
    protected $serviceUrl;

    public function __construct()
    {
        $this->serviceUrl = config('whatsapp.service_url');
    }

    public function initializeSession($userId, $placeId)
    {
        $response = Http::post("{$this->serviceUrl}/api/whatsapp/init", [
            'user_id' => $userId,
            'place_id' => $placeId
        ]);

        return $response->json();
    }

    public function getSessionStatus($userId, $placeId)
    {
        $response = Http::get("{$this->serviceUrl}/api/whatsapp/status", [
            'user_id' => $userId,
            'place_id' => $placeId
        ]);

        return $response->json();
    }

    public function getContactProgress($userId, $placeId)
    {
        $response = Http::get("{$this->serviceUrl}/api/whatsapp/contacts/progress", [
            'user_id' => $userId,
            'place_id' => $placeId
        ]);

        return $response->json();
    }

    public function sendMessage($userId, $placeId, $contactId, $message, $imageUrl = null)
    {
        // Dispatch job for background processing
        SendWhatsAppMessage::dispatch($userId, $placeId, $contactId, $message, $imageUrl);
    }

    public function sendBulkMessages($userId, $placeId, $recipients, $message, $imageUrl = null, $delaySeconds = 2)
    {
        $response = Http::post("{$this->serviceUrl}/api/whatsapp/send-bulk-messages", [
            'user_id' => $userId,
            'place_id' => $placeId,
            'recipients' => $recipients,
            'message' => $message,
            'image_url' => $imageUrl,
            'delay_seconds' => $delaySeconds
        ]);

        return $response->json();
    }
}
```

### Controller Example
```php
<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Services\WhatsAppService;

class WhatsAppController extends Controller
{
    protected $whatsappService;

    public function __construct(WhatsAppService $whatsappService)
    {
        $this->whatsappService = $whatsappService;
    }

    public function initialize(Request $request)
    {
        $result = $this->whatsappService->initializeSession(
            $request->user_id,
            $request->place_id
        );

        return response()->json($result);
    }

    public function status(Request $request)
    {
        $status = $this->whatsappService->getSessionStatus(
            $request->user_id,
            $request->place_id
        );

        return response()->json($status);
    }

    public function contactProgress(Request $request)
    {
        $progress = $this->whatsappService->getContactProgress(
            $request->user_id,
            $request->place_id
        );

        return response()->json($progress);
    }

    public function sendMessage(Request $request)
    {
        $this->whatsappService->sendMessage(
            $request->user_id,
            $request->place_id,
            $request->contact_id,
            $request->message,
            $request->image_url
        );

        return response()->json(['success' => true, 'message' => 'Message queued for sending']);
    }
}
```

## 📊 Performance Benefits

### Before Optimization
- Session initialization: **60-120 seconds** (blocking)
- User experience: Poor (long waiting time)
- Memory usage: High during contact fetch

### After Optimization
- Session ready: **5-10 seconds** (non-blocking)
- Contact fetching: **Background process**
- User experience: Excellent (immediate session availability)
- Memory usage: Optimized batch processing

## 🔧 Configuration

### Environment Variables
```env
PORT=5000
MONGODB_URI=mongodb://localhost:27017/whatsapp_manager
NODE_ENV=production
```

### Docker Support
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 5000
CMD ["npm", "start"]
```

## 🚨 Important Notes

### Session States
- `initializing`: Session starting up
- `qr_ready`: QR code available for scanning
- `authenticated`: User scanned QR successfully
- `loading_screen`: WhatsApp Web loading
- `ready`: Session ready, contact fetching started
- `fetching_contacts`: Background contact synchronization
- `connected`: Fully ready with all contacts loaded

### Best Practices
1. **Poll Progress**: Use progress endpoint to monitor contact fetching
2. **Queue Messages**: Use Laravel queues for message sending
3. **Handle Retries**: Implement retry logic for failed operations
4. **Monitor Status**: Check session status before sending messages
5. **Image Validation**: Always validate image URLs before sending

## 📈 Monitoring & Logs

### Health Check
```http
GET /api/health
```

### Message Logs
```http
GET /api/whatsapp/messages?user_id=1&place_id=1&page=1&limit=50
```

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🔗 Links

- [WhatsApp Web.js Documentation](https://wwebjs.dev/)
- [MongoDB Documentation](https://docs.mongodb.com/)
- [Laravel Queue Documentation](https://laravel.com/docs/queues)

---

**Version**: 1.1.0 with Background Contact Fetching
**Node.js**: 16+ Required
**MongoDB**: Required for data persistence