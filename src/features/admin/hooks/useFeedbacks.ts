import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getSupabase } from '../../../lib/supabase';
import type { FeedbackRecord, FeedbackFilter, FeedbackStats, FeedbackStatus } from '../types';

const QUERY_KEY = 'admin-feedbacks';
const STATS_KEY = 'admin-feedback-stats';

export function useFeedbacks(filter: FeedbackFilter) {
    return useQuery({
        queryKey: [QUERY_KEY, filter],
        queryFn: async (): Promise<{ data: FeedbackRecord[]; count: number }> => {
            const supabase = await getSupabase();
            if (!supabase) throw new Error('Supabase 未初始化');

            let query = supabase
                .from('feedbacks')
                .select('*', { count: 'exact' })
                .order('created_at', { ascending: false });

            if (filter.feedbackType) {
                query = query.eq('feedback_type', filter.feedbackType);
            }
            if (filter.status) {
                query = query.eq('status', filter.status);
            }
            if (filter.dateFrom) {
                query = query.gte('created_at', filter.dateFrom);
            }
            if (filter.dateTo) {
                query = query.lte('created_at', filter.dateTo + 'T23:59:59.999Z');
            }

            const from = (filter.page - 1) * filter.pageSize;
            const to = from + filter.pageSize - 1;
            query = query.range(from, to);

            const { data, error, count } = await query;
            if (error) throw new Error(error.message);
            return { data: (data as FeedbackRecord[]) || [], count: count ?? 0 };
        },
    });
}

export function useFeedbackStats() {
    return useQuery({
        queryKey: [STATS_KEY],
        queryFn: async (): Promise<FeedbackStats> => {
            const supabase = await getSupabase();
            if (!supabase) throw new Error('Supabase 未初始化');

            const { data, error } = await supabase
                .from('feedbacks')
                .select('feedback_type, status, rating, nps_score');

            if (error) throw new Error(error.message);

            const records = data || [];
            const total = records.length;
            const unread = records.filter(r => r.status === 'unread').length;

            const byType: Record<string, number> = {};
            records.forEach(r => {
                byType[r.feedback_type] = (byType[r.feedback_type] || 0) + 1;
            });

            const ratings = records.filter(r => r.rating != null).map(r => r.rating as number);
            const avgRating = ratings.length > 0
                ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10
                : null;

            const npsScores = records.filter(r => r.nps_score != null).map(r => r.nps_score as number);
            const avgNps = npsScores.length > 0
                ? Math.round((npsScores.reduce((a, b) => a + b, 0) / npsScores.length) * 10) / 10
                : null;

            return { total, unread, byType, avgRating, avgNps };
        },
    });
}

export function useUpdateFeedback() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ id, updates }: { id: string; updates: Partial<Pick<FeedbackRecord, 'status' | 'admin_notes'>> }) => {
            const supabase = await getSupabase();
            if (!supabase) throw new Error('Supabase 未初始化');

            const { error } = await supabase
                .from('feedbacks')
                .update(updates)
                .eq('id', id);

            if (error) throw new Error(error.message);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
            queryClient.invalidateQueries({ queryKey: [STATS_KEY] });
        },
    });
}

export function useDeleteFeedback() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (id: string) => {
            const supabase = await getSupabase();
            if (!supabase) throw new Error('Supabase 未初始化');

            const { error } = await supabase
                .from('feedbacks')
                .delete()
                .eq('id', id);

            if (error) throw new Error(error.message);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
            queryClient.invalidateQueries({ queryKey: [STATS_KEY] });
        },
    });
}
