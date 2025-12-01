// 布局管理功能

// 用戶手動選擇的布局類型（用於防止自動布局覆蓋）
let userSelectedLayout = null;
let userLayoutTimeout = null;

// 固定布局配置對象（統一管理所有固定布局的配置）
const FIXED_LAYOUT_CONFIG = {
  13: {
    chatCount: 2,
    videoAreaWidth: 70,
    chatAreaWidth: 30,
    grid: { rows: 1, cols: 2 },
    positionKeys: ['position3', 'position4'],
    panelWidth: 50,
    panelHeight: 100,
    flexDirection: 'row',
    gap: '4px',
    padding: '4px'
  },
  14: {
    chatCount: 4,
    videoAreaWidth: 70,
    chatAreaWidth: 30,
    grid: { rows: 2, cols: 2 },
    positionKeys: ['position1', 'position2', 'position3', 'position4'],
    panelWidth: 50,
    panelHeight: 100,
    flexDirection: 'column',
    gap: '4px',
    padding: '4px'
  },
  15: {
    chatCount: 1,
    videoAreaWidth: 80,
    chatAreaWidth: 20,
    grid: { rows: 1, cols: 1 },
    positionKeys: ['position3'],
    panelWidth: 100,
    panelHeight: 100,
    flexDirection: 'column',
    gap: '0',
    padding: '4px'
  }
};

// 固定布局中用户选择的聊天室ID（統一存儲結構）
// 使用動態位置鍵，支持所有固定布局
let fixedLayoutChatSelection = {
  position1: null,
  position2: null,
  position3: null,
  position4: null
};

// 固定布局中用户选择的视频布局类型（1-6 或 9）
let layout13VideoLayout = null;

// 用戶調整的固定布局寬度比例（每個布局類型分別存儲）
let fixedLayoutWidthRatios = {
  13: null, // null 表示使用默認值
  14: null,
  15: null
};

// 從 localStorage 加載保存的寬度比例
try {
  const savedRatios = localStorage.getItem('fixedLayoutWidthRatios');
  if (savedRatios) {
    const parsed = JSON.parse(savedRatios);
    if (parsed && typeof parsed === 'object') {
      fixedLayoutWidthRatios = { ...fixedLayoutWidthRatios, ...parsed };
    }
  }
} catch (e) {
  console.error('Failed to load width ratios:', e);
}

// 檢查是否為固定布局
function isFixedLayout(layoutType) {
  return FIXED_LAYOUT_CONFIG.hasOwnProperty(layoutType);
}

// 切換布局選擇器
function toggleLayoutSelector() {
  const selector = document.getElementById('layout-selector');
  selector.classList.toggle('show');
}

// 調整聊天室布局以適應整體布局
function adjustChatLayoutForBox(box, layoutType) {
  const contentWrapper = box.querySelector('.content-wrapper');
  const chatDiv = box.querySelector('.chat-container');
  if (!contentWrapper || !chatDiv) return;
  
  // 根據整體布局類型決定聊天室和播放器的排列方式
  if (layoutType === 1 || layoutType === 2) {
    // 單一畫面或左右分割：聊天室在右側（水平排列）
    contentWrapper.classList.remove('layout-vertical');
    contentWrapper.classList.add('layout-horizontal');
    chatDiv.style.width = '300px';
    chatDiv.style.height = '100%';
  } else if (layoutType === 3) {
    // 上下分割：聊天室在下方（垂直排列）
    contentWrapper.classList.remove('layout-horizontal');
    contentWrapper.classList.add('layout-vertical');
    chatDiv.style.width = '100%';
    chatDiv.style.height = '250px';
  } else if (layoutType === 4) {
    // 四宮格：根據視窗寬度決定，通常使用垂直排列
    const boxWidth = box.offsetWidth || parseInt(box.style.width) || 500;
    if (boxWidth > 600) {
      // 寬度足夠，使用水平排列
      contentWrapper.classList.remove('layout-vertical');
      contentWrapper.classList.add('layout-horizontal');
      chatDiv.style.width = '250px';
      chatDiv.style.height = '100%';
    } else {
      // 寬度較小，使用垂直排列
      contentWrapper.classList.remove('layout-horizontal');
      contentWrapper.classList.add('layout-vertical');
      chatDiv.style.width = '100%';
      chatDiv.style.height = '200px';
    }
  } else if (layoutType === 5) {
    // 上大下三布局：上方大區域，下方三個小區域
    const boxWidth = box.offsetWidth || parseInt(box.style.width) || 500;
    const boxHeight = box.offsetHeight || parseInt(box.style.height) || 500;
    const boxIndex = Array.from(document.querySelectorAll('.stream-box')).indexOf(box);
    
    if (boxIndex === 0) {
      // 上方大區域：使用水平排列
      contentWrapper.classList.remove('layout-vertical');
      contentWrapper.classList.add('layout-horizontal');
      chatDiv.style.width = '300px';
      chatDiv.style.height = '100%';
    } else {
      // 下方小區域：根據寬度決定
      if (boxWidth > 400) {
        contentWrapper.classList.remove('layout-vertical');
        contentWrapper.classList.add('layout-horizontal');
        chatDiv.style.width = '200px';
        chatDiv.style.height = '100%';
      } else {
        contentWrapper.classList.remove('layout-horizontal');
        contentWrapper.classList.add('layout-vertical');
        chatDiv.style.width = '100%';
        chatDiv.style.height = '150px';
      }
    }
  } else if (layoutType === 6 || layoutType === 9) {
    // 網格布局：視窗很小，使用垂直排列
    contentWrapper.classList.remove('layout-horizontal');
    contentWrapper.classList.add('layout-vertical');
    chatDiv.style.width = '100%';
    const viewportHeight = window.innerHeight;
    const chatHeight = Math.max(80, Math.min(150, viewportHeight * 0.12));
    chatDiv.style.height = chatHeight + 'px';
  } else if (layoutType === 13) {
    // 固定布局：聊天室在右侧，隐藏视频框内的聊天室
    const chatDiv = box.querySelector('.chat-container');
    if (chatDiv) {
      chatDiv.classList.add('hidden');
    }
    return; // 提前返回，避免执行下面的代码
  }
  
  // 應用過渡效果
  chatDiv.style.transition = 'all 0.5s ease';
}

// 根據串流數量和視窗大小自動選擇最適合的布局
function autoSelectLayout() {
  const boxes = document.querySelectorAll('.stream-box');
  const count = boxes.length;
  if (count === 0) return;
  
  const windowWidth = window.innerWidth;
  const windowHeight = window.innerHeight;
  const aspectRatio = windowWidth / windowHeight;
  
  let layoutType = 1; // 預設單一畫面
  
  if (count === 1) {
    layoutType = 1; // 單一畫面
  } else if (count === 2) {
    // 2個串流：根據寬高比決定左右或上下
    layoutType = aspectRatio > 1.2 ? 2 : 3; // 寬螢幕用左右，高螢幕用上下
  } else if (count === 3) {
    // 3個串流：根據寬高比決定
    layoutType = aspectRatio > 1.3 ? 2 : 3; // 寬螢幕用左右，高螢幕用上下
  } else if (count === 4) {
    layoutType = 4; // 四宮格
  } else if (count <= 6) {
    // 5-6個串流：2×3 網格
    layoutType = 6;
  } else if (count <= 9) {
    // 7-9個串流：3×3 網格
    layoutType = 9;
  } else {
    // 超過9個：使用3×3網格，多餘的會自動排列
    layoutType = 9;
  }
  
  return layoutType;
}

