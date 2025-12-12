import React, { useEffect, useRef, useState, useCallback } from 'react';
import type { StreamData } from '../utils/streamUtils';
import { apiLoader } from '../utils/apiLoader';
import { Button as MuiButton, Slider } from '@mui/material';
import { RefreshCw, MessageSquare, X, Volume2, VolumeX } from 'lucide-react';
import type { LayoutStyle } from '../utils/layoutUtils';

interface StreamBoxProps {
  streamData: StreamData;
  theme: 'light' | 'dark';
  layoutStyle?: LayoutStyle;
  onRemove: (id: number) => void;
  onReload: (id: number) => void;
  onToggleChat: (id: number) => void;
  onSeparateChat: (id: number) => void;
  onVolumeChange?: (id: number, volume: number) => void;
  streamIndex?: number; // 串流順序索引
  chatLayoutType?: 'none' | 'single' | 'dual' | 'quad'; // 聊天室布局類型
}

// 全局變數聲明（這些應該在 window 對象上）
declare global {
  interface Window {
    players: Record<number, { type: 'twitch' | 'youtube'; player: any }>;
    streamData: Record<number, StreamData>;
    Twitch?: any;
    YT?: any;
    twitchApi?: {
      checkMultipleChannelsLiveStatus: (channelIds: string[]) => Promise<Record<string, { isLive: boolean; viewerCount?: number; gameName?: string }>>;
    };
    youtubeApiUtils?: {
      checkChannelLiveStatus: (channelId: string) => Promise<{ isLive: boolean }>;
    };
  }
}

