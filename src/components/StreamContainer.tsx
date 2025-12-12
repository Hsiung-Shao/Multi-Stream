import React, { useEffect, useState } from 'react';
import { StreamBox } from './StreamBox';
import { ChatSidebar } from './ChatSidebar';
import type { StreamData } from '../utils/streamUtils';
import { calculateLayoutStyles, calculateLayout5MinHeightPercent, type LayoutType } from '../utils/layoutUtils';
import type { ChatLayoutType } from '../utils/chatLayoutUtils';
import { getChatLayoutConfig } from '../utils/chatLayoutUtils';

interface StreamContainerProps {
  streams: StreamData[];
  theme: 'light' | 'dark';
  layoutType: LayoutType;
  chatLayoutType: ChatLayoutType;
  onRemove: (id: number) => void;
  onReload: (id: number) => void;
  onToggleChat: (id: number) => void;
  onSeparateChat: (id: number) => void;
  onVolumeChange: (id: number, volume: number) => void;
  onStreamDataChange: (id: number, data: Partial<StreamData>) => void;
}

export function StreamContainer({
  streams,
  theme,
  layoutType,
  chatLayoutType,
  onRemove,
  onReload,
  onToggleChat,
  onSeparateChat,
  onVolumeChange,
  onStreamDataChange
}: StreamContainerProps) {
  const chatConfig = getChatLayoutConfig(chatLayoutType);
  const videoAreaWidth = chatLayoutType !== 'none' ? chatConfig.videoAreaWidth : 100;
  // 同步 streamData 到全局 window.streamData
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

  // 更新串流順序列表
  useEffect(() => {
    if (typeof (window as any).updateStreamOrderList === 'function') {
      (window as any).updateStreamOrderList();
    }
  }, [streams]);

  // 檢查並調整控制面板狀態
  useEffect(() => {
    if (streams.length > 0 && typeof (window as any).checkAndAdjustControlPanel === 'function') {
      (window as any).checkAndAdjustControlPanel();
    }
  }, [streams.length]);

  // 觸發窗口 resize 事件，讓播放器重新計算尺寸（當布局改變時）
  useEffect(() => {
    if (streams.length === 0) return;

    const timeoutId = setTimeout(() => {
      // 觸發窗口 resize 事件，讓播放器重新計算尺寸
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
      if (navbar) {
        setNavbarHeight(navbar.getBoundingClientRect().height);
      }
    };
    
    updateNavbarHeight();
    window.addEventListener('resize', updateNavbarHeight);
    
    return () => {
      window.removeEventListener('resize', updateNavbarHeight);
    };
  }, []);

  // 當聊天室布局啟用時，隱藏串流框內的聊天室，並確保聊天室已創建
  // 參考正式環境：當布局切換時，立即創建所有聊天室，即使被隱藏
  useEffect(() => {
    if (chatLayoutType !== 'none') {
      // 使用 requestAnimationFrame 確保 DOM 已更新
      requestAnimationFrame(() => {
        streams.forEach(stream => {
          const chatDiv = document.getElementById(`chat${stream.id}`);
          
          // 如果聊天室不存在，立即創建它（即使 chatVisible 為 false）
          // 參考正式環境：確保聊天室容器存在，即使被隱藏也能找到
          if (!chatDiv) {
            // 嘗試從 StreamBox 中查找容器
            const streamBox = document.querySelector(`[data-stream-id="${stream.id}"]`);
            if (streamBox) {
              const chatContainer = streamBox.querySelector(`#chat${stream.id}`) as HTMLElement;
              if (chatContainer && typeof (window as any).createChat === 'function') {
                // 容器存在但可能沒有內容，立即創建聊天室
                (window as any).createChat(
                  stream.id,
                  stream.platform,
                  stream.channelId,
                  stream.videoId
                );
              } else if (!chatContainer) {
                // 容器不存在，等待容器創建後再創建聊天室
                setTimeout(() => {
                  const retryChatDiv = document.getElementById(`chat${stream.id}`);
                  if (retryChatDiv && typeof (window as any).createChat === 'function') {
                    (window as any).createChat(
                      stream.id,
                      stream.platform,
                      stream.channelId,
                      stream.videoId
                    );
                  }
                }, 200);
              }
            }
          } else {
            // 聊天室存在，檢查是否有內容
            const hasContent = chatDiv.querySelector('iframe') || chatDiv.children.length > 0;
            if (!hasContent && typeof (window as any).createChat === 'function') {
              // 容器存在但沒有內容，立即創建
              (window as any).createChat(
                stream.id,
                stream.platform,
                stream.channelId,
                stream.videoId
              );
            }
            // 隱藏聊天室
            chatDiv.classList.add('hidden');
          }
        });
      });
    } else {
      // 恢復顯示
      streams.forEach(stream => {
        const chatDiv = document.getElementById(`chat${stream.id}`);
        if (chatDiv && stream.chatVisible) {
          chatDiv.classList.remove('hidden');
        }
      });
    }
  }, [chatLayoutType, streams]);

  // 計算容器高度（處理布局類型5超過4個串流的情況）
  const calculateContainerHeight = (): string => {
    const baseHeight = `calc(100vh - ${navbarHeight}px)`;
    
    // 如果是布局類型5（上大下三）且串流數量超過4個
    if (layoutType === 5 && streams.length > 4) {
      // 計算需要的行數：第一個串流佔75%，後續每3個一行，每行25%
      const minHeightPercent = calculateLayout5MinHeightPercent(streams.length);
      // 將百分比轉換為實際高度
      const viewportHeight = typeof window !== 'undefined' ? window.innerHeight - navbarHeight : 0;
      if (viewportHeight > 0) {
        const calculatedHeight = (viewportHeight * minHeightPercent) / 100;
        return `${calculatedHeight}px`;
      }
    }
    
    return baseHeight;
  };

  const containerHeight = calculateContainerHeight();

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
              onRemove={onRemove}
              onReload={onReload}
              onToggleChat={onToggleChat}
              onSeparateChat={onSeparateChat}
              onVolumeChange={onVolumeChange}
              streamIndex={index}
              chatLayoutType={chatLayoutType}
            />
          );
        })}
      </div>
      
      {/* 聊天室側邊欄 */}
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

