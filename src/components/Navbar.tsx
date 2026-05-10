import { useState, useEffect, useRef, useCallback } from 'react';
import type { CSSProperties } from 'react';
import { Search, Heart, Globe, Sun, Moon, Coffee, Plus, Menu, LayoutTemplate, Monitor, UserRound, LogOut, Settings, MessageSquareHeart } from 'lucide-react';
import { useUIStore } from '../store/useUIStore';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from './ui/sheet';
import { useMediaQuery } from '../hooks/use-media-query';
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
import { useTranslation } from 'react-i18next';
import { logEvent } from '../utils/analytics';
import { favoritesService } from '../features/favorites/FavoritesService';
import { twitchService } from '../features/twitch/TwitchService';
import { useAuthContext } from '../contexts/AuthContext';
import { Avatar, AvatarImage, AvatarFallback } from './ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';

interface NavbarProps {
  theme: 'light' | 'dark';
  onThemeToggle: () => void;
  onShowAbout?: () => void;
  onShowTutorial?: () => void;
  onShowFavorites?: () => void;
  onShowFeedback?: () => void; // Added
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

  onShowFavorites,
  onShowFeedback, // Added
  onAddStream,
  onSearchFocusChange
}: NavbarProps) {
  const { t, i18n } = useTranslation(['navbar', 'common', 'favorites', 'auth']);
  const locale = i18n.language;
  const setLocale = (lang: string) => i18n.changeLanguage(lang);
  // 使用 'lg' breakpoint (1024px) 以確保手機水平版面也使用手機版按鈕設計
  const isMobile = useMediaQuery('(max-width: 1024px)');
  const { isLoggedIn, profile, logout } = useAuthContext();
  const openModal = useUIStore(s => s.openModal);
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
      const results = await twitchService.searchChannels(query, 5);
      setSearchResults(results || []);
      setShowResults(true);
      setSelectedIndex(-1);
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
      alert(t('favorites:urlRequired'));
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
      alert(t('favorites:urlRequired'));
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
        alert(result.message || t('favorites:addFavorite'));
        setSearchValue('');
        setSearchResults([]);
        setShowResults(false);
        setSelectedIndex(-1);
        // 清空搜尋框後，通知搜尋不再使用
        if (onSearchFocusChange && isMobile) {
          onSearchFocusChange(false);
        }
      } else {
        alert(result.message || t('common:common.error'));
      }
    } catch (error) {
      alert(`${t('common:common.error')}: ${error instanceof Error ? error.message : '未知錯誤'}`);
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

  // 手機版面的導航連結列表（僅登入者看到「帳號設定」）
  const navLinks = [
    { label: t('navbar:canvas') || '畫布', onClick: () => setPage('canvas') },
    { label: t('navbar:fixed') || '固定佈局', onClick: () => setPage('fixed') },
    { label: t('navbar:vtuber') || 'VTuber', onClick: () => setPage('vtuber-explore') },
    { label: t('navbar:about'), onClick: onShowAbout },
    { label: t('navbar:tutorial'), onClick: () => setPage('instructions') },
    ...(isLoggedIn ? [{ label: t('account:menuLabel', '帳號設定'), onClick: () => setPage('account') }] : []),
    { label: t('navbar:feedback'), onClick: onShowFeedback },
  ];

  /* Navigation Handler */
  const setPage = useUIStore(s => s.setPage);

  return (
    <>
    <nav
      className={`w-full border-b ${theme === 'dark' ? 'bg-black border-gray-800' : 'bg-white border-gray-200'} px-4 md:px-6 py-3 sticky top-0 z-50`}
      style={{ '--navbar-height': '4rem' } as CSSProperties}
    >
      <div className="flex items-center justify-between gap-4">
        {/* Left Side - Logo and Drawer Button (Mobile) or Links (Desktop) */}
        {/* 手機版且搜尋框使用時（聚焦或有內容）隱藏 */}
        <div className={`flex items-center gap-4 ${isMobile && (isSearchFocused || searchValue.trim().length > 0) ? 'hidden' : ''}`}>
          {/* Mobile: Drawer Button */}
          {isMobile ? (
            <>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setDrawerOpen(true)}
                className={theme === 'dark' ? 'text-white hover:bg-gray-800' : 'text-black hover:bg-gray-100'}
              >
                <Menu className="size-5" />
              </Button>
              <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
                <SheetContent side="left" className={`w-[280px] p-0 ${theme === 'dark' ? 'bg-gray-900 border-gray-800 text-white' : 'bg-white border-gray-200 text-black'}`}>
                  <div className="p-4 flex flex-col h-full">
                    <SheetHeader className="mb-4 text-left">
                      <SheetTitle className={theme === 'dark' ? 'text-white' : 'text-black'}>
                        {t('navbar:menu') || '選單'}
                      </SheetTitle>
                    </SheetHeader>
                    <div className="flex flex-col gap-2 flex-1">
                      {navLinks.map((link, index) => (
                        link.onClick && (
                          <Button
                            key={index}
                            variant="ghost"
                            className={`justify-start w-full ${theme === 'dark' ? 'text-gray-300 hover:text-white hover:bg-gray-800' : 'text-gray-600 hover:text-black hover:bg-gray-100'}`}
                            onClick={() => {
                              link.onClick?.();
                              setDrawerOpen(false);
                            }}
                          >
                            {link.label}
                          </Button>
                        )
                      ))}
                    </div>

                    {/* 分隔線 */}
                    <div className={`w-full h-px my-4 ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-300'}`} />

                    {/* 語言切換 */}
                    <div className="mb-4">
                      <Label className={`text-sm mb-2 block ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                        {t('navbar:languageSwitch') || '語言'}
                      </Label>
                      <Select value={locale} onValueChange={(value: string) => setLocale(value as typeof locale)}>
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

                    {/* 登入/登出 */}
                    {isLoggedIn && profile ? (
                      <div className="flex flex-col gap-2">
                        <div className={`flex items-center gap-3 px-2 py-1.5 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-600'}`}>
                          <Avatar className="size-7">
                            <AvatarImage src={profile.avatar_url || undefined} alt={profile.display_name} />
                            <AvatarFallback className="text-xs">
                              {profile.display_name.charAt(0).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <span className="text-sm font-medium">{profile.display_name}</span>
                        </div>
                        <Button
                          variant="ghost"
                          className={`justify-start w-full ${theme === 'dark' ? 'text-gray-300 hover:text-white hover:bg-gray-800' : 'text-gray-600 hover:text-black hover:bg-gray-100'}`}
                          onClick={() => {
                            logout();
                            setDrawerOpen(false);
                          }}
                        >
                          <LogOut className="size-4 mr-2" />
                          {t('auth:logout', '登出')}
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="ghost"
                        className={`justify-start w-full ${theme === 'dark' ? 'text-gray-300 hover:text-white hover:bg-gray-800' : 'text-gray-600 hover:text-black hover:bg-gray-100'}`}
                        onClick={() => {
                          openModal('login');
                          setDrawerOpen(false);
                        }}
                      >
                        <UserRound className="size-4 mr-2" />
                        {t('auth:login_title', '登入')}
                      </Button>
                    )}

                    {/* 分隔線 */}
                    <div className={`w-full h-px ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-300'}`} />

                    {/* 贊助我 */}
                    <Button
                      className="w-full text-white bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 border-none"
                      onClick={() => {
                        logEvent('Navbar', 'click_support', 'buy_me_a_coffee');
                        window.open('https://buymeacoffee.com/hsiung', '_blank');
                        setDrawerOpen(false);
                      }}
                    >
                      <Coffee className="size-4 mr-2" />
                      {t('navbar:sponsor')}
                    </Button>
                  </div>
                </SheetContent>
              </Sheet>
            </>
          ) : (
            /* Desktop: Icon, Title, and Links */
            <>
              {/* Icon and Title - 桌面版最左側 */}
              <div className="flex items-center gap-2">
                <img src="/icon.png" alt="MultiStream Hub" width="24" height="24" className="w-6 h-6" />
                <span className={`text-xs font-medium ${theme === 'dark' ? 'text-white' : 'text-black'}`}>
                  {t('common:appName')}
                </span>
              </div>

              <div className="flex items-center gap-4">
                {/* Main Navigation */}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setPage('canvas')}
                  className={theme === 'dark' ? 'text-gray-300 hover:text-white hover:bg-gray-800' : 'text-gray-600 hover:text-black hover:bg-gray-100'}
                >
                  <Monitor className="size-4 mr-2" />
                  {t('navbar:canvas') || '畫布'}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setPage('fixed')}
                  className={theme === 'dark' ? 'text-gray-300 hover:text-white hover:bg-gray-800' : 'text-gray-600 hover:text-black hover:bg-gray-100'}
                >
                  <LayoutTemplate className="size-4 mr-2" />
                  {t('navbar:fixed') || '固定佈局'}
                </Button>

                <div className={`h-4 w-px ${theme === 'dark' ? 'bg-gray-800' : 'bg-gray-300'}`} />

                {onShowAbout && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={onShowAbout}
                        className={theme === 'dark' ? 'text-gray-300 hover:text-white hover:bg-gray-800' : 'text-gray-600 hover:text-black hover:bg-gray-100'}
                      >
                        {t('navbar:about')}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{t('navbar:about')}</p>
                    </TooltipContent>
                  </Tooltip>
                )}
                {onShowTutorial && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setPage('instructions')}
                        className={theme === 'dark' ? 'text-gray-300 hover:text-white hover:bg-gray-800' : 'text-gray-600 hover:text-black hover:bg-gray-100'}
                      >
                        {t('navbar:tutorial')}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{t('navbar:tutorial')}</p>
                    </TooltipContent>
                  </Tooltip>
                )}

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={onShowFeedback}
                      className={theme === 'dark' ? 'text-gray-300 hover:text-white hover:bg-gray-800' : 'text-gray-600 hover:text-black hover:bg-gray-100'}
                    >
                      {t('navbar:feedback')}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{t('navbar:feedback')}</p>
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
            placeholder={t('navbar:searchPlaceholder')}
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
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleAddStream()}
                className={`h-7 px-2 text-xs ${theme === 'dark' ? 'text-purple-400 hover:text-purple-300 hover:bg-purple-500/10' : 'text-purple-600 hover:text-purple-700 hover:bg-purple-500/5'}`}
              >
                <Plus className="size-3 mr-1" />
                {t('navbar:addStream')}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleAddToFavorites}
                className={`h-7 px-2 text-xs ${theme === 'dark' ? 'text-purple-400 hover:text-purple-300 hover:bg-purple-500/10' : 'text-purple-600 hover:text-purple-700 hover:bg-purple-500/5'}`}
              >
                <Plus className="size-3 mr-1" />
                {t('favorites:addFavorite')}
              </Button>
            </div>
          )}

          {/* Mobile: 搜尋框使用時（聚焦或有內容）顯示加入畫面按鈕（在搜尋框內） */}
          {isMobile && (isSearchFocused || searchValue.trim().length > 0) && searchValue.trim().length > 0 && (
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleAddStream()}
                className={`h-7 px-1.5 text-[11px] ${theme === 'dark' ? 'text-purple-400 hover:text-purple-300 hover:bg-purple-500/10' : 'text-purple-600 hover:text-purple-700 hover:bg-purple-500/5'}`}
              >
                <Plus className="size-2.5" />
              </Button>
            </div>
          )}

          {showResults && searchResults.length > 0 && (
            <div
              className={`absolute top-full left-0 right-0 mt-1 rounded-lg border shadow-lg z-50 ${theme === 'dark'
                ? 'bg-gray-900 border-gray-700'
                : 'bg-white border-gray-200'
                } max-h-96 overflow-y-auto overflow-x-hidden`}
            >
              <div className="py-1">
                {searchResults.map((result, index) => (
                  <div
                    key={result.id}
                    className={`flex items-center gap-3 p-3 cursor-pointer transition-colors ${selectedIndex === index
                      ? theme === 'dark' ? 'bg-gray-800' : 'bg-gray-100'
                      : theme === 'dark' ? 'hover:bg-gray-800' : 'hover:bg-gray-100'
                      }`}
                    onMouseDown={() => handleSelectResult(result)}
                    onMouseEnter={() => setSelectedIndex(index)}
                  >
                    {/* 頻道頭像 */}
                    {result.thumbnailUrl ? (
                      <img
                        src={result.thumbnailUrl}
                        alt={result.displayName}
                        className="w-10 h-10 rounded-full object-cover flex-shrink-0"
                      />
                    ) : (
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'}`}>
                        <span className={`text-sm font-medium ${theme === 'dark' ? 'text-gray-300' : 'text-gray-600'}`}>
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
                          {t('navbar:twitch')}
                          {result.isLive && (
                            <span className="ml-2 flex items-center">
                              <span className="text-green-500 mr-1" style={{ color: '#10b981' }}>●</span>
                              <span> {t('navbar:live')}</span>
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
                          {result.viewerCount?.toLocaleString()} {t('navbar:viewers')}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 無搜尋結果提示 */}
          {showResults && searchResults.length === 0 && !isSearching && searchValue.trim().length > 0 && !isUrl(searchValue) && (
            <div className={`absolute top-full left-0 right-0 mt-1 rounded-lg border shadow-lg z-50 p-3 ${theme === 'dark'
              ? 'bg-gray-900 border-gray-700 text-gray-400'
              : 'bg-white border-gray-200 text-gray-500'
              }`}>
              <p className="text-sm">{t('navbar:noResults')}</p>
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
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleAddStream()}
                className={`h-7 px-2 text-xs ${theme === 'dark' ? 'text-purple-400 hover:text-white hover:bg-gray-800' : 'text-purple-600 hover:text-black hover:bg-gray-100'}`}
              >
                <Plus className="size-3 mr-1" />
                {t('navbar:addStream')}
              </Button>

            </>
          ) : (
            /* Desktop: 顯示所有按鈕 */
            <>
              {/* 收藏管理 */}
              {onShowFavorites && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={onShowFavorites}
                      className={theme === 'dark' ? 'text-gray-300 hover:text-white hover:bg-gray-800' : 'text-gray-600 hover:text-black hover:bg-gray-100'}
                    >
                      <Heart className="size-5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{t('navbar:favorites')}</p>
                  </TooltipContent>
                </Tooltip>
              )}

              {/* 登入 / 使用者選單 */}
              {isLoggedIn && profile ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className={theme === 'dark' ? 'text-gray-300 hover:text-white hover:bg-gray-800' : 'text-gray-600 hover:text-black hover:bg-gray-100'}
                    >
                      <Avatar className="size-7">
                        <AvatarImage src={profile.avatar_url || undefined} alt={profile.display_name} />
                        <AvatarFallback className="text-xs">
                          {profile.display_name.charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className={theme === 'dark' ? 'bg-gray-900 border-gray-700' : ''}>
                    <DropdownMenuLabel className={theme === 'dark' ? 'text-gray-300' : ''}>
                      {profile.display_name}
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator className={theme === 'dark' ? 'bg-gray-700' : ''} />
                    <DropdownMenuItem
                      onSelect={() => setPage('account')}
                      className={theme === 'dark' ? 'text-gray-300 focus:bg-gray-800 focus:text-white' : ''}
                    >
                      <Settings className="size-4 mr-2" />
                      {t('account:menuLabel', '帳號設定')}
                    </DropdownMenuItem>
                    {onShowFeedback && (
                      <DropdownMenuItem
                        onSelect={onShowFeedback}
                        className={theme === 'dark' ? 'text-gray-300 focus:bg-gray-800 focus:text-white' : ''}
                      >
                        <MessageSquareHeart className="size-4 mr-2" />
                        {t('navbar:feedback', '意見回饋')}
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem
                      onSelect={() => logout()}
                      className={theme === 'dark' ? 'text-gray-300 focus:bg-gray-800 focus:text-white' : ''}
                    >
                      <LogOut className="size-4 mr-2" />
                      {t('auth:logout', '登出')}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openModal('login')}
                      className={theme === 'dark' ? 'text-gray-300 hover:text-white hover:bg-gray-800' : 'text-gray-600 hover:text-black hover:bg-gray-100'}
                    >
                      <UserRound className="size-5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{t('auth:login_title', '登入')}</p>
                  </TooltipContent>
                </Tooltip>
              )}

              {/* 主題切換 */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={onThemeToggle}
                    className={theme === 'dark' ? 'text-gray-300 hover:text-white hover:bg-gray-800' : 'text-gray-600 hover:text-black hover:bg-gray-100'}
                  >
                    {theme === 'dark' ? <Sun className="size-5" /> : <Moon className="size-5" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{t('navbar:themeToggle')}</p>
                </TooltipContent>
              </Tooltip>

              {/* 語言切換 */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <div>
                    <Select value={locale} onValueChange={(value: string) => setLocale(value as typeof locale)}>
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
                  <span className="sr-only">{t('navbar:languageSwitch')}</span>
                </TooltipContent>
              </Tooltip>

              {/* 贊助我 */}
              <Button
                className="text-white bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 border-none"
                onClick={() => {
                  logEvent('Navbar', 'click_support', 'buy_me_a_coffee');
                  window.open('https://buymeacoffee.com/hsiung', '_blank');
                }}
              >
                <Coffee className="size-4 mr-2" />
                {t('navbar:sponsor')}
              </Button>
            </>
          )}
        </div>
      </div>
    </nav >

    </>
  );
}