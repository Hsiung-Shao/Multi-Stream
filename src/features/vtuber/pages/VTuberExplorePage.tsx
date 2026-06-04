import { useState, useMemo, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useUIStore } from '../../../store/useUIStore';
import { useVTubers, useVTuberGroups, useVTuberLivestreams } from '../hooks/useVTubers';
import { useVTuberFilters } from '../hooks/useVTuberFilters';
import { VTuberSearchInput } from '../components/VTuberSearchInput';
import { VTuberFilterBar } from '../components/VTuberFilterBar';
import { VTuberGrid } from '../components/VTuberGrid';
import { VTuberDetailSheet } from '../components/VTuberDetailSheet';
import { EventScheduleView } from '../components/EventScheduleView';
import { CreateEventDialog } from '../components/CreateEventDialog';
import { LoginDialog } from '../../../components/Dialogs/LoginDialog';
import { useAuthContext } from '../../../contexts/AuthContext';
import { SEO } from '../../../components/SEO';
import { Button } from '../../../components/ui/button';
import { ArrowLeft, Plus, LogIn, LogOut, CalendarDays, Users, Pencil, Settings, MessageSquareHeart, Sparkles } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '../../../components/ui/dropdown-menu';
import { EditProfileDialog } from '../../../components/Dialogs/EditProfileDialog';
import { RecommendationsPanel } from '../../recommendations/RecommendationsPanel';
import { logEvent } from '../../../utils/analytics';
import type { VTuberRecord } from '../types';

type ExploreTab = 'recommendations' | 'vtubers' | 'events';

interface VTuberExplorePageProps {
  initialTab?: ExploreTab;
}

