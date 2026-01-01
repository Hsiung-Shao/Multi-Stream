
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

