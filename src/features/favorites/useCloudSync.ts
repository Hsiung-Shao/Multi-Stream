// useCloudSync — 雲端同步 hook
//
// 職責：
// 1. 監聽 onAuthStateChange — 登入時自動拉雲端、判定衝突，未衝突直接 use cloud；衝突 → 通知 UI 開 dialog
// 2. 監聽 favorites/categories/tags 任何寫入事件，fire-and-forget pushToCloud
// 3. 提供 syncStatus state（idle / pulling / pushing / conflict / error）
// 4. 暴露手動觸發：syncNow()、resolveConflict('keep_cloud' | 'keep_local' | 'merge')

import { useEffect, useRef, useState, useCallback } from 'react';
import { getSupabase } from '../../lib/supabase';
import { useAuthContext } from '../../contexts/AuthContext';
import { FavoritesRepository } from './FavoritesRepository';
import { CategoryRepository } from './CategoryRepository';
import { TagsRepository } from './TagsRepository';
import {
    pullFromCloud,
    pushToCloud,
    replaceCloud,
    mergeByUpdatedAt,
    diffSummary,
    getLastSyncAt,
    setLastSyncAt,
    clearLastSyncAt,
    type SnapshotLocal,
    type DiffSummary,
} from './cloudSync';

export type SyncStatus = 'idle' | 'pulling' | 'pushing' | 'conflict' | 'error' | 'success';

export type ConflictResolution = 'keep_cloud' | 'keep_local' | 'merge';

interface ConflictPayload {
    diff: DiffSummary;
    cloud: SnapshotLocal;
    local: SnapshotLocal;
}

interface UseCloudSyncReturn {
    status: SyncStatus;
    error: string | null;
    lastSyncAt: string | null;
    conflict: ConflictPayload | null;
    syncNow: () => Promise<void>;
    resolveConflict: (decision: ConflictResolution) => Promise<void>;
}

// 既有 events（FavoritesService / TagsService 已 dispatch）
const FAV_EVENT = 'favoritesUpdated';
const TAGS_EVENT = 'tagsUpdated';
const PUSH_DEBOUNCE_MS = 2000;

// 給 cloud 觸發的 event 加 source marker，避免 push handler 把 cloud pull 又 push 回去造成循環
function dispatchCloudUpdate(source: string) {
    window.dispatchEvent(new CustomEvent(FAV_EVENT, { detail: { source } }));
    window.dispatchEvent(new CustomEvent(TAGS_EVENT, { detail: { source } }));
}

function readLocalSnapshot(): SnapshotLocal {
    return {
        favorites: new FavoritesRepository().getList(),
        categories: new CategoryRepository().getList(),
        tags: new TagsRepository().getList(),
    };
}

function writeLocalSnapshot(snap: SnapshotLocal): void {
    new FavoritesRepository().saveList(snap.favorites);
    new CategoryRepository().saveList(snap.categories);
    new TagsRepository().saveList(snap.tags);
}

