import { useTranslation } from 'react-i18next';
import { Skeleton } from '../../../components/ui/skeleton';
import { Button } from '../../../components/ui/button';
import { ChevronLeft, ChevronRight, SearchX } from 'lucide-react';
import { VTuberCard } from './VTuberCard';
import type { VTuberRecord } from '../types';

interface VTuberGridProps {
  vtubers: VTuberRecord[];
  totalCount: number;
  page: number;
  pageSize: number;
  isLoading: boolean;
  liveVTuberIds?: Set<string>;
  onPageChange: (page: number) => void;
  onVTuberClick: (vtuber: VTuberRecord) => void;
}

export function VTuberGrid({
  vtubers,
  totalCount,
  page,
  pageSize,
  isLoading,
  liveVTuberIds,
  onPageChange,
  onVTuberClick,
}: VTuberGridProps) {
  const { t } = useTranslation('vtuber');
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
        {Array.from({ length: 12 }).map((_, i) => (
          <div
            key={i}
            style={{ animationDelay: `${i * 30}ms` }}
            className="animate-fade-in-up flex flex-col items-center gap-3 rounded-xl border border-border/50 bg-card p-4"
          >
            <Skeleton className="w-16 h-16 rounded-full" />
            <Skeleton className="w-20 h-4 rounded" />
            <Skeleton className="w-14 h-3 rounded" />
            <div className="flex gap-2">
              <Skeleton className="w-10 h-4 rounded" />
              <Skeleton className="w-10 h-4 rounded" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (vtubers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
        <SearchX className="w-12 h-12 opacity-40" />
        <p className="text-sm">{t('noResults')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Count */}
      <p className="text-xs text-muted-foreground">
        {t('vtuberCount', { count: totalCount })}
      </p>

      {/* Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
        {vtubers.map((v, i) => (
          <VTuberCard
            key={v.id}
            vtuber={v}
            isLive={liveVTuberIds?.has(v.id)}
            onClick={() => onVTuberClick(v)}
            index={i}
          />
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-sm text-muted-foreground tabular-nums">
            {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