// 设置固定布局的预设框架
function setupFixedLayoutFramework(boxes, layoutType) {
  const count = boxes.length;
  
  // 清理之前的右侧聊天室容器（如果存在）
  cleanupFixedChatSidebar();
  
  // 获取布局类型（优先使用传入的参数，否则使用 userSelectedLayout）
  const currentLayoutType = layoutType || userSelectedLayout;
  
  // 获取布局配置
  const config = FIXED_LAYOUT_CONFIG[currentLayoutType];
  if (!config) {
    console.error(`Unknown fixed layout type: ${currentLayoutType}`);
    return;
  }
  
  // 根据配置或用户调整设置宽度比例
  let videoAreaWidth = config.videoAreaWidth;
  let chatAreaWidth = config.chatAreaWidth;
  
  // 如果用户有调整过，使用调整后的值
  if (fixedLayoutWidthRatios[currentLayoutType] !== null) {
    videoAreaWidth = fixedLayoutWidthRatios[currentLayoutType].video;
    chatAreaWidth = fixedLayoutWidthRatios[currentLayoutType].chat;
  }
  
  // 布局视频在左侧（固定布局的视频布局会在 updateFixedLayoutFramework 中处理）
  boxes.forEach((b, i) => {
    const chatDiv = b.querySelector('.chat-container');
    if (chatDiv) {
      chatDiv.classList.add('hidden');
    }
  });
  
  // 创建右侧聊天室容器
  const chatSidebar = document.createElement('div');
  chatSidebar.id = 'chat-sidebar-fixed';
  chatSidebar.className = 'chat-sidebar-fixed';
  chatSidebar.style.width = chatAreaWidth + '%';
  chatSidebar.style.height = '100vh'; // 改為使用視窗高度，確保在高縮放下正確顯示
  chatSidebar.style.left = videoAreaWidth + '%';
  chatSidebar.style.top = '0';
  chatSidebar.style.position = 'absolute';
  chatSidebar.style.background = '#0a0a0a';
  chatSidebar.style.borderLeft = '2px solid #333';
  chatSidebar.style.overflow = 'hidden'; // 防止內容溢出
  
  // 获取所有串流用于选择器
  const allStreams = [];
  boxes.forEach((b) => {
    const id = parseInt(b.dataset.streamId);
    const data = streamData[id];
    if (data) {
      allStreams.push({ id, data, box: b });
    }
  });
  
  // 设置聊天室容器的样式
  chatSidebar.style.display = 'flex';
  chatSidebar.style.flexDirection = config.flexDirection;
  chatSidebar.style.gap = config.gap;
  chatSidebar.style.padding = config.padding;
  chatSidebar.style.boxSizing = 'border-box';
  
  // 迁移聊天室选择（从其他布局迁移，或使用默认值）
  migrateChatSelections(config.positionKeys, allStreams, currentLayoutType);
  
  // 根据网格配置创建聊天室面板
  if (config.grid.rows > 1) {
    // 多行布局（如 2x2 网格）
    for (let row = 0; row < config.grid.rows; row++) {
      const rowContainer = document.createElement('div');
      rowContainer.style.display = 'flex';
      rowContainer.style.flexDirection = 'row';
      rowContainer.style.gap = config.gap;
      rowContainer.style.flex = '1';
      rowContainer.style.minHeight = '0';
      
      for (let col = 0; col < config.grid.cols; col++) {
        const posIndex = row * config.grid.cols + col;
        const posKey = config.positionKeys[posIndex];
        const defaultId = fixedLayoutChatSelection[posKey];
        
        const chatPanel = createChatPanel(posKey, defaultId, allStreams, `layout${currentLayoutType}`);
        chatPanel.style.width = config.panelWidth + '%';
        chatPanel.style.height = config.panelHeight + '%';
        rowContainer.appendChild(chatPanel);
      }
      
      chatSidebar.appendChild(rowContainer);
    }
  } else {
    // 单行布局（如 1x2 或 1x1）
    config.positionKeys.forEach((posKey, index) => {
      const defaultId = fixedLayoutChatSelection[posKey];
      const chatPanel = createChatPanel(posKey, defaultId, allStreams, `layout${currentLayoutType}`);
      chatPanel.style.width = config.panelWidth + '%';
      chatPanel.style.height = config.panelHeight + '%';
      chatSidebar.appendChild(chatPanel);
      
      // 如果有选中的串流，延迟更新聊天室内容
      if (defaultId && streamData[defaultId]) {
        setTimeout(() => {
          updateFixedChatPanelContent(posKey, defaultId);
        }, 500 + (index * 200));
      }
    });
  }
  
  const container = document.getElementById('container');
  if (container) {
    container.appendChild(chatSidebar);
  }
}

// 迁移聊天室选择（从其他布局迁移，或使用默认值）
function migrateChatSelections(positionKeys, allStreams, currentLayoutType) {
  // 收集所有已使用的串流 ID（避免重複分配）
  const usedStreamIds = new Set();
  
  // 首先，收集當前布局中已經有值的串流 ID
  positionKeys.forEach(posKey => {
    if (fixedLayoutChatSelection[posKey] && streamData[fixedLayoutChatSelection[posKey]]) {
      usedStreamIds.add(fixedLayoutChatSelection[posKey]);
    }
  });
  
  // 為每個位置鍵嘗試遷移或設置默認值
  positionKeys.forEach((posKey, index) => {
    // 如果當前位置沒有保存的選擇，嘗試遷移
    if (!fixedLayoutChatSelection[posKey] || !streamData[fixedLayoutChatSelection[posKey]]) {
      let migrated = false;
      
      // 首先嘗試從相同位置鍵的其他布局遷移
      for (const [layoutId, layoutConfig] of Object.entries(FIXED_LAYOUT_CONFIG)) {
        if (parseInt(layoutId) !== currentLayoutType && layoutConfig.positionKeys.includes(posKey)) {
          const existingId = fixedLayoutChatSelection[posKey];
          if (existingId && streamData[existingId] && !usedStreamIds.has(existingId)) {
            usedStreamIds.add(existingId);
            migrated = true;
            break;
          }
        }
      }
      
      // 如果相同位置鍵沒有可遷移的值，嘗試從其他位置鍵遷移（但要避免重複）
      if (!migrated) {
        // 收集所有其他布局的可用串流 ID
        const availableStreamIds = [];
        for (const [layoutId, layoutConfig] of Object.entries(FIXED_LAYOUT_CONFIG)) {
          if (parseInt(layoutId) !== currentLayoutType) {
            for (const otherPosKey of layoutConfig.positionKeys) {
              const otherId = fixedLayoutChatSelection[otherPosKey];
              if (otherId && streamData[otherId] && !usedStreamIds.has(otherId)) {
                availableStreamIds.push(otherId);
              }
            }
          }
        }
        
        // 如果有可用的串流，使用第一個未使用的
        if (availableStreamIds.length > 0) {
          fixedLayoutChatSelection[posKey] = availableStreamIds[0];
          usedStreamIds.add(availableStreamIds[0]);
          migrated = true;
        }
      }
      
      // 如果無法遷移，使用默認值（按順序使用串流，但跳過已使用的）
      if (!migrated) {
        for (let i = 0; i < allStreams.length; i++) {
          const streamId = allStreams[i].id;
          if (!usedStreamIds.has(streamId)) {
            fixedLayoutChatSelection[posKey] = streamId;
            usedStreamIds.add(streamId);
            migrated = true;
            break;
          }
        }
      }
    } else {
      // 如果已經有值，確保它被標記為已使用
      usedStreamIds.add(fixedLayoutChatSelection[posKey]);
    }
  });
}

