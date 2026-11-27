import { useEffect, useRef, useState, forwardRef } from 'react';
import { Plus, Columns2, RectangleHorizontal, Volume2, Star, MoreHorizontal, SlidersHorizontal } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useUIStore } from '../../store/useUIStore';
import { useStreamStore } from '../../store/useStreamStore';
import { useIslandQuickActions } from '../../hooks/useIslandQuickActions';
import { IslandFavoritesMenu } from './IslandFavoritesMenu';
import { MediaControlPanel } from './MediaControlPanel';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { isCollapsedChat } from '../../utils/canvasItemOps';
import { RoomPalette, type RoomCommand } from './RoomPalette';
import { useRoomHotkeys } from './useRoomHotkeys';
import { focusRoomIndex, toggleRoomMode, removeRoomItem } from './roomActions';
import { streamContentIdsByPosition } from '../../utils/canvasItemOps';
import { useRoomSync } from './roomSync';
import { cn } from '../ui/utils';
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
    DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent,
} from '../ui/dropdown-menu';
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
    AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '../ui/alert-dialog';

/**
 * 使用者正在看或操作候場：滑鼠停在候場上（在 iframe 裡移動網頁收不到，不能靠計時判斷），
 * 或鍵盤焦點在候場的工具上。這時不算閒置，免得候場在游標底下消失、焦點落到看不見的按鈕
 */
export function roomEngaged(doc: Document = document): boolean {
    return !!doc.querySelector('[data-room-wing]:hover') || !!doc.querySelector('[data-room-wing] :focus-visible');
}

/** 滑鼠停多久介面淡出 */
const IDLE_MS = 2500;
/** 滑鼠離開指令列後多久收起（避免移過縫隙就消失） */
const HIDE_DELAY_MS = 500;

const BarButton = forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { primary?: boolean; pressed?: boolean }>(
    ({ primary, pressed, className, children, ...rest }, ref) => (
        <button
            ref={ref}
            type="button"
            aria-pressed={pressed}
            className={cn(
                'h-10 px-3 inline-flex items-center gap-1.5 rounded-[10px] text-[13px] whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-violet-300',
                primary ? 'bg-violet-600 hover:bg-violet-500 font-semibold text-white' : 'text-white/85 hover:bg-white/10',
                pressed && 'bg-violet-950 text-white',
                className,
            )}
            {...rest}
        >
            {children}
        </button>
    ),
);
BarButton.displayName = 'BarButton';

/**
 * 房間模式外殼：閒置時畫面上只剩底部一條小把手；滑到最下方、點把手或按 Ctrl K 才出現指令列。
 * 2026-11-27 使用者要求從頂部改到底部；水平置中在串流區（扣掉右側聊天欄），不蓋到聊天室輸入框。
 */
