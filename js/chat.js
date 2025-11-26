// 聊天室功能

// 建立聊天室
function createChat(id, platform, channelId, videoId) {
  const chatDiv = document.getElementById('chat' + id);
  const parentDomain = getParentDomain();
  
  // YouTube 聊天室無法嵌入（X-Frame-Options: sameorigin）
  // 直接顯示替代方案
  if (platform === 'youtube') {
    showYouTubeChatAlternative(chatDiv, videoId);
    return;
  }
  
  let chatUrl = '';
  
  if (platform === 'twitch') {
    // Twitch 聊天室 - 根據官方文檔，必須使用 parent 參數
    // Twitch CSP 要求：frame-ancestors http://localhost:* https://localhost:*
    // parent 參數應該只包含域名，不包含協議和端口
    const parents = getTwitchParents();
    const parent = parents[0];
    
    // 驗證當前協議和域名是否符合 Twitch 要求
    const currentProtocol = window.location.protocol;
    const currentHostname = window.location.hostname;
    
    // 檢查是否符合 Twitch CSP 要求
    if (currentProtocol === 'file:') {
      showChatError(chatDiv, platform, true);
      return;
    }
    
    // 如果使用 localhost，確保協議是 http 或 https
    if (parent === 'localhost' && currentProtocol !== 'http:' && currentProtocol !== 'https:') {
      showChatError(chatDiv, platform, false, false, '請使用 http://localhost 或 https://localhost 開啟網頁');
      return;
    }
    
    // 構建聊天室 URL，根據官方文檔格式
    // https://dev.twitch.tv/docs/embed/chat
    chatUrl = `https://www.twitch.tv/embed/${channelId}/chat?parent=${encodeURIComponent(parent)}&darkpopout`;
    
    console.log('Twitch chat URL:', chatUrl);
    console.log('Current origin:', window.location.origin);
    console.log('Parent domain:', parent);
  }
  
  if (chatUrl) {
    const chatIframe = document.createElement('iframe');
    chatIframe.src = chatUrl;
    chatIframe.style.width = '100%';
    chatIframe.style.height = '100%';
    chatIframe.frameBorder = '0';
    chatIframe.allow = 'autoplay; fullscreen';
    chatIframe.setAttribute('allowfullscreen', '');
    chatDiv.appendChild(chatIframe);
    
    // 檢測是否被 CSP 阻止
    let blockedDetected = false;
    let checkInterval = setInterval(() => {
      try {
        // 嘗試訪問 iframe（跨域會失敗，但這表示 iframe 存在）
        const test = chatIframe.contentWindow;
        // 如果能訪問到，清除檢查
        clearInterval(checkInterval);
      } catch (e) {
        // 跨域錯誤是正常的
        // 但如果 iframe 完全無法載入，會在下面檢測
      }
    }, 1000);
    
    // 設置超時檢查 - 3 秒後檢查是否被阻止
    setTimeout(() => {
      clearInterval(checkInterval);
      try {
        // 檢查 iframe 是否真的載入
        const iframeDoc = chatIframe.contentDocument;
        // 如果能訪問，表示載入成功
      } catch (e) {
        // 跨域錯誤是正常的，但我們需要檢查是否完全被阻止
        // 檢查 iframe 的 src 是否被重置或改變
        if (chatIframe.src && chatIframe.src.includes('twitch.tv')) {
          // iframe src 正常，可能是 CSP 阻止
          // 等待更長時間再判斷
          setTimeout(() => {
            // 最終檢查：如果仍然無法訪問，顯示錯誤
            try {
              const test = chatIframe.contentWindow.location;
            } catch (err) {
              // 這可能是 CSP 阻止
              if (err.message && err.message.includes('Blocked a frame')) {
                showChatError(chatDiv, platform, false, true);
                blockedDetected = true;
              }
            }
          }, 2000);
        }
      }
    }, 3000);
    
    // 當 iframe 載入完成時
    chatIframe.addEventListener('load', () => {
      console.log('Chat iframe loaded successfully');
      clearInterval(checkInterval);
    });
    
    // 錯誤處理
    chatIframe.addEventListener('error', () => {
      clearInterval(checkInterval);
      console.error('Chat iframe failed to load');
      if (!blockedDetected) {
        showChatError(chatDiv, platform);
      }
    });
    
    // 額外檢查：如果協議是 file://，直接顯示錯誤
    if (window.location.protocol === 'file:') {
      setTimeout(() => {
        showChatError(chatDiv, platform, true);
      }, 1000);
    }
  }
}

