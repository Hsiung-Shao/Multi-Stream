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
};
