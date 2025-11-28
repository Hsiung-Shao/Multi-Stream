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
  
  controls.onmousedown = dragMouseDown;
  
  function dragMouseDown(e) {
    if (e.target.tagName === 'INPUT' || e.target.classList.contains('close') || e.target.classList.contains('control-btn')) return;
    e.preventDefault();
    pos3 = e.clientX;
    pos4 = e.clientY;
    
    // 設置拖拽標誌，防止布局更新干擾拖拽
    isDraggingStreamBox = true;
    
    // 暫停所有播放器
    pauseAllPlayers();
    
    document.onmouseup = closeDrag;
    document.onmousemove = elementDrag;
    el.style.zIndex = '200';
    el.style.transition = 'none'; // 禁用過渡以獲得流暢的拖曳
  }
  
  function elementDrag(e) {
    e.preventDefault();
    
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
  
  function closeDrag() {
    // 取消動畫幀
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
    
    document.onmouseup = null;
    document.onmousemove = null;
    el.style.zIndex = '';
    
    // 恢復所有播放器
    setTimeout(() => {
      resumeAllPlayers();
    }, 100);
    
    // 清除拖拽標誌
    setTimeout(() => {
      isDraggingStreamBox = false;
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