// 顯示 YouTube 聊天室替代方案（因為無法嵌入）
function showYouTubeChatAlternative(chatDiv, videoId) {
  const chatUrl = `https://www.youtube.com/live_chat?v=${videoId}`;
  chatDiv.innerHTML = `
    <div style="padding: 20px; text-align: center; color: #aaa; height: 100%; display: flex; flex-direction: column; justify-content: center; align-items: center;">
      <div style="font-size: 32px; margin-bottom: 15px;">💬</div>
      <p style="margin: 0 0 10px 0; font-weight: bold; color: #fff;">YouTube 聊天室</p>
      <div style="font-size: 12px; line-height: 1.6; color: #888; margin-bottom: 20px; max-width: 300px;">
        YouTube 不允許跨域嵌入聊天室<br>
        （X-Frame-Options: sameorigin）
      </div>
      <a href="${chatUrl}" target="_blank" style="
        display: inline-block;
        padding: 10px 20px;
        background: #9147ff;
        color: #fff;
        text-decoration: none;
        border-radius: 4px;
        font-weight: bold;
        transition: background 0.2s;
        margin-bottom: 10px;
      " onmouseover="this.style.background='#7c3aed'" onmouseout="this.style.background='#9147ff'">
        在新視窗開啟聊天室
      </a>
      <button onclick="this.parentElement.parentElement.classList.add('hidden')" style="
        padding: 6px 12px;
        background: transparent;
        color: #888;
        border: 1px solid #555;
        border-radius: 4px;
        cursor: pointer;
        font-size: 11px;
      ">
        隱藏
      </button>
    </div>
  `;
}

