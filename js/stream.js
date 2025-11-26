// 串流管理功能

// 主要加入函式
function addStream(url = null) {
  if (!url) url = document.getElementById('url-input').value.trim();
  if (!url) return alert('請輸入直播網址');
  
  // 清空輸入框
  document.getElementById('url-input').value = '';

  const id = ++streamCount;
  const box = document.createElement('div');
  box.className = 'stream-box';
  box.id = 'box' + id;
  box.dataset.streamId = id;
  
  box.innerHTML = `
    <div class="controls">
      <span class="stream-label">#${id}</span>
      <div class="volume-control">
        <span style="font-size: 11px;">🔊</span>
        <input type="range" class="volume" min="0" max="100" value="100">
        <span class="vol-value">100%</span>
      </div>
      <button class="control-btn" onclick="toggleChat(${id})" title="切換聊天室">💬</button>
      <button class="control-btn" onclick="separateChat(${id})" title="分離聊天室">🔗</button>
      <span class="close" onclick="removeBox(${id})" title="移除">×</span>
    </div>
    <div class="content-wrapper layout-vertical" id="content-wrapper${id}">
      <div class="player-container" id="player${id}"></div>
      <div class="chat-container" id="chat${id}">
        <div class="chat-resizer" id="chat-resizer${id}"></div>
      </div>
    </div>
    <div class="resizer"></div>
  `;
  
  container.appendChild(box);

  // 解析來源
  let platform = '';
  let channelId = '';
  let videoId = '';
  let originalUrl = url;

  if (url.includes('twitch.tv')) {
    const match = url.match(/twitch\.tv\/([^\/\?]+)/);
    if (!match) {
      alert('無法解析 Twitch 網址');
      box.remove();
      return;
    }
    channelId = match[1];
    platform = 'twitch';
  } 
  else if (url.includes('youtube.com') || url.includes('youtu.be')) {
    if (url.includes('youtube.com/live/')) {
      videoId = url.split('live/')[1]?.split('?')[0];
    } else if (url.includes('youtube.com/watch')) {
      videoId = new URL(url).searchParams.get('v');
    } else if (url.includes('youtu.be/')) {
      videoId = url.split('youtu.be/')[1]?.split('?')[0];
    }
    
    if (!videoId) {
      alert('無法解析 YouTube 網址');
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
  streamData[id] = {
    platform,
    channelId,
    videoId,
    originalUrl,
    volume: 100,
    chatVisible: true
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

  // 音量控制
  setupVolumeControl(box, id);

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
  
  // 更新串流順序列表
  updateStreamOrderList();
  
  // 添加新串流後自動應用最適合的布局
  setTimeout(() => {
    const layoutType = autoSelectLayout();
    setLayout(layoutType);
  }, 100);
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
      player.setVolume(1.0);
    });
    
    player.addEventListener(Twitch.Player.ERROR, () => {
      console.error('Twitch player error for channel:', channel);
      alert('無法載入 Twitch 直播，請確認：\n1. 頻道名稱正確\n2. 頻道正在直播\n3. 使用 http://localhost 而非 file:// 開啟網頁');
    });
  } catch (error) {
    console.error('Error creating Twitch player:', error);
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
            origin: window.location.origin || 'http://localhost'
          },
          events: {
            onReady: (event) => {
              event.target.setVolume(100);
            },
            onError: (event) => {
              console.error('YouTube player error:', event.data);
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
        console.error('Error creating YouTube player:', error);
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
    
    // 更新串流順序列表
    updateStreamOrderList();
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
  
  localStorage.setItem('multiStreamLayout', JSON.stringify(layout));
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
  
  const layout = JSON.parse(saved);
  
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
              volSlider.dispatchEvent(new Event('input'));
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

