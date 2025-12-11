import React, { useState, useEffect, useRef } from 'react';
import { RefreshCw, Volume2, VolumeX, ChevronUp, ChevronDown, GripVertical, X } from 'lucide-react';
import { Button } from './ui/button';
import { Slider } from './ui/slider';
import { Switch } from './ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import type { StreamData } from '../utils/streamUtils';
import type { LayoutType } from '../utils/layoutUtils';
import type { ChatLayoutType } from '../utils/chatLayoutUtils';

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
  onToggleMute
}: ControlPanelProps) {
  const [volume, setVolume] = useState([100]);
  const [isMuted, setIsMuted] = useState(false);
  const [showAllChat, setShowAllChat] = useState(false);
  
  // 同步總音量到全局變量 - 參考 js/volume.js
  useEffect(() => {
    (window as any).masterVolume = volume[0];
    // 觸發自定義事件，通知 StreamBox 總音量已改變
    window.dispatchEvent(new CustomEvent('masterVolumeChange', { detail: { volume: volume[0] } }));
  }, [volume]);
  
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
    { id: 1, icon: '📺', label: '單一', cols: 1, rows: 1 },
    { id: 2, icon: '⬅️➡️', label: '左右', cols: 2, rows: 1 },
    { id: 3, icon: '⬆️⬇️', label: '上下', cols: 1, rows: 2 },
    { id: 4, icon: '⊞', label: '四格', cols: 2, rows: 2 },
    { id: 5, icon: '⬆️⬇️⬇️', label: '上大下三', cols: 3, rows: 2, special: 'top-large-bottom-three' },
    { id: 6, icon: '⊞⊞', label: '3×2', cols: 3, rows: 2 },
    { id: 9, icon: '⊞⊞⊞', label: '3×3', cols: 3, rows: 3 },
  ];

  const chatLayouts = [
    { id: 1, label: '關閉', icon: '□' },
    { id: 2, label: '單一', icon: '▢' },
    { id: 3, label: '雙欄', icon: '▢▢' },
    { id: 4, label: '四格', icon: '▦' },
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
        zIndex: 1000
      }}
    >
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className={`${theme === 'dark' ? 'text-white' : 'text-black'}`}>控制面板</h2>
        </div>

        {/* Layout Control */}
        <Section theme={theme} title="布局控制">
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
        <Section theme={theme} title="聊天室布局">
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
        <Section theme={theme} title="聊天室控制">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className={`text-sm ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                顯示所有聊天室
              </label>
              <Switch checked={showAllChat} onCheckedChange={setShowAllChat} />
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
                id="master-volume"
                value={volume}
                onValueChange={(value) => {
                  setVolume(value);
                  // 觸發 updateMasterVolume 函數（如果存在）- 參考 js/volume.js
                  if (typeof (window as any).updateMasterVolume === 'function') {
                    (window as any).updateMasterVolume();
                  }
                }}
                max={100}
                step={1}
                className="flex-1"
              />
              <span id="master-volume-value" className={`text-sm min-w-[48px] text-right ${theme === 'dark' ? 'text-purple-400' : 'text-purple-600'}`}>
                {volume[0]}%
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setIsMuted(!isMuted);
                  // 觸發 muteAll 函數（如果存在）- 參考 js/volume.js
                  if (typeof (window as any).muteAll === 'function') {
                    (window as any).muteAll();
                  }
                }}
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
          {streams.length === 0 ? (
            <div className={`py-8 text-center text-sm ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>
              暫無串流
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
                            className={`h-6 w-6 ${theme === 'dark' ? 'text-gray-400 hover:text-white hover:bg-gray-700' : 'text-gray-600 hover:text-black hover:bg-gray-200'}`}
                            title={stream.isMuted ? '取消靜音' : '靜音'}
                            onClick={() => onToggleMute(stream.id)}
                          >
                            {stream.isMuted ? (
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
                            title="上移"
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
                            title="下移"
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
                            title="關閉串流"
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
                            🔊 音量
                          </span>
                          <Slider
                            value={[stream.isMuted ? 0 : streamVolume]}
                            onValueChange={(value) => {
                              const newVolume = value[0];
                              // 如果調整音量且之前是靜音狀態，取消靜音
                              if (newVolume > 0 && stream.isMuted && onToggleMute) {
                                onToggleMute(stream.id);
                              }
                              onVolumeChange(stream.id, newVolume);
                            }}
                            min={0}
                            max={100}
                            step={1}
                            className="flex-1"
                          />
                          <span className={`text-xs min-w-[40px] text-right ${theme === 'dark' ? 'text-purple-400' : 'text-purple-600'}`}>
                            {stream.isMuted ? '0%' : `${streamVolume}%`}
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