// 创建聊天室面板的辅助函数
function createChatPanel(posKey, defaultId, allStreams, layoutType) {
  const chatPanel = document.createElement('div');
  chatPanel.className = 'chat-sidebar-panel';
  chatPanel.id = `chat-panel-fixed-${posKey}`;
  chatPanel.style.position = 'relative';
  chatPanel.style.background = '#0a0a0a';
  chatPanel.style.border = '1px solid #333';
  chatPanel.style.borderRadius = '4px';
  chatPanel.style.overflow = 'hidden';
  chatPanel.style.display = 'flex';
  chatPanel.style.flexDirection = 'column';
  chatPanel.style.flexShrink = '0';
  
  // 创建头部（包含选择器）
  const chatHeader = document.createElement('div');
  chatHeader.className = 'chat-sidebar-header';
  chatHeader.style.padding = '8px';
  chatHeader.style.background = 'rgba(145, 71, 255, 0.2)';
  chatHeader.style.borderBottom = '1px solid #333';
  chatHeader.style.flexShrink = '0';
  chatHeader.style.display = 'flex';
  chatHeader.style.alignItems = 'center';
  chatHeader.style.gap = '8px';
  
  // 创建选择器
  const chatSelector = document.createElement('select');
  chatSelector.className = 'chat-stream-selector-fixed';
  chatSelector.id = `chat-selector-${posKey}`;
  chatSelector.style.background = '#222';
  chatSelector.style.color = '#fff';
  chatSelector.style.border = '1px solid #555';
  chatSelector.style.padding = '4px 8px';
  chatSelector.style.borderRadius = '4px';
  chatSelector.style.cursor = 'pointer';
  chatSelector.style.fontSize = '11px';
  chatSelector.style.flex = '1';
  chatSelector.style.minWidth = '0';
  chatSelector.title = '選擇要顯示的串流聊天室';
  
  // 添加选项
  const defaultOption = document.createElement('option');
  defaultOption.value = '';
  defaultOption.textContent = '選擇串流...';
  chatSelector.appendChild(defaultOption);
  
  allStreams.forEach((stream) => {
    const option = document.createElement('option');
    option.value = stream.id;
    const label = stream.data.platform === 'twitch' ? 
      (stream.data.channelId ? `#${stream.id} - ${stream.data.channelId}` : `#${stream.id}`) :
      (stream.data.videoId ? `#${stream.id} - ${stream.data.videoId}` : `#${stream.id}`);
    option.textContent = label;
    chatSelector.appendChild(option);
  });
  
  // 设置默认选中值
  if (defaultId && streamData[defaultId]) {
    chatSelector.value = defaultId;
  }
  
  // 监听选择器变化（立即响应，不使用延迟）
  chatSelector.addEventListener('change', function() {
    const selectedId = this.value ? parseInt(this.value) : null;
    // 立即保存选择状态（統一使用 fixedLayoutChatSelection）
    fixedLayoutChatSelection[posKey] = selectedId;
    // 立即更新内容，不使用延迟
    updateFixedChatPanelContent(posKey, selectedId);
  }, false); // 使用捕获阶段，确保事件立即处理
  
  chatHeader.appendChild(chatSelector);
  chatPanel.appendChild(chatHeader);
  
  // 创建内容区域
  const chatContent = document.createElement('div');
  chatContent.className = 'chat-sidebar-content';
  chatContent.id = `chat-content-fixed-${posKey}`;
  chatContent.style.flex = '1';
  chatContent.style.position = 'relative';
  chatContent.style.overflow = 'hidden';
  chatPanel.appendChild(chatContent);
  
  // 如果有选中的串流，延迟更新聊天室内容
  if (defaultId && streamData[defaultId]) {
    setTimeout(() => {
      updateFixedChatPanelContent(posKey, defaultId);
    }, 500);
  }
  
  return chatPanel;
}

// 更新固定布局中指定位置的聊天室面板内容
function updateFixedChatPanelContent(positionKey, streamId) {
  const chatContent = document.getElementById(`chat-content-fixed-${positionKey}`);
  if (!chatContent) {
    return;
  }
  
  // 清空现有内容
  chatContent.innerHTML = '';
  
  if (!streamId || !streamData[streamId]) {
    // 如果没有选择串流，显示提示
    const emptyText = document.createElement('div');
    emptyText.style.color = '#666';
    emptyText.style.fontSize = '14px';
    emptyText.style.display = 'flex';
    emptyText.style.alignItems = 'center';
    emptyText.style.justifyContent = 'center';
    emptyText.style.height = '100%';
    emptyText.textContent = '請選擇串流...';
    chatContent.appendChild(emptyText);
    return;
  }
  
  const data = streamData[streamId];
  
  // 获取原始聊天室容器
  const originalChatDiv = document.getElementById('chat' + streamId);
  if (!originalChatDiv) {
    // 如果聊天室不存在，创建它
    if (typeof createChat === 'function') {
      createChat(streamId, data.platform, data.channelId, data.videoId);
      // 等待聊天室创建后，再次尝试复制 iframe（减少延迟，提高响应速度）
      setTimeout(() => {
        const newlyCreatedChatDiv = document.getElementById('chat' + streamId);
        if (newlyCreatedChatDiv) {
          const iframe = newlyCreatedChatDiv.querySelector('iframe');
          if (iframe && iframe.src) {
            const newIframe = document.createElement('iframe');
            newIframe.src = iframe.src;
            newIframe.style.cssText = 'width: 100%; height: 100%; border: none;';
            newIframe.setAttribute('allow', iframe.getAttribute('allow') || 'autoplay; fullscreen');
            newIframe.setAttribute('allowfullscreen', '');
            chatContent.appendChild(newIframe);
          } else {
            // 如果没有 iframe，复制整个内容（可能是 YouTube 替代方案）
            const content = newlyCreatedChatDiv.cloneNode(true);
            content.classList.remove('hidden');
            content.style.cssText = 'width: 100%; height: 100%;';
            chatContent.appendChild(content);
          }
        }
      }, 300); // 从 1000ms 减少到 300ms，提高响应速度
    }
    return;
  }
  
  const iframe = originalChatDiv.querySelector('iframe');
  if (iframe && iframe.src) {
    // 创建新的 iframe（因为 iframe 不能直接移动）
    const newIframe = document.createElement('iframe');
    newIframe.src = iframe.src;
    newIframe.style.cssText = 'width: 100%; height: 100%; border: none;';
    newIframe.setAttribute('allow', iframe.getAttribute('allow') || 'autoplay; fullscreen');
    newIframe.setAttribute('allowfullscreen', '');
    chatContent.appendChild(newIframe);
  } else {
    // 如果没有 iframe（可能是 YouTube 替代方案或其他内容），复制整个内容
    const content = originalChatDiv.cloneNode(true);
    content.classList.remove('hidden');
    content.style.cssText = 'width: 100%; height: 100%;';
    chatContent.appendChild(content);
    
    // 如果 iframe 还没加载，等待一下再重试（减少延迟，提高响应速度）
    setTimeout(() => {
      const retryIframe = originalChatDiv.querySelector('iframe');
      if (retryIframe && retryIframe.src) {
        chatContent.innerHTML = '';
        const newIframe = document.createElement('iframe');
        newIframe.src = retryIframe.src;
        newIframe.style.cssText = 'width: 100%; height: 100%; border: none;';
        newIframe.setAttribute('allow', retryIframe.getAttribute('allow') || 'autoplay; fullscreen');
        newIframe.setAttribute('allowfullscreen', '');
        chatContent.appendChild(newIframe);
      }
    }, 200); // 从 500ms 减少到 200ms，提高响应速度
  }
}

