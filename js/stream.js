// 串流管理功能

// 主要加入函式
async function addStream(url = null) {
  if (!url) url = document.getElementById('url-input').value.trim();
  if (!url) return alert('請輸入直播網址或頻道名稱');
  
  // 清空輸入框
  document.getElementById('url-input').value = '';
  
  // 隱藏搜尋建議
  if (typeof hideSearchSuggestions === 'function') {
    hideSearchSuggestions();
  }

  // 如果輸入的不是 URL，嘗試搜尋 Twitch 頻道
  if (!url.includes('http://') && !url.includes('https://') && 
      !url.includes('twitch.tv/') && !url.includes('youtube.com') && 
      !url.includes('youtu.be/')) {
    // 可能是頻道名稱，嘗試搜尋
    if (window.twitchApi && window.twitchApi.searchChannels) {
      try {
        const results = await window.twitchApi.searchChannels(url, 1);
        if (results && results.length > 0) {
          // 使用第一個搜尋結果
          url = results[0].url;
        } else {
          alert(`找不到頻道 "${url}"，請輸入完整的 Twitch 或 YouTube 網址`);
          return;
        }
      } catch (error) {
        console.error('搜尋頻道失敗:', error);
        alert(`搜尋頻道失敗: ${error.message}。請直接輸入完整的 Twitch 或 YouTube 網址`);
        return;
      }
    } else {
      alert('請輸入完整的 Twitch 或 YouTube 網址');
      return;
    }
  }

  // 先验证 URL，再创建 DOM（避免无效 URL 创建 DOM 后又被移除）
  const urlValidation = validateUrl(url);
  if (!urlValidation.valid) {
    alert(urlValidation.error);
    return;
  }
  
  const id = ++streamCount;
  const box = document.createElement('div');
  box.className = 'stream-box';
  box.id = 'box' + id;
  box.dataset.streamId = id;
  
  // 使用安全的 DOM 操作替代 innerHTML
  const controls = document.createElement('div');
  controls.className = 'controls';
  
  const streamLabel = document.createElement('span');
  streamLabel.className = 'stream-label';
  streamLabel.textContent = '#' + id;
  
  const volumeControl = document.createElement('div');
  volumeControl.className = 'volume-control';
  
  const volumeIcon = document.createElement('span');
  volumeIcon.style.fontSize = '11px';
  volumeIcon.textContent = '🔊';
  
  const volumeSlider = document.createElement('input');
  volumeSlider.type = 'range';
  volumeSlider.className = 'volume';
  volumeSlider.min = '0';
  volumeSlider.max = '100';
  volumeSlider.value = '100';
  
  const volValue = document.createElement('span');
  volValue.className = 'vol-value';
  volValue.textContent = '100%';
  
  volumeControl.appendChild(volumeIcon);
  volumeControl.appendChild(volumeSlider);
  volumeControl.appendChild(volValue);
  
  const chatBtn = document.createElement('button');
  chatBtn.className = 'control-btn';
  chatBtn.title = '切換聊天室';
  chatBtn.textContent = '💬';
  chatBtn.onclick = () => toggleChat(id);
  
  const separateBtn = document.createElement('button');
  separateBtn.className = 'control-btn';
  separateBtn.title = '分離聊天室';
  separateBtn.textContent = '🔗';
  separateBtn.onclick = () => separateChat(id);
  
  const closeBtn = document.createElement('span');
  closeBtn.className = 'close';
  closeBtn.title = '移除';
  closeBtn.textContent = '×';
  closeBtn.onclick = () => removeBox(id);
  
  controls.appendChild(streamLabel);
  controls.appendChild(volumeControl);
  controls.appendChild(chatBtn);
  controls.appendChild(separateBtn);
  controls.appendChild(closeBtn);
  
  const contentWrapper = document.createElement('div');
  contentWrapper.className = 'content-wrapper layout-vertical';
  contentWrapper.id = 'content-wrapper' + id;
  
  const playerContainer = document.createElement('div');
  playerContainer.className = 'player-container';
  playerContainer.id = 'player' + id;
  
  const chatContainer = document.createElement('div');
  chatContainer.className = 'chat-container';
  chatContainer.id = 'chat' + id;
  
  const chatResizer = document.createElement('div');
  chatResizer.className = 'chat-resizer';
  chatResizer.id = 'chat-resizer' + id;
  
  chatContainer.appendChild(chatResizer);
  contentWrapper.appendChild(playerContainer);
  contentWrapper.appendChild(chatContainer);
  
  const resizer = document.createElement('div');
  resizer.className = 'resizer';
  
  box.appendChild(controls);
  box.appendChild(contentWrapper);
  box.appendChild(resizer);
  
  container.appendChild(box);
  
  let platform = '';
  let channelId = '';
  let videoId = '';
  let originalUrl = url;
  const urlObj = urlValidation.urlObj;
  const hostname = urlObj.hostname.toLowerCase();

  if (hostname.includes('twitch.tv')) {
    const match = url.match(/twitch\.tv\/([^\/\?]+)/);
    if (!match) {
      alert('無法解析 Twitch 網址');
      box.remove();
      return;
    }
    channelId = match[1];
    // 验证频道 ID（如果存在且不为空）
    if (channelId && !validateChannelId(channelId)) {
      alert('無效的 Twitch 頻道 ID');
      box.remove();
      return;
    }
    platform = 'twitch';
  } 
  else if (hostname.includes('youtube.com') || hostname.includes('youtu.be')) {
    if (url.includes('youtube.com/live/')) {
      videoId = url.split('live/')[1]?.split('?')[0];
    } else if (url.includes('youtube.com/watch')) {
      videoId = urlObj.searchParams.get('v');
    } else if (url.includes('youtu.be/')) {
      videoId = url.split('youtu.be/')[1]?.split('?')[0];
    }
    
    if (!videoId) {
      alert('無法解析 YouTube 網址');
      box.remove();
      return;
    }
    // 验证视频 ID（如果存在且不为空）
    if (videoId && !validateVideoId(videoId)) {
      alert('無效的 YouTube 視頻 ID');
      box.remove();
      return;
    }
    platform = 'youtube';
  } else {
    alert('不支援的平台，目前支援 Twitch、YouTube');
    box.remove();
    return;
  }

  // 儲存串流資訊
  // YouTube 聊天室預設為隱藏（因為無法跨域顯示）
  streamData[id] = {
    platform,
    channelId,
    videoId,
    originalUrl,
    volume: 100,
    chatVisible: platform !== 'youtube' // YouTube 預設隱藏，其他平台預設顯示
  };

  // 建立播放器
  if (platform === 'twitch') {
    createTwitchPlayer(id, channelId);
  } else if (platform === 'youtube') {
    createYouTubePlayer(id, videoId);
  }

  // 建立聊天室
  createChat(id, platform, channelId, videoId);

  // 設定聊天室調整大小功能
  setupChatResizer(id);
  
  // 如果聊天室預設為隱藏（如YouTube），立即隱藏
  if (!streamData[id].chatVisible) {
    const chatDiv = document.getElementById('chat' + id);
    const resizer = document.getElementById('chat-resizer' + id);
    if (chatDiv) {
      chatDiv.classList.add('hidden');
    }
    if (resizer) {
      resizer.style.display = 'none';
    }
  }

  // 音量控制
  setupVolumeControl(box, id);
  
  // 確保在播放器就緒後應用總音量（延遲檢查，因為播放器可能還沒就緒）
  setTimeout(() => {
    if (typeof applyMasterVolumeToStream === 'function') {
      applyMasterVolumeToStream(id);
    }
  }, 1500);

  // 預設位置
  const size = 500;
  box.style.width = size + 'px';
  box.style.height = (size * 9/16 + 295) + 'px';
  box.style.right = '20px';
  box.style.bottom = (20 + (id-1)*30) + 'px';

  makeDraggableResizable(box);
  
  // 點擊選中
  box.addEventListener('click', () => {
    document.querySelectorAll('.stream-box').forEach(b => b.classList.remove('active'));
    box.classList.add('active');
  });
  
  // 更新串流順序列表（检查函数是否已定义）
  if (typeof updateStreamOrderList === 'function') {
    updateStreamOrderList();
  }
  
  // 检查当前布局类型（布局12或13的特征：有chat-sidebar-fixed）
  const chatSidebarFixed = document.getElementById('chat-sidebar-fixed');
  const isFixedLayout = !!chatSidebarFixed;
  
  // 如果是布局12或13，更新框架；否则自动应用最适合的布局
  if (isFixedLayout && typeof updateFixedLayoutFramework === 'function') {
    setTimeout(() => {
      updateFixedLayoutFramework();
    }, 300);
  } else {
    // 添加新串流後自動應用最適合的布局
    setTimeout(() => {
      if (typeof autoSelectLayout === 'function' && typeof setLayout === 'function') {
        const layoutType = autoSelectLayout();
        setLayout(layoutType);
      }
    }, 100);
  }
  
  // 檢查並調整控制面板狀態（有串流時使用用戶設置）
  if (typeof checkAndAdjustControlPanel === 'function') {
    checkAndAdjustControlPanel();
  }
  
  // 如果有串流且廣告已啟用，檢查是否可以顯示廣告（符合 AdSense 政策要求）
  if (typeof checkAndShowAd === 'function' && typeof adConfig !== 'undefined' && adConfig.enabled) {
    // 延遲檢查，確保串流已完全載入
    setTimeout(() => {
      checkAndShowAd();
    }, 2000);
  }
}

