// 投稿表單「公司或社團名稱」的輸入建議：只查團體名稱（企業勢＋社團），不必為此下載整份週表 snapshot。
// 名冊變動很慢，同一個頁面只查一次；查不到時回空清單（只是少了建議，不影響送出）。

import { useQuery } from '@tanstack/react-query';
import { resolveRestConfig, restGet } from '../schedule/restClient';

export function useGroupNames(): string[] {
    const query = useQuery({
        queryKey: ['contribute-group-names'],
        queryFn: async ({ signal }) => {
            const cfg = await resolveRestConfig({ signal });
            const rows = await restGet<{ name: string }[]>(cfg, 'vtuber_groups?select=name&kind=in.(agency,circle)&order=name.asc&limit=1000', { signal });
            return rows.map((r) => r.name);
        },
        staleTime: Infinity,
        refetchOnWindowFocus: false,
        retry: false,
    });
    return query.data ?? [];
}