// 顯示聊天室錯誤訊息
function showChatError(chatDiv, platform, isFileProtocol = false, isCSPBlocked = false, customMsg = '') {
  const protocolMsg = isFileProtocol ? 
    '<strong style="color: #ff4444;">⚠️ 檢測到使用 file:// 協議</strong><br>請使用 http://localhost 開啟網頁' : 
    '';
  
  const cspMsg = isCSPBlocked ? 
    '<strong style="color: #ff4444;">⚠️ 被 Content Security Policy 阻止</strong><br>請確認使用 http://localhost 或 https://localhost 開啟網頁' : 
    '';
  
  const customMsgHtml = customMsg ? 
    `<strong style="color: #ffaa00;">⚠️ ${customMsg}</strong><br>` : 
    '';
  
  let solutionMsg = '';
  if (platform === 'twitch') {
    const currentOrigin = window.location.origin;
    solutionMsg = `
      <div style="margin-top: 15px; padding: 10px; background: rgba(145, 71, 255, 0.1); border-radius: 4px; font-size: 11px; text-align: left;">
        <strong>根據 <a href="https://dev.twitch.tv/docs/embed/" target="_blank" style="color: #9147ff;">Twitch 官方文檔</a>：</strong><br><br>
        <strong>解決方案：</strong><br>
        1. 必須使用 <code style="background: rgba(0,0,0,0.3); padding: 2px 4px; border-radius: 2px;">http://localhost</code> 或 <code style="background: rgba(0,0,0,0.3); padding: 2px 4px; border-radius: 2px;">https://localhost</code> 開啟<br>
        2. 不要使用 <code style="background: rgba(0,0,0,0.3); padding: 2px 4px; border-radius: 2px;">file://</code> 協議<br>
        3. 確認頻道正在直播且開啟聊天室<br>
        4. Twitch CSP 要求：<code style="background: rgba(0,0,0,0.3); padding: 2px 4px; border-radius: 2px;">frame-ancestors http://localhost:* https://localhost:*</code><br><br>
        <strong>當前網址：</strong><br>
        <code style="background: rgba(0,0,0,0.3); padding: 2px 4px; border-radius: 2px; font-size: 10px;">${currentOrigin || '無法檢測'}</code>
      </div>
    `;
  }
  
  const streamId = parseInt(chatDiv.id.replace('chat', ''));
  const channelId = streamData[streamId]?.channelId || '';
  
  chatDiv.innerHTML = `
    <div style="padding: 20px; text-align: center; color: #aaa; height: 100%; display: flex; flex-direction: column; justify-content: center;">
      <div style="font-size: 24px; margin-bottom: 10px;">💬</div>
      <p style="margin: 0 0 10px 0; font-weight: bold; color: #fff;">聊天室無法載入</p>
      <div style="font-size: 12px; line-height: 1.6; color: #888;">
        ${customMsgHtml}
        ${customMsgHtml ? '<br>' : ''}
        ${protocolMsg}
        ${protocolMsg ? '<br>' : ''}
        ${cspMsg}
        ${cspMsg ? '<br><br>' : ''}
        ${!protocolMsg && !cspMsg && !customMsg ? '可能的原因：<br>1. 頻道未開啟聊天室功能<br>2. 瀏覽器安全設定限制<br>3. 網路連線問題<br>' : ''}
        ${solutionMsg}
      </div>
      ${platform === 'twitch' && channelId ? `
        <a href="https://www.twitch.tv/popout/${channelId}/chat" 
           target="_blank" 
           style="margin-top: 15px; padding: 8px 16px; background: #9147ff; color: #fff; text-decoration: none; border-radius: 4px; font-size: 12px; display: inline-block; transition: background 0.2s;"
           onmouseover="this.style.background='#7c3aed'" 
           onmouseout="this.style.background='#9147ff'">
          在新視窗開啟聊天室
        </a>
      ` : ''}
      <button onclick="this.parentElement.parentElement.classList.add('hidden')" 
              style="margin-top: 10px; padding: 6px 12px; background: #333; color: #fff; border: 1px solid #555; border-radius: 4px; cursor: pointer; font-size: 11px;">
        隱藏
      </button>
    </div>
  `;
}

// 切換聊天室顯示
function toggleChat(id) {
  const chatDiv = document.getElementById('chat' + id);
  const resizer = document.getElementById('chat-resizer' + id);
  const isVisible = !chatDiv.classList.contains('hidden');
  
  if (isVisible) {
    // 隱藏聊天室
    chatDiv.classList.add('hidden');
    if (resizer) {
      resizer.style.display = 'none';
    }
    streamData[id].chatVisible = false;
  } else {
    // 顯示聊天室
    chatDiv.classList.remove('hidden');
    if (resizer) {
      resizer.style.display = '';
    }
    streamData[id].chatVisible = true;
  }
}

