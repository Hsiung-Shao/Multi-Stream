import { getSupabase } from '../../lib/supabase';
import type {
    VTuberRecord,
    VTuberGroup,
    VTuberLivestream,
    VTuberContribution,
    VTuberFilter,
    VTuberNationality,
    VTuberContributionPayload,
    VTuberContributionFilter,
    SubmitContributionInput,
} from './types';

// ---------------------------------------------------------------------------
// Mock Data (development fallback when Supabase is unavailable)
// ---------------------------------------------------------------------------

const MOCK_GROUPS: VTuberGroup[] = [
    { id: 'g1', name: 'hololive', nationality: 'JP', member_count: 75 },
    { id: 'g2', name: 'NIJISANJI', nationality: 'JP', member_count: 120 },
    { id: 'g3', name: '雲際線', nationality: 'TW', member_count: 8 },
    { id: 'g4', name: 'VShojo', nationality: 'OTHER', member_count: 12 },
    { id: 'g5', name: '春魚工作室', nationality: 'TW', member_count: 5 },
];

const MOCK_VTUBERS: VTuberRecord[] = [
    {
        id: 'v1',
        name: '星街すいせい',
        img_url: null,
        activity: 'active',
        nationality: 'JP',
        group_id: 'g1',
        group_name: 'hololive',
        youtube_channel_id: 'UC5CwaMl1eIgY8h02uZw7u8A',
        youtube_subscriber_count: 2100000,
        twitch_channel_id: null,
        twitch_follower_count: null,
        popular_video_type: 'youtube',
        popular_video_id: 'a51VH9BYzZA',
        debut_date: '2018-03-22',
        channel_id_verified: true,
        contributed_by: null,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-06-01T00:00:00Z',
    },
    {
        id: 'v2',
        name: '杏仁ミル',
        img_url: null,
        activity: 'active',
        nationality: 'TW',
        group_id: null,
        group_name: undefined,
        youtube_channel_id: 'UCFahBR2wRedoA_bOHEBMnbQ',
        youtube_subscriber_count: 450000,
        twitch_channel_id: 'annin_miru',
        twitch_follower_count: 120000,
        popular_video_type: null,
        popular_video_id: null,
        debut_date: '2019-07-15',
        channel_id_verified: true,
        contributed_by: null,
        created_at: '2024-01-02T00:00:00Z',
        updated_at: '2024-06-02T00:00:00Z',
    },
    {
        id: 'v3',
        name: '李李鈴蘭',
        img_url: null,
        activity: 'active',
        nationality: 'TW',
        group_id: 'g3',
        group_name: '雲際線',
        youtube_channel_id: 'UCuBmEMGKbfBYYbAniNLKnkQ',
        youtube_subscriber_count: 320000,
        twitch_channel_id: null,
        twitch_follower_count: null,
        popular_video_type: null,
        popular_video_id: null,
        debut_date: '2020-11-01',
        channel_id_verified: true,
        contributed_by: null,
        created_at: '2024-01-03T00:00:00Z',
        updated_at: '2024-06-03T00:00:00Z',
    },
    {
        id: 'v4',
        name: '鷹嶺ルイ',
        img_url: null,
        activity: 'active',
        nationality: 'JP',
        group_id: 'g1',
        group_name: 'hololive',
        youtube_channel_id: 'UCs9_O1tRPMQTHQ-N_L6FU2g',
        youtube_subscriber_count: 1200000,
        twitch_channel_id: null,
        twitch_follower_count: null,
        popular_video_type: null,
        popular_video_id: null,
        debut_date: '2021-11-26',
        channel_id_verified: true,
        contributed_by: null,
        created_at: '2024-01-04T00:00:00Z',
        updated_at: '2024-06-04T00:00:00Z',
    },
    {
        id: 'v5',
        name: '壱百満天原サロメ',
        img_url: null,
        activity: 'active',
        nationality: 'JP',
        group_id: 'g2',
        group_name: 'NIJISANJI',
        youtube_channel_id: 'UCgIfLpQvelloDi6RAUM1gJw',
        youtube_subscriber_count: 1800000,
        twitch_channel_id: null,
        twitch_follower_count: null,
        popular_video_type: 'youtube',
        popular_video_id: 'abc123',
        debut_date: '2022-05-24',
        channel_id_verified: true,
        contributed_by: null,
        created_at: '2024-01-05T00:00:00Z',
        updated_at: '2024-06-05T00:00:00Z',
    },
    {
        id: 'v6',
        name: '懶貓子',
        img_url: null,
        activity: 'active',
        nationality: 'HK',
        group_id: null,
        group_name: undefined,
        youtube_channel_id: 'UC_mock_lazyCat',
        youtube_subscriber_count: 85000,
        twitch_channel_id: 'lazycat_vt',
        twitch_follower_count: 32000,
        popular_video_type: null,
        popular_video_id: null,
        debut_date: '2021-03-10',
        channel_id_verified: false,
        contributed_by: 'user123',
        created_at: '2024-02-01T00:00:00Z',
        updated_at: '2024-06-06T00:00:00Z',
    },
    {
        id: 'v7',
        name: 'Selen Tatsuki',
        img_url: null,
        activity: 'graduate',
        nationality: 'OTHER',
        group_id: 'g2',
        group_name: 'NIJISANJI',
        youtube_channel_id: 'UC_mock_selen',
        youtube_subscriber_count: 750000,
        twitch_channel_id: null,
        twitch_follower_count: null,
        popular_video_type: null,
        popular_video_id: null,
        debut_date: '2021-07-18',
        channel_id_verified: true,
        contributed_by: null,
        created_at: '2024-01-06T00:00:00Z',
        updated_at: '2024-06-07T00:00:00Z',
    },
    {
        id: 'v8',
        name: '悠白',
        img_url: null,
        activity: 'active',
        nationality: 'MY',
        group_id: null,
        group_name: undefined,
        youtube_channel_id: 'UC_mock_yubai',
        youtube_subscriber_count: 62000,
        twitch_channel_id: 'yubai_ch',
        twitch_follower_count: 18000,
        popular_video_type: null,
        popular_video_id: null,
        debut_date: '2022-09-01',
        channel_id_verified: false,
        contributed_by: 'user456',
        created_at: '2024-03-01T00:00:00Z',
        updated_at: '2024-06-08T00:00:00Z',
    },
];

