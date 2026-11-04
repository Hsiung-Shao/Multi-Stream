// 週表嵌入產生器對話框：網址／嵌入碼／下載週表圖三顆按鈕與主題切換
// T 編號對應計畫〈週表嵌入產生器〉的測試規格表
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import i18n from '../../../src/i18n/i18n';
import { EmbedScheduleDialog, embedUrl, embedCode, cardUrl } from '../../../src/features/schedule/EmbedScheduleDialog';

const target = { kind: 'person' as const, slug: 'taione', name: '台一' };
const ORIGIN = 'https://x.example';

/** 依 URL 分流的 fetch 替身：設定檔、嵌入站數、週表圖各回各的 */
function stubFetch(usage: unknown) {
    const fn = vi.fn(async (input: unknown) => {
        const u = String(input);
        const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { 'Content-Type': 'application/json' } });
        if (u.includes('/api/supabase-config')) return json({ url: 'https://x.supabase.co', anonKey: 'k' });
        if (u.includes('embed_usage')) return json(usage);
        return new Response('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675"></svg>', { status: 200, headers: { 'Content-Type': 'image/svg+xml' } });
    });
    vi.stubGlobal('fetch', fn);
    return fn;
}

describe('embedUrl／embedCode／cardUrl 純函式', () => {
    it('embedUrl：預設值不帶查詢字串', () => {
        expect(embedUrl(ORIGIN, target, 'en', 'light', 7)).toBe(`${ORIGIN}/embed/schedule/taione`);
    });

    it('embedUrl：只放非預設值（lang≠en、theme≠light、days≠7）', () => {
        const q = (lang: string, theme: string, days: number) => Object.fromEntries(new URL(embedUrl(ORIGIN, target, lang as never, theme as never, days)).searchParams);
        expect(q('zh-TW', 'light', 7)).toEqual({ lang: 'zh-TW' });
        expect(q('en', 'dark', 7)).toEqual({ theme: 'dark' });
        expect(q('en', 'light', 3)).toEqual({ days: '3' });
        expect(q('zh-TW', 'dark', 3)).toEqual({ lang: 'zh-TW', theme: 'dark', days: '3' });
    });

    it('cardUrl：路徑多 /card，查詢字串規則同 embedUrl', () => {
        expect(cardUrl(ORIGIN, target, 'en', 'light', 7)).toBe(`${ORIGIN}/embed/schedule/taione/card`);
        const u = new URL(cardUrl(ORIGIN, target, 'zh-TW', 'dark', 7));
        expect(u.pathname).toBe('/embed/schedule/taione/card');
        expect(Object.fromEntries(u.searchParams)).toEqual({ lang: 'zh-TW', theme: 'dark' });
    });

    it('embedCode：iframe 指向正式站，後面附一行回連結（zh-TW 帶語言前綴）', () => {
        const code = embedCode(target, 'zh-TW', 'light', 7, 'LINKTEXT');
        expect(code).toContain('<iframe src="https://multistreaming.org/embed/schedule/taione?lang=zh-TW"');
        expect(code).toContain('\n<p><a href="https://multistreaming.org/zh-TW/schedule/taione">LINKTEXT</a></p>');
    });

    it('T15b 名字與連結文字含 HTML 時被逃脫，原始標籤不外漏', () => {
        const evil = { kind: 'person' as const, slug: 'taione', name: '<img src=x onerror=alert(1)>' };
        const code = embedCode(evil, 'en', 'light', 7, '<b>bold</b> "q"');
        expect(code).not.toContain('<img');
        expect(code).not.toContain('<b>');
        expect(code).toContain('&lt;img');
        expect(code).toContain('&lt;b&gt;');
        expect(code).toContain('&quot;');
    });

    it('embedCode：en 回連結沒有 /zh-TW；dark／days 進 iframe 網址', () => {
        const code = embedCode(target, 'en', 'dark', 3, 'T');
        expect(code).toContain('<a href="https://multistreaming.org/schedule/taione">T</a>');
        expect(code).not.toContain('/zh-TW/');
        expect(code).toMatch(/<iframe src="[^"]*theme=dark/);
        expect(code).toMatch(/<iframe src="[^"]*days=3/);
    });
});