// 建立 Twitch 播放器
function createTwitchPlayer(id, channel) {
  const parentDomains = getTwitchParents();
  
  const options = {
    width: '100%',
    height: '100%',
    channel: channel,
    parent: parentDomains,
    autoplay: true,
    muted: false
  };
  
  try {
    const playerDiv = document.getElementById('player' + id);
    const player = new Twitch.Player('player' + id, options);
    
    players[id] = {
      type: 'twitch',
      player: player
    };
    
    player.addEventListener(Twitch.Player.READY, () => {
      // 應用總音量控制
      applyMasterVolumeToStream(id);
    });
    
    player.addEventListener(Twitch.Player.ERROR, () => {
      // Twitch player error，靜默處理
      alert('無法載入 Twitch 直播，請確認：\n1. 頻道名稱正確\n2. 頻道正在直播\n3. 使用 http://localhost 而非 file:// 開啟網頁');
    });
  } catch (error) {
    // Error creating Twitch player，靜默處理
    alert('無法建立 Twitch 播放器。請確認使用 http://localhost 開啟網頁，而非直接開啟檔案。');
  }
}

// 建立 YouTube 播放器
function createYouTubePlayer(id, videoId) {
  // 等待 API 準備就緒
  const initPlayer = () => {
    if (typeof YT !== 'undefined' && YT.Player) {
      try {
        const playerDiv = document.getElementById('player' + id);
        const player = new YT.Player('player' + id, {
          videoId: videoId,
          width: '100%',
          height: '100%',
          playerVars: {
            autoplay: 1,
            mute: 0,
            rel: 0,
            modestbranding: 1,
            playsinline: 1,
            enablejsapi: 1,
            origin: window.location.protocol === 'https:' ? window.location.origin : 'http://localhost'
          },
          events: {
            onReady: (event) => {
              // 應用總音量控制
              applyMasterVolumeToStream(id);
            },
            onError: (event) => {
              // YouTube player error，靜默處理
              let errorMsg = '無法載入 YouTube 直播';
              switch(event.data) {
                case 2: errorMsg += '：無效的影片 ID'; break;
                case 5: errorMsg += '：HTML5 播放器錯誤'; break;
                case 100: errorMsg += '：影片不存在或已被刪除'; break;
                case 101: 
                case 150: errorMsg += '：此影片不允許嵌入播放'; break;
              }
              alert(errorMsg);
            }
          }
        });
        
        players[id] = {
          type: 'youtube',
          player: player
        };
      } catch (error) {
        // Error creating YouTube player，靜默處理
        alert('無法建立 YouTube 播放器。請確認使用 http://localhost 開啟網頁。');
      }
    } else {
      setTimeout(initPlayer, 100);
    }
  };
  
  initPlayer();
}

