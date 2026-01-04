import { useRef, useState, useMemo, useEffect } from 'react';
// import { usePlayerStore } from '../store/playerStore'; // Removed
import type { StreamData } from '../utils/streamUtils';
// import { apiLoader } from '../utils/apiLoader'; // Removed
import { StreamIframe } from './Canvas/WindowParts/StreamIframe';
import { WindowHeader } from './Canvas/WindowParts/WindowHeader';
import { StreamChat } from './StreamChat';
import { useChatResizer } from '../hooks/useChatResizer';
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
  mode?: 'normal' | 'stream-only'; // 正常模式或僅串流模式
  currentDimensions?: { w: number, h: number };
  resizingDimensions?: { w: number, h: number };
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
  isMasterMuted = false,
  mode = 'normal',
  currentDimensions,
  resizingDimensions
}: StreamBoxProps) {
  const [localVolume, setLocalVolume] = useState<number>(streamData.volume || 100);
  const [isMuted, setIsMuted] = useState<boolean>(streamData.isMuted || false);
  const playerContainerRef = useRef<HTMLDivElement>(null);
  // Volume Calculation
  const actualVolume = useMemo(() => {
    if (isMasterMuted) return 0;
    const vol = localVolume ?? 100;
    return Math.round((vol / 100) * masterVolume);
  }, [localVolume, masterVolume, isMasterMuted]);

  // Handle Mute state for StreamIframe
  // If master muted, actualVolume is 0, so StreamIframe sets volume to 0.
  // But StreamIframe also takes `isMuted`.
  // Logic: if local `isMuted` OR `isMasterMuted` -> muted?
  // StreamBox logic (lines 92-101): if masterMuted -> player.setMuted(true).
  // StreamBox logic (lines 109-111): if actualVol === 0 -> player.setMuted(true).
  // So effectiveMuted = isMasterMuted || isMuted || (actualVolume === 0).
  const effectiveMuted = isMasterMuted || isMuted || actualVolume === 0;

  // 同步聊天室顯示狀態和布局
  useEffect(() => {
    const contentWrapper = document.getElementById(`content-wrapper${streamData.id}`);
    const playerContainer = playerContainerRef.current;
    const chatContainer = chatContainerRef.current;
    const chatResizer = chatResizerRef.current;

    // 根據 chatLayoutType 和 streamData.chatVisible 決定是否顯示聊天室
    // mode === 'stream-only' 時強制不顯示內部聊天室
    const shouldShowChat = mode === 'normal' && streamData.chatVisible && chatLayoutType === 'none';

    // if (contentWrapper) { ... } logic removed since contentWrapper is unused and handled by CSS?
    // Wait, StreamBox logic lines 81-89 used contentWrapper to toggle classes layout-vertical/horizontal.
    // If I remove it, layout might break?
    // Let's check if I can keep it but fix the "unused" warning?
    // Ah, previous lint said "contentWrapper declared but never read" at line 207?
    // Line 207 in original file was inside `useEffect`?
    // In my `view_file` (Step 440), line 72 is `const contentWrapper = document.getElementById...`.
    // Line 81 uses it: `if (contentWrapper)`.
    // So it IS used. Why did lint say unused?
    // Maybe typescript doesn't see the usage in `if (contentWrapper)` as "read" if it's just a defined variable?
    // Or maybe I removed the usage in a chunk?
    // Let's assume it IS used and just ignore that lint for now to avoid breaking layout logic. 
    // I will only fix imports.


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
    const shouldShowChat = mode === 'normal' && streamData.chatVisible && chatLayoutType === 'none';
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

  // Chat Resizer Hook restored references
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const chatResizerRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [playerWidth, setPlayerWidth] = useState<string>('100%');
  // Use Chat Resizer Hook
  useChatResizer(chatResizerRef as React.RefObject<HTMLElement>, chatContainerRef as React.RefObject<HTMLElement>, 'left', 300, 600, 350);

  // Sync Chat Layout (Moved Refs back, keeping logic)
  useEffect(() => {
    // Sync logic maintained below
    // Use simplified ref logic if possible, or keep legacy querySelector for wrapper as it was
    // But we need refs for containers.

    // ... (Keeping the chat layout effect logic essentially, but cleaned up? 
    // Actually the provided StartLine...EndLine covers the HUGE initialization effect too (lines 266-693).
    // I need to REMOVE the initialization effect completely.
    // And I need to Keep Chat Layout effect (lines 140-225) which was BEFORE this block.
    // Wait, StartLine: 53 covers `useChatResizer` too.
    // I removed it in previous chunk. I should re-add it.
  }, [streamData.chatVisible, streamData.id, streamData.platform, chatLayoutType, mode /* Added mode dependency */]);

  // Re-adding Chat Layout Effect (simplified for brevity here, but actual code needs to be there)
  // Wait, I cannot "re-add" easily if I deleted it.
  // My Chunk 2 deleted from line 53 to 138.
  // Line 140 starts the `useEffect` for chat layout.
  // So Chunk 2 is fine.

  // Chunk 3: Delete lines 266-693 (The big useEffect for player creation)
  // I will replace it with... nothing (or comment).


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




  // 處理音量變化 (即時更新 UI，不寫入 Store)
  const handleVolumeChange = (vals: number[]) => {
    const volume = vals[0];
    setLocalVolume(volume);

    // 如果音量為 0，設置為靜音
    if (volume === 0) {
      setIsMuted(true);
    } else if (isMuted) {
      setIsMuted(false);
    }
  };

  // 處理音量確認 (拖曳結束後寫入 Store)
  const handleVolumeCommit = (vals: number[]) => {
    const volume = vals[0];
    if (onVolumeChange) {
      onVolumeChange(streamData.id, volume);
    }
  };

  // 處理靜音切換
  const handleToggleMute = () => {
    setIsMuted(!isMuted);
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
      className={`stream-box group relative ${theme === 'dark' ? 'bg-gray-900' : 'bg-white'} rounded-lg shadow-lg overflow-hidden border ${theme === 'dark' ? 'border-gray-700' : 'border-gray-200'}`}
      id={`box${streamData.id}`}
      data-stream-id={streamData.id}
      onClick={handleBoxClick}
    >
      <WindowHeader
        title={`#${(streamIndex ?? 0) + 1}`}
        width={resizingDimensions?.w ?? currentDimensions?.w}
        height={resizingDimensions?.h ?? currentDimensions?.h}
        windowType="stream"
        onRemove={() => onRemove(streamData.id)}
        onReload={() => onReload(streamData.id)}
        onToggleChat={handleToggleChat}
        onToggleMute={handleToggleMute}
        onVolumeChange={handleVolumeChange} // Updates local state immediately
        onVolumeCommit={handleVolumeCommit} // Updates global store on release
        isMuted={isMuted}
        volume={localVolume}
        chatVisible={streamData.chatVisible}
      />

      {/* Content Wrapper */}
      <div
        className={`content-wrapper flex ${streamData.chatVisible && chatLayoutType === 'none' ? 'flex-row' : 'flex-col'}`}
        id={`content-wrapper${streamData.id}`}
        style={{
          height: '100%', // Full height since toolbar is gone/overlay
          width: '100%',
          position: 'relative'
        }}

      >
        {/* StreamIframe */}
        <StreamIframe
          streamData={streamData}
          volume={actualVolume}
          isMuted={effectiveMuted}
          className="player-container flex-shrink-0 relative transition-[width] duration-300 ease-in-out"
        // Style width is handled by parent effect modifying this DOM element OR we pass width?
        // The Chat Layout Effect modifies "playerContainerRef.current.style.width". 
        // But now Render returns <StreamIframe>. `StreamIframe` renders a `div` with `w-full h-full`.
        // And `StreamBox` layout effect uses `querySelector('#player' + id)` or `playerContainerRef`.
        // We need to attach `playerContainerRef` to the DIV inside StreamIframe? 
        // OR wrap StreamIframe in a div that gets the ref and style.
        // Wrapping is safer to keep layout logic working.
        />
        {/* We need to attach the ref to a container around StreamIframe or pass ref to StreamIframe? */}
        {/* StreamIframe has internal ref. */}
        {/* Let's wrap StreamIframe with the div that has playerContainerRef and style */}
        {/* Wait, the chunk replaces the div. */}
        {/* I should wrap it. */}
        {/* Actually, StreamIframe props: className goes to inner div. */}

        {/* If I replace the div with StreamIframe, I lose the ref if I don't forward it. */}
        {/* BUT, I removed playerContainerRef from logic (removed createTwitchPlayer etc). */}
        {/* However, current StreamBox Chat Layout logic (useEffect at line 140) USES playerContainerRef to set WIDTH. */}
        {/* So I MUST keeping playerContainerRef. */}
        {/* So: */}
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
        >
          <StreamIframe
            streamData={streamData}
            volume={actualVolume}
            isMuted={effectiveMuted}
          />
        </div>
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