describe('EmbedScheduleDialog 互動（zh-TW）', () => {
    const writeText = vi.fn(async (_s: string) => {});
    let clickSpy: ReturnType<typeof vi.spyOn>;
    let downloadName: string | null;

    beforeEach(async () => {
        await i18n.changeLanguage('zh-TW');
        writeText.mockClear();
        Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
        downloadName = null;
        clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
            downloadName = this.download;
        });
        stubFetch([]);
        // jsdom 沒有 canvas：只替身「畫出去」與「轉成 PNG」兩個外部 I/O
        HTMLCanvasElement.prototype.getContext = vi.fn(() => ({ drawImage: vi.fn(), fillRect: vi.fn() })) as never;
        HTMLCanvasElement.prototype.toBlob = vi.fn(function (cb: (b: Blob | null) => void) { cb(new Blob(['x'], { type: 'image/png' })); }) as never;
        URL.createObjectURL = vi.fn(() => 'blob:fake');
        URL.revokeObjectURL = vi.fn();
        class FakeImage {
            onload: null | (() => void) = null;
            onerror: null | (() => void) = null;
            width = 1200;
            height = 675;
            private _src = '';
            get src() { return this._src; }
            set src(v: string) { this._src = v; queueMicrotask(() => this.onload?.()); }
            decode() { return Promise.resolve(); }
            addEventListener(type: string, fn: () => void) { if (type === 'load') this.onload = fn; }
            removeEventListener() {}
        }
        vi.stubGlobal('Image', FakeImage);
    });

    afterEach(() => {
        clickSpy.mockRestore();
        vi.unstubAllGlobals();
    });

    // 每個測試用新的 QueryClient，免得上一個測試的站數快取漏進來
    const open = () => {
        const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
        return render(<QueryClientProvider client={client}><EmbedScheduleDialog open onOpenChange={() => {}} target={target} /></QueryClientProvider>);
    };

    it('T15 三顆按鈕與淺色／深色切換都出現', () => {
        open();
        for (const name of ['複製網址', '複製嵌入碼', '下載週表圖', '淺色', '深色']) {
            expect(screen.getByRole('button', { name }), name).toBeInTheDocument();
        }
    });

    it('T15 點「複製網址」→ 寫入嵌入網址並顯示「已複製」', async () => {
        open();
        fireEvent.click(screen.getByRole('button', { name: '複製網址' }));
        await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
        expect(writeText.mock.calls[0][0]).toMatch(/\/embed\/schedule\/taione(\?|$)/);
        expect((await screen.findAllByText('已複製')).length).toBeGreaterThan(0);
    });

    it('T15 點「複製嵌入碼」→ 寫入 iframe 加一行回連結', async () => {
        open();
        fireEvent.click(screen.getByRole('button', { name: '複製嵌入碼' }));
        await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
        const code = writeText.mock.calls[0][0];
        expect(code).toContain('<iframe');
        expect(code).toContain('<p><a href=');
        expect((await screen.findAllByText('已複製')).length).toBeGreaterThan(0);
    });

    it('T15 切到深色 → aria-pressed 跟著變，之後複製的嵌入碼含 theme=dark', async () => {
        open();
        const light = screen.getByRole('button', { name: '淺色' });
        const dark = screen.getByRole('button', { name: '深色' });
        expect(light).toHaveAttribute('aria-pressed', 'true');
        expect(dark).toHaveAttribute('aria-pressed', 'false');
        fireEvent.click(dark);
        expect(dark).toHaveAttribute('aria-pressed', 'true');
        expect(light).toHaveAttribute('aria-pressed', 'false');
        fireEvent.click(screen.getByRole('button', { name: '複製嵌入碼' }));
        await waitFor(() => expect(writeText).toHaveBeenCalled());
        expect(writeText.mock.calls[0][0]).toContain('theme=dark');
    });

    it('T15 點「下載週表圖」→ 抓 card 網址、畫到 canvas，觸發 <slug>-schedule.png 下載', async () => {
        open();
        fireEvent.click(screen.getByRole('button', { name: '下載週表圖' }));
        await waitFor(() => expect(clickSpy).toHaveBeenCalled());
        const urls = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[0]));
        expect(urls.some((u) => /^\/embed\/schedule\/taione\/card/.test(u)), urls.join(',')).toBe(true);
        expect(downloadName).toBe('taione-schedule.png');
        // 下載後要釋放 blob 網址，不然每按一次漏一個
        await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalled());
    });

    it('T15 下載途中 fetch 失敗 → 不觸發下載、顯示「下載失敗，請再試一次」', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response('x', { status: 500 })));
        open();
        fireEvent.click(screen.getByRole('button', { name: '下載週表圖' }));
        expect(await screen.findByText('下載失敗，請再試一次')).toBeInTheDocument();
        expect(clickSpy).not.toHaveBeenCalled();
    });

    it('T15 預覽切換：預設是網頁嵌入（iframe），切到「週表圖」改顯示 card 圖片', () => {
        open();
        expect(document.body.querySelector('iframe[src*="/embed/schedule/taione"]')).not.toBeNull();
        fireEvent.click(screen.getByRole('button', { name: '週表圖' }));
        expect(document.body.querySelector('img[src*="/embed/schedule/taione/card"]')).not.toBeNull();
    });

    it('T15c 開啟時查 embed_usage；有 3 站就顯示「已有 3 個網站嵌入這份週表」', async () => {
        const fetchFn = stubFetch([{ sites: 3 }]);
        open();
        expect(await screen.findByText(/已有 3 個網站嵌入這份週表/)).toBeInTheDocument();
        const urls = fetchFn.mock.calls.map((c) => String(c[0]));
        const usage = urls.find((u) => u.includes('embed_usage?select='));
        expect(usage, urls.join(',')).toBeTruthy();
        expect(usage).toContain('slug=eq.taione');
    });

    it('T15c 回傳空陣列時不顯示「已有」', async () => {
        const fetchFn = stubFetch([]);
        open();
        await waitFor(() => expect(fetchFn.mock.calls.some((c) => String(c[0]).includes('embed_usage'))).toBe(true));
        // 等狀態更新落定再確認沒出現
        await new Promise((r) => setTimeout(r, 50));
        expect(screen.queryByText(/已有/)).toBeNull();
    });
});
