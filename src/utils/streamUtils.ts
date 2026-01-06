// 串流相關工具函數
import i18n from '../i18n/i18n';


export interface StreamData {
  id: number;
  platform: 'twitch' | 'youtube';
  channelId: string;
  videoId: string;
  originalUrl: string;
  volume: number;
  chatVisible: boolean;
  isMuted?: boolean;
  name?: string | null;
  displayName?: string | null;
  _reloadTrigger?: number; // 用於強制重新加載播放器
  _reloadKey?: number; // 用於強制重新渲染組件
}

export interface UrlValidation {
  valid: boolean;
  error?: string;
  urlObj?: URL;
}

// 驗證 URL
export function validateUrl(url: string): UrlValidation {
  if (!url || typeof url !== 'string') {
    return { valid: false, error: i18n.t('stream:url_empty') };
  }

  // 先檢查是否包含支持的平台域名（更寬鬆的檢查）
  const hasTwitch = url.includes('twitch.tv');
  const hasYouTube = url.includes('youtube.com') || url.includes('youtu.be');

  if (!hasTwitch && !hasYouTube) {
    return { valid: false, error: i18n.t('stream:unsupported_platform') };
  }

  // 嘗試解析 URL
  let urlObj: URL;
  try {
    // 如果 URL 不包含協議，嘗試添加 https://
    const urlToParse = url.startsWith('http://') || url.startsWith('https://') ? url : 'https://' + url;
    urlObj = new URL(urlToParse);
  } catch (e) {
    // 如果仍然失敗，但包含支持的域名，允許通過（讓後續代碼處理）
    if (hasTwitch || hasYouTube) {
      // 創建一個臨時的 URL 對象用於後續處理
      try {
        urlObj = new URL('https://' + url.replace(/^https?:\/\//, ''));
      } catch (e2) {
        return { valid: false, error: i18n.t('stream:url_invalid_format') };
      }
    } else {
      return { valid: false, error: i18n.t('stream:url_invalid_format') };
    }
  }

  // 白名單：只允許 twitch.tv 和 youtube.com/youtu.be
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

// 驗證頻道 ID（只允許字母、數字、下劃線和連字符）
export function validateChannelId(id: string): boolean {
  if (!id || typeof id !== 'string') {
    return false;
  }
  // 只允許字母、數字、下劃線、連字符，長度限制
  return /^[a-zA-Z0-9_-]{1,100}$/.test(id);
}

// 驗證視頻 ID（YouTube 視頻 ID 格式）
export function validateVideoId(id: string): boolean {
  if (!id || typeof id !== 'string') {
    return false;
  }
  // YouTube 視頻 ID 通常是 11 個字符，但允許更短或更長的格式（至少 1 個字符）
  return /^[a-zA-Z0-9_-]{1,100}$/.test(id);
}

// 解析 URL 並提取平台信息
export function parseStreamUrl(url: string): {
  platform: 'twitch' | 'youtube' | null;
  channelId: string;
  videoId: string;
  error?: string;
} {
  const urlValidation = validateUrl(url);
  if (!urlValidation.valid || !urlValidation.urlObj) {
    return {
      platform: null,
      channelId: '',
      videoId: '',
      error: urlValidation.error || i18n.t('stream:url_invalid_format')
    };
  }

  const urlObj = urlValidation.urlObj;
  const hostname = urlObj.hostname.toLowerCase();
  let platform: 'twitch' | 'youtube' | null = null;
  let channelId = '';
  let videoId = '';

  if (hostname.includes('twitch.tv')) {
    const match = url.match(/twitch\.tv\/([^\/\?]+)/);
    if (!match) {
      return {
        platform: null,
        channelId: '',
        videoId: '',
        error: i18n.t('stream:twitch_parse_error')
      };
    }
    channelId = match[1];
    // 驗證頻道 ID
    if (channelId && !validateChannelId(channelId)) {
      return {
        platform: null,
        channelId: '',
        videoId: '',
        error: i18n.t('stream:twitch_id_invalid')
      };
    }
    platform = 'twitch';
  } else if (hostname.includes('youtube.com') || hostname.includes('youtu.be')) {
    // 嘗試從 URL 中提取 channelId（如果存在）
    const channelMatch = url.match(/youtube\.com\/channel\/([^\/\?]+)/);
    if (channelMatch) {
      channelId = channelMatch[1];
    }

    if (url.includes('youtube.com/live/')) {
      videoId = url.split('live/')[1]?.split('?')[0] || '';
    } else if (url.includes('youtube.com/watch')) {
      videoId = urlObj.searchParams.get('v') || '';
    } else if (url.includes('youtu.be/')) {
      videoId = url.split('youtu.be/')[1]?.split('?')[0] || '';
    } else if (url.includes('youtube.com/channel/') && url.includes('/live')) {
      return {
        platform: null,
        channelId: '',
        videoId: '',
        error: i18n.t('stream:youtube_url_guide')
      };
    }

    if (!videoId) {
      return {
        platform: null,
        channelId: '',
        videoId: '',
        error: i18n.t('stream:youtube_parse_error')
      };
    }

    // 驗證視頻 ID
    if (videoId && !validateVideoId(videoId)) {
      return {
        platform: null,
        channelId: '',
        videoId: '',
        error: i18n.t('stream:youtube_video_id_invalid', { videoId })
      };
    }
    platform = 'youtube';
  } else {
    return {
      platform: null,
      channelId: '',
      videoId: '',
      error: i18n.t('stream:unsupported_platform')
    };
  }

  return {
    platform,
    channelId,
    videoId
  };
}

