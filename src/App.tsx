import { useCallback, useEffect, lazy, Suspense } from 'react';
import { Navbar } from './components/Navbar';
import { WelcomeCard } from './components/WelcomeCard';
import { StreamContainer } from './components/StreamContainer';
import { ControlPanel } from './components/ControlPanel';
import { SEO } from './components/SEO';
import { useUIStore } from './store/useUIStore';

// 懶加載非關鍵組件（按需載入）
const VersionHistory = lazy(() => import('./components/VersionHistory').then(module => ({ 'default': module.VersionHistory })));
const Tutorial = lazy(() => import('./components/Tutorial').then(module => ({ 'default': module.Tutorial })));
const FavoritesManager = lazy(() => import('./components/FavoritesManager').then(module => ({ 'default': module.FavoritesManager })));
const FeedbackModal = lazy(() => import('./features/feedback/FeedbackModal').then(module => ({ 'default': module.FeedbackModal })));
const AboutPage = lazy(() => import('./components/AboutPage').then(module => ({ 'default': module.AboutPage })));
const PrivacyPage = lazy(() => import('./components/PrivacyPage').then(module => ({ 'default': module.PrivacyPage })));
import { apiLoader } from './utils/apiLoader';
import { YouTubeRiskDialog } from './components/YouTubeRiskDialog';
import { useStreamStore } from './store/useStreamStore';
import { usePlayerStore } from './store/playerStore';
import { useYouTubeRisk } from './hooks/useYouTubeRisk';
import { useAutoRefresh } from './hooks/useAutoRefresh';
import { useAppInitialization } from './hooks/useAppInitialization';

// 全局變數聲明 moved to src/types/global.d.ts

