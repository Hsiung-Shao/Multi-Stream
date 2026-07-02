import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getSupabase } from '../../../lib/supabase';
import type { FeedbackRecord, FeedbackFilter, FeedbackStats } from '../types';

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
            if (filter.search?.trim()) {
                query = query.ilike('content', `%${filter.search.trim()}%`);
            }
            if (filter.hasScore) {
                // 有評分或有 NPS 其一即符合
                query = query.or('rating.not.is.null,nps_score.not.is.null');
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
                .select('feedback_type, status, rating, nps_score, created_at');

            if (error) throw new Error(error.message);

            const records = data || [];
            const total = records.length;
            const unread = records.filter(r => r.status === 'unread').length;

            const byType: Record<string, number> = {};
            const byStatus: Record<string, number> = {};
            records.forEach(r => {
                byType[r.feedback_type] = (byType[r.feedback_type] || 0) + 1;
                byStatus[r.status] = (byStatus[r.status] || 0) + 1;
            });

            const ratings = records.filter(r => r.rating != null).map(r => r.rating as number);
            const avgRating = ratings.length > 0
                ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10
                : null;

            const npsScores = records.filter(r => r.nps_score != null).map(r => r.nps_score as number);
            const avgNps = npsScores.length > 0
                ? Math.round((npsScores.reduce((a, b) => a + b, 0) / npsScores.length) * 10) / 10
                : null;

            // NPS 標準分數:(推薦者 9-10 − 批評者 0-6) / 樣本數 × 100
            const promoters = npsScores.filter(s => s >= 9).length;
            const detractors = npsScores.filter(s => s <= 6).length;
            const npsScore = npsScores.length > 0
                ? Math.round(((promoters - detractors) / npsScores.length) * 100)
                : null;

            // 評分 1-5 / NPS 0-10 分布
            const ratingDist = Array.from({ length: 5 }, () => 0);
            ratings.forEach(r => {
                if (r >= 1 && r <= 5) ratingDist[Math.round(r) - 1] += 1;
            });
            const npsDist = Array.from({ length: 11 }, () => 0);
            npsScores.forEach(s => {
                if (s >= 0 && s <= 10) npsDist[Math.round(s)] += 1;
            });

            // 近 30 日每日回饋數(本地日期,含 0 的日期)與近 7 日新增
            const toLocalDate = (d: Date) => {
                const y = d.getFullYear();
                const m = String(d.getMonth() + 1).padStart(2, '0');
                const day = String(d.getDate()).padStart(2, '0');
                return `${y}-${m}-${day}`;
            };
            const countByDate = new Map<string, number>();
            records.forEach(r => {
                const key = toLocalDate(new Date(r.created_at as string));
                countByDate.set(key, (countByDate.get(key) || 0) + 1);
            });
            const byDay: { date: string; count: number }[] = [];
            const today = new Date();
            for (let i = 29; i >= 0; i--) {
                const d = new Date(today);
                d.setDate(today.getDate() - i);
                const key = toLocalDate(d);
                byDay.push({ date: key, count: countByDate.get(key) || 0 });
            }
            const last7Days = byDay.slice(-7).reduce((sum, d) => sum + d.count, 0);

            return {
                total, unread, byType, byStatus, avgRating, avgNps,
                npsScore, last7Days, byDay, ratingDist, npsDist,
            };
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
