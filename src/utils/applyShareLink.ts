/**
 * 把 ?streams= 解析結果套到 store：逐一 addStream（**必須序列 await**——addStream 開頭 get() 快照 state，
 * 並行呼叫會互相覆蓋 lost update）。不傳 displayName：讓 YouTube 照常從 API 取標題，且 options 整包覆蓋預設。
 */
import { useStreamStore } from '../store/useStreamStore';
import { entryToUrl, type SharePayload } from './shareLink';

export async function applyShareLink(payload: SharePayload): Promise<{ added: number; failed: number }> {
    // 先確定畫布模式，再開始加入。分享連結一定指向 /canvas，但把 layoutMode 設成 'canvas' 的是
    // NewCanvasPage 的 effect，而它是 lazy 元件——載入必然晚於 App 掛載時呼叫這裡。
    // layoutMode 還停在初始值 'auto' 時，addStream 會走 legacy 分支，把每個視窗都塞進
    // x:0 / y:0（而且用早已作廢的像素尺寸 480x270），結果是所有視窗疊在左上角。
    // 只有「沒有 persist 過 layoutMode 的首次造訪者」會踩到，所以分享者自己開永遠正常。
    const store = useStreamStore.getState();
    if (store.layoutMode !== 'canvas') store.setLayoutMode('canvas');

    let added = 0;
    let failed = 0;
    for (const entry of payload.streams) {
        try {
            const result = await useStreamStore.getState().addStream(entryToUrl(entry), {
                withChat: payload.chat,
                withStream: true,
            });
            if (result.success) added++;
            else failed++;
        } catch {
            failed++;
        }
    }
    return { added, failed };
}
