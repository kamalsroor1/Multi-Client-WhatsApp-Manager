/**
 * Standardized API Response utility
 */
class ApiResponse {
    /**
     * Success response
     */
    static success(res, data = null, message = 'Success', statusCode = 200) {
        return res.status(statusCode).json({
            success: true,
            message,
            data,
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Error response
     */
    static error(res, message = 'Error', statusCode = 500, details = null) {
        const response = {
            success: false,
            message,
            timestamp: new Date().toISOString()
        };

        if (details) {
            response.details = details;
        }

        return res.status(statusCode).json(response);
    }

    /**
     * Paginated response
     */
    static paginated(res, data, pagination, message = 'Success') {
        return res.status(200).json({
            success: true,
            message,
            data,
            pagination,
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Created response
     */
    static created(res, data, message = 'Created successfully') {
        return ApiResponse.success(res, data, message, 201);
    }

    /**
     * No content response
     */
    static noContent(res) {
        return res.status(204).send();
    }
}

module.exports = ApiResponse;