// 更新固定布局的右侧聊天室内容
function updateFixedChatSidebarContent(streamId, chatContentElement) {
  if (!chatContentElement) {
    return;
  }
  
  // 清空现有内容
  chatContentElement.innerHTML = '';
  
  const data = streamData[streamId];
  if (!data) {
    return;
  }
  
  // 获取原始聊天室容器
  const originalChatDiv = document.getElementById('chat' + streamId);
  if (!originalChatDiv) {
    // 如果聊天室不存在，创建它
    if (typeof createChat === 'function') {
      createChat(streamId, data.platform, data.channelId, data.videoId);
      // 等待聊天室创建后，再次尝试复制 iframe
      setTimeout(() => {
        const newlyCreatedChatDiv = document.getElementById('chat' + streamId);
        if (newlyCreatedChatDiv) {
          const iframe = newlyCreatedChatDiv.querySelector('iframe');
          if (iframe && iframe.src) {
            const newIframe = document.createElement('iframe');
            newIframe.src = iframe.src;
            newIframe.style.cssText = 'width: 100%; height: 100%; border: none;';
            newIframe.setAttribute('allow', iframe.getAttribute('allow') || 'autoplay; fullscreen');
            newIframe.setAttribute('allowfullscreen', '');
            chatContentElement.appendChild(newIframe);
          }
        }
      }, 300); // 从 1000ms 减少到 300ms，提高响应速度
    }
    return;
  }
  
  const iframe = originalChatDiv.querySelector('iframe');
  if (iframe && iframe.src) {
    // 创建新的 iframe（因为 iframe 不能直接移动）
    const newIframe = document.createElement('iframe');
    newIframe.src = iframe.src;
    newIframe.style.cssText = 'width: 100%; height: 100%; border: none;';
    newIframe.setAttribute('allow', iframe.getAttribute('allow') || 'autoplay; fullscreen');
    newIframe.setAttribute('allowfullscreen', '');
    chatContentElement.appendChild(newIframe);
  } else {
    // 如果iframe还没加载，等待一下
    setTimeout(() => {
      const retryIframe = originalChatDiv.querySelector('iframe');
      if (retryIframe && retryIframe.src) {
        const newIframe = document.createElement('iframe');
        newIframe.src = retryIframe.src;
        newIframe.style.cssText = 'width: 100%; height: 100%; border: none;';
        newIframe.setAttribute('allow', retryIframe.getAttribute('allow') || 'autoplay; fullscreen');
        newIframe.setAttribute('allowfullscreen', '');
        chatContentElement.appendChild(newIframe);
      }
    }, 500);
  }
}

