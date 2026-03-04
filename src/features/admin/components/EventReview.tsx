import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Skeleton } from '../../../components/ui/skeleton';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../components/ui/select';
import {
  Clock,
  User,
  MapPin,
  ExternalLink,
  CheckCircle2,
  XCircle,
  Loader2,
  Inbox,
  CalendarDays,
} from 'lucide-react';
import { useEvents, useReviewEvent } from '../../vtuber/hooks/useEvents';
import type { VTuberEvent, EventFilter, EventStatus } from '../../vtuber/types';

const STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  pending: { bg: 'bg-amber-500/10', text: 'text-amber-400' },
  approved: { bg: 'bg-green-500/10', text: 'text-green-400' },
  rejected: { bg: 'bg-red-500/10', text: 'text-red-400' },
  cancelled: { bg: 'bg-zinc-500/10', text: 'text-zinc-400' },
};

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('zh-TW', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function EventReview() {
  const { t } = useTranslation('vtuber');
  const [filter, setFilter] = useState<EventFilter>({
    status: 'pending',
    page: 1,
    pageSize: 20,
  });

  const { data: result, isLoading } = useEvents(filter);
  const reviewMutation = useReviewEvent();

  const events = result?.data ?? [];

  const handleReview = async (id: string, decision: 'approved' | 'rejected') => {
    await reviewMutation.mutateAsync({ id, decision });
  };

  return (
    <div className="space-y-4">
      {/* Filter */}
      <div className="flex items-center gap-3">
        <Select
          value={filter.status ?? 'pending'}
          onValueChange={(v) => setFilter((prev) => ({ ...prev, status: v as EventStatus, page: 1 }))}
        >
          <SelectTrigger className="w-[140px] bg-zinc-900 border-zinc-800 text-zinc-200 text-xs h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="pending">{t('adminPending')}</SelectItem>
            <SelectItem value="approved">{t('adminApproved')}</SelectItem>
            <SelectItem value="rejected">{t('adminRejected')}</SelectItem>
          </SelectContent>
        </Select>

        <span className="text-xs text-zinc-500">
          {result?.count ?? 0} {t('events')}
        </span>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28 bg-zinc-900 rounded-xl" />
          ))}
        </div>
      ) : events.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-zinc-500">
          <Inbox className="w-10 h-10" />
          <span className="text-sm">{t('adminEventNoItems')}</span>
        </div>
      ) : (
        <div className="space-y-3">
          {events.map((event) => (
            <EventReviewCard
              key={event.id}
              event={event}
              onReview={handleReview}
              isReviewing={reviewMutation.isPending}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function EventReviewCard({
  event,
  onReview,
  isReviewing,
}: {
  event: VTuberEvent;
  onReview: (id: string, decision: 'approved' | 'rejected') => void;
  isReviewing: boolean;
}) {
  const { t } = useTranslation('vtuber');
  const statusStyle = STATUS_STYLES[event.status] ?? STATUS_STYLES.pending;
  const statusLabels: Record<string, string> = {
    pending: t('adminPending'),
    approved: t('adminApproved'),
    rejected: t('adminRejected'),
    cancelled: t('adminRejected'),
  };
  const typeLabels: Record<string, string> = {
    vtuber_event: t('eventTypeVtuber'),
    livestream: t('eventTypeLivestream'),
    community: t('eventTypeCommunity'),
  };

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-zinc-100 truncate">{event.title}</h3>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="outline" className="text-[10px]">
              {typeLabels[event.event_type] ?? event.event_type}
            </Badge>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${statusStyle.bg} ${statusStyle.text}`}>
              {statusLabels[event.status] ?? event.status}
            </span>
          </div>
        </div>
      </div>

      {/* Info */}
      <div className="space-y-1.5 text-xs text-zinc-400">
        <div className="flex items-center gap-1.5">
          <CalendarDays className="w-3.5 h-3.5 shrink-0" />
          <span>{formatDateTime(event.start_time)}</span>
          {event.end_time && <span>~ {formatDateTime(event.end_time)}</span>}
        </div>
        {event.location && (
          <div className="flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5 shrink-0" />
            <span>{event.location}</span>
          </div>
        )}
        {event.organizer && (
          <div className="flex items-center gap-1.5">
            <User className="w-3.5 h-3.5 shrink-0" />
            <span>{t('adminEventOrganizer')}: {event.organizer.display_name}</span>
          </div>
        )}
        {event.url && (
          <div className="flex items-center gap-1.5">
            <ExternalLink className="w-3.5 h-3.5 shrink-0" />
            <a href={event.url} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline truncate">
              {event.url}
            </a>
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5 shrink-0" />
          <span>{formatDateTime(event.created_at)}</span>
        </div>
      </div>

      {event.description && (
        <p className="text-xs text-zinc-400 line-clamp-2">{event.description}</p>
      )}

      {/* Actions */}
      {event.status === 'pending' && (
        <div className="flex items-center gap-2 pt-1">
          <Button
            size="sm"
            className="gap-1.5 text-xs bg-green-600 hover:bg-green-500 h-7"
            onClick={() => onReview(event.id, 'approved')}
            disabled={isReviewing}
          >
            {isReviewing ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
            {t('adminEventApprove')}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 text-xs border-red-500/30 text-red-400 hover:bg-red-500/10 h-7"
            onClick={() => onReview(event.id, 'rejected')}
            disabled={isReviewing}
          >
            <XCircle className="w-3 h-3" />
            {t('adminEventReject')}
          </Button>
        </div>
      )}
    </div>
  );
}
