// /channel/<UC>/live 頁的串流讀取：只讀需要的部分、只在小範圍內解析（Workers 免費方案每次 10ms CPU）。
//
// 2026-10-01 實測 13 個頻道（直播中 5、待機 4、離線 4），頁面 1.5～1.8MB，需要的資料位置固定：
//   - 頭 5KB：<title>、canonical、og:image／og:title／og:url、itemprop="name"
//   - 直播／待機（watch 頁）：ytInitialPlayerResponse 在約 1.1MB 處，"isUpcoming"、"scheduledStartTime"、
//     "author" 都在它之後 2～10KB 內（同一個 <script>）
//   - 離線（頻道頁）：頭 5KB 就決定了（canonical 是頻道網址、沒有影片），後面 1.5MB 用不到
// 原本整頁讀完、解碼成字串，再對整頁跑約 10 次 regex（watch 頁根本沒有 og:image，兩條 og:image regex
// 每次都掃完 1.6MB 才失敗）。改成串流讀取：離線頁讀完頭 64KB 就取消下載；watch 頁讀到 playerResponse
// 的 </script> 就取消；regex 只在這兩段小範圍內跑。

export const HEAD_CHARS = 64 * 1024;
const PLAYER_MARK = 'ytInitialPlayerResponse';
const SCRIPT_END = '</script>';
const CARRY = Math.max(PLAYER_MARK.length, SCRIPT_END.length) - 1;

const VIDEO_ID_IN_IMAGE = /\/vi\/([a-zA-Z0-9_-]{11})\//;
const VIDEO_ID_IN_WATCH = /\/watch\?v=([a-zA-Z0-9_-]{11})/;

/** 頁面前段的 videoId 瀑布（og:image → canonical → og:url）；找不到回 null */
export function videoIdFromHead(head) {
    const metaOg =
        head.match(/<meta\s+(?:property|name|itemprop)=["'](?:og:image|twitter:image|image)["']\s+content=["'](.*?)["']/i) ||
        head.match(/<meta\s+content=["'](.*?)["']\s+(?:property|name|itemprop)=["'](?:og:image|twitter:image|image)["']/i);
    const fromImage = metaOg && metaOg[1].match(VIDEO_ID_IN_IMAGE);
    if (fromImage) return { videoId: fromImage[1], source: 'meta-image' };

    const canonical = head.match(/<link\s+rel=["']canonical["']\s+href=["'](.*?)["']/i);
    const fromCanonical = canonical && canonical[1].match(VIDEO_ID_IN_WATCH);
    if (fromCanonical) return { videoId: fromCanonical[1], source: 'canonical-link' };

    const ogUrl = head.match(/<meta\s+property=["']og:url["']\s+content=["'](.*?)["']/i);
    if (ogUrl && ogUrl[1].includes('watch?v=')) {
        const m = ogUrl[1].match(/v=([a-zA-Z0-9_-]{11})/);
        if (m) return { videoId: m[1], source: 'og-url' };
    }
    return { videoId: null, source: null };
}

/**
 * 串流讀取 /live 頁。回傳：
 *   head      頁面前 HEAD_CHARS 字元
 *   player    ytInitialPlayerResponse 所在的 <script> 區段；找不到時是「已讀到的全部內容」（保守退回整頁比對）
 *   complete  是否讀完整頁（提早取消時為 false）
 */
export async function readLiveOgPage(response) {
    const body = response.body;
    if (!body || typeof body.getReader !== 'function') return pageFromText(await response.text(), true);

    const reader = body.getReader();
    const decoder = new TextDecoder();
    const parts = [];
    const starts = [];
    let length = 0;
    let head = null;
    let wantPlayer = true;
    let playerAt = -1;
    let playerEnd = -1;
    let carry = '';
    let complete = false;

    try {
        for (;;) {
            const { done, value } = await reader.read();
            const piece = done ? decoder.decode() : decoder.decode(value, { stream: true });
            if (piece) {
                const windowStart = length - carry.length;
                starts.push(length);
                parts.push(piece);
                length += piece.length;
                // 只在「上一段尾巴＋這一段」裡找標記，避免對越來越長的字串反覆 indexOf（每次都會整串攤平複製）
                const win = carry + piece;
                if (playerAt < 0) {
                    const i = win.indexOf(PLAYER_MARK);
                    if (i >= 0) playerAt = windowStart + i;
                }
                if (playerAt >= 0 && playerEnd < 0) {
                    const j = win.indexOf(SCRIPT_END, Math.max(0, playerAt - windowStart));
                    if (j >= 0) playerEnd = windowStart + j;
                }
                carry = win.slice(-CARRY);
            }
            if (head === null && (length >= HEAD_CHARS || done)) {
                head = parts.join('').slice(0, HEAD_CHARS);
                // 頁面前段找不到影片＝頻道頁（離線）：後面的內容用不到，不必再讀
                if (!videoIdFromHead(head).videoId) wantPlayer = false;
            }
            if (done) {
                complete = true;
                break;
            }
            if (head !== null && (!wantPlayer || playerEnd >= 0)) break;
        }
    } finally {
        if (!complete) reader.cancel().catch(() => {});
    }

    if (!wantPlayer) return { head, player: '', complete };
    if (playerAt < 0) {
        // 找不到 playerResponse（YouTube 改版等）：保守退回整頁比對，行為同改版前
        const text = parts.join('');
        return { head: head ?? text.slice(0, HEAD_CHARS), player: text, complete };
    }
    // 只接起 playerResponse 所在的那幾段（不必把前面約 1.1MB 接成一個字串）
    let k = starts.length - 1;
    while (k > 0 && starts[k] > playerAt) k -= 1;
    const tail = parts.slice(k).join('');
    const from = playerAt - starts[k];
    const player = tail.slice(from, playerEnd >= 0 ? playerEnd - starts[k] : undefined);
    return { head, player, complete };
}

/** 已有完整 HTML 時（測試、沒有 body 串流的環境）切出同樣的兩段 */
export function pageFromText(html, complete = true) {
    const head = html.slice(0, HEAD_CHARS);
    const at = html.indexOf(PLAYER_MARK);
    if (at < 0) return { head, player: html, complete };
    const end = html.indexOf(SCRIPT_END, at);
    return { head, player: html.slice(at, end >= 0 ? end : undefined), complete };
}