// 分離聊天室（創建獨立視窗）
function separateChat(id) {
  const chatDiv = document.getElementById('chat' + id);
  const separateBtn = document.querySelector(`#box${id} .control-btn[onclick="separateChat(${id})"]`);
  
  // 檢查是否已經分離
  const existingSeparated = document.getElementById('separated-chat-' + id);
  if (existingSeparated) {
    // 如果已經分離，則關閉分離視窗並恢復
    existingSeparated.remove();
    chatDiv.classList.remove('hidden');
    streamData[id].chatSeparated = false;
    streamData[id].chatVisible = true;
    if (separateBtn) {
      separateBtn.textContent = '🔗';
      separateBtn.title = '分離聊天室';
    }
    return;
  }
  
  if (!chatDiv) {
    alert('找不到聊天室');
    return;
  }
  
  if (chatDiv.classList.contains('hidden')) {
    // 如果聊天室被隱藏，先顯示它
    chatDiv.classList.remove('hidden');
    streamData[id].chatVisible = true;
  }
  
  // 獲取聊天室內容（複製 iframe）
  const platform = streamData[id]?.platform;
  const channelId = streamData[id]?.channelId;
  const videoId = streamData[id]?.videoId;
  
  // 創建分離的聊天室視窗
  const separatedChat = document.createElement('div');
  separatedChat.className = 'separated-chat';
  separatedChat.id = 'separated-chat-' + id;
  separatedChat.style.width = '400px';
  separatedChat.style.height = '600px';
  separatedChat.style.left = (window.innerWidth - 400) / 2 + 'px';
  separatedChat.style.top = (window.innerHeight - 600) / 2 + 'px';
  
  // 重新建立聊天室 iframe（因為 iframe 無法直接複製）
  let chatContentHtml = '';
  if (platform === 'twitch' && channelId) {
    const parentDomain = getParentDomain();
    const parents = getTwitchParents();
    const chatUrl = `https://www.twitch.tv/embed/${channelId}/chat?parent=${encodeURIComponent(parents[0])}&darkpopout`;
    chatContentHtml = `<iframe src="${chatUrl}" style="width: 100%; height: 100%; border: none;" allow="autoplay; fullscreen"></iframe>`;
  } else if (platform === 'youtube' && videoId) {
    // YouTube 無法嵌入，顯示替代方案
    chatContentHtml = chatDiv.innerHTML;
  } else {
    chatContentHtml = chatDiv.innerHTML;
  }
  
  separatedChat.innerHTML = `
    <div class="separated-chat-header">
      <span>💬 聊天室 #${id} ${platform === 'twitch' ? channelId : (platform === 'youtube' ? videoId : '')}</span>
      <span style="cursor: pointer; color: #ff4444; font-size: 18px;" onclick="closeSeparatedChat(${id})">×</span>
    </div>
    <div class="separated-chat-content">
      ${chatContentHtml}
    </div>
  `;
  
  document.body.appendChild(separatedChat);
  
  // 使分離的聊天室可拖曳
  makeSeparatedChatDraggable(separatedChat);
  
  // 隱藏原始聊天室
  chatDiv.classList.add('hidden');
  streamData[id].chatSeparated = true;
  
  // 更新按鈕狀態
  if (separateBtn) {
    separateBtn.textContent = '🔗✓';
    separateBtn.title = '合併聊天室';
  }
}

// 關閉分離的聊天室
function closeSeparatedChat(id) {
  const separatedChat = document.getElementById('separated-chat-' + id);
  if (separatedChat) {
    separatedChat.remove();
    const chatDiv = document.getElementById('chat' + id);
    if (chatDiv) {
      chatDiv.classList.remove('hidden');
      streamData[id].chatSeparated = false;
      streamData[id].chatVisible = true;
    }
    const separateBtn = document.querySelector(`#box${id} .control-btn[onclick="separateChat(${id})"]`);
    if (separateBtn) {
      separateBtn.textContent = '🔗';
      separateBtn.title = '分離聊天室';
    }
  }
}

// 使分離的聊天室可拖曳
function makeSeparatedChatDraggable(el) {
  const header = el.querySelector('.separated-chat-header');
  let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
  
  header.onmousedown = dragMouseDown;
  
  function dragMouseDown(e) {
    if (e.target.tagName === 'SPAN' && e.target.textContent === '×') return;
    e.preventDefault();
    pos3 = e.clientX;
    pos4 = e.clientY;
    document.onmouseup = closeDrag;
    document.onmousemove = elementDrag;
    el.style.zIndex = '2000';
  }
  
  function elementDrag(e) {
    e.preventDefault();
    pos1 = pos3 - e.clientX;
    pos2 = pos4 - e.clientY;
    pos3 = e.clientX;
    pos4 = e.clientY;
    el.style.left = (el.offsetLeft - pos1) + 'px';
    el.style.top = (el.offsetTop - pos2) + 'px';
  }
  
  function closeDrag() {
    document.onmouseup = null;
    document.onmousemove = null;
  }
  
  // 添加縮放功能
  const resizer = document.createElement('div');
  resizer.className = 'resizer';
  resizer.style.position = 'absolute';
  resizer.style.width = '20px';
  resizer.style.height = '20px';
  resizer.style.background = '#444';
  resizer.style.right = '0';
  resizer.style.bottom = '0';
  resizer.style.cursor = 'se-resize';
  resizer.style.borderRadius = '4px 0 8px 0';
  el.appendChild(resizer);
  
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
    if (newHeight >= 300) el.style.height = newHeight + 'px';
  }
  function stopResize() {
    window.removeEventListener('mousemove', resize);
    window.removeEventListener('mouseup', stopResize);
  }
}

