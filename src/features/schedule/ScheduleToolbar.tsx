// 篩選工具列：範圍、地區、平台是一鍵切換的膠囊；「所屬」項目多，維持下拉（只列企業勢，見 filters.listGroups）。
// 選了特定企業勢時不套地區（見 filters.filterStreams），地區膠囊一併停用。
// 捲動時固定在頁首下方（StaticPageHeader 高 61px）。
// 手機上所有控制排成單行、可橫向滑動，避免固定列疊成三行吃掉半個螢幕。

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Heart, Search, X } from 'lucide-react';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from '../../components/ui/select';
import { cn } from '../../components/ui/utils';
import { GROUP_ANY_AGENCY, GROUP_NO_AGENCY, type NationalityFilter, type PlatformFilter, type ScheduleFilterState } from './types';
import { isSpecificAgency, type AgencyOption } from './filters';

const NATIONALITIES: NationalityFilter[] = ['TW', 'HK', 'MY', 'JP', 'OTHER', 'all'];
const PLATFORMS: PlatformFilter[] = ['all', 'youtube', 'twitch'];

interface ScheduleToolbarProps {
    value: ScheduleFilterState;
    groups: AgencyOption[];
    onChange: (key: keyof ScheduleFilterState, value: string) => void;
    /** 週表內搜尋：送出 debounce 後的值（清空立即送出） */
    onQueryChange: (q: string) => void;
    /** 目前是否套用中的搜尋字（由上層以同一個值判斷，停用地區與所屬時不會和列表不同步） */
    searching: boolean;
}

const SEARCH_DEBOUNCE_MS = 150;

/**
 * 週表內搜尋框：名字、團體、所屬、標題、遊戲；Esc 清空。
 * 即時輸入值只存在這裡：每個按鍵只重畫搜尋框，150ms 沒再打字才把值送到週表（數百張卡才重算一次）。
 */
function SearchField({ onChange }: { onChange: (q: string) => void }) {
    const { t } = useTranslation('schedule');
    const [value, setValue] = useState('');
    useEffect(() => {
        const id = setTimeout(() => onChange(value), value ? SEARCH_DEBOUNCE_MS : 0);
        return () => clearTimeout(id);
    }, [value, onChange]);
    const set = (v: string) => setValue(v);
    return (
        <div className="relative shrink-0">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <input
                type="search"
                value={value}
                onChange={(e) => set(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === 'Escape' && value) {
                        e.preventDefault();
                        set('');
                    }
                }}
                placeholder={t('search.placeholder')}
                aria-label={t('search.label')}
                className={cn(
                    'h-8 w-40 rounded-full border border-border bg-background pl-8 pr-7 text-[13px] text-foreground placeholder:text-muted-foreground sm:w-56',
                    'transition-[border-color,box-shadow] duration-150 focus-visible:border-foreground/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    '[&::-webkit-search-cancel-button]:hidden',
                )}
            />
            {value && (
                <button
                    type="button"
                    onClick={() => set('')}
                    aria-label={t('search.clear')}
                    className="absolute right-1 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-full text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                    <X size={13} aria-hidden="true" />
                </button>
            )}
        </div>
    );
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

export function ScheduleToolbar({ value, groups, onChange, onQueryChange, searching }: ScheduleToolbarProps) {
    const { t } = useTranslation('schedule');
    const favorites = value.scope === 'favorites';
    const agencyPicked = isSpecificAgency(value.group);
    const active = groups.filter((g) => g.count > 0);
    const idle = groups.filter((g) => g.count === 0);
    // 有搜尋字時不套地區與所屬（見 filters.filterStreams），控制項一併停用避免誤會

    return (
        <div className="sticky top-[61px] z-30 -mx-4 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85 sm:-mx-6">
            <div className="flex items-center gap-3 overflow-x-auto px-4 py-2.5 [scrollbar-width:none] sm:px-6 lg:overflow-visible [&::-webkit-scrollbar]:hidden">
                <SearchField onChange={onQueryChange} />

                <Divider />

                <div role="radiogroup" aria-label={t('scope.label')} className="flex shrink-0 items-center gap-1">
                    <Pill active={!favorites} onClick={() => onChange('scope', 'all')}>{t('scope.all')}</Pill>
                    <Pill active={favorites} onClick={() => onChange('scope', 'favorites')}>
                        <Heart size={13} aria-hidden="true" className={favorites ? 'fill-current' : undefined} />
                        {t('scope.favorites')}
                    </Pill>
                </div>

                <Divider />

                {/* 收藏範圍、選了特定企業勢時不套地區篩選（見 filters.ts），膠囊一併停用避免誤會 */}
                <div
                    role="radiogroup"
                    aria-label={t('filter.nationality')}
                    title={agencyPicked ? t('filter.nationalityOffForAgency') : undefined}
                    className="flex shrink-0 items-center gap-1"
                >
                    {NATIONALITIES.map((n) => (
                        // 選了公司時實際顯示所有地區：反白「全部地區」，不反白原本存的地區，避免誤以為只看台灣
                        <Pill
                            key={n}
                            active={agencyPicked ? n === 'all' : value.nationality === n}
                            disabled={favorites || searching || agencyPicked}
                            onClick={() => onChange('nationality', n)}
                        >
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

                <Select value={value.group} onValueChange={(v: string) => onChange('group', v)} disabled={searching}>
                    <SelectTrigger size="sm" className="h-8 w-[9.5rem] shrink-0 rounded-full text-[13px]" aria-label={t('filter.group')}>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">{t('group.all')}</SelectItem>
                        <SelectItem value={GROUP_ANY_AGENCY}>{t('group.agencyAll')}</SelectItem>
                        <SelectItem value={GROUP_NO_AGENCY}>{t('group.indie')}</SelectItem>
                        {active.length > 0 && <SelectSeparator />}
                        {active.map((g) => (
                            <SelectItem key={g.name} value={g.name}>{g.name}</SelectItem>
                        ))}
                        {/* 本週沒有場次的公司仍可選（看成員名冊），另列一組 */}
                        {idle.length > 0 && (
                            <>
                                <SelectSeparator />
                                <SelectGroup>
                                    <SelectLabel className="text-xs text-muted-foreground">{t('group.noStreams')}</SelectLabel>
                                    {idle.map((g) => (
                                        <SelectItem key={g.name} value={g.name}>{g.name}</SelectItem>
                                    ))}
                                </SelectGroup>
                            </>
                        )}
                    </SelectContent>
                </Select>
            </div>
        </div>
    );
}
