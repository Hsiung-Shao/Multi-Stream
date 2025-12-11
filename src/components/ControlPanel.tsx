import React, { useState, useEffect, useRef, useCallback } from 'react';
import { RefreshCw, Volume2, VolumeX, ChevronUp, ChevronDown, GripVertical, X, Gamepad2, Youtube, Folder, FolderOpen, Star, Play, ChevronRight } from 'lucide-react';
import { Button } from './ui/button';
import Box from '@mui/material/Box';
import Slider from '@mui/material/Slider';
import { Switch } from './ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import type { StreamData } from '../utils/streamUtils';
import type { LayoutType } from '../utils/layoutUtils';
import type { ChatLayoutType } from '../utils/chatLayoutUtils';
import { useI18n } from '../i18n/index';

interface ControlPanelProps {
  theme: 'light' | 'dark';
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onShowFavorites: () => void;
  onShowVersionHistory: () => void;
  onShowTutorial: () => void;
  onShowAbout: () => void;
  streams: StreamData[];
  currentLayout?: LayoutType;
  onLayoutChange?: (layout: LayoutType) => void;
  chatLayoutType?: ChatLayoutType;
  onChatLayoutChange?: (layout: ChatLayoutType) => void;
  onVolumeChange?: (id: number, volume: number) => void;
  onMoveStreamUp?: (id: number) => void;
  onMoveStreamDown?: (id: number) => void;
  onRemoveStream?: (id: number) => void;
  onToggleMute?: (id: number) => void;
  onToggleAllChat?: (show: boolean) => void;
  masterVolume?: number;
  masterMuted?: boolean;
  onMasterVolumeChange?: (volume: number) => void;
  onMasterMuteChange?: (muted: boolean) => void;
  onAddStream?: (url: string) => void;
}

interface FavoriteItem {
  id: string;
  url: string;
  name: string;
  platform: 'twitch' | 'youtube';
  channelId?: string;
  videoId?: string;
  categoryId?: string | null;
  addedAt: string;
  isLive?: boolean | null;
  lastChecked?: string | null;
  viewerCount?: number;
  gameName?: string;
}

interface Category {
  id: string;
  name: string;
}

// 排序函數：開台狀態 > 未開台
const sortFavorites = (favs: FavoriteItem[]) => {
  return [...favs].sort((a, b) => {
    const aIsLive = a.isLive === true;
    const bIsLive = b.isLive === true;
    // 開台狀態優先
    if (aIsLive && !bIsLive) return -1;
    if (!aIsLive && bIsLive) return 1;
    return 0;
  });
};

// 聲明全局類型
declare global {
  interface Window {
    favoriteStreams?: {
      getList: () => FavoriteItem[];
      add: (url: string, name?: string, categoryId?: string | null, providedChannelId?: string | null) => Promise<{ success: boolean; message: string; item?: FavoriteItem }>;
      load: (item: FavoriteItem | string) => Promise<{ success: boolean; message: string }>;
      loadMultiple: (items: FavoriteItem[]) => Promise<{ success: boolean; message: string }>;
      saveList: (list: FavoriteItem[]) => void;
    };
    favoriteCategories?: {
      getList: () => Category[];
    };
    twitchApi?: {
      checkMultipleChannelsLiveStatus: (channelIds: string[]) => Promise<Record<string, { isLive: boolean; viewerCount?: number; gameName?: string }>>;
    };
    youtubeApiUtils?: {
      checkChannelLiveStatus: (channelId: string) => Promise<{ isLive: boolean }>;
    };
  }
}

