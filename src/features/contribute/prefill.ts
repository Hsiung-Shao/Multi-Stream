// 站內導到投稿頁時預填顯示名稱（RouteLink 走 client-side 路由，不帶查詢字串）：
// 週表「查無結果」的連結點擊時先 setContributePrefill，投稿頁掛載時取用一次。
// 直接開網址（/schedule/submit?name=…）時投稿頁改讀查詢字串。

let pending: string | null = null;

export function setContributePrefill(name: string): void {
    pending = name.trim().slice(0, 100) || null;
}

export function consumeContributePrefill(): string | null {
    const v = pending;
    pending = null;
    return v;
}
