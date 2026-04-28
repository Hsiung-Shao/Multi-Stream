import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useEvents } from '../hooks/useEvents';
import { EventCard } from './EventCard';
import { EventFilterBar } from './EventFilterBar';
import { EventDetailSheet } from './EventDetailSheet';
import { Loader2 } from 'lucide-react';
import { logEvent } from '../../../utils/analytics';
import type { VTuberEvent, EventType } from '../types';

export function EventCalendarView() {
  const { t } = useTranslation('vtuber');
  const [eventType, setEventType] = useState<EventType | undefined>(undefined);
  const [selectedEvent, setSelectedEvent] = useState<VTuberEvent | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const { data: result, isLoading } = useEvents({
    event_type: eventType,
    status: 'approved',
    pageSize: 50,
  });

  const events = result?.data ?? [];

  const handleEventClick = (event: VTuberEvent) => {
    setSelectedEvent(event);
    setDetailOpen(true);
    logEvent('VTuber', 'event_detail', event.title);
  };

  return (
    <div className="space-y-4">
      <EventFilterBar
        eventType={eventType}
        onEventTypeChange={setEventType}
      />

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : events.length === 0 ? (
        <div className="text-center py-12 text-sm text-muted-foreground">
          {t('eventNoResults')}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {events.map((event) => (
            <EventCard
              key={event.id}
              event={event}
              onClick={() => handleEventClick(event)}
            />
          ))}
        </div>
      )}

      <EventDetailSheet
        event={selectedEvent}
        open={detailOpen}
        onOpenChange={setDetailOpen}
      />
    </div>
  );
}