export function useCloudSync(): UseCloudSyncReturn {
    const { isLoggedIn, user } = useAuthContext();
    const [status, setStatus] = useState<SyncStatus>('idle');
    const [error, setError] = useState<string | null>(null);
    const [lastSyncAt, setLastSyncAtState] = useState<string | null>(getLastSyncAt());
    const [conflict, setConflict] = useState<ConflictPayload | null>(null);

    const pushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastSignedInUserId = useRef<string | null>(null);

    const markSuccess = useCallback(() => {
        const iso = new Date().toISOString();
        setLastSyncAt(iso);
        setLastSyncAtState(iso);
        setStatus('success');
        setError(null);
        // 1.5s 後回到 idle
        setTimeout(() => setStatus(prev => prev === 'success' ? 'idle' : prev), 1500);
    }, []);

    const performInitialSync = useCallback(async (userId: string) => {
        const supabase = await getSupabase();
        if (!supabase) {
            setError('Supabase 未初始化');
            setStatus('error');
            return;
        }

        try {
            setStatus('pulling');
            setError(null);
            const cloud = await pullFromCloud(supabase, userId);
            const local = readLocalSnapshot();

            const cloudEmpty = cloud.favorites.length + cloud.categories.length + cloud.tags.length === 0;
            const localEmpty = local.favorites.length + local.categories.length + local.tags.length === 0;

            // case 1: 雲端空 + 本地有 → 直接 push（first device）
            if (cloudEmpty && !localEmpty) {
                setStatus('pushing');
                await pushToCloud(supabase, userId, local);
                markSuccess();
                return;
            }

            // case 2: 雲端有 + 本地空 → 直接 pull
            if (!cloudEmpty && localEmpty) {
                writeLocalSnapshot(cloud);
                dispatchCloudUpdate('cloud-pull');
                markSuccess();
                return;
            }

            // case 3: 雙方皆空 → 無事可做
            if (cloudEmpty && localEmpty) {
                markSuccess();
                return;
            }

            // case 4: 雙方都有 → 比對 diff，無 conflict 直接 merge；有 conflict 開 dialog
            const diff = diffSummary(local, cloud);
            const hasConflict = diff.favorites.conflict + diff.categories.conflict + diff.tags.conflict > 0;
            if (!hasConflict) {
                // 純聯集，無需 user 決定
                const merged = mergeByUpdatedAt(local, cloud);
                writeLocalSnapshot(merged);
                await pushToCloud(supabase, userId, merged);
                dispatchCloudUpdate('cloud-merge-auto');
                markSuccess();
                return;
            }

            // 有衝突 — 等 user 從 dialog 決定
            setStatus('conflict');
            setConflict({ diff, cloud, local });
        } catch (e) {
            setError(e instanceof Error ? e.message : '同步失敗');
            setStatus('error');
        }
    }, [markSuccess]);

    const resolveConflict = useCallback(async (decision: ConflictResolution) => {
        if (!conflict || !user) return;
        const supabase = await getSupabase();
        if (!supabase) return;

        try {
            setStatus('pushing');
            setError(null);

            if (decision === 'keep_cloud') {
                writeLocalSnapshot(conflict.cloud);
                dispatchCloudUpdate('cloud-keep');
            } else if (decision === 'keep_local') {
                await replaceCloud(supabase, user.id, conflict.local);
            } else { // merge
                const merged = mergeByUpdatedAt(conflict.local, conflict.cloud);
                writeLocalSnapshot(merged);
                await pushToCloud(supabase, user.id, merged);
                dispatchCloudUpdate('cloud-merge');
            }

            setConflict(null);
            markSuccess();
        } catch (e) {
            setError(e instanceof Error ? e.message : '解決衝突失敗');
            setStatus('error');
        }
    }, [conflict, user, markSuccess]);

    const syncNow = useCallback(async () => {
        if (!user) return;
        const supabase = await getSupabase();
        if (!supabase) return;
        try {
            setStatus('pushing');
            setError(null);
            await pushToCloud(supabase, user.id, readLocalSnapshot());
            markSuccess();
        } catch (e) {
            setError(e instanceof Error ? e.message : '同步失敗');
            setStatus('error');
        }
    }, [user, markSuccess]);

    // ===== 登入 / 登出觸發 =====
    useEffect(() => {
        if (!isLoggedIn || !user) {
            // logout：清同步狀態，但不清 localStorage（保留離線資料）
            lastSignedInUserId.current = null;
            clearLastSyncAt();
            setLastSyncAtState(null);
            setStatus('idle');
            setConflict(null);
            return;
        }

        // 同 user 重複觸發避免 — 防 React 18 strict mode double mount
        if (lastSignedInUserId.current === user.id) return;
        lastSignedInUserId.current = user.id;

        performInitialSync(user.id);
    }, [isLoggedIn, user, performInitialSync]);

    // ===== 監聽 favorites / tags 變更事件，fire-and-forget pushToCloud =====
    useEffect(() => {
        if (!isLoggedIn || !user) return;

        const handler = (e: Event) => {
            // 雲端 pull / merge 自己觸發的事件不該再 push（避免循環）
            const source = (e as CustomEvent).detail?.source;
            if (source && typeof source === 'string' && source.startsWith('cloud-')) return;

            // debounce：user 連續多次操作只 push 一次
            if (pushTimerRef.current) clearTimeout(pushTimerRef.current);
            pushTimerRef.current = setTimeout(async () => {
                try {
                    const supabase = await getSupabase();
                    if (!supabase) return;
                    await pushToCloud(supabase, user.id, readLocalSnapshot());
                    const iso = new Date().toISOString();
                    setLastSyncAt(iso);
                    setLastSyncAtState(iso);
                } catch { /* fire-and-forget — silent */ }
            }, PUSH_DEBOUNCE_MS);
        };

        window.addEventListener(FAV_EVENT, handler);
        window.addEventListener(TAGS_EVENT, handler);
        return () => {
            window.removeEventListener(FAV_EVENT, handler);
            window.removeEventListener(TAGS_EVENT, handler);
            if (pushTimerRef.current) clearTimeout(pushTimerRef.current);
        };
    }, [isLoggedIn, user]);

    return {
        status,
        error,
        lastSyncAt,
        conflict,
        syncNow,
        resolveConflict,
    };
}
