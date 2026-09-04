/**
 * SSG 預渲染的 server entry。
 *
 * 只給 scripts/prerender.mjs 在 Node 裡呼叫（`vite build --ssr src/entry-server.tsx`），
 * 不會進 client bundle。刻意不 import main.tsx：那裡的模組頂層直接碰 window/document。
 *
 * 與 client 首次 render 的三個差異都在這裡「注入」而不是靠 typeof 守衛：
 *   1. useUIStore.page 初值來自 window.location → 這裡依 route 用 pathToPage 設定
 *   2. i18n LanguageDetector 在 Node 落空退回 en → 這裡明確 changeLanguage
 *   3. theme 從 localStorage 覆寫 → 這裡固定烘站方預設 PRERENDER_THEME；
 *      client（main.tsx）只有在 store theme 與此相同時才 hydrate，否則走 createRoot
 *
 * 路由清單直接從 PAGE_PATHS 推導（減去 CSR-only 的 /canvas、/admin），不手抄第二份。
 */
/// <reference types="node" />
import { PassThrough } from 'node:stream';
import { renderToPipeableStream } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App, { preloadPageChunks } from './App';
import i18n from './i18n/i18n';
import { useUIStore } from './store/useUIStore';
import { PAGE_PATHS, pathToPage } from './config/routes';

export const PRERENDER_LANGS = ['zh-TW', 'en'] as const;
export type PrerenderLang = (typeof PRERENDER_LANGS)[number];

/** 預渲染一律以站方預設主題烘（useUIStore 的 theme 初值）；main.tsx 的 hydrate 閘門會比對 */
export const PRERENDER_THEME = 'dark' as const;

const CSR_ONLY = new Set<string>([PAGE_PATHS.canvas, PAGE_PATHS.admin]);
export const PRERENDER_ROUTES: readonly string[] = Object.values(PAGE_PATHS).filter((p) => !CSR_ONLY.has(p));

/** 單一路由若 lazy chunk 永遠不 resolve，onAllReady 不會觸發；用逾時讓 build 明確失敗 */
const RENDER_TIMEOUT_MS = 30_000;

/**
 * 把某條路由以指定語言渲染成 `#root` 的 innerHTML（含 Suspense 邊界標記，client 可 hydrate）。
 * 任一錯誤（含 Suspense 邊界內的錯誤）都 reject —— 預渲染不接受「退回 client render」的半成品。
 * 全程序共用同一個 zustand store 與 i18n 實例，併發呼叫會互相蓋掉 page/語言，因此一律序列化。
 */
let queue: Promise<unknown> = Promise.resolve();
export function render(route: string, lang: PrerenderLang): Promise<string> {
    const job = queue.then(() => renderNow(route, lang));
    queue = job.catch(() => undefined); // 前一筆失敗不阻塞下一筆（呼叫端自己收 reject）
    return job;
}

async function renderNow(route: string, lang: PrerenderLang): Promise<string> {
    const page = pathToPage(route);
    if (page === 'not-found' || CSR_ONLY.has(route)) {
        throw new Error(`entry-server: ${route} 不是可預渲染的路由`);
    }
    // zustand v5 的 useStore 在 server render 走 useSyncExternalStore 的 getServerSnapshot，
    // 它回的是 create() 當下那個 initialState 物件（page 恆 'home'），setState 換掉的是另一份 state。
    // useBoundStore 上的 getInitialState 只是 api 方法的複本，覆寫它改不到內部 useStore(api) 用的那個；
    // 但兩者回傳的是同一個物件 reference，就地改它 server snapshot 就會跟著變。
    // 同時也 setState，讓非 hook 的 getState() 讀者（若有）看到一致的值。
    const injected = { page, theme: PRERENDER_THEME };
    Object.assign(useUIStore.getInitialState(), injected);
    useUIStore.setState(injected);
    await i18n.changeLanguage(lang);
    // 與 client（main.tsx）對稱：chunk 先預載，App 的 ChunkSuspense 就不會輸出 Suspense 邊界，
    // 產物裡沒有 <!--$--> 標記，client hydrate 時也沒有可被同步更新打斷的 dehydrated 邊界。
    await preloadPageChunks(page);

    // server 端不發任何查詢：useQuery 停在 pending，與 client 首次 render（尚未 fetch）同形
    const queryClient = new QueryClient({
        defaultOptions: { queries: { enabled: false, retry: false } },
    });

    return new Promise<string>((resolve, reject) => {
        const errors: unknown[] = [];
        let html = '';
        const sink = new PassThrough();
        sink.setEncoding('utf8');
        sink.on('data', (chunk: string) => { html += chunk; });
        sink.on('error', reject);
        sink.on('end', () => {
            clearTimeout(timer);
            if (errors.length > 0) {
                reject(errors[0] instanceof Error ? errors[0] : new Error(String(errors[0])));
            } else {
                resolve(html);
            }
        });

        const stream = renderToPipeableStream(
            <QueryClientProvider client={queryClient}>
                <App />
            </QueryClientProvider>,
            {
                onAllReady() { stream.pipe(sink); },
                onShellError(err) { clearTimeout(timer); reject(err); },
                onError(err) { errors.push(err); },
            },
        );
        const timer = setTimeout(() => {
            stream.abort(new Error(`entry-server: ${route} (${lang}) 渲染逾時 ${RENDER_TIMEOUT_MS} ms`));
            reject(new Error(`entry-server: ${route} (${lang}) 渲染逾時 ${RENDER_TIMEOUT_MS} ms`));
        }, RENDER_TIMEOUT_MS);
    });
}
