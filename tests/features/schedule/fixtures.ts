import type { ScheduleSnapshot } from '../../../src/features/schedule/types';

/** 測試用的 snapshot：TW 兩位（其中一位同時有 Twitch）、JP 一位、MY 一位 */
export const NOW = Date.parse('2026-09-29T04:00:00Z'); // 台北 12:00

export function makeSnapshot(): ScheduleSnapshot {
    return {
        version: 1,
        generated_at: '2026-09-29T03:59:00Z',
        heavy_refreshed_at: '2026-09-29T03:50:00Z',
        channels: {
            v1: { name: '台一', nationality: 'TW', group: '子午計畫', youtube: 'UC0000000000000000000001', twitch: 'TaiOne', avatar: 'https://yt3.ggpht.com/a' },
            v2: { name: '台二', nationality: 'TW', youtube: 'UC0000000000000000000002' },
            v3: { name: '日三', nationality: 'JP', group: 'ホロ', youtube: 'UC0000000000000000000003' },
            v4: { name: '馬四', nationality: 'MY', twitch: 'mafour' },
        },
        live: [
            { vtuber_id: 'v1', platform: 'twitch', external_id: '111', source: 'twitch_live', status: 'live', title: '台一 Twitch', viewer_count: 50, actual_start: '2026-09-29T03:00:00Z' },
            { vtuber_id: 'v3', platform: 'youtube', external_id: 'JpLiveVideo', source: 'yt_waiting_room', status: 'live', title: '日三直播', viewer_count: 900, actual_start: '2026-09-29T02:00:00Z' },
            { vtuber_id: 'v4', platform: 'twitch', external_id: '222', source: 'twitch_live', status: 'live', title: '馬四', viewer_count: 10 },
        ],
        upcoming: [
            // 台北 20:00、20:30 同一個小時；隔天 09:00
            { vtuber_id: 'v1', platform: 'youtube', external_id: 'TaiOneWait1', source: 'yt_waiting_room', status: 'scheduled', title: '晚上雜談', scheduled_start: '2026-09-29T12:00:00Z' },
            { vtuber_id: 'v2', platform: 'youtube', external_id: 'TaiTwoWait1', source: 'yt_waiting_room', status: 'scheduled', title: '歌回', scheduled_start: '2026-09-29T12:30:00Z' },
            { vtuber_id: 'v2', platform: 'youtube', external_id: 'TaiTwoWait2', source: 'yt_waiting_room', status: 'scheduled', title: '早安', scheduled_start: '2026-09-30T01:00:00Z' },
            { vtuber_id: 'v3', platform: 'youtube', external_id: 'JpWaiting01', source: 'yt_waiting_room', status: 'scheduled', title: '予定', scheduled_start: '2026-09-29T13:00:00Z' },
        ],
        recent: [
            { vtuber_id: 'v2', platform: 'youtube', external_id: 'TaiTwoEnded', source: 'yt_waiting_room', status: 'ended', title: '昨晚', actual_end: '2026-09-29T01:00:00Z' },
        ],
    };
}
