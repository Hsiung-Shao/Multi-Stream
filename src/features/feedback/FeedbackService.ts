import { FeedbackFormData } from './FeedbackTypes';
import { getSupabase } from '../../lib/supabase';

export interface FeedbackPayload extends FeedbackFormData {
    userAgent: string;
    screenResolution: string;
    windowSize: string;
    theme: string;
    version: string;
}

export const FeedbackService = {
    /**
     * Sends feedback data to Supabase.
     * @param data The complete feedback data including system info.
     */
    sendFeedback: async (data: FeedbackPayload): Promise<void> => {
        try {
            const supabase = await getSupabase();

            if (!supabase) {
                throw new Error('Supabase is not configured');
            }

            const { error } = await supabase.from('feedbacks').insert({
                feedback_type: data.feedbackType,
                content: data.content,
                source: data.source || null,
                usage_time: data.usageTime?.length ? data.usageTime : null,
                usage_duration: data.usageDuration || null,
                rating: data.rating ?? null,
                nps_score: data.npsScore ?? null,
                user_agent: data.userAgent,
                screen_resolution: data.screenResolution,
                window_size: data.windowSize,
                theme: data.theme,
                app_version: data.version,
            });

            if (error) {
                throw new Error(error.message);
            }
        } catch (error) {
            console.error('Failed to send feedback');
            throw error;
        }
    }
};