const MOCK_LIVESTREAMS: VTuberLivestream[] = [
    {
        id: 'ls1',
        vtuber_id: 'v1',
        vtuber: MOCK_VTUBERS[0],
        title: '【歌枠】夜間唱歌回',
        video_url: 'https://www.youtube.com/watch?v=mock1',
        thumbnail_url: null,
        platform: 'youtube',
        start_time: new Date().toISOString(),
        viewer_count: 12500,
    },
    {
        id: 'ls2',
        vtuber_id: 'v2',
        vtuber: MOCK_VTUBERS[1],
        title: '跟大家聊天',
        video_url: 'https://www.twitch.tv/annin_miru',
        thumbnail_url: null,
        platform: 'twitch',
        start_time: new Date().toISOString(),
        viewer_count: 3200,
    },
];

// ---------------------------------------------------------------------------
// Sort field mapping (VTuberSortBy -> DB column name)
// ---------------------------------------------------------------------------

const SORT_COLUMN_MAP: Record<string, string> = {
    name: 'name',
    youtube_subscribers: 'youtube_subscriber_count',
    twitch_followers: 'twitch_follower_count',
    debut_date: 'debut_date',
    created_at: 'created_at',
};

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

class VTuberRepository {
    /**
     * 取得 VTuber 列表（含分頁 & 篩選）
     */
    async getVTubers(
        filter: VTuberFilter = {},
    ): Promise<{ data: VTuberRecord[]; count: number }> {
        try {
            const supabase = await getSupabase();
            if (!supabase) return this.getVTubersMock(filter);

            let query = supabase
                .from('vtubers')
                .select('*, vtuber_groups(name)', { count: 'exact' });

            if (filter.nationality) {
                query = query.eq('nationality', filter.nationality);
            }
            if (filter.groupId) {
                query = query.eq('group_id', filter.groupId);
            }
            if (filter.activity) {
                query = query.eq('activity', filter.activity);
            }
            if (filter.search) {
                query = query.ilike('name', `%${filter.search}%`);
            }

            const sortCol = SORT_COLUMN_MAP[filter.sortBy ?? 'name'] ?? 'name';
            query = query.order(sortCol, {
                ascending: (filter.sortOrder ?? 'asc') === 'asc',
            });

            const page = filter.page ?? 1;
            const pageSize = filter.pageSize ?? 20;
            const from = (page - 1) * pageSize;
            const to = from + pageSize - 1;
            query = query.range(from, to);

            const { data, error, count } = await query;
            if (error) throw error;

            const records: VTuberRecord[] = (data ?? []).map((row: unknown) => {
                const r = row as Record<string, unknown>;
                return {
                    ...(r as unknown as VTuberRecord),
                    group_name:
                        (r.vtuber_groups as { name: string } | null)?.name ?? undefined,
                };
            });

            return { data: records, count: count ?? 0 };
        } catch (err) {
            console.warn('VTuberRepository.getVTubers: falling back to mock data', err);
            return this.getVTubersMock(filter);
        }
    }

