// 個人週表頁的 edge 內文（functions/lib/schedule-person.js renderPersonBodyHtml 放進 #root 的那段）。
// boot.tsx 清空 #root 前先留一份，SchedulePersonPage 在「載入中／查詢失敗」時拿來畫，
// 讓搜尋引擎算繪的任何時刻都看得到這一頁的內容，而不是骨架或錯誤訊息（GSC 轉址式 404）。
// 內文由自家 edge 產生、資料庫字串都已跳脫，不是使用者輸入。
import { splitLangPath } from '../../../functions/lib/locale.js';

const PERSON_PATH_RE = /^\/schedule\/[^/]+$/;
let saved: { pathname: string; html: string } | null = null;

/** 只記個人頁（可帶 /zh-TW 前綴）且 #root 有內容時；其他情況不動先前記的 */
export function captureEdgeBody(root: HTMLElement, pathname: string): void {
    if (!root.hasChildNodes() || !PERSON_PATH_RE.test(splitLangPath(pathname).path)) return;
    saved = { pathname, html: root.innerHTML };
}

/** 路徑完全相同才回傳：站內換到別人的頁不能沿用上一位的內文 */
export function edgeBodyFor(pathname: string): string | null {
    return saved && saved.pathname === pathname ? saved.html : null;
}

/** 測試用 */
export function resetEdgeBody(): void {
    saved = null;
}
