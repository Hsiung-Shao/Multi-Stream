import { useTranslation } from 'react-i18next';
import { Badge } from '../../../components/ui/badge';
import { Calendar, MapPin, ExternalLink, Clock } from 'lucide-react';
import type { VTuberEvent } from '../types';

interface EventCardProps {
  event: VTuberEvent;
  onClick?: () => void;
}

const EVENT_TYPE_COLORS: Record<string, string> = {
  vtuber_event: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  livestream: 'bg-red-500/10 text-red-400 border-red-500/20',
  community: 'bg-green-500/10 text-green-400 border-green-500/20',
};

function formatEventDate(dateStr: string): string {
  const d = new Date(dateStr);
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const hours = d.getHours().toString().padStart(2, '0');
  const minutes = d.getMinutes().toString().padStart(2, '0');
  return `${month}/${day} ${hours}:${minutes}`;
}

function getEventTimeStatus(event: VTuberEvent): 'upcoming' | 'ongoing' | 'past' {
  const now = Date.now();
  const start = new Date(event.start_time).getTime();
  const end = event.end_time ? new Date(event.end_time).getTime() : start + 3600000;
  if (now < start) return 'upcoming';
  if (now <= end) return 'ongoing';
  return 'past';
}

export function EventCard({ event, onClick }: EventCardProps) {
  const { t } = useTranslation('vtuber');
  const timeStatus = getEventTimeStatus(event);

  const typeLabel = {
    vtuber_event: t('eventTypeVtuber'),
    livestream: t('eventTypeLivestream'),
    community: t('eventTypeCommunity'),
  }[event.event_type];

  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative flex flex-col gap-2.5 rounded-xl border border-border/50 bg-card p-4 text-left transition-all hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring w-full"
    >
      {/* Time status badge */}
      {timeStatus === 'ongoing' && (
        <span className="absolute top-2 right-2 flex items-center gap-1 rounded-full bg-green-500 px-2 py-0.5 text-[10px] font-bold text-white">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
          {t('eventOngoing')}
        </span>
      )}

      {/* Title */}
      <h3 className="font-semibold text-sm text-foreground line-clamp-2 pr-16">
        {event.title}
      </h3>

      {/* Type badge */}
      <Badge variant="outline" className={`text-[10px] px-1.5 py-0 w-fit ${EVENT_TYPE_COLORS[event.event_type] ?? ''}`}>
        {typeLabel}
      </Badge>

      {/* Time */}
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Clock className="w-3.5 h-3.5 shrink-0" />
        <span>{formatEventDate(event.start_time)}</span>
        {event.end_time && (
          <>
            <span>-</span>
            <span>{formatEventDate(event.end_time)}</span>
          </>
        )}
      </div>

      {/* Location */}
      {event.location && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <MapPin className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">{event.location}</span>
        </div>
      )}

      {/* VTuber + Organizer */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-auto">
        {event.vtuber && (
          <span className="flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            {event.vtuber.name}
          </span>
        )}
        {event.organizer && (
          <span className="ml-auto text-[11px] opacity-60">
            {event.organizer.display_name}
          </span>
        )}
      </div>

      {/* Hover indicator */}
      <ExternalLink className="absolute bottom-2 right-2 w-3.5 h-3.5 text-muted-foreground/0 group-hover:text-muted-foreground/50 transition-colors" />
    </button>
  );
}
