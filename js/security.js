/*
MIGRATED (PR D): legacy security.js fully disabled.
All implementations are in src/utils/security/** and are exposed via initLegacyGlobals.ts
Do not re-enable this file.

// 安全工具函数
// ============================================
// 遷移狀態說明：
// - escapeHtml: 仍在使用（settings.js 中大量使用，生成 HTML）
// - safeJSONParse: 仍在使用（settings.js 中大量使用，解析 localStorage）
// - validateUrl: 已遷移到 React (streamUtils.ts)，但保留以兼容
// ============================================

// HTML 转义函数（防止 XSS）
// [仍在使用] 在 settings.js 中大量使用（生成 HTML 內容）
// 增強版本：確保所有特殊字符都被正確轉義
function escapeHtml(text) {
  if (text == null || text === undefined) return '';
  // 確保是字符串類型
  const str = String(text);
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// 安全的 JSON 解析（带错误处理）
// [仍在使用] 在 settings.js 中大量使用（解析 localStorage）
function safeJSONParse(str, defaultValue = null) {
  if (!str || typeof str !== 'string') {
    return defaultValue;
  }
  try {
    return JSON.parse(str);
  } catch (e) {
    // JSON parse error，靜默處理
    return defaultValue;
  }
}

// URL 验证函数
// [已遷移到 React] 新實現位於 src/utils/streamUtils.ts
// 保留此函數以向後兼容
function validateUrl(url) {
  if (!url || typeof url !== 'string') {
    return { valid: false, error: 'URL 不能為空' };
  }
  
  // 先检查是否包含支持的平台域名（更宽松的检查）
  const hasTwitch = url.includes('twitch.tv');
  const hasYouTube = url.includes('youtube.com') || url.includes('youtu.be');
  
  if (!hasTwitch && !hasYouTube) {
    return { valid: false, error: '不支援的平台，目前支援 Twitch、YouTube' };
  }
  
  // 尝试解析 URL
  let urlObj;
  try {
    // 如果 URL 不包含协议，尝试添加 https://
    const urlToParse = url.startsWith('http://') || url.startsWith('https://') ? url : 'https://' + url;
    urlObj = new URL(urlToParse);
  } catch (e) {
    // 如果仍然失败，但包含支持的域名，允许通过（让后续代码处理）
    if (hasTwitch || hasYouTube) {
      // 创建一个临时的 URL 对象用于后续处理
      try {
        urlObj = new URL('https://' + url.replace(/^https?:\/\//, ''));
      } catch (e2) {
        return { valid: false, error: '無效的 URL 格式' };
      }
    } else {
      return { valid: false, error: '無效的 URL 格式' };
    }
  }
  
  // 白名单：只允许 twitch.tv 和 youtube.com/youtu.be
  const allowedDomains = [
    'twitch.tv',
    'www.twitch.tv',
    'youtube.com',
    'www.youtube.com',
    'youtu.be',
    'm.youtube.com'
  ];
  
  const hostname = urlObj.hostname.toLowerCase();
  const isAllowed = allowedDomains.some(domain => 
    hostname === domain || hostname.endsWith('.' + domain)
  );
  
  if (!isAllowed) {
    return { valid: false, error: '不支援的域名，目前只支援 Twitch 和 YouTube' };
  }
  
  return { valid: true, urlObj };
}

// 验证频道 ID/视频 ID（只允许字母、数字、下划线和连字符）
// 增強版本：更嚴格的驗證以防止注入攻擊
function validateChannelId(id) {
  if (!id || typeof id !== 'string') {
    return false;
  }
  // 移除前後空白
  const trimmed = id.trim();
  if (trimmed.length === 0 || trimmed.length > 100) {
    return false;
  }
  // 只允许字母、数字、下划线、连字符，長度限制
  // 禁止任何可能的注入字符（如 < > " ' / \ 等）
  return /^[a-zA-Z0-9_-]+$/.test(trimmed);
}

// 验证视频 ID（YouTube 视频 ID 格式）
// 增強版本：更嚴格的驗證以防止注入攻擊
function validateVideoId(id) {
  if (!id || typeof id !== 'string') {
    return false;
  }
  // 移除前後空白
  const trimmed = id.trim();
  if (trimmed.length === 0 || trimmed.length > 100) {
    return false;
  }
  // YouTube 视频 ID 通常是 11 个字符，但允许更短或更长的格式（至少 1 个字符）
  // 禁止任何可能的注入字符（如 < > " ' / \ 等）
  return /^[a-zA-Z0-9_-]+$/.test(trimmed);
}

*/