export function VTuberExplorePage({ initialTab = 'recommendations' }: VTuberExplorePageProps) {
  const { t } = useTranslation('vtuber');
  const setPage = useUIStore((s) => s.setPage);
  const openModal = useUIStore((s) => s.openModal);

  // Tab
  const [activeTab, setActiveTab] = useState<ExploreTab>(initialTab);

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

  // 投稿表單入口已移除：改由收藏列表上的「推薦」按鈕走一鍵推薦流程
  // （/api/vtuber/recommend-from-favorite，status='approved' 直接公開）

  // Create event dialog
  const [createEventOpen, setCreateEventOpen] = useState(false);

  // Auth
  const { isLoggedIn, profile, logout } = useAuthContext();
  const [loginDialogOpen, setLoginDialogOpen] = useState(false);
  const [editProfileOpen, setEditProfileOpen] = useState(false);

  // GA4 tracking
  const searchTrackTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    logEvent('VTuber', 'explore_view', activeTab);
    return () => { if (searchTrackTimer.current) clearTimeout(searchTrackTimer.current); };
  }, []); // page view on mount + cleanup
  const handleSearchWithTracking = (keyword: string) => {
    setSearch(keyword);
    if (searchTrackTimer.current) clearTimeout(searchTrackTimer.current);
    if (keyword.trim()) {
      searchTrackTimer.current = setTimeout(() => {
        logEvent('VTuber', 'search', keyword.trim());
      }, 1000);
    }
  };

  const handleTabChange = (tab: ExploreTab) => {
    setActiveTab(tab);
    logEvent('VTuber', 'event_tab_view', tab);
  };

  const handleVTuberClick = (vtuber: VTuberRecord) => {
    setSelectedVTuber(vtuber);
    setSheetOpen(true);
    logEvent('VTuber', 'detail_view', vtuber.name);
  };

  const handleAddToFavorites = (vtuber: VTuberRecord) => {
    const channelId = vtuber.twitch_channel_id || vtuber.youtube_channel_id;
    if (!channelId) return;

    const url = vtuber.twitch_channel_id
      ? `https://www.twitch.tv/${vtuber.twitch_channel_id}`
      : `https://www.youtube.com/channel/${vtuber.youtube_channel_id}`;

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
        pathWithoutLang="/vtubers"
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
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold">{t('pageTitle')}</h1>
              <span
                className="px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded bg-amber-500/15 text-amber-400 border border-amber-500/30"
                title="此功能仍在測試階段，部分資料與互動可能尚未完善"
              >
                Beta
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Action button：vtubers tab 移除「投稿」按鈕（改由收藏列表「推薦」走簡化流程） */}
            {activeTab === 'events' && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs"
                onClick={() => setCreateEventOpen(true)}
              >
                <Plus className="w-3.5 h-3.5" />
                {t('createEvent')}
              </Button>
            )}
            {isLoggedIn ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="gap-1.5 px-2 h-8">
                    {profile?.avatar_url ? (
                      <img src={profile.avatar_url} alt="" className="w-6 h-6 rounded-full" />
                    ) : (
                      <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary">
                        {profile?.display_name?.charAt(0) ?? '?'}
                      </div>
                    )}
                    <span className="text-xs text-foreground hidden sm:inline max-w-[80px] truncate">
                      {profile?.display_name}
                    </span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel className="text-xs">{profile?.display_name}</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => setEditProfileOpen(true)}>
                    <Pencil className="w-3.5 h-3.5 mr-2" />
                    {t('common:editDisplayName', '修改名稱')}
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setPage('account')}>
                    <Settings className="w-3.5 h-3.5 mr-2" />
                    {t('account:menuLabel', '帳號設定')}
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => openModal('feedback')}>
                    <MessageSquareHeart className="w-3.5 h-3.5 mr-2" />
                    {t('navbar:feedback', '意見回饋')}
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => logout()}>
                    <LogOut className="w-3.5 h-3.5 mr-2" />
                    {t('auth:logout', '登出')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 text-xs"
                onClick={() => setLoginDialogOpen(true)}
              >
                <LogIn className="w-3.5 h-3.5" />
                {t('loginButton')}
              </Button>
            )}
          </div>
        </div>

        {/* Tab bar */}
        <div className="container mx-auto px-4">
          <div className="flex gap-0 border-b border-transparent -mb-px">
            <button
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'recommendations'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => handleTabChange('recommendations')}
            >
              <Sparkles className="w-4 h-4" />
              {t('recommendationsTab')}
            </button>
            <button
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'vtubers'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => handleTabChange('vtubers')}
            >
              <Users className="w-4 h-4" />
              {t('vtubersTab')}
            </button>
            <button
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'events'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => handleTabChange('events')}
            >
              <CalendarDays className="w-4 h-4" />
              {t('eventsTab')}
            </button>
          </div>
        </div>
      </header>

      {/* 推薦 tab：複用 RecommendationsPanel（自帶 <main>，外觀維持原樣）。
          其餘 tab 走原本 hub 的 <main> 容器 */}
      {activeTab === 'recommendations' ? (
        <RecommendationsPanel />
      ) : (
      <main className="flex-1 container mx-auto px-4 py-6 space-y-6">
        {activeTab === 'vtubers' ? (
          <>
            {/* Search + Filters */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <VTuberSearchInput value={search} onChange={handleSearchWithTracking} />
              <VTuberFilterBar
                nationality={nationality}
                activity={activity}
                groupId={groupId}
                sortBy={sortBy}
                sortOrder={sortOrder}
                groups={groups}
                onNationalityChange={(v) => { setNationality(v); logEvent('VTuber', 'filter_nationality', v || 'all'); }}
                onActivityChange={(v) => { setActivity(v); logEvent('VTuber', 'filter_activity', v || 'all'); }}
                onGroupChange={(v) => { setGroupId(v); logEvent('VTuber', 'filter_group', v || 'all'); }}
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
          </>
        ) : (
          <EventScheduleView onCreateEvent={() => setCreateEventOpen(true)} />
        )}
      </main>
      )}

      {/* Detail Sheet */}
      <VTuberDetailSheet
        vtuber={selectedVTuber}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        onAddToFavorites={handleAddToFavorites}
      />

      {/* Contribute Dialog 已移除 — 改由收藏列表「推薦」按鈕一鍵推薦 */}

      {/* Create Event Dialog */}
      <CreateEventDialog
        open={createEventOpen}
        onOpenChange={setCreateEventOpen}
      />

      {/* Login Dialog */}
      <LoginDialog open={loginDialogOpen} onClose={() => setLoginDialogOpen(false)} />

      {/* Edit Profile Dialog */}
      <EditProfileDialog open={editProfileOpen} onClose={() => setEditProfileOpen(false)} />
    </div>
  );
}
