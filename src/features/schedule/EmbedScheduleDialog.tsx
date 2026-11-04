// 「嵌入到我的網站」產生器：給非工程師的三步驟——看預覽、選顏色／天數、按一顆鍵。
// 三顆鍵對應三種拿法：複製網址（Notion 這類貼網址會變內容的地方）、複製嵌入碼（部落格 HTML 區塊）、
// 下載週表圖（Linktree Featured 版型、Threads／IG，圖不會自動更新）。
// 嵌入內容由 functions/embed/schedule/* 產生（純 HTML、無 JS、noindex）；嵌入碼一律附一行指回本站的文字連結
// （真正的外鏈在宿主頁，不只在 iframe 裡）。target 可是個人（slug）或團體（uuid）。
import { useEffect, useId, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Check, Code2, Copy, Download, Link2, Moon, Sun } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { ScrollArea } from '../../components/ui/scroll-area';
import { fetchEmbedUsage } from './embedUsage';
import { SEO_SITE_URL } from '../../seo/defaults';
import { urlLangOf, withLang } from '../../../functions/lib/locale.js';
import { toHtmlLang } from '../../i18n/i18n';
import { track } from '../../utils/analytics';

export type EmbedTarget = { kind: 'person'; slug: string; name: string } | { kind: 'group'; id: string; name: string };
export type EmbedLang = 'en' | 'zh-TW';
export type EmbedTheme = 'light' | 'dark';
export type EmbedDays = 3 | 7;

export const EMBED_DEFAULT_HEIGHT = 420;
export const EMBED_DAYS_OPTIONS: readonly EmbedDays[] = [3, 7];
/** 週表圖的像素尺寸（functions/lib/schedule-embed.js 的 CARD_W／CARD_H）；下載時放大 2 倍 */
const CARD_W = 1200;
const CARD_H = 675;
const CARD_SCALE = 2;

function embedPath(target: EmbedTarget): string {
    return target.kind === 'group' ? `/embed/schedule/group/${encodeURIComponent(target.id)}` : `/embed/schedule/${encodeURIComponent(target.slug)}`;
}

/** 這份嵌入指回本站的頁面（個人週表頁或名錄）；lang 前綴由 withLang 加 */
export function targetPagePath(target: EmbedTarget): string {
    return target.kind === 'group' ? `/vtubers#directory-group-${encodeURIComponent(target.id)}` : `/schedule/${encodeURIComponent(target.slug)}`;
}

function query(lang: EmbedLang, theme: EmbedTheme, days: number): string {
    const q = new URLSearchParams();
    if (lang !== 'en') q.set('lang', lang);
    if (theme !== 'light') q.set('theme', theme);
    if (days !== 7) q.set('days', String(days));
    const qs = q.toString();
    return qs ? `?${qs}` : '';
}

export function embedUrl(origin: string, target: EmbedTarget, lang: EmbedLang, theme: EmbedTheme, days: number = 7): string {
    return `${origin}${embedPath(target)}${query(lang, theme, days)}`;
}

export function cardUrl(origin: string, target: EmbedTarget, lang: EmbedLang, theme: EmbedTheme, days: number = 7): string {
    return `${origin}${embedPath(target)}/card${query(lang, theme, days)}`;
}

/** 嵌入碼會被貼到別人的網站：名字與連結文字來自資料庫（含社群投稿），一律完整逃脫，不在宿主站注入 HTML */
export function escapeHtmlText(s: string): string {
    return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}

/** 嵌入碼：iframe＋宿主頁上的一行文字連結（外鏈） */
export function embedCode(target: EmbedTarget, lang: EmbedLang, theme: EmbedTheme, days: number, linkText: string): string {
    const src = embedUrl(SEO_SITE_URL, target, lang, theme, days);
    const page = SEO_SITE_URL + withLang(lang, targetPagePath(target));
    return `<iframe src="${src}" title="${escapeHtmlText(target.name)}" width="100%" height="${EMBED_DEFAULT_HEIGHT}" style="border:0;border-radius:12px;max-width:480px" loading="lazy"></iframe>\n<p><a href="${page}">${escapeHtmlText(linkText)}</a></p>`;
}

export function downloadFileName(target: EmbedTarget): string {
    return `${target.kind === 'group' ? `group-${target.id.slice(0, 8)}` : target.slug}-schedule.png`;
}

