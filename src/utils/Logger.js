/**
 * Logger utility for consistent logging across the application
 */
class Logger {
    constructor(context = 'App') {
        this.context = context;
    }

    /**
     * Get formatted timestamp
     */
    getTimestamp() {
        return new Date().toISOString();
    }

    /**
     * Format log message
     */
    formatMessage(level, message, data = null) {
        const timestamp = this.getTimestamp();
        const contextString = `[${this.context}]`;
        
        let logMessage = `${timestamp} ${level.toUpperCase()} ${contextString} ${message}`;
        
        if (data) {
            logMessage += ` | Data: ${JSON.stringify(data, null, 2)}`;
        }
        
        return logMessage;
    }

    /**
     * Info level logging
     */
    info(message, data = null) {
        console.log(this.formatMessage('info', message, data));
    }

    /**
     * Error level logging
     */
    error(message, error = null) {
        const errorData = error ? {
            message: error.message,
            stack: error.stack,
            ...(error.code && { code: error.code })
        } : null;
        
        console.error(this.formatMessage('error', message, errorData));
    }

    /**
     * Warning level logging
     */
    warn(message, data = null) {
        console.warn(this.formatMessage('warn', message, data));
    }

    /**
     * Debug level logging (only in development)
     */
    debug(message, data = null) {
        if (process.env.NODE_ENV === 'development') {
            console.debug(this.formatMessage('debug', message, data));
        }
    }

    /**
     * Success level logging
     */
    success(message, data = null) {
        console.log(`✅ ${this.formatMessage('success', message, data)}`);
    }

    /**
     * Start operation logging
     */
    start(operation, data = null) {
        console.log(`🔄 ${this.formatMessage('start', `Starting ${operation}`, data)}`);
    }

    /**
     * Complete operation logging
     */
    complete(operation, data = null) {
        console.log(`✅ ${this.formatMessage('complete', `Completed ${operation}`, data)}`);
    }

    /**
     * Progress logging
     */
    progress(message, current, total) {
        const percentage = Math.round((current / total) * 100);
        console.log(`📊 ${this.formatMessage('progress', `${message} ${percentage}% (${current}/${total})`)}`);
    }
}

module.exports = Logger;
