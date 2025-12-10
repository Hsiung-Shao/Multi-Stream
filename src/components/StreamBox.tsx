import React, { useEffect, useRef, useState } from 'react';
import type { StreamData } from '../utils/streamUtils';
import { loadTwitchPlayerApi, loadYouTubeIframeApi } from '../utils/loadPlayerApis';
import { Button } from './ui/button';
import { Slider } from './ui/slider';
import { RefreshCw, MessageSquare, X, Volume2, VolumeX } from 'lucide-react';

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
  const [isMuted, setIsMuted] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  // 同步聊天室顯示狀態和布局 - 參考 js/chat.js 和 js/stream.js
  useEffect(() => {
    console.log(`[StreamBox ${streamData.id}] 同步聊天室狀態`, {
      chatVisible: streamData.chatVisible,
      platform: streamData.platform,
      channelId: streamData.channelId
    });

    const contentWrapper = document.getElementById(`content-wrapper${streamData.id}`);
    const playerContainer = playerContainerRef.current;
    const chatContainer = chatContainerRef.current;
    const chatResizer = chatResizerRef.current;
    
    console.log(`[StreamBox ${streamData.id}] DOM 元素檢查`, {
      contentWrapper: !!contentWrapper,
      playerContainer: !!playerContainer,
      chatContainer: !!chatContainer,
      chatResizer: !!chatResizer,
      chatContainerId: chatContainer?.id
    });
    
    if (contentWrapper) {
      if (streamData.chatVisible) {
        contentWrapper.classList.remove('layout-vertical');
        contentWrapper.classList.add('layout-horizontal');
        console.log(`[StreamBox ${streamData.id}] 設置為水平布局`);
      } else {
        contentWrapper.classList.remove('layout-horizontal');
        contentWrapper.classList.add('layout-vertical');
        console.log(`[StreamBox ${streamData.id}] 設置為垂直布局`);
      }
    }
    
    if (playerContainer) {
      const playerWidth = streamData.chatVisible ? '80%' : '100%';
      playerContainer.style.width = playerWidth;
      playerContainer.style.height = '100%';
      playerContainer.style.transition = 'width 0.3s ease';
      console.log(`[StreamBox ${streamData.id}] 播放器寬度: ${playerWidth}`);
    }
    
    if (chatContainer) {
      // 確保聊天室容器有正確的 ID
      if (!chatContainer.id || chatContainer.id !== `chat${streamData.id}`) {
        console.log(`[StreamBox ${streamData.id}] 設置聊天室容器 ID: chat${streamData.id}`);
        chatContainer.id = `chat${streamData.id}`;
      }

      if (streamData.chatVisible) {
        chatContainer.style.width = '20%';
        chatContainer.style.height = '100%';
        chatContainer.style.display = 'block';
        chatContainer.classList.remove('hidden');
        console.log(`[StreamBox ${streamData.id}] 顯示聊天室 (20%)`);
        
        // 檢查聊天室 iframe 是否存在
        const iframe = chatContainer.querySelector('iframe');
        if (!iframe) {
          console.warn(`[StreamBox ${streamData.id}] 聊天室 iframe 不存在，嘗試創建`);
          // 如果 iframe 不存在，調用 createChat
          if (typeof (window as any).createChat === 'function') {
            setTimeout(() => {
              (window as any).createChat(
                streamData.id,
                streamData.platform,
                streamData.channelId,
                streamData.videoId
            );
            }, 100);
          }
        } else {
          console.log(`[StreamBox ${streamData.id}] 聊天室 iframe 已存在`, {
            src: iframe.src,
            width: iframe.style.width,
            height: iframe.style.height
          });
        }
      } else {
        chatContainer.style.width = '0%';
        chatContainer.style.height = '100%';
        chatContainer.style.display = 'none';
        chatContainer.classList.add('hidden');
        console.log(`[StreamBox ${streamData.id}] 隱藏聊天室`);
      }
    } else {
      console.error(`[StreamBox ${streamData.id}] 聊天室容器不存在`);
    }
    
    if (chatResizer) {
      if (streamData.chatVisible) {
        chatResizer.style.display = 'block';
      } else {
        chatResizer.style.display = 'none';
      }
    }
    
    // 更新全局 streamData 的 chatVisible 狀態 - 參考 js/chat.js 的 toggleChat
    if (window.streamData && window.streamData[streamData.id]) {
      window.streamData[streamData.id].chatVisible = streamData.chatVisible;
      console.log(`[StreamBox ${streamData.id}] 更新全局 streamData.chatVisible: ${streamData.chatVisible}`);
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
          // 讀取初始音量狀態
          try {
            if (typeof player.isMuted === 'function') {
              const muted = player.isMuted();
              setIsMuted(muted);
            }
          } catch (error) {
            console.error('讀取 Twitch 播放器音量狀態失敗:', error);
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
              
              // 讀取初始音量狀態
              try {
                const player = event.target;
                if (typeof player.isMuted === 'function') {
                  const muted = player.isMuted();
                  setIsMuted(muted);
                  if (!muted && typeof player.getVolume === 'function') {
                    const playerVolume = player.getVolume();
                    if (playerVolume !== undefined && playerVolume !== null) {
                      setVolume(playerVolume);
                      onVolumeChange(streamData.id, playerVolume);
                    }
                  }
                }
              } catch (error) {
                console.error('讀取 YouTube 播放器音量狀態失敗:', error);
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

    // 建立聊天室 - 參考 js/chat.js 和 js/stream.js
    setTimeout(() => {
      console.log(`[StreamBox ${streamData.id}] 開始創建聊天室`, {
        platform: streamData.platform,
        channelId: streamData.channelId,
        videoId: streamData.videoId,
        chatVisible: streamData.chatVisible,
        chatContainerExists: !!chatContainerRef.current,
        chatContainerId: chatContainerRef.current?.id
      });

      // 確保聊天室容器存在（chatContainerRef 指向的 div 應該有 id="chat{id}"）
      if (!chatContainerRef.current) {
        console.error(`[StreamBox ${streamData.id}] 聊天室容器 chat${streamData.id} 不存在`);
        return;
      }

      // 確保聊天室容器有正確的 ID
      if (!chatContainerRef.current.id || chatContainerRef.current.id !== `chat${streamData.id}`) {
        console.log(`[StreamBox ${streamData.id}] 設置聊天室容器 ID: chat${streamData.id}`);
        chatContainerRef.current.id = `chat${streamData.id}`;
      }

      // 檢查聊天室是否已經創建（通過全局 createChat 函數）
      const existingChat = document.getElementById(`chat${streamData.id}`);
      const existingIframe = existingChat?.querySelector('iframe');
      
      console.log(`[StreamBox ${streamData.id}] 檢查聊天室狀態`, {
        existingChat: !!existingChat,
        existingIframe: !!existingIframe,
        createChatFunctionExists: typeof (window as any).createChat === 'function'
      });

      if (!existingChat || !existingIframe) {
        // 如果聊天室不存在或沒有 iframe，使用全局 createChat 函數創建它
        // 這個函數會自動處理 Twitch 和 YouTube 的聊天室創建邏輯
        if (typeof (window as any).createChat === 'function') {
          console.log(`[StreamBox ${streamData.id}] 調用 createChat 函數`);
          (window as any).createChat(
            streamData.id,
            streamData.platform,
            streamData.channelId,
            streamData.videoId
          );
          
          // 等待 iframe 創建後再次檢查
          setTimeout(() => {
            const chatAfterCreate = document.getElementById(`chat${streamData.id}`);
            const iframeAfterCreate = chatAfterCreate?.querySelector('iframe');
            console.log(`[StreamBox ${streamData.id}] 創建後檢查`, {
              chatExists: !!chatAfterCreate,
              iframeExists: !!iframeAfterCreate,
              iframeSrc: iframeAfterCreate?.src
            });
          }, 500);
        } else {
          console.error(`[StreamBox ${streamData.id}] createChat 函數不存在`);
        }
      } else {
        console.log(`[StreamBox ${streamData.id}] 聊天室已存在`, {
          iframeSrc: existingIframe.src
        });
      }

      // 設置聊天室調整大小功能 - 參考 js/chat.js 的 setupChatResizer
      if (typeof (window as any).setupChatResizer === 'function') {
        console.log(`[StreamBox ${streamData.id}] 設置聊天室調整大小功能`);
        (window as any).setupChatResizer(streamData.id);
      } else {
        console.warn(`[StreamBox ${streamData.id}] setupChatResizer 函數不存在`);
      }

      // 根據 chatVisible 狀態設置聊天室顯示/隱藏
      // 參考 js/stream.js：YouTube 預設隱藏，其他平台預設顯示
      console.log(`[StreamBox ${streamData.id}] 設置聊天室顯示狀態: ${streamData.chatVisible}`);
      if (!streamData.chatVisible) {
        if (chatContainerRef.current) {
          chatContainerRef.current.classList.add('hidden');
          chatContainerRef.current.style.display = 'none';
        }
        if (chatResizerRef.current) {
          chatResizerRef.current.style.display = 'none';
        }
      } else {
        if (chatContainerRef.current) {
          chatContainerRef.current.classList.remove('hidden');
          chatContainerRef.current.style.display = 'block';
        }
        if (chatResizerRef.current) {
          chatResizerRef.current.style.display = 'block';
        }
      }
    }, 100);

    // 設置音量控制 - 參考 js/volume.js
    // 注意：React 組件中我們已經實現了音量控制，但為了與舊代碼兼容，
    // 我們仍然調用 setupVolumeControl（雖然它可能不會找到 .volume 元素）
    setTimeout(() => {
      if (boxRef.current && typeof (window as any).setupVolumeControl === 'function') {
        (window as any).setupVolumeControl(boxRef.current, streamData.id);
      }
    }, 200);

    // 確保在播放器就緒後應用總音量 - 參考 js/volume.js 的 applyMasterVolumeToStream
    setTimeout(() => {
      if (typeof (window as any).applyMasterVolumeToStream === 'function') {
        (window as any).applyMasterVolumeToStream(streamData.id);
      }
    }, 1500);

    // 移除拖拽功能 - StreamBox 不應該可拖曳
    // 不再設置 makeDraggableResizable

    // 清理函數
    return () => {
      if (window.players && window.players[streamData.id]) {
        if (window.players[streamData.id].type === 'youtube' && window.players[streamData.id].player.destroy) {
          window.players[streamData.id].player.destroy();
        }
        delete window.players[streamData.id];
      }
    };
  }, [streamData.id, streamData.platform, streamData.channelId, streamData.videoId, onVolumeChange]);



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
          <div className="flex items-center gap-3 min-w-[300px] flex-shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className={`h-8 w-8 flex-shrink-0 p-0 ${theme === 'dark' ? 'text-gray-300 hover:text-white hover:bg-gray-700' : 'text-gray-700 hover:text-black hover:bg-gray-200'}`}
              title={isMuted ? '取消靜音' : '靜音'}
              onClick={(e) => {
                e.stopPropagation();
                setIsMuted(!isMuted);
              }}
            >
              {isMuted ? (
                <VolumeX className="size-4" />
              ) : (
                <Volume2 className="size-4" />
              )}
            </Button>
            <div className="flex-1 flex items-center gap-3 min-w-0">
              <Slider
                value={[isMuted ? 0 : volume]}
                trackStyle={{ minWidth: '80px' }}
                onValueChange={(value) => {
                  const newVolume = value[0];
                  
                  // 如果調整音量且之前是靜音狀態，取消靜音
                  if (newVolume > 0 && isMuted) {
                    setIsMuted(false);
                  }
                  
                  // 只更新本地狀態和全局 streamData
                  setVolume(newVolume);
                  onVolumeChange(streamData.id, newVolume);
                  
                  if (window.streamData && window.streamData[streamData.id]) {
                    window.streamData[streamData.id].volume = newVolume;
                  }
                }}
                min={0}
                max={100}
                step={1}
                className="flex-1"
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
              />
              <span className={`text-sm min-w-[48px] text-right flex-shrink-0 ${theme === 'dark' ? 'text-purple-400' : 'text-purple-600'}`}>
                {isMuted ? '0%' : `${volume}%`}
              </span>
            </div>
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
            className={`h-8 w-8 flex-shrink-0 ${theme === 'dark' ? 'text-gray-400 hover:text-white hover:bg-gray-700' : 'text-gray-600 hover:text-black hover:bg-gray-200'} ${streamData.chatVisible ? 'bg-purple-500/30 text-purple-400 hover:bg-purple-500/40 hover:text-purple-300 border border-purple-500/50' : ''}`}
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
            width: streamData.chatVisible ? '80%' : '100%',
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
            width: streamData.chatVisible ? '20%' : '0%',
            height: '100%',
            flexShrink: 0,
            position: 'relative',
            overflow: 'hidden',
            transition: 'width 0.3s ease'
          }}
        >
          {/* chat-resizer 應該在聊天室容器內部，使用 absolute 定位在左側邊緣 */}
          {/* 注意：chat-resizer 必須在 iframe 之前，這樣 iframe 才會在下方（z-index 較低） */}
          <div
            ref={chatResizerRef}
            className="chat-resizer"
            id={`chat-resizer${streamData.id}`}
            style={{
              position: 'absolute',
              top: '0',
              left: '0',
              width: '4px',
              height: '100%',
              cursor: 'ew-resize',
              zIndex: 10,
              display: streamData.chatVisible ? 'block' : 'none',
              backgroundColor: 'transparent',
              pointerEvents: 'auto' // 確保可以拖曳
            }}
          />
          {/* 聊天室內容（iframe）會由 createChat 函數動態添加到這裡 */}
          {/* iframe 會自動在 chat-resizer 下方，因為 z-index 較低 */}
        </div>
      </div>

      {/* Resizer */}
      <div className="resizer" />
    </div>
  );
}

