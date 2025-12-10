import { useState, useRef } from 'react';
import { Navbar } from './components/Navbar';
import { WelcomeCard } from './components/WelcomeCard';
import { VersionHistory } from './components/VersionHistory';
import { Tutorial } from './components/Tutorial';
import { ControlPanel } from './components/ControlPanel';
import { FavoritesManager } from './components/FavoritesManager';
import { AboutPage } from './components/AboutPage';
import { PrivacyPage } from './components/PrivacyPage';
import { StreamContainer } from './components/StreamContainer';
import { parseStreamUrl, validateUrl, type StreamData } from './utils/streamUtils';

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
  const [isPanelCollapsed, setIsPanelCollapsed] = useState(false);
  const [streams, setStreams] = useState<StreamData[]>([]);
  const streamCountRef = useRef(0);

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  // 初始化全局 streamCount
  if (typeof window !== 'undefined' && !window.streamCount) {
    window.streamCount = 0;
  }

  // 添加串流
  const handleAddStream = async (url: string) => {
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
      if (window.twitchApi && window.twitchApi.searchChannels) {
        try {
          const twitchResults = await window.twitchApi.searchChannels(trimmedUrl, 1);
          if (twitchResults && twitchResults.length > 0) {
            foundChannel = { ...twitchResults[0], platform: 'twitch', source: 'twitch' };
          }
        } catch (error: any) {
          searchError = error.message;
        }
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
        console.warn('YouTube 頻道 ID 驗證失敗:', error.message);
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
      chatVisible: parsed.platform !== 'youtube', // YouTube 預設隱藏，其他平台預設顯示
      name: null,
      displayName: null
    };

    // 更新全局 streamCount
    if (typeof window !== 'undefined') {
      window.streamCount = streamCountRef.current;
    }

    setStreams(prev => [...prev, newStream]);
  };

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

  // 重新載入串流
  const handleReloadStream = (id: number) => {
    const stream = streams.find(s => s.id === id);
    if (!stream) return;

    // 保存當前狀態
    const savedVolume = stream.volume || 100;
    const savedChatVisible = stream.chatVisible !== undefined ? stream.chatVisible : true;
    
    // 清理現有播放器
    if (window.players && window.players[id]) {
      if (window.players[id].type === 'youtube' && window.players[id].player.destroy) {
        window.players[id].player.destroy();
      }
      delete window.players[id];
    }
    
    // 清空播放器容器
    const playerContainer = document.getElementById('player' + id);
    if (playerContainer) {
      playerContainer.innerHTML = '';
    }
    
    // 重新建立播放器（這會在 StreamBox 的 useEffect 中自動處理）
    // 但我們需要觸發重新渲染
    setStreams(prev => prev.map(s => 
      s.id === id 
        ? { ...s, volume: savedVolume, chatVisible: savedChatVisible }
        : s
    ));
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

  // 分離聊天室
  const handleSeparateChat = (id: number) => {
    if (typeof (window as any).separateChat === 'function') {
      (window as any).separateChat(id);
    }
  };

  // 音量變化
  const handleVolumeChange = (id: number, volume: number) => {
    setStreams(prev => prev.map(s => 
      s.id === id ? { ...s, volume } : s
    ));
  };

  // Show Privacy Page
  if (currentPage === 'privacy') {
    return (
      <PrivacyPage 
        theme={theme} 
        onThemeToggle={toggleTheme}
        onBack={() => setCurrentPage('home')}
        onNavigateToAbout={() => setCurrentPage('about')}
      />
    );
  }

  // Show About Page
  if (currentPage === 'about') {
    return (
      <AboutPage 
        theme={theme} 
        onThemeToggle={toggleTheme}
        onBack={() => setCurrentPage('home')}
        onNavigateToPrivacy={() => setCurrentPage('privacy')}
      />
    );
  }

  // Show Home Page
  return (
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
      />
      
      {/* Stream Container */}
      <StreamContainer
        streams={streams}
        theme={theme}
        onRemove={handleRemoveStream}
        onReload={handleReloadStream}
        onToggleChat={handleToggleChat}
        onSeparateChat={handleSeparateChat}
        onVolumeChange={handleVolumeChange}
        onStreamDataChange={(id, data) => {
          setStreams(prev => prev.map(s => s.id === id ? { ...s, ...data } : s));
        }}
      />
      
      <div className={`container mx-auto px-4 py-12 ${isPanelCollapsed ? '' : 'pr-[516px]'} transition-all duration-300`}>
        {streams.length === 0 && (
          <WelcomeCard 
            theme={theme}
            onShowVersionHistory={() => setShowVersionHistory(true)}
            onShowTutorial={() => setShowTutorial(true)}
            onShowAbout={() => setCurrentPage('about')}
          />
        )}
      </div>

      <ControlPanel
        theme={theme}
        isCollapsed={isPanelCollapsed}
        onToggleCollapse={() => setIsPanelCollapsed(!isPanelCollapsed)}
        onShowFavorites={() => setShowFavorites(true)}
        onShowVersionHistory={() => setShowVersionHistory(true)}
        onShowTutorial={() => setShowTutorial(true)}
        onShowAbout={() => setCurrentPage('about')}
      />

      {showVersionHistory && (
        <VersionHistory 
          theme={theme} 
          onClose={() => setShowVersionHistory(false)} 
        />
      )}

      {showTutorial && (
        <Tutorial 
          theme={theme} 
          onClose={() => setShowTutorial(false)} 
        />
      )}

      {showFavorites && (
        <FavoritesManager 
          theme={theme} 
          onClose={() => setShowFavorites(false)} 
        />
      )}
    </div>
  );
}