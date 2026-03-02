import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useUIStore } from '../../../store/useUIStore';
import { useVTubers, useVTuberGroups, useVTuberLivestreams } from '../hooks/useVTubers';
import { useVTuberFilters } from '../hooks/useVTuberFilters';
import { VTuberSearchInput } from '../components/VTuberSearchInput';
import { VTuberFilterBar } from '../components/VTuberFilterBar';
import { VTuberGrid } from '../components/VTuberGrid';
import { VTuberDetailSheet } from '../components/VTuberDetailSheet';
import { ContributeVTuberDialog } from '../components/ContributeVTuberDialog';
import { SEO } from '../../../components/SEO';
import { Button } from '../../../components/ui/button';
import { ArrowLeft, Plus } from 'lucide-react';
import type { VTuberRecord } from '../types';

export function VTuberExplorePage() {
  const { t } = useTranslation('vtuber');
  const setPage = useUIStore((s) => s.setPage);

  // Filters
  const {
    filter,
    nationality,
    groupId,
    activity,
    search,
    sortBy,
    sortOrder,
    page,
    pageSize,
    setNationality,
    setGroupId,
    setActivity,
    setSearch,
    setSortBy,
    setSortOrder,
    setPage: setFilterPage,
    resetFilters,
  } = useVTuberFilters();

  // Data
  const { data: vtubersResult, isLoading } = useVTubers(filter);
  const { data: groups = [] } = useVTuberGroups(nationality);
  const { data: livestreams = [] } = useVTuberLivestreams();

  // Live VTuber IDs for badge display
  const liveVTuberIds = useMemo(
    () => new Set(livestreams.map((ls) => ls.vtuber_id)),
    [livestreams],
  );

  // Detail sheet
  const [selectedVTuber, setSelectedVTuber] = useState<VTuberRecord | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  // Contribute dialog
  const [contributeOpen, setContributeOpen] = useState(false);

  const handleVTuberClick = (vtuber: VTuberRecord) => {
    setSelectedVTuber(vtuber);
    setSheetOpen(true);
  };

  const handleAddToFavorites = (vtuber: VTuberRecord) => {
    // Use the stream URL to add to favorites via the existing system
    const channelId = vtuber.twitch_channel_id || vtuber.youtube_channel_id;
    if (!channelId) return;

    const url = vtuber.twitch_channel_id
      ? `https://www.twitch.tv/${vtuber.twitch_channel_id}`
      : `https://www.youtube.com/channel/${vtuber.youtube_channel_id}`;

    // Dispatch custom event for favorites system integration
    window.dispatchEvent(
      new CustomEvent('add-to-favorites', {
        detail: { url, name: vtuber.name, platform: vtuber.twitch_channel_id ? 'twitch' : 'youtube' },
      }),
    );

    setSheetOpen(false);
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <SEO
        title={`${t('pageTitle')} - MultiStream Hub`}
        description="Explore VTubers from Taiwan, Hong Kong, Malaysia, Japan, Korea and more. Find your favorite VTubers and add them to your collection."
        keywords="VTuber, explore, Taiwan VTuber, Twitch, YouTube, live streaming"
        url="https://multistreaming.org/vtubers"
      />

      {/* Header */}
      <header className="sticky top-0 w-full z-50 border-b border-white/10 bg-background/80 backdrop-blur-md">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setPage('home')}
              className="hover:bg-primary/10"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <h1 className="text-lg font-bold">{t('pageTitle')}</h1>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs"
            onClick={() => setContributeOpen(true)}
          >
            <Plus className="w-3.5 h-3.5" />
            {t('contribute')}
          </Button>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 container mx-auto px-4 py-6 space-y-6">
        {/* Search + Filters */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <VTuberSearchInput value={search} onChange={setSearch} />
          <VTuberFilterBar
            nationality={nationality}
            activity={activity}
            groupId={groupId}
            sortBy={sortBy}
            sortOrder={sortOrder}
            groups={groups}
            onNationalityChange={setNationality}
            onActivityChange={setActivity}
            onGroupChange={setGroupId}
            onSortByChange={setSortBy}
            onSortOrderChange={setSortOrder}
            onReset={resetFilters}
          />
        </div>

        {/* Grid */}
        <VTuberGrid
          vtubers={vtubersResult?.data ?? []}
          totalCount={vtubersResult?.count ?? 0}
          page={page}
          pageSize={pageSize}
          isLoading={isLoading}
          liveVTuberIds={liveVTuberIds}
          onPageChange={setFilterPage}
          onVTuberClick={handleVTuberClick}
        />
      </main>

      {/* Detail Sheet */}
      <VTuberDetailSheet
        vtuber={selectedVTuber}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        onAddToFavorites={handleAddToFavorites}
      />

      {/* Contribute Dialog */}
      <ContributeVTuberDialog
        open={contributeOpen}
        onOpenChange={setContributeOpen}
      />
    </div>
  );
}
