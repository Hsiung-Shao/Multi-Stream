import { useState, useEffect, useRef, useCallback } from 'react';
import type { CSSProperties } from 'react';
import { Search, Heart, Globe, Sun, Moon, LayoutDashboard, Coffee, Plus, Circle } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
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

interface NavbarProps {
  theme: 'light' | 'dark';
  onThemeToggle: () => void;
  onShowAbout?: () => void;
  onShowTutorial?: () => void;
  onShowVersionHistory?: () => void;
  onShowFavorites?: () => void;
  onTogglePanel?: () => void;
  onAddStream?: (url: string) => void;
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
  onTogglePanel,
  onAddStream
}: NavbarProps) {
  const [searchValue, setSearchValue] = useState('');
  const [language, setLanguage] = useState('zh-TW');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const languages = [
    { value: 'zh-TW', label: '繁體中文' },
    { value: 'zh-CN', label: '簡體中文' },
    { value: 'en', label: 'English' },
    { value: 'ja', label: '日本語' },
    { value: 'ko', label: '한국어' },
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
      console.error('搜尋 Twitch 頻道失敗:', error);
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
    setSearchValue(e.target.value);
    setSelectedIndex(-1);
  };

  const handleInputFocus = () => {
    if (searchResults.length > 0) {
      setShowResults(true);
    }
  };

  return (
    <nav 
      className={`w-full border-b ${theme === 'dark' ? 'bg-black border-gray-800' : 'bg-white border-gray-200'} px-6 py-3`}
      style={{ '--navbar-height': '4rem' } as CSSProperties}
    >
      <div className="flex items-center justify-between gap-6">
        {/* Left Side - Logo and Links */}
        <div className="flex items-center gap-6">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <img 
              src="/icon.png" 
              alt="MultiStream Hub" 
              className="w-8 h-8"
            />
            <span className={`font-medium ${theme === 'dark' ? 'text-white' : 'text-black'}`}>
              MultiStream Hub
            </span>
          </div>

          {/* Links */}
          <div className="flex items-center gap-4">
            {onShowAbout && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onShowAbout}
                    className={theme === 'dark' ? 'text-gray-300 hover:text-white hover:bg-gray-800' : 'text-gray-600 hover:text-black hover:bg-gray-100'}
                  >
                    關於我們
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>關於我們</p>
                </TooltipContent>
              </Tooltip>
            )}
            {onShowTutorial && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onShowTutorial}
                    className={theme === 'dark' ? 'text-gray-300 hover:text-white hover:bg-gray-800' : 'text-gray-600 hover:text-black hover:bg-gray-100'}
                  >
                    使用教學
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>使用教學</p>
                </TooltipContent>
              </Tooltip>
            )}
            {onShowVersionHistory && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onShowVersionHistory}
                    className={theme === 'dark' ? 'text-gray-300 hover:text-white hover:bg-gray-800' : 'text-gray-600 hover:text-black hover:bg-gray-100'}
                  >
                    版本資訊
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>版本資訊</p>
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>

        {/* Center - Search Bar */}
        <div className="flex-1 max-w-2xl relative" ref={searchContainerRef}>
          <Search className={`absolute left-3 top-1/2 -translate-y-1/2 size-4 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`} />
          <Input
            ref={inputRef}
            type="text"
            placeholder="搜尋頻道或是開始直播連結"
            value={searchValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyPress}
            onFocus={handleInputFocus}
            className={`w-full pl-10 pr-20 ${
              theme === 'dark' 
                ? 'bg-gray-900 border-gray-700 text-white placeholder:text-gray-400 focus:border-blue-500' 
                : 'bg-gray-50 border-gray-300 text-black placeholder:text-gray-500 focus:border-blue-500'
            }`}
          />
          {isSearching && (
            <div className={`absolute right-20 top-1/2 -translate-y-1/2 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-current border-t-transparent" />
            </div>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleAddStream()}
            className={`absolute right-1 top-1/2 -translate-y-1/2 h-7 px-2 text-xs ${
              theme === 'dark' 
                ? 'text-purple-400 hover:text-purple-300 hover:bg-purple-500/10' 
                : 'text-purple-600 hover:text-purple-700 hover:bg-purple-50'
            }`}
          >
            <Plus className="size-3 mr-1" />
            加入畫面
          </Button>

          {/* 搜尋結果下拉列表 */}
          {showResults && searchResults.length > 0 && (
            <div className={`absolute top-full left-0 right-0 mt-1 rounded-lg border shadow-lg z-50 max-h-96 overflow-y-auto ${
              theme === 'dark' 
                ? 'bg-gray-900 border-gray-700' 
                : 'bg-white border-gray-200'
            }`}>
              <div className="py-1">
                {searchResults.map((result, index) => (
                  <div
                    key={result.id}
                    onClick={() => handleSelectResult(result)}
                    className={`px-4 py-3 cursor-pointer flex items-center gap-3 transition-colors relative ${
                      index === selectedIndex
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
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                        theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'
                      }`}>
                        <span className={`text-sm font-medium ${
                          theme === 'dark' ? 'text-gray-300' : 'text-gray-600'
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
                          Twitch
                          {result.isLive && (
                            <span className="ml-2">
                              <span className="text-green-500" style={{ color: '#10b981' }}>●</span>
                              <span> 直播中</span>
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
                          {result.viewerCount.toLocaleString()} 觀看
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
            <div className={`absolute top-full left-0 right-0 mt-1 rounded-lg border shadow-lg z-50 p-3 ${
              theme === 'dark' 
                ? 'bg-gray-900 border-gray-700 text-gray-400' 
                : 'bg-white border-gray-200 text-gray-500'
            }`}>
              <p className="text-sm text-center">沒有找到結果</p>
            </div>
          )}
        </div>

        {/* Right Side - Action Buttons */}
        <div className="flex items-center gap-2">
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
                <p>收藏管理</p>
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
              <p>主題切換</p>
            </TooltipContent>
          </Tooltip>

          {/* 語言切換 */}
          <Tooltip>
            <TooltipTrigger asChild>
              <div>
                <Select value={language} onValueChange={setLanguage}>
                  <SelectTrigger 
                    className={`w-[140px] h-9 ${
                      theme === 'dark' 
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
              <p>語言切換</p>
            </TooltipContent>
          </Tooltip>

          {/* 分隔線 */}
          <div className={`w-px h-6 ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-300'}`} />

          {/* 控制面板 */}
          {onTogglePanel && (
            <Button
              variant="outline"
              onClick={onTogglePanel}
              className={
                theme === 'dark'
                  ? 'bg-transparent border-gray-600 text-white hover:bg-gray-800'
                  : 'bg-transparent border-gray-300 text-black hover:bg-gray-100'
              }
            >
              <LayoutDashboard className="size-4 mr-2" />
              控制面板
            </Button>
          )}

          {/* 贊助我 */}
          <Button
            className="bg-gradient-to-r from-pink-500 to-purple-500 text-white hover:from-pink-600 hover:to-purple-600"
            onClick={() => window.open('https://buymeacoffee.com/hsiung', '_blank')}
          >
            <Coffee className="size-4 mr-2" />
            贊助我
          </Button>
        </div>
      </div>
    </nav>
  );
}