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
  onToggleAllChat?: (show: boolean) => void;
  masterVolume?: number;
  masterMuted?: boolean;
  onMasterVolumeChange?: (volume: number) => void;
  onMasterMuteChange?: (muted: boolean) => void;
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
  onMasterMuteChange
}: ControlPanelProps) {
  const [showAllChat, setShowAllChat] = useState(false);
  
  // 處理全域音量變化
  const handleMasterVolumeChange = (newVolume: number[]) => {
    const volValue = newVolume[0];
    // 如果從靜音狀態拖動到非零值，自動取消靜音
    if (volValue > 0 && masterMuted && onMasterMuteChange) {
      onMasterMuteChange(false);
    }
    if (onMasterVolumeChange) {
      onMasterVolumeChange(volValue);
    }
    // 同步到隱藏的 input 元素（用於與舊的 JavaScript 代碼兼容）
    const masterVolSlider = document.getElementById('master-volume') as HTMLInputElement;
    if (masterVolSlider) {
      masterVolSlider.value = volValue.toString();
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
              {/* 隱藏的 input 元素，用於與舊的 JavaScript 代碼同步 */}
              <input
                id="master-volume"
                type="range"
                min="0"
                max="100"
                value={masterVolume}
                style={{ display: 'none' }}
                readOnly
                aria-label="總音量"
              />
              <Slider
                value={[masterVolume]}
                onValueChange={handleMasterVolumeChange}
                min={0}
                max={100}
                step={1}
                className="flex-1"
              />
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
                            value={[isStreamMuted ? 0 : streamVolume]}
                            onValueChange={(value) => {
                              const newVolume = value[0];
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
                            className="flex-1"
                          />
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