// 更新固定布局的框架（当添加或删除串流时调用）
function updateFixedLayoutFramework() {
  const chatSidebar = document.getElementById('chat-sidebar-fixed');
  if (!chatSidebar) return; // 如果不在布局13、14或15，直接返回
  
  const boxes = document.querySelectorAll('.stream-box');
  const count = boxes.length;
  
  // 固定布局：视频自动布局（可通过布局按钮手动调整）
  const currentLayoutType = userSelectedLayout;
  const config = FIXED_LAYOUT_CONFIG[currentLayoutType];
  
  if (!config) {
    return; // 不是固定布局，直接返回
  }
  
  // 如果是固定布局，使用用户选择的视频布局类型（如果没有选择则自动选择）
  {
    // 获取宽度比例（优先使用用户调整的值）
    let videoAreaWidth = config.videoAreaWidth;
    let chatAreaWidth = config.chatAreaWidth;
    
    if (fixedLayoutWidthRatios[currentLayoutType] !== null) {
      videoAreaWidth = fixedLayoutWidthRatios[currentLayoutType].video;
      chatAreaWidth = fixedLayoutWidthRatios[currentLayoutType].chat;
    }
    
    let videoLayoutType = 1;
    if (count > 0) {
      // 如果用户已经选择了视频布局类型，使用用户选择的；否则自动选择
      if (layout13VideoLayout !== null && [1, 2, 3, 4, 5, 6, 9].includes(layout13VideoLayout)) {
        videoLayoutType = layout13VideoLayout;
      } else {
        videoLayoutType = autoSelectLayout();
        layout13VideoLayout = videoLayoutType; // 保存自动选择的结果
      }
    }
    
    // 根据自动选择的布局类型应用视频布局
    boxes.forEach((b, i) => {
      b.style.position = 'absolute';
      b.style.right = 'auto';
      b.style.bottom = 'auto';
      
      if (videoLayoutType === 1 || count === 1) {
        b.style.width = videoAreaWidth + '%';
        b.style.height = '100%';
        b.style.left = '0';
        b.style.top = '0';
      } else if (videoLayoutType === 2) {
        b.style.width = (videoAreaWidth / count) + '%';
        b.style.height = '100%';
        b.style.left = (videoAreaWidth / count * i) + '%';
        b.style.top = '0';
      } else if (videoLayoutType === 3) {
        b.style.width = videoAreaWidth + '%';
        b.style.height = (100 / count) + '%';
        b.style.left = '0';
        b.style.top = (100 / count * i) + '%';
      } else if (videoLayoutType === 4) {
        const col = i % 2;
        const row = Math.floor(i / 2);
        b.style.width = (videoAreaWidth / 2) + '%';
        b.style.height = '50%';
        b.style.left = (col * videoAreaWidth / 2) + '%';
        b.style.top = (row * 50) + '%';
      } else if (videoLayoutType === 5) {
        if (i === 0) {
          b.style.width = videoAreaWidth + '%';
          b.style.height = '75%';
          b.style.left = '0';
          b.style.top = '0';
        } else if (i <= 3) {
          const bottomIndex = i - 1;
          b.style.width = (videoAreaWidth / 3) + '%';
          b.style.height = '25%';
          b.style.left = (bottomIndex * videoAreaWidth / 3) + '%';
          b.style.top = '75%';
        } else {
          const bottomIndex = (i - 1) % 3;
          const row = Math.floor((i - 1) / 3);
          b.style.width = (videoAreaWidth / 3) + '%';
          b.style.height = '25%';
          b.style.left = (bottomIndex * videoAreaWidth / 3) + '%';
          b.style.top = (75 + row * 25) + '%';
        }
      } else if (videoLayoutType === 6) {
        const cols = 3;
        const col = i % cols;
        const row = Math.floor(i / cols);
        b.style.width = (videoAreaWidth / cols) + '%';
        b.style.height = (100 / Math.ceil(count / cols)) + '%';
        b.style.left = (col * videoAreaWidth / cols) + '%';
        b.style.top = (row * 100 / Math.ceil(count / cols)) + '%';
      } else if (videoLayoutType === 9) {
        const cols = 3;
        const col = i % cols;
        const row = Math.floor(i / cols);
        b.style.width = (videoAreaWidth / cols) + '%';
        b.style.height = (100 / Math.ceil(count / cols)) + '%';
        b.style.left = (col * videoAreaWidth / cols) + '%';
        b.style.top = (row * 100 / Math.ceil(count / cols)) + '%';
      }
      
      // 隐藏视频框内的聊天室
      const chatDiv = b.querySelector('.chat-container');
      if (chatDiv) {
        chatDiv.classList.add('hidden');
      }
    });
  }
  
  // 获取所有串流用于更新选择器
  const allStreams = [];
  boxes.forEach((b) => {
    const id = parseInt(b.dataset.streamId);
    const data = streamData[id];
    if (data) {
      allStreams.push({ id, data, box: b });
    }
  });
  
  // 更新选择器的选项（使用配置中的位置键）
  const positions = config.positionKeys;
  positions.forEach((posKey) => {
    const selector = document.getElementById(`chat-selector-${posKey}`);
    if (selector) {
      // 使用已保存的选择状态，而不是选择器的当前值（这样可以保留用户刚选择的新值）
      const savedSelection = fixedLayoutChatSelection[posKey];
      const currentValue = savedSelection || selector.value || '';
      
      // 清空选项（保留第一个默认选项）
      while (selector.children.length > 1) {
        selector.removeChild(selector.lastChild);
      }
      
      // 添加所有串流选项
      allStreams.forEach((stream) => {
        const option = document.createElement('option');
        option.value = stream.id;
        const label = stream.data.platform === 'twitch' ? 
          (stream.data.channelId ? `#${stream.id} - ${stream.data.channelId}` : `#${stream.id}`) :
          (stream.data.videoId ? `#${stream.id} - ${stream.data.videoId}` : `#${stream.id}`);
        option.textContent = label;
        selector.appendChild(option);
      });
      
      // 恢复选中的值（使用已保存的选择状态）
      if (currentValue && streamData[parseInt(currentValue)]) {
        const selectedId = parseInt(currentValue);
        const selectedIdStr = String(selectedId);
        // 更新选择器的值（如果不同）
        if (selector.value !== selectedIdStr) {
          selector.value = selectedIdStr;
        }
        // 确保选择状态已保存
        fixedLayoutChatSelection[posKey] = selectedId;
        // 始终更新内容，确保同步（即使值相同）
        updateFixedChatPanelContent(posKey, selectedId);
      } else {
        // 如果当前选中的串流不存在，清空选择
        if (selector.value !== '') {
          selector.value = '';
        }
        fixedLayoutChatSelection[posKey] = null;
        updateFixedChatPanelContent(posKey, null);
      }
    } else {
      // 如果选择器不存在，更新对应的聊天室内容
      const selectedId = fixedLayoutChatSelection[posKey];
      if (selectedId && streamData[selectedId]) {
        updateFixedChatPanelContent(posKey, selectedId);
      } else {
        updateFixedChatPanelContent(posKey, null);
      }
    }
  });
  
  // 更新聊天室容器的位置和寬度
  if (chatSidebar) {
    chatSidebar.style.left = videoAreaWidth + '%';
    chatSidebar.style.width = chatAreaWidth + '%';
  }
}

// 清理固定布局的聊天室容器
function cleanupFixedChatSidebar() {
  const chatSidebar = document.getElementById('chat-sidebar-fixed');
  if (chatSidebar) {
    chatSidebar.remove();
  }
  
  // 清理分隔線（如果存在）
  const divider = document.getElementById('fixed-layout-divider');
  if (divider) {
    divider.remove();
  }
}

// 在固定布局中设置左侧视频布局类型（只影响左侧视频区域，不影响右侧聊天室）
function setLayout13VideoLayout(videoLayoutType) {
  // 检查当前是否为固定布局
  const chatSidebar = document.getElementById('chat-sidebar-fixed');
  if (!chatSidebar || !isFixedLayout(userSelectedLayout)) {
    // 如果不是固定布局，直接返回，让正常的 setLayout 处理
    return false;
  }
  
  // 验证布局类型是否有效（1-6 或 9）
  if (![1, 2, 3, 4, 5, 6, 9].includes(videoLayoutType)) {
    return false;
  }
  
  // 保存用户选择的视频布局类型
  layout13VideoLayout = videoLayoutType;
  
  // 更新左侧视频布局
  updateFixedLayoutFramework();
  
  return true;
}

