import { useTranslation } from 'react-i18next';
import { Heart, Users } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { cn } from '../../components/ui/utils';
import type { NationalityFilter, PlatformFilter, ScheduleFilterState } from './types';

const NATIONALITIES: NationalityFilter[] = ['all', 'TW', 'HK', 'MY', 'JP', 'OTHER'];
const PLATFORMS: PlatformFilter[] = ['all', 'youtube', 'twitch'];

interface ScheduleFiltersProps {
    value: ScheduleFilterState;
    groups: string[];
    onChange: (key: keyof ScheduleFilterState, value: string) => void;
}

export function ScheduleFilters({ value, groups, onChange }: ScheduleFiltersProps) {
    const { t } = useTranslation('schedule');
    const scopeBtn = (scope: 'all' | 'favorites', Icon: typeof Users, label: string) => (
        <button
            type="button"
            role="radio"
            aria-checked={value.scope === scope}
            onClick={() => onChange('scope', scope)}
            className={cn(
                'inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-colors',
                value.scope === scope ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
            )}
        >
            <Icon size={15} aria-hidden="true" />
            {label}
        </button>
    );

    return (
        <div className="flex flex-wrap items-center gap-2">
            <div role="radiogroup" aria-label={t('scope.label')} className="inline-flex rounded-xl bg-muted p-1">
                {scopeBtn('all', Users, t('scope.all'))}
                {scopeBtn('favorites', Heart, t('scope.favorites'))}
            </div>

            {/* 收藏範圍不套地區篩選（見 filters.ts），選單一併停用避免誤會 */}
            <Select value={value.nationality} onValueChange={(v: string) => onChange('nationality', v)} disabled={value.scope === 'favorites'}>
                <SelectTrigger className="h-9 w-[8.5rem]" aria-label={t('filter.nationality')}>
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    {NATIONALITIES.map((n) => (
                        <SelectItem key={n} value={n}>{t(`nationality.${n}` as 'nationality.all')}</SelectItem>
                    ))}
                </SelectContent>
            </Select>

            <Select value={value.group} onValueChange={(v: string) => onChange('group', v)}>
                <SelectTrigger className="h-9 w-[10rem]" aria-label={t('filter.group')}>
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="all">{t('group.all')}</SelectItem>
                    {groups.map((g) => (
                        <SelectItem key={g} value={g}>{g}</SelectItem>
                    ))}
                </SelectContent>
            </Select>

            <Select value={value.platform} onValueChange={(v: string) => onChange('platform', v)}>
                <SelectTrigger className="h-9 w-[8.5rem]" aria-label={t('filter.platform')}>
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    {PLATFORMS.map((p) => (
                        <SelectItem key={p} value={p}>{t(`platform.${p}` as 'platform.all')}</SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
    );
}
