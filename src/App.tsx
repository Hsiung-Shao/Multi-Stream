import React, { useState, useRef, useCallback, useEffect, lazy, Suspense } from 'react';
import { Navbar } from './components/Navbar';
import { WelcomeCard } from './components/WelcomeCard';
import { StreamContainer } from './components/StreamContainer';
import { ControlPanel } from './components/ControlPanel';
import { SEO } from './components/SEO';

// 懶加載非關鍵組件（按需載入）
const VersionHistory = lazy(() => import('./components/VersionHistory').then(module => ({ 'default': module.VersionHistory })));
const Tutorial = lazy(() => import('./components/Tutorial').then(module => ({ 'default': module.Tutorial })));
const FavoritesManager = lazy(() => import('./components/FavoritesManager').then(module => ({ 'default': module.FavoritesManager })));
const FeedbackModal = lazy(() => import('./features/feedback/FeedbackModal').then(module => ({ 'default': module.FeedbackModal })));
const AboutPage = lazy(() => import('./components/AboutPage').then(module => ({ 'default': module.AboutPage })));
const PrivacyPage = lazy(() => import('./components/PrivacyPage').then(module => ({ 'default': module.PrivacyPage })));
import { parseStreamUrl, validateUrl, type StreamData } from './utils/streamUtils';
// import { useLayout } from './hooks/useLayout';
import type { ChatLayoutType } from './utils/chatLayoutUtils';
import { apiLoader } from './utils/apiLoader';
import { YouTubeRiskDialog } from './components/YouTubeRiskDialog';
import { favoritesService } from './features/favorites/FavoritesService';
import { favoritesLoader } from './features/favorites/FavoritesLoader';
import { backupService } from './features/backup';
import { useStreamStore } from './store/useStreamStore';

type Page = 'home' | 'about' | 'privacy';

// 全局變數聲明
declare global {
  interface Window {
    CONFIG?: {
      TWITCH_CLIENT_ID?: string;
      TWITCH_CLIENT_SECRET?: string;
      TWITCH_ACCESS_TOKEN?: string;
      YOUTUBE_API_KEY?: string;
    };
    twitchApi?: {
      searchChannels: (query: string, limit: number) => Promise<any[]>;
      checkChannelLiveStatus: (channelId: string) => Promise<any>;
      checkMultipleChannelsLiveStatus: (channelIds: string[]) => Promise<any>;
      setConfig: (config: any) => void;
      getConfig: () => any;
      clearCache: () => void;
    };
    youtubeApiUtils?: {
      getApiKey: () => Promise<string | null>;
      getChannelIdFromVideoId: (videoId: string) => Promise<string>;
      getChannelIdFromHandle: (handle: string) => Promise<string>;
      getChannelTitleFromChannelId: (channelId: string) => Promise<string | null>;
      checkChannelLiveStatus: (channelId: string) => Promise<any>;
    };
    streamCount: number;
    players: Record<number, { type: 'twitch' | 'youtube'; player: any }>;
    streamData: Record<number, any>;
    // Legacy Chat Functions
    createChat: (id: number, platform: 'twitch' | 'youtube', channelId: string, videoId: string) => void;
    toggleChat: (id: number) => void;
    separateChat: (id: number) => void;
    closeSeparatedChat: (id: number) => void;
    setupChatResizer: (id: number, callback: any) => void;
  }
}