function setLayout(type, immediate = false, isUserSelection = false) {
  const boxes = document.querySelectorAll('.stream-box');
  const count = boxes.length;
  
  // 固定布局需要预设框架，即使没有串流也要创建
  if (isFixedLayout(type)) {
    // 固定布局：视频自动布局，右侧固定聊天室（数量和排列方式由配置决定）
    // 先设置 userSelectedLayout，这样 setupFixedLayoutFramework 可以正确判断布局类型
    userSelectedLayout = type; // 無論如何都設置，確保控制面板能顯示
    if (isUserSelection) {
      localStorage.setItem('currentLayout', type);
      // 切换到 Layout 13、14 或 15 时，重置视频布局选择（让系统自动选择）
      layout13VideoLayout = null;
    }
    setupFixedLayoutFramework(boxes, type); // 传入布局类型
    updateFixedLayoutFramework(); // 立即更新内容
    updateFixedLayoutWidthControl(); // 更新寬度控制面板
    return;
  }
  
  // 其他布局类型需要至少一个串流
  if (count === 0) {
    // 沒有串流，跳過布局切換
    return;
  }
  
  // 切換到布局類型
  
  // 如果是用戶手動選擇，記錄並設置保護時間
  if (isUserSelection) {
    userSelectedLayout = type;
    // 記錄用戶手動選擇的布局
    // 清除之前的超時
    if (userLayoutTimeout) {
      clearTimeout(userLayoutTimeout);
    }
    // 5秒後清除用戶選擇標記，允許自動布局
    userLayoutTimeout = setTimeout(() => {
      userSelectedLayout = null;
      // 用戶選擇保護已過期，允許自動布局
    }, 5000);
  }
  
  // 如果正在拖拽stream-box，不執行布局更新，避免干擾拖拽操作
  if (isDraggingStreamBox) {
    // 正在拖拽，跳過布局切換
    return;
  }
  
  // 如果已經有待處理的布局更新，取消它
  if (layoutUpdateTimeout) {
    clearTimeout(layoutUpdateTimeout);
    layoutUpdateTimeout = null;
  }
  
  // 如果不是立即執行，使用防抖
  if (!immediate) {
    // 如果已經有待處理的更新，直接取消並立即執行新的布局
    if (pendingLayoutUpdate) {
      pendingLayoutUpdate = false;
    } else {
      pendingLayoutUpdate = true;
      layoutUpdateTimeout = setTimeout(() => {
        pendingLayoutUpdate = false;
        // 再次檢查是否正在拖拽
        if (!isDraggingStreamBox) {
          setLayout(type, true);
        }
      }, 150); // 150ms 防抖延遲
      return;
    }
  }
  
  pendingLayoutUpdate = false;
  
  // 更新控制面板中的布局預覽活動狀態
  // 更新布局預覽活動狀態
  document.querySelectorAll('.layout-preview-inline').forEach(preview => {
    preview.classList.remove('active');
  });
  // 根據布局類型設置對應的預覽為活動狀態
  const layoutMap = { 1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 9: 6, 13: 7, 14: 8, 15: 9 };
  const previewIndex = layoutMap[type];
  // 布局映射索引已計算
  if (previewIndex !== undefined) {
    const previews = document.querySelectorAll('.layout-preview-inline');
    // 找到布局預覽按鈕
    if (previews[previewIndex]) {
      previews[previewIndex].classList.add('active');
      // 已設置布局預覽按鈕為活動狀態
    } else {
      // 找不到對應的布局預覽按鈕
    }
  } else {
    // 布局類型不在映射表中
  }
  
  // 暫時禁用過渡效果，避免Twitch播放器在動畫過程中出現問題
  boxes.forEach(b => { 
    b.style.transition = 'none';
  });
  
  // 如果切换到非固定布局，清理固定布局的聊天室容器
  if (!isFixedLayout(type)) {
    cleanupFixedChatSidebar();
    updateFixedLayoutWidthControl(); // 隱藏寬度控制面板
  }
  
  if (type === 1 || count === 1) {
    // 單一畫面
    boxes.forEach(b => {
      b.style.left = '0';
      b.style.top = '0';
      b.style.width = '100%';
      b.style.height = '100%';
    });
  }
  else if (type === 2) {
    // 左右分割
    boxes.forEach((b, i) => {
      b.style.width = (100 / count) + '%';
      b.style.height = '100%';
      b.style.left = (100 / count * i) + '%';
      b.style.top = '0';
    });
  }
  else if (type === 3) {
    // 上下分割
    boxes.forEach((b, i) => {
      b.style.height = (100 / count) + '%';
      b.style.width = '100%';
      b.style.top = (100 / count * i) + '%';
      b.style.left = '0';
    });
  }
  else if (type === 4) {
    // 四宮格
    boxes.forEach((b, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      b.style.width = '50%';
      b.style.height = '50%';
      b.style.left = col * 50 + '%';
      b.style.top = row * 50 + '%';
    });
  }
  else if (type === 5) {
    // 上大下三布局：上方一個大區域（75%高度），下方三個小區域（25%高度，水平排列）
    // 需要至少 4 個串流才能完整顯示，但即使不足也會應用布局
    // 開始應用上大下三布局
    let appliedCount = 0;
    boxes.forEach((b, i) => {
      // 處理串流
      if (i === 0) {
        // 第一個：上方大區域
        b.style.width = '100%';
        b.style.height = '75%';
        b.style.left = '0';
        b.style.top = '0';
      } else if (i <= 3) {
        // 第2、3、4個：下方三個小區域
        const bottomIndex = i - 1; // 0, 1, 2
        b.style.width = '33.33%';
        b.style.height = '25%';
        b.style.left = (bottomIndex * 33.33) + '%';
        b.style.top = '75%';
      } else {
        // 如果有多於 4 個串流，後續的串流也放在下方，繼續排列
        const bottomIndex = (i - 1) % 3; // 循環使用 0, 1, 2
        const row = Math.floor((i - 1) / 3); // 計算行數
        b.style.width = '33.33%';
        b.style.height = '25%';
        b.style.left = (bottomIndex * 33.33) + '%';
        b.style.top = (75 + row * 25) + '%';
      }
      appliedCount++;
      // 已應用布局到串流
    });
    // 上大下三布局應用完成
  }
  else if (type === 6) {
    // 2×3 網格
    const cols = 3;
    const rows = Math.ceil(count / cols);
    boxes.forEach((b, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      b.style.width = (100 / cols) + '%';
      b.style.height = (100 / rows) + '%';
      b.style.left = (100 / cols * col) + '%';
      b.style.top = (100 / rows * row) + '%';
    });
  }
  else if (type === 9) {
    // 3×3 網格
    const cols = 3;
    const rows = Math.ceil(count / cols);
    boxes.forEach((b, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      b.style.width = (100 / cols) + '%';
      b.style.height = (100 / rows) + '%';
      b.style.left = (100 / cols * col) + '%';
      b.style.top = (100 / rows * row) + '%';
    });
  }
  
  // 調整所有聊天室布局以適應新布局
  // 使用 setTimeout 確保布局調整完成後再調整聊天室
  setTimeout(() => {
    boxes.forEach(b => {
      adjustChatLayoutForBox(b, type);
    });
    
    // 強制觸發窗口resize事件，讓Twitch播放器重新計算尺寸
    // 這對於修復Twitch播放器在DOM順序改變後卡死的問題很重要
    // 但不要觸發真正的 resize 事件，因為會觸發自動布局切換
    // 改為直接調用播放器的刷新邏輯（見下方）
    // const resizeEvent = new Event('resize');
    // window.dispatchEvent(resizeEvent);
    
    // 對於Twitch播放器，嘗試刷新播放器
    boxes.forEach(box => {
      const id = parseInt(box.dataset.streamId);
      if (players[id] && players[id].type === 'twitch' && players[id].player) {
        try {
          // Twitch播放器在容器尺寸改變時需要重新計算
          // 通過觸發resize事件和強制重新計算來修復
          const playerContainer = box.querySelector('.player-container');
          if (playerContainer) {
            // 強制重新計算容器尺寸
            const width = playerContainer.offsetWidth;
            const height = playerContainer.offsetHeight;
            // 觸發一個微小的尺寸變化來強制播放器刷新
            if (width > 0 && height > 0) {
              // 使用requestAnimationFrame確保在下一幀執行
              requestAnimationFrame(() => {
                // 再次觸發resize事件
                window.dispatchEvent(new Event('resize'));
              });
            }
          }
        } catch (e) {
          // Failed to refresh Twitch player，靜默處理
        }
      }
    });
  }, 50);
  
  // 恢復過渡效果
  setTimeout(() => {
    boxes.forEach(b => {
      b.style.transition = 'all 0.5s ease';
      const chatDiv = b.querySelector('.chat-container');
      if (chatDiv) {
        chatDiv.style.transition = 'all 0.3s ease';
      }
    });
  }, 100);
}

