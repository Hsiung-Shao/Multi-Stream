// 測試數據 - 從實際備份文件中提取的真實串流 URL
// 這些是實際可用的 Twitch 頻道，用於更真實的測試

const TEST_STREAMS = {
  // 單個測試串流（使用實際正在串流的 URL）
  single: 'https://www.twitch.tv/muse_tw',
  
  // 多個測試串流（用於多串流測試）
  multiple: [
    'https://www.twitch.tv/muse_tw',
    'https://www.twitch.tv/muse_tw2',
    'https://www.youtube.com/watch?v=xKXX4Fhrqqk',
    'https://www.youtube.com/watch?v=KyT4qSK8lJo'
  ],
  
  // 用於布局測試的串流
  forLayout: [
    'https://www.twitch.tv/muse_tw',
    'https://www.twitch.tv/muse_tw2',
    'https://www.youtube.com/watch?v=xKXX4Fhrqqk',
    'https://www.youtube.com/watch?v=KyT4qSK8lJo'
  ],
  
  // 用於聊天室測試的串流
  forChat: [
    'https://www.twitch.tv/muse_tw',
    'https://www.twitch.tv/muse_tw2'
  ],
  
  // 收藏測試用的串流
  forFavorite: {
    url: 'https://www.twitch.tv/muse_tw',
    name: 'muse_tw',
    channelId: 'muse_tw',
    platform: 'twitch'
  },
  
  // 分類測試
  category: {
    name: '測試分類'
  }
};

// 從備份文件中提取的完整收藏數據
const FAVORITE_STREAMS_DATA = [
  {
    id: '1764456560012',
    url: 'https://www.twitch.tv/kspksp',
    name: 'kspksp',
    platform: 'twitch',
    channelId: 'kspksp',
    videoId: '',
    categoryId: '1764458306474',
    addedAt: '2025-11-29T22:49:20.012Z'
  },
  {
    id: '1764456560019',
    url: 'https://www.twitch.tv/998rrr',
    name: '998rrr',
    platform: 'twitch',
    channelId: '998rrr',
    videoId: '',
    categoryId: '1764458306474',
    addedAt: '2025-11-29T22:49:20.019Z'
  },
  {
    id: '1764456560030',
    url: 'https://www.twitch.tv/itsuki_ianvs',
    name: 'itsuki_ianvs',
    platform: 'twitch',
    channelId: 'itsuki_ianvs',
    videoId: '',
    categoryId: '1764458306474',
    addedAt: '2025-11-29T22:49:20.030Z'
  }
];

const FAVORITE_CATEGORIES_DATA = [
  {
    id: '1764458306474',
    name: '子午',
    createdAt: '2025-11-29T23:18:26.474Z'
  }
];

module.exports = {
  TEST_STREAMS,
  FAVORITE_STREAMS_DATA,
  FAVORITE_CATEGORIES_DATA
};

