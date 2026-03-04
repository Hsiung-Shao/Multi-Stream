import { useTranslation } from 'react-i18next';
import { Badge } from '../../../components/ui/badge';
import { Youtube, Twitch, ExternalLink } from 'lucide-react';
import type { VTuberRecord } from '../types';

interface VTuberCardProps {
  vtuber: VTuberRecord;
  isLive?: boolean;
  onClick?: () => void;
}

function formatCount(count: number | null): string {
  if (count == null) return '-';
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return count.toString();
}

export function VTuberCard({ vtuber, isLive, onClick }: VTuberCardProps) {
  const { t } = useTranslation('vtuber');

  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative flex flex-col items-center gap-3 rounded-xl border border-border/50 bg-card p-4 text-left transition-all hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {/* Live badge */}
      {isLive && (
        <span className="absolute top-2 right-2 flex items-center gap-1 rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-bold text-white">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
          LIVE
        </span>
      )}

      {/* Avatar */}
      <div className="relative w-16 h-16 rounded-full overflow-hidden bg-muted shrink-0 ring-2 ring-border group-hover:ring-primary/30 transition-all">
        {vtuber.img_url ? (
          <img
            src={vtuber.img_url}
            alt={vtuber.name}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-lg font-bold text-muted-foreground">
            {vtuber.name.charAt(0)}
          </div>
        )}
      </div>

      {/* Name */}
      <div className="text-center min-w-0 w-full h-9">
        <h3 className="font-semibold text-sm text-foreground truncate">{vtuber.name}</h3>
        {vtuber.group_name && (
          <p className="text-xs text-muted-foreground truncate mt-0.5">{vtuber.group_name}</p>
        )}
      </div>

      {/* Badges row */}
      <div className="flex items-center gap-1.5 flex-wrap justify-center">
        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
          {t(vtuber.nationality.toLowerCase())}
        </Badge>
        {vtuber.activity === 'graduate' && (
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
            {t('graduated')}
          </Badge>
        )}
      </div>

      {/* Platform stats */}
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        {vtuber.youtube_channel_id && (
          <span className="flex items-center gap-1">
            <Youtube className="w-3.5 h-3.5 text-red-500" />
            {formatCount(vtuber.youtube_subscriber_count)}
          </span>
        )}
        {vtuber.twitch_channel_id && (
          <span className="flex items-center gap-1">
            <Twitch className="w-3.5 h-3.5 text-purple-500" />
            {formatCount(vtuber.twitch_follower_count)}
          </span>
        )}
      </div>

      {/* Hover indicator */}
      <ExternalLink className="absolute bottom-2 right-2 w-3.5 h-3.5 text-muted-foreground/0 group-hover:text-muted-foreground/50 transition-colors" />
    </button>
  );
}