export function ControlPanel({ 
  theme, 
  isCollapsed, 
  onToggleCollapse,
  onShowFavorites,
  onShowVersionHistory,
  onShowTutorial,
  onShowAbout,
  streams,
  currentLayout = 1,
  onLayoutChange,
  chatLayoutType = 'none',
  onChatLayoutChange,
  onVolumeChange,
  onMoveStreamUp,
  onMoveStreamDown,
  onRemoveStream,
  onToggleMute,
  onToggleAllChat,
  masterVolume = 100,
  masterMuted = false,
  onMasterVolumeChange,
  onMasterMuteChange,
  onAddStream
}: ControlPanelProps) {
  const { t } = useI18n();
  const [showAllChat, setShowAllChat] = useState(false);
  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  // 處理全域音量變化
  const handleMasterVolumeChange = (newVolume: number) => {
    // 如果從靜音狀態拖動到非零值，自動取消靜音
    if (newVolume > 0 && masterMuted && onMasterMuteChange) {
      onMasterMuteChange(false);
    }
    if (onMasterVolumeChange) {
      onMasterVolumeChange(newVolume);
    }
    // 同步到隱藏的 input 元素（用於與舊的 JavaScript 代碼兼容）
    const masterVolSlider = document.getElementById('master-volume') as HTMLInputElement;
    if (masterVolSlider) {
      masterVolSlider.value = newVolume.toString();
      // 觸發 input 事件，讓舊的 JavaScript 代碼能夠響應
      masterVolSlider.dispatchEvent(new Event('input', { bubbles: true }));
    }
  };

  // 處理全域靜音/取消靜音
  const handleMasterMuteAll = () => {
    if (onMasterMuteChange) {
      onMasterMuteChange(!masterMuted);
    }
  };
  
  // 同步 showAllChat 狀態：當所有串流的聊天室都顯示時，開關應該是開啟的
  useEffect(() => {
    if (streams.length === 0) {
      setShowAllChat(false);
      return;
    }
    
    // 檢查是否所有串流的聊天室都顯示
    // 只有當所有串流的聊天室都顯示時，開關才是 true
    const allChatsVisible = streams.every(s => s.chatVisible === true);
    setShowAllChat(allChatsVisible);
  }, [streams]);

  // 載入收藏和分類列表
  const loadFavorites = useCallback(() => {
    if (window.favoriteStreams) {
      setFavorites(window.favoriteStreams.getList());
    }
    if (window.favoriteCategories) {
      setCategories(window.favoriteCategories.getList());
    }
  }, []);

  useEffect(() => {
    loadFavorites();
    // 監聽收藏更新事件
    const handleFavoritesUpdate = () => {
      loadFavorites();
    };
    window.addEventListener('favoritesUpdated', handleFavoritesUpdate);
    return () => {
      window.removeEventListener('favoritesUpdated', handleFavoritesUpdate);
    };
  }, [loadFavorites]);

  // 刷新開台狀態
  const handleRefreshStatus = async () => {
    if (!window.favoriteStreams || !window.twitchApi) return;
    
    setIsRefreshing(true);
    try {
      const favoritesList = window.favoriteStreams.getList();
      const twitchFavorites = favoritesList.filter(f => f.platform === 'twitch' && f.channelId);
      const youtubeFavorites = favoritesList.filter(f => f.platform === 'youtube' && f.channelId);
      
      let updatedFavorites = [...favoritesList];
      
      // 更新 Twitch 開台狀態
      if (twitchFavorites.length > 0 && window.twitchApi.checkMultipleChannelsLiveStatus) {
        const channelIds = twitchFavorites.map(f => f.channelId!);
        const liveStatuses = await window.twitchApi.checkMultipleChannelsLiveStatus(channelIds);
        
        // 更新收藏列表中的開台狀態
        updatedFavorites = updatedFavorites.map(fav => {
          if (fav.platform === 'twitch' && fav.channelId && liveStatuses[fav.channelId]) {
            return {
              ...fav,
              isLive: liveStatuses[fav.channelId].isLive || false,
              lastChecked: new Date().toISOString(),
              // 保存額外信息到 favorite 對象中（用於顯示）
              viewerCount: liveStatuses[fav.channelId].viewerCount,
              gameName: liveStatuses[fav.channelId].gameName
            } as FavoriteItem & { viewerCount?: number; gameName?: string };
          }
          return fav;
        });
      }
      
      // 更新 YouTube 開台狀態
      if (youtubeFavorites.length > 0 && window.youtubeApiUtils?.checkChannelLiveStatus) {
        for (const fav of youtubeFavorites) {
          if (fav.channelId) {
            try {
              const status = await window.youtubeApiUtils.checkChannelLiveStatus(fav.channelId);
              updatedFavorites = updatedFavorites.map(f => {
                if (f.id === fav.id) {
                  return {
                    ...f,
                    isLive: status.isLive || false,
                    lastChecked: new Date().toISOString()
                  };
                }
                return f;
              });
            } catch (e) {
              // 靜默處理錯誤
            }
          }
        }
      }
      
      // 保存更新後的收藏列表
      if (window.favoriteStreams.saveList) {
        window.favoriteStreams.saveList(updatedFavorites);
      }
      setFavorites(updatedFavorites);
    } catch (e) {
      console.error('刷新開台狀態失敗:', e);
    } finally {
      setIsRefreshing(false);
    }
  };

  // 切換分類展開/收起
  const toggleCategory = (categoryId: string) => {
    setExpandedCategories(prev => {
      const newSet = new Set(prev);
      if (newSet.has(categoryId)) {
        newSet.delete(categoryId);
      } else {
        newSet.add(categoryId);
      }
      return newSet;
    });
  };

  // 載入收藏串流
  const handleLoadFavorite = (favorite: FavoriteItem) => {
    if (window.favoriteStreams && window.favoriteStreams.load) {
      window.favoriteStreams.load(favorite).then(result => {
        if (result.success && onAddStream) {
          onAddStream(favorite.url);
        }
      });
    } else if (onAddStream) {
      onAddStream(favorite.url);
    }
  };

  // 收藏當前串流
  const handleAddCurrentToFavorites = async () => {
    if (streams.length === 0) return;
    
    if (!window.favoriteStreams) {
      alert('收藏系統未初始化');
      return;
    }

    // 收集所有當前串流
    const currentStreams = streams.map(stream => {
      let url = '';
      let channelId: string | undefined;
      
      if (stream.platform === 'twitch' && stream.channelId) {
        url = `https://www.twitch.tv/${stream.channelId}`;
        channelId = stream.channelId;
      } else if (stream.platform === 'youtube' && stream.channelId) {
        url = `https://www.youtube.com/channel/${stream.channelId}/live`;
        channelId = stream.channelId;
      } else if (stream.platform === 'youtube' && stream.videoId) {
        url = `https://www.youtube.com/watch?v=${stream.videoId}`;
      }
      
      return {
        url,
        name: stream.displayName || stream.name || stream.channelId || stream.videoId || '',
        channelId
      };
    }).filter(s => s.url);

    if (currentStreams.length === 0) {
      alert('沒有可收藏的串流');
      return;
    }

    // 逐個添加收藏
    let successCount = 0;
    for (const stream of currentStreams) {
      try {
        const result = await window.favoriteStreams.add(
          stream.url,
          stream.name,
          null, // 默認未分類
          stream.channelId || undefined
        );
        if (result.success) {
          successCount++;
        }
      } catch (e) {
        console.error('添加收藏失敗:', e);
      }
    }

    loadFavorites();
    if (successCount > 0) {
      alert(`成功收藏 ${successCount} 個串流`);
    }
  };
  
  // 應用總音量到所有串流
  const applyMasterVolumeToAllStreams = (masterVol: number) => {
    // 遍歷所有串流並應用總音量
    streams.forEach(stream => {
      if (!(window as any).streamData || !(window as any).streamData[stream.id]) return;
      if (!(window as any).players || !(window as any).players[stream.id] || !(window as any).players[stream.id].player) return;
      
      const player = (window as any).players[stream.id].player;
      const streamVol = stream.volume || 100;
      
      // 計算實際音量（考慮總音量）
      const actualVol = Math.round((streamVol / 100) * masterVol);
      
      try {
        if ((window as any).players[stream.id].type === 'twitch') {
          // Twitch 播放器
          if (actualVol === 0) {
            if (typeof player.setMuted === 'function') {
              player.setMuted(true);
            } else if (typeof player.setVolume === 'function') {
              player.setVolume(0);
            }
          } else {
            // 如果音量不為 0，先取消靜音，再設置音量
            if (typeof player.setMuted === 'function') {
              player.setMuted(false);
            }
            if (typeof player.setVolume === 'function') {
              player.setVolume(actualVol / 100);
            }
          }
        } else if ((window as any).players[stream.id].type === 'youtube') {
          // YouTube 播放器
          try {
            const playerState = player.getPlayerState();
            if (playerState !== undefined) {
              if (actualVol === 0) {
                if (typeof player.mute === 'function') {
                  player.mute();
                } else if (typeof player.setVolume === 'function') {
                  player.setVolume(0);
                }
              } else {
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
              if ((window as any).players && (window as any).players[stream.id] && (window as any).players[stream.id].player) {
                try {
                  if (actualVol === 0) {
                    if (typeof (window as any).players[stream.id].player.mute === 'function') {
                      (window as any).players[stream.id].player.mute();
                    }
                  } else {
                    if (typeof (window as any).players[stream.id].player.unMute === 'function') {
                      (window as any).players[stream.id].player.unMute();
                    }
                    if (typeof (window as any).players[stream.id].player.setVolume === 'function') {
                      (window as any).players[stream.id].player.setVolume(actualVol);
                    }
                  }
                } catch (err) {
                  // 靜默處理錯誤
                }
              }
            }, 500);
          }
        }
      } catch (e) {
        // 靜默處理錯誤
      }
    });
  };

  // 同步總音量到全局變量並更新 DOM - 參考 js/volume.js
  useEffect(() => {
    (window as any).masterVolume = masterVolume;
    
    // 更新 DOM 中的總音量滑塊（與舊代碼兼容）
    const masterVolSlider = document.getElementById('master-volume') as HTMLInputElement;
    if (masterVolSlider) {
      // 如果是 input 元素，直接設置 value
      if (masterVolSlider.tagName === 'INPUT') {
        masterVolSlider.value = masterVolume.toString();
      }
      // 如果是其他元素，設置 data-value 屬性（供舊代碼讀取）
      masterVolSlider.setAttribute('data-value', masterVolume.toString());
    }
    
    // 注意：不要直接操作 master-volume-value，因為 React 已經通過 {masterVolume}% 來渲染
    // 直接操作 DOM 會與 React 的渲染衝突
    
    // 直接應用總音量到所有串流
    if (typeof (window as any).applyMasterVolumeToAllStreams === 'function') {
      (window as any).applyMasterVolumeToAllStreams(masterVolume);
    }
    
    // 觸發自定義事件，通知 StreamBox 總音量已改變
    window.dispatchEvent(new CustomEvent('masterVolumeChange', { detail: { volume: masterVolume } }));
    
    // 觸發 updateMasterVolume 函數來更新所有播放器的音量（與舊代碼兼容）
    if (typeof (window as any).updateMasterVolume === 'function') {
      (window as any).updateMasterVolume();
    }
    
    // 保存到 localStorage（調用 autoSaveSettings 如果存在，以保持一致性）
    try {
      const saved = localStorage.getItem('userSettings');
      const settings = saved ? JSON.parse(saved) : {};
      settings.masterVolume = masterVolume;
      localStorage.setItem('userSettings', JSON.stringify(settings));
      
      // 調用 autoSaveSettings（如果存在）以觸發其他保存邏輯
      if (typeof (window as any).autoSaveSettings === 'function') {
        (window as any).autoSaveSettings();
      }
    } catch (e) {
      // 保存失敗，靜默處理
    }
  }, [masterVolume]);
  
  const [navbarHeight, setNavbarHeight] = useState(64); // 默認 64px (4rem)

  useEffect(() => {
    const updateNavbarHeight = () => {
      const navbar = document.querySelector('nav');
      if (navbar) {
        const height = navbar.getBoundingClientRect().height;
        setNavbarHeight(height);
        // 更新 CSS 變量
        document.documentElement.style.setProperty('--navbar-height', `${height}px`);
      }
    };

    updateNavbarHeight();
    window.addEventListener('resize', updateNavbarHeight);
    
    return () => {
      window.removeEventListener('resize', updateNavbarHeight);
    };
  }, []);

  const layouts = [
    { id: 1, icon: '📺', label: t('controlPanel.singleView'), cols: 1, rows: 1 },
    { id: 2, icon: '⬅️➡️', label: t('controlPanel.splitHorizontal'), cols: 2, rows: 1 },
    { id: 3, icon: '⬆️⬇️', label: t('controlPanel.splitVertical'), cols: 1, rows: 2 },
    { id: 4, icon: '⊞', label: t('controlPanel.grid4'), cols: 2, rows: 2 },
    { id: 5, icon: '⬆️⬇️⬇️', label: t('controlPanel.largeTop3'), cols: 3, rows: 2, special: 'top-large-bottom-three' },
    { id: 6, icon: '⊞⊞', label: t('controlPanel.grid2x3'), cols: 3, rows: 2 },
    { id: 9, icon: '⊞⊞⊞', label: t('controlPanel.grid3x3'), cols: 3, rows: 3 },
  ];

  const chatLayouts = [
    { id: 1, label: t('common.close'), icon: '□' },
    { id: 2, label: t('controlPanel.singleChatLayout'), icon: '▢' },
    { id: 3, label: t('controlPanel.dualColumnChat'), icon: '▢▢' },
    { id: 4, label: t('controlPanel.quadChat'), icon: '▦' },
  ];

  if (isCollapsed) {
    return null;
  }

  return (
    <div 
      className={`fixed right-0 w-[500px] ${theme === 'dark' ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-300'} border-l shadow-2xl overflow-y-auto`}
      style={{ 
        top: `${navbarHeight}px`,
        height: `calc(100vh - ${navbarHeight}px)`,
        zIndex: 40
      }}
    >
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className={`${theme === 'dark' ? 'text-white' : 'text-black'}`}>{t('controlPanel.title')}</h2>
        </div>

        {/* Layout Control */}
        <Section theme={theme} title={t('controlPanel.layoutControl')}>
          <div className="grid grid-cols-4 gap-2">
            {layouts.map((layout) => (
              <button
                key={layout.id}
                onClick={() => {
                  if (onLayoutChange) {
                    onLayoutChange(layout.id as LayoutType);
                  }
                }}
                title={layout.label}
                aria-label={layout.label}
                className={`aspect-square rounded-lg border-2 transition-all ${
                  currentLayout === layout.id
                    ? 'border-purple-500 bg-purple-500/20'
                    : theme === 'dark'
                    ? 'border-gray-700 bg-gray-800 hover:border-purple-500/50'
                    : 'border-gray-300 bg-gray-100 hover:border-purple-500/50'
                }`}
              >
                <LayoutPreview 
                  layoutId={layout.id} 
                  cols={layout.cols} 
                  rows={layout.rows} 
                  special={layout.special}
                  theme={theme} 
                />
              </button>
            ))}
          </div>
        </Section>

        {/* Chat Layout */}
        <Section theme={theme} title={t('controlPanel.sideChatLayout')}>
          <div className="grid grid-cols-4 gap-2">
            {chatLayouts.map((layout) => {
              const chatLayoutTypeMap: Record<number, ChatLayoutType> = {
                1: 'none',
                2: 'single',
                3: 'dual',
                4: 'quad'
              };
              const mappedType = chatLayoutTypeMap[layout.id] || 'none';
              const isSelected = chatLayoutType === mappedType;
              
              return (
                <button
                  key={layout.id}
                  onClick={() => {
                    if (onChatLayoutChange) {
                      onChatLayoutChange(mappedType);
                    }
                  }}
                  title={layout.label}
                  aria-label={layout.label}
                  className={`aspect-video rounded-lg border-2 transition-all flex items-center justify-center ${
                    isSelected
                      ? 'border-purple-500 bg-purple-500/20'
                      : theme === 'dark'
                      ? 'border-gray-700 bg-gray-800 hover:border-purple-500/50'
                      : 'border-gray-300 bg-gray-100 hover:border-purple-500/50'
                  }`}
                >
                  <ChatLayoutPreview id={layout.id} theme={theme} />
                </button>
              );
            })}
          </div>
        </Section>

        {/* Chat Control */}
        <Section theme={theme} title={t('controlPanel.chatControl')}>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className={`text-sm ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                {t('controlPanel.showAllChats')}
              </label>
              <Switch 
                checked={showAllChat} 
                onCheckedChange={(checked) => {
                  // 調用回調函數來更新所有串流的聊天室狀態
                  // showAllChat 狀態會通過 useEffect 自動同步
                  if (onToggleAllChat) {
                    onToggleAllChat(checked);
                  }
                }} 
              />
            </div>
          </div>
        </Section>

        {/* Favorites */}
        <Section theme={theme} title={t('controlPanel.favoriteStreams')}>
          <div className="space-y-3">
            <div className="flex gap-2">
              <Button
                variant="outline"
                className={`flex-1 ${theme === 'dark' ? 'border-gray-700 text-gray-300 hover:bg-gray-800' : 'border-gray-300 text-gray-700 hover:bg-gray-100'}`}
                onClick={onShowFavorites}
              >
                {t('controlPanel.manageFavorites')}
              </Button>
              <Button
                variant="outline"
                size="icon"
                className={`${theme === 'dark' ? 'border-gray-700 text-gray-300 hover:bg-gray-800' : 'border-gray-300 text-gray-700 hover:bg-gray-100'}`}
                onClick={handleRefreshStatus}
                disabled={isRefreshing}
              >
                <RefreshCw className={`size-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className={`${theme === 'dark' ? 'border-purple-600 text-purple-400 hover:bg-purple-600/20' : 'border-purple-500 text-purple-600 hover:bg-purple-50'}`}
                onClick={handleAddCurrentToFavorites}
                title={t('controlPanel.addCurrentToFavorites') || '收藏當前串流'}
              >
                <Star className="size-4" />
              </Button>
            </div>
            
            {/* 收藏串流列表 - 限高並添加滾動 */}
            <div className="max-h-[400px] overflow-y-auto space-y-3 pr-2">
              {/* 分類的收藏 - 資料夾優先，分類內按開台狀態排序 */}
              {categories.map(category => {
                const categoryFavorites = favorites.filter(f => f.categoryId === category.id);
                if (categoryFavorites.length === 0) return null;
                
                // 分類內排序：開台狀態 > 未開台
                const sortedCategoryFavorites = sortFavorites(categoryFavorites);
                
                const isExpanded = expandedCategories.has(category.id);
                
                return (
                  <div key={category.id} className="space-y-1">
                    {/* 分類標題 */}
                    <button
                      onClick={() => toggleCategory(category.id)}
                      className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
                        theme === 'dark' 
                          ? 'hover:bg-gray-800 text-gray-300' 
                          : 'hover:bg-gray-100 text-gray-700'
                      }`}
                    >
                      {isExpanded ? (
                        <FolderOpen className="size-4 text-purple-500" />
                      ) : (
                        <Folder className="size-4 text-purple-500" />
                      )}
                      <span className="flex-1 text-left font-medium">{category.name}</span>
                      <span className={`text-xs ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>
                        {categoryFavorites.length}
                      </span>
                      {isExpanded ? (
                        <ChevronUp className="size-4" />
                      ) : (
                        <ChevronDown className="size-4" />
                      )}
                    </button>
                    
                    {/* 分類內容 */}
                    {isExpanded && (
                      <div className="ml-6 space-y-1">
                        {/* 分類本身也可以載入（載入該分類下的所有串流） */}
                        <button
                          onClick={async () => {
                            if (window.favoriteStreams && window.favoriteStreams.loadMultiple) {
                              const result = await window.favoriteStreams.loadMultiple(categoryFavorites);
                              if (result.success) {
                                // 載入所有串流
                                categoryFavorites.forEach(fav => {
                                  if (onAddStream) {
                                    onAddStream(fav.url);
                                  }
                                });
                              }
                            }
                          }}
                          className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
                            theme === 'dark' 
                              ? 'hover:bg-gray-800 text-gray-400' 
                              : 'hover:bg-gray-100 text-gray-600'
                          }`}
                        >
                          <Play className="size-4" />
                          <span className="text-sm">載入分類內所有串流</span>
                        </button>
                        
                        {/* 分類下的收藏 - 已排序 */}
                        {sortedCategoryFavorites.map((favorite) => (
                          <FavoriteItemComponent
                            key={favorite.id}
                            favorite={favorite}
                            theme={theme}
                            onLoad={handleLoadFavorite}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* 未分類的收藏 - 按開台狀態排序 */}
              {(() => {
                const uncategorizedFavorites = sortFavorites(favorites.filter(f => !f.categoryId));
                return uncategorizedFavorites.length > 0 ? (
                  <div className="space-y-1">
                    {uncategorizedFavorites.map((favorite) => (
                      <FavoriteItemComponent
                        key={favorite.id}
                        favorite={favorite}
                        theme={theme}
                        onLoad={handleLoadFavorite}
                      />
                    ))}
                  </div>
                ) : null;
              })()}

              {/* 無收藏提示 */}
              {favorites.length === 0 && (
                <div className={`py-8 text-center text-sm ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>
                  {t('favorites.noFavorites')}
                </div>
              )}
            </div>
          </div>
        </Section>

        {/* Volume Control */}
        <Section theme={theme} title={t('controlPanel.mediaControl')}>
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <span className={`text-sm ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>{t('controlPanel.masterVolume')}</span>
              {/* 隱藏的 input 元素，用於與舊的 JavaScript 代碼同步 */}
              <input
                id="master-volume"
                type="range"
                min="0"
                max="100"
                value={masterVolume}
                style={{ display: 'none' }}
                readOnly
                aria-label={t('controlPanel.masterVolume')}
              />
              <Box sx={{ width: '100%', flex: 1 }}>
                <Slider
                  value={masterVolume}
                  onChange={(_, value) => {
                    const newValue = Array.isArray(value) ? value[0] : value;
                    handleMasterVolumeChange(newValue);
                  }}
                  min={0}
                  max={100}
                  step={1}
                  color="secondary"
                  sx={{
                    '& .MuiSlider-thumb': {
                      backgroundColor: '#9333ea',
                      '&:hover': {
                        boxShadow: '0 0 0 8px rgba(147, 51, 234, 0.16)',
                      },
                    },
                    '& .MuiSlider-track': {
                      backgroundColor: '#9333ea',
                    },
                    '& .MuiSlider-rail': {
                      backgroundColor: '#ffffff',
                    },
                  }}
                />
              </Box>
              <span id="master-volume-value" className={`text-sm min-w-[48px] text-right ${theme === 'dark' ? 'text-purple-400' : 'text-purple-600'}`}>
                {masterMuted ? '0%' : `${masterVolume}%`}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={handleMasterMuteAll}
                className={
                  masterMuted
                    ? theme === 'dark'
                      ? 'border-red-600 bg-red-600/20 text-red-400 hover:bg-red-600/30 hover:border-red-500'
                      : 'border-red-500 bg-red-50 text-red-600 hover:bg-red-100 hover:border-red-600'
                    : theme === 'dark'
                      ? 'border-purple-600 bg-purple-600/20 text-purple-400 hover:bg-purple-600/30 hover:border-purple-500'
                      : 'border-purple-500 bg-purple-50 text-purple-600 hover:bg-purple-100 hover:border-purple-600'
                }
              >
                {masterMuted ? <VolumeX className="size-4 mr-1" /> : <Volume2 className="size-4 mr-1" />}
                {t('controlPanel.muteAll')}
              </Button>
            </div>
          </div>
        </Section>

        {/* Stream Order */}
        <Section theme={theme} title={t('controlPanel.streamOrder')}>
          {streams.length === 0 ? (
            <div className={`py-8 text-center text-sm ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>
              {t('controlPanel.noStreams')}
            </div>
          ) : (
            <div className="space-y-2">
              {streams.map((stream, index) => {
                // 獲取串流標題
                const getStreamTitle = () => {
                  if (stream.displayName) return stream.displayName;
                  if (stream.name) return stream.name;
                  if (stream.platform === 'twitch') {
                    return stream.channelId || `串流 #${stream.id}`;
                  } else {
                    return stream.videoId || `串流 #${stream.id}`;
                  }
                };

                const streamTitle = getStreamTitle();
                const streamVolume = stream.volume || 100;
                // 靜音優先級：全部 > 單獨
                // 如果全部靜音，則串流視為靜音（無論單獨靜音狀態）
                // 如果全部未靜音，則使用單獨靜音狀態
                const isStreamMuted = masterMuted ? true : (stream.isMuted || false);

                return (
                  <div
                    key={stream.id}
                    className={`rounded-lg border ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-gray-50 border-gray-200'}`}
                  >
                    {/* Header */}
                    <div className={`flex items-center gap-2 px-3 py-2 border-b ${theme === 'dark' ? 'border-gray-700' : 'border-gray-200'}`}>
                      <GripVertical className={`size-4 ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`} />
                      <span className={`text-sm font-medium flex-1 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                        #{index + 1} - {streamTitle}
                      </span>
                      <div className="flex gap-1">
                        {onToggleMute && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className={
                              isStreamMuted
                                ? theme === 'dark'
                                  ? 'h-6 w-6 text-red-400 hover:text-red-300 hover:bg-red-600/20'
                                  : 'h-6 w-6 text-red-600 hover:text-red-700 hover:bg-red-50'
                                : theme === 'dark'
                                  ? 'h-6 w-6 text-gray-400 hover:text-white hover:bg-gray-700'
                                  : 'h-6 w-6 text-gray-600 hover:text-black hover:bg-gray-200'
                            }
                            title={
                              masterMuted 
                                ? '全部靜音中，無法單獨取消靜音' 
                                : isStreamMuted 
                                  ? '取消靜音' 
                                  : '靜音'
                            }
                            onClick={() => {
                              // 如果全部靜音，單獨靜音按鈕無效（全部靜音優先）
                              if (!masterMuted && onToggleMute) {
                                onToggleMute(stream.id);
                              }
                            }}
                            disabled={masterMuted}
                          >
                            {isStreamMuted ? (
                              <VolumeX className="size-3" />
                            ) : (
                              <Volume2 className="size-3" />
                            )}
                          </Button>
                        )}
                        {onMoveStreamUp && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className={`h-6 w-6 ${theme === 'dark' ? 'text-gray-400 hover:text-white hover:bg-gray-700' : 'text-gray-600 hover:text-black hover:bg-gray-200'}`}
                            title={t('controlPanel.moveUp')}
                            onClick={() => onMoveStreamUp(stream.id)}
                            disabled={index === 0}
                          >
                            <ChevronUp className="size-3" />
                          </Button>
                        )}
                        {onMoveStreamDown && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className={`h-6 w-6 ${theme === 'dark' ? 'text-gray-400 hover:text-white hover:bg-gray-700' : 'text-gray-600 hover:text-black hover:bg-gray-200'}`}
                            title={t('controlPanel.moveDown')}
                            onClick={() => onMoveStreamDown(stream.id)}
                            disabled={index === streams.length - 1}
                          >
                            <ChevronDown className="size-3" />
                          </Button>
                        )}
                        {onRemoveStream && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className={`h-6 w-6 ${theme === 'dark' ? 'text-gray-400 hover:text-red-400 hover:bg-red-500/20' : 'text-gray-600 hover:text-red-600 hover:bg-red-50'}`}
                            title={t('controlPanel.remove')}
                            onClick={() => onRemoveStream(stream.id)}
                          >
                            <X className="size-3" />
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Volume Control */}
                    {onVolumeChange && (
                      <div className="px-3 py-2 space-y-2">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                            🔊 {t('controlPanel.volume')}
                          </span>
                          <Box sx={{ width: '100%', flex: 1 }}>
                            <Slider
                              value={isStreamMuted ? 0 : streamVolume}
                              onChange={(_, value) => {
                                const newVolume = Array.isArray(value) ? value[0] : value;
                                // 如果調整音量且之前是靜音狀態，取消靜音
                                // 注意：如果全域靜音，需要先取消全域靜音
                                if (newVolume > 0 && masterMuted && onMasterMuteChange) {
                                  onMasterMuteChange(false);
                                }
                                // 只有在不是全域靜音時，才處理單獨靜音
                                if (newVolume > 0 && !masterMuted && stream.isMuted && onToggleMute) {
                                  onToggleMute(stream.id);
                                }
                                onVolumeChange(stream.id, newVolume);
                              }}
                              min={0}
                              max={100}
                              step={1}
                              color="secondary"
                              sx={{
                                '& .MuiSlider-thumb': {
                                  backgroundColor: '#9333ea',
                                  '&:hover': {
                                    boxShadow: '0 0 0 8px rgba(147, 51, 234, 0.16)',
                                  },
                                },
                                '& .MuiSlider-track': {
                                  backgroundColor: '#9333ea',
                                },
                                '& .MuiSlider-rail': {
                                  backgroundColor: '#ffffff',
                                },
                              }}
                            />
                          </Box>
                          <span className={`text-xs min-w-[40px] text-right ${theme === 'dark' ? 'text-purple-400' : 'text-purple-600'}`}>
                            {isStreamMuted ? '0%' : `${streamVolume}%`}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Section>

      </div>
    </div>
  );
}

function Section({ theme, title, children }: { theme: 'light' | 'dark'; title: string; children?: React.ReactNode }) {
  return (
    <div className={`space-y-3 pb-4 border-b ${theme === 'dark' ? 'border-gray-800' : 'border-gray-200'}`}>
      <h3 className={`${theme === 'dark' ? 'text-purple-400' : 'text-purple-600'}`}>{title}</h3>
      {children}
    </div>
  );
}

function LayoutPreview({ 
  layoutId, 
  cols, 
  rows, 
  special, 
  theme 
}: { 
  layoutId: number; 
  cols: number; 
  rows: number; 
  special?: string;
  theme: 'light' | 'dark' 
}) {
  // 特殊布局：上大下三
  if (special === 'top-large-bottom-three') {
    return (
      <div className="w-full h-full p-2 flex flex-col gap-1">
        {/* 上方大區域 75% */}
        <div className={`flex-1 rounded ${theme === 'dark' ? 'bg-purple-500' : 'bg-purple-400'}`} 
             style={{ flex: '0 0 75%' }} />
        {/* 下方三個小區域 25% */}
        <div className="flex gap-1" style={{ flex: '0 0 25%' }}>
          <div className={`flex-1 rounded ${theme === 'dark' ? 'bg-purple-500' : 'bg-purple-400'}`} />
          <div className={`flex-1 rounded ${theme === 'dark' ? 'bg-purple-500' : 'bg-purple-400'}`} />
          <div className={`flex-1 rounded ${theme === 'dark' ? 'bg-purple-500' : 'bg-purple-400'}`} />
        </div>
      </div>
    );
  }

  // 一般網格布局
  return (
    <div className="w-full h-full p-2">
      <div
        className="w-full h-full grid gap-1"
        style={{
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
          gridTemplateRows: `repeat(${rows}, 1fr)`,
        }}
      >
        {Array.from({ length: cols * rows }).map((_, i) => (
          <div
            key={i}
            className={`rounded ${theme === 'dark' ? 'bg-purple-500' : 'bg-purple-400'}`}
          />
        ))}
      </div>
    </div>
  );
}

function ChatLayoutPreview({ id, theme }: { id: number; theme: 'light' | 'dark' }) {
  if (id === 1) {
    // 關閉 - 全紫色（只有視頻區域）
    return (
      <div className="w-full h-full p-2">
        <div className={`w-full h-full rounded ${theme === 'dark' ? 'bg-purple-500' : 'bg-purple-400'}`} />
      </div>
    );
  }
  
  if (id === 2) {
    // 單一 - 左側紫色（視頻 80%），右側灰色區塊（聊天室 20%）
    return (
      <div className="w-full h-full p-2 flex gap-1">
        <div className={`rounded ${theme === 'dark' ? 'bg-purple-500' : 'bg-purple-400'}`} style={{ width: '80%' }} />
        <div className={`rounded ${theme === 'dark' ? 'bg-gray-600' : 'bg-gray-400'}`} style={{ width: '20%' }} />
      </div>
    );
  }
  
  if (id === 3) {
    // 雙欄 - 左側紫色（視頻），右側兩個灰色區塊（聊天室）
    return (
      <div className="w-full h-full p-2 flex gap-1">
        <div className={`flex-[2] rounded ${theme === 'dark' ? 'bg-purple-500' : 'bg-purple-400'}`} />
        <div className="flex-1 flex flex-col gap-1">
          <div className={`flex-1 rounded ${theme === 'dark' ? 'bg-gray-600' : 'bg-gray-400'}`} />
          <div className={`flex-1 rounded ${theme === 'dark' ? 'bg-gray-600' : 'bg-gray-400'}`} />
        </div>
      </div>
    );
  }
  
  // 四格 - 左側紫色（視頻），右側2x2網格（聊天室）
  return (
    <div className="w-full h-full p-2 flex gap-1">
      <div className={`flex-[2] rounded ${theme === 'dark' ? 'bg-purple-500' : 'bg-purple-400'}`} />
      <div className="flex-1 grid grid-cols-2 gap-1">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className={`rounded ${theme === 'dark' ? 'bg-gray-600' : 'bg-gray-400'}`} />
        ))}
      </div>
    </div>
  );
}

// 收藏項目組件
const FavoriteItemComponent: React.FC<{ 
  favorite: FavoriteItem; 
  theme: 'light' | 'dark'; 
  onLoad: (favorite: FavoriteItem) => void;
}> = ({ favorite, theme, onLoad }) => {
  const isLive = favorite.isLive === true;
  const isOffline = favorite.isLive === false;
  const isUnknown = favorite.isLive === null || favorite.isLive === undefined;

  return (
    <button
      onClick={() => onLoad(favorite)}
      className={`w-full px-4 py-3 cursor-pointer flex items-center gap-3 transition-colors text-left rounded-lg border ${
        theme === 'dark'
          ? 'hover:bg-gray-800 border-gray-700'
          : 'hover:bg-gray-50 border-gray-200'
      }`}
    >
      {/* 手把圖標 - 替代頻道圖片 */}
      {favorite.platform === 'twitch' ? (
        <Gamepad2 className="size-4 flex-shrink-0" style={{ color: '#9146ff' }} />
      ) : (
        <Youtube className="size-4 flex-shrink-0" style={{ color: '#FF0000' }} />
      )}
      
      {/* 頻道資訊區域 */}
      <div className="flex-1 min-w-0">
        {/* 第一行：頻道名稱 + 觀看人數 */}
        <div className="flex items-center justify-between">
          <div className={`font-medium ${theme === 'dark' ? 'text-white' : 'text-black'}`}>
            {favorite.name}
          </div>
          {favorite.platform === 'twitch' && isLive && favorite.viewerCount !== undefined && (
            <div className={`text-sm ml-2 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
              {favorite.viewerCount.toLocaleString()} 人
            </div>
          )}
        </div>
        
        {/* 第二行：平台標籤、開台指示器、遊戲名稱 */}
        <div className={`text-sm flex items-center mt-1 gap-2 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
          <div className="flex items-center flex-shrink-0">
            {favorite.platform === 'twitch' ? 'Twitch' : 'YouTube'}
            {isLive && (
              <span className="ml-2">
                <span className="text-green-500" style={{ color: '#10b981' }}>●</span>
                <span> 直播中</span>
              </span>
            )}
          </div>
          {favorite.platform === 'twitch' && favorite.gameName && (
            <span 
              className="text-purple-500 flex-shrink min-w-0 truncate" 
              style={{ color: '#a855f7' }}
              title={favorite.gameName}
            >
              {favorite.gameName}
            </span>
          )}
        </div>
      </div>
    </button>
  );
};