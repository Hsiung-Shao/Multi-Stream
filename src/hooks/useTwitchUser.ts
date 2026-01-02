import { useState, useCallback } from 'react';
import { twitchService } from '../features/twitch/TwitchService';

export interface TwitchUser {
    id: string;
    login: string;
    displayName: string;
    profileImageUrl: string;
}

export interface FollowedChannel {
    broadcasterId: string;
    broadcasterLogin: string;
    broadcasterName: string;
    followedAt: string;
    profileImageUrl: string;
}

interface UseTwitchUserReturn {
    user: TwitchUser | null;
    loading: boolean;
    error: string | null;
    followedChannels: FollowedChannel[];
    totalFollows: number;
    hasMore: boolean;
    cursor: string | undefined;
    fetchUser: (token: string) => Promise<void>;
    fetchFollowedChannels: (token: string, userId: string, nextCursor?: string) => Promise<void>;
    loadMore: (token: string, userId: string) => Promise<void>;
    reset: () => void;
}

export function useTwitchUser(): UseTwitchUserReturn {
    const [user, setUser] = useState<TwitchUser | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [followedChannels, setFollowedChannels] = useState<FollowedChannel[]>([]);
    const [totalFollows, setTotalFollows] = useState(0);
    const [cursor, setCursor] = useState<string | undefined>(undefined);
    const [hasMore, setHasMore] = useState(false);

    const reset = useCallback(() => {
        setUser(null);
        setFollowedChannels([]);
        setTotalFollows(0);
        setCursor(undefined);
        setHasMore(false);
        setError(null);
    }, []);

    const fetchUser = useCallback(async (token: string) => {
        if (!token) return;
        setLoading(true);
        setError(null);
        try {
            const res = await fetch('https://api.twitch.tv/helix/users', {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Client-Id': twitchService.getConfig().clientId || '',
                }
            });

            if (!res.ok) {
                throw new Error(`Failed to fetch user: ${res.status}`);
            }

            const data = await res.json();
            if (data.data && data.data.length > 0) {
                const u = data.data[0];
                setUser({
                    id: u.id,
                    login: u.login,
                    displayName: u.display_name,
                    profileImageUrl: u.profile_image_url
                });
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unknown error fetching user');
        } finally {
            setLoading(false);
        }
    }, []);

    const fetchFollowedChannels = useCallback(async (token: string, userId: string, nextCursor?: string) => {
        if (!token || !userId) return;
        setLoading(true);
        if (!nextCursor) setError(null);

        try {
            // 1. Fetch Followed Channels
            const url = new URL('https://api.twitch.tv/helix/channels/followed');
            url.searchParams.append('user_id', userId);
            url.searchParams.append('first', '100');
            if (nextCursor) {
                url.searchParams.append('after', nextCursor);
            }

            const res = await fetch(url.toString(), {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Client-Id': twitchService.getConfig().clientId || '',
                }
            });

            if (!res.ok) {
                throw new Error(`Failed to fetch follows: ${res.status}`);
            }

            const data = await res.json();
            let newChannels: FollowedChannel[] = data.data.map((item: any) => ({
                broadcasterId: item.broadcaster_id,
                broadcasterLogin: item.broadcaster_login,
                broadcasterName: item.broadcaster_name,
                followedAt: item.followed_at,
                profileImageUrl: '' // Placeholder
            }));

            // 2. Fetch User Profiles for Avatars
            if (newChannels.length > 0) {
                const userIds = newChannels.map(c => c.broadcasterId);
                const usersUrl = new URL('https://api.twitch.tv/helix/users');
                userIds.forEach(id => usersUrl.searchParams.append('id', id));

                const usersRes = await fetch(usersUrl.toString(), {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Client-Id': twitchService.getConfig().clientId || '',
                    }
                });

                if (usersRes.ok) {
                    const usersData = await usersRes.json();
                    const userMap = new Map(usersData.data.map((u: any) => [u.id, u.profile_image_url]));

                    newChannels = newChannels.map(c => ({
                        ...c,
                        profileImageUrl: userMap.get(c.broadcasterId) || ''
                    }));
                }
            }

            setFollowedChannels(prev => nextCursor ? [...prev, ...newChannels] : newChannels);
            setTotalFollows(data.total);

            const next = data.pagination?.cursor;
            setCursor(next);
            setHasMore(!!next);

        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unknown error fetching follows');
        } finally {
            setLoading(false);
        }
    }, []);

    const loadMore = useCallback(async (token: string, userId: string) => {
        if (cursor) {
            await fetchFollowedChannels(token, userId, cursor);
        }
    }, [cursor, fetchFollowedChannels]);

    return {
        user,
        loading,
        error,
        followedChannels,
        totalFollows,
        hasMore,
        cursor,
        fetchUser,
        fetchFollowedChannels,
        loadMore,
        reset
    };
}
