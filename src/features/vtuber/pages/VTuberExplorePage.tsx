import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useUIStore } from '../../../store/useUIStore';
import { CreateEventDialog } from '../components/CreateEventDialog';
import { LoginDialog } from '../../../components/Dialogs/LoginDialog';
import { useAuthContext } from '../../../contexts/AuthContext';
import { SEO } from '../../../components/SEO';
import { Button } from '../../../components/ui/button';
import { ArrowLeft, Plus, LogIn, LogOut, Bookmark, Compass, Pencil, Settings, MessageSquareHeart } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '../../../components/ui/dropdown-menu';
import { EditProfileDialog } from '../../../components/Dialogs/EditProfileDialog';
import { RecommendationsPanel } from '../../recommendations/RecommendationsPanel';
import { logEvent } from '../../../utils/analytics';

// 「探索」單頁 hub（無分頁）：Header → Hero 直播輪播 → FilterRow → 兩欄
// （左：今日推薦榜列表 + 卡片 grid；右：活動行程表側欄）。
// 內容主體在 RecommendationsPanel（自帶 hooks/state/dialog）。
// initialTab 仍保留作為相容 prop（RecommendationsPage 仍會傳），但單頁化後不再分頁。
type ExploreTab = 'recommendations' | 'vtubers' | 'events';

interface VTuberExplorePageProps {
  initialTab?: ExploreTab;
}

export function VTuberExplorePage(_props: VTuberExplorePageProps = {}) {
  const { t } = useTranslation('vtuber');
  const setPage = useUIStore((s) => s.setPage);
  const openModal = useUIStore((s) => s.openModal);

  // Create event dialog（沿用既有建立活動流程）
  const [createEventOpen, setCreateEventOpen] = useState(false);

  // Auth
  const { isLoggedIn, profile, logout } = useAuthContext();
  const [loginDialogOpen, setLoginDialogOpen] = useState(false);
  const [editProfileOpen, setEditProfileOpen] = useState(false);

  // GA4：頁面瀏覽
  useEffect(() => {
    logEvent('VTuber', 'explore_view', 'hub');
  }, []);

  const openFavorites = () => {
    openModal('favorites');
    logEvent('VTuber', 'open_favorites', 'header');
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
        <div className="max-w-7xl mx-auto px-4 h-[60px] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setPage('home')}
              className="hover:bg-primary/10"
              title="返回"
            >
              <ArrowLeft className="w-[18px] h-[18px]" />
            </Button>
            <div className="flex items-center gap-2 pl-0.5">
              <Compass className="w-[18px] h-[18px] text-[#ec4899]" />
              <h1 className="text-[17px] font-bold tracking-tight">{t('pageTitle')}</h1>
              <span
                className="px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded bg-amber-500/15 text-amber-400 border border-amber-500/30 ml-1"
                title="此功能仍在測試階段，部分資料與互動可能尚未完善"
              >
                Beta
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* 我的收藏 + 推薦 VTuber：兩者都開「收藏」彈窗 */}
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs h-8"
              onClick={openFavorites}
            >
              <Bookmark className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">我的收藏</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs h-8"
              onClick={openFavorites}
            >
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">推薦 VTuber</span>
            </Button>

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
                className="gap-1.5 text-xs h-8"
                onClick={() => setLoginDialogOpen(true)}
              >
                <LogIn className="w-3.5 h-3.5" />
                {t('loginButton')}
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* 單頁 hub 主體（自帶 <main>）*/}
      <RecommendationsPanel onCreateEvent={() => setCreateEventOpen(true)} />

      {/* Create Event Dialog（沿用既有建立活動流程）*/}
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
