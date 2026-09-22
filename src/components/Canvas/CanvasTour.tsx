/**
 * CanvasTour —— 畫布首次導覽（4 步聚光燈）。
 *
 * 畫布的拖曳、換位、縮放、放大原本都藏在 hover 或快捷鍵後面，使用者回報「不知道怎麼調整」。
 * 第一次進畫布、而且至少有一路串流時跑一次；看完或略過就寫入 localStorage，之後可從快捷鍵說明重看。
 *
 * 不碰畫布的 React 狀態：目標用 DOM 屬性定位（data-canvas-window-id / data-window-toolbar /
 * data-corner / data-tour），平常 hover 才出現的工具列與縮放角靠在目標視窗掛 data-tour-active
 * 由 CSS 強制顯示（見 index.css），所以導覽開關時畫布與播放器都不會重繪。
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useStreamStore } from '../../store/useStreamStore';
import { useUIStore } from '../../store/useUIStore';
import { selectMainStreamItemId } from '../../utils/canvasItemOps';
import type { CanvasItem } from '../../types/canvas';

export const CANVAS_TOUR_DONE_KEY = 'canvas_tour_done';
/** 有串流之後等播放器與工具列掛好再開始，避免聚光燈指到還沒出現的元素 */
const START_DELAY_MS = 1500;
const PAD = 6;

type StepId = 'drag' | 'swap' | 'resize' | 'theater';

interface Rect { top: number; left: number; width: number; height: number }

const hasStream = (i: CanvasItem) => i.type === 'stream' && i.contentId != null;

const findWindow = (id: string) =>
    Array.from(document.querySelectorAll<HTMLElement>('[data-canvas-window-id]')).find(el => el.dataset.canvasWindowId === id) ?? null;

function readTourDone(): boolean {
    try { return localStorage.getItem(CANVAS_TOUR_DONE_KEY) === '1'; } catch { return false; }
}
function writeTourDone() {
    try { localStorage.setItem(CANVAS_TOUR_DONE_KEY, '1'); } catch { /* 無痕模式寫不進去：本次工作階段內不再顯示即可 */ }
}

export function CanvasTour() {
    const { t } = useTranslation('common');
    const open = useUIStore(s => s.isCanvasTourOpen);
    const setOpen = useUIStore(s => s.setCanvasTourOpen);
    // 主畫面視窗（第一步、縮放、放大都指它）與另一個有內容的串流視窗（交換那步）
    // selector 都回傳字串：畫布其他變動（音量、拖曳）不會讓導覽重繪
    const mainId = useStreamStore(s => selectMainStreamItemId(s.canvasItems.filter(hasStream)));
    const otherId = useStreamStore(s => {
        const withStream = s.canvasItems.filter(hasStream);
        const main = selectMainStreamItemId(withStream);
        return withStream.find(i => i.i !== main)?.i ?? null;
    });

    const [stepIdx, setStepIdx] = useState(0);
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

    // 首次：有串流之後自動開啟
    useEffect(() => {
        if (open || !mainId || readTourDone()) return;
        const timer = setTimeout(() => setOpen(true), START_DELAY_MS);
        return () => clearTimeout(timer);
    }, [open, mainId, setOpen]);

    const steps = useMemo<StepId[]>(
        () => (otherId ? ['drag', 'swap', 'resize', 'theater'] : ['drag', 'resize', 'theater']),
        [otherId],
    );
    const step = steps[Math.min(stepIdx, steps.length - 1)];

    const close = useCallback(() => {
        writeTourDone();
        setOpen(false);
        setStepIdx(0);
    }, [setOpen]);

    const next = useCallback(() => {
        if (stepIdx >= steps.length - 1) close();
        else setStepIdx(i => i + 1);
    }, [stepIdx, steps.length, close]);

    // 找出目標元素、掛 data-tour-active 讓工具列與縮放角顯示，並量位置
    useLayoutEffect(() => {
        if (!open || !mainId) return;
        const targetWindowId = step === 'swap' ? otherId : mainId;
        const win = targetWindowId ? findWindow(targetWindowId) : null;
        const main = findWindow(mainId);
        main?.setAttribute('data-tour-active', '');

        const pick = (): HTMLElement | null => {
            if (!win) return null;
            if (step === 'drag') return win.querySelector('[data-window-toolbar="stream"]');
            if (step === 'resize') return win.querySelector('[data-tour="resize-corner"]');
            if (step === 'theater') return win.querySelector('[data-tour="theater"]');
            return win;
        };
        const measure = () => {
            const el = pick();
            if (!el) { setRect(null); return; }
            const r = el.getBoundingClientRect();
            setRect({ top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 });
        };
        measure();
        window.addEventListener('resize', measure);
        return () => {
            window.removeEventListener('resize', measure);
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
        };
        // capture：先於全域快捷鍵（Esc 平常用來離開劇院模式）
        window.addEventListener('keydown', onKey, true);
        return () => window.removeEventListener('keydown', onKey, true);
    }, [open, next, close, stepIdx]);

    if (!open || !mainId) return null;

    const vw = window.innerWidth, vh = window.innerHeight;
    const CARD_W = 300, CARD_H = 170;
    // 卡片放在目標下方，放不下就放上方；找不到目標時置中
    const cardTop = rect
        ? (rect.top + rect.height + 12 + CARD_H < vh ? rect.top + rect.height + 12 : Math.max(12, rect.top - CARD_H - 12))
        : vh / 2 - CARD_H / 2;
    const cardLeft = rect
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
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="canvas-tour-title"
                aria-describedby="canvas-tour-body"
                className="fixed rounded-xl border border-indigo-400/60 bg-indigo-950/95 p-4 text-white shadow-2xl"
                style={{ top: cardTop, left: cardLeft, width: CARD_W }}
            >
                <h2 id="canvas-tour-title" className="mb-1.5 text-sm font-semibold">{t(`canvas.tour_${step}_title` as any)}</h2>
                <p id="canvas-tour-body" className="mb-4 text-xs leading-relaxed text-indigo-100/90">{t(`canvas.tour_${step}_body` as any)}</p>
                <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] text-indigo-200/70">
                        {t('canvas.tour_progress', { current: stepIdx + 1, total: steps.length })}
                    </span>
                    <div className="flex gap-2">
                        {!last && (
                            <button
                                type="button"
                                onClick={close}
                                className="rounded-md border border-white/20 px-3 py-1 text-xs text-white/80 hover:bg-white/10"
                            >
                                {t('canvas.tour_skip')}
                            </button>
                        )}
                        <button
                            ref={primaryRef}
                            type="button"
                            onClick={next}
                            className="rounded-md bg-indigo-500 px-3 py-1 text-xs font-medium hover:bg-indigo-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-200"
                        >
                            {last ? t('canvas.tour_done') : t('canvas.tour_next')}
                        </button>
                    </div>
                </div>
            </div>
        </div>,
        document.body,
    );
}
