import React, { useEffect, useRef, useMemo, useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import type { StreamData } from '../utils/streamUtils';
import type { ChatLayoutType } from '../utils/chatLayoutUtils';
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
    console.log(`[migrateChatSelections] 開始智能遷移`, {
      positionKeys,
      currentLayoutType,
      allStreamsCount: allStreams.length,
      allStreamIds: allStreams.map(s => s.id),
      currentSelections: { ...chatSelectionsStorage }
    });

  // 收集所有已使用的串流 ID（避免重複分配）
  const usedStreamIds = new Set<number>();
  
  // 首先，收集當前布局中已經有值的串流 ID
  positionKeys.forEach(posKey => {
    if (chatSelectionsStorage[posKey] !== null && chatSelectionsStorage[posKey] !== undefined) {
      const streamId = chatSelectionsStorage[posKey]!;
      // 檢查該串流是否仍然存在
      if (allStreams.find(s => s.id === streamId)) {
        usedStreamIds.add(streamId);
        console.log(`[migrateChatSelections] 位置鍵 ${posKey} 已有有效選擇`, {
          posKey,
          streamId,
          streamExists: true
        });
      } else {
        console.log(`[migrateChatSelections] 位置鍵 ${posKey} 的選擇已失效`, {
          posKey,
          streamId,
          streamExists: false
        });
      }
    }
  });
  
  console.log(`[migrateChatSelections] 已使用的串流 ID`, {
    usedStreamIds: Array.from(usedStreamIds)
  });
  
  // 為每個位置鍵嘗試遷移或設置默認值
  const updatedSelections: Record<string, number | null> = { ...chatSelectionsStorage };
  
  positionKeys.forEach((posKey, index) => {
    const currentSelection = chatSelectionsStorage[posKey];
    
    console.log(`[migrateChatSelections] 處理位置鍵`, {
      posKey,
      index,
      currentSelection,
      needsMigration: !currentSelection || !allStreams.find(s => s.id === currentSelection)
    });
    
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
            console.log(`[migrateChatSelections] 策略1成功：保留相同位置鍵的選擇`, {
              posKey,
              existingId,
              posKeyUsedInOtherLayout
            });
            // 保持現有選擇（已在 chatSelections 中，不需要修改）
          }
        }
      }
      
      // 策略 2: 如果相同位置鍵沒有可遷移的值，嘗試從其他位置鍵遷移（但要避免重複）
      if (!migrated) {
        console.log(`[migrateChatSelections] 策略1失敗，嘗試策略2`, { posKey });
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
          console.log(`[migrateChatSelections] 策略2成功：從其他位置鍵遷移`, {
            posKey,
            migratedId: availableStreamIds[0],
            availableCount: availableStreamIds.length
          });
        } else {
          console.log(`[migrateChatSelections] 策略2失敗：沒有可用的串流`, {
            posKey,
            availableStreamIds: []
          });
        }
      }
      
      // 策略 3: 如果無法遷移，使用默認值（按順序使用串流，但跳過已使用的）
      if (!migrated) {
        console.log(`[migrateChatSelections] 策略2失敗，嘗試策略3（默認分配）`, { posKey });
        for (let i = 0; i < allStreams.length; i++) {
          const streamId = allStreams[i].id;
          if (!usedStreamIds.has(streamId)) {
            updatedSelections[posKey] = streamId;
            usedStreamIds.add(streamId);
            migrated = true;
            console.log(`[migrateChatSelections] 策略3成功：使用默認值`, {
              posKey,
              assignedStreamId: streamId,
              index: i
            });
            break;
          }
        }
        
        if (!migrated) {
          console.warn(`[migrateChatSelections] 策略3失敗：所有串流都已使用`, {
            posKey,
            allStreamIds: allStreams.map(s => s.id),
            usedStreamIds: Array.from(usedStreamIds)
          });
        }
      }
    } else {
      // 如果已經有值且串流存在，確保它被標記為已使用
      usedStreamIds.add(currentSelection);
      console.log(`[migrateChatSelections] 位置鍵已有有效選擇，標記為已使用`, {
        posKey,
        currentSelection
      });
    }
  });
  
  // 更新存儲和 state
  Object.assign(chatSelectionsStorage, updatedSelections);
  setSelections({ ...updatedSelections });
  
  console.log(`[migrateChatSelections] 智能遷移完成`, {
    finalSelections: { ...updatedSelections },
    usedStreamIds: Array.from(usedStreamIds)
  });
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
  
  // 使用 useRef 來追蹤每個面板的延遲更新定時器，避免重複觸發和影響其他容器
  const panelUpdateTimersRef = useRef<Record<string, NodeJS.Timeout>>({});
  
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

  // 更新聊天室內容（參考正式環境的優化：減少延遲，提高響應速度）
  const updateChatContent = (positionKey: string, streamId: number | null, retryCount = 0) => {
    console.log(`[ChatSidebar] updateChatContent 被調用`, {
      positionKey,
      streamId,
      retryCount,
      timestamp: new Date().toISOString()
    });

    const chatContent = document.getElementById(`chat-content-${positionKey}`);
    if (!chatContent) {
      console.error(`[ChatSidebar] 找不到聊天室內容容器`, {
        positionKey,
        searchedId: `chat-content-${positionKey}`,
        allChatContentElements: Array.from(document.querySelectorAll('[id^="chat-content-"]')).map(el => el.id)
      });
      return;
    }

    console.log(`[ChatSidebar] 找到聊天室內容容器`, {
      positionKey,
      chatContentId: chatContent.id,
      chatContentExists: !!chatContent,
      hasChildren: chatContent.children.length > 0
    });

    chatContent.innerHTML = '';

    if (!streamId) {
      console.log(`[ChatSidebar] 沒有選擇串流，顯示提示`, { positionKey });
      // 顯示提示
      const emptyText = document.createElement('div');
      emptyText.className = 'flex items-center justify-center h-full';
      emptyText.style.color = theme === 'dark' ? '#999' : '#666';
      emptyText.textContent = '請選擇串流...';
      chatContent.appendChild(emptyText);
      return;
    }

    const stream = stableStreams.find(s => s.id === streamId);
    if (!stream) {
      console.error(`[ChatSidebar] 找不到串流數據`, {
        positionKey,
        streamId,
        availableStreamIds: stableStreams.map(s => s.id)
      });
      return;
    }

    console.log(`[ChatSidebar] 找到串流數據`, {
      positionKey,
      streamId,
      platform: stream.platform,
      channelId: stream.channelId,
      videoId: stream.videoId
    });

    // 獲取原始聊天室容器
    let originalChatDiv = document.getElementById(`chat${streamId}`);
    
    console.log(`[ChatSidebar] 查找原始聊天室容器`, {
      positionKey,
      streamId,
      foundById: !!originalChatDiv,
      searchedId: `chat${streamId}`
    });
    
    // 如果聊天室不存在，嘗試從 StreamBox 中查找
    if (!originalChatDiv) {
      const streamBox = document.querySelector(`[data-stream-id="${streamId}"]`);
      console.log(`[ChatSidebar] 通過 StreamBox 查找`, {
        positionKey,
        streamId,
        streamBoxExists: !!streamBox
      });
      
      if (streamBox) {
        const chatContainer = streamBox.querySelector(`#chat${streamId}`);
        if (chatContainer) {
          originalChatDiv = chatContainer as HTMLElement;
          console.log(`[ChatSidebar] 在 StreamBox 中找到聊天室容器`, {
            positionKey,
            streamId,
            chatContainerId: chatContainer.id
          });
        }
      }
    }

    if (!originalChatDiv) {
      console.warn(`[ChatSidebar] 原始聊天室容器不存在`, {
        positionKey,
        streamId,
        retryCount,
        allChatElements: Array.from(document.querySelectorAll('[id^="chat"]')).map(el => ({ id: el.id, hasContent: el.children.length > 0 }))
      });
      // 如果聊天室不存在，嘗試創建它（參考正式環境：立即創建，不等待）
      if (typeof (window as any).createChat === 'function') {
        console.log(`[ChatSidebar] 聊天室 ${streamId} 不存在，立即創建`, {
          streamId,
          platform: stream.platform,
          channelId: stream.channelId,
          videoId: stream.videoId
        });
        
        // 確保聊天室容器存在（對於 React 組件，容器應該已經存在）
        const streamBox = document.querySelector(`[data-stream-id="${streamId}"]`);
        if (streamBox) {
          // 嘗試找到聊天室容器
          const chatContainer = streamBox.querySelector(`#chat${streamId}`);
          if (chatContainer) {
            // 容器存在但可能還沒有內容，立即創建
            (window as any).createChat(
              streamId,
              stream.platform,
              stream.channelId,
              stream.videoId
            );
          } else {
            // 容器不存在，需要等待容器創建
            console.warn(`[ChatSidebar] 聊天室容器 ${streamId} 不存在，等待容器創建`);
          }
        } else {
          // StreamBox 不存在，直接創建（createChat 會處理容器不存在的情況）
          (window as any).createChat(
            streamId,
            stream.platform,
            stream.channelId,
            stream.videoId
          );
        }
        
        // 參考正式環境：使用較短的延遲時間（300ms），提高響應速度
        if (retryCount < 5) {
          setTimeout(() => {
            updateChatContent(positionKey, streamId, retryCount + 1);
          }, 300);
        } else {
          // 顯示錯誤提示
          const errorText = document.createElement('div');
          errorText.className = 'flex items-center justify-center h-full';
          errorText.style.color = theme === 'dark' ? '#ef4444' : '#dc2626';
          errorText.textContent = '無法載入聊天室';
          chatContent.appendChild(errorText);
        }
      } else {
        // 顯示錯誤提示
        const errorText = document.createElement('div');
        errorText.className = 'flex items-center justify-center h-full';
        errorText.style.color = theme === 'dark' ? '#ef4444' : '#dc2626';
        errorText.textContent = '聊天室功能未載入';
        chatContent.appendChild(errorText);
      }
      return;
    }

    // 檢查聊天室是否有內容（iframe 或其他內容）
    const iframe = originalChatDiv.querySelector('iframe');
    const hasContent = iframe || originalChatDiv.children.length > 0;
    
    console.log(`[ChatSidebar] 檢查原始聊天室內容`, {
      positionKey,
      streamId,
      hasIframe: !!iframe,
      iframeSrc: iframe?.src,
      hasContent,
      childrenCount: originalChatDiv.children.length,
      innerHTML: originalChatDiv.innerHTML.substring(0, 200)
    });
    
    // 檢查內容是否為錯誤訊息或替代方案（參考正式環境：如果內容是錯誤訊息，應該重新創建）
    const textContent = originalChatDiv.textContent || '';
    const isErrorContent = textContent.includes('無法載入') || 
                          textContent.includes('聊天室無法載入') ||
                          textContent.includes('請使用') ||
                          textContent.includes('⚠️') ||
                          originalChatDiv.querySelector('.separated-chat-header') !== null;
    
    // 檢查是否為 YouTube 替代方案（這是有效內容，應該複製）
    const isYouTubeAlternative = textContent.includes('YouTube 聊天室') && 
                                 textContent.includes('在新視窗開啟');

    console.log(`[ChatSidebar] 內容檢查結果`, {
      positionKey,
      streamId,
      isErrorContent,
      isYouTubeAlternative,
      textContent: textContent.substring(0, 100)
    });

    if (iframe && iframe.src) {
      console.log(`[ChatSidebar] 找到有效 iframe，複製到固定布局`, {
        positionKey,
        streamId,
        iframeSrc: iframe.src
      });
      // 創建新的 iframe（因為 iframe 不能直接移動）
      const newIframe = document.createElement('iframe');
      newIframe.src = iframe.src;
      newIframe.style.cssText = 'width: 100%; height: 100%; border: none;';
      newIframe.setAttribute('allow', iframe.getAttribute('allow') || 'autoplay; fullscreen');
      newIframe.setAttribute('allowfullscreen', '');
      chatContent.appendChild(newIframe);
      
      console.log(`[ChatSidebar] iframe 已複製到固定布局`, {
        positionKey,
        streamId,
        newIframeSrc: newIframe.src,
        chatContentChildren: chatContent.children.length
      });
    } else if (hasContent && (isYouTubeAlternative || (!isErrorContent && originalChatDiv.children.length > 0))) {
      // 如果沒有 iframe 但有其他有效內容（YouTube 替代方案或其他有效內容），複製整個內容
      console.log(`[ChatSidebar] 複製整個內容（等待 iframe 出現）`, {
        positionKey,
        streamId,
        childrenCount: originalChatDiv.children.length,
        childrenTypes: Array.from(originalChatDiv.children).map(c => c.tagName)
      });
      
      const content = originalChatDiv.cloneNode(true) as HTMLElement;
      content.classList.remove('hidden');
      content.style.cssText = 'width: 100%; height: 100%;';
      chatContent.appendChild(content);

      // 參考正式環境：使用較短的延遲時間（200ms），提高響應速度
      setTimeout(() => {
        const retryIframe = originalChatDiv.querySelector('iframe');
        console.log(`[ChatSidebar] 200ms 後檢查 iframe`, {
          positionKey,
          streamId,
          retryIframeExists: !!retryIframe,
          retryIframeSrc: retryIframe?.src
        });
        
        if (retryIframe && (retryIframe as HTMLIFrameElement).src) {
          console.log(`[ChatSidebar] iframe 已出現，替換為 iframe`, {
            positionKey,
            streamId,
            iframeSrc: retryIframe.src
          });
          
          chatContent.innerHTML = '';
          const newIframe = document.createElement('iframe');
          newIframe.src = (retryIframe as HTMLIFrameElement).src;
          newIframe.style.cssText = 'width: 100%; height: 100%; border: none;';
          newIframe.setAttribute('allow', retryIframe.getAttribute('allow') || 'autoplay; fullscreen');
          newIframe.setAttribute('allowfullscreen', '');
          chatContent.appendChild(newIframe);
        } else {
          console.warn(`[ChatSidebar] 200ms 後仍然沒有 iframe，可能需要更長時間或重新創建`, {
            positionKey,
            streamId,
            retryIframeExists: !!retryIframe,
            originalChatDivChildren: originalChatDiv.children.length
          });
          
          // 如果仍然沒有 iframe，嘗試重新創建聊天室
          if (!retryIframe && retryCount < 3) {
            console.log(`[ChatSidebar] 嘗試重新創建聊天室`, {
              positionKey,
              streamId,
              retryCount
            });
            
            if (typeof (window as any).createChat === 'function') {
              (window as any).createChat(
                streamId,
                stream.platform,
                stream.channelId,
                stream.videoId
              );
              
              // 再次等待並重試
              setTimeout(() => {
                updateChatContent(positionKey, streamId, retryCount + 1);
              }, 300);
            }
          }
        }
      }, 200);
    } else if (isErrorContent || (hasContent && !iframe)) {
      // 如果內容是錯誤訊息，或是有內容但沒有 iframe（可能是錯誤訊息），清空並重新創建聊天室
      console.log(`[ChatSidebar] 聊天室 ${streamId} 內容為錯誤訊息或無效內容，重新創建`, {
        isErrorContent,
        hasContent,
        hasIframe: !!iframe,
        textContent: textContent.substring(0, 50),
        retryCount
      });
      
      if (typeof (window as any).createChat === 'function') {
        // 參考正式環境：先清空錯誤內容，然後重新創建
        originalChatDiv.innerHTML = '';
        // 重新創建聊天室
        (window as any).createChat(
          streamId,
          stream.platform,
          stream.channelId,
          stream.videoId
        );
        // 等待創建後重試（參考正式環境：使用 300ms 延遲）
        if (retryCount < 10) {
          setTimeout(() => {
            updateChatContent(positionKey, streamId, retryCount + 1);
          }, 300);
        } else {
          // 顯示錯誤提示
          const errorText = document.createElement('div');
          errorText.className = 'flex items-center justify-center h-full';
          errorText.style.color = theme === 'dark' ? '#ef4444' : '#dc2626';
          errorText.textContent = '無法載入聊天室';
          chatContent.appendChild(errorText);
        }
      } else {
        // 如果 createChat 不可用，顯示錯誤提示
        const errorText = document.createElement('div');
        errorText.className = 'flex items-center justify-center h-full';
        errorText.style.color = theme === 'dark' ? '#ef4444' : '#dc2626';
        errorText.textContent = '聊天室功能未載入';
        chatContent.appendChild(errorText);
      }
      return;
    } else {
      // 如果聊天室容器存在但沒有內容，等待內容創建
      if (retryCount < 5) {
        setTimeout(() => {
          updateChatContent(positionKey, streamId, retryCount + 1);
        }, 300);
      } else {
        // 顯示錯誤提示
        const errorText = document.createElement('div');
        errorText.className = 'flex items-center justify-center h-full';
        errorText.style.color = theme === 'dark' ? '#ef4444' : '#dc2626';
        errorText.textContent = '無法載入聊天室內容';
        chatContent.appendChild(errorText);
      }
    }
  };

  // 當聊天室布局或串流變化時，使用智能遷移分配串流到各個面板
  // 參考正式環境：使用智能遷移邏輯，保留用戶選擇並避免重複分配
  useEffect(() => {
    console.log(`[ChatSidebar] useEffect 觸發 - 布局或串流變化`, {
      chatLayoutType,
      streamsCount: stableStreams.length,
      streamIds: stableStreams.map(s => s.id),
      positionKeys: config.positionKeys,
      gridRows: config.grid.rows,
      gridCols: config.grid.cols
    });

    // 參考正式環境：使用 requestAnimationFrame 確保 DOM 已更新
    const rafId = requestAnimationFrame(() => {
      console.log(`[ChatSidebar] requestAnimationFrame 執行`);
      
      // 使用智能遷移邏輯（參考正式環境的 migrateChatSelections）
      console.log(`[ChatSidebar] 執行智能遷移前`, {
        chatSelections: { ...chatSelections }
      });
      
      migrateChatSelections(config.positionKeys, stableStreams, chatLayoutType, setChatSelections);
      
      console.log(`[ChatSidebar] 執行智能遷移後`, {
        chatSelections: { ...chatSelections }
      });

      // 更新每個面板的內容
      // 參考正式環境：單行布局在 useEffect 中延遲更新（500ms + index * 200ms）
      // 多行布局在 createChatPanel 中延遲更新（500ms）
      if (config.grid.rows === 1) {
        console.log(`[ChatSidebar] 單行布局：在 useEffect 中處理延遲更新`);
        // 單行布局：在 useEffect 中處理延遲更新
        config.positionKeys.forEach((posKey, index) => {
          const selectedId = chatSelectionsStorage[posKey];
          
          console.log(`[ChatSidebar] 處理單行布局面板`, {
            positionKey: posKey,
            index,
            selectedId,
            delay: 500 + (index * 200)
          });
          
          if (selectedId !== null && selectedId !== undefined) {
            // 檢查選擇的串流是否仍然存在
            const streamExists = stableStreams.find(s => s.id === selectedId);
            if (streamExists) {
              // 參考正式環境：單行布局延遲更新（500ms + index * 200ms）
              const delay = 500 + (index * 200);
              console.log(`[ChatSidebar] 設置延遲更新`, {
                positionKey: posKey,
                streamId: selectedId,
                delay,
                willUpdateAt: new Date(Date.now() + delay).toISOString()
              });
              
              setTimeout(() => {
                console.log(`[ChatSidebar] 延遲更新觸發`, {
                  positionKey: posKey,
                  streamId: selectedId,
                  actualDelay: delay
                });
                updateChatContent(posKey, selectedId);
              }, delay);
            } else {
              // 串流不存在，清空選擇
              console.warn(`[ChatSidebar] 串流不存在，清空選擇`, {
                positionKey: posKey,
                selectedId
              });
              updateChatSelection(posKey, null);
              updateChatContent(posKey, null);
            }
          } else {
            // 沒有選擇，清空面板
            console.log(`[ChatSidebar] 沒有選擇，清空面板`, {
              positionKey: posKey
            });
            updateChatContent(posKey, null);
          }
        });
      } else {
        console.log(`[ChatSidebar] 多行布局：延遲更新在 createChatPanel 中處理`);
        // 多行布局：也需要在 useEffect 中觸發初始更新，確保聊天室能顯示
        // 參考正式環境：即使是在 createChatPanel 中處理，也要確保內容能正確顯示
        config.positionKeys.forEach((posKey, index) => {
          const selectedId = chatSelectionsStorage[posKey];
          if (selectedId !== null && selectedId !== undefined) {
            const streamExists = stableStreams.find(s => s.id === selectedId);
            if (streamExists) {
              // 對於多行布局，使用較短的延遲（300ms），因為 createChatPanel 中已經有 500ms 延遲
              // 這裡作為備份觸發，確保內容能顯示
              setTimeout(() => {
                const chatContent = document.getElementById(`chat-content-${posKey}`);
                if (chatContent && chatContent.children.length === 0) {
                  console.log(`[ChatSidebar] 多行布局備份觸發：內容為空，重新更新`, {
                    positionKey: posKey,
                    streamId: selectedId
                  });
                  updateChatContent(posKey, selectedId);
                }
              }, 800); // 800ms = 500ms (createChatPanel) + 300ms (額外緩衝)
            }
          }
        });
      }
    });

    return () => {
      cancelAnimationFrame(rafId);
      // 清理所有延遲更新定時器
      Object.values(panelUpdateTimersRef.current).forEach(timer => clearTimeout(timer));
      panelUpdateTimersRef.current = {};
    };
  }, [chatLayoutType, stableStreams, config.positionKeys]);

  // 監聽聊天室創建完成事件，當聊天室創建完成後立即更新內容
  // 參考正式環境：使用較短的延遲時間，提高響應速度
  useEffect(() => {
    const handleChatCreated = (event: CustomEvent) => {
      const { streamId } = event.detail;
      if (!streamId) return;

      // 檢查該串流是否被分配到某個面板
      const assignedPosition = Object.entries(chatSelectionsStorage).find(
        ([_, id]) => id === streamId
      );

      if (assignedPosition) {
        const [positionKey] = assignedPosition;
        // 參考正式環境：使用較短的延遲時間（100ms），提高響應速度
        setTimeout(() => {
          updateChatContent(positionKey, streamId);
        }, 100);
      }
    };

    window.addEventListener('chatCreated', handleChatCreated as EventListener);
    
    return () => {
      window.removeEventListener('chatCreated', handleChatCreated as EventListener);
    };
  }, [streams]);

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

    // 參考正式環境：如果有選中的串流，延遲更新聊天室內容
    // 多行布局：在面板創建時使用 500ms 延遲
    // 單行布局：在 useEffect 中處理（500ms + index * 200ms）
    // 注意：只在初始創建時觸發，選擇器切換時不觸發（選擇器切換會直接調用 updateChatContent）
    if (selectedId !== null && selectedId !== undefined && config.grid.rows > 1) {
      // 清除之前的定時器（如果存在）
      if (panelUpdateTimersRef.current[positionKey]) {
        clearTimeout(panelUpdateTimersRef.current[positionKey]);
        delete panelUpdateTimersRef.current[positionKey];
      }
      
      console.log(`[ChatSidebar] createChatPanel - 多行布局，設置延遲更新`, {
        positionKey,
        selectedId,
        delay: 500
      });
      
      const streamExists = stableStreams.find(s => s.id === selectedId);
      if (streamExists) {
        // 參考正式環境：多行布局在面板創建時延遲更新（500ms）
        // 只在內容為空時才觸發，避免覆蓋選擇器切換的更新
        const timerId = setTimeout(() => {
          const chatContent = document.getElementById(`chat-content-${positionKey}`);
          // 只在內容為空時才更新，避免覆蓋選擇器切換的更新
          if (chatContent && chatContent.children.length === 0) {
            console.log(`[ChatSidebar] createChatPanel - 多行布局延遲更新觸發`, {
              positionKey,
              selectedId
            });
            updateChatContent(positionKey, selectedId);
          }
          delete panelUpdateTimersRef.current[positionKey];
        }, 500);
        panelUpdateTimersRef.current[positionKey] = timerId;
      } else {
        console.warn(`[ChatSidebar] createChatPanel - 串流不存在`, {
          positionKey,
          selectedId
        });
      }
    }

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
              
              // 清除該面板的延遲更新定時器（如果存在），避免與選擇器切換衝突
              if (panelUpdateTimersRef.current[positionKey]) {
                clearTimeout(panelUpdateTimersRef.current[positionKey]);
                delete panelUpdateTimersRef.current[positionKey];
                console.log(`[ChatSidebar] 選擇器切換，清除延遲更新定時器`, { positionKey });
              }
              
              // 參考正式環境：立即保存選擇狀態
              updateChatSelection(positionKey, streamId);
              // 參考正式環境：立即更新內容，不使用延遲
              // 只更新當前選擇器對應的容器，不影響其他容器
              updateChatContent(positionKey, streamId);
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
          {/* 內容會通過 updateChatContent 動態添加 */}
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
        zIndex: 1  // 參考正式環境：確保聊天室在串流上方，但不會覆蓋控制面板（控制面板 z-index: 40）
      }}
    >
      {renderChatPanels()}
    </div>
  );
});

