// 載入播放器 API 的工具函數
// 注意：此文件保留用於向後兼容，實際載入邏輯已遷移到 apiLoader.ts

import { apiLoader } from './apiLoader';

/**
 * 載入 Twitch Player API
 * @deprecated 請使用 apiLoader.loadTwitchPlayerApi()，此函數僅用於向後兼容
 */
export function loadTwitchPlayerApi(): Promise<void> {
  return apiLoader.loadTwitchPlayerApi();
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
 * @deprecated 請使用 apiLoader.loadYouTubePlayerApi()，此函數僅用於向後兼容
 */
export function loadYouTubeIframeApi(): Promise<void> {
  return apiLoader.loadYouTubePlayerApi();
}

/**
 * 載入所有播放器 API
 * @deprecated 請使用 apiLoader.loadAllPlayerApis()，此函數僅用於向後兼容
 */
export async function loadAllPlayerApis(): Promise<void> {
  return apiLoader.loadAllPlayerApis();
}