function removeBox(id) {
  const box = document.getElementById('box' + id);
  if (box) {
    // 清理播放器
    if (players[id]) {
      if (players[id].type === 'youtube' && players[id].player.destroy) {
        players[id].player.destroy();
      }
      delete players[id];
    }
    
    // 移除分離的聊天室（如果存在）
    const separatedChat = document.getElementById('separated-chat-' + id);
    if (separatedChat) {
      separatedChat.remove();
    }
    
    delete streamData[id];
    box.remove();
    
    // 更新串流順序列表（检查函数是否已定义）
    if (typeof updateStreamOrderList === 'function') {
      updateStreamOrderList();
    }
    
    // 检查当前布局类型（布局12或13的特征：有chat-sidebar-fixed）
    const chatSidebarFixedAfter = document.getElementById('chat-sidebar-fixed');
    const isFixedLayoutAfter = !!chatSidebarFixedAfter;
    
    // 如果是固定布局，更新框架
    if (isFixedLayoutAfter && typeof updateFixedLayoutFramework === 'function') {
      setTimeout(() => {
        updateFixedLayoutFramework();
      }, 100);
    } else {
      // 如果不是固定布局，觸發自動排版
      const remainingBoxes = document.querySelectorAll('.stream-box');
      if (remainingBoxes.length > 0 && typeof autoSelectLayout === 'function' && typeof setLayout === 'function') {
        setTimeout(() => {
          const layoutType = autoSelectLayout();
          if (layoutType) {
            setLayout(layoutType, true); // 立即執行，不使用防抖
          }
        }, 100);
      }
    }
    
    // 檢查並調整控制面板狀態（如果沒有串流則強制展開）
    if (typeof checkAndAdjustControlPanel === 'function') {
      checkAndAdjustControlPanel();
    }
  }
}

