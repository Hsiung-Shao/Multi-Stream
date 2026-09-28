// 開台週表（/schedule）文案；更新時請同步 5 語言。
export default {
    'title': '開台週表',
    'hero.eyebrow': '開台週表',
    'hero.title': '台灣 VTuber 開台週表',
    'hero.subtitle': '整理 YouTube 待機室與 Twitch 直播中的實況主，一眼看出誰正在開台、接下來 7 天誰會開。勾選幾位，一鍵在畫布同時觀看。',

    'tabs.live': '直播中',
    'tabs.upcoming': '即將開台',
    'tabs.recent': '剛結束',

    'scope.label': '範圍',
    'scope.all': '全部',
    'scope.favorites': '我的收藏',

    'filter.nationality': '地區',
    'filter.group': '團體',
    'filter.platform': '平台',
    'nationality.all': '全部地區',
    'nationality.TW': '台灣',
    'nationality.HK': '香港',
    'nationality.MY': '馬來西亞',
    'nationality.JP': '日本',
    'nationality.OTHER': '其他',
    'group.all': '全部團體',
    'platform.all': '全部平台',
    'platform.youtube': 'YouTube',
    'platform.twitch': 'Twitch',

    'card.viewers': '{{count}} 人觀看',
    'card.startedAt': '{{time}} 開台',
    'card.scheduledAt': '預定 {{time}}',
    'card.endedAt': '{{time}} 結束',
    'card.select': '選取 {{name}}',
    'card.openOriginal': '在 {{platform}} 開啟',
    'card.untitled': '（未命名）',

    'selection.count': '已選 {{count}} 位',
    'selection.open': '在畫布同時觀看',
    'selection.clear': '清除',
    'selection.selectHour': '選取這個時段',
    'selection.limit': '畫布最多 16 路，目前還能加 {{count}} 路',

    'toast.added': '已加入 {{count}} 路直播',
    'toast.partial': '已加入 {{added}} 路，{{failed}} 路加入失敗',
    'toast.skipped': '畫布已滿，另外 {{count}} 路沒有加入',
    'toast.none': '沒有加入任何直播',

    'state.loading': '載入週表中…',
    'state.error': '週表暫時無法載入',
    'state.errorStale': '更新失敗，目前顯示的是上一次的資料',
    'state.retry': '重試',
    'state.empty': '目前沒有符合條件的場次',
    'state.emptyFavorites': '你的收藏裡還沒有週表上的實況主',
    'state.emptyFavoritesHint': '在畫布用搜尋把實況主加入收藏，這裡就會只顯示他們的開台時間。',
    'state.updatedAt': '更新於 {{time}}',

    'board.today': '今天',
    'board.none': '沒有預定',

    'about.title': '資料來源',
    'about.body': '週表只收錄平台上已建立的排程：YouTube 的直播待機室，以及 Twitch 正在直播的頻道。實況主只發週表圖、沒有開待機室的場次不會出現。排定時間超過 14 天的「常駐框」不列入，排定時間過後 3 小時仍未開台的場次會自動移除。',
    'about.tz': '時間依你的裝置時區顯示。',
};
