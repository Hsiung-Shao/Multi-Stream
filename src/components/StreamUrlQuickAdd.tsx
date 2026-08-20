// 「貼上網址馬上看」快速新增串流輸入框。
// 共用於首頁 Hero 與 /canvas 空狀態——把工具入口放到第一屏，對齊同類工具
// （multitwitch.tv 等）「首屏即輸入框」的使用型態，降低 time-to-first-stream。
// ⚠ 原字串直接交給 addStream（它支援裸 Twitch 頻道名的 fallback），不要用 parseStreamUrl 預先擋。

import { useCallback, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Play, Loader2 } from 'lucide-react';
import { useStreamStore } from '../store/useStreamStore';
import { useUIStore } from '../store/useUIStore';
import { cn } from './ui/utils';

interface StreamUrlQuickAddProps {
    /** lg = 首頁 Hero 尺寸；md = canvas 空狀態尺寸 */
    size?: 'lg' | 'md';
    /** 新增成功後導向 /canvas（首頁用） */
    navigateToCanvas?: boolean;
    className?: string;
    /** 新增成功後回呼（例如關閉容器） */
    onAdded?: () => void;
}

export function StreamUrlQuickAdd({ size = 'md', navigateToCanvas = false, className, onAdded }: StreamUrlQuickAddProps) {
    const { t } = useTranslation();
    const addStream = useStreamStore((s) => s.addStream);
    const setPage = useUIStore((s) => s.setPage);
    const [value, setValue] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = useCallback(
        async (e: FormEvent) => {
            e.preventDefault();
            const input = value.trim();
            if (!input || loading) return;
            setLoading(true);
            setError('');
            try {
                const result = await addStream(input);
                if (result.success) {
                    setValue('');
                    if (navigateToCanvas) setPage('canvas');
                    onAdded?.();
                } else {
                    setError(result.message || t('quick_add.error_generic', '無法新增串流，請確認網址或頻道名稱'));
                }
            } catch {
                setError(t('quick_add.error_generic', '無法新增串流，請確認網址或頻道名稱'));
            } finally {
                setLoading(false);
            }
        },
        [value, loading, addStream, navigateToCanvas, setPage, onAdded, t],
    );

    const isLg = size === 'lg';

    return (
        <form onSubmit={handleSubmit} className={cn('w-full', isLg ? 'max-w-xl' : 'max-w-lg', className)} noValidate>
            <label htmlFor={`quick-add-${size}`} className="sr-only">
                {t('quick_add.label', '新增直播串流')}
            </label>
            <div
                className={cn(
                    'flex items-center gap-2 rounded-full border border-border bg-card/80 backdrop-blur',
                    'focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/20 transition-colors',
                    isLg ? 'p-1.5 pl-5' : 'p-1 pl-4',
                )}
            >
                <input
                    id={`quick-add-${size}`}
                    type="text"
                    inputMode="url"
                    autoComplete="off"
                    spellCheck={false}
                    value={value}
                    onChange={(e) => {
                        setValue(e.target.value);
                        if (error) setError('');
                    }}
                    placeholder={t('quick_add.placeholder', '貼上 Twitch / YouTube 直播網址或頻道名稱')}
                    aria-invalid={!!error}
                    aria-describedby={error ? `quick-add-${size}-error` : undefined}
                    className={cn(
                        'flex-1 min-w-0 bg-transparent outline-none text-foreground placeholder:text-muted-foreground/70',
                        isLg ? 'text-base h-11' : 'text-sm h-9',
                    )}
                />
                <button
                    type="submit"
                    disabled={loading || !value.trim()}
                    className={cn(
                        'inline-flex items-center justify-center gap-1.5 rounded-full font-semibold shrink-0',
                        'bg-primary text-primary-foreground hover:bg-primary/90 transition-colors',
                        'disabled:opacity-50 disabled:pointer-events-none',
                        isLg ? 'h-11 px-6 text-base' : 'h-9 px-4 text-sm',
                    )}
                >
                    {loading ? <Loader2 className={cn(isLg ? 'w-5 h-5' : 'w-4 h-4', 'animate-spin')} /> : <Play className={isLg ? 'w-5 h-5' : 'w-4 h-4'} />}
                    {t('quick_add.button', '開始觀看')}
                </button>
            </div>
            {error && (
                <p id={`quick-add-${size}-error`} role="alert" className="mt-2 px-4 text-sm text-red-400">
                    {error}
                </p>
            )}
        </form>
    );
}
