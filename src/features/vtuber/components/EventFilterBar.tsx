import { useTranslation } from 'react-i18next';
import { Button } from '../../../components/ui/button';
import type { EventType } from '../types';

interface EventFilterBarProps {
  eventType: EventType | undefined;
  onEventTypeChange: (type: EventType | undefined) => void;
}

export function EventFilterBar({ eventType, onEventTypeChange }: EventFilterBarProps) {
  const { t } = useTranslation('vtuber');

  const types: { value: EventType | undefined; label: string }[] = [
    { value: undefined, label: t('eventAll') },
    { value: 'vtuber_event', label: t('eventTypeVtuber') },
    { value: 'livestream', label: t('eventTypeLivestream') },
    { value: 'community', label: t('eventTypeCommunity') },
  ];

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {types.map(({ value, label }) => (
        <Button
          key={label}
          variant={eventType === value ? 'default' : 'outline'}
          size="sm"
          className="text-xs h-7 px-3"
          onClick={() => onEventTypeChange(value)}
        >
          {label}
        </Button>
      ))}
    </div>
  );
}