function clearAll() {
  if (confirm('確定要清空所有畫面？')) {
    // 清理所有播放器
    Object.keys(players).forEach(id => {
      if (players[id].type === 'youtube' && players[id].player.destroy) {
        players[id].player.destroy();
      }
    });
    players = {};
    streamData = {};
    container.innerHTML = '';
    streamCount = 0;
    
    // 檢查並調整控制面板狀態（沒有串流時強制展開）
    if (typeof checkAndAdjustControlPanel === 'function') {
      checkAndAdjustControlPanel();
    }
  }
}

// 本地儲存布局
function saveLayout() {
  const layout = [];
  document.querySelectorAll('.stream-box').forEach(box => {
    const id = parseInt(box.dataset.streamId);
    const data = streamData[id];
    if (data) {
      layout.push({
        url: data.originalUrl,
        style: {
          left: box.style.left,
          top: box.style.top,
          width: box.style.width,
          height: box.style.height
        },
        volume: data.volume,
        chatVisible: data.chatVisible
      });
    }
  });
  
  if (layout.length === 0) {
    alert('沒有可儲存的布局');
    return;
  }
  
  try {
    localStorage.setItem('multiStreamLayout', JSON.stringify(layout));
  } catch (e) {
    // 保存布局失敗，靜默處理
    alert('保存布局失敗，可能是存儲空間不足');
  }
  alert('布局已儲存！');
}

function loadLayout() {
  const saved = localStorage.getItem('multiStreamLayout');
  if (!saved) {
    alert('沒有儲存的布局');
    return;
  }
  
  if (!confirm('載入會清空目前畫面，確定？')) return;
  
  // 清理現有播放器
  Object.keys(players).forEach(id => {
    if (players[id].type === 'youtube' && players[id].player.destroy) {
      players[id].player.destroy();
    }
  });
  players = {};
  streamData = {};
  container.innerHTML = '';
  streamCount = 0;
  
  // 使用安全的 JSON 解析
  const layout = safeJSONParse(saved, []);
  if (!Array.isArray(layout)) {
    alert('無效的布局數據格式');
    return;
  }
  
  // 依序加入串流
  layout.forEach((item, index) => {
    setTimeout(() => {
      addStream(item.url);
      
      // 等待播放器建立後套用設定
      setTimeout(() => {
        const boxes = document.querySelectorAll('.stream-box');
        const box = boxes[boxes.length - 1];
        if (box && item.style) {
          Object.assign(box.style, item.style);
          
          const id = parseInt(box.dataset.streamId);
          if (streamData[id]) {
            streamData[id].volume = item.volume || 100;
            streamData[id].chatVisible = item.chatVisible !== undefined ? item.chatVisible : true;
            
            // 設定音量
            const volSlider = box.querySelector('.volume');
            if (volSlider) {
              volSlider.value = streamData[id].volume;
              // 應用總音量控制
              if (typeof applyMasterVolumeToStream === 'function') {
                setTimeout(() => {
                  applyMasterVolumeToStream(id);
                }, 500);
              } else {
                volSlider.dispatchEvent(new Event('input'));
              }
            }
            
            // 設定聊天室顯示
            if (!streamData[id].chatVisible) {
              toggleChat(id);
            }
          }
        }
      }, 2000);
    }, index * 500);
  });
}

