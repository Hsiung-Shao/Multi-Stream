/**
 * 聊天室工具列的「寬度與收合」選單：窄／標準／寬三段，加上收合。作用在畫面上所有聊天室。
 * 合成一顆按鈕而不是兩顆：聊天室只有 3～8 欄寬（窄的時候很窄），多一顆按鈕就會把「顯示哪一路」的下拉選單擠到看不出名字。
 * 也可以直接拖聊天室左緣調寬（見 SimpleCanvas.isChatColumnResize），拖出來的中間值不對應任何一段，三段都不打勾。
 * 收合後焦點交給右緣的展開標籤；從標籤展開回來時焦點回到這顆按鈕（見 chatFocusIntent）。
 */
import { memo, useCallback, useEffect, useRef } from 'react';
import { ArrowLeftRight, PanelRightClose } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useStreamStore } from '../../store/useStreamStore';
import { CHAT_WIDTH_STEPS } from '../../utils/layoutPresets';
import { chatsCollapsed } from '../../utils/canvasItemOps';
import { requestChatFocus, consumeChatFocus } from './chatFocusIntent';
import { Button } from '../ui/button';
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuRadioGroup, DropdownMenuRadioItem,
    DropdownMenuSeparator, DropdownMenuTrigger,
} from '../ui/dropdown-menu';

// 工具列本身是拖曳把手：擋掉 pointerdown，點選單時才不會順手拖動視窗
const stopPointerDown = (e: React.PointerEvent) => e.stopPropagation();

const LEVEL_KEY = {
    3: 'canvas.chat_width_narrow',
    4: 'canvas.chat_width_standard',
    6: 'canvas.chat_width_wide',
} as const satisfies Record<(typeof CHAT_WIDTH_STEPS)[number], string>;

export const ChatLayoutMenu = memo(function ChatLayoutMenu() {
    const { t } = useTranslation('common');
    const width = useStreamStore(s => s.chatColumnWidth);

    const triggerRef = useRef<HTMLButtonElement>(null);

    const setWidth = useCallback((value: string) => useStreamStore.getState().setChatColumnWidth(Number(value)), []);
    const collapse = useCallback(() => {
        const store = useStreamStore.getState();
        store.collapseChats();
        // 真的收合了才登記：這顆按鈕會跟著聊天室卸載，焦點交給接著掛載的展開標籤
        if (chatsCollapsed(useStreamStore.getState().canvasItems)) requestChatFocus('expand-tab');
    }, []);

    // 從展開標籤展開回來：焦點接回這顆按鈕（多個聊天室時由第一個掛載的領走）
    useEffect(() => {
        if (consumeChatFocus('layout-menu')) triggerRef.current?.focus();
    }, []);

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    ref={triggerRef}
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 rounded-full hover:bg-white/20 text-white/70 hover:text-white nodrag"
                    onPointerDown={stopPointerDown}
                    title={t('canvas.toolbar_chat_layout')}
                    aria-label={t('canvas.toolbar_chat_layout')}
                    data-tour="chat-layout"
                >
                    <ArrowLeftRight size={12} />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="z-[120] min-w-36 border-white/10 bg-slate-900 text-white">
                <DropdownMenuRadioGroup value={String(width)} onValueChange={setWidth}>
                    {CHAT_WIDTH_STEPS.map(w => (
                        <DropdownMenuRadioItem key={w} value={String(w)} className="text-xs focus:bg-white/10 focus:text-white">
                            {t(LEVEL_KEY[w])}
                        </DropdownMenuRadioItem>
                    ))}
                </DropdownMenuRadioGroup>
                <DropdownMenuSeparator className="bg-white/10" />
                <DropdownMenuItem onSelect={collapse} className="text-xs focus:bg-white/10 focus:text-white">
                    <PanelRightClose size={12} aria-hidden />
                    {t('canvas.toolbar_collapse_chat')}
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
});
