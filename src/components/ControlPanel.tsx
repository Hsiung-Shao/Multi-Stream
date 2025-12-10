import { useState } from 'react';
import { Plus, Settings, RefreshCw, MessageSquare, Volume2, VolumeX, ChevronDown, ChevronUp, X } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Slider } from './ui/slider';
import { Switch } from './ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';

interface ControlPanelProps {
  theme: 'light' | 'dark';
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onShowFavorites: () => void;
  onShowVersionHistory: () => void;
  onShowTutorial: () => void;
  onShowAbout: () => void;
}

export function ControlPanel({ 
  theme, 
  isCollapsed, 
  onToggleCollapse,
  onShowFavorites,
  onShowVersionHistory,
  onShowTutorial,
  onShowAbout
}: ControlPanelProps) {
  const [streamUrl, setStreamUrl] = useState('');
  const [volume, setVolume] = useState([100]);
  const [isMuted, setIsMuted] = useState(false);
  const [showAllChat, setShowAllChat] = useState(false);
  const [chatTheme, setchatTheme] = useState<'light' | 'dark'>('dark');
  const [selectedLayout, setSelectedLayout] = useState<number | null>(null);
  const [selectedChatLayout, setSelectedChatLayout] = useState<number | null>(null);

  const layouts = [
    { id: 1, icon: '📺', label: '單一', cols: 1, rows: 1 },
    { id: 2, icon: '⬅️➡️', label: '左右', cols: 2, rows: 1 },
    { id: 3, icon: '⬆️⬇️', label: '上下', cols: 1, rows: 2 },
    { id: 4, icon: '⊞', label: '四格', cols: 2, rows: 2 },
    { id: 5, icon: '⬆️⬇️⬇️', label: '上大下三', cols: 2, rows: 2 },
    { id: 6, icon: '⊞⊞', label: '2×3', cols: 2, rows: 3 },
    { id: 9, icon: '⊞⊞⊞', label: '3×3', cols: 3, rows: 3 },
  ];

  const chatLayouts = [
    { id: 1, label: '關閉', icon: '□' },
    { id: 2, label: '雙欄', icon: '▢▢' },
    { id: 3, label: '四格', icon: '▦' },
  ];

  if (isCollapsed) {
    return (
      <div className={`fixed right-0 top-20 ${theme === 'dark' ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-300'} border-l border-y rounded-l-lg p-2`}>
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleCollapse}
          className={theme === 'dark' ? 'text-gray-400 hover:text-white' : 'text-gray-600 hover:text-black'}
        >
          <ChevronDown className="size-5 rotate-90" />
        </Button>
      </div>
    );
  }

  return (
    <div className={`fixed right-0 top-20 bottom-0 w-[500px] ${theme === 'dark' ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-300'} border-l shadow-2xl overflow-y-auto`}>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className={`${theme === 'dark' ? 'text-white' : 'text-black'}`}>控制面板</h2>
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggleCollapse}
            className={theme === 'dark' ? 'text-gray-400 hover:text-white' : 'text-gray-600 hover:text-black'}
          >
            <X className="size-5" />
          </Button>
        </div>

        {/* Stream URL Input */}
        <div className="space-y-2">
          <div className="flex gap-2">
            <Input
              type="text"
              placeholder="貼上 Twitch / YouTube 直播網址"
              value={streamUrl}
              onChange={(e) => setStreamUrl(e.target.value)}
              className={`flex-1 ${
                theme === 'dark' 
                  ? 'bg-gray-800 border-gray-700 text-white placeholder:text-gray-500' 
                  : 'bg-white border-gray-300 text-black placeholder:text-gray-400'
              }`}
            />
            <Button className="bg-purple-600 hover:bg-purple-700">
              加入畫面
            </Button>
          </div>
        </div>

        {/* Layout Control */}
        <Section theme={theme} title="布局控制">
          <div className="grid grid-cols-4 gap-2">
            {layouts.map((layout) => (
              <button
                key={layout.id}
                onClick={() => setSelectedLayout(layout.id)}
                className={`aspect-square rounded-lg border-2 transition-all ${
                  selectedLayout === layout.id
                    ? 'border-purple-500 bg-purple-500/20'
                    : theme === 'dark'
                    ? 'border-gray-700 bg-gray-800 hover:border-purple-500/50'
                    : 'border-gray-300 bg-gray-100 hover:border-purple-500/50'
                }`}
              >
                <LayoutPreview cols={layout.cols} rows={layout.rows} theme={theme} />
              </button>
            ))}
          </div>
        </Section>

        {/* Chat Layout */}
        <Section theme={theme} title="聊天室天布局">
          <div className="grid grid-cols-3 gap-2">
            {chatLayouts.map((layout) => (
              <button
                key={layout.id}
                onClick={() => setSelectedChatLayout(layout.id)}
                className={`aspect-video rounded-lg border-2 transition-all flex items-center justify-center ${
                  selectedChatLayout === layout.id
                    ? 'border-purple-500 bg-purple-500/20'
                    : theme === 'dark'
                    ? 'border-gray-700 bg-gray-800 hover:border-purple-500/50'
                    : 'border-gray-300 bg-gray-100 hover:border-purple-500/50'
                }`}
              >
                <ChatLayoutPreview id={layout.id} theme={theme} />
              </button>
            ))}
          </div>
        </Section>

        {/* Chat Control */}
        <Section theme={theme} title="聊天室控制">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className={`text-sm ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                顯示所有聊天室
              </label>
              <Switch checked={showAllChat} onCheckedChange={setShowAllChat} />
            </div>
            <div className="flex items-center justify-between">
              <label className={`text-sm ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                光暗主題
              </label>
              <Switch checked={chatTheme === 'dark'} onCheckedChange={(checked) => setChatTheme(checked ? 'dark' : 'light')} />
            </div>
          </div>
        </Section>

        {/* Favorites */}
        <Section theme={theme} title="收藏串流">
          <div className="space-y-3">
            <div className="flex gap-2">
              <Button
                variant="outline"
                className={`flex-1 ${theme === 'dark' ? 'border-gray-700 text-gray-300 hover:bg-gray-800' : 'border-gray-300 text-gray-700 hover:bg-gray-100'}`}
                onClick={onShowFavorites}
              >
                管理收藏
              </Button>
              <Button
                variant="outline"
                className={`flex-1 ${theme === 'dark' ? 'border-gray-700 text-gray-300 hover:bg-gray-800' : 'border-gray-300 text-gray-700 hover:bg-gray-100'}`}
              >
                收藏查詢
              </Button>
              <Button
                variant="outline"
                size="icon"
                className={`${theme === 'dark' ? 'border-gray-700 text-gray-300 hover:bg-gray-800' : 'border-gray-300 text-gray-700 hover:bg-gray-100'}`}
              >
                <RefreshCw className="size-4" />
              </Button>
            </div>
            <Select defaultValue="all">
              <SelectTrigger className={theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-300'}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部收藏</SelectItem>
                <SelectItem value="uncategorized">未分類</SelectItem>
              </SelectContent>
            </Select>
            <div className={`py-8 text-center text-sm ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>
              暫無收藏
            </div>
          </div>
        </Section>

        {/* Volume Control */}
        <Section theme={theme} title="媒體控制">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <span className={`text-sm ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>總音量</span>
              <Slider
                value={volume}
                onValueChange={setVolume}
                max={100}
                step={1}
                className="flex-1"
              />
              <span className={`text-sm min-w-[48px] text-right ${theme === 'dark' ? 'text-purple-400' : 'text-purple-600'}`}>
                {volume[0]}%
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsMuted(!isMuted)}
                className={theme === 'dark' ? 'border-gray-700 text-gray-300 hover:bg-gray-800' : 'border-gray-300 text-gray-700 hover:bg-gray-100'}
              >
                {isMuted ? <VolumeX className="size-4 mr-1" /> : <Volume2 className="size-4 mr-1" />}
                全部靜音
              </Button>
            </div>
          </div>
        </Section>

        {/* Stream Order */}
        <Section theme={theme} title="串流順序">
          <div className={`py-8 text-center text-sm ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>
            暫無串流
          </div>
        </Section>

        {/* Language */}
        <Section theme={theme} title="語言">
          <Select defaultValue="zh-TW">
            <SelectTrigger className={theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-300'}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="zh-TW">繁體中文</SelectItem>
              <SelectItem value="en">English</SelectItem>
              <SelectItem value="ja">日本語</SelectItem>
            </SelectContent>
          </Select>
        </Section>

        {/* Feedback */}
        <Section theme={theme} title="易見回饋">
          <div className="flex flex-wrap gap-2">
            <Button
              className="bg-purple-600 hover:bg-purple-700"
            >
              給予意見回饋
            </Button>
            <Button
              variant="outline"
              className={theme === 'dark' ? 'border-purple-500/50 text-purple-400 hover:bg-purple-500/10' : 'border-purple-300 text-purple-700 hover:bg-purple-50'}
              onClick={onShowVersionHistory}
            >
              版本紀錄
            </Button>
            <Button
              variant="outline"
              className={theme === 'dark' ? 'border-purple-500/50 text-purple-400 hover:bg-purple-500/10' : 'border-purple-300 text-purple-700 hover:bg-purple-50'}
              onClick={onShowTutorial}
            >
              使用教學
            </Button>
            <Button
              variant="outline"
              className={theme === 'dark' ? 'border-blue-500/50 text-blue-400 hover:bg-blue-500/10' : 'border-blue-300 text-blue-700 hover:bg-blue-50'}
              onClick={onShowAbout}
            >
              關於我們
            </Button>
          </div>
        </Section>
      </div>
    </div>
  );
}

function Section({ theme, title, children }: { theme: 'light' | 'dark'; title: string; children: React.ReactNode }) {
  return (
    <div className={`space-y-3 pb-4 border-b ${theme === 'dark' ? 'border-gray-800' : 'border-gray-200'}`}>
      <h3 className={`${theme === 'dark' ? 'text-purple-400' : 'text-purple-600'}`}>{title}</h3>
      {children}
    </div>
  );
}

function LayoutPreview({ cols, rows, theme }: { cols: number; rows: number; theme: 'light' | 'dark' }) {
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
    // 關閉
    return (
      <div className="w-full h-full p-2">
        <div className={`w-full h-full rounded ${theme === 'dark' ? 'bg-purple-500' : 'bg-purple-400'}`} />
      </div>
    );
  }
  
  if (id === 2) {
    // 雙欄
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
  
  // 四格
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