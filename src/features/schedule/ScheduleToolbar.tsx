// 篩選工具列：範圍、地區、平台是一鍵切換的膠囊；團體項目多，維持下拉。
// 捲動時固定在頁首下方（StaticPageHeader 高 61px）。
// 手機上所有控制排成單行、可橫向滑動，避免固定列疊成三行吃掉半個螢幕。

import { useTranslation } from 'react-i18next';
import { Heart } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { cn } from '../../components/ui/utils';
import type { NationalityFilter, PlatformFilter, ScheduleFilterState } from './types';

const NATIONALITIES: NationalityFilter[] = ['TW', 'HK', 'MY', 'JP', 'OTHER', 'all'];
const PLATFORMS: PlatformFilter[] = ['all', 'youtube', 'twitch'];

interface ScheduleToolbarProps {
    value: ScheduleFilterState;
    groups: string[];
    onChange: (key: keyof ScheduleFilterState, value: string) => void;
}

function Pill({ active, disabled, onClick, children }: { active: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
    return (
        <button
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={onClick}
            className={cn(
                'inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-[13px] font-medium transition-colors duration-150',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                'disabled:cursor-not-allowed disabled:opacity-40',
                active ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground',
            )}
        >
            {children}
        </button>
    );
}

const Divider = () => <span className="h-5 w-px shrink-0 bg-border" aria-hidden="true" />;

export function ScheduleToolbar({ value, groups, onChange }: ScheduleToolbarProps) {
    const { t } = useTranslation('schedule');
    const favorites = value.scope === 'favorites';

    return (
        <div className="sticky top-[61px] z-30 -mx-4 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85 sm:-mx-6">
            <div className="flex items-center gap-3 overflow-x-auto px-4 py-2.5 [scrollbar-width:none] sm:px-6 lg:overflow-visible [&::-webkit-scrollbar]:hidden">
                <div role="radiogroup" aria-label={t('scope.label')} className="flex shrink-0 items-center gap-1">
                    <Pill active={!favorites} onClick={() => onChange('scope', 'all')}>{t('scope.all')}</Pill>
                    <Pill active={favorites} onClick={() => onChange('scope', 'favorites')}>
                        <Heart size={13} aria-hidden="true" className={favorites ? 'fill-current' : undefined} />
                        {t('scope.favorites')}
                    </Pill>
                </div>

                <Divider />

                {/* 收藏範圍不套地區篩選（見 filters.ts），膠囊一併停用避免誤會 */}
                <div role="radiogroup" aria-label={t('filter.nationality')} className="flex shrink-0 items-center gap-1">
                    {NATIONALITIES.map((n) => (
                        <Pill key={n} active={value.nationality === n} disabled={favorites} onClick={() => onChange('nationality', n)}>
                            {t(`nationality.${n}` as 'nationality.all')}
                        </Pill>
                    ))}
                </div>

                <Divider />

                <div role="radiogroup" aria-label={t('filter.platform')} className="flex shrink-0 items-center gap-1 lg:ml-auto">
                    {PLATFORMS.map((p) => (
                        <Pill key={p} active={value.platform === p} onClick={() => onChange('platform', p)}>
                            {t(`platform.${p}` as 'platform.all')}
                        </Pill>
                    ))}
                </div>

                <Select value={value.group} onValueChange={(v: string) => onChange('group', v)}>
                    <SelectTrigger size="sm" className="h-8 w-[9.5rem] shrink-0 rounded-full text-[13px]" aria-label={t('filter.group')}>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">{t('group.all')}</SelectItem>
                        {groups.map((g) => (
                            <SelectItem key={g} value={g}>{g}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
        </div>
    );
}
