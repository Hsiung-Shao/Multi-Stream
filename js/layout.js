// 布局管理功能

// 用戶手動選擇的布局類型（用於防止自動布局覆蓋）
let userSelectedLayout = null;
let userLayoutTimeout = null;

// 固定布局中用户选择的聊天室ID（位置3和位置4）
let fixedLayoutChatSelection = {
  position3: null, // 左侧聊天室
  position4: null  // 右侧聊天室
};

// Layout 14 中用户选择的聊天室ID（四格：位置1-4）
let layout14ChatSelection = {
  position1: null, // 左上
  position2: null, // 右上
  position3: null, // 左下
  position4: null  // 右下
};

// Layout 13 中用户选择的视频布局类型（1-6 或 9）
let layout13VideoLayout = null;

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
  const videoAreaWidth = 70; // 70%
  const chatAreaWidth = 30; // 30%
  const count = boxes.length;
  
  // 清理之前的右侧聊天室容器（如果存在）
  cleanupFixedChatSidebar();
  
  // 检查当前是 Layout 13 还是 Layout 14（优先使用传入的参数，否则使用 userSelectedLayout）
  const isLayout14 = (layoutType === 14 || (!layoutType && userSelectedLayout === 14));
  
  // 布局视频在左侧（Layout 13 和 14 的视频布局会在 updateFixedLayoutFramework 中处理）
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
  chatSidebar.style.height = '100%';
  chatSidebar.style.left = videoAreaWidth + '%';
  chatSidebar.style.top = '0';
  chatSidebar.style.position = 'absolute';
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
  
  if (isLayout14) {
    // Layout 14：四格聊天室（2x2 网格）
    chatSidebar.style.display = 'flex';
    chatSidebar.style.flexDirection = 'column';
    chatSidebar.style.gap = '4px';
    chatSidebar.style.padding = '4px';
    chatSidebar.style.boxSizing = 'border-box';
    
    // 如果没有保存的选择，尝试从 Layout 13 的选择状态迁移，或使用前四个串流
    if (!layout14ChatSelection.position1) {
      // 尝试从 Layout 13 的 position3 迁移
      if (fixedLayoutChatSelection.position3 && streamData[fixedLayoutChatSelection.position3]) {
        layout14ChatSelection.position1 = fixedLayoutChatSelection.position3;
      } else if (allStreams.length > 0) {
        layout14ChatSelection.position1 = allStreams[0].id;
      }
    }
    if (!layout14ChatSelection.position2) {
      // 尝试从 Layout 13 的 position4 迁移
      if (fixedLayoutChatSelection.position4 && streamData[fixedLayoutChatSelection.position4]) {
        layout14ChatSelection.position2 = fixedLayoutChatSelection.position4;
      } else if (allStreams.length > 1) {
        layout14ChatSelection.position2 = allStreams[1].id;
      }
    }
    if (!layout14ChatSelection.position3 && allStreams.length > 2) {
      layout14ChatSelection.position3 = allStreams[2].id;
    }
    if (!layout14ChatSelection.position4 && allStreams.length > 3) {
      layout14ChatSelection.position4 = allStreams[3].id;
    }
    
    // 创建两行
    for (let row = 0; row < 2; row++) {
      const rowContainer = document.createElement('div');
      rowContainer.style.display = 'flex';
      rowContainer.style.flexDirection = 'row';
      rowContainer.style.gap = '4px';
      rowContainer.style.flex = '1';
      rowContainer.style.minHeight = '0';
      
      // 每行两个面板
      for (let col = 0; col < 2; col++) {
        const posIndex = row * 2 + col;
        const posKey = `position${posIndex + 1}`;
        const defaultId = layout14ChatSelection[posKey];
        
        const chatPanel = createChatPanel(posKey, defaultId, allStreams, 'layout14');
        chatPanel.style.width = '50%';
        chatPanel.style.height = '100%';
        rowContainer.appendChild(chatPanel);
      }
      
      chatSidebar.appendChild(rowContainer);
    }
  } else {
    // Layout 13：左右两个聊天室
    chatSidebar.style.display = 'flex';
    chatSidebar.style.flexDirection = 'row';
    chatSidebar.style.gap = '4px';
    chatSidebar.style.padding = '4px';
    chatSidebar.style.boxSizing = 'border-box';
    
    // 如果没有保存的选择，尝试从 Layout 14 的选择状态迁移，或使用前两个串流
    if (!fixedLayoutChatSelection.position3) {
      // 尝试从 Layout 14 的 position1 迁移
      if (layout14ChatSelection.position1 && streamData[layout14ChatSelection.position1]) {
        fixedLayoutChatSelection.position3 = layout14ChatSelection.position1;
      } else if (allStreams.length > 0) {
        fixedLayoutChatSelection.position3 = allStreams[0].id;
      }
    }
    if (!fixedLayoutChatSelection.position4) {
      // 尝试从 Layout 14 的 position2 迁移
      if (layout14ChatSelection.position2 && streamData[layout14ChatSelection.position2]) {
        fixedLayoutChatSelection.position4 = layout14ChatSelection.position2;
      } else if (allStreams.length > 1) {
        fixedLayoutChatSelection.position4 = allStreams[1].id;
      }
    }
    
    // 创建两个聊天室面板（位置3和位置4）
    const positions = [
      { key: 'position3', defaultId: fixedLayoutChatSelection.position3 },
      { key: 'position4', defaultId: fixedLayoutChatSelection.position4 }
    ];
    
    positions.forEach((pos, index) => {
      const chatPanel = createChatPanel(pos.key, pos.defaultId, allStreams, 'layout13');
      chatPanel.style.width = '50%';
      chatPanel.style.height = '100%';
      chatSidebar.appendChild(chatPanel);
      
      // 如果有选中的串流，延迟更新聊天室内容
      if (pos.defaultId && streamData[pos.defaultId]) {
        setTimeout(() => {
          updateFixedChatPanelContent(pos.key, pos.defaultId);
        }, 500 + (index * 200));
      }
    });
  }
  
  const container = document.getElementById('container');
  if (container) {
    container.appendChild(chatSidebar);
  }
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
    const isLayout14Current = (userSelectedLayout === 14);
    // 立即保存选择状态
    if (isLayout14Current) {
      layout14ChatSelection[posKey] = selectedId;
    } else {
      fixedLayoutChatSelection[posKey] = selectedId;
    }
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
  if (!chatSidebar) return; // 如果不在布局13，直接返回
  
  const boxes = document.querySelectorAll('.stream-box');
  const count = boxes.length;
  
  // Layout 13 和 14：视频自动布局（可通过布局按钮手动调整）
  const isLayout13 = (userSelectedLayout === 13);
  const isLayout14 = (userSelectedLayout === 14);
  
  // 如果是布局13或14，使用用户选择的视频布局类型（如果没有选择则自动选择）
  if (isLayout13 || isLayout14) {
    const videoAreaWidth = 70;
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
  } else {
    // 如果不是 Layout 13 或 14，不应该进入这个函数
    // 但为了安全，清空布局
    boxes.forEach((b) => {
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
  
  // 更新选择器的选项（Layout 13 有两个，Layout 14 有四个）
  const positions = isLayout14 ? ['position1', 'position2', 'position3', 'position4'] : ['position3', 'position4'];
  positions.forEach((posKey) => {
    const selector = document.getElementById(`chat-selector-${posKey}`);
    if (selector) {
      // 使用已保存的选择状态，而不是选择器的当前值（这样可以保留用户刚选择的新值）
      const savedSelection = isLayout14 ? layout14ChatSelection[posKey] : fixedLayoutChatSelection[posKey];
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
        if (isLayout14) {
          layout14ChatSelection[posKey] = selectedId;
        } else {
          fixedLayoutChatSelection[posKey] = selectedId;
        }
        // 始终更新内容，确保同步（即使值相同）
        updateFixedChatPanelContent(posKey, selectedId);
      } else {
        // 如果当前选中的串流不存在，清空选择
        if (selector.value !== '') {
          selector.value = '';
        }
        if (isLayout14) {
          layout14ChatSelection[posKey] = null;
        } else {
          fixedLayoutChatSelection[posKey] = null;
        }
        updateFixedChatPanelContent(posKey, null);
      }
    } else {
      // 如果选择器不存在，更新对应的聊天室内容
      const selectedId = isLayout14 ? layout14ChatSelection[posKey] : fixedLayoutChatSelection[posKey];
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

// 在 Layout 13 或 14 中设置左侧视频布局类型（只影响左侧视频区域，不影响右侧聊天室）
function setLayout13VideoLayout(videoLayoutType) {
  // 检查当前是否为 Layout 13 或 14
  const chatSidebar = document.getElementById('chat-sidebar-fixed');
  if (!chatSidebar || (userSelectedLayout !== 13 && userSelectedLayout !== 14)) {
    // 如果不是 Layout 13 或 14，直接返回，让正常的 setLayout 处理
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
  
  // 布局13和14需要预设框架，即使没有串流也要创建
  if (type === 13 || type === 14) {
    // 布局13：固定布局，视频自动布局，右侧两个聊天室
    // 布局14：固定布局，视频自动布局，右侧四个聊天室（2x2）
    // 先设置 userSelectedLayout，这样 setupFixedLayoutFramework 可以正确判断布局类型
    if (isUserSelection) {
      userSelectedLayout = type;
      localStorage.setItem('currentLayout', type);
      // 切换到 Layout 13 或 14 时，重置视频布局选择（让系统自动选择）
      layout13VideoLayout = null;
    }
    setupFixedLayoutFramework(boxes, type); // 传入布局类型
    updateFixedLayoutFramework(); // 立即更新内容
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
  const layoutMap = { 1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 9: 6, 13: 7, 14: 8 };
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
  
  // 如果切换到非布局类型 13，清理固定布局的聊天室容器
  if (type !== 13) {
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
  window.setLayout13VideoLayout = setLayout13VideoLayout;
}

