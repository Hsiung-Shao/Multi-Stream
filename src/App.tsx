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
const AboutPage = lazy(() => import('./components/AboutPage').then(module => ({ 'default': module.AboutPage })));
const PrivacyPage = lazy(() => import('./components/PrivacyPage').then(module => ({ 'default': module.PrivacyPage })));
import { parseStreamUrl, validateUrl, type StreamData } from './utils/streamUtils';
import { useLayout } from './hooks/useLayout';
import type { ChatLayoutType } from './utils/chatLayoutUtils';
import { apiLoader } from './utils/apiLoader';

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
  }
}

export default function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const [currentPage, setCurrentPage] = useState<Page>('home');
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const [showFavorites, setShowFavorites] = useState(false);
  const [isPanelCollapsed, setIsPanelCollapsed] = useState(true);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [streams, setStreams] = useState<StreamData[]>([]);
  const streamCountRef = useRef(0);
  
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
      // 等待收藏系統初始化（最多等待 3 秒）
      let waitCount = 0;
      const maxWait = 30; // 30 * 100ms = 3 秒
      
      while (waitCount < maxWait) {
        if (window.favoriteStreams && window.favoriteCategories) {
          // 收藏系統已初始化，等待 Twitch API 和 YouTube API 準備好
          // 嘗試載入必要的 API
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
            break;
          } catch (error) {
            // API 載入失敗，但繼續嘗試刷新（可能部分功能可用）
            window.dispatchEvent(new CustomEvent('refreshFavoritesStatus'));
            break;
          }
        }
        
        waitCount++;
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    };
    
    // 延遲執行，確保所有腳本都已載入
    setTimeout(() => {
      initAndRefreshFavorites();
    }, 1000);
  }, []);

  // 布局管理
  const { currentLayout, setLayout } = useLayout(streams.length);
  
  // 聊天室布局管理
  const [chatLayoutType, setChatLayoutType] = useState<ChatLayoutType>('none');

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };


  // 添加串流
  const handleAddStream = useCallback(async (url: string) => {
    if (!url || !url.trim()) {
      alert('請輸入直播網址或頻道名稱');
      return;
    }

    const trimmedUrl = url.trim();

    // 如果輸入的不是 URL，嘗試搜尋 Twitch 或 YouTube 頻道
    if (!trimmedUrl.includes('http://') && !trimmedUrl.includes('https://') && 
        !trimmedUrl.includes('twitch.tv/') && !trimmedUrl.includes('youtube.com') && 
        !trimmedUrl.includes('youtu.be/')) {
      // 可能是頻道名稱，嘗試搜尋
      let foundChannel: any = null;
      let searchError: string | null = null;
      
      // 先嘗試 Twitch 搜尋
      // 按需載入 Twitch 數據 API（用於搜尋功能）
      try {
        await apiLoader.loadTwitchDataApi();
      } catch (error) {
        // 載入失敗，繼續處理
      }
      
      // 確保 twitchApi 已初始化
      if (!window.twitchApi || !window.twitchApi.searchChannels) {
        // API 尚未初始化
      }
      
      if (window.twitchApi && window.twitchApi.searchChannels) {
        try {
          const twitchResults = await window.twitchApi.searchChannels(trimmedUrl, 1);
          if (twitchResults && twitchResults.length > 0) {
            foundChannel = { ...twitchResults[0], platform: 'twitch', source: 'twitch' };
          }
        } catch (error: any) {
          searchError = error.message || '搜尋失敗';
        }
      } else {
        searchError = 'Twitch API 未初始化';
      }
      
      if (foundChannel) {
        // 使用第一個搜尋結果
        url = foundChannel.url;
      } else {
        if (searchError) {
          alert(`搜尋頻道失敗: ${searchError}。請直接輸入完整的 Twitch 或 YouTube 網址`);
        } else {
          alert(`找不到頻道 "${trimmedUrl}"，請輸入完整的 Twitch 或 YouTube 網址`);
        }
        return;
      }
    }

    // 驗證 URL
    const urlValidation = validateUrl(url);
    if (!urlValidation.valid) {
      alert(urlValidation.error);
      return;
    }

    // 解析 URL
    const parsed = parseStreamUrl(url);
    if (!parsed.platform || parsed.error) {
      alert(parsed.error || '無法解析 URL');
      return;
    }

    // 對於 YouTube，如果有 channelId，驗證 videoId 是否屬於該頻道
    if (parsed.platform === 'youtube' && parsed.channelId && parsed.videoId) {
      try {
        // 按需載入 YouTube 數據 API（用於頻道驗證）
        await apiLoader.loadYouTubeDataApi();
        
        if (window.youtubeApiUtils && window.youtubeApiUtils.getChannelIdFromVideoId) {
          const actualChannelId = await window.youtubeApiUtils.getChannelIdFromVideoId(parsed.videoId);
          
          if (actualChannelId && actualChannelId !== parsed.channelId) {
            alert(`頻道 ID 驗證失敗：\n\n該影片不屬於指定的頻道。\n\n預期頻道 ID: ${parsed.channelId}\n實際頻道 ID: ${actualChannelId}\n\n請確認您輸入的網址是否正確。`);
            return;
          }
          
          if (actualChannelId) {
            parsed.channelId = actualChannelId;
          }
        }
        } catch (error: any) {
          // 驗證失敗，繼續處理
        }
    }

    // 嘗試從收藏列表中獲取名稱
    let displayName: string | null = null;
    let name: string | null = null;
    
    if (window.favoriteStreams && typeof window.favoriteStreams.getList === 'function') {
      try {
        const favorites = window.favoriteStreams.getList();
        const favorite = favorites.find(fav => {
          if (fav.platform === parsed.platform) {
            if (parsed.platform === 'twitch' && fav.channelId === parsed.channelId) {
              return true;
            } else if (parsed.platform === 'youtube') {
              // YouTube 可以通過 channelId 或 videoId 匹配
              if (fav.channelId && parsed.channelId && fav.channelId === parsed.channelId) {
                return true;
              } else if (fav.videoId && parsed.videoId && fav.videoId === parsed.videoId) {
                return true;
              } else if (fav.url && url && fav.url === url) {
                return true;
              }
            }
          }
          return false;
        });
        
        if (favorite && favorite.name) {
          displayName = favorite.name;
          name = favorite.name;
        }
      } catch (error) {
        // 獲取名稱失敗，繼續處理
      }
    }

    // 創建新的串流數據
    streamCountRef.current++;
    const newStream: StreamData = {
      id: streamCountRef.current,
      platform: parsed.platform,
      channelId: parsed.channelId,
      videoId: parsed.videoId,
      originalUrl: url,
      volume: 100,
      chatVisible: false, // 所有平台預設隱藏聊天室
      isMuted: false,
      name: name,
      displayName: displayName
    };

    // 更新全局 streamCount
    if (typeof window !== 'undefined') {
      window.streamCount = streamCountRef.current;
    }

    setStreams(prev => [...prev, newStream]);
    
    // 同步到全局 streamData（為了兼容舊代碼）
    if (window.streamData) {
      window.streamData[newStream.id] = {
        platform: newStream.platform,
        channelId: newStream.channelId,
        videoId: newStream.videoId,
        originalUrl: newStream.originalUrl,
        volume: newStream.volume,
        chatVisible: newStream.chatVisible,
        name: newStream.name,
        displayName: newStream.displayName
      };
    }
  }, []);

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
  }, [handleAddStream, handleBatchAddStreams]);
  
  // 使用 useEffect 作為備份，確保在 DOM 更新後也設置（雙重保障）
  useEffect(() => {
    // 再次確認設置（防止 useLayoutEffect 執行失敗）
    if (!(window as any)._reactAddStreamReady) {
      (window as any).addStream = handleAddStream;
      (window as any).batchAddStreams = handleBatchAddStreams;
      (window as any)._reactAddStreamReady = true;
    }
    
    return () => {
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
    
    setStreams(prev => prev.filter(s => s.id !== id));
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
    setStreams(prev => prev.map(s => 
      s.id === id 
        ? { ...s, volume: savedVolume, chatVisible: savedChatVisible, _reloadKey: Date.now() }
        : s
    ));
    
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
    setStreams(prev => prev.map(s => 
      s.id === id 
        ? { ...s, chatVisible: !s.chatVisible }
        : s
    ));
    
    // 調用原有的 toggleChat 函數（如果存在）
    if (typeof (window as any).toggleChat === 'function') {
      (window as any).toggleChat(id);
    }
  };

  // 切換所有聊天室顯示/隱藏
  const handleToggleAllChat = (show: boolean) => {
    setStreams(prev => {
      const updatedStreams = prev.map(s => ({ ...s, chatVisible: show }));
      
      // 更新全局 streamData 狀態（與舊代碼兼容）
      updatedStreams.forEach(stream => {
        if (window.streamData && window.streamData[stream.id]) {
          window.streamData[stream.id].chatVisible = show;
        }
      });
      
      return updatedStreams;
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
    setStreams(prev => {
      const updatedStreams = prev.map(s => {
        if (s.id === id) {
          // 更新全局 streamData
          if ((window as any).streamData && (window as any).streamData[id]) {
            (window as any).streamData[id].volume = volume;
          }
          
          // 如果調整音量且之前是靜音狀態，取消靜音
          const wasMuted = s.isMuted || false;
          const newMutedState = volume === 0 ? true : false;
          
          // 應用音量到播放器
          if ((window as any).players && (window as any).players[id] && (window as any).players[id].player) {
            const player = (window as any).players[id].player;
            const masterVol = (window as any).masterVolume || 100;
            const actualVol = Math.round((volume / 100) * masterVol);
            
            try {
              if (s.platform === 'twitch') {
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
              } else if (s.platform === 'youtube') {
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
          
          return { ...s, volume, isMuted: newMutedState };
        }
        return s;
      });
      
      return updatedStreams;
    });
  };

  // 切換靜音（簡化版本，與 muteAll 一樣簡單）
  const handleToggleMute = (id: number) => {
    const masterMuted = (window as any).masterMuted || false;
    
    setStreams(prev => {
      const updatedStreams = prev.map(s => {
        if (s.id === id) {
          const newMutedState = !(s.isMuted || false);
          
          // 更新全局 streamData
          if ((window as any).streamData && (window as any).streamData[id]) {
            (window as any).streamData[id].isMuted = newMutedState;
          }
          
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
          
          return { ...s, isMuted: newMutedState };
        }
        return s;
      });
      
      return updatedStreams;
    });
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
        onTogglePanel={() => setIsPanelCollapsed(!isPanelCollapsed)}
        onAddStream={handleAddStream}
        onSearchFocusChange={setIsSearchFocused}
      />
      
      {/* Stream Container - Only render when there are streams */}
      {streams.length > 0 && (
        <StreamContainer
          streams={streams}
          theme={theme}
          layoutType={currentLayout}
          chatLayoutType={chatLayoutType}
          onRemove={handleRemoveStream}
          onReload={handleReloadStream}
          onToggleChat={handleToggleChat}
          onSeparateChat={handleSeparateChat}
          onVolumeChange={handleVolumeChange}
          onStreamDataChange={(id, data) => {
            setStreams(prev => prev.map(s => s.id === id ? { ...s, ...data } : s));
          }}
        />
      )}
      
      <div className="container mx-auto px-4 py-4" style={{ position: 'relative', zIndex: 10 }}>
        {streams.length === 0 && (
          <WelcomeCard 
            theme={theme}
            onShowVersionHistory={() => setShowVersionHistory(true)}
            onShowTutorial={() => setShowTutorial(true)}
            onShowAbout={() => setCurrentPage('about')}
            onNavigateToPrivacy={() => setCurrentPage('privacy')}
          />
        )}
      </div>

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
        currentLayout={currentLayout}
        onLayoutChange={setLayout}
        chatLayoutType={chatLayoutType}
        onChatLayoutChange={setChatLayoutType}
        onVolumeChange={handleVolumeChange}
        onToggleMute={handleToggleMute}
        onRemoveStream={handleRemoveStream}
        onToggleAllChat={handleToggleAllChat}
        masterVolume={masterVolume}
        masterMuted={masterMuted}
        onMasterVolumeChange={handleMasterVolumeChange}
        onMasterMuteChange={handleMasterMuteChange}
        onMoveStreamUp={(id) => {
          setStreams(prev => {
            const index = prev.findIndex(s => s.id === id);
            if (index <= 0) return prev;
            const newStreams = [...prev];
            [newStreams[index - 1], newStreams[index]] = [newStreams[index], newStreams[index - 1]];
            return newStreams;
          });
        }}
        onMoveStreamDown={(id) => {
          setStreams(prev => {
            const index = prev.findIndex(s => s.id === id);
            if (index < 0 || index >= prev.length - 1) return prev;
            const newStreams = [...prev];
            [newStreams[index], newStreams[index + 1]] = [newStreams[index + 1], newStreams[index]];
            return newStreams;
          });
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
      </div>
    </>
  );
}