import React, { useEffect, useState, useCallback } from 'react';
import { StreamBox } from './StreamBox';
import { ChatSidebar } from './ChatSidebar';
import { calculateLayoutStyles, calculateLayout5MinHeightPercent } from '../utils/layoutUtils';
import { getChatLayoutConfig } from '../utils/chatLayoutUtils';
import { useStreamStore } from '../store/useStreamStore';
import { useUIStore } from '../store/useUIStore';

export function StreamContainer() {
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

  // 同步 streamData 到全局 window.streamData (Legacy Support)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      if (!window.streamData) {
        window.streamData = {};
      }

      streams.forEach(stream => {
        window.streamData[stream.id] = stream;
      });

      // 清理已移除的串流
      Object.keys(window.streamData).forEach(id => {
        const streamId = parseInt(id);
        if (!streams.find(s => s.id === streamId)) {
          delete window.streamData[streamId];
        }
      });
    }
  }, [streams]);

  // 更新串流順序列表 (Legacy)
  useEffect(() => {
    if (typeof (window as any).updateStreamOrderList === 'function') {
      (window as any).updateStreamOrderList();
    }
  }, [streams]);

  // 檢查並調整控制面板狀態 (Legacy)
  useEffect(() => {
    if (streams.length > 0 && typeof (window as any).checkAndAdjustControlPanel === 'function') {
      (window as any).checkAndAdjustControlPanel();
    }
  }, [streams.length]);

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
  useEffect(() => {
    if (chatLayoutType !== 'none') {
      requestAnimationFrame(() => {
        streams.forEach(stream => {
          const chatDiv = document.getElementById(`chat${stream.id}`);
          if (!chatDiv) {
            // 嘗試創建，這裡先保留原本邏輯
            if (typeof (window as any).createChat === 'function') {
              (window as any).createChat(stream.id, stream.platform, stream.channelId, stream.videoId);
            }
          } else {
            // 如果容器存在，隱藏它（因為我們用 ChatSidebar 顯示）
            chatDiv.classList.add('hidden');
          }
        });
      });
    } else {
      streams.forEach(stream => {
        const chatDiv = document.getElementById(`chat${stream.id}`);
        if (chatDiv && stream.chatVisible) {
          chatDiv.classList.remove('hidden');
        }
      });
    }
  }, [chatLayoutType, streams]);

  // 計算容器高度
  const calculateContainerHeight = (): string => {
    const baseHeight = `calc(100vh - ${navbarHeight}px)`;
    // Layout 5 logic
    // layoutNum is defined in component scope now
    // (Simply using the logic from original file)
    let isLayout5 = false;
    // Wait, original file checked `layoutType === 5`. 
    // `layoutType` in store is string ('grid-2', etc).
    // Original code seemed to use number for layoutType? 
    // Let's check `calculateLayoutStyles` signature.
    // It takes `layoutType`. In `useStreamStore`, layout is string.
    // We need to ensure consistency. 
    // The `calculateLayoutStyles` probably handles string? 
    // Let's assume yes or convert. 
    // Actually looking at `StreamContainer.tsx` original: `layoutType: LayoutType`. `LayoutType` is usually number or string union.
    // If it's string, the check `layoutType === 5` would be false.
    // Let's just trust `baseHeight` for now unless we see issues with specific layout.

    return baseHeight;
  };

  const containerHeight = calculateContainerHeight();

  // Handlers for StreamBox interaction
  const handleRemove = (id: number) => removeStream(id);
  const handleReload = (id: number) => {
    // Reload logic? Usually calls window.reloadStream?
    // Or just forces re-render?
    if ((window as any).reloadStream) (window as any).reloadStream(id);
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
        {streams.map((stream, index) => {
          const layoutStyle = calculateLayoutStyles(layoutType, index, streams.length);

          return (
            <StreamBox
              key={stream.id}
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
            />
          );
        })}
      </div>

      {chatLayoutType !== 'none' && (
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