    /**
     * 取得 VTuber 團體列表
     */
    async getGroups(nationality?: VTuberNationality): Promise<VTuberGroup[]> {
        try {
            const supabase = await getSupabase();
            if (!supabase) return this.getGroupsMock(nationality);

            let query = supabase
                .from('vtuber_groups')
                .select('*')
                .order('name', { ascending: true });

            if (nationality) {
                query = query.eq('nationality', nationality);
            }

            const { data, error } = await query;
            if (error) throw error;
            return (data as VTuberGroup[]) ?? [];
        } catch (err) {
            console.warn('VTuberRepository.getGroups: falling back to mock data', err);
            return this.getGroupsMock(nationality);
        }
    }

    /**
     * 取得目前直播中的串流
     */
    async getLivestreams(): Promise<VTuberLivestream[]> {
        try {
            const supabase = await getSupabase();
            if (!supabase) return this.getLivestreamsMock();

            const { data, error } = await supabase
                .from('vtuber_livestreams')
                .select('*, vtubers(*)')
                .order('viewer_count', { ascending: false });

            if (error) throw error;

            const records: VTuberLivestream[] = (data ?? []).map((row: unknown) => {
                const r = row as Record<string, unknown>;
                return {
                    ...(r as unknown as VTuberLivestream),
                    vtuber: (r.vtubers as VTuberRecord) ?? undefined,
                };
            });

            return records;
        } catch (err) {
            console.warn('VTuberRepository.getLivestreams: falling back to mock data', err);
            return this.getLivestreamsMock();
        }
    }

    /**
     * 提交 VTuber 資料貢獻（新增 / 編輯 / 刪除請求）
     */
    async submitContribution(data: SubmitContributionInput): Promise<VTuberContribution> {
        try {
            const supabase = await getSupabase();
            if (!supabase) return this.submitContributionMock(data);

            const { data: result, error } = await supabase
                .from('vtuber_contributions')
                .insert({
                    action: data.action,
                    target_vtuber_id: data.targetVTuberId ?? null,
                    payload: data.payload as unknown as Record<string, unknown>,
                    status: 'pending',
                    submitted_by: data.submittedBy,
                    submitter_contact: data.submitterContact ?? null,
                    source_urls: data.sourceUrls,
                    source_note: data.sourceNote ?? null,
                })
                .select()
                .single();

            if (error) throw error;
            return result as VTuberContribution;
        } catch (err) {
            console.warn(
                'VTuberRepository.submitContribution: falling back to mock',
                err,
            );
            return this.submitContributionMock(data);
        }
    }

