/**
 * 演出資訊：合唱者（站內 VTuber 是按鈕、點了進個人頁；站外的人只是文字）與觀眾剪輯的來源頻道外連。
 * 曲目表、目錄卡片、正在播放共用；沒有資料時不輸出任何東西。
 */
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Scissors } from 'lucide-react';
import { cn } from '../../../../components/ui/utils';
import type { SongClipSource, SongPerformer } from '../../songsSource';

export const PerformersLine = memo(function PerformersLine({ performers, onOpenVtuber, className }: {
    performers: SongPerformer[];
    /** 沒給時站內者也只顯示文字 */
    onOpenVtuber?: (key: string) => void;
    className?: string;
}) {
    const { t } = useTranslation('songs');
    if (performers.length === 0) return null;
    return (
        <span className={cn('block truncate text-xs text-muted-foreground', className)}>
            {t('performers.label')}
            {performers.map((p, i) => (
                <span key={`${p.vtuberId ?? 'x'}:${p.name}`}>
                    {i > 0 && '、'}
                    {p.vtuberId && onOpenVtuber ? (
                        <button
                            type="button"
                            onClick={() => onOpenVtuber(p.vtuberId as string)}
                            aria-label={t('performers.open', { name: p.name })}
                            className="rounded-sm text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                            {p.name}
                        </button>
                    ) : (
                        <span>{p.name}</span>
                    )}
                </span>
            ))}
        </span>
    );
});

export const ClipSourceLink = memo(function ClipSourceLink({ clip, className }: { clip: SongClipSource | null; className?: string }) {
    const { t } = useTranslation('songs');
    if (!clip) return null;
    return (
        <a
            href={clip.url}
            target="_blank"
            rel="noopener noreferrer nofollow"
            title={t('clip.title', { name: clip.name })}
            className={cn('inline-flex max-w-full items-center gap-1 rounded-sm text-[12px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline', className)}
        >
            <Scissors className="size-3 shrink-0" aria-hidden="true" />
            <span className="truncate">{t('clip.label', { name: clip.name })}</span>
        </a>
    );
});