// 更新固定布局寬度控制面板的顯示狀態
function updateFixedLayoutWidthControl() {
  const widthControl = document.getElementById('fixed-layout-width-control');
  if (!widthControl) return;
  
  // 檢查是否為固定布局（檢查 userSelectedLayout 或是否存在固定布局容器）
  const chatSidebar = document.getElementById('chat-sidebar-fixed');
  const isFixed = isFixedLayout(userSelectedLayout) || (chatSidebar !== null);
  
  widthControl.style.display = isFixed ? 'block' : 'none';
  
  if (isFixed) {
    // 更新輸入框的值
    const chatWidthInput = document.getElementById('chat-width-input');
    if (chatWidthInput) {
      // 如果 userSelectedLayout 為 null，嘗試從 localStorage 加載
      let currentLayoutType = userSelectedLayout;
      if (!currentLayoutType) {
        try {
          const savedLayout = localStorage.getItem('currentLayout');
          if (savedLayout) {
            const layoutType = parseInt(savedLayout);
            if (isFixedLayout(layoutType)) {
              currentLayoutType = layoutType;
              userSelectedLayout = layoutType; // 更新 userSelectedLayout
            }
          }
        } catch (e) {
          console.error('Failed to load layout from localStorage:', e);
        }
      }
      
      // 如果還是沒有，使用默認值（Layout 13）
      if (!currentLayoutType) {
        currentLayoutType = 13;
      }
      
      let currentChatWidth = 30; // 默認值
      
      if (fixedLayoutWidthRatios[currentLayoutType] !== null) {
        currentChatWidth = fixedLayoutWidthRatios[currentLayoutType].chat;
      } else {
        const config = FIXED_LAYOUT_CONFIG[currentLayoutType];
        if (config) {
          currentChatWidth = config.chatAreaWidth;
        }
      }
      
      chatWidthInput.value = Math.round(currentChatWidth);
    }
  }
}

// 應用用戶輸入的聊天室寬度
function applyChatWidth() {
  const chatWidthInput = document.getElementById('chat-width-input');
  if (!chatWidthInput) return;
  
  // 檢查是否為固定布局
  if (!isFixedLayout(userSelectedLayout)) {
    return;
  }
  
  const chatWidth = parseFloat(chatWidthInput.value);
  
  // 驗證輸入值
  if (isNaN(chatWidth) || chatWidth < 10 || chatWidth > 80) {
    alert('請輸入 10-80 之間的數值');
    chatWidthInput.focus();
    return;
  }
  
  const currentLayoutType = userSelectedLayout;
  const videoWidth = 100 - chatWidth;
  
  // 保存調整後的寬度比例
  fixedLayoutWidthRatios[currentLayoutType] = {
    video: videoWidth,
    chat: chatWidth
  };
  
  // 保存到 localStorage
  try {
    localStorage.setItem('fixedLayoutWidthRatios', JSON.stringify(fixedLayoutWidthRatios));
  } catch (e) {
    console.error('Failed to save width ratios:', e);
  }
  
  // 更新布局（只更新寬度和位置，不重新創建容器）
  const boxes = document.querySelectorAll('.stream-box');
  const chatSidebar = document.getElementById('chat-sidebar-fixed');
  
  if (chatSidebar) {
    // 更新聊天室容器的位置和寬度
    chatSidebar.style.left = videoWidth + '%';
    chatSidebar.style.width = chatWidth + '%';
  }
  
  // 更新視頻框的寬度
  updateFixedLayoutFramework();
  
  // 更新控制面板顯示（確保輸入框值正確）
  updateFixedLayoutWidthControl();
}

// 響應式斷點配置
const RESPONSIVE_BREAKPOINTS = {
  large: 1600,  // 大視窗
  medium: 1200, // 中視窗
  small: 768    // 小視窗
};

// 根據視窗大小計算響應式寬度比例
function calculateResponsiveWidthRatios(layoutType) {
  const windowWidth = window.innerWidth;
  const config = FIXED_LAYOUT_CONFIG[layoutType];
  
  if (!config) {
    return null;
  }
  
  let videoAreaWidth = config.videoAreaWidth;
  let chatAreaWidth = config.chatAreaWidth;
  
  // 如果用戶有手動調整過，優先使用用戶調整的值
  if (fixedLayoutWidthRatios[layoutType] !== null) {
    videoAreaWidth = fixedLayoutWidthRatios[layoutType].video;
    chatAreaWidth = fixedLayoutWidthRatios[layoutType].chat;
  }
  
  // 根據視窗大小動態調整
  if (windowWidth < RESPONSIVE_BREAKPOINTS.small) {
    // 小視窗：調整為更適合的比例（60/40 或 65/35）
    if (layoutType === 13) {
      videoAreaWidth = 60;
      chatAreaWidth = 40;
    } else if (layoutType === 14) {
      videoAreaWidth = 65;
      chatAreaWidth = 35;
    } else if (layoutType === 15) {
      videoAreaWidth = 70;
      chatAreaWidth = 30;
    }
  } else if (windowWidth < RESPONSIVE_BREAKPOINTS.medium) {
    // 中視窗：微調比例
    if (layoutType === 13) {
      videoAreaWidth = 65;
      chatAreaWidth = 35;
    } else if (layoutType === 14) {
      videoAreaWidth = 68;
      chatAreaWidth = 32;
    } else if (layoutType === 15) {
      videoAreaWidth = 75;
      chatAreaWidth = 25;
    }
  }
  // 大視窗使用預設值或用戶調整的值
  
  // 確保最小寬度限制
  const minChatWidth = 15; // 聊天室最小寬度 15%
  const minVideoWidth = 50; // 視頻區域最小寬度 50%
  
  if (chatAreaWidth < minChatWidth) {
    chatAreaWidth = minChatWidth;
    videoAreaWidth = 100 - chatAreaWidth;
  }
  if (videoAreaWidth < minVideoWidth) {
    videoAreaWidth = minVideoWidth;
    chatAreaWidth = 100 - videoAreaWidth;
  }
  
  return {
    video: videoAreaWidth,
    chat: chatAreaWidth
  };
}

