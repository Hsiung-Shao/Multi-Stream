import { useQuery } from '@tanstack/react-query';
import { fetchPerson } from './personSource';

/**
 * 個人週表：有效 1 分鐘、每 5 分鐘背景更新（與公共週表 snapshot 相同節奏）。
 * data === null 代表查無此人（404）；undefined 代表還在載入。
 * SSR 的 QueryClient 是 enabled:false，所以不會在預渲染時打 API。
 */
export function usePersonSchedule(slug: string) {
    return useQuery({
        queryKey: ['schedule-person', slug],
        queryFn: ({ signal }) => fetchPerson(slug, { signal }),
        staleTime: 60_000,
        refetchInterval: 5 * 60_000,
        refetchIntervalInBackground: false,
        retry: 1,
    });
}
