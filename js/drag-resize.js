// 拖曳與調整大小功能

// 暫停所有播放器
function pauseAllPlayers() {
  Object.keys(players).forEach(id => {
    try {
      if (players[id].type === 'twitch' && players[id].player) {
        // Twitch播放器暫停
        players[id].player.pause();
      } else if (players[id].type === 'youtube' && players[id].player) {
        // YouTube播放器暫停
        players[id].player.pauseVideo();
      }
    } catch (e) {
      // Failed to pause player，靜默處理
    }
  });
}

// 恢復所有播放器
function resumeAllPlayers() {
  Object.keys(players).forEach(id => {
    try {
      if (players[id].type === 'twitch' && players[id].player) {
        // Twitch播放器播放
        players[id].player.play();
      } else if (players[id].type === 'youtube' && players[id].player) {
        // YouTube播放器播放
        players[id].player.playVideo();
      }
    } catch (e) {
      // Failed to resume player，靜默處理
    }
  });
}


// 拖曳與縮放
function makeDraggableResizable(el) {
  let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
  const controls = el.querySelector('.controls');
  let animationFrameId = null;
  let isDragging = false;
  let hasMoved = false;
  const DRAG_THRESHOLD = 5; // 移動距離超過 5 像素才視為拖曳
  
  controls.onmousedown = dragMouseDown;
  
  function dragMouseDown(e) {
    if (e.target.tagName === 'INPUT' || e.target.classList.contains('close') || e.target.classList.contains('control-btn')) return;
    e.preventDefault();
    pos3 = e.clientX;
    pos4 = e.clientY;
    
    // 重置拖曳狀態
    isDragging = false;
    hasMoved = false;
    
    // 設置拖拽標誌，防止布局更新干擾拖拽（但不立即暫停）
    isDraggingStreamBox = true;
    
    document.onmouseup = closeDrag;
    document.onmousemove = elementDrag;
    el.style.zIndex = '200';
    el.style.transition = 'none'; // 禁用過渡以獲得流暢的拖曳
  }
  
  function elementDrag(e) {
    e.preventDefault();
    
    // 計算移動距離
    const deltaX = Math.abs(e.clientX - pos3);
    const deltaY = Math.abs(e.clientY - pos4);
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    
    // 如果移動距離超過閾值，才視為拖曳並暫停播放器
    if (!hasMoved && distance > DRAG_THRESHOLD) {
      hasMoved = true;
      isDragging = true;
      // 只有在實際拖曳時才暫停所有播放器
      pauseAllPlayers();
    }
    
    // 只有在實際拖曳時才移動元素
    if (hasMoved) {
      // 使用 requestAnimationFrame 獲得流暢的拖曳體驗
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
      
      animationFrameId = requestAnimationFrame(() => {
        pos1 = pos3 - e.clientX;
        pos2 = pos4 - e.clientY;
        pos3 = e.clientX;
        pos4 = e.clientY;
        
        const newTop = el.offsetTop - pos2;
        const newLeft = el.offsetLeft - pos1;
        
        el.style.top = newTop + 'px';
        el.style.left = newLeft + 'px';
        el.style.right = 'auto';
        el.style.bottom = 'auto';
      });
    }
  }
  
  function closeDrag() {
    // 取消動畫幀
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
    
    document.onmouseup = null;
    document.onmousemove = null;
    el.style.zIndex = '';
    
    // 只有在實際拖曳過才恢復播放器
    if (isDragging && hasMoved) {
      // 恢復所有播放器
      setTimeout(() => {
        resumeAllPlayers();
      }, 100);
    }
    
    // 清除拖拽標誌
    setTimeout(() => {
      isDraggingStreamBox = false;
      isDragging = false;
      hasMoved = false;
      el.style.transition = ''; // 恢復過渡效果
    }, 100);
  }
  
  // 縮放功能
  const resizer = el.querySelector('.resizer');
  resizer.addEventListener('mousedown', initResize);
  
  function initResize(e) {
    e.stopPropagation();
    window.addEventListener('mousemove', resize);
    window.addEventListener('mouseup', stopResize);
  }
  
  function resize(e) {
    const newWidth = e.clientX - el.offsetLeft;
    const newHeight = e.clientY - el.offsetTop;
    
    if (newWidth >= 300) el.style.width = newWidth + 'px';
    if (newHeight >= 200) el.style.height = newHeight + 'px';
  }
  
  function stopResize() {
    window.removeEventListener('mousemove', resize);
    window.removeEventListener('mouseup', stopResize);
  }
}


