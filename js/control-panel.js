// 控制面板功能

// 檢查並調整控制面板狀態（根據串流數量）
function checkAndAdjustControlPanel() {
  const panel = document.getElementById('control-panel');
  const toggleCollapsed = document.getElementById('control-panel-toggle-collapsed');
  
  if (!panel) return;
  
  // 檢查是否有串流
  const hasStreams = document.querySelectorAll('.stream-box').length > 0;
  
  // 如果沒有任何串流，強制展開（優先於用戶設置）
  if (!hasStreams) {
    panel.classList.remove('collapsed');
    if (toggleCollapsed) {
      toggleCollapsed.style.display = 'none';
    }
  } else {
    // 有串流時，使用用戶保存的設置
    const savedState = localStorage.getItem('controlPanelCollapsed');
    if (savedState === 'true') {
      panel.classList.add('collapsed');
      if (toggleCollapsed) {
        toggleCollapsed.style.display = 'block';
      }
    } else {
      panel.classList.remove('collapsed');
      if (toggleCollapsed) {
        toggleCollapsed.style.display = 'none';
      }
    }
  }
}

// 切換控制面板
function toggleControlPanel() {
  const panel = document.getElementById('control-panel');
  const toggleCollapsed = document.getElementById('control-panel-toggle-collapsed');
  
  // 檢查是否有串流，如果沒有串流則不允許收起
  const hasStreams = document.querySelectorAll('.stream-box').length > 0;
  
  if (!hasStreams) {
    // 沒有串流時，強制展開，不允許收起
    panel.classList.remove('collapsed');
    if (toggleCollapsed) {
      toggleCollapsed.style.display = 'none';
    }
    return;
  }
  
  panel.classList.toggle('collapsed');
  
  // 更新收起按钮的显示状态
  if (toggleCollapsed) {
    if (panel.classList.contains('collapsed')) {
      toggleCollapsed.style.display = 'block';
    } else {
      toggleCollapsed.style.display = 'none';
    }
  }
  
  // 儲存狀態
  localStorage.setItem('controlPanelCollapsed', panel.classList.contains('collapsed'));
  
  // 自動保存設置
  if (typeof autoSaveSettings === 'function') {
    autoSaveSettings();
  }
}

