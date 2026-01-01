
export const getParentDomain = (): string => {
    if (typeof window === 'undefined') return 'localhost';
    const { hostname, protocol } = window.location;
    if (protocol === 'file:' || !hostname) return 'localhost';
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0') return 'localhost';
    return hostname;
};

export const getTwitchChatUrl = (channelId: string): string => {
    const domain = getParentDomain();
    const parentParam = domain === 'localhost' ? 'localhost' : domain;
    return `https://www.twitch.tv/embed/${encodeURIComponent(channelId)}/chat?parent=${encodeURIComponent(parentParam)}&darkpopout`;
};

export const getYouTubeChatUrl = (videoId: string): string => {
    const domain = getParentDomain();
    return `https://www.youtube.com/live_chat?v=${encodeURIComponent(videoId)}&embed_domain=${encodeURIComponent(domain)}`;
};
