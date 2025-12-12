// 控制面板功能

// [已遷移到 React UI] 以下控制面板 DOM 操作已遷移到 React 組件 (src/components/ControlPanel.tsx)
// 但保留 updateStreamOrderList 和 toggleControlPanel 等可能被其他地方使用的函數

// 切換控制面板（確保是全局函數，立即定義）- 仍在使用，保留
function toggleControlPanel() {
  const panel = document.getElementById('control-panel');
  const toggleCollapsed = document.getElementById('control-panel-toggle-collapsed');
  
  if (!panel) {
    // 控制面板元素未找到
    return;
  }
  
  // 允許在任何情況下切換（包括沒有串流時）
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
  const isCollapsed = panel.classList.contains('collapsed');
  localStorage.setItem('controlPanelCollapsed', isCollapsed ? 'true' : 'false');
  
  // 自動保存設置
  if (typeof autoSaveSettings === 'function') {
    autoSaveSettings();
  }
}

// 確保函數是全局的
window.toggleControlPanel = toggleControlPanel;

// [已遷移到 React UI] 以下控制面板 DOM 操作已遷移到 React 組件
/*
// 檢查並調整控制面板狀態（根據串流數量）
function checkAndAdjustControlPanel() {
  const panel = document.getElementById('control-panel');
  const toggleCollapsed = document.getElementById('control-panel-toggle-collapsed');
  
  if (!panel) return;
  
  // 無論是否有串流，都使用用戶保存的設置
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

// 控制面板自動展開功能已移除（滑鼠靠近時自動展開功能）

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
        // 檢測到用戶手動選擇的布局，跳過自動布局切換
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
*/

