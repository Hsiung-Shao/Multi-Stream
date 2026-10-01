// 回報對象（決定對話框的標題、可選原因，以及送給 /api/report 的對象欄位）

export type ReportTarget =
    | { kind: 'vtuber_info'; vtuberId: string; name: string }
    | { kind: 'stream'; vtuberId?: string; platform: 'youtube' | 'twitch'; externalId: string; title?: string | null }
    | { kind: 'roster'; groupId: string; groupName: string }
    | { kind: 'missing_vtuber' };
