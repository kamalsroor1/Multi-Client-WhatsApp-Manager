const mongoose = require('mongoose');

const connectDB = async () => {
    try {
        // Build connection string
        let mongoURI = process.env.MONGODB_URI;
        
        // If URI not provided, build from components
        if (!mongoURI) {
            const host = process.env.MONGODB_HOST || 'localhost';
            const port = process.env.MONGODB_PORT || '27017';
            const database = process.env.MONGODB_DATABASE || 'whatsapp_integration';
            const username = process.env.MONGODB_USERNAME;
            const password = process.env.MONGODB_PASSWORD;
            
            if (username && password) {
                mongoURI = `mongodb://${username}:${password}@${host}:${port}/${database}`;
            } else {
                mongoURI = `mongodb://${host}:${port}/${database}`;
            }
        }

        console.log(`Connecting to MongoDB: ${mongoURI.replace(/\/\/.*@/, '//***:***@')}`);

        const conn = await mongoose.connect(mongoURI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            maxPoolSize: 10, // Maintain up to 10 socket connections
            serverSelectionTimeoutMS: 5000, // Keep trying to send operations for 5 seconds
            socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
            // bufferMaxEntries: 0 // Disable mongoose buffering
        });

        console.log(`✅ MongoDB Connected: ${conn.connection.host}:${conn.connection.port}`);
        console.log(`📊 Database: ${conn.connection.name}`);
        
        // Handle connection events
        mongoose.connection.on('error', (err) => {
            console.error('❌ MongoDB connection error:', err);
        });

        mongoose.connection.on('disconnected', () => {
            console.log('🔌 MongoDB disconnected');
        });

        mongoose.connection.on('reconnected', () => {
            console.log('🔄 MongoDB reconnected');
        });

        // Graceful shutdown
        process.on('SIGINT', async () => {
            try {
                await mongoose.connection.close();
                console.log('🔒 MongoDB connection closed through app termination');
                process.exit(0);
            } catch (error) {
                console.error('Error closing MongoDB connection:', error);
                process.exit(1);
            }
        });

    } catch (error) {
        console.error('❌ Error connecting to MongoDB:', error);
        
        // Retry connection after 5 seconds
        console.log('🔄 Retrying connection in 5 seconds...');
        setTimeout(connectDB, 5000);
    }
};

module.exports = connectDB;