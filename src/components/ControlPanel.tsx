import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Play, Volume2, VolumeX, ChevronUp, ChevronDown, RefreshCw, GripVertical, X, Gamepad2, Youtube, Folder, FolderOpen, Star } from 'lucide-react';
import { Button } from './ui/button';
import { Slider } from './ui/slider';
import { Label } from './ui/label';
import { Switch } from './ui/switch';
import { ScrollArea } from './ui/scroll-area';
import type { StreamData } from '../utils/streamUtils';
// import { FavoriteStreamComponent } from './FavoriteStreamComponent'; // Removed as it is defined in-file
import type { LayoutType } from '../utils/layoutUtils';
import type { ChatLayoutType } from '../utils/chatLayoutUtils';
import { useTranslation } from 'react-i18next';
import { useMediaQuery } from '../hooks/use-media-query';
import { logEvent } from '../utils/analytics';

import { TagFilterLayout } from './ui/TagFilterLayout';
import { tagsService } from '../features/favorites/TagsService';
import { favoritesService } from '../features/favorites/FavoritesService';
import { favoritesLoader } from '../features/favorites/FavoritesLoader';
import { DEFAULT_TAG_IS_LIVE_ID } from '../features/favorites/constants';
import type { Tag, FavoriteStream, FavoriteCategory } from '../features/favorites/types';
import { twitchService } from '../features/twitch/TwitchService';
import { youtubeApi } from '../utils/youtubeApi';

