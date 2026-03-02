import { useState, useCallback, useMemo } from 'react';
import type { VTuberFilter, VTuberNationality, VTuberSortBy } from '../types';

export function useVTuberFilters(initial?: Partial<VTuberFilter>) {
    const [nationality, setNationalityRaw] = useState<VTuberNationality | undefined>(
        initial?.nationality,
    );
    const [groupId, setGroupIdRaw] = useState<string | undefined>(initial?.groupId);
    const [activity, setActivityRaw] = useState<'active' | 'graduate' | undefined>(
        initial?.activity,
    );
    const [search, setSearchRaw] = useState(initial?.search ?? '');
    const [sortBy, setSortByRaw] = useState<VTuberSortBy>(initial?.sortBy ?? 'name');
    const [sortOrder, setSortOrderRaw] = useState<'asc' | 'desc'>(
        initial?.sortOrder ?? 'asc',
    );
    const [page, setPage] = useState(initial?.page ?? 1);
    const [pageSize, setPageSize] = useState(initial?.pageSize ?? 20);

    const filter: VTuberFilter = useMemo(
        () => ({
            ...(nationality ? { nationality } : {}),
            ...(groupId ? { groupId } : {}),
            ...(activity ? { activity } : {}),
            ...(search ? { search } : {}),
            sortBy,
            sortOrder,
            page,
            pageSize,
        }),
        [nationality, groupId, activity, search, sortBy, sortOrder, page, pageSize],
    );

    // Setters that auto-reset page to 1
    const setNationality = useCallback((value: VTuberNationality | undefined) => {
        setNationalityRaw(value);
        setPage(1);
    }, []);

    const setGroupId = useCallback((value: string | undefined) => {
        setGroupIdRaw(value);
        setPage(1);
    }, []);

    const setActivity = useCallback((value: 'active' | 'graduate' | undefined) => {
        setActivityRaw(value);
        setPage(1);
    }, []);

    const setSearch = useCallback((value: string) => {
        setSearchRaw(value);
        setPage(1);
    }, []);

    const setSortBy = useCallback((value: VTuberSortBy) => {
        setSortByRaw(value);
        setPage(1);
    }, []);

    const setSortOrder = useCallback((value: 'asc' | 'desc') => {
        setSortOrderRaw(value);
        setPage(1);
    }, []);

    const resetFilters = useCallback(() => {
        setNationalityRaw(undefined);
        setGroupIdRaw(undefined);
        setActivityRaw(undefined);
        setSearchRaw('');
        setSortByRaw('name');
        setSortOrderRaw('asc');
        setPage(1);
        setPageSize(20);
    }, []);

    return {
        filter,

        // Individual values (for binding to UI controls)
        nationality,
        groupId,
        activity,
        search,
        sortBy,
        sortOrder,
        page,
        pageSize,

        // Setters that auto-reset page to 1
        setNationality,
        setGroupId,
        setActivity,
        setSearch,
        setSortBy,
        setSortOrder,

        // Page controls (no auto-reset)
        setPage,
        setPageSize,

        resetFilters,
    };
}