export default function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const [currentPage, setCurrentPage] = useState<Page>('home');
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const [showFavorites, setShowFavorites] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [isPanelCollapsed, setIsPanelCollapsed] = useState(true);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const streams = useStreamStore(s => s.streams);
  const layout = useStreamStore(s => s.layout);
  const setLayout = useStreamStore(s => s.setLayout);
  const addStream = useStreamStore(s => s.addStream);
  const removeStream = useStreamStore(s => s.removeStream);
  const updateStream = useStreamStore(s => s.updateStream);
  const setStreams = useStreamStore(s => s.setStreams);
  // Chat Layout from Store
  const chatLayout = useStreamStore(s => s.chatLayout);
  const setChatLayout = useStreamStore(s => s.setChatLayout);

  const streamCountRef = useRef(0);

  // YouTube Warning Logic State
  const [showYTRiskDialog, setShowYTRiskDialog] = useState(false);
  const [currentYTRiskCount, setCurrentYTRiskCount] = useState(0);
  const ytRiskLevelsShownRaw = useRef({ soft: false, strong: false });
  const ytRiskSessionDismissedRaw = useRef(false);

  // Initialize YT Risk Session
  useEffect(() => {
    if (typeof sessionStorage !== 'undefined') {
      const dismissed = sessionStorage.getItem('ytRiskDismissed');
      if (dismissed === 'true') {
        ytRiskSessionDismissedRaw.current = true;
      }
    }
  }, []);

  // Monitor Active YouTube Streams
  useEffect(() => {
    const checkInterval = setInterval(() => {
      // If user dismissed for session, do nothing
      if (ytRiskSessionDismissedRaw.current) return;

      const youtubeStreams = streams.filter(s => s.platform === 'youtube');
      if (youtubeStreams.length === 0) return;

      let playingCount = 0;
      let checkedCount = 0;

      youtubeStreams.forEach(s => {
        const p = window.players && window.players[s.id];
        if (p && p.type === 'youtube' && p.player) {
          // Check if player API is ready
          try {
            if (typeof p.player.getPlayerState === 'function') {
              const state = p.player.getPlayerState();
              // 1 = PLAYING, 3 = BUFFERING
              if (state === 1 || state === 3) {
                playingCount++;
              }
              checkedCount++;
            }
          } catch (e) {
            // Player might not be ready
          }
        }
      });

      // Verification Logic
      // If we checked some players but playingCount is 0, we trust it.
      // If we checked 0 players (checkedCount == 0) but have streams, fallback to added count?
      // Requirement: "falling back to the count of added streams if active status is unreliable"
      // If checkedCount < youtubeStreams.length, it means some players are initializing.
      // We should probably wait for them. But if they stay 'unreliable', usage of added count is preferred.

      let effectiveCount = playingCount;
      if (checkedCount === 0 && youtubeStreams.length >= 2) {
        // If no player is ready yet/detectable, use added count
        effectiveCount = youtubeStreams.length;
      }

      // Check Thresholds
      let newLevel: 'soft' | 'strong' | null = null;
      if (effectiveCount >= 4) newLevel = 'strong';
      else if (effectiveCount >= 2) newLevel = 'soft';

      if (newLevel) {
        if (newLevel === 'soft' && !ytRiskLevelsShownRaw.current.soft) {
          setCurrentYTRiskCount(effectiveCount);
          setShowYTRiskDialog(true);
          ytRiskLevelsShownRaw.current.soft = true;
        } else if (newLevel === 'strong' && !ytRiskLevelsShownRaw.current.strong) {
          setCurrentYTRiskCount(effectiveCount);
          setShowYTRiskDialog(true);
          ytRiskLevelsShownRaw.current.strong = true;
        }
      }

    }, 3000); // Check every 3 seconds

    return () => clearInterval(checkInterval);
  }, [streams]);

  const handlePauseOtherYouTubeStreams = useCallback(() => {
    const youtubeStreams = streams.filter(s => s.platform === 'youtube');
    if (youtubeStreams.length <= 1) {
      setShowYTRiskDialog(false);
      return;
    }

    // Keep the first one, pause others
    const keeper = youtubeStreams[0];

    youtubeStreams.forEach(s => {
      if (s.id === keeper.id) return; // Skip the first one

      const p = window.players && window.players[s.id];
      if (p && p.type === 'youtube' && p.player) {
        try {
          if (typeof p.player.pauseVideo === 'function') {
            p.player.pauseVideo();
          }
        } catch (e) { /* ignore */ }
      }
    });
    setShowYTRiskDialog(false);
  }, [streams]);

  const handleRiskDontRemind = useCallback(() => {
    setShowYTRiskDialog(false);
    ytRiskSessionDismissedRaw.current = true;
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem('ytRiskDismissed', 'true');
    }
  }, []);

  // 初始化全局 streamCount（如果尚未初始化）
  if (typeof window !== 'undefined' && !window.streamCount) {
    window.streamCount = 0;
  }

  // 總音量狀態（從 localStorage 載入）
  const loadMasterVolume = () => {
    try {
      const saved = localStorage.getItem('userSettings');
      if (saved) {
        const settings = JSON.parse(saved);
        if (settings.masterVolume !== undefined && settings.masterVolume > 0) {
          return settings.masterVolume;
        }
      }
    } catch (e) {
      // 載入失敗，使用默認值
    }
    // 如果載入的值是 0，可能是因為之前靜音了，檢查是否有保存的 previousMasterVolume
    try {
      const saved = localStorage.getItem('userSettings');
      if (saved) {
        const settings = JSON.parse(saved);
        if (settings.previousMasterVolume !== undefined && settings.previousMasterVolume > 0) {
          return settings.previousMasterVolume;
        }
      }
    } catch (e) {
      // 忽略錯誤
    }
    return 100;
  };

  const [masterVolume, setMasterVolume] = useState(loadMasterVolume);
  const [masterMuted, setMasterMuted] = useState(() => {
    const initialVolume = loadMasterVolume();
    return initialVolume === 0;
  });

  // 同步 masterMuted 到全局變量
  useEffect(() => {
    (window as any).masterMuted = masterMuted;
  }, [masterMuted]);

  // 根據主題應用 dark 類到 document.documentElement
  useEffect(() => {
    if (typeof document !== 'undefined') {
      if (theme === 'dark') {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    }
  }, [theme]);

  // 初始載入完成後刷新收藏列表的開台狀態
  useEffect(() => {
    // 等待收藏系統和必要的 API 初始化完成
    const initAndRefreshFavorites = async () => {
      // 移除這裡的 wait loop，因為 favoritesService 已經導入且可用
      // 保持 API 載入邏輯

      try {
        // 載入 Twitch Data API（用於檢查開台狀態）
        if (!window.twitchApi || !window.twitchApi.checkMultipleChannelsLiveStatus) {
          await apiLoader.loadTwitchDataApi();
        }

        // 載入 YouTube Data API（用於檢查開台狀態）
        if (!window.youtubeApiUtils || !window.youtubeApiUtils.checkChannelLiveStatus) {
          await apiLoader.loadYouTubeDataApi();
        }

        // 等待一小段時間確保 API 完全初始化
        await new Promise(resolve => setTimeout(resolve, 500));

        // 觸發收藏列表刷新事件
        window.dispatchEvent(new CustomEvent('refreshFavoritesStatus'));
      } catch (error) {
        // API 載入失敗，但繼續嘗試刷新（可能部分功能可用）
        window.dispatchEvent(new CustomEvent('refreshFavoritesStatus'));
      }
    };

    // 延遲執行，確保所有腳本都已載入
    setTimeout(() => {
      initAndRefreshFavorites();

      // 嘗試從 IndexedDB 自動復原（或合併）數據
      // 這是為了防止 localStorage 數據意外丟失
      backupService.autoRestore().then(result => {
        if (result.restored) {
          console.log('[App] Data restored/merged from backup:', result.message);
          // 如果有數據變更，可能需要刷新 UI，這裡發送刷新事件
          window.dispatchEvent(new CustomEvent('refreshFavoritesStatus'));
          window.dispatchEvent(new CustomEvent('favoritesUpdated', { detail: { action: 'restore' } }));
          window.dispatchEvent(new CustomEvent('tagsUpdated')); // 刷新標籤
        }
      });
    }, 1000);
  }, []);

  // 聊天室管理器初始化 (ChatManager)
  useEffect(() => {
    console.log('[App] 初始化聊天室管理器...');

    // 動態導入以避免循環依賴或過早執行
    import('./features/chat/ChatManager').then(({ ChatManager }) => {
      const chatManager = new ChatManager();
      const legacyApi = chatManager.getLegacyApi();

      // 掛載到全局 window
      Object.assign(window, legacyApi);

      console.log('[App] 聊天室管理器已掛載到 window');

      // 發送事件通知其他組件
      window.dispatchEvent(new Event('chatFunctionsReady'));
    }).catch(err => {
      console.error('[App] 聊天室管理器初始化失敗:', err);
    });

    return () => {
      // 清理全局函數 (可選，但在 React 嚴格模式下可能有助於除錯)
      // 在此不刪除，因為可能會影響熱重載體驗
    };
  }, []);

  // 背景自動刷新機制 (Auto Refresh)
  useEffect(() => {
    // 檢查是否啟用自動刷新
    const isAutoRefreshEnabled = () => {
      if (typeof localStorage === 'undefined') return true; // 預設啟用
      const setting = localStorage.getItem('favoriteLiveStatusAutoRefresh');
      return setting !== 'false';
    };

    if (!isAutoRefreshEnabled()) return;

    // 獲取刷新間隔 (預設 25 分鐘)
    const getRefreshInterval = () => {
      if (typeof localStorage === 'undefined') return 25;
      const intervalStr = localStorage.getItem('favoriteLiveStatusAutoRefreshInterval');
      const interval = parseInt(intervalStr || '25', 10);
      return isNaN(interval) || interval <= 0 ? 25 : interval;
    };

    const intervalMinutes = getRefreshInterval();
    const intervalMs = intervalMinutes * 60 * 1000;

    console.log(`[AutoRefresh] 啟動背景自動刷新，間隔: ${intervalMinutes} 分鐘`);

    const intervalId = setInterval(() => {
      if (typeof document !== 'undefined' && !document.hidden) {
        // 僅在頁面可見時觸發，或者是希望背景也能跑？
        // 舊版邏輯無 visibility check。
        // 但為了節省資源，通常可以加上。不過使用者需求是 "背景自動刷新"，
        // 這裡的背景通常指 "非手動觸發"，而不是 "後台 tab"。
        // 為確保一致性，直接觸發。
        console.log('[AutoRefresh] 觸發定時刷新...');
        window.dispatchEvent(new CustomEvent('refreshFavoritesStatus'));
      }
    }, intervalMs);

    return () => clearInterval(intervalId);
  }, []);

  // 布局管理 (Moved to Store)
  // const { currentLayout, setLayout } = useLayout(streams.length); // Removed
  // Instead of useLayout, we might need these for ControlPanel if it takes props
  // But StreamContainer uses store. ControlPanel likely uses store or window methods.
  // Let's check usage in next steps. For now, comment out or verify usage.
  // Actually, let's just expose setLayout to global window if legacy needs it?
  // `useLayout` was updating localStorage and handling auto layout. Store now does that.
  // So we don't need this hook.


  // 聊天室布局管理 (Moved to Store)
  // const [chatLayoutType, setChatLayoutType] = useState<ChatLayoutType>('none');

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };


  // 添加串流
  const handleAddStream = useCallback(async (url: string) => {
    // 直接調用 Store Action (Validation logic moved to store)
    const result = await addStream(url);
    if (!result.success && result.message) {
      alert(result.message);
    }
  }, [addStream]);


  // 批量添加串流（優化版本）
  const handleBatchAddStreams = useCallback(async (urls: string[]) => {
    if (!urls || urls.length === 0) {
      return;
    }

    // 優化：提前載入 Twitch Player API（如果批量中包含 Twitch）
    const hasTwitch = urls.some(url =>
      url.includes('twitch.tv/') ||
      (!url.includes('http://') && !url.includes('https://') && !url.includes('youtube.com'))
    );

    if (hasTwitch) {
      try {
        await apiLoader.loadTwitchPlayerApi();
      } catch (error) {
        // 載入失敗，繼續處理
      }
    }

    // 優化：使用隊列機制，避免同時創建太多播放器
    const BATCH_SIZE = 3; // 每次同時創建 3 個播放器
    const DELAY_BETWEEN_BATCHES = 300; // 批次之間延遲 300ms

    for (let i = 0; i < urls.length; i += BATCH_SIZE) {
      const batch = urls.slice(i, i + BATCH_SIZE);

      // 並行處理當前批次
      const batchPromises = batch.map(url => handleAddStream(url));
      await Promise.allSettled(batchPromises);

      // 如果不是最後一批，等待一段時間再處理下一批
      if (i + BATCH_SIZE < urls.length) {
        await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
      }
    }
  }, [handleAddStream]);

  // 暴露 handleAddStream 到全局，以便收藏系統調用
  // 使用 useLayoutEffect 確保在 DOM 更新之前就設置，讓功能在頁面剛進入後就能立即使用
  React.useLayoutEffect(() => {
    // 立即設置，不等待依賴項變化
    (window as any).addStream = handleAddStream;
    (window as any).batchAddStreams = handleBatchAddStreams;
    // 設置標記，表明 React 版本的 addStream 已經準備好
    (window as any)._reactAddStreamReady = true;

    // 將處理程序注入到 favoritesLoader
    favoritesLoader.setAddStreamHandler(handleAddStream);
  }, [handleAddStream, handleBatchAddStreams]);

  // 使用 useEffect 作為備份，確保在 DOM 更新後也設置（雙重保障）
  useEffect(() => {
    // 再次確認設置（防止 useLayoutEffect 執行失敗）
    if (!(window as any)._reactAddStreamReady) {
      (window as any).addStream = handleAddStream;
      (window as any).batchAddStreams = handleBatchAddStreams;
      (window as any)._reactAddStreamReady = true;
      favoritesLoader.setAddStreamHandler(handleAddStream);
    }

    return () => {
      // 清除 favoritesLoader 的處理程序
      favoritesLoader.setAddStreamHandler(async () => { });

      // 使用 undefined 而不是 delete，避免刪除不可刪除的屬性
      try {
        (window as any).addStream = undefined;
        (window as any).batchAddStreams = undefined;
        (window as any)._reactAddStreamReady = false;
      } catch (e) {
        // 如果無法設置為 undefined，則忽略錯誤
      }
    };
  }, [handleAddStream, handleBatchAddStreams]);

  // 移除串流
  const handleRemoveStream = (id: number) => {
    // 清理播放器
    if (window.players && window.players[id]) {
      if (window.players[id].type === 'youtube' && window.players[id].player.destroy) {
        window.players[id].player.destroy();
      }
      delete window.players[id];
    }

    // 移除分離的聊天室（如果存在）
    const separatedChat = document.getElementById('separated-chat-' + id);
    if (separatedChat) {
      separatedChat.remove();
    }

    removeStream(id);
  };

  // 重新載入串流（參考 js/stream.js 的 reloadStream 函數）
  const handleReloadStream = (id: number) => {
    const stream = streams.find(s => s.id === id);
    if (!stream) return;

    // 保存當前狀態（參考 js/stream.js 第 507-509 行）
    const savedVolume = stream.volume || 100;
    const savedChatVisible = stream.chatVisible !== undefined ? stream.chatVisible : false;

    // 清理現有播放器（參考 js/stream.js 第 517-523 行）
    if (window.players && window.players[id]) {
      const player = window.players[id];
      if (player.type === 'youtube' && player.player && typeof player.player.destroy === 'function') {
        try {
          player.player.destroy();
        } catch (e) {
          // 清理失敗，繼續處理
        }
      }
      // Twitch 播放器不需要 destroy，直接刪除引用
      delete window.players[id];
    }

    // 清空播放器容器（參考 js/stream.js 第 525-529 行）
    const playerContainer = document.getElementById('player' + id);
    if (playerContainer) {
      playerContainer.innerHTML = '';
    }

    // 清空聊天室容器（如果存在）
    const chatContainer = document.getElementById(`chat${id}`);
    if (chatContainer) {
      chatContainer.innerHTML = '';
    }

    // 重置全局 streamData 中的播放器標記，並添加重載觸發器
    // 這會強制 StreamBox 重新初始化播放器（參考 js/stream.js 的重新建立播放器邏輯）
    if (window.streamData && window.streamData[id]) {
      window.streamData[id] = {
        ...window.streamData[id],
        volume: savedVolume,
        chatVisible: savedChatVisible,
        _reloadTrigger: Date.now() // 添加重載觸發器，強制重新創建播放器
      };
    }

    // 更新 streams 狀態以觸發 StreamBox 重新渲染
    // 這會導致 StreamBox 的 useEffect 重新執行，檢測到 _reloadTrigger 後重新創建播放器
    // 添加一個臨時的 key 來強制重新渲染（參考 js/stream.js 的重新建立播放器邏輯）
    // 更新 streams 狀態以觸發 StreamBox 重新渲染
    // 使用 Store updateStream
    updateStream(id, { volume: savedVolume, chatVisible: savedChatVisible, ...({ _reloadKey: Date.now() } as any) });

    // 恢復音量設定（參考 js/stream.js 第 551-569 行）
    // 音量會在 StreamBox 的 useEffect 中自動應用，因為我們已經更新了 stream.volume
    // 但為了確保，我們在播放器就緒後再次應用總音量
    setTimeout(() => {
      if (typeof (window as any).applyMasterVolumeToStream === 'function') {
        (window as any).applyMasterVolumeToStream(id);
      }
    }, 1000);
  };

  // 切換聊天室
  const handleToggleChat = (id: number) => {
    // 切換聊天室
    const stream = streams.find(s => s.id === id);
    if (stream) {
      updateStream(id, { chatVisible: !stream.chatVisible });
    }

    // 調用原有的 toggleChat 函數（如果存在）
    if (typeof (window as any).toggleChat === 'function') {
      (window as any).toggleChat(id);
    }
  };

  // 切換所有聊天室顯示/隱藏
  const handleToggleAllChat = (show: boolean) => {
    streams.forEach(s => {
      updateStream(s.id, { chatVisible: show });
    });
  };

  // 分離聊天室
  const handleSeparateChat = (id: number) => {
    if (typeof (window as any).separateChat === 'function') {
      (window as any).separateChat(id);
    }
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

    // 同步到全局變量
    (window as any).masterVolume = volume;

    // 同步到 DOM 元素（為了兼容舊的 updateMasterVolume 函數）
    const masterVolSlider = document.getElementById('master-volume');
    if (masterVolSlider && (masterVolSlider as HTMLInputElement).value !== undefined) {
      (masterVolSlider as HTMLInputElement).value = volume.toString();
    }

    // 保存音量到 localStorage（但不覆蓋 previousMasterVolume，除非用戶手動調整）
    try {
      const saved = localStorage.getItem('userSettings');
      const settings = saved ? JSON.parse(saved) : {};
      settings.masterVolume = volume;
      localStorage.setItem('userSettings', JSON.stringify(settings));
    } catch (e) {
      // 保存失敗，靜默處理
    }

    // 直接應用總音量到所有播放器
    // 優先級規則：單獨靜音的串流在調整總體音量時應該維持靜音
    const players = (window as any).players;
    const streamData = (window as any).streamData;

    if (players && streamData) {
      Object.keys(players).forEach(idStr => {
        const id = parseInt(idStr);
        if (players[id] && players[id].player && streamData[id]) {
          try {
            // 檢查該串流是否單獨靜音
            const streamIsMuted = streamData[id].isMuted || false;

            // 如果串流單獨靜音，維持靜音狀態（不調整音量）
            if (streamIsMuted) {
              if (streamData[id].platform === 'twitch') {
                if (typeof players[id].player.setMuted === 'function') {
                  players[id].player.setMuted(true);
                }
              } else if (streamData[id].platform === 'youtube') {
                if (typeof players[id].player.mute === 'function') {
                  players[id].player.mute();
                }
              }
              // 單獨靜音的串流不調整音量，直接返回
              return;
            }

            // 如果串流沒有單獨靜音，則根據總體音量調整
            const streamVol = streamData[id].volume || 100;
            const actualVol = Math.round((streamVol / 100) * volume);

            if (streamData[id].platform === 'twitch') {
              if (actualVol === 0) {
                if (typeof players[id].player.setMuted === 'function') {
                  players[id].player.setMuted(true);
                } else if (typeof players[id].player.setVolume === 'function') {
                  players[id].player.setVolume(0);
                }
              } else {
                if (typeof players[id].player.setMuted === 'function') {
                  players[id].player.setMuted(false);
                }
                if (typeof players[id].player.setVolume === 'function') {
                  players[id].player.setVolume(actualVol / 100);
                }
              }
            } else if (streamData[id].platform === 'youtube') {
              if (actualVol === 0) {
                if (typeof players[id].player.mute === 'function') {
                  players[id].player.mute();
                } else if (typeof players[id].player.setVolume === 'function') {
                  players[id].player.setVolume(0);
                }
              } else {
                if (typeof players[id].player.unMute === 'function') {
                  players[id].player.unMute();
                }
                if (typeof players[id].player.setVolume === 'function') {
                  players[id].player.setVolume(actualVol);
                }
              }
            }
          } catch (e) {
            // 靜默處理錯誤
          }
        }
      });
    }

    // 觸發自定義事件，通知其他組件總音量已改變
    window.dispatchEvent(new CustomEvent('masterVolumeChange', { detail: { volume } }));
  };

  // 處理全部靜音/取消靜音（保存和恢復音量值）
  const handleMasterMuteChange = (muted: boolean) => {
    if (muted) {
      // 靜音：保存當前音量值到 localStorage 的 previousMasterVolume
      // 無論當前音量是多少，都應該保存（以便取消靜音時恢復）
      try {
        const saved = localStorage.getItem('userSettings');
        const settings = saved ? JSON.parse(saved) : {};
        // 保存當前的總體音量（如果當前音量為 0，也保存，因為可能是用戶手動設為 0）
        // 但如果之前有保存的 previousMasterVolume 且當前音量為 0，則不覆蓋
        if (masterVolume > 0 || !settings.previousMasterVolume) {
          settings.previousMasterVolume = masterVolume;
        }
        // 同時保存當前的 masterVolume 到 localStorage
        settings.masterVolume = masterVolume;
        localStorage.setItem('userSettings', JSON.stringify(settings));
      } catch (e) {
        // 保存失敗，靜默處理
      }
      // 設置音量為 0，讓 slider 滑到 0%
      setMasterVolume(0);
      setMasterMuted(true);
      // 同步到全局變量
      (window as any).masterVolume = 0;
      (window as any).masterMuted = true;

      // 同步到 DOM 元素（為了兼容舊的 JavaScript 代碼）
      const masterVolSlider = document.getElementById('master-volume');
      if (masterVolSlider && (masterVolSlider as HTMLInputElement).value !== undefined) {
        (masterVolSlider as HTMLInputElement).value = '0';
      }
    } else {
      // 取消靜音：從 localStorage 讀取之前保存的音量值
      let restoreVolume = 100; // 默認值
      try {
        const saved = localStorage.getItem('userSettings');
        if (saved) {
          const settings = JSON.parse(saved);
          // 優先使用 previousMasterVolume，如果不存在則使用 masterVolume，最後使用默認值 100
          if (settings.previousMasterVolume !== undefined && settings.previousMasterVolume > 0) {
            restoreVolume = settings.previousMasterVolume;
          } else if (settings.masterVolume !== undefined && settings.masterVolume > 0) {
            restoreVolume = settings.masterVolume;
          }
        }
      } catch (e) {
        // 讀取失敗，使用默認值 100
      }

      // 更新音量狀態
      setMasterVolume(restoreVolume);
      setMasterMuted(false);

      // 同步到全局變量
      (window as any).masterVolume = restoreVolume;
      (window as any).masterMuted = false;

      // 同步到 DOM 元素（為了兼容舊的 JavaScript 代碼）
      const masterVolSlider = document.getElementById('master-volume');
      if (masterVolSlider && (masterVolSlider as HTMLInputElement).value !== undefined) {
        (masterVolSlider as HTMLInputElement).value = restoreVolume.toString();
      }

      // 更新 localStorage 中的 masterVolume（恢復後應該更新）
      try {
        const saved = localStorage.getItem('userSettings');
        const settings = saved ? JSON.parse(saved) : {};
        settings.masterVolume = restoreVolume;
        localStorage.setItem('userSettings', JSON.stringify(settings));
      } catch (e) {
        // 保存失敗，靜默處理
      }
    }

    // 直接對所有播放器應用靜音/取消靜音
    // 優先級規則：
    // - 靜音狀態：全部 > 單獨（如果全部靜音，所有串流都靜音）
    // - 取消靜音狀態：全部 < 單獨（如果單獨靜音，取消全部靜音時該串流保持靜音）
    const players = (window as any).players;
    const streamData = (window as any).streamData;

    if (players && streamData) {
      Object.keys(players).forEach(idStr => {
        const id = parseInt(idStr);
        if (players[id] && players[id].player && streamData[id]) {
          try {
            // 檢查該串流是否單獨靜音
            const streamIsMuted = streamData[id].isMuted || false;

            if (muted) {
              // 靜音：全部靜音優先，所有串流都靜音（無論單獨靜音狀態）
              if (streamData[id].platform === 'twitch') {
                if (typeof players[id].player.setMuted === 'function') {
                  players[id].player.setMuted(true);
                }
              } else if (streamData[id].platform === 'youtube') {
                if (typeof players[id].player.mute === 'function') {
                  players[id].player.mute();
                }
              }
            } else {
              // 取消靜音：單獨靜音優先，如果串流單獨靜音，則保持靜音
              if (streamIsMuted) {
                // 串流單獨靜音，保持靜音狀態（不取消）
                if (streamData[id].platform === 'twitch') {
                  if (typeof players[id].player.setMuted === 'function') {
                    players[id].player.setMuted(true);
                  }
                } else if (streamData[id].platform === 'youtube') {
                  if (typeof players[id].player.mute === 'function') {
                    players[id].player.mute();
                  }
                }
              } else {
                // 串流沒有單獨靜音，取消全部靜音時也取消該串流的靜音
                if (streamData[id].platform === 'twitch') {
                  if (typeof players[id].player.setMuted === 'function') {
                    players[id].player.setMuted(false);
                  }
                } else if (streamData[id].platform === 'youtube') {
                  if (typeof players[id].player.unMute === 'function') {
                    players[id].player.unMute();
                  }
                }
              }
            }
          } catch (e) {
            // 靜默處理錯誤
          }
        }
      });
    }

    // 觸發 updateMasterVolume 來更新所有播放器的音量（取消靜音時）
    if (!muted && typeof (window as any).updateMasterVolume === 'function') {
      (window as any).updateMasterVolume();
    }
  };

  // 音量變化
  const handleVolumeChange = (id: number, volume: number) => {
    const s = streams.find(st => st.id === id);
    // 更新全局 streamData
    if ((window as any).streamData && (window as any).streamData[id]) {
      (window as any).streamData[id].volume = volume;
    }

    // 如果調整音量且之前是靜音狀態，取消靜音
    const wasMuted = s?.isMuted || false;
    const newMutedState = volume === 0 ? true : false;

    // update store
    updateStream(id, { volume, isMuted: newMutedState });

    // 應用音量到播放器
    if ((window as any).players && (window as any).players[id] && (window as any).players[id].player) {
      const player = (window as any).players[id].player;
      const masterVol = (window as any).masterVolume || 100;
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
              if ((window as any).players && (window as any).players[id] && (window as any).players[id].player) {
                try {
                  if (actualVol === 0) {
                    if (typeof (window as any).players[id].player.mute === 'function') {
                      (window as any).players[id].player.mute();
                    }
                  } else {
                    if (typeof (window as any).players[id].player.unMute === 'function') {
                      (window as any).players[id].player.unMute();
                    }
                    if (typeof (window as any).players[id].player.setVolume === 'function') {
                      (window as any).players[id].player.setVolume(actualVol);
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

    // 更新全局 streamData
    if ((window as any).streamData && (window as any).streamData[id]) {
      (window as any).streamData[id].isMuted = newMutedState;
    }

    // Update Store
    updateStream(id, { isMuted: newMutedState });

    // 對播放器應用靜音/取消靜音操作
    // 使用全局的 players 和 streamData（與 js/volume.js 中的 muteAll 一致）
    const players = (window as any).players;
    const streamData = (window as any).streamData;

    if (players && players[id] && players[id].player && streamData && streamData[id]) {
      try {
        if (streamData[id].platform === 'twitch') {
          if (newMutedState) {
            // Twitch 播放器：使用 setMuted() 方法靜音
            // 即使在全部靜音狀態下，也要對播放器進行靜音操作
            if (typeof players[id].player.setMuted === 'function') {
              players[id].player.setMuted(true);
            } else if (typeof players[id].player.setVolume === 'function') {
              // 如果沒有 setMuted 方法，fallback 到設置音量為 0
              players[id].player.setVolume(0);
            }
          } else {
            // Twitch 播放器：使用 setMuted() 方法取消靜音
            // 但如果全部靜音，播放器應該保持靜音（全部靜音優先）
            if (!masterMuted) {
              if (typeof players[id].player.setMuted === 'function') {
                players[id].player.setMuted(false);
              }
              // 音量會通過 applyMasterVolumeToStream 來設置
              if (typeof (window as any).applyMasterVolumeToStream === 'function') {
                (window as any).applyMasterVolumeToStream(id);
              }
            }
            // 如果全部靜音，不取消播放器靜音（全部靜音優先）
          }
        } else if (streamData[id].platform === 'youtube') {
          if (newMutedState) {
            // YouTube 播放器：使用 mute() 方法或設置音量為 0
            // 即使在全部靜音狀態下，也要對播放器進行靜音操作
            if (typeof players[id].player.mute === 'function') {
              players[id].player.mute();
            } else if (typeof players[id].player.setVolume === 'function') {
              try {
                const playerState = players[id].player.getPlayerState();
                if (playerState !== undefined) {
                  players[id].player.setVolume(0);
                }
              } catch (e) {
                // 播放器尚未就緒，稍後再試
                setTimeout(() => {
                  if (players[id] && players[id].player) {
                    if (typeof players[id].player.mute === 'function') {
                      players[id].player.mute();
                    } else if (typeof players[id].player.setVolume === 'function') {
                      try {
                        players[id].player.setVolume(0);
                      } catch (err) {
                        // 靜默處理錯誤
                      }
                    }
                  }
                }, 500);
              }
            }
          } else {
            // YouTube 播放器：使用 unMute() 方法
            // 但如果全部靜音，播放器應該保持靜音（全部靜音優先）
            if (!masterMuted) {
              if (typeof players[id].player.unMute === 'function') {
                players[id].player.unMute();
              }
            }
            // 如果全部靜音，不取消播放器靜音（全部靜音優先）
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
          onShowTutorial={() => setShowTutorial(true)}
          onShowVersionHistory={() => setShowVersionHistory(true)}
          onShowFavorites={() => setShowFavorites(true)}
          onShowFeedback={() => setShowFeedback(true)}
          onTogglePanel={() => setIsPanelCollapsed(!isPanelCollapsed)}
          onAddStream={handleAddStream}
          onSearchFocusChange={setIsSearchFocused}
        />

        {streams.length > 0 && (
          <StreamContainer />
        )}

        {streams.length === 0 && (
          <div className="container mx-auto px-4 py-4" style={{ position: 'relative', zIndex: 10 }}>
            <WelcomeCard
              theme={theme}
              onShowVersionHistory={() => setShowVersionHistory(true)}
              onShowTutorial={() => setShowTutorial(true)}
              onShowAbout={() => setCurrentPage('about')}
              onNavigateToPrivacy={() => setCurrentPage('privacy')}
            />
          </div>
        )}

        <ControlPanel
          theme={theme}
          isCollapsed={isPanelCollapsed}
          onToggleCollapse={() => setIsPanelCollapsed(!isPanelCollapsed)}
          isSearchFocused={isSearchFocused}
          onShowFavorites={() => setShowFavorites(true)}
          onShowVersionHistory={() => setShowVersionHistory(true)}
          onShowTutorial={() => setShowTutorial(true)}
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

        {showVersionHistory && (
          <Suspense fallback={<div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">載入中...</div>}>
            <VersionHistory
              theme={theme}
              onClose={() => setShowVersionHistory(false)}
            />
          </Suspense>
        )}

        {showTutorial && (
          <Suspense fallback={<div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">載入中...</div>}>
            <Tutorial
              theme={theme}
              onClose={() => setShowTutorial(false)}
            />
          </Suspense>
        )}

        {showFavorites && (
          <Suspense fallback={<div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">載入中...</div>}>
            <FavoritesManager
              theme={theme}
              onClose={() => setShowFavorites(false)}
            />
          </Suspense>
        )}

        {showFeedback && (
          <Suspense fallback={<div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">載入中...</div>}>
            <FeedbackModal
              theme={theme}
              onClose={() => setShowFeedback(false)}
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