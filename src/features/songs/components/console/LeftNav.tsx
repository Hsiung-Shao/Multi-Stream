/**
 * 左欄導覽：logo 回首頁、歌回、開台週表、我的歌單（＋新增）、VTuber 清單、投稿連結、語言切換。
 * 桌機（≥1280）放在左欄；較窄時同一個元件放進「選單」Sheet，點任何項目後由 onNavigate 收起抽屜。
 * 歌單與 VTuber 清單可能很長，中段放進 ScrollArea 自己捲動，logo 與投稿連結固定在上下。
 */
import { memo, type MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarDays, Globe, Music, Plus } from 'lucide-react';
import { RouteLink } from '../../../../components/Navigation/RouteLink';
import { ScrollArea } from '../../../../components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../../components/ui/select';
import { cn } from '../../../../components/ui/utils';
import { SUPPORTED_LANGUAGES } from '../../../../i18n/languages';
import { PAGE_PATHS } from '../../../../config/routes';
import type { Playlist } from '../../store/usePlaylistStore';
import type { VtuberSummary } from '../../lib/catalogView';
import type { SongsView } from '../../lib/songsView';

const itemClass = 'flex w-full min-w-0 items-center gap-2.5 rounded-lg p-2 text-left text-[13px] hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
const sectionLabel = 'px-2 text-xs font-bold tracking-[0.08em] text-muted-foreground';

export const LeftNav = memo(function LeftNav({
    view, playlists, vtubers, onGoList, onSelectVtuber, onOpenPlaylist, onNewPlaylist, idPrefix, className,
}: {
    view: SongsView;
    playlists: Playlist[];
    vtubers: VtuberSummary[];
    onGoList: () => void;
    onSelectVtuber: (key: string) => void;
    onOpenPlaylist: (id: string) => void;
    onNewPlaylist: () => void;
    /** 左欄與 Sheet 不會同時存在，但 id 仍各自加前綴，避免 aria-labelledby 指錯 */
    idPrefix: string;
    className?: string;
}) {
    const { t, i18n } = useTranslation('songs');
    const activeVtuber = view.kind === 'list' ? view.vtuber : null;
    const activePlaylist = view.kind === 'playlists' ? view.playlistId : null;

    const handleSongs = (e: MouseEvent<HTMLAnchorElement>) => {
        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        onGoList();
    };

    return (
        <nav aria-label={t('nav.label')} className={cn('flex min-h-0 flex-col gap-5', className)}>
            <RouteLink to="home" aria-label={t('nav.home')} className="px-2 text-base font-black text-foreground">
                MultiStream<span className="text-primary"> Hub</span>
            </RouteLink>

            <ul className="flex flex-col gap-0.5">
                <li>
                    <a
                        href={PAGE_PATHS.songs}
                        onClick={handleSongs}
                        aria-current={view.kind === 'list' && !activeVtuber ? 'page' : undefined}
                        className={cn(itemClass, 'gap-3 py-2.5 text-sm aria-[current=page]:bg-muted aria-[current=page]:font-bold')}
                    >
                        <Music className="size-[18px] shrink-0" aria-hidden="true" />
                        {t('nav.songs')}
                    </a>
                </li>
                <li>
                    <RouteLink to="schedule" className={cn(itemClass, 'gap-3 py-2.5 text-sm text-foreground/80')}>
                        <CalendarDays className="size-[18px] shrink-0" aria-hidden="true" />
                        {t('nav.schedule')}
                    </RouteLink>
                </li>
            </ul>

            <ScrollArea className="min-h-0 flex-1 [&>div>div]:!block">
                <div className="flex flex-col gap-5 pr-2">
                    <div role="group" aria-labelledby={`${idPrefix}-pl`} className="flex flex-col gap-1">
                        <div className="flex items-center">
                            <span id={`${idPrefix}-pl`} className={cn(sectionLabel, 'flex-1')}>{t('nav.playlists')}</span>
                            <button
                                type="button"
                                onClick={onNewPlaylist}
                                aria-label={t('nav.newPlaylist')}
                                title={t('nav.newPlaylist')}
                                className="flex size-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                                <Plus className="size-4" aria-hidden="true" />
                            </button>
                        </div>
                        {playlists.map((pl, i) => (
                            <button
                                key={pl.id}
                                type="button"
                                onClick={() => onOpenPlaylist(pl.id)}
                                aria-current={activePlaylist === pl.id ? 'true' : undefined}
                                className={cn(itemClass, 'aria-[current=true]:bg-muted')}
                            >
                                <span className={cn('size-9 shrink-0 rounded-md', i % 2 === 0 ? 'bg-[#1F4A40]' : 'bg-[#232A3D]')} aria-hidden="true" />
                                <span className="flex min-w-0 flex-col">
                                    <span className="truncate">{pl.name}</span>
                                    {/* 首數只給眼睛看：按鈕名稱維持歌單名稱 */}
                                    <span className="text-[11px] text-muted-foreground" aria-hidden="true">{t('playlists.count', { count: pl.codes.length })}</span>
                                </span>
                            </button>
                        ))}
                    </div>

                    {vtubers.length > 0 && (
                        <div role="group" aria-labelledby={`${idPrefix}-vt`} className="flex flex-col gap-1">
                            <span id={`${idPrefix}-vt`} className={sectionLabel}>{t('nav.vtubers')}</span>
                            {vtubers.map((v) => {
                                const active = activeVtuber === v.key;
                                return (
                                    <button
                                        key={v.key}
                                        type="button"
                                        onClick={() => onSelectVtuber(v.key)}
                                        aria-pressed={active}
                                        className={cn(itemClass, active && 'text-primary')}
                                    >
                                        {v.img ? (
                                            <img src={v.img} alt="" width={32} height={32} loading="lazy" className="size-8 shrink-0 rounded-full object-cover" />
                                        ) : (
                                            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted font-black" aria-hidden="true">
                                                {Array.from(v.name)[0]}
                                            </span>
                                        )}
                                        <span className="truncate">{v.name}</span>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>
            </ScrollArea>

            <div className="flex flex-col gap-2">
                <RouteLink to="songsSubmit" className="rounded-[10px] border border-dashed border-input p-3 text-[13px] font-bold text-primary hover:bg-muted">
                    <span aria-hidden="true">＋ </span>{t('catalog.submitLink')}
                </RouteLink>
                <Select value={i18n.language} onValueChange={(v: string) => void i18n.changeLanguage(v)}>
                    <SelectTrigger aria-label={t('nav.language')} className="h-9 w-full border-input bg-transparent text-[13px] text-foreground/80">
                        <Globe className="size-4 shrink-0" aria-hidden="true" />
                        <span className="min-w-0 flex-1 truncate text-left"><SelectValue /></span>
                    </SelectTrigger>
                    <SelectContent>
                        {SUPPORTED_LANGUAGES.map((lang) => (
                            <SelectItem key={lang.value} value={lang.value}>{lang.label}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
        </nav>
    );
});
