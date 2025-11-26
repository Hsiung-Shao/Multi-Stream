// 工具函數

// YouTube API 準備就緒
let ytApiReady = false;
function onYouTubeIframeAPIReady() {
  ytApiReady = true;
}

// 拖拽狀態標誌（防止在拖拽過程中觸發布局更新）
let isDraggingStreamBox = false;

// 獲取有效的 parent 域名
function getParentDomain() {
  const hostname = window.location.hostname;
  const protocol = window.location.protocol;
  const port = window.location.port;
  
  // 如果是 file:// 協議，使用 localhost
  if (protocol === 'file:' || !hostname || hostname === '') {
    return 'localhost';
  }
  
  // 如果是 localhost 或 127.0.0.1，返回 localhost（不包含端口）
  // Twitch 的 CSP 允許 http://localhost:* 和 https://localhost:*
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0') {
    return 'localhost';
  }
  
  // 返回實際的 hostname（不包含端口，Twitch 會自動處理端口）
  return hostname;
}

// 獲取 Twitch parent 陣列（支援多個域名）
function getTwitchParents() {
  const domain = getParentDomain();
  // Twitch CSP 允許 http://localhost:* 和 https://localhost:*
  // 所以我們只需要返回 'localhost'，不需要包含端口
  if (domain === 'localhost') {
    return ['localhost'];
  }
  return [domain];
}

