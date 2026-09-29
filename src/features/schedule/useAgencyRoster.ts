import { useQuery } from '@tanstack/react-query';
import { fetchAgencyRoster } from './rosterSource';

/**
 * 週表「所屬」選了某家企業勢時的成員名冊。名冊變動慢：10 分鐘內不重抓；沒選公司時不啟用。
 * data === null 代表查無此公司（例如舊的篩選值）。
 */
export function useAgencyRoster(agency: string | null) {
    return useQuery({
        queryKey: ['schedule-roster', agency],
        queryFn: ({ signal }) => fetchAgencyRoster(agency as string, { signal }),
        enabled: !!agency,
        staleTime: 10 * 60_000,
        retry: 1,
    });
}
