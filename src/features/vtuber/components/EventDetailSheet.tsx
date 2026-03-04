import { useTranslation } from 'react-i18next';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '../../../components/ui/sheet';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { Calendar, MapPin, Clock, ExternalLink, User } from 'lucide-react';
import type { VTuberEvent } from '../types';

interface EventDetailSheetProps {
  event: VTuberEvent | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const EVENT_TYPE_COLORS: Record<string, string> = {
  vtuber_event: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  livestream: 'bg-red-500/10 text-red-400 border-red-500/20',
  community: 'bg-green-500/10 text-green-400 border-green-500/20',
};

function formatDateTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function EventDetailSheet({ event, open, onOpenChange }: EventDetailSheetProps) {
  const { t } = useTranslation('vtuber');

  if (!event) return null;

  const typeLabel = {
    vtuber_event: t('eventTypeVtuber'),
    livestream: t('eventTypeLivestream'),
    community: t('eventTypeCommunity'),
  }[event.event_type];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-left">{event.title}</SheetTitle>
        </SheetHeader>

        <div className="flex flex-col gap-4 pt-4">
          {/* Type badge */}
          <Badge variant="outline" className={`w-fit text-xs ${EVENT_TYPE_COLORS[event.event_type] ?? ''}`}>
            {typeLabel}
          </Badge>

          {/* Description */}
          {event.description && (
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">
              {event.description}
            </p>
          )}

          {/* Time */}
          <div className="flex items-start gap-2 text-sm">
            <Clock className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
            <div>
              <p>{formatDateTime(event.start_time)}</p>
              {event.end_time && (
                <p className="text-muted-foreground">~ {formatDateTime(event.end_time)}</p>
              )}
            </div>
          </div>

          {/* Location */}
          {event.location && (
            <div className="flex items-center gap-2 text-sm">
              <MapPin className="w-4 h-4 text-muted-foreground shrink-0" />
              <span>{event.location}</span>
            </div>
          )}

          {/* Related VTuber */}
          {event.vtuber && (
            <div className="flex items-center gap-2 text-sm">
              <Calendar className="w-4 h-4 text-muted-foreground shrink-0" />
              <span>{event.vtuber.name}</span>
            </div>
          )}

          {/* Organizer */}
          {event.organizer && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <User className="w-4 h-4 shrink-0" />
              <span>{event.organizer.display_name}</span>
            </div>
          )}

          {/* Event image */}
          {event.image_url && (
            <img
              src={event.image_url}
              alt={event.title}
              className="w-full rounded-lg object-cover max-h-48"
              loading="lazy"
            />
          )}

          {/* Event URL */}
          {event.url && (
            <Button
              variant="outline"
              className="w-full gap-2"
              onClick={() => window.open(event.url!, '_blank', 'noopener,noreferrer')}
            >
              <ExternalLink className="w-4 h-4" />
              {t('eventUrl')}
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
