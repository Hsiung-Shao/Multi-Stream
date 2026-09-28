import { useQuery } from '@tanstack/react-query';
import { fetchSnapshot } from './snapshotSource';

/**
 * 週表 snapshot：有效 1 分鐘、每 5 分鐘背景更新（Docs「前端 → 快取」）。
 * 更新失敗時 TanStack Query 會保留上一份資料（data 仍在、isError 為 true），畫面不會清空。
 * SSR（entry-server）的 QueryClient 是 enabled:false，所以預渲染只會輸出殼層。
 */
export function useScheduleSnapshot() {
    return useQuery({
        queryKey: ['schedule-snapshot', 'v1'],
        queryFn: ({ signal }) => fetchSnapshot({ signal }),
        staleTime: 60_000,
        refetchInterval: 5 * 60_000,
        refetchIntervalInBackground: false,
        retry: 1,
    });
}
