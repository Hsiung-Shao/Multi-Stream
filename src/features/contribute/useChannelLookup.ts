// 投稿表單的 YouTube 頻道自動帶入：網址停止輸入 600ms 後查詢（/api/vtuber/channel-lookup），
// 新的輸入會取消上一個查詢；結果包含「已在週表上」與「已有人推薦待審」，讓表單提早導引。
// 輸入一改就進 loading（不等 debounce）：舊頻道的結果不能留著，否則表單會把舊頻道的名稱配新網址送出。

import { useEffect, useState } from 'react';
import { lookupChannel, SubmitError, type ChannelLookupResult } from './api';

export type LookupState =
    | { status: 'idle' }
    | { status: 'loading' }
    | { status: 'found'; result: ChannelLookupResult }
    | { status: 'error'; code: string };

const DEBOUNCE_MS = 600;

/** 看起來像 YouTube 頻道輸入才查（避免每打一個字就打 API） */
export function looksLikeChannelInput(raw: string): boolean {
    const s = raw.trim();
    return /^UC[A-Za-z0-9_-]{22}$/.test(s) || /^@\S{3,}$/.test(s) || /youtube\.com\/(channel\/UC|@)\S{3,}/i.test(s);
}

export function useChannelLookup(input: string): LookupState {
    const [state, setState] = useState<LookupState>({ status: 'idle' });

    useEffect(() => {
        const value = input.trim();
        if (!looksLikeChannelInput(value)) {
            setState({ status: 'idle' });
            return;
        }
        const controller = new AbortController();
        setState({ status: 'loading' });
        const timer = setTimeout(async () => {
            try {
                const result = await lookupChannel(value, controller.signal);
                if (!controller.signal.aborted) setState({ status: 'found', result });
            } catch (e) {
                if (controller.signal.aborted) return;
                setState({ status: 'error', code: e instanceof SubmitError ? e.code : 'generic' });
            }
        }, DEBOUNCE_MS);
        return () => {
            clearTimeout(timer);
            controller.abort();
        };
    }, [input]);

    return state;
}
