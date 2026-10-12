/**
 * 站外連結的單一來源（官方帳號、贊助、聯盟、回饋表單）。
 * 純 TS、零 import：index.html 的 JSON-LD 無法 import 本檔，改 URL 時請同步 index.html 的 sameAs。
 */
/** 作者個人頁：用於作者身分（JSON-LD sameAs、創作者頁） */
export const GITHUB_URL = 'https://github.com/Hsiung-Shao';
/** 公開原始碼 repo：用於關於頁、設定、首頁的 GitHub 按鈕 */
export const GITHUB_REPO_URL = 'https://github.com/Hsiung-Shao/Multi-Stream';
export const DISCORD_URL = 'https://discord.gg/47kauArepY';
export const X_URL = 'https://x.com/Hsiungshao';
export const COFFEE_URL = 'https://buymeacoffee.com/hsiung';
export const PATREON_URL = 'https://www.patreon.com/HsiungShao';
export const FEEDBACK_FORM_URL = 'https://forms.gle/AjG922YrXFbyAdBa6';
/** ExitLag 聯盟連結（頁面上須附揭露，rel="sponsored"） */
export const EXITLAG_AFFILIATE_URL = 'https://www.exitlag.com/refer/10318098';