/** 把 SVG 卡片畫到 canvas 轉 PNG 下載（SVG 裡頭像已內嵌成 data URI，canvas 不會被污染） */
export async function downloadCardPng(src: string, fileName: string): Promise<void> {
    // AbortController＋setTimeout 而不是 AbortSignal.timeout：iOS 15／舊 Safari 沒有後者，會同步丟 TypeError 變成永遠「下載失敗」
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => ctrl.abort(), 15_000);
    let svg: string;
    try {
        const res = await fetch(src, { signal: ctrl.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        svg = await res.text();
    } finally {
        window.clearTimeout(timer);
    }
    const blobUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
    try {
        const img = new Image();
        await new Promise<void>((resolve, reject) => {
            img.onload = () => resolve();
            img.onerror = () => reject(new Error('svg decode failed'));
            img.src = blobUrl;
        });
        // WebKit 對 SVG 內嵌 data URI 圖片，onload 後立刻 drawImage 有機率畫不出頭像：能 decode 就先等它
        if (typeof img.decode === 'function') await img.decode().catch(() => {});
        const canvas = document.createElement('canvas');
        canvas.width = CARD_W * CARD_SCALE;
        canvas.height = CARD_H * CARD_SCALE;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('no canvas');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
        if (!png) throw new Error('toBlob failed');
        const a = document.createElement('a');
        a.href = URL.createObjectURL(png);
        a.download = fileName;
        a.click();
        window.setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
    } finally {
        URL.revokeObjectURL(blobUrl);
    }
}

async function copyText(text: string): Promise<boolean> {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        return false;
    }
}

function ActionButton({ label, hint, icon, onAction, status }: { label: string; hint: string; icon: React.ReactNode; onAction: () => void | Promise<void>; status?: React.ReactNode }) {
    const hintId = useId();
    return (
        <button
            type="button"
            aria-label={label}
            aria-describedby={hintId}
            onClick={() => void onAction()}
            className="flex w-full items-center gap-3 rounded-xl border border-border px-4 py-3 text-left transition-colors hover:bg-foreground/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-foreground">{icon}</span>
            <span className="min-w-0 flex-1">
                <span className="block font-semibold">{label}</span>
                <span id={hintId} className="block text-xs text-muted-foreground">{hint}</span>
            </span>
            <span className="shrink-0 text-xs font-medium text-muted-foreground">{status}</span>
        </button>
    );
}

function CopyButton({ label, hint, text, icon, onCopied }: { label: string; hint: string; text: string; icon: React.ReactNode; onCopied?: () => void }) {
    const { t } = useTranslation('schedule');
    const [done, setDone] = useState(false);
    useEffect(() => {
        if (!done) return;
        const id = window.setTimeout(() => setDone(false), 2000);
        return () => window.clearTimeout(id);
    }, [done]);
    const status = done ? <span className="inline-flex items-center gap-1 text-emerald-600"><Check size={14} aria-hidden="true" />{t('embed.copied')}</span> : <Copy size={14} aria-hidden="true" />;
    return (
        <ActionButton
            label={label}
            hint={hint}
            icon={icon}
            status={status}
            onAction={async () => {
                const ok = await copyText(text);
                setDone(ok);
                if (ok) onCopied?.();
            }}
        />
    );
}

function DownloadButton({ fileName, src, onDownloaded }: { fileName: string; src: string; onDownloaded?: () => void }) {
    const { t } = useTranslation('schedule');
    const [state, setState] = useState<'idle' | 'busy' | 'failed'>('idle');
    const status = state === 'busy' ? t('embed.downloading') : state === 'failed' ? <span className="text-destructive">{t('embed.downloadFailed')}</span> : <Download size={14} aria-hidden="true" />;
    return (
        <ActionButton
            label={t('embed.download')}
            hint={t('embed.downloadHint')}
            icon={<Download size={18} aria-hidden="true" />}
            status={status}
            onAction={async () => {
                if (state === 'busy') return;
                setState('busy');
                try {
                    await downloadCardPng(src, fileName);
                    setState('idle');
                    onDownloaded?.();
                } catch {
                    setState('failed');
                }
            }}
        />
    );
}

