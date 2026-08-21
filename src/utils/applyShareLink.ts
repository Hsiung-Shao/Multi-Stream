/**
 * 把 ?streams= 解析結果套到 store：逐一 addStream（**必須序列 await**——addStream 開頭 get() 快照 state，
 * 並行呼叫會互相覆蓋 lost update）。不傳 displayName：讓 YouTube 照常從 API 取標題，且 options 整包覆蓋預設。
 */
import { useStreamStore } from '../store/useStreamStore';
import { entryToUrl, type SharePayload } from './shareLink';

export async function applyShareLink(payload: SharePayload): Promise<{ added: number; failed: number }> {
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
