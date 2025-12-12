// 統一的 API 載入管理器
// 管理所有外部 API 的載入，包括播放器 API 和數據 API

/**
 * API 載入狀態
 */
export type ApiLoadStatus = 'idle' | 'loading' | 'loaded' | 'error';

interface ApiLoaderState {
  twitchPlayer: ApiLoadStatus;
  youtubePlayer: ApiLoadStatus;
  twitchData: ApiLoadStatus;
  youtubeData: ApiLoadStatus;
}

class ApiLoader {
  private state: ApiLoaderState = {
    twitchPlayer: 'idle',
    youtubePlayer: 'idle',
    twitchData: 'idle',
    youtubeData: 'idle',
  };

  private loadPromises: Map<string, Promise<void>> = new Map();

  /**
   * 載入 Twitch Player API（播放器嵌入用）
   */
  async loadTwitchPlayerApi(): Promise<void> {
    if (this.state.twitchPlayer === 'loaded') {
      return Promise.resolve();
    }

    if (this.state.twitchPlayer === 'loading') {
      return this.loadPromises.get('twitchPlayer') || Promise.resolve();
    }

    this.state.twitchPlayer = 'loading';
    const promise = new Promise<void>((resolve, reject) => {
      // 檢查是否已經載入
      if (typeof window.Twitch !== 'undefined' && window.Twitch.Player) {
        this.state.twitchPlayer = 'loaded';
        resolve();
        return;
      }

      // 檢查腳本是否已經存在
      const existingTwitch = document.querySelector('script[src*="player.twitch.tv"]');
      if (existingTwitch) {
        const checkTwitch = setInterval(() => {
          if (typeof window.Twitch !== 'undefined' && window.Twitch.Player) {
            clearInterval(checkTwitch);
            this.state.twitchPlayer = 'loaded';
            resolve();
          }
        }, 100);

        setTimeout(() => {
          clearInterval(checkTwitch);
          if (typeof window.Twitch === 'undefined') {
            this.state.twitchPlayer = 'error';
            reject(new Error('Twitch Player API 載入超時'));
          }
        }, 10000);
        return;
      }

      // 載入 Twitch Player API
      const twitchScript = document.createElement('script');
      twitchScript.async = true;
      twitchScript.src = 'https://player.twitch.tv/js/embed/v1.js';

      twitchScript.onload = () => {
        const checkTwitch = setInterval(() => {
          if (typeof window.Twitch !== 'undefined' && window.Twitch.Player) {
            clearInterval(checkTwitch);
            this.state.twitchPlayer = 'loaded';
            resolve();
          }
        }, 100);

        setTimeout(() => {
          clearInterval(checkTwitch);
          if (typeof window.Twitch === 'undefined') {
            this.state.twitchPlayer = 'error';
            reject(new Error('Twitch Player API 載入超時'));
          }
        }, 10000);
      };

      twitchScript.onerror = () => {
        this.state.twitchPlayer = 'error';
        reject(new Error('無法載入 Twitch Player API'));
      };

      document.head.appendChild(twitchScript);
    });

    this.loadPromises.set('twitchPlayer', promise);
    return promise.catch((error) => {
      this.state.twitchPlayer = 'error';
      throw error;
    });
  }

  /**
   * 載入 YouTube iframe API（播放器嵌入用）
   */
  async loadYouTubePlayerApi(): Promise<void> {
    if (this.state.youtubePlayer === 'loaded') {
      return Promise.resolve();
    }

    if (this.state.youtubePlayer === 'loading') {
      return this.loadPromises.get('youtubePlayer') || Promise.resolve();
    }

    this.state.youtubePlayer = 'loading';
    const promise = new Promise<void>((resolve, reject) => {
      // 檢查是否已經載入
      if (typeof window.YT !== 'undefined' && window.YT.Player) {
        this.state.youtubePlayer = 'loaded';
        resolve();
        return;
      }

      // 檢查腳本是否已經存在
      const existingYouTube = document.querySelector('script[src*="youtube.com/iframe_api"]');
      if (existingYouTube) {
        const checkYouTube = setInterval(() => {
          if (typeof window.YT !== 'undefined' && window.YT.Player) {
            clearInterval(checkYouTube);
            this.state.youtubePlayer = 'loaded';
            resolve();
          }
        }, 100);

        setTimeout(() => {
          clearInterval(checkYouTube);
          if (typeof window.YT === 'undefined') {
            this.state.youtubePlayer = 'error';
            reject(new Error('YouTube Player API 載入超時'));
          }
        }, 10000);
        return;
      }

      // 設置全局回調函數
      (window as any).onYouTubeIframeAPIReady = () => {
        this.state.youtubePlayer = 'loaded';
        resolve();
      };

      // 載入 YouTube iframe API
      const youtubeScript = document.createElement('script');
      youtubeScript.async = true;
      youtubeScript.src = 'https://www.youtube.com/iframe_api';

      youtubeScript.onerror = () => {
        this.state.youtubePlayer = 'error';
        reject(new Error('無法載入 YouTube Player API'));
      };

      document.head.appendChild(youtubeScript);
    });

    this.loadPromises.set('youtubePlayer', promise);
    return promise.catch((error) => {
      this.state.youtubePlayer = 'error';
      throw error;
    });
  }