export function StreamBox({
  streamData,
  theme,
  layoutStyle,
  onRemove,
  onReload,
  onToggleChat,
  onSeparateChat,
  onVolumeChange,
  streamIndex,
  chatLayoutType = 'none'
}: StreamBoxProps) {
  const playerContainerRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const chatResizerRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const playerCreatingRef = useRef<boolean>(false);
  const playerRetryCountRef = useRef<number>(0);
  const playerInitializedRef = useRef<boolean>(false);
  
  // 計算聊天室寬度狀態（用於 JSX 中的樣式）
  const [chatWidth, setChatWidth] = useState<number>(0);
  const [playerWidth, setPlayerWidth] = useState<string>('100%');
  
  // 音量狀態
  const [localVolume, setLocalVolume] = useState<number>(streamData.volume || 100);
  const [isMuted, setIsMuted] = useState<boolean>(streamData.isMuted || false);
  
  // 收藏名稱狀態
  const [favoriteName, setFavoriteName] = useState<string | null>(null);

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
    
    if (playerContainer && chatContainer) {
      // 計算聊天室寬度，確保符合最小寬度要求
      // Twitch 聊天室最小寬度：300px，YouTube 聊天室最小寬度：200px
      const minChatWidth = streamData.platform === 'twitch' ? 300 : 200;
      
      if (streamData.chatVisible) {
        // 獲取容器總寬度
        const containerWidth = chatContainer.parentElement?.clientWidth || 0;
        const chatWidthPercent = 20; // 20% 寬度
        const chatWidthPx = (containerWidth * chatWidthPercent) / 100;
        
        // 如果計算出的寬度小於最小寬度，使用最小寬度
        const finalChatWidth = Math.max(chatWidthPx, minChatWidth);
        const finalChatWidthPercent = (finalChatWidth / containerWidth) * 100;
        const finalPlayerWidthPercent = 100 - finalChatWidthPercent;
        
        // 設置聊天室寬度（使用像素值確保最小寬度）
        chatContainer.style.width = `${finalChatWidth}px`;
        chatContainer.style.minWidth = `${minChatWidth}px`;
        chatContainer.style.height = '100%';
        chatContainer.style.display = 'block';
        chatContainer.classList.remove('hidden');
        
        // 設置播放器寬度（使用 calc 來適應聊天室寬度）
        playerContainer.style.width = `calc(100% - ${finalChatWidth}px)`;
        playerContainer.style.height = '100%';
        playerContainer.style.transition = 'width 0.3s ease';
        
        console.log(`[StreamBox ${streamData.id}] 顯示聊天室 (寬度: ${finalChatWidth}px, 最小: ${minChatWidth}px)`);
      } else {
        // 隱藏聊天室時，播放器佔滿 100%
        chatContainer.style.width = '0px';
        chatContainer.style.minWidth = '0px';
        chatContainer.style.height = '100%';
        chatContainer.style.display = 'none';
        chatContainer.classList.add('hidden');
        
        playerContainer.style.width = '100%';
        playerContainer.style.height = '100%';
        playerContainer.style.transition = 'width 0.3s ease';
        
        // 更新狀態用於 JSX 渲染
        setChatWidth(0);
        setPlayerWidth('100%');
        
        console.log(`[StreamBox ${streamData.id}] 隱藏聊天室`);
      }
    } else if (playerContainer) {
      // 如果沒有聊天室容器，播放器佔滿 100%
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
        
        // 檢查聊天室 iframe 是否存在
        const iframe = chatContainer.querySelector('iframe');
        console.log(`[StreamBox ${streamData.id}] 檢查聊天室 iframe`, {
          iframeExists: !!iframe,
          chatVisible: streamData.chatVisible,
          platform: streamData.platform,
          channelId: streamData.channelId,
          videoId: streamData.videoId,
          chatContainerId: chatContainer.id,
          chatContainerChildren: chatContainer.children.length,
          createChatFunction: typeof (window as any).createChat
        });
        
        if (!iframe) {
          console.warn(`[StreamBox ${streamData.id}] 聊天室 iframe 不存在，嘗試創建`, {
            platform: streamData.platform,
            channelId: streamData.channelId,
            videoId: streamData.videoId,
            chatContainerExists: !!chatContainer,
            createChatAvailable: typeof (window as any).createChat === 'function'
          });
          
          // 如果 iframe 不存在，調用 createChat
          if (typeof (window as any).createChat === 'function') {
            console.log(`[StreamBox ${streamData.id}] 調用 createChat 函數`);
            // 使用多次重試，確保在 Cloudflare preview 環境中也能正確創建
            let retryCount = 0;
            const maxRetries = 5;
            const tryCreateChat = () => {
              try {
                console.log(`[StreamBox ${streamData.id}] 嘗試創建聊天室 (嘗試 ${retryCount + 1}/${maxRetries})`, {
                  id: streamData.id,
                  platform: streamData.platform,
                  channelId: streamData.channelId,
                  videoId: streamData.videoId
                });
                
                (window as any).createChat(
                  streamData.id,
                  streamData.platform,
                  streamData.channelId,
                  streamData.videoId
                );
                
                // 檢查是否成功創建
                setTimeout(() => {
                  const createdIframe = chatContainer.querySelector('iframe');
                  const chatContent = chatContainer.innerHTML;
                  console.log(`[StreamBox ${streamData.id}] 創建後檢查`, {
                    iframeExists: !!createdIframe,
                    iframeSrc: createdIframe?.src,
                    chatContentLength: chatContent.length,
                    chatContainerChildren: chatContainer.children.length
                  });
                  
                  if (!createdIframe && retryCount < maxRetries) {
                    retryCount++;
                    console.warn(`[StreamBox ${streamData.id}] 聊天室創建失敗，重試 ${retryCount}/${maxRetries}`);
                    setTimeout(tryCreateChat, 200 * retryCount); // 遞增延遲
                  } else if (createdIframe) {
                    console.log(`[StreamBox ${streamData.id}] 聊天室創建成功`);
                  }
                }, 300);
              } catch (error) {
                console.error(`[StreamBox ${streamData.id}] 創建聊天室時發生錯誤:`, error);
                if (retryCount < maxRetries) {
                  retryCount++;
                  console.log(`[StreamBox ${streamData.id}] 準備重試 (${retryCount}/${maxRetries})`);
                  setTimeout(tryCreateChat, 200 * retryCount);
                } else {
                  console.error(`[StreamBox ${streamData.id}] 聊天室創建失敗，已達最大重試次數`);
                }
              }
            };
            setTimeout(tryCreateChat, 100);
          } else {
            console.error(`[StreamBox ${streamData.id}] createChat 函數不存在，請確保 js/chat.js 已載入`, {
              windowKeys: Object.keys(window).filter(k => k.includes('chat') || k.includes('Chat')),
              chatJsLoaded: typeof (window as any).createChat,
              documentReadyState: document.readyState,
              scriptsLoaded: Array.from(document.querySelectorAll('script[src]')).map(s => (s as HTMLScriptElement).src),
              allWindowFunctions: Object.keys(window).filter(k => typeof (window as any)[k] === 'function' && (k.includes('chat') || k.includes('Chat')))
            });
            
            // 嘗試等待 chat.js 載入
            const waitForChatJs = () => {
              if (typeof (window as any).createChat === 'function') {
                console.log(`[StreamBox ${streamData.id}] createChat 函數已可用，重新嘗試創建聊天室`);
                if (streamData.chatVisible) {
                  (window as any).createChat(
                    streamData.id,
                    streamData.platform,
                    streamData.channelId,
                    streamData.videoId
                  );
                }
              } else {
                // 監聽 chatFunctionsReady 事件
                const handler = () => {
                  console.log(`[StreamBox ${streamData.id}] 收到 chatFunctionsReady 事件，重新嘗試創建聊天室`);
                  if (streamData.chatVisible && typeof (window as any).createChat === 'function') {
                    (window as any).createChat(
                      streamData.id,
                      streamData.platform,
                      streamData.channelId,
                      streamData.videoId
                    );
                  }
                  window.removeEventListener('chatFunctionsReady', handler);
                };
                window.addEventListener('chatFunctionsReady', handler);
                
                // 設置超時，避免無限等待
                setTimeout(() => {
                  window.removeEventListener('chatFunctionsReady', handler);
                  console.warn(`[StreamBox ${streamData.id}] 等待 createChat 函數超時`);
                }, 5000);
              }
            };
            
            // 如果 DOM 已就緒，立即檢查；否則等待
            if (document.readyState === 'complete') {
              setTimeout(waitForChatJs, 100);
            } else {
              window.addEventListener('load', waitForChatJs);
            }
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
  }, [streamData.chatVisible, streamData.id, streamData.platform]);

  // 監聽窗口大小變化，重新計算聊天室寬度
  useEffect(() => {
    if (!streamData.chatVisible) return;

    const handleResize = () => {
      const playerContainer = playerContainerRef.current;
      const chatContainer = chatContainerRef.current;
      if (!playerContainer || !chatContainer) return;

      const minChatWidth = streamData.platform === 'twitch' ? 300 : 200;
      const containerElement = chatContainer.parentElement || boxRef.current;
      const containerWidth = containerElement?.clientWidth || 0;

      if (containerWidth > 0) {
        const chatWidthPercent = 20;
        const chatWidthPx = (containerWidth * chatWidthPercent) / 100;
        const finalChatWidth = Math.max(chatWidthPx, minChatWidth);

        chatContainer.style.width = `${finalChatWidth}px`;
        chatContainer.style.minWidth = `${minChatWidth}px`;
        playerContainer.style.width = `calc(100% - ${finalChatWidth}px)`;

        setChatWidth(finalChatWidth);
        setPlayerWidth(`calc(100% - ${finalChatWidth}px)`);
      }
    };

    window.addEventListener('resize', handleResize);
    // 初始計算
    handleResize();

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [streamData.chatVisible, streamData.platform, streamData.id]);

  // 應用音量設定到播放器（在播放器準備好後調用）
  const applyVolumeToPlayer = (id: number) => {
    // 檢查播放器和串流數據是否存在
    if (!window.players || !window.players[id] || !window.players[id].player) {
      console.warn(`[StreamBox ${id}] 播放器不存在，無法應用音量設定`);
      return;
    }
    
    if (!window.streamData || !window.streamData[id]) {
      console.warn(`[StreamBox ${id}] 串流數據不存在，無法應用音量設定`);
      return;
    }
    
    const player = window.players[id].player;
    const streamData = window.streamData[id];
    
    // 檢查全部靜音狀態（從全局變量或 DOM 元素）
    let masterMuted = false;
    let masterVolume = 100;
    
    // 嘗試從全局變量讀取
    if ((window as any).masterMuted !== undefined) {
      masterMuted = (window as any).masterMuted;
    }
    
    // 嘗試從 DOM 元素讀取 master-volume
    const masterVolSlider = document.getElementById('master-volume') as HTMLInputElement;
    if (masterVolSlider) {
      const masterVol = parseInt(masterVolSlider.value) || 100;
      masterVolume = masterVol;
      // 如果音量為 0，視為全部靜音
      if (masterVol === 0) {
        masterMuted = true;
      }
    }
    
    // 如果全部靜音，直接靜音播放器
    if (masterMuted) {
      try {
        if (streamData.platform === 'twitch') {
          if (typeof player.setMuted === 'function') {
            player.setMuted(true);
            console.log(`[StreamBox ${id}] 應用全部靜音到 Twitch 播放器`);
          }
        } else if (streamData.platform === 'youtube') {
          if (typeof player.mute === 'function') {
            player.mute();
            console.log(`[StreamBox ${id}] 應用全部靜音到 YouTube 播放器`);
          }
        }
      } catch (e) {
        console.warn(`[StreamBox ${id}] 應用靜音時發生錯誤:`, e);
      }
      return;
    }
    
    // 如果沒有全部靜音，應用正常的音量設定
    // 使用全局的 applyMasterVolumeToStream 函數（如果存在）
    if (typeof (window as any).applyMasterVolumeToStream === 'function') {
      try {
        (window as any).applyMasterVolumeToStream(id);
        console.log(`[StreamBox ${id}] 應用音量設定到播放器`);
      } catch (e) {
        console.warn(`[StreamBox ${id}] 應用音量設定時發生錯誤:`, e);
      }
    } else {
      // 如果函數不存在，手動應用音量
      const streamVol = streamData.volume || 100;
      const actualVol = Math.round((streamVol / 100) * masterVolume);
      
      try {
        if (streamData.platform === 'twitch') {
          if (actualVol === 0) {
            if (typeof player.setMuted === 'function') {
              player.setMuted(true);
            } else if (typeof player.setVolume === 'function') {
              player.setVolume(0);
            }
          } else {
            if (typeof player.setMuted === 'function') {
              player.setMuted(false);
            }
            if (typeof player.setVolume === 'function') {
              player.setVolume(actualVol / 100);
            }
          }
        } else if (streamData.platform === 'youtube') {
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
              if (window.players && window.players[id] && window.players[id].player) {
                try {
                  if (actualVol === 0) {
                    if (typeof window.players[id].player.mute === 'function') {
                      window.players[id].player.mute();
                    }
                  } else {
                    if (typeof window.players[id].player.unMute === 'function') {
                      window.players[id].player.unMute();
                    }
                    if (typeof window.players[id].player.setVolume === 'function') {
                      window.players[id].player.setVolume(actualVol);
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
        console.warn(`[StreamBox ${id}] 應用音量時發生錯誤:`, e);
      }
    }
  };

  // 初始化播放器
  useEffect(() => {
    if (!playerContainerRef.current) return;
    
    // 檢查是否有重載觸發器（用於強制重新創建播放器）
    // 參考 js/stream.js 的 reloadStream 函數邏輯
    const hasReloadTrigger = !!(window.streamData && window.streamData[streamData.id] && (window.streamData[streamData.id] as any)._reloadTrigger);
    let shouldForceReload = false;
    
    if (hasReloadTrigger) {
      console.log(`[StreamBox ${streamData.id}] 檢測到重載觸發器，準備重新創建播放器`);
      
      // 清除重載觸發器並重置初始化標記
      delete (window.streamData[streamData.id] as any)._reloadTrigger;
      playerInitializedRef.current = false;
      playerCreatingRef.current = false;
      shouldForceReload = true;
      
      // 清理舊的播放器引用（參考 js/stream.js 第 517-523 行）
      if (window.players && window.players[streamData.id]) {
        const oldPlayer = window.players[streamData.id];
        if (oldPlayer.type === 'youtube' && oldPlayer.player && typeof oldPlayer.player.destroy === 'function') {
          try {
            oldPlayer.player.destroy();
            console.log(`[StreamBox ${streamData.id}] 已銷毀舊的 YouTube 播放器`);
          } catch (e) {
            console.warn(`[StreamBox ${streamData.id}] 清理舊播放器時發生錯誤:`, e);
          }
        }
        delete window.players[streamData.id];
      }
      
      // 確保播放器容器已清空（參考 js/stream.js 第 525-529 行）
      if (playerContainerRef.current) {
        playerContainerRef.current.innerHTML = '';
        console.log(`[StreamBox ${streamData.id}] 已清空播放器容器`);
      }
    }
    
    // 如果播放器已經初始化且關鍵屬性沒有變化，且沒有強制重載標記，跳過重新創建
    // 這可以防止因為 useEffect 依賴項變化而導致的重複創建
    if (playerInitializedRef.current && !shouldForceReload) {
      const existingPlayer = window.players && window.players[streamData.id];
      if (existingPlayer && existingPlayer.type === streamData.platform && existingPlayer.player) {
        // 檢查關鍵屬性是否變化
        const currentVideoId = streamData.platform === 'youtube' ? streamData.videoId : null;
        const currentChannelId = streamData.platform === 'twitch' ? streamData.channelId : null;
        
        // 如果平台、videoId 或 channelId 沒有變化，不重新創建
        if (existingPlayer.type === 'youtube' && currentVideoId) {
          try {
            // 檢查播放器是否仍然有效
            const playerState = existingPlayer.player.getPlayerState?.();
            if (playerState !== undefined) {
              // 播放器仍然有效，檢查 videoId 是否變化
              const playerVideoId = existingPlayer.player.getVideoData?.()?.video_id;
              if (playerVideoId === currentVideoId) {
                console.log(`[StreamBox ${streamData.id}] YouTube 播放器已存在且屬性未變化，跳過重新創建`);
                return;
              }
            }
          } catch (e) {
            // 如果無法獲取播放器狀態，可能需要重新創建
            console.log(`[StreamBox ${streamData.id}] 無法檢查播放器狀態，繼續創建新播放器`);
          }
        } else if (existingPlayer.type === 'twitch' && currentChannelId) {
          // Twitch 播放器通常不需要重新創建，除非明確需要
          // 檢查播放器是否仍然有效
          try {
            if (existingPlayer.player && typeof existingPlayer.player.getChannel === 'function') {
              const playerChannel = existingPlayer.player.getChannel();
              if (playerChannel === currentChannelId) {
                console.log(`[StreamBox ${streamData.id}] Twitch 播放器已存在且屬性未變化，跳過重新創建`);
                return;
              }
            }
          } catch (e) {
            // 如果無法檢查，繼續創建
          }
        }
      }
    }

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
        // 如果容器不存在，無法創建播放器
        if (!playerContainerRef.current) {
          console.warn(`[StreamBox ${streamData.id}] Twitch 播放器容器不存在`);
          return;
        }
        
        // 確保容器已清空（重載時）
        if (shouldForceReload && playerContainerRef.current.innerHTML) {
          playerContainerRef.current.innerHTML = '';
          console.log(`[StreamBox ${streamData.id}] 已清空 Twitch 播放器容器`);
        }
        
        // 優化：批量創建時，API 應該已經預載入，這裡只做快速檢查
        if (typeof window.Twitch === 'undefined' || !window.Twitch.Player) {
          console.log(`[StreamBox ${streamData.id}] Twitch Player API 未就緒，開始載入`);
          await apiLoader.loadTwitchPlayerApi();
          console.log(`[StreamBox ${streamData.id}] Twitch Player API 載入完成`);
        } else {
          console.log(`[StreamBox ${streamData.id}] Twitch Player API 已就緒（可能已預載入）`);
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
        
        // 優化：添加創建前檢查
        if (!window.Twitch || !window.Twitch.Player) {
          throw new Error('Twitch Player API 未就緒');
        }
        
        const player = new window.Twitch.Player(`player${streamData.id}`, options);
        
        if (!window.players) window.players = {};
        window.players[streamData.id] = {
          type: 'twitch',
          player: player
        };
        
        // 標記播放器已初始化
        playerInitializedRef.current = true;
        playerCreatingRef.current = false;
        
        console.log(`[StreamBox ${streamData.id}] Twitch 播放器創建成功`);
        
        // 優化：使用 Promise 包裝事件監聽，避免長時間等待
        const readyPromise = new Promise<void>((resolve) => {
          const readyHandler = () => {
            console.log(`[StreamBox ${streamData.id}] Twitch 播放器已就緒`);
            player.removeEventListener(window.Twitch.Player.READY, readyHandler);
            // 播放器已就緒，應用音量設定
            applyVolumeToPlayer(streamData.id);
            resolve();
          };
          
          player.addEventListener(window.Twitch.Player.READY, readyHandler);
          
          // 設置超時，避免無限等待
          setTimeout(() => {
            if (playerInitializedRef.current) {
              console.warn(`[StreamBox ${streamData.id}] Twitch 播放器就緒事件超時，但仍嘗試應用音量`);
              applyVolumeToPlayer(streamData.id);
              resolve();
            }
          }, 5000);
        });
        
        await readyPromise;
        
        player.addEventListener(window.Twitch.Player.ERROR, () => {
          console.error(`[StreamBox ${streamData.id}] Twitch 播放器錯誤`);
          alert('無法載入 Twitch 直播，請確認：\n1. 頻道名稱正確\n2. 頻道正在直播\n3. 網路連線正常');
        });
      } catch (error) {
        playerCreatingRef.current = false;
        console.error(`[StreamBox ${streamData.id}] 無法建立 Twitch 播放器:`, error);
        alert('無法載入 Twitch API。請重新整理頁面或檢查網路連線。');
      }
    };

    const createYouTubePlayer = async () => {
      // 防止重複創建（除非是強制重載）
      if (playerCreatingRef.current && !shouldForceReload) {
        console.log(`[StreamBox ${streamData.id}] 播放器正在創建中，跳過重複創建`);
        return;
      }

      try {
        // 檢查並清理舊的播放器
        if (window.players && window.players[streamData.id]) {
          const oldPlayer = window.players[streamData.id];
          if (oldPlayer.type === 'youtube' && oldPlayer.player && typeof oldPlayer.player.destroy === 'function') {
            try {
              oldPlayer.player.destroy();
            } catch (e) {
              console.warn(`[StreamBox ${streamData.id}] 清理舊播放器時發生錯誤:`, e);
            }
          }
          delete window.players[streamData.id];
        }

        // 清空容器內容
        if (playerContainerRef.current) {
          playerContainerRef.current.innerHTML = '';
        }

        // 確保容器已經準備好（有尺寸）
        if (!playerContainerRef.current) {
          console.warn(`[StreamBox ${streamData.id}] 播放器容器不存在`);
          return;
        }

        // 檢查容器是否有尺寸
        const container = playerContainerRef.current;
        const hasSize = container.offsetWidth > 0 && container.offsetHeight > 0;
        
        if (!hasSize) {
          // 如果容器還沒有尺寸，等待一下再創建（最多重試 10 次）
          if (playerRetryCountRef.current < 10) {
            playerRetryCountRef.current++;
            console.log(`[StreamBox ${streamData.id}] 容器還沒有尺寸，等待後再創建播放器 (重試 ${playerRetryCountRef.current}/10)`);
            setTimeout(() => {
              createYouTubePlayer();
            }, 100);
            return;
          } else {
            console.warn(`[StreamBox ${streamData.id}] 容器在多次重試後仍無尺寸，強制創建播放器`);
            // 即使沒有尺寸也繼續創建，讓 YouTube API 自己處理
          }
        }

        // 重置重試計數
        playerRetryCountRef.current = 0;

        // 設置創建標誌
        playerCreatingRef.current = true;

        // 確保 YouTube API 已載入
        if (typeof window.YT === 'undefined' || !window.YT.Player) {
          await apiLoader.loadYouTubePlayerApi();
        }

        if (!playerContainerRef.current) {
          playerCreatingRef.current = false;
          return;
        }

        // 再次檢查容器是否有尺寸（API 載入後可能會有變化）
        const containerAfterLoad = playerContainerRef.current;
        if (containerAfterLoad.offsetWidth === 0 || containerAfterLoad.offsetHeight === 0) {
          // 如果仍然沒有尺寸，再等待一次（最多重試 5 次）
          if (playerRetryCountRef.current < 5) {
            playerRetryCountRef.current++;
            console.log(`[StreamBox ${streamData.id}] API 載入後容器仍無尺寸，等待後再創建播放器 (重試 ${playerRetryCountRef.current}/5)`);
            playerCreatingRef.current = false;
            setTimeout(() => {
              createYouTubePlayer();
            }, 100);
            return;
          } else {
            console.warn(`[StreamBox ${streamData.id}] API 載入後容器在多次重試後仍無尺寸，強制創建播放器`);
            // 即使沒有尺寸也繼續創建
          }
        }
        
        // 重置重試計數
        playerRetryCountRef.current = 0;
        
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
              // 清除創建標誌
              playerCreatingRef.current = false;
              
              const player = event.target;
              
              // 檢測是否是直播並跳轉到最新位置
              try {
                // 延遲一小段時間，確保播放器完全載入
                setTimeout(() => {
                  try {
                    const duration = player.getDuration();
                    const videoData = player.getVideoData();
                    
                    // 如果 duration 是 Infinity 或非常大的數字（超過 24 小時），表示這是直播
                    // 或者檢查 videoData 中的 isLive 屬性
                    const isLive = duration === Infinity || duration > 86400 || videoData?.isLive;
                    
                    if (isLive) {
                      // 跳轉到最新位置（使用一個非常大的數字）
                      // allowSeekAhead: true 允許跳轉到未緩衝的位置（對於直播很重要）
                      player.seekTo(Number.MAX_SAFE_INTEGER, true);
                      console.log(`[StreamBox ${streamData.id}] 檢測到直播，已跳轉到最新位置`, {
                        duration,
                        isLive: videoData?.isLive,
                        videoId: streamData.videoId
                      });
                    }
                  } catch (error) {
                    console.warn(`[StreamBox ${streamData.id}] 檢測直播狀態時發生錯誤:`, error);
                  }
                }, 1000); // 延遲 1 秒確保播放器完全就緒
              } catch (error) {
                console.warn(`[StreamBox ${streamData.id}] 初始化直播檢測時發生錯誤:`, error);
              }
              
              // 播放器已就緒，應用音量設定
              applyVolumeToPlayer(streamData.id);
            },
            onStateChange: (event: any) => {
              // 監聽播放狀態變化，如果是直播且恢復播放，重新跳轉到最新位置
              const player = event.target;
              try {
                const duration = player.getDuration();
                const isLive = duration === Infinity || duration > 86400;
                
                if (isLive) {
                  // PLAYING = 1, BUFFERING = 3
                  // 當從暫停/緩衝狀態恢復到播放狀態時，確保跳轉到最新位置
                  if (event.data === window.YT.PlayerState.PLAYING) {
                    setTimeout(() => {
                      try {
                        const currentTime = player.getCurrentTime();
                        
                        // 如果當前時間有效且與總時長差距較大（超過 30 秒），跳轉到最新位置
                        // 對於直播，currentTime 可能會比實際直播進度落後
                        if (currentTime > 0 && duration - currentTime > 30) {
                          player.seekTo(Number.MAX_SAFE_INTEGER, true);
                          console.log(`[StreamBox ${streamData.id}] 直播播放中，檢測到進度落後，已跳轉到最新位置`, {
                            currentTime,
                            duration,
                            difference: duration - currentTime
                          });
                        }
                      } catch (error) {
                        // 靜默處理錯誤
                      }
                    }, 500);
                  }
                }
              } catch (error) {
                // 靜默處理錯誤
              }
            },
            onError: (event: any) => {
              // 清除創建標誌
              playerCreatingRef.current = false;
              
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
        
        // 標記播放器已初始化
        playerInitializedRef.current = true;
        playerCreatingRef.current = false;
        
        console.log(`[StreamBox ${streamData.id}] YouTube 播放器創建成功`);
      } catch (error) {
        // 清除創建標誌
        playerCreatingRef.current = false;
        console.error(`[StreamBox ${streamData.id}] 無法建立 YouTube 播放器:`, error);
        alert('無法載入 YouTube API。請重新整理頁面或檢查網路連線。');
      }
    };

    // 建立播放器（參考 js/stream.js 第 531-549 行）
    // 如果檢測到重載觸發器，強制重新創建播放器
    if (streamData.platform === 'twitch') {
      console.log(`[StreamBox ${streamData.id}] 開始創建 Twitch 播放器${shouldForceReload ? ' (重載模式)' : ''}`);
      createTwitchPlayer().catch(error => {
        console.error('創建 Twitch 播放器失敗:', error);
      });
    } else if (streamData.platform === 'youtube') {
      console.log(`[StreamBox ${streamData.id}] 開始創建 YouTube 播放器${shouldForceReload ? ' (重載模式)' : ''}`);
      createYouTubePlayer().catch(error => {
        console.error('創建 YouTube 播放器失敗:', error);
      });
    }

    // 建立聊天室 - 參考正式環境：立即生成，不延遲
    // 使用 requestAnimationFrame 確保 DOM 已準備好，但比 setTimeout 更快
    requestAnimationFrame(() => {
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

      // 參考正式環境：立即生成聊天室，即使 chatVisible 為 false
      // 這樣在切換到固定布局時，可以直接複製已存在的 iframe
      if (typeof (window as any).createChat === 'function') {
        console.log(`[StreamBox ${streamData.id}] 立即調用 createChat 函數`, {
          id: streamData.id,
          platform: streamData.platform,
          channelId: streamData.channelId,
          videoId: streamData.videoId
        });
        
        // 檢查聊天室是否已經創建
        // 參考正式環境：只檢查是否有 iframe，不檢查是否有其他內容（因為 chat-resizer 也會被計入）
        const existingChat = document.getElementById(`chat${streamData.id}`);
        const existingIframe = existingChat?.querySelector('iframe');
        const hasValidIframe = existingIframe && existingIframe.src;
        
        console.log(`[StreamBox ${streamData.id}] 檢查聊天室狀態`, {
          existingChat: !!existingChat,
          existingIframe: !!existingIframe,
          hasValidIframe,
          iframeSrc: existingIframe?.src,
          childrenCount: existingChat?.children.length ?? 0,
          childrenTypes: existingChat ? Array.from(existingChat.children).map(c => c.tagName) : []
        });
        
        // 如果沒有有效的 iframe，立即創建
        // 參考正式環境：即使容器有其他內容（如 chat-resizer），只要沒有 iframe 就創建
        if (!hasValidIframe) {
          console.log(`[StreamBox ${streamData.id}] 沒有有效 iframe，立即創建聊天室`);
          (window as any).createChat(
            streamData.id,
            streamData.platform,
            streamData.channelId,
            streamData.videoId
          );
        } else {
          console.log(`[StreamBox ${streamData.id}] 聊天室已存在（有有效 iframe），跳過創建`, {
            iframeSrc: existingIframe.src
          });
        }
      } else {
        // 如果 createChat 函數不存在，等待它載入
        console.warn(`[StreamBox ${streamData.id}] createChat 函數不存在，等待載入`);
        
        const waitForChatJs = () => {
          if (typeof (window as any).createChat === 'function') {
            console.log(`[StreamBox ${streamData.id}] createChat 函數已可用，立即創建聊天室`);
            const existingChat = document.getElementById(`chat${streamData.id}`);
            const existingIframe = existingChat?.querySelector('iframe');
            const existingContent = (existingChat?.children.length ?? 0) > 0;
            
            if (!existingIframe && !existingContent) {
              (window as any).createChat(
                streamData.id,
                streamData.platform,
                streamData.channelId,
                streamData.videoId
              );
            }
          } else {
            // 監聽 chatFunctionsReady 事件
            const handler = () => {
              console.log(`[StreamBox ${streamData.id}] 收到 chatFunctionsReady 事件，立即創建聊天室`);
              if (typeof (window as any).createChat === 'function') {
                const existingChat = document.getElementById(`chat${streamData.id}`);
                const existingIframe = existingChat?.querySelector('iframe');
                const existingContent = (existingChat?.children.length ?? 0) > 0;
                
                if (!existingIframe && !existingContent) {
                  (window as any).createChat(
                    streamData.id,
                    streamData.platform,
                    streamData.channelId,
                    streamData.videoId
                  );
                }
              }
              window.removeEventListener('chatFunctionsReady', handler);
            };
            window.addEventListener('chatFunctionsReady', handler);
            
            // 設置超時，避免無限等待
            setTimeout(() => {
              window.removeEventListener('chatFunctionsReady', handler);
              console.warn(`[StreamBox ${streamData.id}] 等待 createChat 函數超時`);
            }, 5000);
          }
        };
        
        // 如果 DOM 已就緒，立即檢查；否則等待
        if (document.readyState === 'complete') {
          waitForChatJs();
        } else {
          window.addEventListener('load', waitForChatJs);
        }
      }

      // 設置聊天室調整大小功能 - 參考 js/chat.js 的 setupChatResizer
      if (typeof (window as any).setupChatResizer === 'function') {
        console.log(`[StreamBox ${streamData.id}] 設置聊天室調整大小功能`);
        (window as any).setupChatResizer(streamData.id);
      } else {
        console.warn(`[StreamBox ${streamData.id}] setupChatResizer 函數不存在`);
      }

      // 根據 chatVisible 狀態設置聊天室顯示/隱藏
      // 參考正式環境：聊天室已生成，只是通過 CSS 控制顯示/隱藏
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
    });


    // 移除拖拽功能 - StreamBox 不應該可拖曳
    // 不再設置 makeDraggableResizable

    // 清理函數
    return () => {
      // 清除創建標誌和重試計數
      playerCreatingRef.current = false;
      playerRetryCountRef.current = 0;
      playerInitializedRef.current = false;
      
      if (window.players && window.players[streamData.id]) {
        if (window.players[streamData.id].type === 'youtube' && window.players[streamData.id].player.destroy) {
          try {
            window.players[streamData.id].player.destroy();
          } catch (e) {
            console.warn(`[StreamBox ${streamData.id}] 清理播放器時發生錯誤:`, e);
          }
        }
        delete window.players[streamData.id];
      }
      
      // 清空容器內容
      if (playerContainerRef.current) {
        playerContainerRef.current.innerHTML = '';
      }
    };
  }, [streamData.id, streamData.platform, streamData.channelId, streamData.videoId, (streamData as any)._reloadKey]);

  // 參考正式環境：當聊天室布局啟用時，確保聊天室已生成
  // 注意：聊天室在串流初始化時已經立即生成，這裡只是確保它存在
  useEffect(() => {
    if (chatLayoutType !== 'none') {
      // 使用 requestAnimationFrame 確保 DOM 已更新
      requestAnimationFrame(() => {
        const chatDiv = document.getElementById(`chat${streamData.id}`);
        const hasContent = chatDiv && (chatDiv.querySelector('iframe') || chatDiv.children.length > 0);
        
        // 如果聊天室不存在或沒有內容，立即創建（作為備用機制）
        if (!hasContent && typeof (window as any).createChat === 'function') {
          console.log(`[StreamBox ${streamData.id}] 聊天室布局啟用，但聊天室不存在，立即創建`, {
            chatLayoutType,
            chatVisible: streamData.chatVisible,
            hasChatDiv: !!chatDiv
          });
          
          (window as any).createChat(
            streamData.id,
            streamData.platform,
            streamData.channelId,
            streamData.videoId
          );
        } else if (hasContent) {
          console.log(`[StreamBox ${streamData.id}] 聊天室布局啟用，聊天室已存在`, {
            chatLayoutType,
            hasIframe: !!chatDiv?.querySelector('iframe'),
            hasContent: hasContent
          });
        }
      });
    }
  }, [chatLayoutType, streamData.id, streamData.platform, streamData.channelId, streamData.videoId]);



  const handleToggleChat = () => {
    onToggleChat(streamData.id);
  };

  // 應用布局樣式
  useEffect(() => {
    if (boxRef.current && layoutStyle) {
      // 應用布局樣式（容器已經處理了 Navbar 偏移）
      boxRef.current.style.position = layoutStyle.position || 'absolute';
      boxRef.current.style.left = layoutStyle.left;
      boxRef.current.style.top = layoutStyle.top;
      boxRef.current.style.width = layoutStyle.width;
      boxRef.current.style.height = layoutStyle.height;
      boxRef.current.style.right = 'auto';
      boxRef.current.style.bottom = 'auto';
      boxRef.current.style.transition = 'all 0.5s ease';
    } else if (boxRef.current && !layoutStyle) {
      // 如果沒有布局樣式，使用預設位置 - 佔滿容器
      boxRef.current.style.width = '100%';
      boxRef.current.style.height = '100%';
      boxRef.current.style.left = '0';
      boxRef.current.style.top = '0';
      boxRef.current.style.right = 'auto';
      boxRef.current.style.bottom = 'auto';
      boxRef.current.style.position = 'absolute';
    }
  }, [streamData.id, layoutStyle]);

  // 點擊選中
  const handleBoxClick = () => {
    document.querySelectorAll('.stream-box').forEach(b => b.classList.remove('active'));
    if (boxRef.current) {
      boxRef.current.classList.add('active');
    }
  };

  // 從收藏中獲取名稱的函數
  const updateFavoriteName = useCallback(() => {
    if (window.favoriteStreams) {
      const favorites = window.favoriteStreams.getList();
      const favorite = favorites.find(fav => {
        if (streamData.platform === 'twitch') {
          return fav.platform === 'twitch' && fav.channelId === streamData.channelId;
        } else {
          // YouTube: 僅在收藏中時顯示收藏名稱
          return fav.platform === 'youtube' && (
            fav.channelId === streamData.channelId || 
            fav.videoId === streamData.videoId
          );
        }
      });
      
      if (favorite && favorite.name) {
        setFavoriteName(favorite.name);
      } else {
        setFavoriteName(null);
      }
    }
  }, [streamData.platform, streamData.channelId, streamData.videoId]);

  // 從收藏中獲取名稱（初始化）
  useEffect(() => {
    updateFavoriteName();
  }, [updateFavoriteName]);

  // 監聽收藏系統變更事件
  useEffect(() => {
    const handleFavoritesUpdated = (event: CustomEvent) => {
      const { action, favorite } = event.detail;
      
      // 檢查變更的收藏是否與當前串流匹配
      if (favorite) {
        let isMatch = false;
        if (streamData.platform === 'twitch') {
          isMatch = favorite.platform === 'twitch' && favorite.channelId === streamData.channelId;
        } else if (streamData.platform === 'youtube') {
          isMatch = favorite.platform === 'youtube' && (
            favorite.channelId === streamData.channelId || 
            favorite.videoId === streamData.videoId
          );
        }
        
        // 如果匹配，更新名稱
        if (isMatch) {
          if (action === 'remove') {
            setFavoriteName(null);
          } else {
            updateFavoriteName();
          }
        }
      } else {
        // 如果沒有提供 favorite 詳情，重新檢查所有收藏
        updateFavoriteName();
      }
    };

    window.addEventListener('favoritesUpdated', handleFavoritesUpdated as EventListener);
    
    return () => {
      window.removeEventListener('favoritesUpdated', handleFavoritesUpdated as EventListener);
    };
  }, [streamData.platform, streamData.channelId, streamData.videoId, updateFavoriteName]);

  // 獲取串流標題
  const getStreamTitle = () => {
    // 如果串流在收藏中，優先使用收藏名稱
    if (favoriteName) {
      return favoriteName;
    }
    
    if (streamData.displayName) {
      return streamData.displayName;
    }
    if (streamData.name) {
      return streamData.name;
    }
    if (streamData.platform === 'twitch') {
      return streamData.channelId || `串流 #${streamData.id}`;
    } else {
      // YouTube: 如果不在收藏中，顯示 videoId 或默認標題
      return streamData.videoId || `串流 #${streamData.id}`;
    }
  };
  
  // 處理音量變化
  const handleVolumeChange = (event: Event, newValue: number | number[]) => {
    const volume = typeof newValue === 'number' ? newValue : newValue[0];
    setLocalVolume(volume);
    
    // 更新全局 streamData
    if (window.streamData && window.streamData[streamData.id]) {
      window.streamData[streamData.id].volume = volume;
      window.streamData[streamData.id].isMuted = volume === 0;
    }
    
    // 調用回調函數
    if (onVolumeChange) {
      onVolumeChange(streamData.id, volume);
    }
    
    // 應用音量到播放器
    if (typeof (window as any).applyMasterVolumeToStream === 'function') {
      (window as any).applyMasterVolumeToStream(streamData.id);
    }
    
    // 如果音量為 0，設置為靜音
    if (volume === 0) {
      setIsMuted(true);
    } else if (isMuted) {
      setIsMuted(false);
    }
  };
  
  // 處理靜音切換
  const handleToggleMute = () => {
    const newMutedState = !isMuted;
    setIsMuted(newMutedState);
    
    // 更新全局 streamData
    if (window.streamData && window.streamData[streamData.id]) {
      window.streamData[streamData.id].isMuted = newMutedState;
    }
    
    // 應用靜音狀態到播放器
    if (window.players && window.players[streamData.id] && window.players[streamData.id].player) {
      const player = window.players[streamData.id].player;
      try {
        if (streamData.platform === 'twitch') {
          if (typeof player.setMuted === 'function') {
            player.setMuted(newMutedState);
          }
        } else if (streamData.platform === 'youtube') {
          if (newMutedState) {
            if (typeof player.mute === 'function') {
              player.mute();
            }
          } else {
            if (typeof player.unMute === 'function') {
              player.unMute();
            }
          }
        }
      } catch (e) {
        console.warn(`[StreamBox ${streamData.id}] 切換靜音時發生錯誤:`, e);
      }
    }
  };
  
  // 同步音量狀態
  useEffect(() => {
    if (streamData.volume !== undefined) {
      setLocalVolume(streamData.volume);
    }
    if (streamData.isMuted !== undefined) {
      setIsMuted(streamData.isMuted);
    }
  }, [streamData.volume, streamData.isMuted]);
  
  // 監聽總音量變化，更新顯示（但不改變本地音量值）
  useEffect(() => {
    const updateDisplayVolume = () => {
      const masterVolSlider = document.getElementById('master-volume') as HTMLInputElement;
      const masterVol = masterVolSlider ? parseInt(masterVolSlider.value) : 100;
      const actualVol = Math.round((localVolume / 100) * masterVol);
      
      // 更新顯示的百分比（但保持本地音量值不變）
      // 這裡我們需要一個顯示用的狀態
      const volValueElement = boxRef.current?.querySelector('.vol-value-display');
      if (volValueElement) {
        volValueElement.textContent = `${actualVol}%`;
      }
    };
    
    // 監聽總音量變化事件
    const handleMasterVolumeChange = () => {
      updateDisplayVolume();
    };
    
    window.addEventListener('masterVolumeChanged', handleMasterVolumeChange);
    updateDisplayVolume(); // 初始更新
    
    return () => {
      window.removeEventListener('masterVolumeChanged', handleMasterVolumeChange);
    };
  }, [localVolume]);

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
          {/* 串流順序 */}
          {streamIndex !== undefined && (
            <div className="flex items-center flex-shrink-0">
              <span className={`text-xs font-medium ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                #{streamIndex + 1}
              </span>
            </div>
          )}
          
          {/* 串流標題 */}
          <div className="flex items-center min-w-0 flex-shrink-0">
            <span className={`text-sm font-semibold truncate ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
              {getStreamTitle()}
            </span>
          </div>
          
          {/* 音量條 */}
          <div className="flex items-center gap-2 flex-shrink-0" style={{ width: '120px' }}>
            <MuiButton
              variant="text"
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                handleToggleMute();
              }}
              sx={{
                minWidth: '24px',
                width: '24px',
                height: '24px',
                padding: 0,
                color: isMuted 
                  ? (theme === 'dark' ? '#ef4444' : '#dc2626')
                  : (theme === 'dark' ? '#9ca3af' : '#4b5563'),
                '&:hover': {
                  color: isMuted 
                    ? (theme === 'dark' ? '#f87171' : '#ef4444')
                    : (theme === 'dark' ? '#ffffff' : '#000000'),
                  bgcolor: theme === 'dark' ? '#374151' : '#e5e7eb',
                },
              }}
              title={isMuted ? '取消靜音' : '靜音'}
            >
              {isMuted ? <VolumeX className="size-3" /> : <Volume2 className="size-3" />}
            </MuiButton>
            <Slider
              value={localVolume}
              onChange={handleVolumeChange}
              min={0}
              max={100}
              size="small"
              sx={{
                width: '80px',
                color: theme === 'dark' ? '#9ca3af' : '#4b5563',
                '& .MuiSlider-thumb': {
                  width: 12,
                  height: 12,
                },
                '& .MuiSlider-track': {
                  height: 2,
                },
                '& .MuiSlider-rail': {
                  height: 2,
                },
              }}
              onClick={(e) => e.stopPropagation()}
            />
            <span 
              className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'} vol-value-display`} 
              style={{ minWidth: '32px' }}
            >
              {(() => {
                const masterVolSlider = document.getElementById('master-volume') as HTMLInputElement;
                const masterVol = masterVolSlider ? parseInt(masterVolSlider.value) : 100;
                const actualVol = Math.round((localVolume / 100) * masterVol);
                return `${actualVol}%`;
              })()}
            </span>
          </div>

          {/* 刷新按鈕 */}
          <MuiButton
            variant="text"
            size="small"
            sx={{
              minWidth: '32px',
              width: '32px',
              height: '32px',
              padding: 0,
              color: theme === 'dark' ? '#9ca3af' : '#4b5563',
              '&:hover': {
                color: theme === 'dark' ? '#ffffff' : '#000000',
                bgcolor: theme === 'dark' ? '#374151' : '#e5e7eb',
              },
            }}
            title="重新整理串流"
            onClick={(e) => {
              e.stopPropagation();
              onReload(streamData.id);
            }}
          >
            <RefreshCw className="size-4" />
          </MuiButton>

          {/* 內嵌聊天室顯示/隱藏按鈕 */}
          <MuiButton
            variant="text"
            size="small"
            color="secondary"
            sx={{
              minWidth: '32px',
              width: '32px',
              height: '32px',
              padding: 0,
              color: streamData.chatVisible 
                ? theme === 'dark' ? '#a855f7' : '#9333ea'
                : theme === 'dark' ? '#9ca3af' : '#4b5563',
              bgcolor: streamData.chatVisible 
                ? theme === 'dark' ? 'rgba(147, 51, 234, 0.3)' : 'rgba(147, 51, 234, 0.1)'
                : 'transparent',
              border: streamData.chatVisible ? '1px solid rgba(147, 51, 234, 0.5)' : 'none',
              '&:hover': {
                color: streamData.chatVisible 
                  ? theme === 'dark' ? '#c084fc' : '#7e22ce'
                  : theme === 'dark' ? '#ffffff' : '#000000',
                bgcolor: streamData.chatVisible 
                  ? theme === 'dark' ? 'rgba(147, 51, 234, 0.4)' : 'rgba(147, 51, 234, 0.15)'
                  : theme === 'dark' ? '#374151' : '#e5e7eb',
              },
            }}
            title={streamData.chatVisible ? '隱藏聊天室' : '顯示聊天室'}
            onClick={(e) => {
              e.stopPropagation();
              handleToggleChat();
            }}
          >
            <MessageSquare className="size-4" />
          </MuiButton>

          {/* 關閉串流按鈕 */}
          <MuiButton
            variant="text"
            size="small"
            color="error"
            sx={{
              minWidth: '32px',
              width: '32px',
              height: '32px',
              padding: 0,
              color: theme === 'dark' ? '#9ca3af' : '#4b5563',
              '&:hover': {
                color: theme === 'dark' ? '#f87171' : '#dc2626',
                bgcolor: theme === 'dark' ? 'rgba(220, 38, 38, 0.2)' : 'rgba(220, 38, 38, 0.1)',
              },
            }}
            title="關閉串流"
            onClick={(e) => {
              e.stopPropagation();
              onRemove(streamData.id);
            }}
          >
            <X className="size-4" />
          </MuiButton>
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
            width: playerWidth,
            height: '100%',
            flexShrink: 0,
            position: 'relative',
            transition: 'width 0.3s ease'
          }}
        />
        <div
          ref={chatContainerRef}
          className={`chat-container ${streamData.chatVisible ? '' : 'hidden'}`}
          id={`chat${streamData.id}`}
          style={{
            width: streamData.chatVisible ? `${chatWidth}px` : '0px',
            minWidth: streamData.chatVisible ? (streamData.platform === 'twitch' ? '300px' : '200px') : '0px',
            height: '100%',
            flexShrink: 0,
            position: 'relative',
            overflow: 'hidden',
            transition: 'width 0.3s ease, min-width 0.3s ease'
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