// 使控制面板可拖曳
function makeControlPanelDraggable() {
  const panel = document.getElementById('control-panel');
  const header = document.getElementById('control-panel-header');
  const title = header?.querySelector('.control-panel-title');
  
  if (!panel || !header) return;
  
  let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
  let isDragging = false;
  
  header.onmousedown = dragMouseDown;
  
  function dragMouseDown(e) {
    // 如果點擊的是標題文字或切換按鈕，不拖曳（允許展開/收起）
    if (e.target.closest('.control-panel-title') || e.target.closest('.control-panel-toggle')) {
      return;
    }
    
    e.preventDefault();
    isDragging = true;
    pos3 = e.clientX;
    pos4 = e.clientY;
    header.classList.add('dragging');
    document.onmouseup = closeDrag;
    document.onmousemove = elementDrag;
    panel.style.transition = 'none'; // 拖曳時禁用過渡
  }
  
  function elementDrag(e) {
    if (!isDragging) return;
    e.preventDefault();
    pos1 = pos3 - e.clientX;
    pos2 = pos4 - e.clientY;
    pos3 = e.clientX;
    pos4 = e.clientY;
    
    let newTop = panel.offsetTop - pos2;
    let newLeft = panel.offsetLeft - pos1;
    
    // 限制在視窗範圍內
    newTop = Math.max(0, Math.min(newTop, window.innerHeight - 50));
    newLeft = Math.max(0, Math.min(newLeft, window.innerWidth - 200));
    
    panel.style.top = newTop + 'px';
    panel.style.left = newLeft + 'px';
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
    
    // 檢查是否需要邊緣吸附（拖曳時即時檢查，但不立即吸附）
    checkSnapToEdge(panel, newLeft, newTop, false);
  }
  
  function closeDrag() {
    if (!isDragging) return;
    isDragging = false;
    header.classList.remove('dragging');
    
    const panel = document.getElementById('control-panel');
    const currentLeft = panel.offsetLeft;
    const currentTop = panel.offsetTop;
    
    // 拖曳結束時執行邊緣吸附
    checkSnapToEdge(panel, currentLeft, currentTop, true);
    
    panel.style.transition = 'all 0.3s ease';
    document.onmouseup = null;
    document.onmousemove = null;
    
    // 儲存位置和吸附狀態
    const snappedLeft = panel.classList.contains('snapped-left');
    const snappedRight = panel.classList.contains('snapped-right');
    const snappedTop = panel.classList.contains('snapped-top');
    const snappedBottom = panel.classList.contains('snapped-bottom');
    
    localStorage.setItem('controlPanelPosition', JSON.stringify({
      top: panel.style.top,
      left: panel.style.left,
      right: panel.style.right,
      bottom: panel.style.bottom,
      snappedLeft,
      snappedRight,
      snappedTop,
      snappedBottom
    }));
    
    // 根據位置調整顯示方式
    adjustPanelLayout(panel);
  }
  
  // 邊緣吸附功能
  function checkSnapToEdge(panel, left, top, shouldSnap) {
    const snapThreshold = 30; // 吸附閾值（像素）
    const panelWidth = panel.offsetWidth;
    const panelHeight = panel.offsetHeight;
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
    
    // 清除之前的吸附狀態
    panel.classList.remove('snapped-left', 'snapped-right', 'snapped-top', 'snapped-bottom');
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
    
    // 檢查左邊緣
    if (left <= snapThreshold) {
      if (shouldSnap) {
        panel.style.left = '0';
        panel.classList.add('snapped-left');
      }
    }
    // 檢查右邊緣
    else if (left + panelWidth >= windowWidth - snapThreshold) {
      if (shouldSnap) {
        panel.style.left = 'auto';
        panel.style.right = '0';
        panel.classList.add('snapped-right');
      }
    }
    
    // 檢查上邊緣
    if (top <= snapThreshold) {
      if (shouldSnap) {
        panel.style.top = '0';
        panel.classList.add('snapped-top');
      }
    }
    // 檢查下邊緣
    else if (top + panelHeight >= windowHeight - snapThreshold) {
      if (shouldSnap) {
        panel.style.top = 'auto';
        panel.style.bottom = '0';
        panel.classList.add('snapped-bottom');
      }
    }
  }
  
  // 根據位置調整控制面板顯示方式
  function adjustPanelLayout(panel) {
    const isOnLeft = panel.classList.contains('snapped-left') || 
                     (!panel.classList.contains('snapped-right') && 
                      (panel.offsetLeft || 0) < window.innerWidth / 2);
    
    // 如果貼在右邊，可以調整內容排列方式（如果需要）
    if (panel.classList.contains('snapped-right')) {
      panel.classList.add('panel-right-side');
      panel.classList.remove('panel-left-side');
    } else {
      panel.classList.add('panel-left-side');
      panel.classList.remove('panel-right-side');
    }
  }
  
  // 視窗大小改變時重新檢查吸附狀態和自動調整布局
  let resizeTimeout;
  window.addEventListener('resize', () => {
    const panel = document.getElementById('control-panel');
    if (panel) {
      const currentLeft = panel.offsetLeft;
      const currentTop = panel.offsetTop;
      
      // 如果已經吸附，確保仍然吸附在邊緣
      if (panel.classList.contains('snapped-left') || 
          panel.classList.contains('snapped-right') ||
          panel.classList.contains('snapped-top') ||
          panel.classList.contains('snapped-bottom')) {
        checkSnapToEdge(panel, currentLeft, currentTop, true);
      }
    }
    
    // 使用防抖來避免頻繁觸發布局調整
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      // 檢查是否有用戶手動選擇的布局，如果有則不自動切換
      if (typeof userSelectedLayout === 'number' && userSelectedLayout !== null) {
        console.log('resize: 檢測到用戶手動選擇的布局', userSelectedLayout, '，跳過自動布局切換');
        return;
      }
      const boxes = document.querySelectorAll('.stream-box');
      if (boxes.length > 0) {
        const layoutType = autoSelectLayout();
        setLayout(layoutType);
      }
    }, 300); // 300ms 防抖延遲
  });
}

