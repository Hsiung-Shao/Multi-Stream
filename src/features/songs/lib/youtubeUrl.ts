/**
 * 從使用者貼上的內容取出 YouTube 影片 ID（後台新增歌曲影片用）。
 *
 * - 純函式、零 DOM。支援 watch?v=、youtu.be/、/live/、/shorts/、/embed/、m.youtube.com 與純 11 碼 ID。
 * - 網域用白名單精準比對（notyoutube.com、example.com 一律拒絕）；ID 必須是 11 碼 [A-Za-z0-9_-]。
 * - 不重用 utils/security/validators 的 validateVideoId：它允許不同長度，這裡要嚴格 11 碼。
 */
const ID_RE = /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com']);
const PATH_PREFIXES = new Set(['live', 'shorts', 'embed']);

export function extractVideoId(input: string): string | null {
    const text = input.trim();
    if (ID_RE.test(text)) return text;

    let url: URL;
    try {
        url = new URL(text);
    } catch {
        return null;
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;

    const host = url.hostname.toLowerCase();
    let candidate: string | null = null;

    if (host === 'youtu.be') {
        candidate = url.pathname.split('/')[1] ?? null;
    } else if (YOUTUBE_HOSTS.has(host)) {
        const [, first, second] = url.pathname.split('/');
        if (first === 'watch') candidate = url.searchParams.get('v');
        else if (PATH_PREFIXES.has(first)) candidate = second ?? null;
    }

    return candidate !== null && ID_RE.test(candidate) ? candidate : null;
}
