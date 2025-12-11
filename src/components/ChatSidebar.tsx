import React, { useEffect, useRef } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import type { StreamData } from '../utils/streamUtils';
import type { ChatLayoutType } from '../utils/chatLayoutUtils';
import { getChatLayoutConfig } from '../utils/chatLayoutUtils';

interface ChatSidebarProps {
  theme: 'light' | 'dark';
  chatLayoutType: ChatLayoutType;
  streams: StreamData[];
  navbarHeight: number;
}

// 聊天室選擇狀態（存儲每個位置選擇的串流ID）
const chatSelections: Record<string, number | null> = {
  position1: null,
  position2: null,
  position3: null,
  position4: null
};

export function ChatSidebar({
  theme,
  chatLayoutType,
  streams,
  navbarHeight
}: ChatSidebarProps) {
  const config = getChatLayoutConfig(chatLayoutType);
  const sidebarRef = useRef(null);

  // 如果聊天室布局為 none，不顯示
  if (chatLayoutType === 'none') {
    return null;
  }

  // 更新聊天室內容
  const updateChatContent = (positionKey: string, streamId: number | null) => {
    const chatContent = document.getElementById(`chat-content-${positionKey}`);
    if (!chatContent) return;

    chatContent.innerHTML = '';

    if (!streamId) {
      // 顯示提示
      const emptyText = document.createElement('div');
      emptyText.className = 'flex items-center justify-center h-full';
      emptyText.style.color = theme === 'dark' ? '#999' : '#666';
      emptyText.textContent = '請選擇串流...';
      chatContent.appendChild(emptyText);
      return;
    }

    const stream = streams.find(s => s.id === streamId);
    if (!stream) return;

    // 獲取原始聊天室容器
    const originalChatDiv = document.getElementById(`chat${streamId}`);
    if (!originalChatDiv) {
      // 如果聊天室不存在，嘗試創建它
      if (typeof (window as any).createChat === 'function') {
        (window as any).createChat(
          streamId,
          stream.platform,
          stream.channelId,
          stream.videoId
        );
        // 等待創建後再更新
        setTimeout(() => {
          updateChatContent(positionKey, streamId);
        }, 500);
      }
      return;
    }

    const iframe = originalChatDiv.querySelector('iframe');
    if (iframe && iframe.src) {
      // 創建新的 iframe（因為 iframe 不能直接移動）
      const newIframe = document.createElement('iframe');
      newIframe.src = iframe.src;
      newIframe.style.cssText = 'width: 100%; height: 100%; border: none;';
      newIframe.setAttribute('allow', iframe.getAttribute('allow') || 'autoplay; fullscreen');
      newIframe.setAttribute('allowfullscreen', '');
      chatContent.appendChild(newIframe);
    } else {
      // 如果沒有 iframe，複製整個內容
      const content = originalChatDiv.cloneNode(true) as HTMLElement;
      content.classList.remove('hidden');
      content.style.cssText = 'width: 100%; height: 100%;';
      chatContent.appendChild(content);

      // 如果 iframe 還沒加載，等待一下再重試
      setTimeout(() => {
        const retryIframe = originalChatDiv.querySelector('iframe');
        if (retryIframe && (retryIframe as HTMLIFrameElement).src) {
          chatContent.innerHTML = '';
          const newIframe = document.createElement('iframe');
          newIframe.src = (retryIframe as HTMLIFrameElement).src;
          newIframe.style.cssText = 'width: 100%; height: 100%; border: none;';
          newIframe.setAttribute('allow', retryIframe.getAttribute('allow') || 'autoplay; fullscreen');
          newIframe.setAttribute('allowfullscreen', '');
          chatContent.appendChild(newIframe);
        }
      }, 200);
    }
  };

  // 當聊天室布局或串流變化時，自動分配前4個串流到各個面板
  useEffect(() => {
    // 獲取前4個串流（根據串流順序）
    const availableStreams = streams.slice(0, 4);
    const panelCount = config.positionKeys.length;

    // 自動分配串流到各個面板
    config.positionKeys.forEach((posKey, index) => {
      const currentSelection = chatSelections[posKey];
      
      // 如果當前選擇的串流仍然存在且在前4個中，保持選擇
      if (currentSelection && availableStreams.find(s => s.id === currentSelection)) {
        updateChatContent(posKey, currentSelection);
      } 
      // 如果當前選擇的串流不存在或不在前4個中，自動分配
      else if (index < availableStreams.length) {
        const streamToAssign = availableStreams[index];
        chatSelections[posKey] = streamToAssign.id;
        updateChatContent(posKey, streamToAssign.id);
      }
      // 如果沒有足夠的串流，清空該面板
      else {
        chatSelections[posKey] = null;
        updateChatContent(posKey, null);
      }
    });
  }, [chatLayoutType, streams, config.positionKeys]);

  // 獲取串流標題
  const getStreamTitle = (stream: StreamData): string => {
    if (stream.displayName) return stream.displayName;
    if (stream.name) return stream.name;
    if (stream.platform === 'twitch') {
      return stream.channelId || `串流 #${stream.id}`;
    } else {
      return stream.videoId || `串流 #${stream.id}`;
    }
  };

  // 創建聊天室面板
  const createChatPanel = (positionKey: string) => {
    const selectedId = chatSelections[positionKey];

    return (
      <div
        key={positionKey}
        className={`flex flex-col ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-300'} border rounded-lg overflow-hidden`}
        style={{ flex: '1', minWidth: 0, minHeight: 0 }}
      >
        {/* 選擇器頭部 */}
        <div className={`flex-shrink-0 px-3 py-2 border-b ${theme === 'dark' ? 'bg-gray-900 border-gray-700' : 'bg-gray-50 border-gray-200'}`}>
          <Select
            value={selectedId ? String(selectedId) : undefined}
            onValueChange={(value) => {
              const streamId = value && value !== 'none' ? parseInt(value) : null;
              chatSelections[positionKey] = streamId;
              updateChatContent(positionKey, streamId);
            }}
          >
            <SelectTrigger className={theme === 'dark' ? 'bg-gray-800 border-gray-700 text-white' : 'bg-white border-gray-300'}>
              <SelectValue placeholder="選擇串流..." />
            </SelectTrigger>
            <SelectContent>
              {streams.map((stream) => (
                <SelectItem key={stream.id} value={String(stream.id)}>
                  #{stream.id} - {getStreamTitle(stream)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* 聊天室內容區域 */}
        <div
          id={`chat-content-${positionKey}`}
          className="flex-1 relative overflow-hidden"
          style={{ minHeight: 0 }}
        >
          {/* 內容會通過 updateChatContent 動態添加 */}
        </div>
      </div>
    );
  };

  // 根據網格配置創建聊天室面板
  const renderChatPanels = () => {
    if (config.grid.rows > 1) {
      // 多行布局（如 2x2 網格）
      const panels: any[] = [];
      for (let row = 0; row < config.grid.rows; row++) {
        const rowPanels: any[] = [];
        for (let col = 0; col < config.grid.cols; col++) {
          const posIndex = row * config.grid.cols + col;
          const posKey = config.positionKeys[posIndex];
          if (posKey) {
            rowPanels.push(createChatPanel(posKey));
          }
        }
        panels.push(
          <div key={row} className="flex gap-2 flex-1" style={{ minHeight: 0 }}>
            {rowPanels}
          </div>
        );
      }
      return panels;
    } else {
      // 單行布局
      return config.positionKeys.map((posKey) => createChatPanel(posKey));
    }
  };

  return (
    <div
      ref={sidebarRef}
      id="chat-sidebar-fixed"
      className={`fixed ${theme === 'dark' ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-300'} border-l shadow-lg`}
      style={{
        left: `${config.videoAreaWidth}%`,
        top: `${navbarHeight}px`,
        width: `${config.chatAreaWidth}%`,
        height: `calc(100vh - ${navbarHeight}px)`,
        display: 'flex',
        flexDirection: config.grid.rows > 1 ? 'column' : 'row',
        gap: '8px',
        padding: '8px',
        boxSizing: 'border-box',
        overflow: 'hidden',
        zIndex: 10
      }}
    >
      {renderChatPanels()}
    </div>
  );
}

