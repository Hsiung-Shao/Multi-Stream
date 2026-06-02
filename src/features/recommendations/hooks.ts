// 推薦系統 hooks(集中所有 TanStack Query 入口)

import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import { apiFetch } from './apiClient';
import { favoritesService } from '../favorites/FavoritesService';
import type {
    RecommendationAggregate,
    RecommendationLatest,
    Category,
    CommentItem,
    RecommendInput,
    RecommendSort,
    MyRecommendation,
} from './types';

const RECOMMEND_LIST_KEY = 'recommendations';
const RECOMMEND_COMMENTS_KEY = 'recommendation-comments';
const CATEGORIES_KEY = 'recommendation-categories';

// ---------- 列表 / 排行 ----------

export interface RecommendationsListResponse {
    ok: true;
    sort: RecommendSort;
    items: RecommendationAggregate[] | RecommendationLatest[];
}

export function useRecommendations(params: { sort: RecommendSort; category?: string | null; limit?: number; enabled?: boolean }) {
    const search = new URLSearchParams();
    search.set('sort', params.sort);
    if (params.category) search.set('category', params.category);
    if (params.limit) search.set('limit', String(params.limit));
    return useQuery({
        queryKey: [RECOMMEND_LIST_KEY, params.sort, params.category || null, params.limit ?? 24],
        queryFn: () => apiFetch<RecommendationsListResponse>(`/api/recommendations?${search.toString()}`),
        staleTime: 30_000,
        enabled: params.enabled ?? true,
    });
}

// ---------- Categories ----------

export interface CategoriesResponse {
    ok: true;
    categories: Category[];
}

export function useCategories() {
    return useQuery({
        queryKey: [CATEGORIES_KEY],
        queryFn: () => apiFetch<CategoriesResponse>('/api/categories'),
        staleTime: 60_000,
        select: (d) => d.categories ?? [],
    });
}

export function useProposeCategory() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (input: { name: string }) =>
            apiFetch<{ ok: true; category: Category }>('/api/categories', { method: 'POST', body: input }),
        onSuccess: () => qc.invalidateQueries({ queryKey: [CATEGORIES_KEY] }),
    });
}

// ---------- 留言 ----------

export interface CommentsResponse {
    ok: true;
    items: CommentItem[];
    next_cursor: string | null;
}

export function useRecommendationComments(vtuberId: string | null, enabled: boolean) {
    return useInfiniteQuery({
        queryKey: [RECOMMEND_COMMENTS_KEY, vtuberId],
        enabled: enabled && !!vtuberId,
        initialPageParam: null as string | null,
        queryFn: ({ pageParam }) => {
            const search = new URLSearchParams();
            search.set('limit', '20');
            if (pageParam) search.set('cursor', pageParam);
            return apiFetch<CommentsResponse>(
                `/api/recommendations/${encodeURIComponent(vtuberId!)}/comments?${search.toString()}`,
            );
        },
        getNextPageParam: (lastPage: CommentsResponse) => lastPage.next_cursor,
        staleTime: 15_000,
    });
}

// ---------- Recommend mutation ----------

export interface RecommendResult {
    ok: true;
    recommendation_id: string;
    vtuber_id: string;
}
export interface AlreadyRecommended {
    ok: false;
    reason: 'already_recommended';
    vtuber_id: string;
}
export type RecommendResponse = RecommendResult | AlreadyRecommended;

export function useRecommendMutation() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (input: RecommendInput) =>
            apiFetch<RecommendResponse>('/api/recommendations', {
                method: 'POST',
                body: input,
                treatOkFalseAsResult: true,
            }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: [RECOMMEND_LIST_KEY] });
            qc.invalidateQueries({ queryKey: ['my-recommendations'] });
        },
    });
}

export interface DeleteRecommendationInput {
    recommendationId: string;
    identity?: { platform: 'twitch' | 'youtube'; channelId: string };
}

export function useDeleteRecommendation() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ recommendationId }: DeleteRecommendationInput) =>
            apiFetch<{ ok: true }>(`/api/recommendations?id=${encodeURIComponent(recommendationId)}`, { method: 'DELETE' }),
        onSuccess: (_, vars) => {
            qc.invalidateQueries({ queryKey: [RECOMMEND_LIST_KEY] });
            qc.invalidateQueries({ queryKey: [MY_RECOMMENDATIONS_KEY] });
            if (vars.identity) {
                favoritesService.unmarkRecommendedByChannel(vars.identity.platform, vars.identity.channelId);
            }
        },
    });
}

// ---------- 我的推薦 ----------

const MY_RECOMMENDATIONS_KEY = 'my-recommendations';

export function useMyRecommendations(enabled: boolean = true) {
    return useQuery({
        queryKey: [MY_RECOMMENDATIONS_KEY],
        enabled,
        queryFn: () => apiFetch<{ ok: true; items: MyRecommendation[] }>('/api/recommendations/mine'),
        staleTime: 30_000,
        select: (d) => d.items ?? [],
    });
}

// ---------- Tag / Untag ----------

export function useTagCategory() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (input: { vtuberId: string; categoryId: string }) =>
            apiFetch<{ ok: true } | { ok: false; reason: 'already_tagged' }>(
                `/api/vtubers/${encodeURIComponent(input.vtuberId)}/categories`,
                { method: 'POST', body: { category_id: input.categoryId }, treatOkFalseAsResult: true },
            ),
        onSuccess: () => qc.invalidateQueries({ queryKey: [RECOMMEND_LIST_KEY] }),
    });
}

export function useUntagCategory() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (input: { vtuberId: string; categoryId: string }) =>
            apiFetch<{ ok: true }>(
                `/api/vtubers/${encodeURIComponent(input.vtuberId)}/categories?category_id=${encodeURIComponent(input.categoryId)}`,
                { method: 'DELETE' },
            ),
        onSuccess: () => qc.invalidateQueries({ queryKey: [RECOMMEND_LIST_KEY] }),
    });
}
