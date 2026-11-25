import { useCallback, useEffect } from 'react';
import { Loader2, Twitch as TwitchIcon, Youtube as YoutubeIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogTitle } from '../ui/dialog';
import { useStreamSearch } from './useStreamSearch';
import { SearchResultsList } from './SearchResultsList';

export interface RoomCommand {
    id: string;
    label: string;
    hint?: string;
    run: () => void;
}

interface RoomPaletteProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    commands: RoomCommand[];
}

/** 房間模式的 Ctrl K 面板：上方搜尋／貼網址（與其他搜尋框共用 useStreamSearch），沒輸入時列出指令 */
export function RoomPalette({ open, onOpenChange, commands }: RoomPaletteProps) {
    const { t } = useTranslation(['common', 'navbar']);
    const close = useCallback(() => onOpenChange(false), [onOpenChange]);
    const onError = useCallback((message: string) => {
        import('sonner').then(m => m.toast.error(message)).catch(() => { /* 模組載入失敗就不提示 */ });
    }, []);
    const s = useStreamSearch({ onError, onAdded: close });

    useEffect(() => {
        if (!open) s.clear();
        // 只在開關時清空；s 每次 render 都是新物件
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    const showCommands = s.query.trim() === '';
    const hasResults = s.showResults && s.results.length > 0;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                showCloseButton={false}
                className="top-[14vh] translate-y-0 sm:max-w-[620px] p-0 gap-0 overflow-hidden border-white/10 bg-[#0f1119] text-white"
                onOpenAutoFocus={(e) => { e.preventDefault(); s.inputRef.current?.focus(); }}
            >
                <DialogTitle className="sr-only">{t('room.palette_label')}</DialogTitle>
                <form
                    onSubmit={(e) => { e.preventDefault(); void s.submit(); }}
                    className="flex items-center gap-3 h-14 px-4 border-b border-white/10"
                >
                    <button
                        type="button"
                        onClick={s.togglePlatform}
                        className="shrink-0 size-8 flex items-center justify-center rounded-full hover:bg-white/10"
                        title={s.platform === 'twitch' ? t('navbar:twitch') : t('navbar:youtube')}
                        aria-label={s.platform === 'twitch' ? t('navbar:twitch') : t('navbar:youtube')}
                    >
                        {s.platform === 'twitch'
                            ? <TwitchIcon size={17} className="text-[#9146FF]" />
                            : <YoutubeIcon size={17} className="text-[#FF0000]" />}
                    </button>
                    <input
                        ref={s.inputRef}
                        value={s.query}
                        onChange={(e) => s.changeQuery(e.target.value)}
                        onKeyDown={s.handleKeyDown}
                        placeholder={t('room.palette_placeholder')}
                        aria-label={t('room.palette_placeholder')}
                        className="flex-1 min-w-0 bg-transparent outline-none text-[15px] placeholder:text-white/45"
                    />
                    {(s.isSearching || s.isSubmitting) && <Loader2 className="animate-spin text-white/50" size={16} />}
                </form>

                <div ref={s.containerRef}>
                    {hasResults && (
                        <SearchResultsList
                            results={s.results}
                            selectedIndex={s.selectedIndex}
                            onSelect={s.selectResult}
                            onHover={s.setSelectedIndex}
                            heightClass="h-72"
                        />
                    )}
                    {showCommands && (
                        <div className="p-2">
                            <div className="px-2 pt-1 pb-1.5 text-[11px] text-white/55">{t('room.palette_commands')}</div>
                            {commands.map(c => (
                                <button
                                    key={c.id}
                                    type="button"
                                    onClick={() => { close(); c.run(); }}
                                    className="w-full h-10 flex items-center gap-3 px-3 rounded-lg text-left text-sm hover:bg-white/10 focus-visible:bg-white/10 outline-none"
                                >
                                    <span className="flex-1">{c.label}</span>
                                    {c.hint && <kbd className="text-[10px] text-white/55 border border-white/25 rounded px-1">{c.hint}</kbd>}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                <div className="px-4 py-2.5 border-t border-white/10 text-[11px] text-white/55">{t('room.palette_hint')}</div>
            </DialogContent>
        </Dialog>
    );
}