    /**
     * 取得貢獻列表（Admin 用）
     */
    async getContributions(
        filter: VTuberContributionFilter = {},
    ): Promise<{ data: VTuberContribution[]; count: number }> {
        try {
            const supabase = await getSupabase();
            if (!supabase) return this.getContributionsMock(filter);

            let query = supabase
                .from('vtuber_contributions')
                .select('*', { count: 'exact' })
                .order('created_at', { ascending: false });

            if (filter.status) {
                query = query.eq('status', filter.status);
            }

            const page = filter.page ?? 1;
            const pageSize = filter.pageSize ?? 20;
            const from = (page - 1) * pageSize;
            const to = from + pageSize - 1;
            query = query.range(from, to);

            const { data, error, count } = await query;
            if (error) throw error;
            return { data: (data as VTuberContribution[]) ?? [], count: count ?? 0 };
        } catch (err) {
            console.warn('VTuberRepository.getContributions: falling back to mock', err);
            return this.getContributionsMock(filter);
        }
    }

    /**
     * 審核貢獻（Admin 用）
     */
    async reviewContribution(
        id: string,
        decision: 'approved' | 'rejected',
        reviewerNotes?: string,
    ): Promise<void> {
        try {
            const supabase = await getSupabase();
            if (!supabase) {
                console.log('[Mock] reviewContribution:', id, decision, reviewerNotes);
                return;
            }

            // 1. Fetch the contribution to get action & payload
            const { data: contrib, error: fetchErr } = await supabase
                .from('vtuber_contributions')
                .select('*')
                .eq('id', id)
                .single();

            if (fetchErr) throw fetchErr;

            // 2. Update contribution status
            const { error } = await supabase
                .from('vtuber_contributions')
                .update({
                    status: decision,
                    reviewer_notes: reviewerNotes ?? null,
                    reviewed_at: new Date().toISOString(),
                })
                .eq('id', id);

            if (error) throw error;

            // 3. If approved, apply the change to vtubers table
            if (decision === 'approved') {
                await this.applyContribution(supabase, contrib);
            }
        } catch (err) {
            console.warn('VTuberRepository.reviewContribution failed', err);
            throw err;
        }
    }

    /**
     * Apply an approved contribution to the vtubers / vtuber_groups tables.
     */
    private async applyContribution(
        supabase: import('@supabase/supabase-js').SupabaseClient,
        contrib: Record<string, unknown>,
    ): Promise<void> {
        const action = contrib.action as string;
        const payload = contrib.payload as VTuberContributionPayload;

        if (action === 'add') {
            // Resolve group_id from group_name if provided
            let groupId: string | null = null;
            if (payload.group_name) {
                groupId = await this.resolveGroupId(supabase, payload.group_name);
            }

            const { error } = await supabase.from('vtubers').insert({
                name: payload.name,
                nationality: payload.nationality,
                youtube_channel_id: payload.youtube_channel_id ?? null,
                twitch_channel_id: payload.twitch_channel_id ?? null,
                group_id: groupId,
                debut_date: payload.debut_date ?? null,
                contributed_by: (contrib.submitted_by as string) ?? null,
            });
            if (error) throw error;
        } else if (action === 'edit' && contrib.target_vtuber_id) {
            let groupId: string | null | undefined;
            if (payload.group_name !== undefined) {
                groupId = payload.group_name
                    ? await this.resolveGroupId(supabase, payload.group_name)
                    : null;
            }

            const updates: Record<string, unknown> = {
                name: payload.name,
                nationality: payload.nationality,
                youtube_channel_id: payload.youtube_channel_id ?? null,
                twitch_channel_id: payload.twitch_channel_id ?? null,
                debut_date: payload.debut_date ?? null,
            };
            if (groupId !== undefined) {
                updates.group_id = groupId;
            }

            const { error } = await supabase
                .from('vtubers')
                .update(updates)
                .eq('id', contrib.target_vtuber_id as string);
            if (error) throw error;
        } else if (action === 'delete' && contrib.target_vtuber_id) {
            const { error } = await supabase
                .from('vtubers')
                .delete()
                .eq('id', contrib.target_vtuber_id as string);
            if (error) throw error;
        }
    }

