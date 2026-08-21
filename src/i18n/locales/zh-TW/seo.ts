// 各頁 SEO meta（title/description）——zh-TW 為主語言，直接引用 src/seo/defaults.ts 維持單一來源。
// ⚠ functions/lib/seo-meta.js（edge 注入用）有一份 zh-TW/en 複本，由 tests/functions/seoEdge.test.ts 鎖同步。
import { SEO_DEFAULT_TITLE, SEO_DEFAULT_DESCRIPTION, SEO_CANVAS } from '../../../seo/defaults';

export default {
    'home.title': SEO_DEFAULT_TITLE,
    'home.description': SEO_DEFAULT_DESCRIPTION,
    'canvas.title': SEO_CANVAS.title,
    'canvas.description': SEO_CANVAS.description,
    'about.title': '關於我們 - MultiStream Hub',
    'about.description': '了解 MultiStream Hub 的功能特色、技術架構和開發者資訊。一個完全免費的多平台直播串流觀看工具，支援 Twitch 和 YouTube。',
    'privacy.title': '隱私權政策 - MultiStream Hub',
    'privacy.description': 'MultiStream Hub 隱私權政策。了解我們如何保護您的隱私，以及我們收集和使用資料的方式。本網站為純前端工具，絕大多數資料僅儲存於您的瀏覽器本地。',
    'instructions.title': '使用教學 - MultiStream Hub | How to Multistream',
    'instructions.description': 'MultiStream Hub 完整功能指南。了解如何新增串流、管理收藏、使用動態島 (Dynamic Island) 與聊天室整合功能。',
    'support.title': '支持我們 - MultiStream Hub',
    'support.description': 'MultiStream Hub 是完全免費的多直播觀看工具。透過 Buy Me a Coffee 贊助或聯盟連結支持網站維運，讓服務持續免費。',
    // 教學文章頁（/instructions/<slug>，見 src/config/guides.ts）
    'instructions.quick-start.title': '快速上手：新增串流到自動排版 - MultiStream Hub',
    'instructions.quick-start.description': '第一次使用 MultiStream Hub？從貼上 Twitch / YouTube 網址新增直播開始，學會搜尋頻道、切換佈局與整合聊天室。',
    'instructions.canvas.title': '畫布與佈局：自由拖曳多直播視窗 - MultiStream Hub',
    'instructions.canvas.description': '認識 MultiStream Hub 的畫布工作區：自動網格、自由拖曳、調整大小、磁吸對齊與聊天視窗配置。',
    'instructions.search.title': '智慧搜尋：用網址或頻道名新增 Twitch / YouTube 直播 - MultiStream Hub',
    'instructions.search.description': '搜尋框不只貼網址：直接輸入 Twitch 頻道名或 YouTube 頻道，即時查看開台狀態並一鍵加入畫布。',
    'instructions.dynamic-island.title': '動態島控制中心：佈局、媒體、收藏一站操作 - MultiStream Hub',
    'instructions.dynamic-island.description': '動態島是 MultiStream Hub 的控制中心：切換佈局、全域音量、收藏清單、全螢幕與清空畫布都在這裡。',
    'instructions.favorites.title': '收藏管理：追蹤實況主、儲存常用組合與開台偵測 - MultiStream Hub',
    'instructions.favorites.description': '把喜歡的實況主與常用佈局存起來，匯入 Twitch 追蹤清單，開台時立即得知並一鍵開啟。',
    'instructions.media.title': '媒體控制：獨立音量、總音量與靜音 - MultiStream Hub',
    'instructions.media.description': '同時看多個直播也不吵：每個視窗獨立音量、總音量一鍵調整、新串流自動靜音。',
    'instructions.settings.title': '設定與效能調校：主題、資料備份與 Twitch 連結 - MultiStream Hub',
    'instructions.settings.description': '調整 MultiStream Hub 的外觀、效能選項、本地資料備份與 Twitch 帳號連結，打造專屬的觀看環境。',
    'creator.title': '開發者 Hsiung-Shao - MultiStream Hub',
    'creator.description': '認識 MultiStream Hub 的獨立開發者 Hsiung-Shao：為什麼做這個免費的多直播觀看工具，以及如何聯絡與支持。',
    'compare.title': 'MultiTwitch 替代方案比較：MultiStream Hub vs MultiTwitch vs TwitchTheater vs Multistre.am',
    'compare.description': '四款多直播同時觀看工具比較：支援平台、同時路數、佈局、多聊天室、分享連結、手機版與價格，幫你挑最適合的。',
};
