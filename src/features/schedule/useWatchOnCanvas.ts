// 週表／個人頁：點一張卡片＝在我們的畫布觀看（2026-09-29 使用者裁定：不再跳原平台）。
// 已在畫布上就直接切過去；否則加進現有畫布（保留已在看的、附聊天室）再切過去。
// 畫布已滿或加入失敗時留在原頁並提示。

import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useStreamStore } from '../../store/useStreamStore';
import { useUIStore } from '../../store/useUIStore';
import { track } from '../../utils/analytics';
import type { StreamData } from '../../utils/streamUtils';
import { CANVAS_MAX_STREAMS } from './openOnCanvas';
import { canvasInput, isNonVideoStream } from './streamLinks';
import type { ScheduleChannel, ScheduleStream } from './types';

/**
 * 這一場是不是已經在畫布上（YouTube 比影片 ID、Twitch 比 login；不靠網址字串）。
 * YouTube 直播中另外比頻道：從收藏或頻道網址（/channel/UC…/live）加入的項目可能沒有 videoId。
 * 沒有影片 ID 的場次（社群週表／投稿）只能比頻道。
 */
export function isOnCanvas(stream: Pick<ScheduleStream, 'platform' | 'external_id' | 'status' | 'source'>, channel: ScheduleChannel | undefined, canvas: readonly Pick<StreamData, 'platform' | 'channelId' | 'videoId'>[]): boolean {
    if (stream.platform === 'youtube') {
        const byChannel = stream.status === 'live' || isNonVideoStream(stream);
        return canvas.some(
            (s) => s.platform === 'youtube' && (s.videoId === stream.external_id || (byChannel && !!channel?.youtube && s.channelId === channel.youtube)),
        );
    }
    const login = channel?.twitch?.toLowerCase();
    return !!login && canvas.some((s) => s.platform === 'twitch' && s.channelId?.toLowerCase() === login);
}

export type WatchResult = 'switched' | 'added' | 'full' | 'failed' | 'unavailable' | 'busy';

export function useWatchOnCanvas(source: 'board' | 'person') {
    const { t } = useTranslation('schedule');
    const [busyKey, setBusyKey] = useState<string | null>(null);
    const busyRef = useRef(false);

    const watch = useCallback(
        async (stream: ScheduleStream, channel: ScheduleChannel | undefined): Promise<WatchResult> => {
            if (busyRef.current) {
                toast.info(t('toast.watchBusy'));
                return 'busy';
            }
            const input = canvasInput(stream, channel);
            if (!input) {
                toast.error(t('toast.watchUnavailable'));
                return 'unavailable';
            }
            const { streams, addStream } = useStreamStore.getState();
            const setPage = useUIStore.getState().setPage;
            if (isOnCanvas(stream, channel, streams)) {
                track.scheduleWatch(stream.platform, stream.status, source, 'switched');
                setPage('canvas');
                return 'switched';
            }
            if (streams.length >= CANVAS_MAX_STREAMS) {
                toast.error(t('toast.watchFull'));
                track.scheduleWatch(stream.platform, stream.status, source, 'full');
                return 'full';
            }
            busyRef.current = true;
            setBusyKey(`${stream.platform}:${stream.external_id}`);
            try {
                const res = await addStream(input, { withChat: true, withStream: true, displayName: channel?.name ?? input });
                // store 判定重複（網址形式不同但其實同一路）會帶回既有的 streamId：當成已在畫布，直接切過去
                if (res && res.success === false && res.streamId != null) {
                    track.scheduleWatch(stream.platform, stream.status, source, 'switched');
                    setPage('canvas');
                    return 'switched';
                }
                if (res && res.success === false) {
                    toast.error(t('toast.watchFailed'));
                    track.scheduleWatch(stream.platform, stream.status, source, 'failed');
                    return 'failed';
                }
                track.scheduleWatch(stream.platform, stream.status, source, 'added');
                setPage('canvas');
                return 'added';
            } catch {
                toast.error(t('toast.watchFailed'));
                track.scheduleWatch(stream.platform, stream.status, source, 'failed');
                return 'failed';
            } finally {
                busyRef.current = false;
                setBusyKey(null);
            }
        },
        [source, t],
    );

    return { watch, busyKey };
}
