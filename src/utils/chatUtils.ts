
export const getParentDomain = (): string => {
    if (typeof window === 'undefined') return 'localhost';
    const { hostname, protocol } = window.location;
    if (protocol === 'file:' || !hostname) return 'localhost';
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0') return 'localhost';
    return hostname;
};

export const getTwitchChatUrl = (channelId: string, theme?: 'light' | 'dark'): string => {
    const domain = getParentDomain();
    const parentParam = domain === 'localhost' ? 'localhost' : domain;
    let url = `https://www.twitch.tv/embed/${encodeURIComponent(channelId)}/chat?parent=${encodeURIComponent(parentParam)}`;
    if (theme === 'dark') {
        url += '&darkpopout';
    }
    return url;
};

export const getYouTubeChatUrl = (videoId: string, theme?: 'light' | 'dark'): string => {
    const domain = getParentDomain();
    let url = `https://www.youtube.com/live_chat?v=${encodeURIComponent(videoId)}&embed_domain=${encodeURIComponent(domain)}`;
    if (theme === 'dark') {
        url += '&dark_theme=1';
    }
    return url;
};

// --- 另開視窗用的聊天室網址 ---
//
// 內嵌的聊天室 iframe 屬於第三方情境，瀏覽器封鎖第三方 cookie 時拿不到登入態，
// 使用者就無法發言（Safari 全面封鎖、Chrome 部分封鎖）。這是瀏覽器層的限制，
// 前端無法繞過。改為在新視窗開啟原生聊天室頁面時屬於第一方情境，登入態正常，
// 必定能發言。以下兩個函式刻意不帶 embed_domain / parent 參數。

export const getTwitchChatPopoutUrl = (channelId: string): string =>
    `https://www.twitch.tv/popout/${encodeURIComponent(channelId)}/chat?popout=`;

export const getYouTubeChatPopoutUrl = (videoId: string): string =>
    `https://www.youtube.com/live_chat?v=${encodeURIComponent(videoId)}&is_popout=1`;