// 更新串流順序列表（確保是全局函數）- 此函數仍在使用，保留
function updateStreamOrderList() {
  const orderList = document.getElementById('stream-order-list');
  if (!orderList) return;
  
  // 在函數開始時聲明一次 i18n，避免重複聲明
  const i18n = window.i18n || { t: (key) => key };
  
  const boxes = Array.from(document.querySelectorAll('.stream-box'));
  if (boxes.length === 0) {
    orderList.innerHTML = '';
    const emptyDiv = document.createElement('div');
    emptyDiv.style.cssText = 'padding: 10px; text-align: center; color: #888; font-size: 12px;';
    emptyDiv.textContent = i18n.t('noStreams');
    orderList.appendChild(emptyDiv);
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
    
    // 優先從收藏列表中獲取名稱（如果串流在收藏中）
    let label = '';
    // 使用 window.favoriteStreams 確保正確訪問全局對象
    const favoriteStreamsObj = window.favoriteStreams;
    if (favoriteStreamsObj && typeof favoriteStreamsObj.getList === 'function') {
      const favorites = favoriteStreamsObj.getList();
      // 根據 platform、channelId 或 videoId 匹配收藏
      const favorite = favorites.find(fav => {
        if (fav.platform === data.platform) {
          if (data.platform === 'twitch' && fav.channelId === data.channelId) {
            return true;
          } else if (data.platform === 'youtube') {
            // YouTube 可以通過 channelId 或 videoId 匹配
            if (fav.channelId && data.channelId && fav.channelId === data.channelId) {
              return true;
            } else if (fav.videoId && data.videoId && fav.videoId === data.videoId) {
              return true;
            } else if (fav.url && data.originalUrl && fav.url === data.originalUrl) {
              return true;
            }
          }
        }
        return false;
      });
      
      if (favorite && favorite.name) {
        label = escapeHtml(favorite.name);
      }
    }
    
    // 如果沒有收藏名稱，使用 streamData 中的 displayName 或 name
    if (!label) {
      if (data.displayName) {
        label = escapeHtml(data.displayName);
      } else if (data.name) {
        label = escapeHtml(data.name);
      }
    }
    
    // 如果還是沒有找到名稱，使用原來的邏輯
    if (!label) {
      label = data.platform === 'twitch' ? escapeHtml(data.channelId) : (data.platform === 'youtube' ? escapeHtml(data.videoId) : `串流 #${id}`);
    }
    
    const currentVolume = data.volume || 100;
    
    // 使用安全的 DOM 操作
    const header = document.createElement('div');
    header.className = 'stream-order-header';
    
    const handle = document.createElement('span');
    handle.className = 'stream-order-handle';
    handle.textContent = '☰';
    
    const labelSpan = document.createElement('span');
    labelSpan.className = 'stream-order-label';
    labelSpan.textContent = `#${index + 1} - ${label}`;
    
    const buttons = document.createElement('div');
    buttons.className = 'stream-order-buttons';
    
    const upBtn = document.createElement('button');
    upBtn.title = i18n.t('moveUp');
    upBtn.textContent = '↑';
    upBtn.onclick = () => moveStreamUp(id);
    
    const downBtn = document.createElement('button');
    downBtn.title = i18n.t('moveDown');
    downBtn.textContent = '↓';
    downBtn.onclick = () => moveStreamDown(id);
    
    buttons.appendChild(upBtn);
    buttons.appendChild(downBtn);
    
    header.appendChild(handle);
    header.appendChild(labelSpan);
    header.appendChild(buttons);
    
    const volumeDiv = document.createElement('div');
    volumeDiv.className = 'stream-order-volume';
    const volumeLabel = document.createElement('label');
    volumeLabel.htmlFor = `stream-volume-${id}`;
    volumeLabel.textContent = '🔊 ' + i18n.t('volume');
    
    const volumeSlider = document.createElement('input');
    volumeSlider.type = 'range';
    volumeSlider.id = `stream-volume-${id}`;
    volumeSlider.min = '0';
    volumeSlider.max = '100';
    volumeSlider.value = currentVolume.toString();
    volumeSlider.title = i18n.t('adjustVolume');
    
    const volumeValue = document.createElement('span');
    volumeValue.className = 'stream-order-volume-value';
    volumeValue.id = `stream-volume-value-${id}`;
    volumeValue.textContent = currentVolume + '%';
    
    volumeDiv.appendChild(volumeLabel);
    volumeDiv.appendChild(volumeSlider);
    volumeDiv.appendChild(volumeValue);
    
    item.appendChild(header);
    item.appendChild(volumeDiv);
    
    // 設定拖曳功能（只在標題行）
    const headerElement = item.querySelector('.stream-order-header');
    if (headerElement) {
      headerElement.draggable = true;
      headerElement.style.cursor = 'move';
      
      headerElement.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', id);
        item.classList.add('dragging');
        e.stopPropagation();
      });
      
      headerElement.addEventListener('dragend', () => {
        item.classList.remove('dragging');
      });
    }
    
    // 阻止音量區域觸發拖曳
    const volumeDivElement = item.querySelector('.stream-order-volume');
    if (volumeDivElement) {
      volumeDivElement.addEventListener('mousedown', (e) => {
        e.stopPropagation();
      });
      volumeDivElement.addEventListener('dragstart', (e) => {
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
    if (headerElement) {
      headerElement.addEventListener('dragover', (e) => {
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
              // 檢查當前是否是固定布局，如果是則保持固定布局
              if (typeof userSelectedLayout === 'number' && typeof isFixedLayout === 'function' && isFixedLayout(userSelectedLayout)) {
                // 保持當前固定布局
                setLayout(userSelectedLayout, true);
              } else {
                // 否則使用自動布局
                const layoutType = autoSelectLayout();
                setLayout(layoutType, true);
              }
              
              // 修復 Twitch 播放器在調整順序後卡住的問題
              // 使用更強力的刷新機制，多次觸發 resize 事件
              setTimeout(() => {
                const boxes = Array.from(document.querySelectorAll('.stream-box'));
                boxes.forEach(box => {
                  const id = parseInt(box.dataset.streamId);
                  if (players[id] && players[id].type === 'twitch' && players[id].player) {
                    try {
                      // 強制刷新 Twitch 播放器
                      const playerContainer = box.querySelector('.player-container');
                      if (playerContainer) {
                        // 多次觸發 resize 事件，確保播放器響應
                        const refreshPlayer = () => {
                          window.dispatchEvent(new Event('resize'));
                          // 強制重新計算容器尺寸
                          void playerContainer.offsetWidth;
                          void playerContainer.offsetHeight;
                        };
                        
                        // 立即觸發一次
                        refreshPlayer();
                        // 延遲觸發多次，確保播放器有時間響應
                        setTimeout(refreshPlayer, 50);
                        setTimeout(refreshPlayer, 150);
                        setTimeout(refreshPlayer, 300);
                      }
                    } catch (e) {
                      // 靜默處理錯誤
                    }
                  }
                });
              }, 100);
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
      // 檢查當前是否是固定布局，如果是則保持固定布局
      if (typeof userSelectedLayout === 'number' && typeof isFixedLayout === 'function' && isFixedLayout(userSelectedLayout)) {
        // 保持當前固定布局
        setLayout(userSelectedLayout, true);
      } else {
        // 否則使用自動布局
        const layoutType = autoSelectLayout();
        setLayout(layoutType, true);
      }
      
      // 修復 Twitch 播放器在調整順序後卡住的問題
      setTimeout(() => {
        const boxes = Array.from(document.querySelectorAll('.stream-box'));
        boxes.forEach(box => {
          const id = parseInt(box.dataset.streamId);
          if (players[id] && players[id].type === 'twitch' && players[id].player) {
            try {
              // 強制刷新 Twitch 播放器
              const playerContainer = box.querySelector('.player-container');
              if (playerContainer) {
                // 觸發 resize 事件讓播放器重新計算尺寸
                window.dispatchEvent(new Event('resize'));
                // 額外延遲確保播放器有時間響應
                setTimeout(() => {
                  window.dispatchEvent(new Event('resize'));
                }, 100);
              }
            } catch (e) {
              // 靜默處理錯誤
            }
          }
        });
      }, 100);
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
      // 檢查當前是否是固定布局，如果是則保持固定布局
      if (typeof userSelectedLayout === 'number' && typeof isFixedLayout === 'function' && isFixedLayout(userSelectedLayout)) {
        // 保持當前固定布局
        setLayout(userSelectedLayout, true);
      } else {
        // 否則使用自動布局
        const layoutType = autoSelectLayout();
        setLayout(layoutType, true);
      }
      
      // 修復 Twitch 播放器在調整順序後卡住的問題
      setTimeout(() => {
        const boxes = Array.from(document.querySelectorAll('.stream-box'));
        boxes.forEach(box => {
          const id = parseInt(box.dataset.streamId);
          if (players[id] && players[id].type === 'twitch' && players[id].player) {
            try {
              // 強制刷新 Twitch 播放器
              const playerContainer = box.querySelector('.player-container');
              if (playerContainer) {
                // 觸發 resize 事件讓播放器重新計算尺寸
                window.dispatchEvent(new Event('resize'));
                // 額外延遲確保播放器有時間響應
                setTimeout(() => {
                  window.dispatchEvent(new Event('resize'));
                }, 100);
              }
            } catch (e) {
              // 靜默處理錯誤
            }
          }
        });
      }, 100);
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
      // 檢查當前是否是固定布局，如果是則保持固定布局
      if (typeof userSelectedLayout === 'number' && typeof isFixedLayout === 'function' && isFixedLayout(userSelectedLayout)) {
        // 保持當前固定布局
        setLayout(userSelectedLayout, true);
      } else {
        // 否則使用自動布局
        const layoutType = autoSelectLayout();
        setLayout(layoutType, true);
      }
      
      // 修復 Twitch 播放器在調整順序後卡住的問題
      setTimeout(() => {
        const boxes = Array.from(document.querySelectorAll('.stream-box'));
        boxes.forEach(box => {
          const id = parseInt(box.dataset.streamId);
          if (players[id] && players[id].type === 'twitch' && players[id].player) {
            try {
              // 強制刷新 Twitch 播放器
              const playerContainer = box.querySelector('.player-container');
              if (playerContainer) {
                // 觸發 resize 事件讓播放器重新計算尺寸
                window.dispatchEvent(new Event('resize'));
                // 額外延遲確保播放器有時間響應
                setTimeout(() => {
                  window.dispatchEvent(new Event('resize'));
                }, 100);
              }
            } catch (e) {
              // 靜默處理錯誤
            }
          }
        });
      }, 100);
    }, 50);
  }
}

// 更新所有聊天室按鈕的狀態
function updateAllChatsButton() {
  const btn = document.getElementById('toggle-all-chats-btn');
  if (!btn) return;
  
  const i18n = window.i18n || { t: (key) => key };
  const boxes = document.querySelectorAll('.stream-box');
  if (boxes.length === 0) {
    btn.textContent = '💬 ' + i18n.t('showAllChats');
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
    btn.textContent = '💬 ' + i18n.t('hideAllChats');
  } else {
    btn.textContent = '💬 ' + i18n.t('showAllChats');
  }
}

// 切換所有聊天室的顯示/隱藏
function toggleAllChats() {
  const boxes = document.querySelectorAll('.stream-box');
  if (boxes.length === 0) {
    const i18n = window.i18n || { t: (key) => key };
    alert(i18n.t('noStreams'));
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

// 確保函數是全局的（立即暴露，不等待 DOM）
if (typeof window !== 'undefined') {
  window.updateStreamOrderList = updateStreamOrderList;
  window.toggleAllChats = toggleAllChats;
  window.updateAllChatsButton = updateAllChatsButton;
  // window.toggleControlPanel = toggleControlPanel; // 已在文件開頭導出（第 39 行），無需重複
  
  // 監聽收藏更新事件，自動更新串流順序列表
  window.addEventListener('favoritesUpdated', (event) => {
    console.log('[control-panel.js] 收到 favoritesUpdated 事件，更新串流順序列表', {
      detail: event.detail,
      updateStreamOrderListExists: typeof updateStreamOrderList === 'function',
      favoriteStreamsExists: typeof window.favoriteStreams !== 'undefined'
    });
    if (typeof updateStreamOrderList === 'function') {
      // 使用 setTimeout 確保 DOM 和 localStorage 更新完成後再更新列表
      // 增加延遲時間，確保收藏系統的 saveList 已完成
      setTimeout(() => {
        console.log('[control-panel.js] 開始更新串流順序列表');
        updateStreamOrderList();
        console.log('[control-panel.js] 串流順序列表已更新');
      }, 50);
    } else {
      console.warn('[control-panel.js] updateStreamOrderList 函數不存在');
    }
  });
}

