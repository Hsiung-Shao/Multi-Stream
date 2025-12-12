// 聊天室功能

// 建立聊天室
function createChat(id, platform, channelId, videoId) {
  console.log(`[createChat] 開始創建聊天室`, {
    id,
    platform,
    channelId,
    videoId,
    location: window.location.href,
    hostname: window.location.hostname,
    protocol: window.location.protocol
  });
  
  const chatDiv = document.getElementById('chat' + id);
  if (!chatDiv) {
    console.error(`[createChat] 聊天室容器 chat${id} 不存在`, {
      id,
      searchedId: 'chat' + id,
      allChatElements: Array.from(document.querySelectorAll('[id^="chat"]')).map(el => el.id)
    });
    return;
  }
  
  console.log(`[createChat] 找到聊天室容器`, {
    id: chatDiv.id,
    hasContent: chatDiv.children.length > 0,
    innerHTML: chatDiv.innerHTML.substring(0, 100)
  });
  
  const parentDomain = getParentDomain();
  
  let chatUrl = '';
  
  if (platform === 'youtube') {
    // 验证 videoId
    if (!validateVideoId(videoId)) {
      console.log(`[createChat] YouTube videoId 無效，顯示替代方案`);
      showYouTubeChatAlternative(chatDiv, videoId);
      return;
    }
    
    // 检查域名是否支持嵌入（localhost 不支持）
    // 參考舊代碼：在 localhost 環境下直接顯示替代方案
    if (parentDomain === 'localhost' || parentDomain === '127.0.0.1' || parentDomain === '0.0.0.0') {
      console.log(`[createChat] YouTube 在 localhost 環境下無法嵌入，顯示替代方案`);
      showYouTubeChatAlternative(chatDiv, videoId);
      return;
    }
    
    // 构建 YouTube 聊天室 URL（使用 embed_domain 参数）
    // 參考舊代碼：使用標準的 live_chat URL 格式
    chatUrl = `https://www.youtube.com/live_chat?v=${encodeURIComponent(videoId)}&embed_domain=${encodeURIComponent(parentDomain)}`;
    
    console.log(`[createChat] 創建 YouTube 聊天室 iframe，videoId: ${videoId}, embedDomain: ${parentDomain}`);
  } else if (platform === 'twitch') {
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
    
    // Twitch chat URL 已構建
  }
  
  if (chatUrl) {
    console.log(`[createChat] 準備創建 iframe`, {
      platform,
      chatUrl,
      chatDivId: chatDiv.id,
      chatDivExists: !!chatDiv,
      hasExistingContent: chatDiv.children.length > 0
    });
    
    // 參考正式環境：如果容器已有內容（可能是錯誤訊息或舊內容），先清空
    if (chatDiv.children.length > 0) {
      console.log(`[createChat] 清空現有內容，準備創建新的 iframe`);
      chatDiv.innerHTML = '';
    }
    
    const chatIframe = document.createElement('iframe');
    chatIframe.src = chatUrl;
    chatIframe.style.width = '100%';
    chatIframe.style.height = '100%';
    chatIframe.frameBorder = '0';
    chatIframe.allow = 'autoplay; fullscreen';
    chatIframe.setAttribute('allowfullscreen', '');
    
    console.log(`[createChat] iframe 已創建，準備添加到 DOM`, {
      iframeSrc: chatIframe.src,
      iframeId: chatIframe.id || 'no-id'
    });
    
    chatDiv.appendChild(chatIframe);
    
    console.log(`[createChat] iframe 已添加到 DOM`, {
      chatDivChildren: chatDiv.children.length,
      iframeInDOM: chatDiv.querySelector('iframe') !== null
    });
    
    // 檢測是否被 CSP 阻止（參考舊代碼的檢測邏輯）
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
    
    // 設置超時檢查 - 3 秒後檢查是否被阻止（參考舊代碼）
    setTimeout(() => {
      clearInterval(checkInterval);
      try {
        // 檢查 iframe 是否真的載入
        const iframeDoc = chatIframe.contentDocument;
        // 如果能訪問，表示載入成功
      } catch (e) {
        // 跨域錯誤是正常的，但我們需要檢查是否完全被阻止
        // 檢查 iframe 的 src 是否被重置或改變
        if (chatIframe.src && (chatIframe.src.includes('twitch.tv') || chatIframe.src.includes('youtube.com'))) {
          // iframe src 正常，可能是 CSP 阻止
          // 等待更長時間再判斷
          setTimeout(() => {
            // 最終檢查：如果仍然無法訪問，顯示錯誤
            try {
              const test = chatIframe.contentWindow.location;
            } catch (err) {
              // 這可能是 CSP 阻止
              if (err.message && err.message.includes('Blocked a frame')) {
                // 對於 YouTube，回退到替代方案（參考舊代碼）
                if (platform === 'youtube') {
                  showYouTubeChatAlternative(chatDiv, videoId);
                } else {
                  showChatError(chatDiv, platform, false, true);
                }
                blockedDetected = true;
              }
            }
          }, 2000);
        } else {
          // iframe src 被重置，可能是載入失敗
          // 對於 YouTube，顯示替代方案
          if (platform === 'youtube') {
            showYouTubeChatAlternative(chatDiv, videoId);
            blockedDetected = true;
          }
        }
      }
    }, 3000);
    
    // 當 iframe 載入完成時
    chatIframe.addEventListener('load', () => {
      // Chat iframe 載入成功
      clearInterval(checkInterval);
      console.log(`[createChat] ${platform} 聊天室 iframe 載入成功`);
    });
    
    // 錯誤處理（參考舊代碼）
    chatIframe.addEventListener('error', () => {
      clearInterval(checkInterval);
      // Chat iframe 載入失敗，靜默處理
      if (!blockedDetected) {
        // 對於 YouTube，回退到替代方案
        if (platform === 'youtube') {
          showYouTubeChatAlternative(chatDiv, videoId);
        } else {
          showChatError(chatDiv, platform);
        }
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
  if (!chatDiv) {
    console.warn('[showYouTubeChatAlternative] 聊天室容器不存在');
    return;
  }
  
  // 验证 videoId
  if (!validateVideoId(videoId)) {
    console.warn('[showYouTubeChatAlternative] videoId 無效:', videoId);
    // Invalid video ID，靜默處理
    return;
  }
  
  const chatUrl = `https://www.youtube.com/live_chat?v=${encodeURIComponent(videoId)}`;
  
  console.log(`[showYouTubeChatAlternative] 為 videoId ${videoId} 顯示替代方案`);
  
  // 使用安全的 DOM 操作
  chatDiv.innerHTML = ''; // 清空
  
  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'padding: 20px; text-align: center; color: #aaa; height: 100%; display: flex; flex-direction: column; justify-content: center; align-items: center;';
  
  const icon = document.createElement('div');
  icon.style.cssText = 'font-size: 32px; margin-bottom: 15px;';
  icon.textContent = '💬';
  
  const title = document.createElement('p');
  title.style.cssText = 'margin: 0 0 10px 0; font-weight: bold; color: #fff;';
  title.textContent = 'YouTube 聊天室';
  
  const desc = document.createElement('div');
  desc.style.cssText = 'font-size: 12px; line-height: 1.6; color: #888; margin-bottom: 20px; max-width: 300px;';
  const currentDomain = getParentDomain();
  if (currentDomain === 'localhost' || currentDomain === '127.0.0.1' || currentDomain === '0.0.0.0') {
    desc.textContent = '在 localhost 環境下無法嵌入 YouTube 聊天室，請在新視窗中開啟';
  } else {
    desc.textContent = '無法嵌入 YouTube 聊天室，請在新視窗中開啟';
  }
  
  const link = document.createElement('a');
  link.href = chatUrl;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.style.cssText = 'display: inline-block; padding: 10px 20px; background: #9147ff; color: #fff; text-decoration: none; border-radius: 4px; font-weight: bold; transition: background 0.2s; margin-bottom: 10px;';
  link.textContent = '在新視窗開啟聊天室';
  link.onmouseover = () => link.style.background = '#7c3aed';
  link.onmouseout = () => link.style.background = '#9147ff';
  
  const hideBtn = document.createElement('button');
  hideBtn.style.cssText = 'padding: 6px 12px; background: transparent; color: #888; border: 1px solid #555; border-radius: 4px; cursor: pointer; font-size: 11px;';
  hideBtn.textContent = '隱藏';
  hideBtn.onclick = () => chatDiv.classList.add('hidden');
  
  wrapper.appendChild(icon);
  wrapper.appendChild(title);
  wrapper.appendChild(desc);
  wrapper.appendChild(link);
  wrapper.appendChild(hideBtn);
  chatDiv.appendChild(wrapper);
}

// 顯示聊天室錯誤訊息
function showChatError(chatDiv, platform, isFileProtocol = false, isCSPBlocked = false, customMsg = '') {
  chatDiv.innerHTML = ''; // 清空
  
  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'padding: 20px; text-align: center; color: #aaa; height: 100%; display: flex; flex-direction: column; justify-content: center;';
  
  const icon = document.createElement('div');
  icon.style.cssText = 'font-size: 24px; margin-bottom: 10px;';
  icon.textContent = '💬';
  
  const title = document.createElement('p');
  title.style.cssText = 'margin: 0 0 10px 0; font-weight: bold; color: #fff;';
  title.textContent = '聊天室無法載入';
  
  const content = document.createElement('div');
  content.style.cssText = 'font-size: 12px; line-height: 1.6; color: #888;';
  
  // 添加自定义消息
  if (customMsg) {
    const customMsgEl = document.createElement('strong');
    customMsgEl.style.color = '#ffaa00';
    customMsgEl.textContent = '⚠️ ' + escapeHtml(customMsg);
    content.appendChild(customMsgEl);
    content.appendChild(document.createElement('br'));
  }
  
  // 添加协议消息
  if (isFileProtocol) {
    const protocolMsg = document.createElement('strong');
    protocolMsg.style.color = '#ff4444';
    protocolMsg.textContent = '⚠️ 檢測到使用 file:// 協議';
    content.appendChild(protocolMsg);
    content.appendChild(document.createElement('br'));
    const protocolText = document.createTextNode('請使用 http://localhost 開啟網頁');
    content.appendChild(protocolText);
    content.appendChild(document.createElement('br'));
  }
  
  // 添加 CSP 消息
  if (isCSPBlocked) {
    const cspMsg = document.createElement('strong');
    cspMsg.style.color = '#ff4444';
    cspMsg.textContent = '⚠️ 被 Content Security Policy 阻止';
    content.appendChild(cspMsg);
    content.appendChild(document.createElement('br'));
    const cspText = document.createTextNode('請確認使用 http://localhost 或 https://localhost 開啟網頁');
    content.appendChild(cspText);
    content.appendChild(document.createElement('br'));
    content.appendChild(document.createElement('br'));
  }
  
  // 如果没有其他消息，显示默认原因
  if (!customMsg && !isFileProtocol && !isCSPBlocked) {
    const defaultMsg = document.createTextNode('可能的原因：\n1. 頻道未開啟聊天室功能\n2. 瀏覽器安全設定限制\n3. 網路連線問題');
    content.appendChild(defaultMsg);
  }
  
  // 添加 Twitch 解决方案
  if (platform === 'twitch') {
    const solutionDiv = document.createElement('div');
    solutionDiv.style.cssText = 'margin-top: 15px; padding: 10px; background: rgba(145, 71, 255, 0.1); border-radius: 4px; font-size: 11px; text-align: left;';
    
    const docLink = document.createElement('a');
    docLink.href = 'https://dev.twitch.tv/docs/embed/';
    docLink.target = '_blank';
    docLink.rel = 'noopener noreferrer';
    docLink.style.color = '#9147ff';
    docLink.textContent = 'Twitch 官方文檔';
    
    const strong1 = document.createElement('strong');
    strong1.appendChild(document.createTextNode('根據 '));
    strong1.appendChild(docLink);
    strong1.appendChild(document.createTextNode('：'));
    
    solutionDiv.appendChild(strong1);
    solutionDiv.appendChild(document.createElement('br'));
    solutionDiv.appendChild(document.createElement('br'));
    
    const strong2 = document.createElement('strong');
    strong2.textContent = '解決方案：';
    solutionDiv.appendChild(strong2);
    solutionDiv.appendChild(document.createElement('br'));
    
    const solutions = [
      '1. 必須使用 http://localhost 或 https://localhost 開啟',
      '2. 不要使用 file:// 協議',
      '3. 確認頻道正在直播且開啟聊天室',
      '4. Twitch CSP 要求：frame-ancestors http://localhost:* https://localhost:*'
    ];
    
    solutions.forEach((text, index) => {
      if (index > 0) solutionDiv.appendChild(document.createElement('br'));
      solutionDiv.appendChild(document.createTextNode(text));
    });
    
    solutionDiv.appendChild(document.createElement('br'));
    solutionDiv.appendChild(document.createElement('br'));
    
    const strong3 = document.createElement('strong');
    strong3.textContent = '當前網址：';
    solutionDiv.appendChild(strong3);
    solutionDiv.appendChild(document.createElement('br'));
    
    const code = document.createElement('code');
    code.style.cssText = 'background: rgba(0,0,0,0.3); padding: 2px 4px; border-radius: 2px; font-size: 10px;';
    code.textContent = window.location.origin || '無法檢測';
    solutionDiv.appendChild(code);
    
    content.appendChild(solutionDiv);
  }
  
  wrapper.appendChild(icon);
  wrapper.appendChild(title);
  wrapper.appendChild(content);
  
  // 添加 Twitch 聊天室链接
  const streamId = parseInt(chatDiv.id.replace('chat', ''));
  const channelId = streamData[streamId]?.channelId || '';
  
  if (platform === 'twitch' && channelId && validateChannelId(channelId)) {
    const chatLink = document.createElement('a');
    chatLink.href = `https://www.twitch.tv/popout/${encodeURIComponent(channelId)}/chat`;
    chatLink.target = '_blank';
    chatLink.rel = 'noopener noreferrer';
    chatLink.style.cssText = 'margin-top: 15px; padding: 8px 16px; background: #9147ff; color: #fff; text-decoration: none; border-radius: 4px; font-size: 12px; display: inline-block; transition: background 0.2s;';
    chatLink.textContent = '在新視窗開啟聊天室';
    chatLink.onmouseover = () => chatLink.style.background = '#7c3aed';
    chatLink.onmouseout = () => chatLink.style.background = '#9147ff';
    wrapper.appendChild(chatLink);
  }
  
  // 添加隐藏按钮
  const hideBtn = document.createElement('button');
  hideBtn.style.cssText = 'margin-top: 10px; padding: 6px 12px; background: #333; color: #fff; border: 1px solid #555; border-radius: 4px; cursor: pointer; font-size: 11px;';
  hideBtn.textContent = '隱藏';
  hideBtn.onclick = () => chatDiv.classList.add('hidden');
  wrapper.appendChild(hideBtn);
  
  chatDiv.appendChild(wrapper);
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
  
  // 更新所有聊天室按鈕狀態
  if (typeof updateAllChatsButton === 'function') {
    updateAllChatsButton();
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
  
  // 使用安全的 DOM 操作
  const header = document.createElement('div');
  header.className = 'separated-chat-header';
  
  const headerText = document.createElement('span');
  const chatLabel = platform === 'twitch' ? (validateChannelId(channelId) ? channelId : '') : 
                    (platform === 'youtube' ? (validateVideoId(videoId) ? videoId : '') : '');
  headerText.textContent = `💬 聊天室 #${id} ${chatLabel}`;
  
  const closeBtn = document.createElement('span');
  closeBtn.style.cssText = 'cursor: pointer; color: #ff4444; font-size: 18px;';
  closeBtn.textContent = '×';
  closeBtn.onclick = () => closeSeparatedChat(id);
  
  header.appendChild(headerText);
  header.appendChild(closeBtn);
  
  const content = document.createElement('div');
  content.className = 'separated-chat-content';
  // 注意：chatContentHtml 可能包含 iframe，需要特殊处理
  // 但这里我们只设置一次，且内容来自我们自己的代码，相对安全
  if (platform === 'twitch' && channelId && validateChannelId(channelId)) {
    const iframe = document.createElement('iframe');
    const parents = getTwitchParents();
    iframe.src = `https://www.twitch.tv/embed/${encodeURIComponent(channelId)}/chat?parent=${encodeURIComponent(parents[0])}&darkpopout`;
    iframe.style.cssText = 'width: 100%; height: 100%; border: none;';
    iframe.setAttribute('allow', 'autoplay; fullscreen');
    content.appendChild(iframe);
  } else {
    // 对于 YouTube 或其他情况，直接使用原始内容（因为来自我们自己的代码）
    content.innerHTML = chatContentHtml;
  }
  
  separatedChat.appendChild(header);
  separatedChat.appendChild(content);
  
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

// 暴露函數到全局，以便 React 組件可以訪問
if (typeof window !== 'undefined') {
  console.log('[chat.js] 開始初始化聊天室功能...', {
    scriptLoaded: true,
    location: window.location.href,
    documentReadyState: document.readyState
  });
  
  try {
    window.createChat = createChat;
    window.toggleChat = toggleChat;
    window.separateChat = separateChat;
    window.closeSeparatedChat = closeSeparatedChat;
    window.setupChatResizer = setupChatResizer;
    
    console.log('[chat.js] 聊天室功能已初始化', {
      createChat: typeof window.createChat,
      toggleChat: typeof window.toggleChat,
      separateChat: typeof window.separateChat,
      closeSeparatedChat: typeof window.closeSeparatedChat,
      setupChatResizer: typeof window.setupChatResizer,
      allFunctionsExposed: !!(window.createChat && window.toggleChat && window.setupChatResizer)
    });
    
    // 觸發自定義事件，通知其他模組聊天室功能已就緒
    if (typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent('chatFunctionsReady', {
        detail: {
          createChat: typeof window.createChat,
          toggleChat: typeof window.toggleChat,
          setupChatResizer: typeof window.setupChatResizer
        }
      }));
      console.log('[chat.js] 已觸發 chatFunctionsReady 事件');
    }
  } catch (error) {
    console.error('[chat.js] 初始化聊天室功能時發生錯誤:', error);
  }
} else {
  console.error('[chat.js] window 對象不存在，無法初始化聊天室功能');
}

