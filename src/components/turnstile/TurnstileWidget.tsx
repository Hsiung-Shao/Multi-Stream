// Cloudflare Turnstile 人機驗證（投稿 VTuber、資料回報）。
// 不用第三方套件：表單出現時才載入官方 api.js（render=explicit），渲染一個 widget；
// token 只能用一次、300 秒過期，所以送出後（不論成敗）由父層呼叫 reset。
// 伺服器端沒強制（enforced=false：本地、尚未設定）時不顯示 widget，onToken('') 讓表單可送出。

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchTurnstileConfig } from '../../features/contribute/api';

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

interface TurnstileApi {
    render: (el: HTMLElement, opts: Record<string, unknown>) => string;
    reset: (id: string) => void;
    remove: (id: string) => void;
}

declare global {
    interface Window {
        turnstile?: TurnstileApi;
    }
}

let scriptPromise: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
    if (window.turnstile) return Promise.resolve(window.turnstile);
    if (!scriptPromise) {
        scriptPromise = new Promise<TurnstileApi>((resolve, reject) => {
            const s = document.createElement('script');
            s.src = SCRIPT_SRC;
            s.async = true;
            s.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('turnstile_missing')));
            s.onerror = () => reject(new Error('turnstile_blocked'));
            document.head.appendChild(s);
        }).catch((e) => {
            scriptPromise = null; // 下次再試（例如使用者關掉阻擋器後）
            throw e;
        });
    }
    return scriptPromise;
}

export interface TurnstileHandle {
    reset: () => void;
}

interface Props {
    /** 取得新 token 時呼叫；過期或錯誤時以 null 呼叫；不需要驗證時以 '' 呼叫 */
    onToken: (token: string | null) => void;
    className?: string;
}

type Status = 'loading' | 'ready' | 'blocked' | 'expired' | 'off';

export const TurnstileWidget = forwardRef<TurnstileHandle, Props>(function TurnstileWidget({ onToken, className }, ref) {
    const { t, i18n } = useTranslation('schedule');
    const holder = useRef<HTMLDivElement>(null);
    const widgetId = useRef<string | null>(null);
    const api = useRef<TurnstileApi | null>(null);
    const onTokenRef = useRef(onToken);
    onTokenRef.current = onToken;
    const [status, setStatus] = useState<Status>('loading');

    useImperativeHandle(ref, () => ({
        reset: () => {
            if (api.current && widgetId.current) {
                api.current.reset(widgetId.current);
                onTokenRef.current(null);
            }
        },
    }));

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const cfg = await fetchTurnstileConfig();
                if (cancelled) return;
                if (!cfg.enforced || !cfg.siteKey) {
                    setStatus('off');
                    onTokenRef.current('');
                    return;
                }
                const ts = await loadTurnstile();
                if (cancelled || !holder.current) return;
                api.current = ts;
                widgetId.current = ts.render(holder.current, {
                    sitekey: cfg.siteKey,
                    theme: 'auto',
                    language: i18n.language || 'auto',
                    callback: (token: string) => {
                        setStatus('ready');
                        onTokenRef.current(token);
                    },
                    'expired-callback': () => {
                        setStatus('expired');
                        onTokenRef.current(null);
                    },
                    'error-callback': () => {
                        onTokenRef.current(null);
                    },
                });
                setStatus('ready');
            } catch {
                if (!cancelled) setStatus('blocked');
            }
        })();
        return () => {
            cancelled = true;
            if (api.current && widgetId.current) api.current.remove(widgetId.current);
            widgetId.current = null;
        };
        // 只在掛載時初始化；語言切換不重建 widget
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    if (status === 'off') return null;
    return (
        <div className={className}>
            <div ref={holder} />
            {status === 'loading' && <p className="text-xs text-muted-foreground">{t('turnstile.loading')}</p>}
            {status === 'blocked' && <p role="alert" className="text-xs text-amber-600 dark:text-amber-400">{t('turnstile.blocked')}</p>}
            {status === 'expired' && <p className="text-xs text-muted-foreground">{t('turnstile.expired')}</p>}
        </div>
    );
});
