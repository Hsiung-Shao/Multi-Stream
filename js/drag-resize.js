// 拖曳與調整大小功能

// 拖曳與縮放
function makeDraggableResizable(el) {
  let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
  const controls = el.querySelector('.controls');
  let swapTarget = null;
  let originalPosition = null;
  
  controls.onmousedown = dragMouseDown;
  
  function dragMouseDown(e) {
    if (e.target.tagName === 'INPUT' || e.target.classList.contains('close') || e.target.classList.contains('control-btn')) return;
    e.preventDefault();
    pos3 = e.clientX;
    pos4 = e.clientY;
    
    // 記錄原始位置
    originalPosition = {
      top: el.offsetTop,
      left: el.offsetLeft,
      width: el.offsetWidth,
      height: el.offsetHeight
    };
    
    document.onmouseup = closeDrag;
    document.onmousemove = elementDrag;
    el.style.zIndex = '200';
    el.classList.add('swapping');
  }
  
  function elementDrag(e) {
    e.preventDefault();
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
    
    // 檢測是否靠近其他串流視窗
    const currentCenterX = newLeft + el.offsetWidth / 2;
    const currentCenterY = newTop + el.offsetHeight / 2;
    
    // 清除之前的目標提示
    document.querySelectorAll('.stream-box.swap-target').forEach(box => {
      if (box !== el) {
        box.classList.remove('swap-target');
      }
    });
    
    swapTarget = null;
    
    // 檢查所有其他串流視窗
    document.querySelectorAll('.stream-box').forEach(box => {
      if (box === el) return;
      
      const boxRect = box.getBoundingClientRect();
      const boxCenterX = boxRect.left + boxRect.width / 2;
      const boxCenterY = boxRect.top + boxRect.height / 2;
      
      // 計算距離
      const distanceX = Math.abs(currentCenterX - boxCenterX);
      const distanceY = Math.abs(currentCenterY - boxCenterY);
      
      // 如果中心點距離小於視窗寬高的50%，則視為可以交換
      const thresholdX = Math.max(el.offsetWidth, boxRect.width) * 0.5;
      const thresholdY = Math.max(el.offsetHeight, boxRect.height) * 0.5;
      
      if (distanceX < thresholdX && distanceY < thresholdY) {
        swapTarget = box;
        box.classList.add('swap-target');
        return;
      }
    });
  }
  
  function closeDrag() {
    document.onmouseup = null;
    document.onmousemove = null;
    el.style.zIndex = '';
    el.classList.remove('swapping');
    
    // 清除所有目標提示
    document.querySelectorAll('.stream-box.swap-target').forEach(box => {
      box.classList.remove('swap-target');
    });
    
    // 如果檢測到交換目標，執行位置交換
    if (swapTarget && originalPosition) {
      swapStreamPositions(el, swapTarget);
    } else {
      // 如果沒有交換，恢復原始位置（可選，或者保持當前位置）
      // 這裡我們保持當前位置，不恢復
    }
    
    swapTarget = null;
    originalPosition = null;
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

// 交換兩個串流視窗的位置
function swapStreamPositions(box1, box2) {
  // 獲取兩個視窗的當前位置和大小（使用 getBoundingClientRect 獲取準確位置）
  const box1Rect = box1.getBoundingClientRect();
  const box2Rect = box2.getBoundingClientRect();
  
  // 計算相對於 container 的位置
  const containerRect = container.getBoundingClientRect();
  
  const box1Pos = {
    top: box1Rect.top - containerRect.top + container.scrollTop,
    left: box1Rect.left - containerRect.left + container.scrollLeft,
    width: box1Rect.width,
    height: box1Rect.height
  };
  
  const box2Pos = {
    top: box2Rect.top - containerRect.top + container.scrollTop,
    left: box2Rect.left - containerRect.left + container.scrollLeft,
    width: box2Rect.width,
    height: box2Rect.height
  };
  
  // 交換位置和大小（使用平滑過渡）
  box1.style.transition = 'all 0.3s ease';
  box2.style.transition = 'all 0.3s ease';
  
  box1.style.top = box2Pos.top + 'px';
  box1.style.left = box2Pos.left + 'px';
  box1.style.width = box2Pos.width + 'px';
  box1.style.height = box2Pos.height + 'px';
  
  box2.style.top = box1Pos.top + 'px';
  box2.style.left = box1Pos.left + 'px';
  box2.style.width = box1Pos.width + 'px';
  box2.style.height = box1Pos.height + 'px';
  
  // 交換 DOM 順序（確保順序列表和視覺順序一致）
  const allBoxes = Array.from(document.querySelectorAll('.stream-box'));
  const box1Index = allBoxes.indexOf(box1);
  const box2Index = allBoxes.indexOf(box2);
  
  // 交換 DOM 順序
  if (box1Index < box2Index) {
    // box1 在 box2 前面，先移動 box2 到 box1 前面，再移動 box1 到 box2 後面
    if (box1.nextSibling) {
      container.insertBefore(box2, box1);
      container.insertBefore(box1, box2.nextSibling);
    } else {
      container.insertBefore(box2, box1);
      container.appendChild(box1);
    }
  } else {
    // box2 在 box1 前面，先移動 box1 到 box2 前面，再移動 box2 到 box1 後面
    if (box2.nextSibling) {
      container.insertBefore(box1, box2);
      container.insertBefore(box2, box1.nextSibling);
    } else {
      container.insertBefore(box1, box2);
      container.appendChild(box2);
    }
  }
  
  // 更新串流順序列表（立即更新編號）
  updateStreamOrderList();
  
  // 清除過渡效果（不立即重新應用布局，避免衝突）
  setTimeout(() => {
    box1.style.transition = '';
    box2.style.transition = '';
  }, 300);
  
  // 延遲重新應用布局，確保位置交換完成後再更新
  setTimeout(() => {
    const layoutType = autoSelectLayout();
    setLayout(layoutType);
  }, 400);
}

