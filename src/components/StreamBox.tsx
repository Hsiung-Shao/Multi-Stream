import { useEffect, useRef, useState, useCallback } from 'react';
import { usePlayerStore } from '../store/playerStore';
import type { StreamData } from '../utils/streamUtils';
import { apiLoader } from '../utils/apiLoader';
// import { TwitchPlayer } from './TwitchPlayer'; 
import { StreamChat } from './StreamChat';
import { useChatResizer } from '../hooks/useChatResizer';
import { Button } from './ui/button';
import { Slider } from './ui/slider';
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
  masterVolume?: number; // 主音量 (0-100)
  isMasterMuted?: boolean; // 主靜音狀態
}

// 全局變數聲明（這些應該在 window 對象上）
declare global {
  interface Window {
    Twitch?: any;
    YT?: any;
  }
}

export function StreamBox({
  streamData,
  theme,
  layoutStyle,
  onRemove,
  onReload,
  onToggleChat,
  //   onSeparateChat, // Unused
  onVolumeChange,
  streamIndex,
  chatLayoutType = 'none',
  masterVolume = 100,
  isMasterMuted = false
}: StreamBoxProps) {
  const registerPlayer = usePlayerStore(s => s.registerPlayer);
  const unregisterPlayer = usePlayerStore(s => s.unregisterPlayer);
  const playerContainerRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const chatResizerRef = useRef<HTMLDivElement>(null);

  // Use Chat Resizer Hook
  useChatResizer(chatResizerRef as React.RefObject<HTMLElement>, chatContainerRef as React.RefObject<HTMLElement>, 'left', 300, 600, 350);

  const boxRef = useRef<HTMLDivElement>(null);
  const playerCreatingRef = useRef<boolean>(false);
  const playerRetryCountRef = useRef<number>(0);
  const playerInitializedRef = useRef<boolean>(false);

  // 計算聊天室寬度狀態（用於 JSX 中的樣式）
  // const [chatWidth, setChatWidth] = useState<number>(0); // Unused, controlled by DOM/CSS
  const [playerWidth, setPlayerWidth] = useState<string>('100%');

  // 音量狀態
  const [localVolume, setLocalVolume] = useState<number>(streamData.volume || 100);
  const [isMuted, setIsMuted] = useState<boolean>(streamData.isMuted || false);

  // const [favoriteName, setFavoriteName] = useState<string | null>(null); // Unused


  // Ref to hold latest props for async callbacks (avoid stale closures)
  const propsRef = useRef({ streamData, masterVolume, isMasterMuted });
  useEffect(() => {
    propsRef.current = { streamData, masterVolume, isMasterMuted };
  }, [streamData, masterVolume, isMasterMuted]);

  // 應用音量設定到播放器
  const applyVolumeToPlayer = useCallback((player: any) => {
    if (!player) return;

    // Read from Ref to ensure fresh values even if called from stale closures
    const { streamData: currentStreamData, masterVolume: currentMasterVolume, isMasterMuted: currentIsMasterMuted } = propsRef.current;

    // 如果全部靜音，直接靜音播放器
    if (currentIsMasterMuted) {
      try {
        if (currentStreamData.platform === 'twitch') {
          if (typeof player.setMuted === 'function') player.setMuted(true);
        } else if (currentStreamData.platform === 'youtube') {
          if (typeof player.mute === 'function') player.mute();
        }
      } catch (e) { /* ignore */ }
      return;
    }

    // 如果沒有全部靜音，應用正常的音量設定
    const streamVol = currentStreamData.volume || 100;
    const actualVol = Math.round((streamVol / 100) * currentMasterVolume);

    try {
      if (currentStreamData.platform === 'twitch') {
        if (actualVol === 0) {
          if (typeof player.setMuted === 'function') player.setMuted(true);
          else if (typeof player.setVolume === 'function') player.setVolume(0);
        } else {
          if (typeof player.setMuted === 'function') player.setMuted(false);
          if (typeof player.setVolume === 'function') player.setVolume(actualVol / 100);
        }
      } else if (currentStreamData.platform === 'youtube') {
        if (actualVol === 0) {
          if (typeof player.mute === 'function') player.mute();
          else if (typeof player.setVolume === 'function') player.setVolume(0);
        } else {
          if (typeof player.unMute === 'function') player.unMute();
          if (typeof player.setVolume === 'function') player.setVolume(actualVol);
        }
      }
    } catch (e) {
      console.warn('[StreamBox] Error applying volume:', e);
    }
  }, []);

  // 監聽 master 變化，重新應用音量
  useEffect(() => {
    // 當主音量或主靜音狀態改變時，更新當前播放器音量
    const playerEntry = usePlayerStore.getState().getPlayer(streamData.id);
    if (playerEntry && playerEntry.player) {
      applyVolumeToPlayer(playerEntry.player);
    }
  }, [masterVolume, isMasterMuted, streamData.id, streamData.volume, applyVolumeToPlayer]);

  // 同步聊天室顯示狀態和布局
  useEffect(() => {
    const contentWrapper = document.getElementById(`content-wrapper${streamData.id}`);
    const playerContainer = playerContainerRef.current;
    const chatContainer = chatContainerRef.current;
    const chatResizer = chatResizerRef.current;

    // 根據 chatLayoutType 和 streamData.chatVisible 決定是否顯示聊天室
    // 如果全屏聊天室佈局啟用（非 none），則 StreamBox 內的聊天室應該隱藏
    const shouldShowChat = streamData.chatVisible && chatLayoutType === 'none';

    if (contentWrapper) {
      if (shouldShowChat) {
        contentWrapper.classList.remove('layout-vertical');
        contentWrapper.classList.add('layout-horizontal');
      } else {
        contentWrapper.classList.remove('layout-horizontal');
        contentWrapper.classList.add('layout-vertical');
      }
    }

    if (playerContainer && chatContainer) {
      const minChatWidth = 300;


      if (shouldShowChat) {
        const containerWidth = chatContainer.parentElement?.clientWidth || 0;
        const chatWidthPercent = 20;
        const chatWidthPx = (containerWidth * chatWidthPercent) / 100;
        const finalChatWidth = Math.max(chatWidthPx, minChatWidth);

        chatContainer.style.width = `${finalChatWidth}px`;
        chatContainer.style.minWidth = `${minChatWidth}px`;
        chatContainer.style.height = '100%';
        chatContainer.style.display = 'flex'; // Use flex for chat container
        chatContainer.classList.remove('hidden');

        playerContainer.style.width = `calc(100% - ${finalChatWidth}px)`;
        playerContainer.style.height = '100%';
        playerContainer.style.transition = 'width 0.3s ease';

        // setChatWidth(finalChatWidth);
        setPlayerWidth(`calc(100% - ${finalChatWidth}px)`);
      } else {
        chatContainer.style.width = '0px';
        chatContainer.style.minWidth = '0px';
        chatContainer.style.height = '100%';
        chatContainer.style.display = 'none';
        chatContainer.classList.add('hidden');

        playerContainer.style.width = '100%';
        playerContainer.style.height = '100%';
        playerContainer.style.transition = 'width 0.3s ease';

        // setChatWidth(0);
        setPlayerWidth('100%');
      }
    } else if (playerContainer) {
      const newWidth = shouldShowChat ? '80%' : '100%';
      playerContainer.style.width = newWidth;
      playerContainer.style.height = '100%';
      playerContainer.style.transition = 'width 0.3s ease';
    }

    if (chatContainer) {
      if (!chatContainer.id || chatContainer.id !== `chat${streamData.id}`) {
        chatContainer.id = `chat${streamData.id}`;
      }

      if (shouldShowChat) {
        const iframe = chatContainer.querySelector('iframe');
        if (!iframe) {
          // Legacy createChat removed
          // StreamChat handles rendering
        }
      } else {
        chatContainer.style.width = '0%';
        chatContainer.style.height = '100%';
        chatContainer.style.display = 'none';
        chatContainer.classList.add('hidden');
      }
    }

    if (chatResizer) {
      chatResizer.style.display = shouldShowChat ? 'block' : 'none';
    }
  }, [streamData.chatVisible, streamData.id, streamData.platform, chatLayoutType]);

  // 監聽窗口大小變化，重新計算聊天室寬度
  useEffect(() => {
    const shouldShowChat = streamData.chatVisible && chatLayoutType === 'none';
    if (!shouldShowChat) return;

    const handleResize = () => {
      const playerContainer = playerContainerRef.current;
      const chatContainer = chatContainerRef.current;
      if (!playerContainer || !chatContainer) return;

      const minChatWidth = 300; // Both Twitch and YouTube need space

      const containerElement = chatContainer.parentElement || boxRef.current;
      const containerWidth = containerElement?.clientWidth || 0;

      if (containerWidth > 0) {
        const chatWidthPercent = 20;
        const chatWidthPx = (containerWidth * chatWidthPercent) / 100;
        const finalChatWidth = Math.max(chatWidthPx, minChatWidth);

        chatContainer.style.width = `${finalChatWidth}px`;
        chatContainer.style.minWidth = `${minChatWidth}px`;
        playerContainer.style.width = `calc(100% - ${finalChatWidth}px)`;

        // setChatWidth(finalChatWidth);
        setPlayerWidth(`calc(100% - ${finalChatWidth}px)`);
      }
    };

    window.addEventListener('resize', handleResize);
    handleResize();

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [streamData.chatVisible, streamData.platform, streamData.id, chatLayoutType]);

  // 初始化播放器

  useEffect(() => {
    if (!playerContainerRef.current) return;

    // 檢查是否有重載觸發器 (Uses Store _reloadKey now)
    // Note: We used to check window.streamData._reloadTrigger here.
    // Now we rely on React key/prop changes from StreamContainer.
    let shouldForceReload = false;

    // Legacy logic removed. React key prop from parent should handle re-creation.



    // 如果播放器已經初始化且關鍵屬性沒有變化，且沒有強制重載標記，跳過重新創建
    if (playerInitializedRef.current && !shouldForceReload) {
      const existingPlayer = usePlayerStore.getState().getPlayer(streamData.id);
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
                return;
              }
            }
          } catch (e) {
            // 如果無法獲取播放器狀態，可能需要重新創建
          }
        } else if (existingPlayer.type === 'twitch' && currentChannelId) {
          // Twitch 播放器通常不需要重新創建，除非明確需要
          // 檢查播放器是否仍然有效
          try {
            if (existingPlayer.player && typeof existingPlayer.player.getChannel === 'function') {
              const playerChannel = existingPlayer.player.getChannel();
              if (playerChannel === currentChannelId) {
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
          return;
        }

        // 確保容器已清空（重載時）
        if (shouldForceReload && playerContainerRef.current.innerHTML) {
          playerContainerRef.current.innerHTML = '';
        }

        // 雙重檢查 API 是否就緒
        if (!window.Twitch || !window.Twitch.Player) {
          try {
            await apiLoader.loadTwitchPlayerApi();
          } catch (e) {
            console.error('[StreamBox] Failed to load Twitch API:', e);
            return;
          }
        }

        if (!playerContainerRef.current) return;

        // 確保容器可見
        if (playerContainerRef.current.offsetWidth === 0) {
          console.warn('[StreamBox] Player container has 0 width, player might not render correctly.');
          // 強制給一個寬度嘗試修復
          playerContainerRef.current.style.width = '100%';
        }

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
        // 優化：添加創建前檢查，若未就緒則嘗試載入
        if (!window.Twitch || !window.Twitch.Player) {
          try {
            console.log('[StreamBox] Twitch API not ready, loading...');
            await apiLoader.loadTwitchPlayerApi();
          } catch (e) {
            throw new Error('Twitch Player API 載入失敗');
          }
        }

        console.log(`[StreamBox] Creating Twitch player for ${streamData.channelId}`);
        // Legacy window.players writes removed
        const player = new window.Twitch.Player(`player${streamData.id}`, options);

        try {
          registerPlayer(streamData.id, {
            type: 'twitch',
            player: player
          });
        } catch (e) {
          console.warn('[StreamBox] Failed to register Twitch player to store:', e);
        }

        // 標記播放器已初始化
        playerInitializedRef.current = true;
        playerCreatingRef.current = false;

        // 優化：使用 Promise 包裝事件監聽，避免長時間等待
        const readyPromise = new Promise<void>((resolve) => {
          const readyHandler = () => {
            player.removeEventListener(window.Twitch.Player.READY, readyHandler);
            // 播放器已就緒，應用音量設定
            applyVolumeToPlayer(player);
            resolve();
          };

          player.addEventListener(window.Twitch.Player.READY, readyHandler);

          // 設置超時，避免無限等待
          setTimeout(() => {
            if (playerInitializedRef.current) {
              applyVolumeToPlayer(player);
              resolve();
            }
          }, 5000);
        });

        await readyPromise;

        player.addEventListener(window.Twitch.Player.ERROR, () => {
          alert('無法載入 Twitch 直播，請確認：\n1. 頻道名稱正確\n2. 頻道正在直播\n3. 網路連線正常');
        });
      } catch (error) {
        playerCreatingRef.current = false;
        alert('無法載入 Twitch API。請重新整理頁面或檢查網路連線。');
      }
    };

    const createYouTubePlayer = async () => {
      // 防止重複創建（除非是強制重載）
      if (playerCreatingRef.current && !shouldForceReload) {
        return;
      }

      try {
        // 檢查並清理舊的播放器 (Use Store)
        const oldPlayer = usePlayerStore.getState().getPlayer(streamData.id);
        if (oldPlayer) {
          if (oldPlayer.type === 'youtube' && oldPlayer.player && typeof oldPlayer.player.destroy === 'function') {
            try {
              oldPlayer.player.destroy();
            } catch (e) {
              // 清理舊播放器時發生錯誤，繼續處理
            }
          }
          // Note: unregister is handled by store logic or overwrite
        }

        // 清空容器內容
        if (playerContainerRef.current) {
          playerContainerRef.current.innerHTML = '';
        }

        // 確保容器已經準備好（有尺寸）
        if (!playerContainerRef.current) {
          return;
        }

        // 雙重檢查 YouTube API
        if (typeof window.YT === 'undefined' || !window.YT.Player) {
          try {
            await apiLoader.loadYouTubePlayerApi();
          } catch (e) {
            console.error('[StreamBox] Failed to load YouTube API:', e);
            return;
          }
        }

        // 再次確保容器存在
        if (!playerContainerRef.current) return;

        // 檢查容器是否有尺寸
        const container = playerContainerRef.current;

        // 如果容器寬度為0，嘗試強制修正
        if (container.offsetWidth === 0) {
          console.warn('[StreamBox] YouTube container width is 0, forcing 100%');
          container.style.width = '100%';
        }

        const hasSize = container.offsetWidth > 0 && container.offsetHeight > 0;

        if (!hasSize) {
          // 如果容器還沒有尺寸，等待一下再創建（最多重試 10 次）
          if (playerRetryCountRef.current < 10) {
            playerRetryCountRef.current++;
            setTimeout(() => {
              createYouTubePlayer();
            }, 100);
            return;
          } else {
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
            playerCreatingRef.current = false;
            setTimeout(() => {
              createYouTubePlayer();
            }, 100);
            return;
          } else {
            // 即使沒有尺寸也繼續創建
          }
        }

        // 重置重試計數
        playerRetryCountRef.current = 0;

        console.log(`[StreamBox] Creating YouTube player for ${streamData.videoId}`);
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
                    }
                  } catch (error) {
                    // 檢測直播狀態時發生錯誤，繼續處理
                  }
                }, 1000); // 延遲 1 秒確保播放器完全就緒
              } catch (error) {
                // 初始化直播檢測時發生錯誤，繼續處理
              }

              // 播放器已就緒，應用音量設定
              // 播放器已就緒，應用音量設定
              applyVolumeToPlayer(player);
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
              switch (event.data) {
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

        // Legacy window.players writes removed

        try {
          registerPlayer(streamData.id, {
            type: 'youtube',
            player: player
          });
        } catch (e) {
          console.warn('[StreamBox] Failed to register YouTube player to store:', e);
        }

        // 標記播放器已初始化
        playerInitializedRef.current = true;
        playerCreatingRef.current = false;
      } catch (error) {
        // 清除創建標誌
        playerCreatingRef.current = false;
        alert('無法載入 YouTube API。請重新整理頁面或檢查網路連線。');
      }
    };

    // 建立播放器（參考 js/stream.js 第 531-549 行）
    // 如果檢測到重載觸發器，強制重新創建播放器
    if (streamData.platform === 'twitch') {
      createTwitchPlayer().catch(() => {
        // 創建 Twitch 播放器失敗，繼續處理
      });
    } else if (streamData.platform === 'youtube') {
      createYouTubePlayer().catch(() => {
        // 創建 YouTube 播放器失敗，繼續處理
      });
    }

    // 建立聊天室 - 參考正式環境：立即生成，不延遲
    // 使用 requestAnimationFrame 確保 DOM 已準備好，但比 setTimeout 更快
    // 移除舊的 createChat 邏輯
    // 聊天室現在由 StreamChat 組件直接渲染


    // 移除拖拽功能 - StreamBox 不應該可拖曳
    // 不再設置 makeDraggableResizable

    // 清理函數
    return () => {
      // 清除創建標誌和重試計數
      playerCreatingRef.current = false;
      playerRetryCountRef.current = 0;
      playerInitializedRef.current = false;

      // 清理播放器 (Store Only)
      unregisterPlayer(streamData.id);

      // 清空容器內容
      if (playerContainerRef.current) {
        playerContainerRef.current.innerHTML = '';
      }
    };
  }, [streamData.id, streamData.platform, streamData.channelId, streamData.videoId, (streamData as any)._reloadKey]);

  // 參考正式環境：當聊天室布局啟用時，確保聊天室已生成
  // 注意：聊天室在串流初始化時已經立即生成，這裡只是確保它存在
  // 參考正式環境：當聊天室布局啟用時，確保聊天室已生成
  // 注意：不再需要 legacy createChat，StreamChat 組件已經在 DOM 中
  /* useEffect(() => {
    if (chatLayoutType !== 'none') {
        // ... legacy logic removed
    }
  }, [chatLayoutType, streamData.id]); */



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
  // 從收藏中獲取名稱的函數
  // 直接調用 favoritesService
  // if (window.favoriteStreams) check removed




  // 處理音量變化
  const handleVolumeChange = (vals: number[]) => {
    const volume = vals[0];
    setLocalVolume(volume);

    // 更新全局 streamData (已移除，改為 Store 更新)
    // Store update logic is handled via props or local state if decoupled.
    // Actually onVolumeChange prop calls updateStream in parent.

    // 調用回調函數
    if (onVolumeChange) {
      onVolumeChange(streamData.id, volume);
    }

    // 應用音量到播放器
    const playerEntry = usePlayerStore.getState().getPlayer(streamData.id);
    if (playerEntry && playerEntry.player) {
      applyVolumeToPlayer(playerEntry.player);
    }
    // Remove legacy window call
    // if (typeof (window as any).applyMasterVolumeToStream === 'function') ...

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

    // 更新全局 streamData (已移除)

    // 應用靜音狀態到播放器 (Use Store)
    const playerState = usePlayerStore.getState().getPlayer(streamData.id);
    if (playerState && playerState.player) {
      const player = playerState.player;
      try {
        if (streamData.platform === 'twitch') {
          if (typeof player.setMuted === 'function') {
            player.setMuted(newMutedState);
          }
        } else if (streamData.platform === 'youtube') {
          if (newMutedState) {
            if (typeof player.mute === 'function') player.mute();
          } else {
            if (typeof player.unMute === 'function') player.unMute();
          }
        }
      } catch (e) {
        // 切換靜音時發生錯誤，繼續處理
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
  // Legacy masterVolumeChanged listener removed - StreamBox receives volume via props
  // useEffect(() => { ... }, [localVolume]);

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
        className={`controls flex items-center gap-2 px-2 h-6 min-h-[24px] ${theme === 'dark' ? 'bg-gray-800/95 border-b border-gray-700' : 'bg-gray-50/95 border-b border-gray-200'} backdrop-blur-sm`}
      >
        {/* 左側工具組 */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {/* 串流順序 */}
          {streamIndex !== undefined && (
            <div className="flex items-center flex-shrink-0">
              <span className={`text-[10px] font-medium leading-none ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                #{streamIndex + 1}
              </span>
            </div>
          )}

          {/* 移除串流標題，只保留功能按鈕 */}

          {/* 音量條 */}
          <div className="flex items-center gap-1 flex-shrink-0" style={{ width: '120px' }}>
            <Button
              variant="ghost"
              size="icon"
              onClick={(e: React.MouseEvent) => {
                e.stopPropagation();
                handleToggleMute();
              }}
              className={`h-4 w-4 p-0 min-w-[16px] ${isMuted
                ? (theme === 'dark' ? 'text-red-500 hover:bg-gray-700 hover:text-red-400' : 'text-red-600 hover:bg-gray-200 hover:text-red-500')
                : (theme === 'dark' ? 'text-gray-400 hover:bg-gray-700 hover:text-white' : 'text-gray-600 hover:bg-gray-200 hover:text-black')
                }`}
              title={isMuted ? '取消靜音' : '靜音'}
            >
              {isMuted ? <VolumeX className="size-3" /> : <Volume2 className="size-3" />}
            </Button>
            <div className="w-[85px]" onClick={(e) => e.stopPropagation()}>
              <Slider
                value={[localVolume]}
                onValueChange={handleVolumeChange}
                min={0}
                max={100}
                step={1}
                className={theme === 'dark' ? '' : ''}
              />
            </div>
            <span
              className={`text-[9px] leading-none ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'} vol-value-display`}
              style={{ minWidth: '20px' }}
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
          <Button
            variant="ghost"
            size="icon"
            className={`h-4 w-4 p-0 ${theme === 'dark' ? 'text-gray-400 hover:bg-gray-700 hover:text-white' : 'text-gray-600 hover:bg-gray-200 hover:text-black'}`}
            title="重新整理串流"
            onClick={(e: React.MouseEvent) => {
              e.stopPropagation();
              onReload(streamData.id);
            }}
          >
            <RefreshCw className="size-3" />
          </Button>

          {/* 內嵌聊天室顯示/隱藏按鈕 */}
          <Button
            variant="ghost"
            size="icon"
            className={`h-4 w-4 p-0 ${streamData.chatVisible && chatLayoutType === 'none'
              ? (theme === 'dark' ? 'text-purple-400 bg-purple-500/30 hover:bg-purple-500/40 hover:text-purple-300' : 'text-purple-600 bg-purple-500/10 hover:bg-purple-500/15 hover:text-purple-700')
              : (theme === 'dark' ? 'text-gray-400 hover:bg-gray-700 hover:text-white' : 'text-gray-600 hover:bg-gray-200 hover:text-black')
              } ${streamData.chatVisible && chatLayoutType === 'none' ? 'border border-purple-500/50' : ''}`}
            title={streamData.chatVisible && chatLayoutType === 'none' ? '隱藏聊天室' : '顯示聊天室'}
            onClick={(e: React.MouseEvent) => {
              e.stopPropagation();
              handleToggleChat();
            }}
          >
            <MessageSquare className="size-3" />
          </Button>

          {/* 關閉串流按鈕 */}
          <Button
            variant="ghost"
            size="icon"
            className={`h-4 w-4 p-0 ${theme === 'dark' ? 'text-gray-400 hover:bg-red-900/20 hover:text-red-400' : 'text-gray-600 hover:bg-red-100 hover:text-red-600'}`}
            title="關閉串流"
            onClick={(e: React.MouseEvent) => {
              e.stopPropagation();
              onRemove(streamData.id);
            }}
          >
            <X className="size-3" />
          </Button>
        </div>
      </div>

      {/* Content Wrapper */}
      <div
        className={`content-wrapper flex ${streamData.chatVisible && chatLayoutType === 'none' ? 'flex-row' : 'flex-col'}`}
        id={`content-wrapper${streamData.id}`}
        style={{
          height: 'calc(100% - 24px)', // 減去工具列高度 (24px)
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
        {/* Chat Container */}
        <div
          ref={chatContainerRef}
          id={`chat${streamData.id}`}
          className={`stream-chat absolute top-0 right-0 h-full bg-black border-l border-gray-700 z-10 flex flex-col ${streamData.chatVisible && chatLayoutType === 'none' ? '' : 'hidden'
            }`}
          style={{ width: '0px' }} // Initial width, managed by resize logic
        >
          <StreamChat
            platform={streamData.platform}
            channelId={streamData.channelId}
            videoId={streamData.videoId}
            theme={theme}
          />
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

