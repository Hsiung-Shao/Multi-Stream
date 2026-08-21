// Edge 注入用的 per-route SEO meta（zh-TW / en 兩組；其他語言統一落到 en）。
// ⚠ 值必須與 src/i18n/locales/{zh-TW,en}/seo.ts（及 faq.ts 的 title/header_subtitle）一致：
//   Functions 無法 import TS locale 檔，故保留這份 JS 複本，由 tests/functions/seoEdge.test.ts 鎖同步。
export const ROBOTS_INDEX = 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1';
export const ROBOTS_NOINDEX = 'noindex, follow';
export const OG_LOCALE = { 'zh-TW': 'zh_TW', en: 'en_US' };
/** index.html 的 WebApplication JSON-LD（script#ld-webapp）只在這些路由保留，其餘由 [[path]].js 移除 */
export const WEBAPP_JSONLD_ROUTES = ['/', '/canvas'];

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
    // 教學文章頁（type: article → edge 改寫 og:type；slug 清單見 src/config/guides.ts）
    '/instructions/quick-start': {
        type: 'article',
        'zh-TW': { title: '快速上手：新增串流到自動排版 - MultiStream Hub', description: '第一次使用 MultiStream Hub？從貼上 Twitch / YouTube 網址新增直播開始，學會搜尋頻道、切換佈局與整合聊天室。' },
        en: { title: 'Quick Start: From Adding Streams to Auto Layout - MultiStream Hub', description: 'New to MultiStream Hub? Add your first Twitch or YouTube stream from a URL, then learn channel search, layouts and integrated chat.' },
    },
    '/instructions/canvas': {
        type: 'article',
        'zh-TW': { title: '畫布與佈局：自由拖曳多直播視窗 - MultiStream Hub', description: '認識 MultiStream Hub 的畫布工作區：自動網格、自由拖曳、調整大小、磁吸對齊與聊天視窗配置。' },
        en: { title: 'Canvas & Layouts: Arrange Multiple Streams Freely - MultiStream Hub', description: 'Learn the MultiStream Hub canvas: auto grid, free drag, resize, magnetic snapping and chat window placement.' },
    },
    '/instructions/search': {
        type: 'article',
        'zh-TW': { title: '智慧搜尋：用網址或頻道名新增 Twitch / YouTube 直播 - MultiStream Hub', description: '搜尋框不只貼網址：直接輸入 Twitch 頻道名或 YouTube 頻道，即時查看開台狀態並一鍵加入畫布。' },
        en: { title: 'Smart Search: Add Twitch / YouTube Streams by URL or Channel - MultiStream Hub', description: 'More than a URL box: type a Twitch channel or YouTube channel, see live status and add it to the canvas in one click.' },
    },
    '/instructions/dynamic-island': {
        type: 'article',
        'zh-TW': { title: '動態島控制中心：佈局、媒體、收藏一站操作 - MultiStream Hub', description: '動態島是 MultiStream Hub 的控制中心：切換佈局、全域音量、收藏清單、全螢幕與清空畫布都在這裡。' },
        en: { title: 'Dynamic Island Control Center: Layout, Media and Favorites - MultiStream Hub', description: 'The dynamic island is MultiStream Hub\'s control center: layouts, master volume, favorites, fullscreen and clear canvas.' },
    },
    '/instructions/favorites': {
        type: 'article',
        'zh-TW': { title: '收藏管理：追蹤實況主、儲存常用組合與開台偵測 - MultiStream Hub', description: '把喜歡的實況主與常用佈局存起來，匯入 Twitch 追蹤清單，開台時立即得知並一鍵開啟。' },
        en: { title: 'Favorites: Track Streamers, Save Layouts and Live Detection - MultiStream Hub', description: 'Save favorite streamers and layouts, import your Twitch follows, and get notified the moment they go live.' },
    },
    '/instructions/media': {
        type: 'article',
        'zh-TW': { title: '媒體控制：獨立音量、總音量與靜音 - MultiStream Hub', description: '同時看多個直播也不吵：每個視窗獨立音量、總音量一鍵調整、新串流自動靜音。' },
        en: { title: 'Media Controls: Per-Stream Volume, Master Volume and Mute - MultiStream Hub', description: 'Watch many streams without the noise: per-window volume, one master slider and auto-mute for new streams.' },
    },
    '/instructions/settings': {
        type: 'article',
        'zh-TW': { title: '設定與效能調校：主題、資料備份與 Twitch 連結 - MultiStream Hub', description: '調整 MultiStream Hub 的外觀、效能選項、本地資料備份與 Twitch 帳號連結，打造專屬的觀看環境。' },
        en: { title: 'Settings & Performance: Themes, Data Backup and Twitch Link - MultiStream Hub', description: 'Tune MultiStream Hub\'s look, performance options, local data backup and Twitch account link.' },
    },
    '/about/creator': {
        'zh-TW': { title: '開發者 Hsiung-Shao - MultiStream Hub', description: '認識 MultiStream Hub 的獨立開發者 Hsiung-Shao：為什麼做這個免費的多直播觀看工具，以及如何聯絡與支持。' },
        en: { title: 'Hsiung-Shao, Creator of MultiStream Hub', description: 'Meet Hsiung-Shao, the independent developer behind MultiStream Hub: why it was built, and how to reach or support him.' },
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
