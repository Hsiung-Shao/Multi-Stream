import { useTranslation } from 'react-i18next';
import { Badge } from '../../../components/ui/badge';
import { Youtube, Twitch, ExternalLink } from 'lucide-react';
import type { VTuberRecord } from '../types';

interface VTuberCardProps {
  vtuber: VTuberRecord;
  isLive?: boolean;
  onClick?: () => void;
  /** 用於 stagger animation 的 index（卡片進場 delay = index × 30ms） */
  index?: number;
}

function formatCount(count: number | null): string {
  if (count == null) return '-';
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return count.toString();
}

export function VTuberCard({ vtuber, isLive, onClick, index = 0 }: VTuberCardProps) {
  const { t } = useTranslation('vtuber');

  // 卡片進場動畫 delay：前 24 張依序 stagger，之後一律 720ms（避免換頁時等太久）
  const animationDelay = Math.min(index, 24) * 30;

  return (
    <button
      type="button"
      onClick={onClick}
      style={{ animationDelay: `${animationDelay}ms` }}
      className={[
        'group relative flex flex-col items-center gap-3 rounded-xl border border-border/50 bg-card p-4 text-left',
        'transition-all duration-300 ease-out',
        'hover:border-primary/40 hover:shadow-lg hover:shadow-primary/10',
        'hover:-translate-y-1 hover:scale-[1.02]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        'animate-fade-in-up',
        isLive ? 'ring-1 ring-red-500/30' : '',
      ].join(' ')}
    >
      {/* Live badge */}
      {isLive && (
        <span className="absolute top-2 right-2 z-10 flex items-center gap-1 rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-bold text-white live-pulse">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
          LIVE
        </span>
      )}

      {/* Avatar — hover 時 zoom + ring 強化 */}
      <div
        className={[
          'relative w-16 h-16 rounded-full overflow-hidden bg-muted shrink-0 ring-2 transition-all duration-300',
          isLive ? 'ring-red-500/50 group-hover:ring-red-500/80' : 'ring-border group-hover:ring-primary/40',
        ].join(' ')}
      >
        {vtuber.img_url ? (
          <img
            src={vtuber.img_url}
            alt={vtuber.name}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
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
        <h3 className="font-semibold text-sm text-foreground truncate transition-colors group-hover:text-primary">
          {vtuber.name}
        </h3>
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

      {/* Hover indicator — 進場時 fade in */}
      <ExternalLink className="absolute bottom-2 right-2 w-3.5 h-3.5 text-muted-foreground/0 group-hover:text-muted-foreground/60 transition-all duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
    </button>
  );
}
