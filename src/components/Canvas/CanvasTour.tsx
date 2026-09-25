/**
 * CanvasTour —— 畫布首次導覽（聚光燈）：先教畫布視窗（拖曳、換位、縮放、放大），再教下方動態島。
 *
 * 畫布的拖曳、換位、縮放、放大原本都藏在 hover 或快捷鍵後面，使用者回報「不知道怎麼調整」；
 * 動態島平常收起，滑鼠移到底部才出現，新使用者也不知道它在哪、每顆按鈕做什麼。
 * 導覽期間 DynamicIsland 把 isCanvasTourOpen 納入 pinned，島會保持展開。
 * 第一次進畫布自動跑一次；看完或略過就寫入 localStorage，之後可從快捷鍵說明重看。
 * 空畫布時分兩段（使用者回報：沒有視窗可以框，視窗操作那段看不懂）：
 *   第一段 intro：歡迎 → 指向動態島搜尋框「先加入第一路直播」。
 *   第二段 windows：第一路直播加入後自動接著跑，這時有真實視窗可以框（拖曳、縮放、放大…），再介紹動態島其他功能。
 * 一進來就有直播（例如分享網址）則直接跑完整版 full。
 *
 * 不碰畫布的 React 狀態：目標用 DOM 屬性定位（data-canvas-window-id / data-window-toolbar /
 * data-corner / data-tour），平常 hover 才出現的工具列與縮放角靠在目標視窗掛 data-tour-active
 * 由 CSS 強制顯示（見 index.css），所以導覽開關時畫布與播放器都不會重繪。
 */
import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { TFunction } from 'i18next';
import { cn } from '../ui/utils';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useStreamStore } from '../../store/useStreamStore';
import { useUIStore } from '../../store/useUIStore';
import { mainStreamItemIdOf } from '../../utils/canvasItemOps';
import { hasConsentRecord, CONSENT_CHANGE_EVENT } from '../../utils/analytics';

export const CANVAS_TOUR_DONE_KEY = 'canvas_tour_done';
/** 空畫布的第一段（教加直播）已看過：之後第一路直播加入時接著跑第二段 */
export const CANVAS_TOUR_INTRO_DONE_KEY = 'canvas_tour_intro_done';
/** 進畫布後稍等，讓播放器、工具列與動態島掛好，避免聚光燈指到還沒出現的元素 */
const START_DELAY_MS = 1500;
const PAD = 6;
/** 聚光框離螢幕邊緣至少留這麼多，框線才不會被裁掉 */
const EDGE = 3;

type StepId =
    | 'welcome' | 'windows_intro' | 'start' | 'windows_ready'
    | 'drag' | 'swap' | 'resize' | 'theater' | 'controls' | 'chat' | 'empty'
    | 'island' | 'search' | 'add' | 'layout' | 'media' | 'collect' | 'more' | 'help'
    | 'dock' | 'summary';

/** 一般型態動態島的介紹步驟；邊緣停靠型只有一步（dock） */
const ISLAND_STEPS: StepId[] = ['island', 'search', 'add', 'layout', 'media', 'collect', 'more', 'help'];
/** 需要強制顯示主畫面視窗工具列與縮放角的步驟 */
const WINDOW_STEPS: StepId[] = ['drag', 'swap', 'resize', 'theater', 'controls'];
/** 沒有目標、置中顯示的說明頁（歡迎、空畫布時的視窗說明、第二段開頭、總整） */
const PAGE_STEPS: StepId[] = ['welcome', 'windows_intro', 'windows_ready', 'summary'];

/** full：完整版；intro：空畫布的第一段（教加直播）；windows：加入第一路直播後的第二段 */
type TourMode = 'full' | 'intro' | 'windows';
/** 動態島從收起到展開有 0.5 秒動畫；切到島的步驟後等動畫結束再量一次位置 */
const ISLAND_SETTLE_MS = 600;

const qs = (sel: string) => document.querySelector<HTMLElement>(sel);
const islandBtn = (fn: string) => qs(`[data-island-fn="${fn}"]`);