interface ControlPanelProps {
  theme: 'light' | 'dark';
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  isSearchFocused?: boolean;
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

// 排序函數：開台狀態 > 未開台
const sortFavorites = (favs: FavoriteStream[]) => {
  return [...favs].sort((a, b) => {
    const aIsLive = a.isLive === true;
    const bIsLive = b.isLive === true;
    // 開台狀態優先
    if (aIsLive && !bIsLive) return -1;
    if (!aIsLive && bIsLive) return 1;
    return 0;
  });
};



export function ControlPanel({
  theme,
  isCollapsed,
  onToggleCollapse,
  isSearchFocused = false,
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
  const { t, i18n } = useTranslation(['common', 'controlPanel', 'favorites', 'tags']);
  const locale = i18n.language;
  // 使用 'lg' (1200px) breakpoint 以確保手機水平版面也使用手機版設計
  const isMobile = useMediaQuery('(max-width: 1200px)');
  const [showAllChat, setShowAllChat] = useState(false);
  const [favorites, setFavorites] = useState<FavoriteStream[]>([]);
  const [categories, setCategories] = useState<FavoriteCategory[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [filterTags, setFilterTags] = useState<string[]>([]);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [isRefreshing, setIsRefreshing] = useState(false);

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
    // 直接從 service 獲取
    try {
      const favoritesList = favoritesService.getFavorites();
      const categoriesList = favoritesService.getCategories();
      const tagsList = tagsService.getAllTags();
      setFavorites(favoritesList);
      setCategories(categoriesList);
      setTags(tagsList);
    } catch (error) {
      // 載入數據時發生錯誤，繼續處理
    }
  }, []);

  // 建構特殊的標籤列表（包含虛擬的"直播中"標籤）
  const displayTags = useMemo(() => {
    const isLiveTag: Tag = {
      id: DEFAULT_TAG_IS_LIVE_ID,
      name: t('tags:isLive') || '直播中',
      color: '#ef4444', // Red-500
      order: -100 // Ensure it's sorted first if order is used
    };
    return [isLiveTag, ...tags];
  }, [tags, t]);

  useEffect(() => {
    loadFavorites();
    // 監聽收藏更新事件
    const handleFavoritesUpdate = () => {
      loadFavorites();
    };
    window.addEventListener('favoritesUpdated', handleFavoritesUpdate);

    // 監聽初始載入完成後的刷新事件
    const handleRefreshFavoritesStatus = () => {
      // 確保收藏系統已初始化後再刷新
      if (window.favoriteStreams && window.favoriteCategories) {
        handleRefreshStatus();
      }
    };
    window.addEventListener('refreshFavoritesStatus', handleRefreshFavoritesStatus);

    return () => {
      window.removeEventListener('favoritesUpdated', handleFavoritesUpdate);
      window.removeEventListener('refreshFavoritesStatus', handleRefreshFavoritesStatus);
    };
  }, [loadFavorites]);

  // 刷新開台狀態
  const handleRefreshStatus = async () => {
    // 移除 window 依賴檢查
    // if (!window.favoriteStreams) return;

    setIsRefreshing(true);
    try {
      const favoritesList = favoritesService.getFavorites();
      const twitchFavorites = favoritesList.filter(f => f.platform === 'twitch' && f.channelId);
      const youtubeFavorites = favoritesList.filter(f => f.platform === 'youtube' && f.channelId);

      let updatedFavorites = [...favoritesList];

      // 更新 Twitch 開台狀態
      if (twitchFavorites.length > 0) {
        const channelIds = twitchFavorites.map(f => f.channelId!);
        const liveStatuses = await twitchService.checkMultipleChannelsLiveStatus(channelIds);

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
            } as FavoriteStream;
          }
          return fav;
        });
      }

      // 更新 YouTube 開台狀態
      if (youtubeFavorites.length > 0) {
        let isFirstYoutubeCheck = true;
        for (const fav of youtubeFavorites) {
          if (fav.channelId) {
            // 優化: 如果目前是 LIVE 狀態，且 lastChecked 在 1 小時內，則跳過檢查
            // 避免已開台的頻道仍頻繁觸發請求（風險較高）
            if (fav.isLive && fav.lastChecked) {
              const lastCheckedTime = new Date(fav.lastChecked).getTime();
              const oneHourAgo = Date.now() - 60 * 60 * 1000;
              if (lastCheckedTime > oneHourAgo) {
                // 跳過此頻道，保留原狀態
                continue;
              }
            }

            // 增加請求間隔 (2000ms)，避免瞬間爆發流量
            if (!isFirstYoutubeCheck) {
              await new Promise(resolve => setTimeout(resolve, 2000));
            }
            isFirstYoutubeCheck = false;

            try {
              const status = await youtubeApi.checkChannelLiveStatus(fav.channelId) as any;
              updatedFavorites = updatedFavorites.map(f => {
                if (f.id === fav.id) {
                  return {
                    ...f,
                    isLive: status.isLive || false,
                    lastChecked: new Date().toISOString(),
                    liveUrl: status.finalUrl || null,
                    liveVideoId: status.liveVideoId || null
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
      favoritesService.saveFavorites(updatedFavorites);
      setFavorites(updatedFavorites);
    } catch (e) {
      // 刷新開台狀態失敗，繼續處理
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
  const handleLoadFavorite = (favorite: FavoriteStream) => {
    // 使用 favoritesLoader
    favoritesLoader.load(favorite).then(result => {
      if (result.success && onAddStream) {
        onAddStream(favorite.url);
      }
    });
  };

  // 收藏當前串流
  const handleAddCurrentToFavorites = async () => {
    if (streams.length === 0) return;

    // 移除 window 依賴檢查
    // if (!window.favoriteStreams) ...

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
        const result = await favoritesService.addFavorite(
          stream.url,
          stream.name,
          null, // 默認未分類
          stream.channelId || undefined
        );
        if (result.success) {
          successCount++;
        }
      } catch (e) {
        // 添加收藏失敗，繼續處理
      }
    }

    loadFavorites();
    if (successCount > 0) {
      alert(`成功收藏 ${successCount} 個串流`);
    }
  };



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
    { id: 1, icon: '📺', label: t('controlPanel:singleView'), cols: 1, rows: 1, name: 'single_view' },
    { id: 2, icon: '⬅️➡️', label: t('controlPanel:splitHorizontal'), cols: 2, rows: 1, name: 'split_horizontal' },
    { id: 3, icon: '⬆️⬇️', label: t('controlPanel:splitVertical'), cols: 1, rows: 2, name: 'split_vertical' },
    { id: 4, icon: '⊞', label: t('controlPanel:grid4'), cols: 2, rows: 2, name: 'grid_2x2' },
    { id: 5, icon: '⬆️⬇️⬇️', label: t('controlPanel:largeTop3'), cols: 3, rows: 2, special: 'top-large-bottom-three', name: 'large_top_3' },
    { id: 6, icon: '⊞⊞', label: t('controlPanel:grid2x3'), cols: 3, rows: 2, name: 'grid_2x3' },
    { id: 9, icon: '⊞⊞⊞', label: t('controlPanel:grid3x3'), cols: 3, rows: 3, name: 'grid_3x3' },
  ];

  const chatLayouts = [
    { id: 1, label: t('common.close'), icon: '□' },
    { id: 2, label: t('controlPanel:singleChatLayout'), icon: '▢' },
    { id: 3, label: t('controlPanel:dualColumnChat'), icon: '▢▢' },
    { id: 4, label: t('controlPanel:quadChat'), icon: '▦' },
  ];

  // 如果控制面板被收起或搜尋框使用中（聚焦或有內容），則不顯示（手機版）
  if (isCollapsed || (isMobile && isSearchFocused)) {
    return null;
  }

  return (
    <div
      className={`fixed ${isMobile ? 'inset-x-0 bottom-0 w-full border-t' : 'right-0 w-[500px] border-l'} ${theme === 'dark' ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-300'} shadow-2xl`}
      style={{
        top: isMobile ? 'auto' : `${navbarHeight}px`,
        bottom: isMobile ? 0 : 'auto',
        height: isMobile ? '80vh' : `calc(100vh - ${navbarHeight}px)`,
        maxHeight: isMobile ? '80vh' : 'none',
        zIndex: 10,
      }}
    >
      <ScrollArea className="h-full">
        <div className="p-6 space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <h2 className={`${theme === 'dark' ? 'text-white' : 'text-black'}`}>{t('controlPanel:title')}</h2>
          </div>

          {/* Layout Control */}
          <Section theme={theme} title={t('controlPanel:layoutControl')}>
            <div className="grid grid-cols-4 gap-2">
              {layouts.map((layout) => (
                <Button
                  key={layout.id}
                  variant="ghost"
                  onClick={() => {
                    if (onLayoutChange) {
                      onLayoutChange(layout.id as LayoutType);
                      // @ts-ignore - name property added above
                      logEvent('ControlPanel', 'change_layout', layout.name || `layout_${layout.id}`);
                    }
                  }}
                  title={layout.label}
                  aria-label={layout.label}
                  className={`aspect-square rounded-lg border-2 transition-all p-0 h-auto ${currentLayout === layout.id
                    ? 'border-purple-500 bg-purple-500/20'
                    : theme === 'dark'
                      ? 'border-gray-700 bg-gray-800 hover:border-purple-500/50 hover:bg-gray-800'
                      : 'border-gray-300 bg-gray-100 hover:border-purple-500/50 hover:bg-gray-100'
                    }`}
                >
                  <LayoutPreview
                    layoutId={layout.id}
                    cols={layout.cols}
                    rows={layout.rows}
                    special={layout.special}
                    theme={theme}
                  />
                </Button>
              ))}
            </div>
          </Section>

          {/* Chat Layout */}
          <Section theme={theme} title={t('controlPanel:sideChatLayout')}>
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
                  <Button
                    key={layout.id}
                    variant="ghost"
                    onClick={() => {
                      if (onChatLayoutChange) {
                        onChatLayoutChange(mappedType);
                        logEvent('ControlPanel', 'change_chat_layout', mappedType);
                      }
                    }}
                    title={layout.label}
                    aria-label={layout.label}
                    className={`aspect-video rounded-lg border-2 transition-all flex items-center justify-center p-0 h-auto ${isSelected
                      ? 'border-purple-500 bg-purple-500/20'
                      : theme === 'dark'
                        ? 'border-gray-700 bg-gray-800 hover:border-purple-500/50 hover:bg-gray-800'
                        : 'border-gray-300 bg-gray-100 hover:border-purple-500/50 hover:bg-gray-100'
                      }`}
                  >
                    <ChatLayoutPreview id={layout.id} theme={theme} />
                  </Button>
                );
              })}
            </div>
          </Section>

          {/* Chat Control */}
          <Section theme={theme} title={t('controlPanel:chatControl')}>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className={`text-sm ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                  {t('controlPanel:showAllChats')}
                </Label>
                <Switch
                  checked={showAllChat}
                  onCheckedChange={(checked: boolean) => {
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
          <Section theme={theme} title={t('controlPanel:favoriteStreams')}>
            <div className="space-y-3">
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className={`flex-1 ${theme === 'dark' ? 'border-gray-700 text-gray-300 hover:bg-gray-800' : 'border-gray-300 text-gray-700 hover:bg-gray-100'}`}
                  onClick={() => {
                    onShowFavorites();
                    logEvent('ControlPanel', 'open_modal', 'favorites_manager');
                  }}
                >
                  {t('controlPanel:manageFavorites')}
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleRefreshStatus}
                  disabled={isRefreshing}
                  className={theme === 'dark' ? 'border-gray-700 text-gray-300 hover:bg-gray-800' : 'border-gray-300 text-gray-700 hover:bg-gray-100'}
                >
                  <RefreshCw className={`size-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleAddCurrentToFavorites}
                  title={t('controlPanel:addCurrentToFavorites') || '收藏當前串流'}
                  className="border-purple-500 text-purple-500 hover:bg-purple-500/10"
                >
                  <Star className="size-4" />
                </Button>
              </div>

              {/* Tag Filters */}
              {tags.length > 0 && (
                <TagFilterLayout
                  tags={displayTags}
                  selectedTags={filterTags}
                  onToggleTag={(tagId: string) => {
                    setFilterTags(prev =>
                      prev.includes(tagId)
                        ? prev.filter(id => id !== tagId)
                        : [...prev, tagId]
                    );
                  }}
                  onClear={() => setFilterTags([])}
                  theme={theme}
                  maxVisibleTags={6}
                />
              )}

              {/* 收藏串流列表 - 限高並添加滾動 */}
              <ScrollArea className="h-[400px] pr-3 rounded-md border p-2">
                <div className="space-y-3">
                  {/* 分類的收藏 - 資料夾優先，分類內按開台狀態排序 */}
                  {categories.map(category => {
                    const categoryFavorites = favorites.filter(f => {
                      const matchCategory = f.categoryId === category.id;
                      const matchTags = filterTags.length === 0 || filterTags.every(tId => {
                        if (tId === DEFAULT_TAG_IS_LIVE_ID) return f.isLive === true;
                        return f.tagIds?.includes(tId);
                      });
                      return matchCategory && matchTags;
                    });
                    if (categoryFavorites.length === 0) return null;

                    // 分類內排序：開台狀態 > 未開台
                    const sortedCategoryFavorites = sortFavorites(categoryFavorites);

                    const isExpanded = expandedCategories.has(category.id);

                    return (
                      <div key={category.id} className="space-y-1">
                        {/* 分類標題 */}
                        <Button
                          variant="ghost"
                          onClick={() => toggleCategory(category.id)}
                          className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg transition-colors h-auto justify-start ${theme === 'dark'
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
                        </Button>

                        {/* 分類內容 */}
                        {isExpanded && (
                          <div className="ml-6 space-y-1">
                            {/* 分類本身也可以載入（載入該分類下的所有串流） */}
                            <Button
                              variant="ghost"
                              onClick={async () => {
                                // 使用 favoritesLoader 批量載入
                                await favoritesLoader.loadMultiple(categoryFavorites);
                                // favoritesLoader 會自動調用 addStream，無需在此重複調用
                              }}
                              className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg transition-colors h-auto justify-start ${theme === 'dark'
                                ? 'hover:bg-gray-800 text-gray-400'
                                : 'hover:bg-gray-100 text-gray-600'
                                }`}
                            >
                              <Play className="size-4" />
                              <span className="text-sm">載入分類內所有串流</span>
                            </Button>

                            {/* 分類下的收藏 - 已排序 */}
                            {sortedCategoryFavorites.map((favorite) => (
                              <FavoriteStreamComponent
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
                    const uncategorizedFavorites = sortFavorites(favorites.filter(f => {
                      const isUncategorized = !f.categoryId;
                      const matchTags = filterTags.length === 0 || filterTags.every(tId => {
                        if (tId === DEFAULT_TAG_IS_LIVE_ID) return f.isLive === true;
                        return f.tagIds?.includes(tId);
                      });
                      return isUncategorized && matchTags;
                    }));
                    return uncategorizedFavorites.length > 0 ? (
                      <div className="space-y-1">
                        {uncategorizedFavorites.map((favorite) => (
                          <FavoriteStreamComponent
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
                      {t('favorites:noFavorites')}
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>
          </Section>

          {/* Volume Control */}
          <Section theme={theme} title={t('controlPanel:mediaControl')}>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <Label className={`text-sm ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>{t('controlPanel:masterVolume')}</Label>
                {/* 隱藏的 input 元素，用於與舊的 JavaScript 代碼同步 */}
                <div className="flex-1">
                  <Slider
                    value={[masterVolume]}
                    min={0}
                    max={100}
                    step={1}
                    onValueChange={(value) => {
                      const newVolume = value[0];
                      // 如果從靜音狀態拖動到非零值，自動取消靜音
                      if (newVolume > 0 && masterMuted && onMasterMuteChange) {
                        onMasterMuteChange(false);
                      }
                      if (onMasterVolumeChange) {
                        onMasterVolumeChange(newVolume);
                        // 使用防抖或僅在放開時觸發記錄的邏輯比較複雜，這裡簡化為每次變更 (注意流量)
                        // 實務上建議用 onValueCommit (如果 Slider 支援) 或封裝防抖
                        // 暫時不在此處高頻觸發，改為選擇保留或僅記錄靜音操作，或優化 Slider 元件
                      }
                    }}
                    className="w-full"
                  />
                </div>
                <span id="master-volume-value" className={`text-sm min-w-[48px] text-right ${theme === 'dark' ? 'text-purple-400' : 'text-purple-600'}`}>
                  {masterMuted ? '0%' : `${masterVolume}%`}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (onMasterMuteChange) {
                      onMasterMuteChange(!masterMuted);
                      logEvent('ControlPanel', 'toggle_mute_all', !masterMuted ? 'mute' : 'unmute');
                    }
                  }}
                  className={masterMuted
                    ? `border-red-600 bg-red-600/10 text-red-600 hover:bg-red-600/20 hover:border-red-700`
                    : `border-purple-600 bg-purple-600/10 text-purple-600 hover:bg-purple-600/20 hover:border-purple-700`
                  }
                >
                  {masterMuted ? <VolumeX className="size-4 mr-1" /> : <Volume2 className="size-4 mr-1" />}
                  {t('controlPanel:muteAll')}
                </Button>
              </div>
            </div>
          </Section>

          {/* Stream Order */}
          <Section theme={theme} title={t('controlPanel:streamOrder')}>
            {streams.length === 0 ? (
              <div className={`py-8 text-center text-sm ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>
                {t('controlPanel:noStreams')}
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
                  // 單獨靜音狀態（不受全部靜音影響，用於 UI 顯示）
                  const isStreamMuted = stream.isMuted || false;
                  // 實際靜音狀態（考慮全部靜音，用於播放器控制）
                  const isActuallyMuted = masterMuted ? true : isStreamMuted;

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
                              className={`h-6 w-6 p-0 ${isStreamMuted
                                ? 'text-red-500 hover:bg-red-100 dark:text-red-400 dark:hover:bg-red-900/30'
                                : 'text-gray-500 hover:bg-gray-200 dark:text-gray-400 dark:hover:bg-gray-700'
                                }`}
                              title={
                                masterMuted
                                  ? streamVolume > 0
                                    ? `全部靜音中（單獨靜音：${isStreamMuted ? '開啟' : '關閉'}，音量：${streamVolume}%）`
                                    : '全部靜音中，無法操作（音量為 0）'
                                  : isStreamMuted
                                    ? '取消靜音'
                                    : '靜音'
                              }
                              onClick={() => {
                                // 全部靜音時：如果音量 > 0，允許操作單獨靜音
                                // 全部靜音時：如果音量 = 0，不允許操作（全部靜音優先）
                                // 非全部靜音時：允許操作
                                if (masterMuted) {
                                  // 全部靜音時，只有當音量 > 0 時才允許操作
                                  if (streamVolume > 0 && onToggleMute) {
                                    onToggleMute(stream.id);
                                  }
                                } else {
                                  // 非全部靜音時，允許操作
                                  if (onToggleMute) {
                                    onToggleMute(stream.id);
                                  }
                                }
                              }}
                              disabled={masterMuted && streamVolume === 0}
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
                              className="h-6 w-6 p-0 text-gray-500 hover:bg-gray-200 dark:text-gray-400 dark:hover:bg-gray-700"
                              title={t('controlPanel:moveUp')}
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
                              className="h-6 w-6 p-0 text-gray-500 hover:bg-gray-200 dark:text-gray-400 dark:hover:bg-gray-700"
                              title={t('controlPanel:moveDown')}
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
                              className="h-6 w-6 p-0 text-gray-500 hover:bg-red-100 hover:text-red-500 dark:text-gray-400 dark:hover:bg-red-900/30 dark:hover:text-red-400"
                              title={t('controlPanel:remove')}
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
                              🔊 {t('controlPanel:volume')}
                            </span>
                            <div className="w-full flex-1">
                              <Slider
                                value={[streamVolume]}
                                onValueChange={(vals: number[]) => {
                                  const newVolume = vals[0];
                                  // 在全部靜音狀態下調整音量時，不解除全部靜音
                                  // 如果音量 > 0，恢復音量，但不取消全部靜音
                                  // 單獨的靜音按鈕會根據音量值恢復可用（disabled={masterMuted && streamVolume === 0}）

                                  // 如果調整音量且之前是單獨靜音狀態，取消單獨靜音
                                  // 只有在不是全域靜音時，才處理單獨靜音
                                  if (newVolume > 0 && !masterMuted && stream.isMuted && onToggleMute) {
                                    onToggleMute(stream.id);
                                  }
                                  onVolumeChange(stream.id, newVolume);
                                }}
                                min={0}
                                max={100}
                                step={1}
                              />
                            </div>
                            <span className={`text-xs min-w-[40px] text-right ${theme === 'dark' ? 'text-purple-400' : 'text-purple-600'}`}>
                              {masterMuted ? `0% (${streamVolume}%)` : `${streamVolume}%`}
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
      </ScrollArea>
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
function FavoriteStreamComponent({ favorite, theme, onLoad }: {
  favorite: FavoriteStream;
  theme: 'light' | 'dark';
  onLoad: (favorite: FavoriteStream) => void;
}) {
  const { t } = useTranslation(['controlPanel', 'common', 'favorites']);
  const isLive = favorite.isLive === true;
  const isOffline = favorite.isLive === false;
  const isUnknown = favorite.isLive === null || favorite.isLive === undefined;

  return (
    <Button
      variant="ghost"
      onClick={() => onLoad(favorite)}
      className={`w-full h-auto px-4 py-3 cursor-pointer flex items-center gap-3 transition-colors text-left rounded-lg border justify-start ${theme === 'dark'
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
          {favorite.platform === 'twitch' && isLive && favorite.viewerCount != null && (
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
                <span> {t('favorites:live')}</span>
              </span>
            )}
            {isOffline && (
              <span className="ml-2 text-gray-500">
                {t('favorites:offline')}
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
    </Button>
  );
};