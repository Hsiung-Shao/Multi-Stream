// useCrossChannelName
//
// 把 RecommendDialog 內的 cross URL 解析結果轉換成「該頻道的顯示名」。
// 用途:第二階段 suggestion fuzzy match — 用 user 貼的另一平台頻道名再查
// 一次 db,蓋住「target.name 跟另一平台 displayName 不同」的 case。
//
// 各平台來源:
//   - twitch:呼叫 twitchService.searchChannels(login),取 login 完全相等
//             那筆的 displayName
//   - youtube (來自 @handle):resolveYouTubeHandle 已經拿到 channelTitle,
//             直接帶進來不重複 fetch
//   - youtube (來自 /channel/UC...):一般使用者拿不到 UC ID,實務罕見;
//             不反查 name,回 null

import { useQuery } from '@tanstack/react-query';
import { twitchService } from '../twitch/TwitchService';

export interface CrossChannelHint {
    platform: 'twitch' | 'youtube' | null;
    /** Twitch login(小寫)或 YouTube channelId(UC...) */
    channelId: string | null;
    /** YouTube @handle 解析時順手帶回的 title;Twitch case 不用、不填 */
    youtubeTitle: string | null;
}

const KEY = 'cross-channel-name';
const TWITCH_MIN_LOGIN_LEN = 3;

export function useCrossChannelName(hint: CrossChannelHint): string | null {
    const twitchLogin = hint.platform === 'twitch' && hint.channelId
        ? hint.channelId.toLowerCase()
        : '';

    const { data: twitchName } = useQuery({
        queryKey: [KEY, twitchLogin],
        enabled: twitchLogin.length >= TWITCH_MIN_LOGIN_LEN,
        queryFn: async () => {
            const results = await twitchService.searchChannels(twitchLogin, 5);
            const match = results.find(r => r.login?.toLowerCase() === twitchLogin);
            return match?.displayName?.trim() || null;
        },
        staleTime: 5 * 60 * 1000,
        retry: false,
    });

    if (hint.platform === 'twitch') return twitchName ?? null;
    if (hint.platform === 'youtube') return hint.youtubeTitle;
    return null;
}
