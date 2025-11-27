// 布局管理功能

// 用戶手動選擇的布局類型（用於防止自動布局覆蓋）
let userSelectedLayout = null;
let userLayoutTimeout = null;

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

function setLayout(type, immediate = false, isUserSelection = false) {
  const boxes = document.querySelectorAll('.stream-box');
  if (boxes.length === 0) {
    console.log('setLayout: 沒有串流，跳過布局切換');
    return;
  }
  
  console.log('setLayout: 切換到布局類型', type, 'immediate:', immediate, 'isUserSelection:', isUserSelection, '串流數量:', boxes.length);
  
  // 如果是用戶手動選擇，記錄並設置保護時間
  if (isUserSelection) {
    userSelectedLayout = type;
    console.log('setLayout: 記錄用戶手動選擇的布局:', type);
    // 清除之前的超時
    if (userLayoutTimeout) {
      clearTimeout(userLayoutTimeout);
    }
    // 5秒後清除用戶選擇標記，允許自動布局
    userLayoutTimeout = setTimeout(() => {
      userSelectedLayout = null;
      console.log('setLayout: 用戶選擇保護已過期，允許自動布局');
    }, 5000);
  }
  
  // 如果正在拖拽stream-box，不執行布局更新，避免干擾拖拽操作
  if (isDraggingStreamBox) {
    console.log('setLayout: 正在拖拽，跳過布局切換');
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
  console.log('setLayout: 更新布局預覽活動狀態，布局類型:', type);
  document.querySelectorAll('.layout-preview-inline').forEach(preview => {
    preview.classList.remove('active');
  });
  // 根據布局類型設置對應的預覽為活動狀態
  const layoutMap = { 1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 9: 6 };
  const previewIndex = layoutMap[type];
  console.log('setLayout: 布局映射索引:', previewIndex, '布局類型:', type);
  if (previewIndex !== undefined) {
    const previews = document.querySelectorAll('.layout-preview-inline');
    console.log('setLayout: 找到', previews.length, '個布局預覽按鈕');
    if (previews[previewIndex]) {
      previews[previewIndex].classList.add('active');
      console.log('setLayout: 已設置布局預覽按鈕為活動狀態，索引:', previewIndex);
    } else {
      console.warn('setLayout: 找不到對應的布局預覽按鈕，索引:', previewIndex);
    }
  } else {
    console.warn('setLayout: 布局類型', type, '不在映射表中');
  }
  
  // 暫時禁用過渡效果，避免Twitch播放器在動畫過程中出現問題
  boxes.forEach(b => { 
    b.style.transition = 'none';
  });
  
  const count = boxes.length;
  
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
    console.log('setLayout: 開始應用上大下三布局，串流數量:', boxes.length);
    let appliedCount = 0;
    boxes.forEach((b, i) => {
      console.log('setLayout: 處理串流', i, 'box:', b);
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
      console.log('setLayout: 已應用布局到串流', i, '位置:', b.style.left, b.style.top, '尺寸:', b.style.width, b.style.height);
    });
    console.log('setLayout: 上大下三布局應用完成，共處理', appliedCount, '個串流');
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
          console.warn('Failed to refresh Twitch player:', e);
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

