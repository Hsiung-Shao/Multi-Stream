import { getSupabase } from '../../lib/supabase';
import type {
    VTuberEvent,
    EventFilter,
    EventStatus,
    CreateEventInput,
} from './types';

// ---------------------------------------------------------------------------
// Mock Data
// ---------------------------------------------------------------------------

const MOCK_EVENTS: VTuberEvent[] = [
    {
        id: 'evt-1',
        title: 'hololive 3rd fes.',
        description: 'hololive SUPER EXPO 2024 & hololive 5th fes.',
        event_type: 'vtuber_event',
        vtuber_id: null,
        organizer_id: 'mock-user-1',
        start_time: new Date(Date.now() + 7 * 86400000).toISOString(),
        end_time: new Date(Date.now() + 9 * 86400000).toISOString(),
        location: '幕張メッセ',
        url: 'https://hololivesuperexpo2024.hololivepro.com/',
        image_url: null,
        status: 'approved',
        metadata: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        organizer: { display_name: 'Admin' },
    },
    {
        id: 'evt-2',
        title: '杏仁ミル 歌回',
        description: '週末歌回直播',
        event_type: 'livestream',
        vtuber_id: 'v2',
        organizer_id: 'mock-user-2',
        start_time: new Date(Date.now() + 2 * 86400000).toISOString(),
        end_time: null,
        location: null,
        url: 'https://www.youtube.com/watch?v=mock',
        image_url: null,
        status: 'approved',
        metadata: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        organizer: { display_name: 'User2' },
    },
];

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

class EventRepository {
    /**
     * 取得活動列表（含分頁 & 篩選）
     */
    async getEvents(
        filter: EventFilter = {},
    ): Promise<{ data: VTuberEvent[]; count: number }> {
        try {
            const supabase = await getSupabase();
            if (!supabase) return this.getEventsMock(filter);

            let query = supabase
                .from('vtuber_events')
                .select('*, vtubers(*), user_profiles!vtuber_events_organizer_id_fkey(display_name, avatar_url)', { count: 'exact' })
                .order('start_time', { ascending: true });

            if (filter.event_type) {
                query = query.eq('event_type', filter.event_type);
            }
            if (filter.status) {
                query = query.eq('status', filter.status);
            }
            if (filter.vtuber_id) {
                query = query.eq('vtuber_id', filter.vtuber_id);
            }
            if (filter.from) {
                query = query.gte('start_time', filter.from);
            }
            if (filter.to) {
                query = query.lte('start_time', filter.to);
            }

            const page = filter.page ?? 1;
            const pageSize = filter.pageSize ?? 20;
            const from = (page - 1) * pageSize;
            const to = from + pageSize - 1;
            query = query.range(from, to);

            const { data, error, count } = await query;
            if (error) throw error;

            const events: VTuberEvent[] = (data ?? []).map((row: Record<string, unknown>) => ({
                ...(row as unknown as VTuberEvent),
                vtuber: (row.vtubers as VTuberEvent['vtuber']) ?? undefined,
                organizer: (row.user_profiles as VTuberEvent['organizer']) ?? undefined,
            }));

            return { data: events, count: count ?? 0 };
        } catch {
            console.warn('EventRepository.getEvents: falling back to mock data');
            return this.getEventsMock(filter);
        }
    }

    /**
     * 取得單一活動
     */
    async getEventById(id: string): Promise<VTuberEvent | null> {
        try {
            const supabase = await getSupabase();
            if (!supabase) return MOCK_EVENTS.find((e) => e.id === id) ?? null;

            const { data, error } = await supabase
                .from('vtuber_events')
                .select('*, vtubers(*), user_profiles!vtuber_events_organizer_id_fkey(display_name, avatar_url)')
                .eq('id', id)
                .single();

            if (error) throw error;
            if (!data) return null;

            const row = data as Record<string, unknown>;
            return {
                ...(row as unknown as VTuberEvent),
                vtuber: (row.vtubers as VTuberEvent['vtuber']) ?? undefined,
                organizer: (row.user_profiles as VTuberEvent['organizer']) ?? undefined,
            };
        } catch {
            console.warn('EventRepository.getEventById: falling back to mock');
            return MOCK_EVENTS.find((e) => e.id === id) ?? null;
        }
    }

    /**
     * 建立活動（需登入）— 走 Function /api/vtuber-event-create
     */
    async createEvent(input: CreateEventInput, userId: string): Promise<VTuberEvent> {
        const { createVTuberEvent } = await import('./apiClient');
        const result = await createVTuberEvent({
            title: input.title,
            description: input.description,
            eventType: input.event_type,
            vtuberId: input.vtuber_id,
            startTime: input.start_time,
            endTime: input.end_time,
            location: input.location,
            url: input.url,
            imageUrl: input.image_url,
        });
        return {
            id: result.id ?? '',
            title: input.title,
            description: input.description ?? null,
            event_type: input.event_type,
            vtuber_id: input.vtuber_id ?? null,
            organizer_id: userId,
            start_time: input.start_time,
            end_time: input.end_time ?? null,
            location: input.location ?? null,
            url: input.url ?? null,
            image_url: input.image_url ?? null,
            status: 'pending',
            metadata: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        } as VTuberEvent;
    }

    /**
     * 審核活動（Admin 用）— 走 Function /api/admin/review-event
     */
    async reviewEvent(
        id: string,
        decision: 'approved' | 'rejected',
    ): Promise<void> {
        const { reviewVTuberEvent } = await import('./apiClient');
        await reviewVTuberEvent({
            id,
            action: decision === 'approved' ? 'approve' : 'reject',
        });
    }

    // -----------------------------------------------------------------------
    // Mock helpers
    // -----------------------------------------------------------------------

    private getEventsMock(
        filter: EventFilter,
    ): { data: VTuberEvent[]; count: number } {
        let items = [...MOCK_EVENTS, ...this.mockCreated];

        if (filter.event_type) {
            items = items.filter((e) => e.event_type === filter.event_type);
        }
        if (filter.status) {
            items = items.filter((e) => e.status === filter.status);
        }
        if (filter.vtuber_id) {
            items = items.filter((e) => e.vtuber_id === filter.vtuber_id);
        }

        items.sort((a, b) => a.start_time.localeCompare(b.start_time));

        const count = items.length;
        const page = filter.page ?? 1;
        const pageSize = filter.pageSize ?? 20;
        const start = (page - 1) * pageSize;
        items = items.slice(start, start + pageSize);

        return { data: items, count };
    }

    private mockCreated: VTuberEvent[] = [];

    private createEventMock(input: CreateEventInput, userId: string): VTuberEvent {
        const event: VTuberEvent = {
            id: `mock-evt-${Date.now()}`,
            title: input.title,
            description: input.description ?? null,
            event_type: input.event_type,
            vtuber_id: input.vtuber_id ?? null,
            organizer_id: userId,
            start_time: input.start_time,
            end_time: input.end_time ?? null,
            location: input.location ?? null,
            url: input.url ?? null,
            image_url: input.image_url ?? null,
            status: 'pending',
            metadata: {},
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        };
        this.mockCreated.push(event);
        return event;
    }
}

export const eventRepository = new EventRepository();