export const RoomShell = () => {
    const { t } = useTranslation(['common', 'favorites']);
    const roomMode = useUIStore(s => s.roomMode);
    const audioFollowsFocus = useUIStore(s => s.audioFollowsFocus);
    const hotkeyHelpOpen = useUIStore(s => s.isHotkeyHelpOpen);
    const tourOpen = useUIStore(s => s.isCanvasTourOpen);
    const { isFullscreen, toggleFullscreen, handleShareCanvas } = useIslandQuickActions();

    const [hover, setHover] = useState(false);
    const [idle, setIdle] = useState(false);
    const [paletteOpen, setPaletteOpen] = useState(false);
    const [favOpen, setFavOpen] = useState(false);
    const [moreOpen, setMoreOpen] = useState(false);
    const [clearOpen, setClearOpen] = useState(false);
    const [mediaOpen, setMediaOpen] = useState(false);
    // 聊天欄寬（格數，0＝沒有或收合）：指令列置中在串流區，不蓋到聊天室輸入框
    const chatCols = useStreamStore(s => (s.canvasItems.some(it => it.type === 'chat' && !isCollapsedChat(it)) ? s.chatColumnWidth : 0));
    const barCenter = `${((24 - chatCols) / 24) * 50}%`;
    const hideTimer = useRef<number | undefined>(undefined);
    const navRef = useRef<HTMLElement>(null);

    // 任何彈出 UI 開著時指令列都不收（同原本動態島的 pinned 慣例）
    const pinned = paletteOpen || favOpen || moreOpen || clearOpen || mediaOpen || hotkeyHelpOpen || tourOpen;
    const barVisible = hover || pinned;

    useEffect(() => {
        // 閒置時順便收起指令列：滑鼠移進直播 iframe 時外層不一定收得到 mouseleave，靠這裡保底
        const goIdle = () => {
            setIdle(true);
            // 只留鍵盤焦點（:focus-visible）；滑鼠點開面板後 Radix 把焦點還給按鈕，不算
            if (!navRef.current?.matches(':hover') && !navRef.current?.querySelector(':focus-visible')) setHover(false);
            // 正在看候場：這次不淡出，但要重新計時——游標若直接移出瀏覽器視窗，不會再有任何事件叫醒計時器
            if (roomEngaged()) { timer = window.setTimeout(goIdle, IDLE_MS); return; }
            useUIStore.getState().setRoomIdle(true);
        };
        let timer = window.setTimeout(goIdle, IDLE_MS);
        const wake = () => {
            setIdle(false);
            if (useUIStore.getState().roomIdle) useUIStore.getState().setRoomIdle(false);
            window.clearTimeout(timer);
            timer = window.setTimeout(goIdle, IDLE_MS);
        };
        window.addEventListener('mousemove', wake);
        // 滑鼠移進播放器 iframe 時網頁收不到 mousemove，但進入那一刻 iframe 元素會收到 mouseover
        window.addEventListener('mouseover', wake);
        window.addEventListener('keydown', wake);
        return () => {
            window.clearTimeout(timer);
            useUIStore.getState().setRoomIdle(false);
            window.removeEventListener('mousemove', wake);
            window.removeEventListener('mouseover', wake);
            window.removeEventListener('keydown', wake);
        };
    }, []);

    useRoomSync();

    // 面板開著時也要能用 Ctrl K 關掉（G 與數字鍵在輸入框裡本來就不觸發）
    useRoomHotkeys({
        onTogglePalette: () => setPaletteOpen(o => !o),
        onToggleMode: toggleRoomMode,
        onFocusIndex: focusRoomIndex,
    });

    const show = () => { window.clearTimeout(hideTimer.current); setHover(true); };
    const hideSoon = () => {
        window.clearTimeout(hideTimer.current);
        hideTimer.current = window.setTimeout(() => setHover(false), HIDE_DELAY_MS);
    };

    const toggleAudio = () => useUIStore.getState().setAudioFollowsFocus(!audioFollowsFocus);
    const modeLabel = roomMode === 'stage' ? t('room.mode_grid') : t('room.mode_stage');

    const commands: RoomCommand[] = [
        { id: 'mode', label: modeLabel, hint: 'G', run: toggleRoomMode },
        { id: 'audio', label: t('room.audio_follow'), run: toggleAudio },
        { id: 'share', label: t('common.share_canvas'), run: handleShareCanvas },
        { id: 'fullscreen', label: isFullscreen ? t('common.exit_fullscreen') : t('common.fullscreen'), run: toggleFullscreen },
        { id: 'help', label: t('canvas.help_button'), hint: '?', run: () => useUIStore.getState().setHotkeyHelpOpen(true) },
        { id: 'settings', label: t('common.settings'), run: () => useUIStore.getState().openModal('favorites', 'global_settings') },
    ];

    return (
        <>
            {/* 底部感應帶：滑到最下方（串流區）就叫出指令列；不延伸到聊天欄，避免蓋住聊天室輸入框 */}
            <div className="pointer-events-auto fixed bottom-0 left-0 h-3.5 z-50" style={{ right: `${(chatCols / 24) * 100}%` }} onMouseEnter={show} onMouseLeave={hideSoon} />

            <button
                type="button"
                data-tour="room-handle"
                aria-label={t('room.open_bar')}
                title={t('room.open_bar')}
                onMouseEnter={show}
                onMouseLeave={hideSoon}
                onClick={show}
                style={{ left: barCenter }}
                className="pointer-events-auto fixed bottom-0 -translate-x-1/2 z-50 w-[120px] h-5 flex items-end justify-center pb-[5px] outline-none focus-visible:ring-2 focus-visible:ring-violet-300"
            >
                <span className={cn('w-14 h-[5px] rounded-full bg-[#6b7090] transition-opacity', idle && !barVisible && 'opacity-30')} />
            </button>

            <nav
                ref={navRef}
                data-tour="island"
                data-bar-position="bottom"
                aria-label={t('room.open_bar')}
                onMouseEnter={show}
                onMouseLeave={hideSoon}
                onFocus={show}
                onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) hideSoon(); }}
                style={{ left: barCenter }}
                className={cn(
                    'pointer-events-auto fixed bottom-2.5 z-50 flex items-center gap-0.5 p-1 rounded-[14px] border border-white/10 bg-[#0f1119]/95 shadow-[0_-14px_40px_rgba(0,0,0,0.6)] transition-transform duration-200 max-w-[calc(100%-24px)] overflow-x-auto',
                    barVisible ? '-translate-x-1/2 translate-y-0' : '-translate-x-1/2 translate-y-[140%]',
                )}
            >
                <BarButton primary onClick={() => setPaletteOpen(true)}>
                    <Plus size={16} strokeWidth={2.5} /> {t('room.add')}
                    <kbd className="text-[10px] font-normal border border-current rounded px-1 opacity-75">Ctrl K</kbd>
                </BarButton>
                <BarButton onClick={toggleRoomMode} title="G">
                    {roomMode === 'stage' ? <Columns2 size={16} /> : <RectangleHorizontal size={16} />} {modeLabel}
                </BarButton>
                <BarButton pressed={audioFollowsFocus} onClick={toggleAudio}>
                    <Volume2 size={16} /> {t('room.audio_follow')}
                </BarButton>
                <Popover open={mediaOpen} onOpenChange={setMediaOpen}>
                    <PopoverTrigger asChild>
                        <BarButton aria-label={t('room.media')} pressed={mediaOpen}><SlidersHorizontal size={16} /> {t('room.media')}</BarButton>
                    </PopoverTrigger>
                    <PopoverContent side="top" align="center" sideOffset={10} className="z-[60] w-[340px] max-h-[70vh] overflow-y-auto border-white/10 bg-[#0f1119] p-0 text-white">
                        <MediaControlPanel variant="inline" isExpanded />
                    </PopoverContent>
                </Popover>
                <IslandFavoritesMenu onOpenChange={setFavOpen}>
                    <BarButton><Star size={16} /> {t('room.favorites')}</BarButton>
                </IslandFavoritesMenu>
                <DropdownMenu open={moreOpen} onOpenChange={setMoreOpen}>
                    <DropdownMenuTrigger asChild>
                        <BarButton><MoreHorizontal size={16} /> {t('room.more')}</BarButton>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent side="top" align="end" className="bg-[#0f1119] border-white/10 text-white z-[60] min-w-[220px]">
                        <DropdownMenuItem onSelect={handleShareCanvas}>{t('common.share_canvas')}</DropdownMenuItem>
                        <DropdownMenuSub>
                            <DropdownMenuSubTrigger>{t('room.remove_stream')}</DropdownMenuSubTrigger>
                            <DropdownMenuSubContent className="bg-[#0f1119] border-white/10 text-white z-[61]">
                                <RemoveStreamItems />
                            </DropdownMenuSubContent>
                        </DropdownMenuSub>
                        <DropdownMenuItem onSelect={toggleFullscreen}>{isFullscreen ? t('common.exit_fullscreen') : t('common.fullscreen')}</DropdownMenuItem>
                        <DropdownMenuSeparator className="bg-white/10" />
                        <DropdownMenuItem onSelect={() => useUIStore.getState().openModal('favorites', 'global_settings')}>{t('auth.account_and_sign_in')}</DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => useUIStore.getState().openModal('favorites', 'global_settings')}>{t('common.settings')}</DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => useUIStore.getState().setHotkeyHelpOpen(true)}>{t('canvas.help_button')}</DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => useUIStore.getState().setPage('home')}>{t('common.home')}</DropdownMenuItem>
                        <DropdownMenuSeparator className="bg-white/10" />
                        <DropdownMenuItem className="text-red-300 focus:text-red-200" onSelect={() => setClearOpen(true)}>{t('common.clear_screen')}</DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </nav>

            <RoomPalette open={paletteOpen} onOpenChange={setPaletteOpen} commands={commands} />

            <AlertDialog open={clearOpen} onOpenChange={setClearOpen}>
                <AlertDialogContent className="z-[60]">
                    <AlertDialogHeader>
                        <AlertDialogTitle>{t('common.confirm_clear_title')}</AlertDialogTitle>
                        <AlertDialogDescription>{t('common.confirm_clear_desc')}</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                        <AlertDialogAction onClick={() => useStreamStore.getState().clearCanvasItems()} className="bg-red-500 hover:bg-red-600">
                            {t('common.confirm')}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
};

/** 「移除直播」子選單：依畫面位置列出每一路（子選單打開時才掛載、才讀 store） */
function RemoveStreamItems() {
    const { canvasItems, streams } = useStreamStore.getState();
    return (
        <>
            {streamContentIdsByPosition(canvasItems).map(id => {
                const item = canvasItems.find(it => it.type === 'stream' && it.contentId === id);
                const st = streams.find(x => x.id === id);
                return item ? (
                    <DropdownMenuItem key={item.i} onSelect={() => removeRoomItem(item.i)}>
                        {st?.displayName || st?.channelId || st?.videoId || String(id)}
                    </DropdownMenuItem>
                ) : null;
            })}
        </>
    );
}