// 更新串流順序列表
function updateStreamOrderList() {
  const orderList = document.getElementById('stream-order-list');
  if (!orderList) return;
  
  const boxes = Array.from(document.querySelectorAll('.stream-box'));
  if (boxes.length === 0) {
    orderList.innerHTML = '<div style="padding: 10px; text-align: center; color: #888; font-size: 12px;">暫無串流</div>';
    return;
  }
  
  orderList.innerHTML = '';
  
  boxes.forEach((box, index) => {
    const id = parseInt(box.dataset.streamId);
    const data = streamData[id];
    if (!data) return;
    
    const item = document.createElement('div');
    item.className = 'stream-order-item';
    item.dataset.streamId = id;
    item.draggable = false; // 預設不可拖曳，只有標題行可拖曳
    
    const label = data.platform === 'twitch' ? data.channelId : (data.platform === 'youtube' ? data.videoId : `串流 #${id}`);
    const currentVolume = data.volume || 100;
    
    item.innerHTML = `
      <div class="stream-order-header">
        <span class="stream-order-handle">☰</span>
        <span class="stream-order-label">#${index + 1} - ${label}</span>
        <div class="stream-order-buttons">
          <button onclick="moveStreamUp(${id})" title="上移">↑</button>
          <button onclick="moveStreamDown(${id})" title="下移">↓</button>
        </div>
      </div>
      <div class="stream-order-volume">
        <label for="stream-volume-${id}">🔊 音量</label>
        <input type="range" id="stream-volume-${id}" min="0" max="100" value="${currentVolume}" title="調整音量">
        <span class="stream-order-volume-value" id="stream-volume-value-${id}">${currentVolume}%</span>
      </div>
    `;
    
    // 設定拖曳功能（只在標題行）
    const header = item.querySelector('.stream-order-header');
    if (header) {
      header.draggable = true;
      header.style.cursor = 'move';
      
      header.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', id);
        item.classList.add('dragging');
        e.stopPropagation();
      });
      
      header.addEventListener('dragend', () => {
        item.classList.remove('dragging');
      });
    }
    
    // 阻止音量區域觸發拖曳
    const volumeDiv = item.querySelector('.stream-order-volume');
    if (volumeDiv) {
      volumeDiv.addEventListener('mousedown', (e) => {
        e.stopPropagation();
      });
      volumeDiv.addEventListener('dragstart', (e) => {
        e.preventDefault();
        e.stopPropagation();
      });
    }
    
    // 設定音量控制
    const volSlider = item.querySelector(`#stream-volume-${id}`);
    const volValue = item.querySelector(`#stream-volume-value-${id}`);
    
    if (volSlider && volValue) {
      // 阻止音量滑桿觸發拖曳
      volSlider.addEventListener('mousedown', (e) => {
        e.stopPropagation();
      });
      volSlider.addEventListener('dragstart', (e) => {
        e.preventDefault();
        e.stopPropagation();
      });
      
      volSlider.addEventListener('input', () => {
        const vol = parseInt(volSlider.value);
        volValue.textContent = vol + '%';
        streamData[id].volume = vol;
        
        // 更新串流視窗中的音量顯示
        const box = document.getElementById('box' + id);
        if (box) {
          const boxVolSlider = box.querySelector('.volume');
          const boxVolValue = box.querySelector('.vol-value');
          if (boxVolSlider && boxVolValue) {
            boxVolSlider.value = vol;
            boxVolValue.textContent = vol + '%';
          }
        }
        
        // 使用統一的函數應用總音量
        if (typeof applyMasterVolumeToStream === 'function') {
          applyMasterVolumeToStream(id);
        }
      });
    }
    
    // 拖曳功能（只在標題行）
    if (header) {
      header.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const dragging = document.querySelector('.stream-order-item.dragging');
        if (dragging && dragging !== item) {
          const allItems = Array.from(orderList.querySelectorAll('.stream-order-item'));
          const draggingIndex = allItems.indexOf(dragging);
          const currentIndex = allItems.indexOf(item);
          
          if (draggingIndex < currentIndex) {
            orderList.insertBefore(dragging, item.nextSibling);
          } else {
            orderList.insertBefore(dragging, item);
          }
        }
      });
      
      header.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const draggedId = parseInt(e.dataTransfer.getData('text/plain'));
        const targetId = parseInt(item.dataset.streamId);
        
        if (draggedId !== targetId) {
          // 先更新 DOM 順序
          const boxes = Array.from(document.querySelectorAll('.stream-box'));
          const draggedBox = boxes.find(b => parseInt(b.dataset.streamId) === draggedId);
          const targetBox = boxes.find(b => parseInt(b.dataset.streamId) === targetId);
          
          if (draggedBox && targetBox) {
            container.insertBefore(draggedBox, targetBox);
            updateStreamOrderList();
            
            // 重新應用布局（使用immediate=true，因為已經在事件處理中）
            // 增加小延遲確保DOM變化完成
            setTimeout(() => {
              const layoutType = autoSelectLayout();
              setLayout(layoutType, true);
            }, 50);
          }
        }
      });
    }
    
    orderList.appendChild(item);
  });
  
  // 更新所有聊天室按鈕狀態
  updateAllChatsButton();
}

