import React, { useEffect, useRef, useMemo, useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import type { StreamData } from '../utils/streamUtils';
import type { ChatLayoutType } from '../utils/chatLayoutUtils';
import { StreamChat } from './StreamChat'; // Import StreamChat
import { getChatLayoutConfig, CHAT_LAYOUT_CONFIGS } from '../utils/chatLayoutUtils';

interface ChatSidebarProps {
  theme: 'light' | 'dark';
  chatLayoutType: ChatLayoutType;
  streams: StreamData[];
  navbarHeight: number;
}

// 聊天室選擇狀態（存儲每個位置選擇的串流ID）- 使用模組級變數作為持久化存儲
const chatSelectionsStorage: Record<string, number | null> = {
  position1: null,
  position2: null,
  position3: null,
  position4: null
};

// 智能遷移聊天室選擇（參考正式環境的 migrateChatSelections）
// 注意：這個函數現在接收 setChatSelections 作為參數，以便更新 React state
const migrateChatSelections = (
  positionKeys: string[],
  allStreams: StreamData[],
  currentLayoutType: ChatLayoutType,
  setSelections: React.Dispatch<React.SetStateAction<Record<string, number | null>>>
) => {
  // 收集所有已使用的串流 ID（避免重複分配）
  const usedStreamIds = new Set<number>();

  // 首先，收集當前布局中已經有值的串流 ID
  positionKeys.forEach(posKey => {
    if (chatSelectionsStorage[posKey] !== null && chatSelectionsStorage[posKey] !== undefined) {
      const streamId = chatSelectionsStorage[posKey]!;
      // 檢查該串流是否仍然存在
      if (allStreams.find(s => s.id === streamId)) {
        usedStreamIds.add(streamId);
      }
    }
  });

  // 為每個位置鍵嘗試遷移或設置默認值
  const updatedSelections: Record<string, number | null> = { ...chatSelectionsStorage };

  positionKeys.forEach((posKey) => {
    const currentSelection = chatSelectionsStorage[posKey];

    // 如果當前位置沒有保存的選擇，或選擇的串流不存在，嘗試遷移
    if (!currentSelection || !allStreams.find(s => s.id === currentSelection)) {
      let migrated = false;

      // 策略 1: 首先嘗試從相同位置鍵的其他布局遷移
      // 檢查當前位置鍵是否在其他布局配置中也存在，如果有值且有效，保留它
      const existingId = chatSelectionsStorage[posKey];
      if (existingId !== null && existingId !== undefined) {
        const streamExists = allStreams.find(s => s.id === existingId);
        if (streamExists && !usedStreamIds.has(existingId)) {
          // 檢查該位置鍵是否在其他布局配置中也存在
          let posKeyUsedInOtherLayout = false;
          for (const [layoutType, layoutConfig] of Object.entries(CHAT_LAYOUT_CONFIGS)) {
            if (layoutType !== currentLayoutType && layoutType !== 'none') {
              if (layoutConfig.positionKeys.includes(posKey)) {
                posKeyUsedInOtherLayout = true;
                break;
              }
            }
          }

          // 如果該位置鍵在其他布局中也使用，保留現有選擇
          if (posKeyUsedInOtherLayout) {
            usedStreamIds.add(existingId);
            migrated = true;
            // 保持現有選擇（已在 chatSelections 中，不需要修改）
          }
        }
      }

      // 策略 2: 如果相同位置鍵沒有可遷移的值，嘗試從其他位置鍵遷移（但要避免重複）
      if (!migrated) {
        const availableStreamIds: number[] = [];
        for (const [layoutType, layoutConfig] of Object.entries(CHAT_LAYOUT_CONFIGS)) {
          if (layoutType !== currentLayoutType && layoutType !== 'none') {
            for (const otherPosKey of layoutConfig.positionKeys) {
              // 只從其他位置鍵遷移，不從相同位置鍵遷移（已在策略1處理）
              if (otherPosKey !== posKey) {
                const otherId = chatSelectionsStorage[otherPosKey];
                if (otherId !== null && otherId !== undefined) {
                  const streamExists = allStreams.find(s => s.id === otherId);
                  if (streamExists && !usedStreamIds.has(otherId)) {
                    availableStreamIds.push(otherId);
                  }
                }
              }
            }
          }
        }

        // 如果有可用的串流，使用第一個未使用的
        if (availableStreamIds.length > 0) {
          updatedSelections[posKey] = availableStreamIds[0];
          usedStreamIds.add(availableStreamIds[0]);
          migrated = true;
        }
      }

      // 策略 3: 如果無法遷移，使用默認值（按順序使用串流，但跳過已使用的）
      if (!migrated) {
        for (let i = 0; i < allStreams.length; i++) {
          const streamId = allStreams[i].id;
          if (!usedStreamIds.has(streamId)) {
            updatedSelections[posKey] = streamId;
            usedStreamIds.add(streamId);
            migrated = true;
            break;
          }
        }
      }
    } else {
      // 如果已經有值且串流存在，確保它被標記為已使用
      usedStreamIds.add(currentSelection);
    }
  });

  // 更新存儲和 state
  Object.assign(chatSelectionsStorage, updatedSelections);
  setSelections({ ...updatedSelections });
};

// 使用 React.memo 包裝，避免控制面板狀態變化導致不必要的重新渲染
export const ChatSidebar = React.memo(function ChatSidebar({
  theme,
  chatLayoutType,
  streams,
  navbarHeight
}: ChatSidebarProps) {
  const config = getChatLayoutConfig(chatLayoutType);
  const sidebarRef = useRef(null);

  // panelUpdateTimersRef removed


  // 使用 useMemo 來穩定 streams 的引用，避免控制面板狀態變化導致重新渲染
  // 只在串流的 ID、平台、頻道 ID、視頻 ID 真正改變時才更新
  const streamsKey = useMemo(() =>
    streams.map(s => `${s.id}:${s.platform}:${s.channelId}:${s.videoId}`).join('|'),
    [streams]
  );
  const stableStreams = useMemo(() => streams, [streamsKey]);

  // 使用 React state 來管理選擇狀態，確保選擇器正確顯示
  const [chatSelections, setChatSelections] = useState<Record<string, number | null>>(() => {
    // 初始化時從存儲中讀取
    return { ...chatSelectionsStorage };
  });

  // 同步函數：更新選擇狀態（同時更新 state 和存儲）
  const updateChatSelection = (positionKey: string, streamId: number | null) => {
    chatSelectionsStorage[positionKey] = streamId;
    setChatSelections(prev => ({ ...prev, [positionKey]: streamId }));
  };

  // 如果聊天室布局為 none，不顯示
  if (chatLayoutType === 'none') {
    return null;
  }

  // 當聊天室布局或串流變化時，使用智能遷移分配串流到各個面板
  // 參考正式環境：使用智能遷移邏輯，保留用戶選擇並避免重複分配
  // 當聊天室布局或串流變化時，使用智能遷移分配串流到各個面板
  useEffect(() => {
    // 使用智能遷移邏輯
    migrateChatSelections(config.positionKeys, stableStreams, chatLayoutType, setChatSelections);
  }, [chatLayoutType, stableStreams, config.positionKeys]);

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

  // 創建聊天室面板（參考正式環境的 createChatPanel）
  const createChatPanel = (positionKey: string, index?: number) => {
    const selectedId = chatSelections[positionKey];

    const selectedStream = stableStreams.find(s => s.id === selectedId);

    return (
      <div
        key={positionKey}
        className={`flex flex-col ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-300'} border rounded-lg overflow-hidden`}
        style={{ flex: '1', minWidth: 0, minHeight: 0 }}
      >
        {/* 選擇器頭部 */}
        <div className={`flex-shrink-0 px-3 py-2 border-b ${theme === 'dark' ? 'bg-gray-900 border-gray-700' : 'bg-gray-50 border-gray-200'}`}>
          <Select
            key={`select-${positionKey}-${stableStreams.length}-${stableStreams.map(s => s.id).join('-')}`}
            value={selectedId !== null && selectedId !== undefined ? String(selectedId) : ''}
            onValueChange={(value) => {
              const streamId = value && value !== 'none' && value !== '' ? parseInt(value) : null;

              // 參考正式環境：立即保存選擇狀態
              updateChatSelection(positionKey, streamId);
            }}
          >
            <SelectTrigger className={theme === 'dark' ? 'bg-gray-800 border-gray-700 text-white' : 'bg-white border-gray-300'}>
              <SelectValue placeholder="選擇串流..." />
            </SelectTrigger>
            <SelectContent>
              {stableStreams.map((stream) => (
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
          {selectedStream ? (
            <StreamChat
              platform={selectedStream.platform}
              channelId={selectedStream.channelId}
              videoId={selectedStream.videoId}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-gray-400">
              請選擇串流...
            </div>
          )}
        </div>
      </div>
    );
  };

  // 根據網格配置創建聊天室面板（參考正式環境的邏輯）
  const renderChatPanels = () => {
    if (config.grid.rows > 1) {
      // 多行布局（如 2x2 網格）
      // 參考正式環境：多行布局在 createChatPanel 中延遲更新（500ms）
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
      // 參考正式環境：單行布局在 useEffect 中延遲更新（500ms + index * 200ms）
      return config.positionKeys.map((posKey, index) => createChatPanel(posKey, index));
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
        zIndex: 20  // Keep chat above player iframes while staying below global controls (z-index: 40+).
      }}
    >
      {renderChatPanels()}
    </div>
  );
});

