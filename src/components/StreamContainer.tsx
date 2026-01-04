import { useEffect, useState } from 'react';
import { StreamBox } from './StreamBox';
import { ChatSidebar } from './ChatSidebar';
import { calculateLayoutStyles } from '../utils/layoutUtils';
import { getChatLayoutConfig } from '../utils/chatLayoutUtils';
import { useStreamStore } from '../store/useStreamStore';
import { useUIStore } from '../store/useUIStore';

interface StreamContainerProps {
  masterVolume?: number;
  isMasterMuted?: boolean;
}

export function StreamContainer({
  masterVolume = 100,
  isMasterMuted = false
}: StreamContainerProps) {
  const streams = useStreamStore(s => s.streams);
  const layoutType = useStreamStore(s => s.layout);
  const chatLayoutType = useStreamStore(s => s.chatLayout);


  // Separate Chat is usually window functionality or special logic
  // For now we can keep accessing window methods inside StreamBox or re-implement here if specific handler needed.
  // Actually StreamBox probably calls window.separateChat directly or via props.
  // Let's pass simple handlers that call stores or window.

  const theme = useUIStore(s => s.theme);

  // Actions
  const removeStream = useStreamStore(s => s.removeStream);
  const updateStream = useStreamStore(s => s.updateStream);

  const chatConfig = getChatLayoutConfig(chatLayoutType);
  const videoAreaWidth = chatLayoutType !== 'none' ? chatConfig.videoAreaWidth : 100;



  // 觸發窗口 resize 事件
  useEffect(() => {
    if (streams.length === 0) return;
    const timeoutId = setTimeout(() => {
      requestAnimationFrame(() => {
        window.dispatchEvent(new Event('resize'));
      });
    }, 100);
    return () => clearTimeout(timeoutId);
  }, [streams, layoutType]);

  // 獲取 Navbar 高度
  const [navbarHeight, setNavbarHeight] = useState(64);
  useEffect(() => {
    const updateNavbarHeight = () => {
      const navbar = document.querySelector('nav');
      if (navbar) setNavbarHeight(navbar.getBoundingClientRect().height);
    };
    updateNavbarHeight();
    window.addEventListener('resize', updateNavbarHeight);
    return () => window.removeEventListener('resize', updateNavbarHeight);
  }, []);

  // 聊天室隱藏邏輯 (Legacy Chat System Integration)
  // Legacy Chat System Integration Removed - Managed by StreamBox and ChatSidebar components internally


  // 計算容器高度
  const calculateContainerHeight = (): string => {
    const baseHeight = `calc(100vh - ${navbarHeight}px)`;
    return baseHeight;
  };

  const containerHeight = calculateContainerHeight();

  // Handlers for StreamBox interaction
  const handleRemove = (id: number) => removeStream(id);
  const handleReload = (id: number) => {
    // Force reload by updating _reloadKey
    updateStream(id, { _reloadKey: Date.now() });
  };
  const handleToggleChat = (id: number) => {
    const s = streams.find(s => s.id === id);
    if (s) updateStream(id, { chatVisible: !s.chatVisible });
  };
  const handleSeparateChat = (id: number) => {
    if ((window as any).separateChat) (window as any).separateChat(id);
  };
  const handleVolumeChange = (id: number, vol: number) => updateStream(id, { volume: vol });

  return (
    <>
      <div
        id="container"
        className="stream-container"
        style={{
          position: 'absolute',
          width: `${videoAreaWidth}%`,
          height: containerHeight,
          minHeight: containerHeight,
          top: `${navbarHeight}px`,
          left: '0',
          maxWidth: `${videoAreaWidth}%`,
          zIndex: 1
        }}
      >
        {/* Canvas mode is now handled by separate route /canvas -> NewCanvasPage */}
        {streams.map((stream, index) => {
          const layoutStyle = calculateLayoutStyles(layoutType, index, streams.length);
          const boxKey = `${stream.id}-${stream._reloadKey || 0}`;

          return (
            <StreamBox
              key={boxKey}
              streamData={stream}
              theme={theme}
              layoutStyle={layoutStyle}
              onRemove={handleRemove}
              onReload={handleReload}
              onToggleChat={handleToggleChat}
              onSeparateChat={handleSeparateChat}
              onVolumeChange={handleVolumeChange}
              streamIndex={index}
              chatLayoutType={chatLayoutType}
              masterVolume={masterVolume}
              isMasterMuted={isMasterMuted}
              mode="normal"
            />
          );
        })}
      </div>

      {chatLayoutType !== 'none' && streams.length > 0 && (
        <ChatSidebar
          theme={theme}
          chatLayoutType={chatLayoutType}
          streams={streams}
          navbarHeight={navbarHeight}
        />
      )}
    </>
  );
}
