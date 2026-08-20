// Edge 注入用的 per-route SEO meta（zh-TW / en 兩組；其他語言統一落到 en）。
// ⚠ 值必須與 src/i18n/locales/{zh-TW,en}/seo.ts（及 faq.ts 的 title/header_subtitle）一致：
//   Functions 無法 import TS locale 檔，故保留這份 JS 複本，由 tests/functions/seoEdge.test.ts 鎖同步。
export const ROBOTS_INDEX = 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1';
export const ROBOTS_NOINDEX = 'noindex, follow';
export const OG_LOCALE = { 'zh-TW': 'zh_TW', en: 'en_US' };

export const ROUTE_META = {
    '/': {
        'zh-TW': {
            title: 'MultiStream Hub｜免費 Twitch & YouTube 多直播同時觀看工具',
            description:
                'MultiStream Hub 是一個完全免費的多平台直播串流觀看工具，支援同時觀看多個 Twitch 和 YouTube 直播。提供多種布局模式、聊天室整合、音量控制和收藏功能，無需註冊即可使用。',
        },
        en: {
            title: 'MultiStream Hub | Free Twitch & YouTube Multi-Stream Viewer',
            description:
                'MultiStream Hub is a completely free multi-stream viewer for watching multiple Twitch and YouTube live streams at once. Multiple layouts, integrated chat, volume control and favorites — no account required.',
        },
    },
    '/canvas': {
        'zh-TW': {
            title: '開始觀看直播 - MultiStream Hub | Multistream Viewer',
            description: '立即開始使用 MultiStream Hub。自定義您的多視窗直播布局，同時欣賞 Twitch 與 YouTube 的精彩內容。',
        },
        en: {
            title: 'Start Watching - MultiStream Hub | Multistream Viewer',
            description:
                'Start using MultiStream Hub now. Build a custom multi-window layout and watch Twitch and YouTube live streams side by side.',
        },
    },
    '/about': {
        'zh-TW': {
            title: '關於我們 - MultiStream Hub',
            description:
                '了解 MultiStream Hub 的功能特色、技術架構和開發者資訊。一個完全免費的多平台直播串流觀看工具，支援 Twitch 和 YouTube。',
        },
        en: {
            title: 'About Us - MultiStream Hub',
            description:
                "Learn about MultiStream Hub's features, architecture and the developer behind it. A completely free multi-platform stream viewer supporting Twitch and YouTube.",
        },
    },
    '/instructions': {
        'zh-TW': {
            title: '使用教學 - MultiStream Hub | How to Multistream',
            description: 'MultiStream Hub 完整功能指南。了解如何新增串流、管理收藏、使用動態島 (Dynamic Island) 與聊天室整合功能。',
        },
        en: {
            title: 'How to Use - MultiStream Hub | How to Multistream',
            description:
                'The complete MultiStream Hub guide: adding streams, managing favorites, the dynamic-island control center and integrated chat.',
        },
    },
    '/faq': {
        'zh-TW': {
            title: '常見問題 (FAQ) - MultiStream Hub',
            description: '播放問題、效能調校與資料儲存的常見疑問，都在這裡找到解答。',
        },
        en: {
            title: 'FAQ - MultiStream Hub',
            description: 'Answers to common questions about playback, performance, and data storage.',
        },
    },
    '/privacy': {
        'zh-TW': {
            title: '隱私權政策 - MultiStream Hub',
            description:
                'MultiStream Hub 隱私權政策。了解我們如何保護您的隱私，以及我們收集和使用資料的方式。本網站為純前端工具，絕大多數資料僅儲存於您的瀏覽器本地。',
        },
        en: {
            title: 'Privacy Policy - MultiStream Hub',
            description:
                'MultiStream Hub privacy policy. Learn how we protect your privacy — this is a client-side tool and most data stays in your browser.',
        },
    },
    '/support': {
        'zh-TW': {
            title: '支持我們 - MultiStream Hub',
            description:
                'MultiStream Hub 是完全免費的多直播觀看工具。透過 Buy Me a Coffee 贊助或聯盟連結支持網站維運，讓服務持續免費。',
        },
        en: {
            title: 'Support Us - MultiStream Hub',
            description:
                'MultiStream Hub is a completely free multi-stream viewer. Support the site through Buy Me a Coffee or our affiliate links to keep it free for everyone.',
        },
    },
    '/admin': {
        noindex: true,
        'zh-TW': { title: 'Admin - MultiStream Hub', description: '' },
        en: { title: 'Admin - MultiStream Hub', description: '' },
    },
};

export const NOT_FOUND_META = {
    'zh-TW': { title: '找不到頁面 - MultiStream Hub', description: '您要找的頁面不存在。' },
    en: { title: 'Page Not Found - MultiStream Hub', description: 'The page you are looking for does not exist.' },
};