// 視窗大小改變時的處理函數（防抖）
let windowResizeTimeout = null;
function handleWindowResize() {
  // 清除之前的定時器
  if (windowResizeTimeout) {
    clearTimeout(windowResizeTimeout);
  }
  
  // 防抖：延遲 300ms 後執行
  windowResizeTimeout = setTimeout(() => {
    // 檢查是否為固定布局
    const chatSidebar = document.getElementById('chat-sidebar-fixed');
    if (!chatSidebar || !isFixedLayout(userSelectedLayout)) {
      return; // 不是固定布局，不需要調整
    }
    
    const layoutType = userSelectedLayout;
    const responsiveRatios = calculateResponsiveWidthRatios(layoutType);
    
    if (responsiveRatios) {
      // 更新布局框架（但不覆蓋用戶手動調整的值）
      // 只有在用戶沒有手動調整時才應用響應式調整
      if (fixedLayoutWidthRatios[layoutType] === null) {
        // 用戶沒有手動調整，應用響應式調整
        updateFixedLayoutFrameworkWithRatios(responsiveRatios);
      } else {
        // 用戶有手動調整，但還是要確保布局正確更新
        updateFixedLayoutFramework();
      }
    }
  }, 300);
}

// 使用指定比例更新固定布局框架
function updateFixedLayoutFrameworkWithRatios(ratios) {
  const chatSidebar = document.getElementById('chat-sidebar-fixed');
  if (!chatSidebar) return;
  
  const layoutType = userSelectedLayout;
  const config = FIXED_LAYOUT_CONFIG[layoutType];
  if (!config) return;
  
  // 更新聊天室容器的位置和寬度
  chatSidebar.style.left = ratios.video + '%';
  chatSidebar.style.width = ratios.chat + '%';
  
  // 更新視頻框的寬度
  const boxes = document.querySelectorAll('.stream-box');
  const videoAreaWidth = ratios.video;
  
  // 重新應用視頻布局
  boxes.forEach((b, i) => {
    b.style.position = 'absolute';
    b.style.right = 'auto';
    b.style.bottom = 'auto';
    
    const count = boxes.length;
    let videoLayoutType = layout13VideoLayout;
    if (videoLayoutType === null) {
      videoLayoutType = autoSelectLayout();
    }
    
    // 根據視頻布局類型應用樣式（與 updateFixedLayoutFramework 中的邏輯相同）
    if (videoLayoutType === 1 || count === 1) {
      b.style.width = videoAreaWidth + '%';
      b.style.height = '100%';
      b.style.left = '0';
      b.style.top = '0';
    } else if (videoLayoutType === 2) {
      b.style.width = (videoAreaWidth / count) + '%';
      b.style.height = '100%';
      b.style.left = (videoAreaWidth / count * i) + '%';
      b.style.top = '0';
    } else if (videoLayoutType === 3) {
      b.style.width = videoAreaWidth + '%';
      b.style.height = (100 / count) + '%';
      b.style.left = '0';
      b.style.top = (100 / count * i) + '%';
    } else if (videoLayoutType === 4) {
      const col = i % 2;
      const row = Math.floor(i / 2);
      b.style.width = (videoAreaWidth / 2) + '%';
      b.style.height = '50%';
      b.style.left = (col * videoAreaWidth / 2) + '%';
      b.style.top = (row * 50) + '%';
    } else if (videoLayoutType === 5) {
      if (i === 0) {
        b.style.width = videoAreaWidth + '%';
        b.style.height = '75%';
        b.style.left = '0';
        b.style.top = '0';
      } else if (i <= 3) {
        const bottomIndex = i - 1;
        b.style.width = (videoAreaWidth / 3) + '%';
        b.style.height = '25%';
        b.style.left = (bottomIndex * videoAreaWidth / 3) + '%';
        b.style.top = '75%';
      } else {
        const bottomIndex = (i - 1) % 3;
        const row = Math.floor((i - 1) / 3);
        b.style.width = (videoAreaWidth / 3) + '%';
        b.style.height = '25%';
        b.style.left = (bottomIndex * videoAreaWidth / 3) + '%';
        b.style.top = (75 + row * 25) + '%';
      }
    } else if (videoLayoutType === 6) {
      const cols = 3;
      const col = i % cols;
      const row = Math.floor(i / cols);
      b.style.width = (videoAreaWidth / cols) + '%';
      b.style.height = (100 / Math.ceil(count / cols)) + '%';
      b.style.left = (col * videoAreaWidth / cols) + '%';
      b.style.top = (row * 100 / Math.ceil(count / cols)) + '%';
    } else if (videoLayoutType === 9) {
      const cols = 3;
      const col = i % cols;
      const row = Math.floor(i / cols);
      b.style.width = (videoAreaWidth / cols) + '%';
      b.style.height = (100 / Math.ceil(count / cols)) + '%';
      b.style.left = (col * videoAreaWidth / cols) + '%';
      b.style.top = (row * 100 / Math.ceil(count / cols)) + '%';
    }
    
    // 隱藏視頻框內的聊天室
    const chatDiv = b.querySelector('.chat-container');
    if (chatDiv) {
      chatDiv.classList.add('hidden');
    }
  });
}

// 确保函数在全局作用域中可用
if (typeof window !== 'undefined') {
  window.setLayout = setLayout;
  window.autoSelectLayout = autoSelectLayout;
  window.setupFixedLayoutFramework = setupFixedLayoutFramework;
  window.updateFixedChatPanelContent = updateFixedChatPanelContent;
  window.updateFixedChatSidebarContent = updateFixedChatSidebarContent;
  window.updateFixedLayoutFramework = updateFixedLayoutFramework;
  window.cleanupFixedChatSidebar = cleanupFixedChatSidebar;
  window.setLayout13VideoLayout = setLayout13VideoLayout;
  window.applyChatWidth = applyChatWidth;
  window.updateFixedLayoutWidthControl = updateFixedLayoutWidthControl;
  
  // 頁面加載完成後初始化寬度控制面板
  function initChatWidthControl() {
    // 添加 Enter 鍵支持
    const chatWidthInput = document.getElementById('chat-width-input');
    if (chatWidthInput) {
      chatWidthInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          applyChatWidth();
        }
      });
    }
    
    // 檢查 localStorage 中是否有保存的布局
    try {
      const savedLayout = localStorage.getItem('currentLayout');
      if (savedLayout) {
        const layoutType = parseInt(savedLayout);
        if (isFixedLayout(layoutType)) {
          userSelectedLayout = layoutType;
        }
      }
    } catch (e) {
      console.error('Failed to load layout from localStorage:', e);
    }
    
    // 初始化控制面板顯示狀態
    updateFixedLayoutWidthControl();
  }
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(initChatWidthControl, 100);
    });
  } else {
    // DOM 已經加載完成
    setTimeout(initChatWidthControl, 100);
  }
  
  // 監聽視窗大小改變事件
  window.addEventListener('resize', handleWindowResize);
  
  // 頁面載入時執行一次響應式調整
  setTimeout(() => {
    handleWindowResize();
  }, 500);
}

