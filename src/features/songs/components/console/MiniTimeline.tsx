/**
 * 整場時間軸：膠囊＝歌曲片段（目前這首用薄荷色），細線＝片段之間的直播聊天（播放時自動跳過）。
 * 只畫圖：歌名與聊天長度放在 title（滑鼠提示），不產生文字節點，也不是可拖曳的 slider（拖曳進度只在底部播放列）。
 */
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../../../components/ui/utils';
import type { SongVideo } from '../../songsSource';
import { videoTimeline } from '../../lib/videoTimeline';
import { formatTimecode } from '../../lib/timecode';

export const MiniTimeline = memo(function MiniTimeline({ video, currentCode }: { video: SongVideo; currentCode: string }) {
    const { t } = useTranslation('songs');
    const timeline = useMemo(() => videoTimeline(video.segments), [video.segments]);
    const titles = useMemo(() => new Map(video.segments.map((s) => [s.code, s.title])), [video.segments]);
    return (
        <div className="flex flex-col gap-2 rounded-[10px] bg-popover p-3">
            <span className="text-xs font-bold text-foreground/80">{t('now.timeline')}</span>
            <div role="img" aria-label={t('now.timelineLegend')} className="relative h-[22px]">
                <div className="absolute inset-x-0 top-2.5 h-0.5 bg-input" />
                {timeline.parts.map((part) => (
                    <div
                        key={`${part.kind}:${part.start}`}
                        title={part.kind === 'song'
                            ? titles.get(part.code ?? '')
                            : t('now.chatGap', { time: formatTimecode(part.end - part.start) })}
                        className={cn(
                            'absolute',
                            part.kind === 'song'
                                ? cn('top-1 h-3.5 rounded-[7px]', part.code === currentCode ? 'bg-primary' : 'bg-[#1F4A40]')
                                : 'top-2 h-1.5',
                        )}
                        style={{ left: `${part.offset * 100}%`, width: `calc(${part.width * 100}% - 1px)` }}
                    />
                ))}
            </div>
            <span className="text-[11px] text-muted-foreground" aria-hidden="true">{t('now.timelineLegend')}</span>
        </div>
    );
});
