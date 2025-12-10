import { Search, Settings, Heart, LayoutGrid, Globe, Sun, Moon, LayoutDashboard, Coffee, Info } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';

interface NavbarProps {
  theme: 'light' | 'dark';
  onThemeToggle: () => void;
  onShowAbout?: () => void;
}

export function Navbar({ theme, onThemeToggle, onShowAbout }: NavbarProps) {
  return (
    <nav className={`w-full border-b ${theme === 'dark' ? 'bg-black border-gray-800' : 'bg-white border-gray-200'} px-6 py-3`}>
      <div className="flex items-center justify-between gap-6">
        {/* Logo */}
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
          <span className={theme === 'dark' ? 'text-white' : 'text-black'}>MultiStream Hub</span>
        </div>

        {/* Search Bar */}
        <div className="flex-1 max-w-2xl relative">
          <Search className={`absolute left-3 top-1/2 -translate-y-1/2 size-4 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`} />
          <Input
            type="text"
            placeholder="搜尋頻道或是開始直播連結"
            className={`w-full pl-10 pr-10 ${
              theme === 'dark' 
                ? 'bg-gray-900 border-gray-700 text-white placeholder:text-gray-400 focus:border-blue-500' 
                : 'bg-gray-50 border-gray-300 text-black placeholder:text-gray-500 focus:border-blue-500'
            }`}
          />
          <Button
            variant="ghost"
            size="icon"
            className={`absolute right-1 top-1/2 -translate-y-1/2 size-7 ${
              theme === 'dark' ? 'text-gray-400 hover:text-white' : 'text-gray-500 hover:text-black'
            }`}
          >
            <Settings className="size-4" />
          </Button>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          {/* 收藏管理 */}
          <Button
            variant="ghost"
            size="icon"
            className={theme === 'dark' ? 'text-gray-300 hover:text-white hover:bg-gray-800' : 'text-gray-600 hover:text-black hover:bg-gray-100'}
            title="收藏管理"
          >
            <Heart className="size-5" />
          </Button>

          {/* 布局控制 */}
          <Button
            variant="ghost"
            size="icon"
            className={theme === 'dark' ? 'text-gray-300 hover:text-white hover:bg-gray-800' : 'text-gray-600 hover:text-black hover:bg-gray-100'}
            title="布局控制"
          >
            <LayoutGrid className="size-5" />
          </Button>

          {/* 語言切換 */}
          <Button
            variant="ghost"
            size="icon"
            className={theme === 'dark' ? 'text-gray-300 hover:text-white hover:bg-gray-800' : 'text-gray-600 hover:text-black hover:bg-gray-100'}
            title="語言切換"
          >
            <Globe className="size-5" />
          </Button>

          {/* 光暗主題切換 */}
          <Button
            variant="ghost"
            size="icon"
            onClick={onThemeToggle}
            className={theme === 'dark' ? 'text-gray-300 hover:text-white hover:bg-gray-800' : 'text-gray-600 hover:text-black hover:bg-gray-100'}
            title="主題切換"
          >
            {theme === 'dark' ? <Sun className="size-5" /> : <Moon className="size-5" />}
          </Button>

          {/* 分隔線 */}
          <div className={`w-px h-6 ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-300'}`} />

          {/* 控制面板 */}
          <Button
            variant="outline"
            className={
              theme === 'dark'
                ? 'bg-transparent border-gray-600 text-white hover:bg-gray-800'
                : 'bg-transparent border-gray-300 text-black hover:bg-gray-100'
            }
          >
            <LayoutDashboard className="size-4 mr-2" />
            控制面板
          </Button>

          {/* 贊助我 */}
          <Button
            className="bg-gradient-to-r from-pink-500 to-purple-500 text-white hover:from-pink-600 hover:to-purple-600"
          >
            <Coffee className="size-4 mr-2" />
            贊助我
          </Button>

          {/* 關於我們 */}
          {onShowAbout && (
            <Button
              variant="ghost"
              size="icon"
              className={theme === 'dark' ? 'text-gray-300 hover:text-white hover:bg-gray-800' : 'text-gray-600 hover:text-black hover:bg-gray-100'}
              title="關於我們"
              onClick={onShowAbout}
            >
              <Info className="size-5" />
            </Button>
          )}
        </div>
      </div>
    </nav>
  );
}