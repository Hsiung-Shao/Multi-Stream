import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { vtuberRepository } from '../VTuberRepository';
import type {
    VTuberRecord,
    VTuberGroup,
    VTuberLivestream,
    VTuberContribution,
    VTuberFilter,
    VTuberNationality,
    VTuberContributionFilter,
    SubmitContributionInput,
} from '../types';

// ---------------------------------------------------------------------------
// Query Keys
// ---------------------------------------------------------------------------

const VTUBERS_KEY = 'vtubers';
const GROUPS_KEY = 'vtuber-groups';
const LIVESTREAMS_KEY = 'vtuber-livestreams';
const CONTRIBUTIONS_KEY = 'vtuber-contributions';

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export function useVTubers(filter: VTuberFilter) {
    return useQuery({
        queryKey: [VTUBERS_KEY, filter],
        queryFn: (): Promise<{ data: VTuberRecord[]; count: number }> =>
            vtuberRepository.getVTubers(filter),
    });
}

export function useVTuberGroups(nationality?: VTuberNationality) {
    return useQuery({
        queryKey: [GROUPS_KEY, nationality],
        queryFn: (): Promise<VTuberGroup[]> =>
            vtuberRepository.getGroups(nationality),
    });
}

export function useVTuberLivestreams() {
    return useQuery({
        queryKey: [LIVESTREAMS_KEY],
        queryFn: (): Promise<VTuberLivestream[]> =>
            vtuberRepository.getLivestreams(),
        refetchInterval: 60_000,
    });
}

export function useSubmitContribution() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (data: SubmitContributionInput): Promise<VTuberContribution> =>
            vtuberRepository.submitContribution(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: [CONTRIBUTIONS_KEY] });
        },
    });
}

// ---------------------------------------------------------------------------
// Admin hooks
// ---------------------------------------------------------------------------

export function useVTuberContributions(filter: VTuberContributionFilter) {
    return useQuery({
        queryKey: [CONTRIBUTIONS_KEY, filter],
        queryFn: (): Promise<{ data: VTuberContribution[]; count: number }> =>
            vtuberRepository.getContributions(filter),
    });
}

export function useReviewContribution() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (data: {
            id: string;
            decision: 'approved' | 'rejected';
            reviewerNotes?: string;
        }): Promise<void> =>
            vtuberRepository.reviewContribution(data.id, data.decision, data.reviewerNotes),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: [CONTRIBUTIONS_KEY] });
            queryClient.invalidateQueries({ queryKey: [VTUBERS_KEY] });
        },
    });
}