/** 各步驟要框住的元素（可以多個，聚光框取聯集） */
function stepTargets(step: StepId, win: HTMLElement | null): (HTMLElement | null)[] {
    switch (step) {
        case 'drag': return [win?.querySelector<HTMLElement>('[data-window-toolbar="stream"]') ?? null];
        case 'theater': return [win?.querySelector<HTMLElement>('[data-tour="theater"]') ?? null];
        case 'controls': return [
            win?.querySelector<HTMLElement>('[data-tour="reload"]') ?? null,
            win?.querySelector<HTMLElement>('[data-tour="remove"]') ?? null,
        ];
        case 'chat': return [qs('[data-window-toolbar="chat"]')];
        case 'empty': return [qs('[data-empty-window]')];
        // 縮放：框住整個視窗、四個角各加角框（任一角都能拖，不是只有右下）
        case 'swap':
        case 'resize': return [win];
        case 'island': return [qs('[data-tour="island"]')];
        case 'search': return [qs('[data-tour="island-search"]')];
        // 第一段最後一步：一般型態指搜尋框，邊緣停靠型指停靠標籤（搜尋在展開後的清單裡）
        case 'start': return [qs('[data-tour="island-search"]') ?? qs('[data-tour="island-dock"]')];
        case 'add': return [islandBtn('add')];
        case 'layout': return [islandBtn('layout')];
        case 'media': return [islandBtn('media')];
        case 'collect': return [islandBtn('fav'), islandBtn('save'), islandBtn('share')];
        case 'more': return [islandBtn('screen'), islandBtn('clear'), islandBtn('home'), islandBtn('settings')];
        case 'help': return [islandBtn('help')];
        case 'dock': return [qs('[data-tour="island-dock"]')];
        default: return [];
    }
}

interface Rect { top: number; left: number; width: number; height: number }

const CORNERS = ['nw', 'ne', 'sw', 'se'] as const;
/** 聚光框四個角的 L 形角框：貼齊框線、往內 3px 粗 */
function cornerStyle(c: typeof CORNERS[number], r: Rect): React.CSSProperties {
    const S = 28, B = 3;
    const top = c[0] === 'n' ? r.top : r.top + r.height - S;
    const left = c[1] === 'w' ? r.left : r.left + r.width - S;
    return {
        top, left,
        borderTopWidth: c[0] === 'n' ? B : 0,
        borderBottomWidth: c[0] === 's' ? B : 0,
        borderLeftWidth: c[1] === 'w' ? B : 0,
        borderRightWidth: c[1] === 'e' ? B : 0,
        borderStyle: 'solid',
    };
}

/** 總整頁：全部操作與快捷鍵（標籤走 i18n，按鍵字串各語言相同） */
function summaryRows(t: TFunction<'common'>): [string, string][] {
    return [
        [t('canvas.tour_sum_move'), '⠿'],
        [t('canvas.tour_sum_swap'), '⠿ → ▣'],
        [t('canvas.tour_sum_resize'), '◰'],
        [t('hotkeys.window_theater'), 'T / Esc'],
        [t('hotkeys.window_fullscreen'), 'F'],
        [t('hotkeys.window_mute'), 'M'],
        [t('hotkeys.window_reload'), 'R'],
        [t('canvas.tour_sum_layouts'), 'Alt + 1-6, 9'],
        [t('hotkeys.search'), 'Ctrl + K'],
        [t('hotkeys.help'), 'Ctrl + /  ·  ?'],
    ];
}

/** 內文 key：空畫布第一段的歡迎頁講「先加直播」；邊緣停靠型的「先加入直播」要先展開停靠標籤 */
function bodyKey(step: StepId, mode: TourMode, islandStyle: string): string {
    if (step === 'welcome' && mode === 'intro') return 'canvas.tour_welcome_empty_body';
    if (step === 'start' && islandStyle === 'edgeDock') return 'canvas.tour_start_body_dock';
    return `canvas.tour_${step}_body`;
}

const findWindow = (id: string) =>
    Array.from(document.querySelectorAll<HTMLElement>('[data-canvas-window-id]')).find(el => el.dataset.canvasWindowId === id) ?? null;

// localStorage 讀寫失敗（封鎖網站資料等）時，靠這個集合確保本次工作階段內不會一關掉又自動重開
const doneThisSession = new Set<string>();