// 移動串流順序
function moveStreamUp(id) {
  const boxes = Array.from(document.querySelectorAll('.stream-box'));
  const currentIndex = boxes.findIndex(b => parseInt(b.dataset.streamId) === id);
  
  if (currentIndex > 0) {
    const currentBox = boxes[currentIndex];
    const prevBox = boxes[currentIndex - 1];
    
    // 交換 DOM 順序
    container.insertBefore(currentBox, prevBox);
    updateStreamOrderList();
    
    // 重新應用布局（增加小延遲確保DOM變化完成）
    setTimeout(() => {
      const layoutType = autoSelectLayout();
      setLayout(layoutType, true);
    }, 50);
  }
}

function moveStreamDown(id) {
  const boxes = Array.from(document.querySelectorAll('.stream-box'));
  const currentIndex = boxes.findIndex(b => parseInt(b.dataset.streamId) === id);
  
  if (currentIndex < boxes.length - 1) {
    const currentBox = boxes[currentIndex];
    const nextBox = boxes[currentIndex + 1];
    
    // 交換 DOM 順序
    container.insertBefore(nextBox, currentBox);
    updateStreamOrderList();
    
    // 重新應用布局（增加小延遲確保DOM變化完成）
    setTimeout(() => {
      const layoutType = autoSelectLayout();
      setLayout(layoutType, true);
    }, 50);
  }
}

// 重新排序串流（拖曳）
function reorderStreams(draggedId, targetId) {
  const boxes = Array.from(document.querySelectorAll('.stream-box'));
  const draggedBox = boxes.find(b => parseInt(b.dataset.streamId) === draggedId);
  const targetBox = boxes.find(b => parseInt(b.dataset.streamId) === targetId);
  
  if (draggedBox && targetBox) {
    container.insertBefore(draggedBox, targetBox);
    updateStreamOrderList();
    
    // 重新應用布局（增加小延遲確保DOM變化完成）
    setTimeout(() => {
      const layoutType = autoSelectLayout();
      setLayout(layoutType, true);
    }, 50);
  }
}

// 更新所有聊天室按鈕的狀態
function updateAllChatsButton() {
  const btn = document.getElementById('toggle-all-chats-btn');
  if (!btn) return;
  
  const boxes = document.querySelectorAll('.stream-box');
  if (boxes.length === 0) {
    btn.textContent = '💬 顯示所有聊天室';
    return;
  }
  
  // 統計當前可見的聊天室數量
  let visibleCount = 0;
  boxes.forEach(box => {
    const id = parseInt(box.dataset.streamId);
    const chatDiv = document.getElementById('chat' + id);
    if (chatDiv && !chatDiv.classList.contains('hidden')) {
      visibleCount++;
    }
  });
  
  // 更新按鈕文字
  if (visibleCount > boxes.length / 2) {
    btn.textContent = '💬 隱藏所有聊天室';
  } else {
    btn.textContent = '💬 顯示所有聊天室';
  }
}

// 切換所有聊天室的顯示/隱藏
function toggleAllChats() {
  const boxes = document.querySelectorAll('.stream-box');
  if (boxes.length === 0) {
    alert('目前沒有串流');
    return;
  }
  
  // 統計當前可見的聊天室數量
  let visibleCount = 0;
  boxes.forEach(box => {
    const id = parseInt(box.dataset.streamId);
    const chatDiv = document.getElementById('chat' + id);
    if (chatDiv && !chatDiv.classList.contains('hidden')) {
      visibleCount++;
    }
  });
  
  // 如果大部分聊天室是可見的，則隱藏所有；否則顯示所有
  const shouldHide = visibleCount > boxes.length / 2;
  
  boxes.forEach(box => {
    const id = parseInt(box.dataset.streamId);
    const chatDiv = document.getElementById('chat' + id);
    const resizer = document.getElementById('chat-resizer' + id);
    
    if (chatDiv) {
      if (shouldHide) {
        // 隱藏聊天室
        chatDiv.classList.add('hidden');
        if (resizer) {
          resizer.style.display = 'none';
        }
        if (streamData[id]) {
          streamData[id].chatVisible = false;
        }
      } else {
        // 顯示聊天室
        chatDiv.classList.remove('hidden');
        if (resizer) {
          resizer.style.display = '';
        }
        if (streamData[id]) {
          streamData[id].chatVisible = true;
        }
      }
    }
  });
  
  // 更新按鈕文字
  updateAllChatsButton();
  
  // 自動保存設置
  if (typeof autoSaveSettings === 'function') {
    autoSaveSettings();
  }
}

