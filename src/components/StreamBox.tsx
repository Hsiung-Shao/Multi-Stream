import { useEffect, useRef, useState } from 'react';
import type { StreamData } from '../utils/streamUtils';
import { loadTwitchPlayerApi, loadYouTubeIframeApi } from '../utils/loadPlayerApis';
import { Button } from './ui/button';
import { Slider } from './ui/slider';
import { RefreshCw, MessageSquare, X, Volume2 } from 'lucide-react';

interface StreamBoxProps {
  streamData: StreamData;
  theme: 'light' | 'dark';
  onRemove: (id: number) => void;
  onReload: (id: number) => void;
  onToggleChat: (id: number) => void;
  onSeparateChat: (id: number) => void;
  onVolumeChange: (id: number, volume: number) => void;
}

// 全局變數聲明（這些應該在 window 對象上）
declare global {
  interface Window {
    players: Record<number, { type: 'twitch' | 'youtube'; player: any }>;
    streamData: Record<number, StreamData>;
    Twitch?: any;
    YT?: any;
    twitchApi?: any;
    youtubeApiUtils?: any;
  }
}

export function StreamBox({
  streamData,
  theme,
  onRemove,
  onReload,
  onToggleChat,
  onSeparateChat,
  onVolumeChange
}: StreamBoxProps) {
  const playerContainerRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const chatResizerRef = useRef<HTMLDivElement>(null);
  const [volume, setVolume] = useState(streamData.volume);
  const boxRef = useRef<HTMLDivElement>(null);

  // 同步聊天室顯示狀態和布局
  useEffect(() => {
    const contentWrapper = document.getElementById(`content-wrapper${streamData.id}`);
    const playerContainer = playerContainerRef.current;
    const chatContainer = chatContainerRef.current;
    const chatResizer = chatResizerRef.current;
    
    if (contentWrapper) {
      if (streamData.chatVisible) {
        contentWrapper.classList.remove('layout-vertical');
        contentWrapper.classList.add('layout-horizontal');
      } else {
        contentWrapper.classList.remove('layout-horizontal');
        contentWrapper.classList.add('layout-vertical');
      }
    }
    
    if (playerContainer) {
      playerContainer.style.width = streamData.chatVisible ? '70%' : '100%';
      playerContainer.style.height = '100%';
      playerContainer.style.transition = 'width 0.3s ease';
    }
    
    if (chatContainer) {
      if (streamData.chatVisible) {
        chatContainer.style.width = '30%';
        chatContainer.style.height = '100%';
        chatContainer.style.display = 'block';
        chatContainer.classList.remove('hidden');
      } else {
        chatContainer.style.width = '0%';
        chatContainer.style.height = '100%';
        chatContainer.style.display = 'none';
        chatContainer.classList.add('hidden');
      }
    }
    
    if (chatResizer) {
      if (streamData.chatVisible) {
        chatResizer.style.display = 'block';
      } else {
        chatResizer.style.display = 'none';
      }
    }
    
    // 調用原有的 toggleChat 函數以確保聊天室正確初始化
    if (typeof (window as any).toggleChat === 'function') {
      // 只在狀態改變時調用，避免無限循環
      const currentChatVisible = !chatContainer?.classList.contains('hidden');
      if (currentChatVisible !== streamData.chatVisible) {
        (window as any).toggleChat(streamData.id);
      }
    }
  }, [streamData.chatVisible, streamData.id]);

  // 初始化播放器
  useEffect(() => {
    if (!playerContainerRef.current) return;

    // 獲取 Twitch Parents
    const getTwitchParents = (): string[] => {
      const domain = window.location.hostname;
      if (domain === 'localhost') {
        return ['localhost'];
      }
      return [domain];
    };

    const createTwitchPlayer = async () => {
      try {
        // 確保 Twitch API 已載入
        if (typeof window.Twitch === 'undefined' || !window.Twitch.Player) {
          await loadTwitchPlayerApi();
        }

        if (!playerContainerRef.current) return;

        const parentDomains = getTwitchParents();
        
        const options = {
          width: '100%',
          height: '100%',
          channel: streamData.channelId,
          parent: parentDomains,
          autoplay: true,
          muted: false
        };
        
        const player = new window.Twitch.Player(`player${streamData.id}`, options);
        
        if (!window.players) window.players = {};
        window.players[streamData.id] = {
          type: 'twitch',
          player: player
        };
        
        player.addEventListener(window.Twitch.Player.READY, () => {
          // 應用總音量控制
          if (typeof (window as any).applyMasterVolumeToStream === 'function') {
            (window as any).applyMasterVolumeToStream(streamData.id);
          }
        });
        
        player.addEventListener(window.Twitch.Player.ERROR, () => {
          alert('無法載入 Twitch 直播，請確認：\n1. 頻道名稱正確\n2. 頻道正在直播\n3. 網路連線正常');
        });
      } catch (error) {
        console.error('無法建立 Twitch 播放器:', error);
        alert('無法載入 Twitch API。請重新整理頁面或檢查網路連線。');
      }
    };

    const createYouTubePlayer = async () => {
      try {
        // 確保 YouTube API 已載入
        if (typeof window.YT === 'undefined' || !window.YT.Player) {
          await loadYouTubeIframeApi();
        }

        if (!playerContainerRef.current) return;
        
        const player = new window.YT.Player(`player${streamData.id}`, {
          videoId: streamData.videoId,
          width: '100%',
          height: '100%',
          playerVars: {
            autoplay: 1,
            mute: 0,
            rel: 0,
            modestbranding: 1,
            playsinline: 1,
            enablejsapi: 1,
            origin: window.location.protocol === 'https:' ? window.location.origin : 'http://localhost'
          },
          events: {
            onReady: (event: any) => {
              // 應用總音量控制
              if (typeof (window as any).applyMasterVolumeToStream === 'function') {
                (window as any).applyMasterVolumeToStream(streamData.id);
              }
            },
            onError: (event: any) => {
              let errorMsg = '無法載入 YouTube 直播';
              switch(event.data) {
                case 2: errorMsg += '：無效的影片 ID'; break;
                case 5: errorMsg += '：HTML5 播放器錯誤'; break;
                case 100: errorMsg += '：影片不存在或已被刪除'; break;
                case 101: 
                case 150: errorMsg += '：此影片不允許嵌入播放'; break;
              }
              alert(errorMsg);
            }
          }
        });
        
        if (!window.players) window.players = {};
        window.players[streamData.id] = {
          type: 'youtube',
          player: player
        };
      } catch (error) {
        console.error('無法建立 YouTube 播放器:', error);
        alert('無法載入 YouTube API。請重新整理頁面或檢查網路連線。');
      }
    };

    // 建立播放器
    if (streamData.platform === 'twitch') {
      createTwitchPlayer().catch(error => {
        console.error('創建 Twitch 播放器失敗:', error);
      });
    } else if (streamData.platform === 'youtube') {
      createYouTubePlayer().catch(error => {
        console.error('創建 YouTube 播放器失敗:', error);
      });
    }

    // 建立聊天室
    setTimeout(() => {
      if (typeof (window as any).createChat === 'function') {
        (window as any).createChat(
          streamData.id,
          streamData.platform,
          streamData.channelId,
          streamData.videoId
        );
      }

      // 設置聊天室調整大小功能
      if (typeof (window as any).setupChatResizer === 'function') {
        (window as any).setupChatResizer(streamData.id);
      }

      // 如果聊天室預設為隱藏（如YouTube），立即隱藏
      if (!streamData.chatVisible) {
        if (chatContainerRef.current) {
          chatContainerRef.current.classList.add('hidden');
        }
        if (chatResizerRef.current) {
          chatResizerRef.current.style.display = 'none';
        }
      }
    }, 100);

    // 設置音量控制
    setTimeout(() => {
      if (boxRef.current && typeof (window as any).setupVolumeControl === 'function') {
        (window as any).setupVolumeControl(boxRef.current, streamData.id);
      }
    }, 200);

    // 確保在播放器就緒後應用總音量
    setTimeout(() => {
      if (typeof (window as any).applyMasterVolumeToStream === 'function') {
        (window as any).applyMasterVolumeToStream(streamData.id);
      }
    }, 1500);

    // 設置拖拽和調整大小
    setTimeout(() => {
      if (boxRef.current && typeof (window as any).makeDraggableResizable === 'function') {
        (window as any).makeDraggableResizable(boxRef.current);
      }
    }, 100);

    // 清理函數
    return () => {
      if (window.players && window.players[streamData.id]) {
        if (window.players[streamData.id].type === 'youtube' && window.players[streamData.id].player.destroy) {
          window.players[streamData.id].player.destroy();
        }
        delete window.players[streamData.id];
      }
    };
  }, [streamData.id, streamData.platform, streamData.channelId, streamData.videoId]);


  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseInt(e.target.value);
    setVolume(newVolume);
    onVolumeChange(streamData.id, newVolume);
  };

  const handleToggleChat = () => {
    onToggleChat(streamData.id);
  };

  // 預設位置 - 佔滿主內容區域（僅減去 Navbar）
  useEffect(() => {
    if (boxRef.current) {
      // 獲取 Navbar 高度（動態計算）
      const navbar = document.querySelector('nav');
      const navbarHeight = navbar ? navbar.getBoundingClientRect().height : 64; // 默認 64px (4rem)
      
      // 計算可用空間（僅減去 Navbar）
      const availableWidth = window.innerWidth;
      const availableHeight = window.innerHeight - navbarHeight;
      
      boxRef.current.style.width = availableWidth + 'px';
      boxRef.current.style.height = availableHeight + 'px';
      boxRef.current.style.left = '0';
      boxRef.current.style.top = navbarHeight + 'px';
      boxRef.current.style.right = 'auto';
      boxRef.current.style.bottom = 'auto';
      boxRef.current.style.position = 'fixed';
    }
    
    // 監聽窗口大小變化
    const handleResize = () => {
      if (boxRef.current) {
        const navbar = document.querySelector('nav');
        const navbarHeight = navbar ? navbar.getBoundingClientRect().height : 64;
        
        const availableWidth = window.innerWidth;
        const availableHeight = window.innerHeight - navbarHeight;
        
        boxRef.current.style.width = availableWidth + 'px';
        boxRef.current.style.height = availableHeight + 'px';
        boxRef.current.style.top = navbarHeight + 'px';
      }
    };
    
    window.addEventListener('resize', handleResize);
    
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [streamData.id]);

  // 點擊選中
  const handleBoxClick = () => {
    document.querySelectorAll('.stream-box').forEach(b => b.classList.remove('active'));
    if (boxRef.current) {
      boxRef.current.classList.add('active');
    }
  };

  // 獲取串流標題
  const getStreamTitle = () => {
    if (streamData.displayName) {
      return streamData.displayName;
    }
    if (streamData.name) {
      return streamData.name;
    }
    if (streamData.platform === 'twitch') {
      return streamData.channelId || `串流 #${streamData.id}`;
    } else {
      return streamData.videoId || `串流 #${streamData.id}`;
    }
  };

  return (
    <div
      ref={boxRef}
      className={`stream-box relative ${theme === 'dark' ? 'bg-gray-900' : 'bg-white'} rounded-lg shadow-lg overflow-hidden border ${theme === 'dark' ? 'border-gray-700' : 'border-gray-200'}`}
      id={`box${streamData.id}`}
      data-stream-id={streamData.id}
      onClick={handleBoxClick}
    >
      {/* Toolbar - 工具列表 */}
      <div 
        className={`controls flex items-center gap-3 px-4 py-2.5 ${theme === 'dark' ? 'bg-gray-800/95 border-b border-gray-700' : 'bg-gray-50/95 border-b border-gray-200'} backdrop-blur-sm`}
        style={{ cursor: 'move' }}
        onMouseDown={(e) => {
          // 如果點擊的是按鈕或滑塊，不觸發拖拽
          const target = e.target as HTMLElement;
          if (target.closest('button') || target.closest('[data-slot="slider"]') || target.closest('input')) {
            return;
          }
        }}
      >
        {/* 左側工具組 */}
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {/* 串流標題 */}
          <div className="flex items-center min-w-0 flex-shrink-0">
            <span className={`text-sm font-semibold truncate ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
              {getStreamTitle()}
            </span>
          </div>

          {/* 音量條 */}
          <div className="flex items-center gap-2 min-w-[200px] flex-shrink-0">
            <Volume2 className={`size-4 flex-shrink-0 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`} />
            <Slider
              value={[volume]}
              onValueChange={(value) => {
                const newVolume = value[0];
                setVolume(newVolume);
                onVolumeChange(streamData.id, newVolume);
              }}
              min={0}
              max={100}
              step={1}
              className="flex-1"
              onClick={(e) => e.stopPropagation()}
            />
            <span className={`text-xs min-w-[38px] text-right flex-shrink-0 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
              {volume}%
            </span>
          </div>

          {/* 刷新按鈕 */}
          <Button
            variant="ghost"
            size="icon"
            className={`h-8 w-8 flex-shrink-0 ${theme === 'dark' ? 'text-gray-400 hover:text-white hover:bg-gray-700' : 'text-gray-600 hover:text-black hover:bg-gray-200'}`}
            title="重新整理串流"
            onClick={(e) => {
              e.stopPropagation();
              onReload(streamData.id);
            }}
          >
            <RefreshCw className="size-4" />
          </Button>

          {/* 內嵌聊天室顯示/隱藏按鈕 */}
          <Button
            variant="ghost"
            size="icon"
            className={`h-8 w-8 flex-shrink-0 ${theme === 'dark' ? 'text-gray-400 hover:text-white hover:bg-gray-700' : 'text-gray-600 hover:text-black hover:bg-gray-200'} ${streamData.chatVisible ? 'bg-purple-500/20 text-purple-400 hover:text-purple-300' : ''}`}
            title={streamData.chatVisible ? '隱藏聊天室' : '顯示聊天室'}
            onClick={(e) => {
              e.stopPropagation();
              handleToggleChat();
            }}
          >
            <MessageSquare className="size-4" />
          </Button>

          {/* 關閉串流按鈕 */}
          <Button
            variant="ghost"
            size="icon"
            className={`h-8 w-8 flex-shrink-0 ${theme === 'dark' ? 'text-gray-400 hover:text-red-400 hover:bg-red-500/20' : 'text-gray-600 hover:text-red-600 hover:bg-red-50'}`}
            title="關閉串流"
            onClick={(e) => {
              e.stopPropagation();
              onRemove(streamData.id);
            }}
          >
            <X className="size-4" />
          </Button>
        </div>
      </div>

      {/* Content Wrapper */}
      <div 
        className={`content-wrapper flex ${streamData.chatVisible ? 'layout-horizontal' : 'layout-vertical'}`}
        id={`content-wrapper${streamData.id}`}
        style={{
          height: 'calc(100% - 48px)', // 減去工具列高度
          width: '100%',
          position: 'relative'
        }}
      >
        <div
          ref={playerContainerRef}
          className="player-container"
          id={`player${streamData.id}`}
          style={{
            width: streamData.chatVisible ? '70%' : '100%',
            height: '100%',
            flexShrink: 0,
            position: 'relative'
          }}
        />
        <div
          ref={chatContainerRef}
          className={`chat-container ${streamData.chatVisible ? '' : 'hidden'}`}
          id={`chat${streamData.id}`}
          style={{
            width: streamData.chatVisible ? '30%' : '0%',
            height: '100%',
            flexShrink: 0,
            position: 'relative',
            overflow: 'hidden',
            transition: 'width 0.3s ease'
          }}
        >
          <div
            ref={chatResizerRef}
            className="chat-resizer"
            id={`chat-resizer${streamData.id}`}
            style={{
              display: streamData.chatVisible ? 'block' : 'none'
            }}
          />
        </div>
      </div>

      {/* Resizer */}
      <div className="resizer" />
    </div>
  );
}