  /**
   * 載入 Twitch 數據 API（搜尋、查詢用）
   * 此 API 通過 js/twitch-api.js 載入，這裡只檢查是否可用
   */
  async loadTwitchDataApi(): Promise<void> {
    if (this.state.twitchData === 'loaded') {
      return Promise.resolve();
    }

    if (this.state.twitchData === 'loading') {
      return this.loadPromises.get('twitchData') || Promise.resolve();
    }

    this.state.twitchData = 'loading';
    const promise = new Promise<void>((resolve) => {
      // 檢查 window.twitchApi 是否已初始化
      if (window.twitchApi && typeof window.twitchApi.searchChannels === 'function') {
        this.state.twitchData = 'loaded';
        resolve();
        return;
      }

      // 等待 twitch-api.js 載入（最多等待 5 秒）
      let waitCount = 0;
      const checkInterval = setInterval(() => {
        waitCount++;
        if (window.twitchApi && typeof window.twitchApi.searchChannels === 'function') {
          clearInterval(checkInterval);
          this.state.twitchData = 'loaded';
          resolve();
        } else if (waitCount >= 50) {
          // 5 秒超時
          clearInterval(checkInterval);
          // 即使未載入也不阻止應用運行
          this.state.twitchData = 'error';
          console.warn('Twitch 數據 API 載入超時，部分功能可能不可用');
          resolve();
        }
      }, 100);
    });

    this.loadPromises.set('twitchData', promise);
    return promise;
  }

  /**
   * 載入 YouTube 數據 API（搜尋、查詢用）
   * 此 API 通過 js/settings.js 載入，這裡只檢查是否可用
   */
  async loadYouTubeDataApi(): Promise<void> {
    if (this.state.youtubeData === 'loaded') {
      return Promise.resolve();
    }

    if (this.state.youtubeData === 'loading') {
      return this.loadPromises.get('youtubeData') || Promise.resolve();
    }

    this.state.youtubeData = 'loading';
    const promise = new Promise<void>((resolve) => {
      // 檢查 window.youtubeApiUtils 是否已初始化
      if (window.youtubeApiUtils && typeof window.youtubeApiUtils.getApiKey === 'function') {
        this.state.youtubeData = 'loaded';
        resolve();
        return;
      }

      // 等待 settings.js 載入（最多等待 5 秒）
      let waitCount = 0;
      const checkInterval = setInterval(() => {
        waitCount++;
        if (window.youtubeApiUtils && typeof window.youtubeApiUtils.getApiKey === 'function') {
          clearInterval(checkInterval);
          this.state.youtubeData = 'loaded';
          resolve();
        } else if (waitCount >= 50) {
          // 5 秒超時
          clearInterval(checkInterval);
          // 即使未載入也不阻止應用運行
          this.state.youtubeData = 'error';
          console.warn('YouTube 數據 API 載入超時，部分功能可能不可用');
          resolve();
        }
      }, 100);
    });

    this.loadPromises.set('youtubeData', promise);
    return promise;
  }

  /**
   * 載入所有播放器 API（必要功能，應用啟動時載入）
   */
  async loadAllPlayerApis(): Promise<void> {
    try {
      await Promise.all([
        this.loadTwitchPlayerApi(),
        this.loadYouTubePlayerApi()
      ]);
    } catch (error) {
      console.error('載入播放器 API 時發生錯誤:', error);
      // 不阻止應用繼續運行
    }
  }

  /**
   * 載入所有數據 API（非必要功能，按需載入）
   */
  async loadAllDataApis(): Promise<void> {
    try {
      await Promise.all([
        this.loadTwitchDataApi(),
        this.loadYouTubeDataApi()
      ]);
    } catch (error) {
      console.error('載入數據 API 時發生錯誤:', error);
      // 不阻止應用繼續運行
    }
  }

  /**
   * 獲取 API 載入狀態
   */
  getStatus(): ApiLoaderState {
    return { ...this.state };
  }

  /**
   * 檢查特定 API 是否已載入
   */
  isLoaded(api: keyof ApiLoaderState): boolean {
    return this.state[api] === 'loaded';
  }
}

// 導出單例實例
export const apiLoader = new ApiLoader();

// 為了向後兼容，也導出原有的函數
export const loadTwitchPlayerApi = () => apiLoader.loadTwitchPlayerApi();
export const loadYouTubeIframeApi = () => apiLoader.loadYouTubePlayerApi();
export const loadAllPlayerApis = () => apiLoader.loadAllPlayerApis();

