// VTuber 名錄（/vtubers）的資料：以 anon 身分呼叫 schedule_directory RPC（連線與逾時見 restClient.ts）。
// 版面分組（公司／子團／個人勢）由 functions/lib/directory-group.js 處理，與 edge SSR 共用同一套規則。

import { resolveRestConfig, restRpc, type RestOptions } from './restClient';
import { SnapshotError } from './snapshotSource';

export interface DirectoryGroup {
    id: string;
    name: string;
    parent_id: string | null;
    kind: string | null;
}

export interface DirectoryPerson {
    slug: string;
    name: string;
    group_id: string | null;
    last_live_at: string | null;
}

export interface DirectoryData {
    groups: DirectoryGroup[];
    people: DirectoryPerson[];
}

/** 名錄全部資料；RPC 回的不是 { groups: [], people: [] } 就丟 SnapshotError（頁面顯示錯誤狀態） */
export async function fetchDirectory(opts: RestOptions = {}): Promise<DirectoryData> {
    const cfg = await resolveRestConfig(opts);
    const data = await restRpc<Partial<DirectoryData>>(cfg, 'schedule_directory', {}, opts);
    if (!Array.isArray(data.groups) || !Array.isArray(data.people)) throw new SnapshotError('format', 'unexpected directory response');
    return { groups: data.groups, people: data.people };
}
