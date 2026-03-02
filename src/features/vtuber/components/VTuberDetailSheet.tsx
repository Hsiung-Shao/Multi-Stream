import { useTranslation } from 'react-i18next';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '../../../components/ui/sheet';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { Youtube, Twitch, Star, CheckCircle, AlertCircle, Calendar, Users } from 'lucide-react';
import type { VTuberRecord } from '../types';

interface VTuberDetailSheetProps {
  vtuber: VTuberRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddToFavorites?: (vtuber: VTuberRecord) => void;
}

function formatCount(count: number | null): string {
  if (count == null) return '-';
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return count.toLocaleString();
}

export function VTuberDetailSheet({ vtuber, open, onOpenChange, onAddToFavorites }: VTuberDetailSheetProps) {
  const { t } = useTranslation('vtuber');

  if (!vtuber) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-left">{t('detail')}</SheetTitle>
        </SheetHeader>

        <div className="flex flex-col gap-6 pt-4">
          {/* Header */}
          <div className="flex items-center gap-4">
            <div className="w-20 h-20 rounded-full overflow-hidden bg-muted shrink-0 ring-2 ring-border">
              {vtuber.img_url ? (
                <img src={vtuber.img_url} alt={vtuber.name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-2xl font-bold text-muted-foreground">
                  {vtuber.name.charAt(0)}
                </div>
              )}
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-foreground truncate">{vtuber.name}</h2>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="outline" className="text-xs">
                  {t(vtuber.nationality.toLowerCase())}
                </Badge>
                {vtuber.activity === 'graduate' && (
                  <Badge variant="secondary" className="text-xs">{t('graduated')}</Badge>
                )}
                {vtuber.channel_id_verified ? (
                  <CheckCircle className="w-4 h-4 text-green-500" title={t('verified')} />
                ) : (
                  <AlertCircle className="w-4 h-4 text-yellow-500" title={t('unverified')} />
                )}
              </div>
            </div>
          </div>

          {/* Info rows */}
          <div className="space-y-3 text-sm">
            {vtuber.group_name && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Users className="w-4 h-4 shrink-0" />
                <span className="text-foreground">{vtuber.group_name}</span>
              </div>
            )}
            {vtuber.debut_date && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Calendar className="w-4 h-4 shrink-0" />
                <span className="text-foreground">{vtuber.debut_date}</span>
              </div>
            )}
          </div>

          {/* Platforms */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground">{t('platform')}</h3>

            {vtuber.youtube_channel_id ? (
              <a
                href={`https://www.youtube.com/channel/${vtuber.youtube_channel_id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 rounded-lg border border-border/50 p-3 hover:bg-accent/50 transition-colors"
              >
                <Youtube className="w-5 h-5 text-red-500 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium">YouTube</p>
                  <p className="text-xs text-muted-foreground">
                    {t('subscribers')}: {formatCount(vtuber.youtube_subscriber_count)}
                  </p>
                </div>
              </a>
            ) : (
              <p className="text-xs text-muted-foreground">{t('noYouTube')}</p>
            )}

            {vtuber.twitch_channel_id ? (
              <a
                href={`https://www.twitch.tv/${vtuber.twitch_channel_id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 rounded-lg border border-border/50 p-3 hover:bg-accent/50 transition-colors"
              >
                <Twitch className="w-5 h-5 text-purple-500 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium">Twitch</p>
                  <p className="text-xs text-muted-foreground">
                    {t('followers')}: {formatCount(vtuber.twitch_follower_count)}
                  </p>
                </div>
              </a>
            ) : (
              <p className="text-xs text-muted-foreground">{t('noTwitch')}</p>
            )}
          </div>

          {/* Actions */}
          {onAddToFavorites && (
            <Button
              onClick={() => onAddToFavorites(vtuber)}
              className="w-full gap-2"
            >
              <Star className="w-4 h-4" />
              {t('addToFavorites')}
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
