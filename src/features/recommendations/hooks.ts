// 推薦系統 hooks(集中所有 TanStack Query 入口)

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from './apiClient';
import type {
    RecommendationAggregate,
    RecommendationLatest,
    Category,
    CommentItem,
    RecommendInput,
    RecommendSort,
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

export function useRecommendations(params: { sort: RecommendSort; category?: string | null; limit?: number }) {
    const search = new URLSearchParams();
    search.set('sort', params.sort);
    if (params.category) search.set('category', params.category);
    if (params.limit) search.set('limit', String(params.limit));
    return useQuery({
        queryKey: [RECOMMEND_LIST_KEY, params.sort, params.category || null, params.limit ?? 24],
        queryFn: () => apiFetch<RecommendationsListResponse>(`/api/recommendations?${search.toString()}`),
        staleTime: 30_000,
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
        mutationFn: (input: { name: string; slug: string; description?: string }) =>
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
    return useQuery({
        queryKey: [RECOMMEND_COMMENTS_KEY, vtuberId],
        enabled: enabled && !!vtuberId,
        queryFn: () => apiFetch<CommentsResponse>(`/api/recommendations/${encodeURIComponent(vtuberId!)}/comments?limit=20`),
        staleTime: 15_000,
        select: (d) => d.items ?? [],
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
        onSuccess: () => qc.invalidateQueries({ queryKey: [RECOMMEND_LIST_KEY] }),
    });
}

export function useDeleteRecommendation() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (recommendationId: string) =>
            apiFetch<{ ok: true }>(`/api/recommendations?id=${encodeURIComponent(recommendationId)}`, { method: 'DELETE' }),
        onSuccess: () => qc.invalidateQueries({ queryKey: [RECOMMEND_LIST_KEY] }),
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
