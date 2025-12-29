import { FeedbackFormData } from './FeedbackTypes';

const API_BASE_URL = 'https://api.multistreaming.org';
const FEEDBACK_ENDPOINT = `${API_BASE_URL}/api/feedback`;

export interface FeedbackPayload extends FeedbackFormData {
    userAgent: string;
    screenResolution: string;
    windowSize: string;
    theme: string;
    version: string;
}

export const FeedbackService = {
    /**
     * Sends feedback data to the Discord Bot API.
     * @param data The complete feedback data including system info.
     */
    sendFeedback: async (data: FeedbackPayload): Promise<void> => {
        try {
            const response = await fetch(FEEDBACK_ENDPOINT, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(data),
            });

            if (!response.ok) {
                // Try to parse error message if available
                let errorMessage = `HTTP error! status: ${response.status}`;
                try {
                    const errorBody = await response.json();
                    if (errorBody && errorBody.message) {
                        errorMessage = errorBody.message;
                    }
                } catch (e) {
                    // Ignore JSON parse error, use default message
                }
                throw new Error(errorMessage);
            }
        } catch (error) {
            console.error('Failed to send feedback:', error);
            throw error;
        }
    }
};
