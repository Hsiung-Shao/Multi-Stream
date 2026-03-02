import { useTranslation } from 'react-i18next';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../components/ui/select';
import { Button } from '../../../components/ui/button';
import { RotateCcw } from 'lucide-react';
import type { VTuberNationality, VTuberSortBy, VTuberGroup } from '../types';

interface VTuberFilterBarProps {
  nationality?: VTuberNationality;
  activity?: 'active' | 'graduate';
  groupId?: string;
  sortBy: VTuberSortBy;
  sortOrder: 'asc' | 'desc';
  groups: VTuberGroup[];
  onNationalityChange: (value: VTuberNationality | undefined) => void;
  onActivityChange: (value: 'active' | 'graduate' | undefined) => void;
  onGroupChange: (value: string | undefined) => void;
  onSortByChange: (value: VTuberSortBy) => void;
  onSortOrderChange: (value: 'asc' | 'desc') => void;
  onReset: () => void;
}

const NATIONALITIES: VTuberNationality[] = ['TW', 'HK', 'MY', 'JP', 'KR', 'OTHER'];

const SORT_OPTIONS: { value: VTuberSortBy; labelKey: string }[] = [
  { value: 'name', labelKey: 'sortBy' },
  { value: 'youtube_subscribers', labelKey: 'ytSubscribers' },
  { value: 'twitch_followers', labelKey: 'twitchFollowers' },
  { value: 'debut_date', labelKey: 'debutDate' },
];

export function VTuberFilterBar({
  nationality,
  activity,
  groupId,
  sortBy,
  sortOrder,
  groups,
  onNationalityChange,
  onActivityChange,
  onGroupChange,
  onSortByChange,
  onSortOrderChange,
  onReset,
}: VTuberFilterBarProps) {
  const { t } = useTranslation('vtuber');

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Region */}
      <Select
        value={nationality ?? '__all__'}
        onValueChange={(v) => onNationalityChange(v === '__all__' ? undefined : v as VTuberNationality)}
      >
        <SelectTrigger size="sm" className="w-[130px]">
          <SelectValue placeholder={t('allRegions')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">{t('allRegions')}</SelectItem>
          {NATIONALITIES.map((n) => (
            <SelectItem key={n} value={n}>{t(n.toLowerCase())}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Status */}
      <Select
        value={activity ?? '__all__'}
        onValueChange={(v) => onActivityChange(v === '__all__' ? undefined : v as 'active' | 'graduate')}
      >
        <SelectTrigger size="sm" className="w-[120px]">
          <SelectValue placeholder={t('filterByStatus')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">{t('filterByStatus')}</SelectItem>
          <SelectItem value="active">{t('active')}</SelectItem>
          <SelectItem value="graduate">{t('graduated')}</SelectItem>
        </SelectContent>
      </Select>

      {/* Group */}
      {groups.length > 0 && (
        <Select
          value={groupId ?? '__all__'}
          onValueChange={(v) => onGroupChange(v === '__all__' ? undefined : v)}
        >
          <SelectTrigger size="sm" className="w-[150px]">
            <SelectValue placeholder={t('allGroups')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">{t('allGroups')}</SelectItem>
            {groups.map((g) => (
              <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* Sort */}
      <Select value={sortBy} onValueChange={(v) => onSortByChange(v as VTuberSortBy)}>
        <SelectTrigger size="sm" className="w-[150px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {SORT_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>{t(opt.labelKey)}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Sort order toggle */}
      <Button
        variant="outline"
        size="sm"
        onClick={() => onSortOrderChange(sortOrder === 'asc' ? 'desc' : 'asc')}
        className="px-2 text-xs"
      >
        {sortOrder === 'asc' ? '↑' : '↓'}
      </Button>

      {/* Reset */}
      <Button variant="ghost" size="sm" onClick={onReset} className="gap-1 text-xs text-muted-foreground">
        <RotateCcw className="w-3 h-3" />
      </Button>
    </div>
  );
}