// 設定聊天室調整大小功能
function setupChatResizer(id) {
  const chatDiv = document.getElementById('chat' + id);
  const resizer = document.getElementById('chat-resizer' + id);
  const contentWrapper = chatDiv?.closest('.content-wrapper');
  
  if (!resizer || !chatDiv || !contentWrapper) return;
  
  let isResizing = false;
  let startX = 0;
  let startY = 0;
  let startWidth = 0;
  let startHeight = 0;
  let isHorizontal = false;
  
  resizer.addEventListener('mousedown', (e) => {
    isResizing = true;
    startX = e.clientX;
    startY = e.clientY;
    startWidth = chatDiv.offsetWidth;
    startHeight = chatDiv.offsetHeight;
    
    // 判斷是水平還是垂直排列
    isHorizontal = contentWrapper.classList.contains('layout-horizontal');
    
    // 根據排列方向設置游標
    if (isHorizontal) {
      resizer.style.cursor = 'ew-resize'; // 左右調整
      document.body.style.cursor = 'ew-resize';
    } else {
      resizer.style.cursor = 'ns-resize'; // 上下調整
      document.body.style.cursor = 'ns-resize';
    }
    
    e.preventDefault();
    e.stopPropagation();
    
    document.addEventListener('mousemove', handleResize);
    document.addEventListener('mouseup', stopResize);
  });
  
  function handleResize(e) {
    if (!isResizing) return;
    
    if (isHorizontal) {
      // 水平排列：調整寬度
      const diff = startX - e.clientX; // 向左拖曳增加寬度
      const newWidth = startWidth + diff;
      
      // 限制寬度範圍
      if (newWidth >= 200 && newWidth <= 800) {
        chatDiv.style.width = newWidth + 'px';
        chatDiv.style.transition = 'none';
      }
    } else {
      // 垂直排列：調整高度
      const diff = startY - e.clientY; // 向上拖曳增加高度
      const newHeight = startHeight + diff;
      
      // 限制高度範圍
      if (newHeight >= 100 && newHeight <= 800) {
        chatDiv.style.height = newHeight + 'px';
        chatDiv.style.transition = 'none';
      }
    }
  }
  
  function stopResize() {
    isResizing = false;
    chatDiv.style.transition = 'all 0.3s ease';
    resizer.style.cursor = '';
    document.body.style.cursor = '';
    document.removeEventListener('mousemove', handleResize);
    document.removeEventListener('mouseup', stopResize);
  }
  
  // 根據排列方向更新調整器的位置和樣式
  function updateResizerPosition() {
    if (contentWrapper.classList.contains('layout-horizontal')) {
      // 水平排列：調整器在左側
      resizer.style.top = '0';
      resizer.style.left = '0';
      resizer.style.right = 'auto';
      resizer.style.bottom = 'auto';
      resizer.style.width = '4px';
      resizer.style.height = '100%';
      resizer.style.cursor = 'ew-resize';
    } else {
      // 垂直排列：調整器在頂部
      resizer.style.top = '0';
      resizer.style.left = '0';
      resizer.style.right = '0';
      resizer.style.bottom = 'auto';
      resizer.style.width = '100%';
      resizer.style.height = '4px';
      resizer.style.cursor = 'ns-resize';
    }
  }
  
  // 監聽布局變化
  const observer = new MutationObserver(updateResizerPosition);
  observer.observe(contentWrapper, { attributes: true, attributeFilter: ['class'] });
  
  // 初始化位置
  updateResizerPosition();
}

