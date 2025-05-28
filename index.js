const express = require('express');
const cors = require('cors');
const connectDB = require('./config/database');
const Logger = require('./src/utils/Logger');
const ApiResponse = require('./src/utils/ApiResponse');
const ErrorMiddleware = require('./src/middleware/ErrorMiddleware');
const ValidationMiddleware = require('./src/middleware/ValidationMiddleware');

// Controllers
const WhatsAppController = require('./src/controllers/WhatsAppController');
const ContactController = require('./src/controllers/ContactController');
const MessageController = require('./src/controllers/MessageController');

require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;
const logger = new Logger('App');

// Initialize middleware instances
const errorMiddleware = new ErrorMiddleware();
const validationMiddleware = new ValidationMiddleware();

// Initialize controllers
const whatsappController = new WhatsAppController();
const contactController = new ContactController();
const messageController = new MessageController();

// Connect to MongoDB
connectDB();

// Global Middlewares
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static('public'));

// Request logging middleware
app.use((req, res, next) => {
    logger.info(`${req.method} ${req.path}`, {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        timestamp: new Date().toISOString()
    });
    req.startTime = Date.now();
    next();
});

// API Routes

// Health check
app.get('/api/health', errorMiddleware.asyncHandler(
    whatsappController.healthCheck.bind(whatsappController)
));

// WhatsApp Session Management Routes
app.post('/api/whatsapp/init', 
    validationMiddleware.validateUserPlace,
    errorMiddleware.asyncHandler(
        whatsappController.initializeSession.bind(whatsappController)
    )
);

app.get('/api/whatsapp/status',
    validationMiddleware.validateUserPlace,
    errorMiddleware.asyncHandler(
        whatsappController.getSessionStatus.bind(whatsappController)
    )
);

app.get('/api/whatsapp/info',
    validationMiddleware.validateUserPlace,
    errorMiddleware.asyncHandler(
        whatsappController.getSessionInfo.bind(whatsappController)
    )
);

app.get('/api/whatsapp/contacts/progress',
    validationMiddleware.validateUserPlace,
    errorMiddleware.asyncHandler(
        whatsappController.getContactProgress.bind(whatsappController)
    )
);

app.post('/api/whatsapp/logout',
    validationMiddleware.validateUserPlace,
    errorMiddleware.asyncHandler(
        whatsappController.logout.bind(whatsappController)
    )
);

app.post('/api/whatsapp/restart',
    validationMiddleware.validateUserPlace,
    errorMiddleware.asyncHandler(
        whatsappController.restartSession.bind(whatsappController)
    )
);

app.get('/api/whatsapp/stats',
    errorMiddleware.asyncHandler(
        whatsappController.getServiceStats.bind(whatsappController)
    )
);

// New API endpoint to manually start background contact fetch
app.post('/api/whatsapp/start-contact-fetch',
    validationMiddleware.validateUserPlace,
    errorMiddleware.asyncHandler(
        whatsappController.startContactFetch.bind(whatsappController)
    )
);

// Contact and Group Management Routes
app.get('/api/whatsapp/groups',
    validationMiddleware.validateUserPlace,
    errorMiddleware.asyncHandler(
        contactController.getUserGroups.bind(contactController)
    )
);

app.get('/api/whatsapp/groups/:group_id/contacts',
    validationMiddleware.validateUserPlace,
    validationMiddleware.validateGroupId,
    errorMiddleware.asyncHandler(
        contactController.getContactsByGroup.bind(contactController)
    )
);

app.post('/api/whatsapp/groups',
    validationMiddleware.validateUserPlace,
    validationMiddleware.validateGroupCreation,
    errorMiddleware.asyncHandler(
        contactController.createGroup.bind(contactController)
    )
);

app.put('/api/whatsapp/groups/:group_id/contacts',
    validationMiddleware.validateUserPlace,
    validationMiddleware.validateGroupId,
    validationMiddleware.validateGroupUpdate,
    errorMiddleware.asyncHandler(
        contactController.updateGroupContacts.bind(contactController)
    )
);

app.delete('/api/whatsapp/groups/:group_id',
    validationMiddleware.validateUserPlace,
    validationMiddleware.validateGroupId,
    errorMiddleware.asyncHandler(
        contactController.deleteGroup.bind(contactController)
    )
);

// Contact Search and Management
app.get('/api/whatsapp/contacts/search',
    validationMiddleware.validateUserPlace,
    validationMiddleware.validatePagination,
    errorMiddleware.asyncHandler(
        contactController.searchContacts.bind(contactController)
    )
);

app.get('/api/whatsapp/contacts/:contact_id',
    validationMiddleware.validateUserPlace,
    validationMiddleware.validateContactId,
    errorMiddleware.asyncHandler(
        contactController.getContactById.bind(contactController)
    )
);