function Segmented<T extends string | number>({ label, value, options, onChange, render }: { label: string; value: T; options: readonly T[]; onChange: (v: T) => void; render: (v: T) => React.ReactNode }) {
    return (
        <div className="inline-flex rounded-lg border border-border p-0.5" role="group" aria-label={label}>
            {options.map((v) => (
                <button
                    key={String(v)}
                    type="button"
                    onClick={() => onChange(v)}
                    aria-pressed={value === v}
                    className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium ${value === v ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'}`}
                >
                    {render(v)}
                </button>
            ))}
        </div>
    );
}

export function EmbedScheduleDialog({ open, onOpenChange, target }: { open: boolean; onOpenChange: (o: boolean) => void; target: EmbedTarget }) {
    const { t, i18n } = useTranslation('schedule');
    // 「已有 N 個網站嵌入」只在打開對話框時才查（embed_usage 一次 REST GET），不讓每次看個人頁都多一個請求
    const usageKey = target.kind === 'group' ? target.id : target.slug;
    const usage = useQuery({ queryKey: ['embed-usage', target.kind, usageKey], queryFn: ({ signal }) => fetchEmbedUsage(target.kind, usageKey, { signal }), staleTime: 10 * 60_000, retry: 1, enabled: open });
    const sites = usage.data?.sites;
    const [theme, setTheme] = useState<EmbedTheme>('light');
    const [days, setDays] = useState<EmbedDays>(7);
    const [view, setView] = useState<'web' | 'image'>('web');
    const [loaded, setLoaded] = useState(false);
    const lang = urlLangOf(toHtmlLang(i18n.language)) as EmbedLang;
    const name = target.name;
    const previewSrc = embedUrl('', target, lang, theme, days);
    const cardSrc = cardUrl('', target, lang, theme, days);
    const linkText = t('embed.linkText', { name });
    const code = embedCode(target, lang, theme, days, linkText);
    const url = embedUrl(SEO_SITE_URL, target, lang, theme, days);
    const pageUrl = SEO_SITE_URL + withLang(lang, targetPagePath(target));
    const previewKey = `${view}:${previewSrc}`;
    useEffect(() => setLoaded(false), [previewKey]);
    const analytics = { kind: target.kind, theme, days, lang };
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg">
                {/* 捲動容器用 ScrollArea（專案慣例）；max-h 要下在 viewport 才會捲 */}
                <ScrollArea className="-mr-3 pr-3 [&>[data-radix-scroll-area-viewport]]:max-h-[85svh]">
                <div className="flex flex-col gap-4">
                <DialogHeader>
                    <DialogTitle>{t('embed.title')}</DialogTitle>
                    <DialogDescription>{t('embed.description', { name })}</DialogDescription>
                    {typeof sites === 'number' && sites > 0 && <p className="text-xs text-muted-foreground">{t('embed.sites', { count: sites })}</p>}
                </DialogHeader>
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <Segmented label={t('embed.preview')} value={view} options={['web', 'image'] as const} onChange={setView} render={(v) => t(`embed.preview.${v}`)} />
                    <div className="flex flex-wrap items-center gap-2">
                        <Segmented label={t('embed.days')} value={days} options={EMBED_DAYS_OPTIONS} onChange={setDays} render={(v) => t('embed.daysOption', { count: v })} />
                        <Segmented
                            label={t('embed.theme')}
                            value={theme}
                            options={['light', 'dark'] as const}
                            onChange={setTheme}
                            render={(v) => (
                                <>
                                    {v === 'light' ? <Sun size={13} aria-hidden="true" /> : <Moon size={13} aria-hidden="true" />}
                                    {t(`embed.theme.${v}`)}
                                </>
                            )}
                        />
                    </div>
                </div>
                <div className="relative">
                    {!loaded && <div className="absolute inset-0 animate-pulse rounded-xl bg-muted" aria-hidden="true" />}
                    {view === 'web' ? (
                        <iframe
                            key={previewSrc}
                            src={previewSrc}
                            title={t('embed.preview')}
                            className="relative w-full rounded-xl border border-border"
                            style={{ height: EMBED_DEFAULT_HEIGHT }}
                            loading="lazy"
                            onLoad={() => setLoaded(true)}
                        />
                    ) : (
                        <img key={cardSrc} src={cardSrc} alt={t('embed.preview.image')} width={CARD_W} height={CARD_H} className="relative w-full rounded-xl border border-border" onLoad={() => setLoaded(true)} onError={() => setLoaded(true)} />
                    )}
                </div>
                <div className="flex flex-col gap-2">
                    <CopyButton label={t('embed.copyUrl')} hint={t('embed.copyUrlHint')} text={url} icon={<Link2 size={18} aria-hidden="true" />} onCopied={() => track.embedCopy('url', analytics)} />
                    <CopyButton label={t('embed.copyCode')} hint={t('embed.copyCodeHint')} text={code} icon={<Code2 size={18} aria-hidden="true" />} onCopied={() => track.embedCopy('code', analytics)} />
                    <DownloadButton fileName={downloadFileName(target)} src={cardSrc} onDownloaded={() => track.embedDownload(analytics)} />
                </div>
                <p className="break-all text-xs text-muted-foreground">{t('embed.imageCaption', { url: pageUrl })}</p>
                <p className="text-xs text-muted-foreground">{t('embed.note')}</p>
                </div>
                </ScrollArea>
            </DialogContent>
        </Dialog>
    );
}