function readFlag(key: string): boolean {
    if (doneThisSession.has(key)) return true;
    try { return localStorage.getItem(key) === '1'; } catch { return false; }
}
function writeFlag(key: string) {
    doneThisSession.add(key);
    try { localStorage.setItem(key, '1'); } catch { /* 寫不進去：上面的集合擋住本次工作階段 */ }
}

/** 測試用：重設工作階段旗標 */
export function resetCanvasTourSessionForTest() { doneThisSession.clear(); }

export function CanvasTour() {
    const { t } = useTranslation('common');
    const open = useUIStore(s => s.isCanvasTourOpen);
    const setOpen = useUIStore(s => s.setCanvasTourOpen);
    // 主畫面視窗（第一步、縮放、放大都指它）與另一個有內容的串流視窗（交換那步）
    // selector 都回傳字串：畫布其他變動（音量、拖曳）不會讓導覽重繪
    const mainId = useStreamStore(s => mainStreamItemIdOf(s.canvasItems));
    const islandStyle = useUIStore(s => s.islandStyle);
    const otherId = useStreamStore(s => {
        const main = mainStreamItemIdOf(s.canvasItems);
        return s.canvasItems.find(i => i.type === 'stream' && i.contentId != null && i.i !== main)?.i ?? null;
    });
    // 有聊天室／空視窗時才介紹對應的操作（沒有可以框的東西）
    const hasChat = useStreamStore(s => s.canvasItems.some(i => i.type === 'chat' && i.contentId != null));
    const hasEmpty = useStreamStore(s => s.canvasItems.some(i => i.contentId == null));

    const [stepIdx, setStepIdx] = useState(0);
    // 自動開啟時決定跑哪一段；從快捷鍵說明「重看導覽」（store 直接設 open）一律是完整版，關閉時會重設回 full
    const [mode, setMode] = useState<TourMode>('full');
    // 第一次造訪的訪客會同時看到 Cookie 橫幅（z-9999、在畫面底部），它正好蓋住要介紹的動態島；
    // 自動開啟等使用者回應橫幅之後才開始。手動「重看導覽」不受影響
    const [consentReady, setConsentReady] = useState(hasConsentRecord);
    useEffect(() => {
        if (consentReady) return;
        const onConsent = () => setConsentReady(true);
        window.addEventListener(CONSENT_CHANGE_EVENT, onConsent);
        return () => window.removeEventListener(CONSENT_CHANGE_EVENT, onConsent);
    }, [consentReady]);
    const [rect, setRect] = useState<Rect | null>(null);
    const primaryRef = useRef<HTMLButtonElement>(null);

    // 快捷鍵說明裡的「重看導覽」只在畫布頁（本元件有掛）時顯示
    useEffect(() => {
        useUIStore.getState().setCanvasTourAvailable(true);
        return () => {
            useUIStore.getState().setCanvasTourAvailable(false);
            useUIStore.getState().setCanvasTourOpen(false);
        };
    }, []);

    // 自動開啟：有直播 → 完整版（第一段看過就只跑第二段）；空畫布 → 第一段；第一段看過但還沒加直播 → 等
    // mainId 在依賴裡：空畫布看完第一段後，第一路直播加入的那一刻就會排程第二段
    useEffect(() => {
        if (open || !consentReady || readFlag(CANVAS_TOUR_DONE_KEY)) return;
        const introDone = readFlag(CANVAS_TOUR_INTRO_DONE_KEY);
        let nextMode: TourMode;
        if (mainId) nextMode = introDone ? 'windows' : 'full';
        else if (!introDone) nextMode = 'intro';
        else return;
        const timer = setTimeout(() => { setMode(nextMode); setStepIdx(0); setOpen(true); }, START_DELAY_MS);
        return () => clearTimeout(timer);
    }, [open, consentReady, mainId, setOpen]);

    const steps = useMemo<StepId[]>(() => {
        if (mode === 'intro') return ['welcome', 'start'];
        const list: StepId[] = mode === 'windows' ? ['windows_ready'] : ['welcome'];
        if (mainId) list.push(...(otherId ? ['drag', 'swap', 'resize', 'theater', 'controls'] as StepId[] : ['drag', 'resize', 'theater', 'controls'] as StepId[]));
        else list.push('windows_intro');
        if (hasChat) list.push('chat');
        if (hasEmpty) list.push('empty');
        // 第二段不再重複第一段教過的搜尋框
        const island = islandStyle === 'edgeDock' ? ['dock'] as StepId[] : ISLAND_STEPS;
        list.push(...(mode === 'windows' ? island.filter(s => s !== 'search') : island));
        list.push('summary');
        return list;
    }, [mode, mainId, otherId, hasChat, hasEmpty, islandStyle]);
    const step = steps[Math.min(stepIdx, steps.length - 1)];

    // 略過／Esc：整個導覽都不再自動跑（包括空畫布的第二段）
    const close = useCallback(() => {
        writeFlag(CANVAS_TOUR_DONE_KEY);
        setOpen(false);
        setStepIdx(0);
        setMode('full');
    }, [setOpen]);

    const next = useCallback(() => {
        if (stepIdx < steps.length - 1) { setStepIdx(i => i + 1); return; }
        if (mode === 'intro') {
            // 看完第一段：只記第一段，等第一路直播加入再接第二段
            writeFlag(CANVAS_TOUR_INTRO_DONE_KEY);
            setOpen(false);
            setStepIdx(0);
            setMode('full');
            return;
        }
        close();
    }, [stepIdx, steps.length, mode, close, setOpen]);

    const back = useCallback(() => setStepIdx(i => Math.max(0, i - 1)), []);

    // 找出目標元素、掛 data-tour-active 讓工具列與縮放角顯示，並量位置
    useLayoutEffect(() => {
        if (!open) return;
        const targetWindowId = step === 'swap' ? otherId : mainId;
        const win = targetWindowId ? findWindow(targetWindowId) : null;
        const main = mainId ? findWindow(mainId) : null;
        // 只有視窗步驟需要強制顯示工具列與縮放角；其他時候畫面保持乾淨
        if (WINDOW_STEPS.includes(step)) main?.setAttribute('data-tour-active', '');

        const measure = () => {
            const els = stepTargets(step, win).filter((el): el is HTMLElement => !!el);
            if (els.length === 0) { setRect(null); return; }
            const rs = els.map(el => el.getBoundingClientRect());
            // 往外留 PAD，但夾在可視範圍內：版面填滿畫布，視窗常貼著螢幕邊，超出去的框線與角框會被裁掉看不到
            const top = Math.max(EDGE, Math.min(...rs.map(r => r.top)) - PAD);
            const left = Math.max(EDGE, Math.min(...rs.map(r => r.left)) - PAD);
            const bottom = Math.min(window.innerHeight - EDGE, Math.max(...rs.map(r => r.bottom)) + PAD);
            const right = Math.min(window.innerWidth - EDGE, Math.max(...rs.map(r => r.right)) + PAD);
            setRect({ top, left, width: Math.max(0, right - left), height: Math.max(0, bottom - top) });
        };
        measure();
        // 島剛被釘住展開時還在動畫中，量到的是收起時的位置
        const settle = setTimeout(measure, ISLAND_SETTLE_MS);
        window.addEventListener('resize', measure);
        // 動畫被延後（分頁在背景時轉場會暫停）也要跟上：任何轉場結束都重量一次
        document.addEventListener('transitionend', measure, true);
        return () => {
            clearTimeout(settle);
            window.removeEventListener('resize', measure);
            document.removeEventListener('transitionend', measure, true);
            main?.removeAttribute('data-tour-active');
        };
    }, [open, step, mainId, otherId]);

    // Esc 略過、Enter／→ 下一步；焦點放在主要按鈕
    useEffect(() => {
        if (!open) return;
        primaryRef.current?.focus();
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
            else if (e.key === 'Enter' || e.key === 'ArrowRight') { e.preventDefault(); next(); }
            else if (e.key === 'ArrowLeft') { e.preventDefault(); back(); }
        };
        // capture：先於全域快捷鍵（Esc 平常用來離開劇院模式）
        window.addEventListener('keydown', onKey, true);
        return () => window.removeEventListener('keydown', onKey, true);
    }, [open, next, back, close, stepIdx]);

    if (!open) return null;

    const vw = window.innerWidth, vh = window.innerHeight;
    const isPage = PAGE_STEPS.includes(step);
    const CARD_W = isPage ? 400 : 300, CARD_H = step === 'summary' ? 420 : isPage ? 220 : 170;
    // 卡片放在目標下方，放不下就放上方；說明頁與找不到目標時置中
    const centerCard = step === 'resize' && rect;
    const cardTop = centerCard
        ? rect.top + rect.height / 2 - CARD_H / 2
        : rect
        ? (rect.top + rect.height + 12 + CARD_H < vh ? rect.top + rect.height + 12 : Math.max(12, rect.top - CARD_H - 12))
        : vh / 2 - CARD_H / 2;
    const cardLeft = centerCard
        ? rect.left + rect.width / 2 - CARD_W / 2
        : rect
        ? Math.min(Math.max(12, rect.left + rect.width / 2 - CARD_W / 2), vw - CARD_W - 12)
        : vw / 2 - CARD_W / 2;
    const last = stepIdx >= steps.length - 1;

    return createPortal(
        <div className="fixed inset-0 z-[200]" data-canvas-tour>
            {/* 聚光燈：大範圍陰影挖出目標；沒有目標就整片半透明 */}
            {rect ? (
                <div
                    aria-hidden
                    className="pointer-events-none fixed rounded-lg border-2 border-indigo-300 transition-all duration-200"
                    style={{ ...rect, boxShadow: '0 0 0 9999px rgba(2,6,23,0.62)' }}
                />
            ) : (
                <div aria-hidden className="fixed inset-0 bg-slate-950/60" />
            )}
            {step === 'resize' && rect && CORNERS.map(c => (
                <div
                    key={c}
                    aria-hidden
                    data-tour-corner={c}
                    className="pointer-events-none fixed h-7 w-7 border-amber-300 transition-all duration-200"
                    style={cornerStyle(c, rect)}
                />
            ))}
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="canvas-tour-title"
                aria-describedby="canvas-tour-body"
                className="fixed rounded-xl border border-indigo-400/60 bg-indigo-950/95 p-4 text-white shadow-2xl"
                style={{ top: Math.max(12, cardTop), left: Math.max(12, cardLeft), width: CARD_W, maxWidth: 'calc(100vw - 24px)' }}
            >
                <h2 id="canvas-tour-title" className={cn('mb-1.5 font-semibold', isPage ? 'text-base' : 'text-sm')}>{t(`canvas.tour_${step}_title` as any)}</h2>
                <p id="canvas-tour-body" className="mb-4 whitespace-pre-line text-xs leading-relaxed text-indigo-100/90">{t(bodyKey(step, mode, islandStyle) as any)}</p>
                {step === 'summary' && (
                    <dl className="mb-4 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 text-xs" data-tour-summary>
                        {summaryRows(t).map(([label, keys]) => (
                            <Fragment key={label}>
                                <dt className="text-indigo-100/90">{label}</dt>
                                <dd className="text-right">
                                    <kbd className="rounded border border-white/15 bg-black/40 px-1.5 py-0.5 font-mono text-[10px] text-white/90">{keys}</kbd>
                                </dd>
                            </Fragment>
                        ))}
                    </dl>
                )}
                <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] text-indigo-200/70">
                        {t('canvas.tour_progress', { current: stepIdx + 1, total: steps.length })}
                    </span>
                    <div className="flex gap-2">
                        {!last && (
                            <button
                                type="button"
                                onClick={close}
                                className="rounded-md px-2 py-1 text-xs text-white/60 hover:text-white"
                            >
                                {t('canvas.tour_skip')}
                            </button>
                        )}
                        {stepIdx > 0 && (
                            <button
                                type="button"
                                onClick={back}
                                className="rounded-md border border-white/20 px-3 py-1 text-xs text-white/80 hover:bg-white/10"
                            >
                                {t('canvas.tour_back')}
                            </button>
                        )}
                        <button
                            ref={primaryRef}
                            type="button"
                            onClick={next}
                            className="rounded-md bg-indigo-500 px-3 py-1 text-xs font-medium hover:bg-indigo-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-200"
                        >
                            {last ? t(mode === 'intro' ? 'canvas.tour_start_done' : 'canvas.tour_done') : t('canvas.tour_next')}
                        </button>
                    </div>
                </div>
            </div>
        </div>,
        document.body,
    );
}