// Message Sending Routes
app.post('/api/whatsapp/send-message',
    validationMiddleware.validateUserPlace,
    validationMiddleware.validateMessage,
    validationMiddleware.validateImageUrl,
    errorMiddleware.asyncHandler(
        messageController.sendMessage.bind(messageController)
    )
);

app.post('/api/whatsapp/groups/:group_id/send-message',
    validationMiddleware.validateUserPlace,
    validationMiddleware.validateGroupId,
    validationMiddleware.validateMessage,
    validationMiddleware.validateImageUrl,
    errorMiddleware.asyncHandler(
        messageController.sendMessageToGroup.bind(messageController)
    )
);

app.post('/api/whatsapp/send-bulk-messages',
    validationMiddleware.validateUserPlace,
    validationMiddleware.validateMessage,
    validationMiddleware.validateImageUrl,
    validationMiddleware.validateBulkRecipients,
    errorMiddleware.asyncHandler(
        messageController.sendBulkMessages.bind(messageController)
    )
);

// Message Management Routes
app.get('/api/whatsapp/messages',
    validationMiddleware.validateUserPlace,
    validationMiddleware.validatePagination,
    errorMiddleware.asyncHandler(
        messageController.getMessageLogs.bind(messageController)
    )
);

app.get('/api/whatsapp/messages/stats',
    validationMiddleware.validateUserPlace,
    errorMiddleware.asyncHandler(
        messageController.getMessageStatistics.bind(messageController)
    )
);

app.post('/api/whatsapp/messages/:message_log_id/retry',
    validationMiddleware.validateUserPlace,
    errorMiddleware.asyncHandler(
        messageController.retryFailedMessage.bind(messageController)
    )
);

// Utility Routes
app.post('/api/whatsapp/test-image-url',
    validationMiddleware.validateImageUrl,
    errorMiddleware.asyncHandler(
        whatsappController.testImageUrl.bind(whatsappController)
    )
);

app.post('/api/whatsapp/validate-message',
    validationMiddleware.validateUserPlace,
    errorMiddleware.asyncHandler(
        messageController.validateMessage.bind(messageController)
    )
);

app.get('/api/whatsapp/templates',
    errorMiddleware.asyncHandler(
        messageController.getMessageTemplates.bind(messageController)
    )
);

// Response time middleware
app.use((req, res, next) => {
    if (req.startTime) {
        const responseTime = Date.now() - req.startTime;
        logger.info(`Response sent: ${req.method} ${req.path} - ${res.statusCode} (${responseTime}ms)`);
    }
    next();
});

// 404 handler
// app.use('*', errorMiddleware.handle404);

// Global error handler
app.use(errorMiddleware.handleError);

// Start server
const server = app.listen(PORT, () => {
    logger.success(`🚀 WhatsApp Integration Service v2.0.0 running on port ${PORT}`);
    logger.info(`📊 Health check: http://localhost:${PORT}/api/health`);
    logger.info(`🖼️  Image support: URL-based downloading`);
    logger.info(`📱 Ready for Laravel integration`);
    logger.info(`⚡ Background contact fetching: ON DEMAND via API`);
    logger.info(`🏗️  Clean Architecture: IMPLEMENTED`);
    logger.info(`🛡️  Error Handling: CENTRALIZED`);
    logger.info(`📝 Logging: STRUCTURED`);
    logger.info(`✅ Validation: COMPREHENSIVE`);
});

// Graceful shutdown handlers
const gracefulShutdown = async (signal) => {
    logger.info(`${signal} received, starting graceful shutdown...`);
    
    // Close HTTP server
    server.close(async () => {
        logger.info('HTTP server closed');
        
        try {
            // Shutdown WhatsApp service
            await whatsappController.whatsAppService.shutdown();
            logger.success('WhatsApp service shut down successfully');
        } catch (error) {
            logger.error('Error shutting down WhatsApp service:', error);
        }
        
        // Close database connection
        try {
            // Add database connection close logic here if needed
            logger.info('Database connections closed');
        } catch (error) {
            logger.error('Error closing database connections:', error);
        }
        
        logger.success('Graceful shutdown completed');
        process.exit(0);
    });
    
    // Force exit after 30 seconds
    setTimeout(() => {
        logger.error('Forced shutdown due to timeout');
        process.exit(1);
    }, 30000);
};

// Handle shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGUSR2', () => gracefulShutdown('SIGUSR2')); // For nodemon

// Handle uncaught exceptions and unhandled rejections
process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception:', error);
    gracefulShutdown('UNCAUGHT_EXCEPTION');
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
    gracefulShutdown('UNHANDLED_REJECTION');
});

// Export app for testing
module.exports = app;
