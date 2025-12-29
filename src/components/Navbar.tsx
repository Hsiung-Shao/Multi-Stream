import { useState, useEffect, useRef, useCallback } from 'react';
import type { CSSProperties } from 'react';
import { Search, Heart, Globe, Sun, Moon, LayoutDashboard, Coffee, Plus, Circle, Menu } from 'lucide-react';
import { Button as MuiButton } from '@mui/material';
import { Input } from './ui/input';
import { Box, Drawer, useMediaQuery, useTheme as useMuiTheme } from '@mui/material';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from './ui/tooltip';
import { useI18n } from '../i18n/index';
import { favoritesService } from '../features/favorites/FavoritesService';

// 聲明全局類型
declare global {
  interface Window {
    favoriteStreams?: {
      add: (url: string, name?: string, categoryId?: string | null, providedChannelId?: string | null) => Promise<{ success: boolean; message: string; item?: any }>;
    };
  }
}

interface NavbarProps {
  theme: 'light' | 'dark';
  onThemeToggle: () => void;
  onShowAbout?: () => void;
  onShowTutorial?: () => void;
  onShowVersionHistory?: () => void;
  onShowFavorites?: () => void;
  onShowFeedback?: () => void; // Added
  onTogglePanel?: () => void;
  onAddStream?: (url: string) => void;
  onSearchFocusChange?: (isFocused: boolean) => void;
}

interface SearchResult {
  id: string;
  login: string;
  displayName: string;
  title?: string;
  isLive: boolean;
  thumbnailUrl?: string;
  gameName?: string;
  viewerCount?: number;
  url: string;
}

