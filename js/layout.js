// 布局管理功能

// 用戶手動選擇的布局類型（用於防止自動布局覆蓋）
let userSelectedLayout = null;
let userLayoutTimeout = null;

// 固定布局中用户选择的聊天室ID（位置3和位置4）
let fixedLayoutChatSelection = {
  position3: null, // 左侧聊天室
  position4: null  // 右侧聊天室
};

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
  } else if (layoutType === 12) {
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
function setupFixedLayoutFramework(boxes) {
  const videoAreaWidth = 70; // 70%
  const chatAreaWidth = 30; // 30%
  const count = boxes.length;
  
  // 清理之前的右侧聊天室容器（如果存在）
  cleanupFixedChatSidebar();
  
  // 布局视频在左侧（上下排列，位置1、2）
  boxes.forEach((b, i) => {
    const id = parseInt(b.dataset.streamId);
    b.style.position = 'absolute';
    b.style.width = videoAreaWidth + '%';
    b.style.height = count > 0 ? (100 / count) + '%' : '50%';
    b.style.left = '0';
    b.style.top = count > 0 ? (100 / count * i) + '%' : (i * 50) + '%';
    b.style.right = 'auto';
    b.style.bottom = 'auto';
    
    // 隐藏视频框内的聊天室
    const chatDiv = b.querySelector('.chat-container');
    if (chatDiv) {
      chatDiv.classList.add('hidden');
    }
  });
  
  // 创建右侧聊天室容器（左右排列，位置3、4）
  const chatSidebar = document.createElement('div');
  chatSidebar.id = 'chat-sidebar-fixed';
  chatSidebar.className = 'chat-sidebar-fixed';
  chatSidebar.style.width = chatAreaWidth + '%';
  chatSidebar.style.height = '100%';
  chatSidebar.style.left = videoAreaWidth + '%';
  chatSidebar.style.top = '0';
  chatSidebar.style.position = 'absolute';
  chatSidebar.style.display = 'flex';
  chatSidebar.style.flexDirection = 'row';
  chatSidebar.style.gap = '4px';
  chatSidebar.style.padding = '4px';
  chatSidebar.style.boxSizing = 'border-box';
  chatSidebar.style.background = '#0a0a0a';
  chatSidebar.style.borderLeft = '2px solid #333';
  
  // 获取所有串流用于选择器
  const allStreams = [];
  boxes.forEach((b) => {
    const id = parseInt(b.dataset.streamId);
    const data = streamData[id];
    if (data) {
      allStreams.push({ id, data, box: b });
    }
  });
  
  // 如果没有保存的选择，默认使用前两个串流
  if (!fixedLayoutChatSelection.position3 && allStreams.length > 0) {
    fixedLayoutChatSelection.position3 = allStreams[0].id;
  }
  if (!fixedLayoutChatSelection.position4 && allStreams.length > 1) {
    fixedLayoutChatSelection.position4 = allStreams[1].id;
  }
  
  // 创建两个聊天室面板（位置3和位置4）
  const positions = [
    { key: 'position3', defaultId: fixedLayoutChatSelection.position3 },
    { key: 'position4', defaultId: fixedLayoutChatSelection.position4 }
  ];
  
  positions.forEach((pos, index) => {
    const chatPanel = document.createElement('div');
    chatPanel.className = 'chat-sidebar-panel';
    chatPanel.id = `chat-panel-fixed-${pos.key}`;
    chatPanel.style.width = '50%';
    chatPanel.style.height = '100%';
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
    chatSelector.id = `chat-selector-${pos.key}`;
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
    if (pos.defaultId && streamData[pos.defaultId]) {
      chatSelector.value = pos.defaultId;
    }
    
    // 监听选择器变化
    chatSelector.addEventListener('change', function() {
      const selectedId = parseInt(this.value);
      fixedLayoutChatSelection[pos.key] = selectedId || null;
      updateFixedChatPanelContent(pos.key, selectedId);
    });
    
    chatHeader.appendChild(chatSelector);
    chatPanel.appendChild(chatHeader);
    
    // 创建内容区域
    const chatContent = document.createElement('div');
    chatContent.className = 'chat-sidebar-content';
    chatContent.id = `chat-content-fixed-${pos.key}`;
    chatContent.style.flex = '1';
    chatContent.style.position = 'relative';
    chatContent.style.overflow = 'hidden';
    chatPanel.appendChild(chatContent);
    
    chatSidebar.appendChild(chatPanel);
    
    // 如果有选中的串流，延迟更新聊天室内容
    if (pos.defaultId && streamData[pos.defaultId]) {
      setTimeout(() => {
        updateFixedChatPanelContent(pos.key, pos.defaultId);
      }, 500 + (index * 200));
    }
  });
  
  const container = document.getElementById('container');
  if (container) {
    container.appendChild(chatSidebar);
  }
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
            chatContent.appendChild(newIframe);
          } else {
            // 如果没有 iframe，复制整个内容（可能是 YouTube 替代方案）
            const content = newlyCreatedChatDiv.cloneNode(true);
            content.classList.remove('hidden');
            content.style.cssText = 'width: 100%; height: 100%;';
            chatContent.appendChild(content);
          }
        }
      }, 1000);
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
    
    // 如果 iframe 还没加载，等待一下再重试
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
    }, 500);
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
      }, 1000);
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
  if (!chatSidebar) return; // 如果不在布局12，直接返回
  
  const boxes = document.querySelectorAll('.stream-box');
  const count = boxes.length;
  
  // 更新左侧视频布局
  boxes.forEach((b, i) => {
    const id = parseInt(b.dataset.streamId);
    b.style.position = 'absolute';
    b.style.width = '70%';
    b.style.height = count > 0 ? (100 / count) + '%' : '50%';
    b.style.left = '0';
    b.style.top = count > 0 ? (100 / count * i) + '%' : (i * 50) + '%';
    b.style.right = 'auto';
    b.style.bottom = 'auto';
    
    // 隐藏视频框内的聊天室
    const chatDiv = b.querySelector('.chat-container');
    if (chatDiv) {
      chatDiv.classList.add('hidden');
    }
  });
  
  // 获取所有串流用于更新选择器
  const allStreams = [];
  boxes.forEach((b) => {
    const id = parseInt(b.dataset.streamId);
    const data = streamData[id];
    if (data) {
      allStreams.push({ id, data, box: b });
    }
  });
  
  // 更新两个选择器的选项
  const positions = ['position3', 'position4'];
  positions.forEach((posKey) => {
    const selector = document.getElementById(`chat-selector-${posKey}`);
    if (selector) {
      // 保存当前选中的值
      const currentValue = selector.value;
      
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
      
      // 恢复选中的值（如果仍然有效）
      if (currentValue && streamData[parseInt(currentValue)]) {
        selector.value = currentValue;
      } else {
        // 如果当前选中的串流不存在，清空选择
        selector.value = '';
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
}

// 清理固定布局的聊天室容器
function cleanupFixedChatSidebar() {
  const chatSidebar = document.getElementById('chat-sidebar-fixed');
  if (chatSidebar) {
    chatSidebar.remove();
  }
}

function setLayout(type, immediate = false, isUserSelection = false) {
  const boxes = document.querySelectorAll('.stream-box');
  const count = boxes.length;
  
  // 布局12需要预设框架，即使没有串流也要创建
  if (type === 12) {
    // 布局12：固定布局，即使没有串流也创建框架
    setupFixedLayoutFramework(boxes);
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
  const layoutMap = { 1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 9: 6 };
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
  
  // 如果切换到非布局类型 12，清理固定布局的聊天室容器
  if (type !== 12) {
    cleanupFixedChatSidebar();
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

// 确保函数在全局作用域中可用
if (typeof window !== 'undefined') {
  window.setLayout = setLayout;
  window.autoSelectLayout = autoSelectLayout;
  window.setupFixedLayoutFramework = setupFixedLayoutFramework;
  window.updateFixedChatPanelContent = updateFixedChatPanelContent;
  window.updateFixedChatSidebarContent = updateFixedChatSidebarContent;
  window.updateFixedLayoutFramework = updateFixedLayoutFramework;
  window.cleanupFixedChatSidebar = cleanupFixedChatSidebar;
}

