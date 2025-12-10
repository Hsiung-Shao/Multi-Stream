import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Search, Heart, Globe, Sun, Moon, LayoutDashboard, Coffee, Plus } from 'lucide-react';
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

  const languages = [
    { value: 'zh-TW', label: '繁體中文' },
    { value: 'zh-CN', label: '簡體中文' },
    { value: 'en', label: 'English' },
    { value: 'ja', label: '日本語' },
    { value: 'ko', label: '한국어' },
  ];

  const handleAddStream = () => {
    if (searchValue.trim() && onAddStream) {
      onAddStream(searchValue.trim());
      setSearchValue('');
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleAddStream();
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
        <div className="flex-1 max-w-2xl relative">
          <Search className={`absolute left-3 top-1/2 -translate-y-1/2 size-4 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`} />
          <Input
            type="text"
            placeholder="搜尋頻道或是開始直播連結"
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            onKeyPress={handleKeyPress}
            className={`w-full pl-10 pr-20 ${
              theme === 'dark' 
                ? 'bg-gray-900 border-gray-700 text-white placeholder:text-gray-400 focus:border-blue-500' 
                : 'bg-gray-50 border-gray-300 text-black placeholder:text-gray-500 focus:border-blue-500'
            }`}
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={handleAddStream}
            className={`absolute right-1 top-1/2 -translate-y-1/2 h-7 px-2 text-xs ${
              theme === 'dark' 
                ? 'text-purple-400 hover:text-purple-300 hover:bg-purple-500/10' 
                : 'text-purple-600 hover:text-purple-700 hover:bg-purple-50'
            }`}
          >
            <Plus className="size-3 mr-1" />
            加入畫面
          </Button>
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