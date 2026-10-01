// 週表與個人頁共用的「勾選 → 一鍵在畫布觀看」狀態。
// 逐一 await addStream（openOnCanvas.ts）；成功後清空勾選並切到畫布。

import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useStreamStore } from '../../store/useStreamStore';
import { useUIStore } from '../../store/useUIStore';
import { track } from '../../utils/analytics';
import { CANVAS_MAX_STREAMS, openOnCanvas, toOpenTargets } from './openOnCanvas';
import { streamKey, type ScheduleChannel, type ScheduleStream } from './types';

export function useScheduleSelection(channels: Record<string, ScheduleChannel>, scope: string) {
    const { t } = useTranslation('schedule');
    const [selected, setSelected] = useState<Map<string, ScheduleStream>>(() => new Map());
    const [busy, setBusy] = useState(false);
    const canvasCount = useStreamStore((s) => s.streams.length);
    const room = Math.max(0, CANVAS_MAX_STREAMS - canvasCount);

    const toggle = useCallback((s: ScheduleStream) => {
        setSelected((prev) => {
            const next = new Map(prev);
            const k = streamKey(s);
            if (next.has(k)) next.delete(k);
            else next.set(k, s);
            return next;
        });
    }, []);

    const selectMany = useCallback((list: ScheduleStream[]) => {
        setSelected((prev) => {
            const next = new Map(prev);
            for (const s of list) next.set(streamKey(s), s);
            return next;
        });
    }, []);

    const clear = useCallback(() => setSelected(new Map()), []);
    /** 只保留 keep 回傳 true 的勾選（例如預定時間已過、卡片已從畫面消失的場次）；沒有變動時不換 state */
    const prune = useCallback((keep: (s: ScheduleStream) => boolean) => {
        setSelected((prev) => {
            const next = new Map([...prev].filter(([, s]) => keep(s)));
            return next.size === prev.size ? prev : next;
        });
    }, []);
    const selectedKeys = useMemo(() => new Set(selected.keys()), [selected]);

    const open = useCallback(
        async (list: ScheduleStream[] = [...selected.values()]) => {
            const targets = toOpenTargets(list, channels);
            const kinds = new Set(list.map((s) => (s.status === 'live' ? 'live' : 'upcoming')));
            setBusy(true);
            try {
                const addStream = useStreamStore.getState().addStream;
                const res = await openOnCanvas(targets, useStreamStore.getState().streams.length, addStream);
                track.scheduleOpenMulti(list.length, res.added, kinds.size > 1 ? 'mixed' : [...kinds][0] ?? 'live', scope);
                if (res.added === 0) toast.error(t('toast.none'));
                else if (res.failed > 0) toast.warning(t('toast.partial', { added: res.added, failed: res.failed }));
                else toast.success(t('toast.added', { count: res.added }));
                if (res.skipped > 0) toast.info(t('toast.skipped', { count: res.skipped }));
                if (res.added > 0) {
                    setSelected(new Map());
                    useUIStore.getState().setPage('canvas');
                }
            } finally {
                setBusy(false);
            }
        },
        [channels, scope, selected, t],
    );

    return { selected, selectedKeys, toggle, selectMany, clear, prune, open, busy, room };
}