    /**
     * Find or create a vtuber_groups record by name, return its id.
     */
    private async resolveGroupId(
        supabase: import('@supabase/supabase-js').SupabaseClient,
        groupName: string,
    ): Promise<string> {
        // Try to find existing group
        const { data: existing } = await supabase
            .from('vtuber_groups')
            .select('id')
            .eq('name', groupName)
            .maybeSingle();

        if (existing) return existing.id as string;

        // Create new group
        const { data: created, error } = await supabase
            .from('vtuber_groups')
            .insert({ name: groupName })
            .select('id')
            .single();

        if (error) throw error;
        return (created as { id: string }).id;
    }

    // -----------------------------------------------------------------------
    // Mock helpers
    // -----------------------------------------------------------------------

    private getVTubersMock(
        filter: VTuberFilter,
    ): { data: VTuberRecord[]; count: number } {
        let items = [...MOCK_VTUBERS];

        if (filter.nationality) {
            items = items.filter((v) => v.nationality === filter.nationality);
        }
        if (filter.groupId) {
            items = items.filter((v) => v.group_id === filter.groupId);
        }
        if (filter.activity) {
            items = items.filter((v) => v.activity === filter.activity);
        }
        if (filter.search) {
            const term = filter.search.toLowerCase();
            items = items.filter((v) => v.name.toLowerCase().includes(term));
        }

        // Sort
        const sortBy = filter.sortBy ?? 'name';
        const asc = (filter.sortOrder ?? 'asc') === 'asc';
        items.sort((a, b) => {
            let cmp = 0;
            switch (sortBy) {
                case 'youtube_subscribers':
                    cmp = (a.youtube_subscriber_count ?? 0) - (b.youtube_subscriber_count ?? 0);
                    break;
                case 'twitch_followers':
                    cmp = (a.twitch_follower_count ?? 0) - (b.twitch_follower_count ?? 0);
                    break;
                case 'debut_date':
                    cmp = (a.debut_date ?? '').localeCompare(b.debut_date ?? '');
                    break;
                case 'created_at':
                    cmp = a.created_at.localeCompare(b.created_at);
                    break;
                default:
                    cmp = a.name.localeCompare(b.name);
            }
            return asc ? cmp : -cmp;
        });

        const count = items.length;
        const page = filter.page ?? 1;
        const pageSize = filter.pageSize ?? 20;
        const start = (page - 1) * pageSize;
        items = items.slice(start, start + pageSize);

        return { data: items, count };
    }

    private getGroupsMock(nationality?: VTuberNationality): VTuberGroup[] {
        if (!nationality) return MOCK_GROUPS;
        return MOCK_GROUPS.filter((g) => g.nationality === nationality);
    }

    private getLivestreamsMock(): VTuberLivestream[] {
        return MOCK_LIVESTREAMS;
    }

    private submitContributionMock(data: SubmitContributionInput): VTuberContribution {
        const contrib: VTuberContribution = {
            id: `mock-contrib-${Date.now()}`,
            action: data.action,
            target_vtuber_id: data.targetVTuberId ?? null,
            payload: data.payload,
            status: 'pending',
            submitted_by: data.submittedBy,
            submitter_contact: data.submitterContact ?? null,
            source_urls: data.sourceUrls,
            source_note: data.sourceNote ?? null,
            reviewer_notes: null,
            reviewed_at: null,
            created_at: new Date().toISOString(),
        };
        this.mockContributions.push(contrib);
        return contrib;
    }

    private mockContributions: VTuberContribution[] = [];

    private getContributionsMock(
        filter: VTuberContributionFilter,
    ): { data: VTuberContribution[]; count: number } {
        let items = [...this.mockContributions];
        if (filter.status) {
            items = items.filter((c) => c.status === filter.status);
        }
        items.sort((a, b) => b.created_at.localeCompare(a.created_at));
        const count = items.length;
        const page = filter.page ?? 1;
        const pageSize = filter.pageSize ?? 20;
        const start = (page - 1) * pageSize;
        items = items.slice(start, start + pageSize);
        return { data: items, count };
    }
}

export const vtuberRepository = new VTuberRepository();
