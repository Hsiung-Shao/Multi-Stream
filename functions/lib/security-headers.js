// ⚠ 與根目錄 _headers 的 /* 區塊必須完全一致。
// Cloudflare Pages 的 _headers 不會套用到 Function 回應，因此 functions/[[path]].js 產生的 HTML
// 必須自帶這組安全標頭；tests/functions/seoEdge.test.ts 會 parse _headers 驗證兩邊同步，
// 改任一邊而沒改另一邊會被測試擋下。
export const HTML_SECURITY_HEADERS = {
    'Strict-Transport-Security':
        "max-age=63072000; includeSubDomains; preload",
    'X-Content-Type-Options':
        "nosniff",
    'Referrer-Policy':
        "strict-origin-when-cross-origin",
    'Permissions-Policy':
        "camera=(), microphone=(), geolocation=()",
    'Content-Security-Policy-Report-Only':
        "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://player.twitch.tv https://www.youtube.com https://*.youtube.com https://*.googleapis.com https://*.gstatic.com https://*.google-analytics.com https://*.googletagmanager.com https://static.cloudflareinsights.com https://pagead2.googlesyndication.com https://*.googlesyndication.com https://*.adtrafficquality.google; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: https:; font-src 'self' data: https://fonts.gstatic.com; frame-src 'self' https://player.twitch.tv https://www.twitch.tv https://*.twitch.tv https://www.youtube.com https://*.youtube.com https://googleads.g.doubleclick.net https://tpc.googlesyndication.com https://*.googlesyndication.com https://*.adtrafficquality.google https://www.google.com; connect-src 'self' https://api.twitch.tv https://*.twitch.tv https://www.googleapis.com https://*.googleapis.com https://*.youtube.com https://*.google-analytics.com https://*.analytics.google.com https://analytics.google.com https://stats.g.doubleclick.net https://*.googletagmanager.com https://www.googletagmanager.com https://static.cloudflareinsights.com https://cloudflareinsights.com https://ipapi.co https://*.supabase.co wss://*.supabase.co https://*.googlesyndication.com https://*.doubleclick.net https://*.adtrafficquality.google; media-src 'self' https://player.twitch.tv https://*.twitch.tv https://www.youtube.com https://*.youtube.com; object-src 'none'; base-uri 'self'; form-action 'self'; upgrade-insecure-requests;",
};
