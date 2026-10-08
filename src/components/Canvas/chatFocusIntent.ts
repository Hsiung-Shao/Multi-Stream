/**
 * 聊天室收合／展開時的鍵盤焦點交接。
 * 收合後聊天室（連同工具列的選單按鈕）從畫布上卸載，展開後右緣的展開標籤卸載——
 * 焦點所在的元素消失，瀏覽器會把焦點丟回 body，鍵盤使用者得從頁首重新 Tab。
 * 觸發的一方先登記「接下來誰該拿到焦點」，接手的元件掛載時領走並 focus 自己。
 * 登記有時效：接手元件沒有掛載（例如展開後聊天室是空槽、沒有選單按鈕）時，
 * 不能留著舊登記，等很久以後別的聊天室掛載時才突然搶走焦點。
 */
export type ChatFocusTarget = 'expand-tab' | 'layout-menu';

const TTL_MS = 1000;
let pending: { target: ChatFocusTarget; at: number } | null = null;

export function requestChatFocus(target: ChatFocusTarget): void {
    pending = { target, at: Date.now() };
}

/** 登記的對象是 target 且未過期就領走（只會成功一次） */
export function consumeChatFocus(target: ChatFocusTarget): boolean {
    if (!pending || pending.target !== target) return false;
    const fresh = Date.now() - pending.at <= TTL_MS;
    pending = null;
    return fresh;
}