export default function App() {
  const theme = useUIStore(s => s.theme);
  const toggleTheme = useUIStore(s => s.toggleTheme);

  const currentPage = useUIStore(s => s.page);
  const setCurrentPage = useUIStore(s => s.setPage);

  const modals = useUIStore(s => s.modals);
  const openModal = useUIStore(s => s.openModal);
  const closeModal = useUIStore(s => s.closeModal);

  const isPanelCollapsed = useUIStore(s => s.isPanelCollapsed);
  const togglePanelCollapsed = useUIStore(s => s.togglePanelCollapsed);

  const isSearchFocused = useUIStore(s => s.isSearchFocused);
  const setIsSearchFocused = useUIStore(s => s.setSearchFocused);

  const masterVolume = useUIStore(s => s.masterVolume);
  const setMasterVolume = useUIStore(s => s.setMasterVolume);
  const masterMuted = useUIStore(s => s.masterMuted);
  const setMasterMuted = useUIStore(s => s.setMasterMuted);

  const streams = useStreamStore(s => s.streams);
  const layout = useStreamStore(s => s.layout);
  const setLayout = useStreamStore(s => s.setLayout);
  const addStream = useStreamStore(s => s.addStream);
  const removeStream = useStreamStore(s => s.removeStream);
  const updateStream = useStreamStore(s => s.updateStream);
  const chatLayout = useStreamStore(s => s.chatLayout);
  const setChatLayout = useStreamStore(s => s.setChatLayout);

  const getPlayer = usePlayerStore(s => s.getPlayer);

  // Hooks
  useAppInitialization();
  useAutoRefresh();

  // YouTube Warning Logic State (Hook)
  const {
    showYTRiskDialog,
    currentYTRiskCount,
    setShowYTRiskDialog,
    handlePauseOtherYouTubeStreams,
    handleRiskDontRemind
  } = useYouTubeRisk();

  // 添加串流
  const handleAddStream = useCallback(async (url: string) => {
    // 直接調用 Store Action (Validation logic moved to store)
    const result = await addStream(url);
    if (!result.success && result.message) {
      alert(result.message);
    }
  }, [addStream]);


  // 移除串流
  const handleRemoveStream = (id: number) => {
    // 清理播放器
    // 清理播放器 (使用 Store 獲取實例)
    const p = getPlayer(id);
    if (p && p.type === 'youtube' && p.player && typeof p.player.destroy === 'function') {
      try { p.player.destroy(); } catch (e) { }
    }
    // 注意: delete window.players[id] 由 StreamBox 的 cleanup 負責 (或是雙寫策略中的解註冊)

    // 移除分離的聊天室（如果存在）
    const separatedChat = document.getElementById('separated-chat-' + id);
    if (separatedChat) {
      separatedChat.remove();
    }

    removeStream(id);
  };

  // 切換所有聊天室顯示/隱藏
  const handleToggleAllChat = (show: boolean) => {
    streams.forEach(s => {
      updateStream(s.id, { chatVisible: show });
    });
  };

  // 處理總音量變化
  const handleMasterVolumeChange = (volume: number) => {
    // 如果當前是靜音狀態，且用戶拖動滑塊到非零值，先取消靜音
    if (volume > 0 && masterMuted) {
      setMasterMuted(false);
    }

    setMasterVolume(volume);

    // 如果音量設為 0，自動設為靜音
    if (volume === 0) {
      setMasterMuted(true);
    }

    // Persistence handled by Store
  };

  // 處理全部靜音/取消靜音（保存和恢復音量值）
  // 處理全部靜音/取消靜音（保存和恢復音量值）
  const handleMasterMuteChange = (muted: boolean) => {
    if (muted) {
      setMasterVolume(0);
      setMasterMuted(true);
    } else {
      // 取消靜音
      let restoreVolume = 100; // Default
      try {
        const saved = localStorage.getItem('userSettings');
        if (saved) {
          const settings = JSON.parse(saved);
          if (settings.masterVolume !== undefined && settings.masterVolume > 0) {
            restoreVolume = settings.masterVolume;
          }
        }
      } catch (e) { }

      setMasterVolume(restoreVolume);
      setMasterMuted(false);
    }
  };

  // 音量變化
  const handleVolumeChange = (id: number, volume: number) => {
    const s = streams.find(st => st.id === id);

    // 如果調整音量且之前是靜音狀態，取消靜音
    const newMutedState = volume === 0 ? true : false;

    // update store
    updateStream(id, { volume, isMuted: newMutedState });

    // 應用音量到播放器
    const playerInstance = getPlayer(id);
    if (playerInstance && playerInstance.player) {
      const player = playerInstance.player;
      // const masterVol = masterVolume; // Use store state
      const masterVol = masterVolume; // Use store state
      const actualVol = Math.round((volume / 100) * masterVol);

      try {
        if (s?.platform === 'twitch') {
          if (actualVol === 0) {
            // 音量為 0，靜音
            if (typeof player.setMuted === 'function') {
              player.setMuted(true);
            } else if (typeof player.setVolume === 'function') {
              player.setVolume(0);
            }
          } else {
            // 音量不為 0，先取消靜音，再設置音量
            if (typeof player.setMuted === 'function') {
              player.setMuted(false);
            }
            if (typeof player.setVolume === 'function') {
              player.setVolume(actualVol / 100);
            }
          }
        } else if (s?.platform === 'youtube') {
          try {
            const playerState = player.getPlayerState();
            if (playerState !== undefined) {
              if (actualVol === 0) {
                // 音量為 0，靜音
                if (typeof player.mute === 'function') {
                  player.mute();
                } else if (typeof player.setVolume === 'function') {
                  player.setVolume(0);
                }
              } else {
                // 音量不為 0，先取消靜音，再設置音量
                if (typeof player.unMute === 'function') {
                  player.unMute();
                }
                if (typeof player.setVolume === 'function') {
                  player.setVolume(actualVol);
                }
              }
            }
          } catch (e) {
            // 播放器尚未就緒，稍後再試
            setTimeout(() => {
              const delayedPlayerInstance = getPlayer(id);
              if (delayedPlayerInstance && delayedPlayerInstance.player) {
                try {
                  const delayedPlayer = delayedPlayerInstance.player;
                  if (actualVol === 0) {
                    if (typeof delayedPlayer.mute === 'function') {
                      delayedPlayer.mute();
                    }
                  } else {
                    if (typeof delayedPlayer.unMute === 'function') {
                      delayedPlayer.unMute();
                    }
                    if (typeof delayedPlayer.setVolume === 'function') {
                      delayedPlayer.setVolume(actualVol);
                    }
                  }
                } catch (err) {
                  // 靜默處理錯誤
                }
              }
            }, 500);
          }
        }
      } catch (error) {
        // 音量設置失敗，繼續處理
      }
    }
  };

  // 切換靜音（簡化版本，與 muteAll 一樣簡單）
  const handleToggleMute = (id: number) => {
    const masterMuted = (window as any).masterMuted || false;
    const s = streams.find(st => st.id === id);
    if (!s) return;

    const newMutedState = !(s.isMuted || false);



    // Update Store
    updateStream(id, { isMuted: newMutedState });

    // 對播放器應用靜音/取消靜音操作
    // 使用全局的 players 和 streamData（與 js/volume.js 中的 muteAll 一致）
    // 對播放器應用靜音/取消靜音操作
    const playerInstance = getPlayer(id);

    if (playerInstance && playerInstance.player) {
      const player = playerInstance.player;
      try {
        if (s.platform === 'twitch') {
          if (newMutedState) {
            // Twitch 播放器：使用 setMuted() 方法靜音
            if (typeof player.setMuted === 'function') {
              player.setMuted(true);
            } else if (typeof player.setVolume === 'function') {
              player.setVolume(0);
            }
          } else {
            // Twitch 播放器：使用 setMuted() 方法取消靜音
            // 但如果全部靜音，播放器應該保持靜音（全部靜音優先）
            if (!masterMuted) {
              if (typeof player.setMuted === 'function') {
                player.setMuted(false);
              }

              // 恢復音量
              const masterVol = masterVolume;
              const streamVol = s.volume || 100;
              const actualVol = Math.round((streamVol / 100) * masterVol);

              if (typeof player.setVolume === 'function') {
                player.setVolume(actualVol / 100);
              }
            }
          }
        } else if (s.platform === 'youtube') {
          if (newMutedState) {
            // YouTube 播放器：使用 mute() 方法或設置音量為 0
            if (typeof player.mute === 'function') {
              player.mute();
            } else if (typeof player.setVolume === 'function') {
              try {
                const playerState = player.getPlayerState();
                if (playerState !== undefined) {
                  player.setVolume(0);
                }
              } catch (e) {
                // Retry
                setTimeout(() => {
                  const delayedPlayerInstance = getPlayer(id);
                  if (delayedPlayerInstance && delayedPlayerInstance.player) {
                    const delayedPlayer = delayedPlayerInstance.player;
                    if (typeof delayedPlayer.mute === 'function') {
                      delayedPlayer.mute();
                    } else if (typeof delayedPlayer.setVolume === 'function') {
                      try { delayedPlayer.setVolume(0); } catch (err) { }
                    }
                  }
                }, 500);
              }
            }
          } else {
            // YouTube 播放器：使用 unMute() 方法
            if (!masterMuted) {
              if (typeof player.unMute === 'function') {
                player.unMute();
              }
              // 不需要手動恢復音量?? setVolume?
              // Existing code only called unMute(). YouTube remembers volume?
              // Let's stick to unMute() only as per existing code, BUT existing code relied on explicit "applyMasterVolumeToStream" or just trusted unMute?
              // Existing code only called unMute().
            }
          }
        }
      } catch (e) {
        // 靜默處理錯誤
      }
    }
  };



  // Show Privacy Page
  if (currentPage === 'privacy') {
    return (
      <>
        <SEO
          title="隱私權政策 - MultiStream Hub"
          description="MultiStream Hub 隱私權政策。了解我們如何保護您的隱私，以及我們收集和使用資料的方式。本網站為純前端工具，絕大多數資料僅儲存於您的瀏覽器本地。"
          keywords="隱私權政策, 隱私保護, 資料安全, MultiStream Hub, 個人資料保護"
          url="https://multistreaming.org/privacy.html"
        />
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center">載入中...</div>}>
          <PrivacyPage
            theme={theme}
            onThemeToggle={toggleTheme}
            onBack={() => setCurrentPage('home')}
            onNavigateToAbout={() => setCurrentPage('about')}
          />
        </Suspense>
      </>
    );
  }

  // Show About Page
  if (currentPage === 'about') {
    return (
      <>
        <SEO
          title="關於我們 - MultiStream Hub"
          description="了解 MultiStream Hub 的功能特色、技術架構和開發者資訊。一個完全免費的多平台直播串流觀看工具，支援 Twitch 和 YouTube。"
          keywords="關於 MultiStream Hub, 功能特色, 技術架構, 開發者資訊, 多平台直播工具"
          url="https://multistreaming.org/about.html"
        />
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center">載入中...</div>}>
          <AboutPage
            theme={theme}
            onThemeToggle={toggleTheme}
            onBack={() => setCurrentPage('home')}
            onNavigateToPrivacy={() => setCurrentPage('privacy')}
          />
        </Suspense>
      </>
    );
  }

  // Show Home Page
  return (
    <>
      <SEO />
      <div className={`min-h-screen ${theme === 'dark' ? 'bg-gray-950' : 'bg-gray-50'}`}>
        <Navbar
          theme={theme}
          onThemeToggle={toggleTheme}
          onShowAbout={() => setCurrentPage('about')}
          onShowTutorial={() => openModal('tutorial')}
          onShowVersionHistory={() => openModal('history')}
          onShowFavorites={() => openModal('favorites')}
          onShowFeedback={() => openModal('feedback')}
          onTogglePanel={() => togglePanelCollapsed()}
          onAddStream={handleAddStream}
          onSearchFocusChange={setIsSearchFocused}
        />

        {currentPage === 'home' && (
          <StreamContainer
            masterVolume={masterVolume}
            isMasterMuted={masterMuted}
          />
        )}

        {streams.length === 0 && (
          <div className="container mx-auto px-4 py-4" style={{ position: 'relative', zIndex: 10 }}>
            <WelcomeCard
              theme={theme}
              onShowVersionHistory={() => openModal('history')}
              onShowTutorial={() => openModal('tutorial')}
              onShowAbout={() => setCurrentPage('about')}
              onNavigateToPrivacy={() => setCurrentPage('privacy')}
            />
          </div>
        )}

        <ControlPanel
          theme={theme}
          isCollapsed={isPanelCollapsed}
          onToggleCollapse={() => togglePanelCollapsed()}
          isSearchFocused={isSearchFocused}
          onShowFavorites={() => openModal('favorites')}
          onShowVersionHistory={() => openModal('history')}
          onShowTutorial={() => openModal('tutorial')}
          onShowAbout={() => setCurrentPage('about')}
          streams={streams}
          currentLayout={layout}
          onLayoutChange={setLayout}
          chatLayoutType={chatLayout}
          onChatLayoutChange={setChatLayout}
          onVolumeChange={handleVolumeChange}
          onToggleMute={handleToggleMute}
          onRemoveStream={handleRemoveStream}
          onToggleAllChat={handleToggleAllChat}
          masterVolume={masterVolume}
          masterMuted={masterMuted}
          onMasterVolumeChange={handleMasterVolumeChange}
          onMasterMuteChange={handleMasterMuteChange}
          onMoveStreamUp={(id) => {
            // Using Store Action
            const index = streams.findIndex(s => s.id === id);
            if (index > 0) {
              const moveAction = useStreamStore.getState().moveStream;
              moveAction(index, index - 1);
            }
          }}
          onMoveStreamDown={(id) => {
            // Using Store Action
            const index = streams.findIndex(s => s.id === id);
            if (index >= 0 && index < streams.length - 1) {
              const moveAction = useStreamStore.getState().moveStream;
              moveAction(index, index + 1);
            }
          }}
        />

        {modals.history && (
          <Suspense fallback={<div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">載入中...</div>}>
            <VersionHistory
              theme={theme}
              onClose={() => closeModal('history')}
            />
          </Suspense>
        )}

        {modals.tutorial && (
          <Suspense fallback={<div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">載入中...</div>}>
            <Tutorial
              theme={theme}
              onClose={() => closeModal('tutorial')}
            />
          </Suspense>
        )}

        {modals.favorites && (
          <Suspense fallback={<div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">載入中...</div>}>
            <FavoritesManager
              theme={theme}
              onClose={() => closeModal('favorites')}
            />
          </Suspense>
        )}

        {modals.feedback && (
          <Suspense fallback={<div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">載入中...</div>}>
            <FeedbackModal
              theme={theme}
              onClose={() => closeModal('feedback')}
            />
          </Suspense>
        )}

        <YouTubeRiskDialog
          open={showYTRiskDialog}
          streamCount={currentYTRiskCount}
          onClose={() => setShowYTRiskDialog(false)}
          onPauseOthers={handlePauseOtherYouTubeStreams}
          onDontRemind={handleRiskDontRemind}
        />
      </div>
    </>
  );
}