export function Navbar({
  theme,
  onThemeToggle,
  onShowAbout,
  onShowTutorial,
  onShowVersionHistory,
  onShowFavorites,
  onShowFeedback, // Added
  onTogglePanel,
  onAddStream,
  onSearchFocusChange
}: NavbarProps) {
  const { locale, setLocale, t } = useI18n();
  const muiTheme = useMuiTheme();
  // 使用 'lg' breakpoint 以確保手機水平版面也使用手機版按鈕設計
  const isMobile = useMediaQuery(muiTheme.breakpoints.down('lg'));
  const [searchValue, setSearchValue] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const languages = [
    { value: 'zh-TW' as const, label: '繁體中文' },
    { value: 'zh-CN' as const, label: '簡體中文' },
    { value: 'en' as const, label: 'English' },
    { value: 'ja' as const, label: '日本語' },
    { value: 'ko' as const, label: '한국어' },
  ];

  // 檢查是否為 URL
  const isUrl = (text: string): boolean => {
    const trimmed = text.trim();
    return trimmed.includes('http://') ||
      trimmed.includes('https://') ||
      trimmed.includes('twitch.tv/') ||
      trimmed.includes('youtube.com') ||
      trimmed.includes('youtu.be/');
  };

  // 搜尋 Twitch 頻道
  const searchTwitchChannels = useCallback(async (query: string) => {
    if (!query || query.trim().length === 0) {
      setSearchResults([]);
      setShowResults(false);
      return;
    }

    // 如果是 URL，不進行搜尋
    if (isUrl(query)) {
      setSearchResults([]);
      setShowResults(false);
      return;
    }

    setIsSearching(true);
    try {
      if (window.twitchApi && window.twitchApi.searchChannels) {
        const results = await window.twitchApi.searchChannels(query, 5);
        setSearchResults(results || []);
        setShowResults(true);
        setSelectedIndex(-1);
      } else {
        setSearchResults([]);
        setShowResults(false);
      }
    } catch (error) {
      setSearchResults([]);
      setShowResults(false);
    } finally {
      setIsSearching(false);
    }
  }, []);

  // 防抖搜尋
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    const trimmedValue = searchValue.trim();

    // 如果輸入為空，清除結果
    if (trimmedValue.length === 0) {
      setSearchResults([]);
      setShowResults(false);
      return;
    }

    // 如果是 URL，不進行搜尋
    if (isUrl(trimmedValue)) {
      setSearchResults([]);
      setShowResults(false);
      return;
    }

    // 防抖：500ms 後執行搜尋
    searchTimeoutRef.current = setTimeout(() => {
      searchTwitchChannels(trimmedValue);
    }, 500);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchValue, searchTwitchChannels]);

  // 點擊外部關閉搜尋結果
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
        setShowResults(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleAddStream = (url?: string) => {
    const valueToAdd = url || searchValue.trim();
    if (valueToAdd && onAddStream) {
      onAddStream(valueToAdd);
      setSearchValue('');
      setSearchResults([]);
      setShowResults(false);
      setSelectedIndex(-1);
      // 清空搜尋框後，通知搜尋不再使用
      if (onSearchFocusChange) {
        onSearchFocusChange(false);
      }
    }
  };

  // 新增收藏處理函數
  const handleAddToFavorites = async () => {
    const valueToAdd = searchValue.trim();
    if (!valueToAdd) {
      alert(t('favorites.pasteUrl'));
      return;
    }

    // 如果是搜尋結果，使用結果的 URL
    let urlToAdd = valueToAdd;
    if (showResults && selectedIndex >= 0 && searchResults[selectedIndex]) {
      urlToAdd = searchResults[selectedIndex].url;
    } else if (isUrl(valueToAdd)) {
      urlToAdd = valueToAdd;
    } else {
      // 如果不是 URL 也不是搜尋結果，提示用戶
      alert(t('favorites.pasteUrl'));
      return;
    }

    // 直接調用 favoritesService
    // if (!window.favoriteStreams) check removed

    try {
      // 構建新的 addFavorite 調用
      const result = await favoritesService.addFavorite(
        urlToAdd,
        undefined, // name
        null, // categoryId
        undefined, // providedChannelId
        undefined, // providedVideoId
        [] // tags
      );

      if (result.success) {
        alert(result.message || t('favorites.add'));
        setSearchValue('');
        setSearchResults([]);
        setShowResults(false);
        setSelectedIndex(-1);
        // 清空搜尋框後，通知搜尋不再使用
        if (onSearchFocusChange && isMobile) {
          onSearchFocusChange(false);
        }
      } else {
        alert(result.message || t('common.error'));
      }
    } catch (error) {
      alert(`${t('common.error')}: ${error instanceof Error ? error.message : '未知錯誤'}`);
    }
  };

  const handleSelectResult = (result: SearchResult) => {
    handleAddStream(result.url);
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      if (showResults && selectedIndex >= 0 && searchResults[selectedIndex]) {
        // 如果有選中的搜尋結果，使用該結果
        handleSelectResult(searchResults[selectedIndex]);
      } else {
        // 否則直接添加輸入的值
        handleAddStream();
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (showResults && searchResults.length > 0) {
        setSelectedIndex(prev =>
          prev < searchResults.length - 1 ? prev + 1 : prev
        );
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (showResults && searchResults.length > 0) {
        setSelectedIndex(prev => prev > 0 ? prev - 1 : -1);
      }
    } else if (e.key === 'Escape') {
      setShowResults(false);
      setSelectedIndex(-1);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setSearchValue(newValue);
    setSelectedIndex(-1);
    // 當有內容時也通知搜尋使用狀態（用於隱藏控制面板）
    const isInUse = isMobile && (isSearchFocused || newValue.trim().length > 0);
    if (onSearchFocusChange) {
      onSearchFocusChange(isInUse);
    }
  };

  const handleInputFocus = () => {
    setIsSearchFocused(true);
    // 手機版聚焦時關閉 Drawer
    if (isMobile) {
      setDrawerOpen(false);
    }
    // 當搜尋框聚焦時，通知搜尋使用狀態（聚焦即視為使用中）
    if (onSearchFocusChange && isMobile) {
      onSearchFocusChange(true);
    }
    if (searchResults.length > 0) {
      setShowResults(true);
    }
  };

  const handleInputBlur = () => {
    // 延遲設置，讓點擊結果時能先執行
    setTimeout(() => {
      setIsSearchFocused(false);
      // 如果還有內容，仍然視為使用中
      const isInUse = isMobile && searchValue.trim().length > 0;
      if (onSearchFocusChange) {
        onSearchFocusChange(isInUse);
      }
    }, 200);
  };

  // 手機版面的導航連結列表
  const navLinks = [
    { label: t('navbar.about'), onClick: onShowAbout },
    { label: t('navbar.tutorial'), onClick: onShowTutorial },
    { label: t('navbar.versionHistory'), onClick: onShowVersionHistory },
    { label: t('navbar.feedback'), onClick: onShowFeedback }, // Updated
  ];

  return (
    <nav
      className={`w-full border-b ${theme === 'dark' ? 'bg-black border-gray-800' : 'bg-white border-gray-200'} px-4 md:px-6 py-3`}
      style={{ '--navbar-height': '4rem' } as CSSProperties}
    >
      <div className="flex items-center justify-between gap-4">
        {/* Left Side - Logo and Drawer Button (Mobile) or Links (Desktop) */}
        {/* 手機版且搜尋框使用時（聚焦或有內容）隱藏 */}
        <div className={`flex items-center gap-4 ${isMobile && (isSearchFocused || searchValue.trim().length > 0) ? 'hidden' : ''}`}>
          {/* Mobile: Drawer Button */}
          {isMobile ? (
            <>
              <MuiButton
                variant="text"
                size="small"
                onClick={() => setDrawerOpen(true)}
                color="secondary"
                sx={{
                  color: theme === 'dark' ? '#ffffff' : '#000000',
                  minWidth: 'auto',
                  padding: '8px',
                  '&:hover': {
                    bgcolor: theme === 'dark' ? '#1f2937' : '#f3f4f6',
                  },
                }}
              >
                <Menu className="size-5" />
              </MuiButton>
              <Drawer
                anchor="left"
                open={drawerOpen}
                onClose={() => setDrawerOpen(false)}
                PaperProps={{
                  sx: {
                    bgcolor: theme === 'dark' ? '#111827' : '#ffffff',
                    color: theme === 'dark' ? '#ffffff' : '#000000',
                    width: 280,
                  }
                }}
              >
                <Box sx={{ p: 3, display: 'flex', flexDirection: 'column', height: '100%' }}>
                  <h2 className={`text-lg font-semibold mb-4 ${theme === 'dark' ? 'text-white' : 'text-black'}`}>
                    {t('navbar.menu') || '選單'}
                  </h2>
                  <div className="flex flex-col gap-2 flex-1">
                    {navLinks.map((link, index) => (
                      link.onClick && (
                        <MuiButton
                          key={index}
                          variant="text"
                          fullWidth
                          onClick={() => {
                            link.onClick?.();
                            setDrawerOpen(false);
                          }}
                          sx={{
                            justifyContent: 'flex-start',
                            color: theme === 'dark' ? '#d1d5db' : '#4b5563',
                            '&:hover': {
                              color: theme === 'dark' ? '#ffffff' : '#000000',
                              bgcolor: theme === 'dark' ? '#1f2937' : '#f3f4f6',
                            },
                          }}
                        >
                          {link.label}
                        </MuiButton>
                      )
                    ))}
                  </div>

                  {/* 分隔線 */}
                  <div className={`w-full h-px my-4 ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-300'}`} />

                  {/* 語言切換 */}
                  <div className="mb-4">
                    <label className={`text-sm mb-2 block ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                      {t('navbar.languageSwitch') || '語言'}
                    </label>
                    <Select value={locale} onValueChange={(value) => setLocale(value as typeof locale)}>
                      <SelectTrigger
                        className={`w-full ${theme === 'dark' ? 'bg-gray-800 border-gray-700 text-white hover:bg-gray-700' : 'bg-white border-gray-300 text-black hover:bg-gray-50'}`}
                      >
                        <div className="flex items-center gap-2">
                          <Globe className="size-4" />
                          <SelectValue />
                        </div>
                      </SelectTrigger>
                      <SelectContent
                        className={theme === 'dark' ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-200'}
                      >
                        {languages.map((lang) => (
                          <SelectItem
                            key={lang.value}
                            value={lang.value}
                            className={theme === 'dark' ? 'text-gray-300 hover:bg-gray-800 hover:text-white' : 'text-gray-700 hover:bg-gray-100 hover:text-black'}
                          >
                            {lang.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* 贊助我 */}
                  <MuiButton
                    variant="contained"
                    fullWidth
                    color="secondary"
                    onClick={() => {
                      window.open('https://buymeacoffee.com/hsiung', '_blank');
                      setDrawerOpen(false);
                    }}
                    sx={{
                      background: 'linear-gradient(to right, #ec4899, #9333ea)',
                      color: 'white',
                      '&:hover': {
                        background: 'linear-gradient(to right, #db2777, #7e22ce)',
                      },
                    }}
                  >
                    <Coffee className="size-4 mr-2" />
                    {t('navbar.sponsor')}
                  </MuiButton>
                </Box>
              </Drawer>
            </>
          ) : (
            /* Desktop: Icon, Title, and Links */
            <>
              {/* Icon and Title - 桌面版最左側 */}
              <div className="flex items-center gap-2">
                <img src="/icon.png" alt="MultiStream Hub" className="w-6 h-6" />
                <span className={`font-medium text-lg ${theme === 'dark' ? 'text-white' : 'text-black'}`}>
                  MultiStream Hub
                </span>
              </div>

              {/* Links */}
              <div className="flex items-center gap-4">
                {onShowAbout && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <MuiButton
                        variant="text"
                        size="small"
                        onClick={onShowAbout}
                        color="secondary"
                        sx={{
                          color: theme === 'dark' ? '#d1d5db' : '#4b5563',
                          '&:hover': {
                            color: theme === 'dark' ? '#ffffff' : '#000000',
                            bgcolor: theme === 'dark' ? '#1f2937' : '#f3f4f6',
                          },
                        }}
                      >
                        {t('navbar.about')}
                      </MuiButton>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{t('navbar.about')}</p>
                    </TooltipContent>
                  </Tooltip>
                )}
                {onShowTutorial && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <MuiButton
                        variant="text"
                        size="small"
                        onClick={onShowTutorial}
                        color="secondary"
                        sx={{
                          color: theme === 'dark' ? '#d1d5db' : '#4b5563',
                          '&:hover': {
                            color: theme === 'dark' ? '#ffffff' : '#000000',
                            bgcolor: theme === 'dark' ? '#1f2937' : '#f3f4f6',
                          },
                        }}
                      >
                        {t('navbar.tutorial')}
                      </MuiButton>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{t('navbar.tutorial')}</p>
                    </TooltipContent>
                  </Tooltip>
                )}
                {onShowVersionHistory && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <MuiButton
                        variant="text"
                        size="small"
                        onClick={onShowVersionHistory}
                        color="secondary"
                        sx={{
                          color: theme === 'dark' ? '#d1d5db' : '#4b5563',
                          '&:hover': {
                            color: theme === 'dark' ? '#ffffff' : '#000000',
                            bgcolor: theme === 'dark' ? '#1f2937' : '#f3f4f6',
                          },
                        }}
                      >
                        {t('navbar.versionHistory')}
                      </MuiButton>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{t('navbar.versionHistory')}</p>
                    </TooltipContent>
                  </Tooltip>
                )}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <MuiButton
                      variant="text"
                      size="small"
                      onClick={onShowFeedback}
                      color="secondary"
                      sx={{
                        color: theme === 'dark' ? '#d1d5db' : '#4b5563',
                        '&:hover': {
                          color: theme === 'dark' ? '#ffffff' : '#000000',
                          bgcolor: theme === 'dark' ? '#1f2937' : '#f3f4f6',
                        },
                      }}
                    >
                      {t('navbar.feedback')}
                    </MuiButton>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{t('navbar.feedback')}</p>
                  </TooltipContent>
                </Tooltip>
              </div>
            </>
          )}
        </div>

        {/* Center - Search Bar */}
        <div className={`flex-1 ${isMobile ? 'max-w-none' : 'max-w-2xl'} relative`} ref={searchContainerRef}>
          <Search className={`absolute left-3 top-1/2 -translate-y-1/2 size-4 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`} />
          <Input
            ref={inputRef}
            type="text"
            placeholder={t('navbar.searchPlaceholder')}
            value={searchValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyPress}
            onFocus={handleInputFocus}
            onBlur={handleInputBlur}
            className={`w-full pl-10 ${isMobile ? ((isSearchFocused || searchValue.trim().length > 0) ? 'pr-20' : 'pr-3') : 'pr-52'} ${theme === 'dark'
              ? 'bg-gray-900 border-gray-700 text-white placeholder:text-gray-400 focus:border-blue-500'
              : 'bg-gray-50 border-gray-300 text-black placeholder:text-gray-500 focus:border-blue-500'
              }`}
          />
          {isSearching && (
            <div className={`absolute ${isMobile ? ((isSearchFocused || searchValue.trim().length > 0) ? 'right-20' : 'right-4') : 'right-44'} top-1/2 -translate-y-1/2 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-current border-t-transparent" />
            </div>
          )}
          {/* Desktop: 顯示按鈕在搜尋框內 */}
          {!isMobile && (
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
              <MuiButton
                variant="text"
                size="small"
                onClick={() => handleAddStream()}
                color="secondary"
                sx={{
                  height: '28px',
                  paddingX: '8px',
                  fontSize: '12px',
                  color: theme === 'dark' ? '#a855f7' : '#9333ea',
                  '&:hover': {
                    color: theme === 'dark' ? '#c084fc' : '#7e22ce',
                    bgcolor: theme === 'dark' ? 'rgba(147, 51, 234, 0.1)' : 'rgba(147, 51, 234, 0.05)',
                  },
                }}
              >
                <Plus className="size-3 mr-1" />
                {t('navbar.addStream')}
              </MuiButton>
              <MuiButton
                variant="text"
                size="small"
                onClick={handleAddToFavorites}
                color="secondary"
                sx={{
                  height: '28px',
                  paddingX: '8px',
                  fontSize: '12px',
                  color: theme === 'dark' ? '#a855f7' : '#9333ea',
                  '&:hover': {
                    color: theme === 'dark' ? '#c084fc' : '#7e22ce',
                    bgcolor: theme === 'dark' ? 'rgba(147, 51, 234, 0.1)' : 'rgba(147, 51, 234, 0.05)',
                  },
                }}
              >
                <Plus className="size-3 mr-1" />
                {t('favorites.add')}
              </MuiButton>
            </div>
          )}

          {/* Mobile: 搜尋框使用時（聚焦或有內容）顯示加入畫面按鈕（在搜尋框內） */}
          {isMobile && (isSearchFocused || searchValue.trim().length > 0) && searchValue.trim().length > 0 && (
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
              <MuiButton
                variant="text"
                size="small"
                onClick={() => handleAddStream()}
                color="secondary"
                sx={{
                  height: '28px',
                  paddingX: '6px',
                  fontSize: '11px',
                  color: theme === 'dark' ? '#a855f7' : '#9333ea',
                  '&:hover': {
                    color: theme === 'dark' ? '#c084fc' : '#7e22ce',
                    bgcolor: theme === 'dark' ? 'rgba(147, 51, 234, 0.1)' : 'rgba(147, 51, 234, 0.05)',
                  },
                }}
              >
                <Plus className="size-2.5" />
              </MuiButton>
            </div>
          )}

          {/* 搜尋結果下拉列表 */}
          {showResults && searchResults.length > 0 && (
            <Box
              className={`absolute top-full left-0 right-0 mt-1 rounded-lg border shadow-lg z-50 ${theme === 'dark'
                ? 'bg-gray-900 border-gray-700'
                : 'bg-white border-gray-200'
                }`}
              sx={{
                maxHeight: '384px',
                overflowY: 'auto',
                overflowX: 'hidden',
                '&::-webkit-scrollbar': {
                  width: '8px',
                },
                '&::-webkit-scrollbar-track': {
                  background: theme === 'dark' ? '#374151' : '#f3f4f6',
                  borderRadius: '4px',
                },
                '&::-webkit-scrollbar-thumb': {
                  background: theme === 'dark' ? '#6b7280' : '#9ca3af',
                  borderRadius: '4px',
                  '&:hover': {
                    background: theme === 'dark' ? '#9ca3af' : '#6b7280',
                  },
                },
              }}
            >
              <div className="py-1">
                {searchResults.map((result, index) => (
                  <div
                    key={result.id}
                    onClick={() => handleSelectResult(result)}
                    className={`px-4 py-3 cursor-pointer flex items-center gap-3 transition-colors relative ${index === selectedIndex
                      ? theme === 'dark'
                        ? 'bg-gray-800'
                        : 'bg-gray-100'
                      : theme === 'dark'
                        ? 'hover:bg-gray-800'
                        : 'hover:bg-gray-50'
                      }`}
                    onMouseEnter={() => setSelectedIndex(index)}
                  >
                    {/* 圓形頭像 */}
                    {result.thumbnailUrl ? (
                      <img
                        src={result.thumbnailUrl}
                        alt={result.displayName}
                        className="w-10 h-10 rounded-full object-cover flex-shrink-0"
                      />
                    ) : (
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'
                        }`}>
                        <span className={`text-sm font-medium ${theme === 'dark' ? 'text-gray-300' : 'text-gray-600'
                          }`}>
                          {result.displayName.charAt(0).toUpperCase()}
                        </span>
                      </div>
                    )}
                    {/* 頻道資訊 */}
                    <div className="flex-1 min-w-0 relative pr-20">
                      <div className={`font-medium ${theme === 'dark' ? 'text-white' : 'text-black'}`}>
                        {result.displayName}
                      </div>
                      <div className={`text-sm flex items-center justify-between ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                        <div className="flex items-center">
                          {t('navbar.twitch')}
                          {result.isLive && (
                            <span className="ml-2">
                              <span className="text-green-500" style={{ color: '#10b981' }}>●</span>
                              <span> {t('navbar.live')}</span>
                            </span>
                          )}
                        </div>
                        {result.gameName && (
                          <span className="text-purple-500" style={{ color: '#a855f7' }}>{result.gameName}</span>
                        )}
                      </div>
                      {/* 觀看人數 - 頻道資訊區域的右上角 */}
                      {result.isLive && result.viewerCount !== undefined && (
                        <div className={`absolute top-0 right-0 text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                          {result.viewerCount.toLocaleString()} {t('navbar.viewers')}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Box>
          )}

          {/* 無搜尋結果提示 */}
          {showResults && searchResults.length === 0 && !isSearching && searchValue.trim().length > 0 && !isUrl(searchValue) && (
            <div className={`absolute top-full left-0 right-0 mt-1 rounded-lg border shadow-lg z-50 p-3 ${theme === 'dark'
              ? 'bg-gray-900 border-gray-700 text-gray-400'
              : 'bg-white border-gray-200 text-gray-500'
              }`}>
              <p className="text-sm text-center">{t('navbar.noResults')}</p>
            </div>
          )}
        </div>

        {/* Right Side - Control Panel Button Only (Mobile) or All Buttons (Desktop) */}
        {/* 手機版且搜尋框使用時（聚焦或有內容）隱藏 */}
        <div className={`flex items-center gap-2 ${isMobile && (isSearchFocused || searchValue.trim().length > 0) ? 'hidden' : ''}`}>
          {/* Mobile: 顯示控制面板按鈕和加入畫面按鈕 */}
          {isMobile ? (
            <>
              {/* 加入畫面按鈕 */}
              <MuiButton
                variant="text"
                size="small"
                onClick={() => handleAddStream()}
                color="secondary"
                sx={{
                  height: '28px',
                  paddingX: '8px',
                  fontSize: '11px',
                  color: theme === 'dark' ? '#a855f7' : '#9333ea',
                  '&:hover': {
                    color: theme === 'dark' ? '#c084fc' : '#7e22ce',
                    bgcolor: theme === 'dark' ? 'rgba(147, 51, 234, 0.1)' : 'rgba(147, 51, 234, 0.05)',
                  },
                }}
              >
                <Plus className="size-3 mr-1" />
                {t('navbar.addStream')}
              </MuiButton>
              {/* 控制面板按鈕 */}
              {onTogglePanel && (
                <MuiButton
                  variant="outlined"
                  onClick={onTogglePanel}
                  color="secondary"
                  size="small"
                  sx={{
                    bgcolor: 'transparent',
                    borderColor: theme === 'dark' ? '#4b5563' : '#d1d5db',
                    color: theme === 'dark' ? '#ffffff' : '#000000',
                    minWidth: 'auto',
                    padding: '6px 12px',
                    '&:hover': {
                      bgcolor: theme === 'dark' ? '#1f2937' : '#f3f4f6',
                      borderColor: theme === 'dark' ? '#4b5563' : '#d1d5db',
                    },
                  }}
                >
                  <LayoutDashboard className="size-4" />
                </MuiButton>
              )}
            </>
          ) : (
            /* Desktop: 顯示所有按鈕 */
            <>
              {/* 收藏管理 */}
              {onShowFavorites && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <MuiButton
                      variant="text"
                      size="small"
                      onClick={onShowFavorites}
                      color="secondary"
                      sx={{
                        color: theme === 'dark' ? '#d1d5db' : '#4b5563',
                        '&:hover': {
                          color: theme === 'dark' ? '#ffffff' : '#000000',
                          bgcolor: theme === 'dark' ? '#1f2937' : '#f3f4f6',
                        },
                      }}
                    >
                      <Heart className="size-5" />
                    </MuiButton>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{t('navbar.favorites')}</p>
                  </TooltipContent>
                </Tooltip>
              )}

              {/* 主題切換 */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <MuiButton
                    variant="text"
                    size="small"
                    onClick={onThemeToggle}
                    color="secondary"
                    sx={{
                      color: theme === 'dark' ? '#d1d5db' : '#4b5563',
                      '&:hover': {
                        color: theme === 'dark' ? '#ffffff' : '#000000',
                        bgcolor: theme === 'dark' ? '#1f2937' : '#f3f4f6',
                      },
                    }}
                  >
                    {theme === 'dark' ? <Sun className="size-5" /> : <Moon className="size-5" />}
                  </MuiButton>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{t('navbar.themeToggle')}</p>
                </TooltipContent>
              </Tooltip>

              {/* 語言切換 */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <div>
                    <Select value={locale} onValueChange={(value) => setLocale(value as typeof locale)}>
                      <SelectTrigger
                        className={`w-[140px] h-9 ${theme === 'dark'
                          ? 'bg-gray-800 border-gray-700 text-white hover:bg-gray-700'
                          : 'bg-white border-gray-300 text-black hover:bg-gray-50'
                          }`}
                      >
                        <div className="flex items-center gap-2">
                          <Globe className="size-4" />
                          <SelectValue />
                        </div>
                      </SelectTrigger>
                      <SelectContent
                        className={theme === 'dark' ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-200'}
                      >
                        {languages.map((lang) => (
                          <SelectItem
                            key={lang.value}
                            value={lang.value}
                            className={theme === 'dark' ? 'text-gray-300 hover:bg-gray-800 hover:text-white' : 'text-gray-700 hover:bg-gray-100 hover:text-black'}
                          >
                            {lang.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{t('navbar.languageSwitch')}</p>
                </TooltipContent>
              </Tooltip>

              {/* 分隔線 */}
              <div className={`w-px h-6 ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-300'}`} />

              {/* 控制面板 */}
              {onTogglePanel && (
                <MuiButton
                  variant="outlined"
                  onClick={onTogglePanel}
                  color="secondary"
                  sx={{
                    bgcolor: 'transparent',
                    borderColor: theme === 'dark' ? '#4b5563' : '#d1d5db',
                    color: theme === 'dark' ? '#ffffff' : '#000000',
                    '&:hover': {
                      bgcolor: theme === 'dark' ? '#1f2937' : '#f3f4f6',
                      borderColor: theme === 'dark' ? '#4b5563' : '#d1d5db',
                    },
                  }}
                >
                  <LayoutDashboard className="size-4 mr-2" />
                  {t('navbar.controlPanel')}
                </MuiButton>
              )}

              {/* 贊助我 */}
              <MuiButton
                variant="contained"
                color="secondary"
                onClick={() => window.open('https://buymeacoffee.com/hsiung', '_blank')}
                sx={{
                  background: 'linear-gradient(to right, #ec4899, #9333ea)',
                  color: 'white',
                  '&:hover': {
                    background: 'linear-gradient(to right, #db2777, #7e22ce)',
                  },
                }}
              >
                <Coffee className="size-4 mr-2" />
                {t('navbar.sponsor')}
              </MuiButton>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}