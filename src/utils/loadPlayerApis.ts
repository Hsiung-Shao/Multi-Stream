// 載入播放器 API 的工具函數

/**
 * 載入 Twitch Player API
 */
export function loadTwitchPlayerApi(): Promise<void> {
  return new Promise((resolve, reject) => {
    // 檢查是否已經載入
    if (typeof window.Twitch !== 'undefined' && window.Twitch.Player) {
      resolve();
      return;
    }

    // 檢查腳本是否已經存在
    const existingTwitch = document.querySelector('script[src*="player.twitch.tv"]');
    if (existingTwitch) {
      // 腳本已存在，等待載入
      const checkTwitch = setInterval(() => {
        if (typeof window.Twitch !== 'undefined' && window.Twitch.Player) {
          clearInterval(checkTwitch);
          resolve();
        }
      }, 100);

      // 設置超時（10秒）
      setTimeout(() => {
        clearInterval(checkTwitch);
        if (typeof window.Twitch === 'undefined') {
          reject(new Error('Twitch API 載入超時'));
        }
      }, 10000);
      return;
    }

    // 載入 Twitch Player API
    const twitchScript = document.createElement('script');
    twitchScript.async = true;
    twitchScript.src = 'https://player.twitch.tv/js/embed/v1.js';
    
    twitchScript.onload = () => {
      // 等待 Twitch 對象可用
      const checkTwitch = setInterval(() => {
        if (typeof window.Twitch !== 'undefined' && window.Twitch.Player) {
          clearInterval(checkTwitch);
          resolve();
        }
      }, 100);

      // 設置超時（10秒）
      setTimeout(() => {
        clearInterval(checkTwitch);
        if (typeof window.Twitch === 'undefined') {
          reject(new Error('Twitch API 載入超時'));
        }
      }, 10000);
    };

    twitchScript.onerror = () => {
      console.warn('無法載入 Twitch embed API，請檢查網路連線');
      // 嘗試重新載入
      setTimeout(() => {
        if (typeof window.Twitch === 'undefined' && !document.querySelector('script[src*="player.twitch.tv"]')) {
          const retryScript = document.createElement('script');
          retryScript.async = true;
          retryScript.src = 'https://player.twitch.tv/js/embed/v1.js';
          retryScript.onload = () => {
            const checkTwitch = setInterval(() => {
              if (typeof window.Twitch !== 'undefined' && window.Twitch.Player) {
                clearInterval(checkTwitch);
                resolve();
              }
            }, 100);
            setTimeout(() => {
              clearInterval(checkTwitch);
              if (typeof window.Twitch === 'undefined') {
                reject(new Error('Twitch API 載入超時'));
              }
            }, 10000);
          };
          retryScript.onerror = () => {
            reject(new Error('無法載入 Twitch embed API'));
          };
          document.head.appendChild(retryScript);
        } else {
          reject(new Error('無法載入 Twitch embed API'));
        }
      }, 2000);
    };

    document.head.appendChild(twitchScript);
  });
}

/**
 * 載入 YouTube iframe API
 */
export function loadYouTubeIframeApi(): Promise<void> {
  return new Promise((resolve, reject) => {
    // 檢查是否已經載入
    if (typeof window.YT !== 'undefined' && window.YT.Player) {
      resolve();
      return;
    }

    // 檢查腳本是否已經存在
    const existingYouTube = document.querySelector('script[src*="youtube.com/iframe_api"]');
    if (existingYouTube) {
      // 腳本已存在，等待載入
      const checkYouTube = setInterval(() => {
        if (typeof window.YT !== 'undefined' && window.YT.Player) {
          clearInterval(checkYouTube);
          resolve();
        }
      }, 100);

      // 設置超時（10秒）
      setTimeout(() => {
        clearInterval(checkYouTube);
        if (typeof window.YT === 'undefined') {
          reject(new Error('YouTube API 載入超時'));
        }
      }, 10000);
      return;
    }

    // 設置全局回調函數
    (window as any).onYouTubeIframeAPIReady = () => {
      resolve();
    };

    // 載入 YouTube iframe API
    const youtubeScript = document.createElement('script');
    youtubeScript.async = true;
    youtubeScript.src = 'https://www.youtube.com/iframe_api';
    
    youtubeScript.onerror = () => {
      console.warn('無法載入 YouTube iframe API，請檢查網路連線');
      // 嘗試重新載入
      setTimeout(() => {
        if (typeof window.YT === 'undefined' && !document.querySelector('script[src*="youtube.com/iframe_api"]')) {
          const retryScript = document.createElement('script');
          retryScript.async = true;
          retryScript.src = 'https://www.youtube.com/iframe_api';
          retryScript.onerror = () => {
            reject(new Error('無法載入 YouTube iframe API'));
          };
          document.head.appendChild(retryScript);
        } else {
          reject(new Error('無法載入 YouTube iframe API'));
        }
      }, 2000);
    };

    document.head.appendChild(youtubeScript);
  });
}

/**
 * 載入所有播放器 API
 */
export async function loadAllPlayerApis(): Promise<void> {
  try {
    await Promise.all([
      loadTwitchPlayerApi(),
      loadYouTubeIframeApi()
    ]);
  } catch (error) {
    console.error('載入播放器 API 時發生錯誤:', error);
    // 不阻止應用繼續運行，只是記錄錯誤
  }
}

