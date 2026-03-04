import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { eventRepository } from '../EventRepository';
import type {
    VTuberEvent,
    EventFilter,
    CreateEventInput,
} from '../types';

// ---------------------------------------------------------------------------
// Query Keys
// ---------------------------------------------------------------------------

const EVENTS_KEY = 'vtuber-events';

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export function useEvents(filter: EventFilter) {
    return useQuery({
        queryKey: [EVENTS_KEY, filter],
        queryFn: (): Promise<{ data: VTuberEvent[]; count: number }> =>
            eventRepository.getEvents(filter),
    });
}

export function useEvent(id: string | null) {
    return useQuery({
        queryKey: [EVENTS_KEY, 'detail', id],
        queryFn: (): Promise<VTuberEvent | null> =>
            eventRepository.getEventById(id!),
        enabled: !!id,
    });
}

export function useCreateEvent() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (data: { input: CreateEventInput; userId: string }): Promise<VTuberEvent> =>
            eventRepository.createEvent(data.input, data.userId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: [EVENTS_KEY] });
        },
    });
}

export function useReviewEvent() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (data: {
            id: string;
            decision: 'approved' | 'rejected';
        }): Promise<void> =>
            eventRepository.reviewEvent(data.id, data.decision),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: [EVENTS_KEY] });
        },
    });
}
