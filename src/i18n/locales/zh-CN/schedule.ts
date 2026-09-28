// 开播周表（/schedule）文案；更新时请同步 5 种语言。
export default {
    'title': '开播周表',
    'hero.eyebrow': '开播周表',
    'hero.title': '台湾 VTuber 开播周表',
    'hero.subtitle': '整理 YouTube 待机室与 Twitch 直播中的主播，一眼看出谁正在开播、接下来 7 天谁会开播。勾选几位，一键在画布同时观看。',

    'tabs.live': '直播中',
    'tabs.upcoming': '即将开播',
    'tabs.recent': '刚结束',

    'scope.label': '范围',
    'scope.all': '全部',
    'scope.favorites': '我的收藏',

    'filter.nationality': '地区',
    'filter.group': '团体',
    'filter.platform': '平台',
    'nationality.all': '全部地区',
    'nationality.TW': '台湾',
    'nationality.HK': '香港',
    'nationality.MY': '马来西亚',
    'nationality.JP': '日本',
    'nationality.OTHER': '其他',
    'group.all': '全部团体',
    'platform.all': '全部平台',
    'platform.youtube': 'YouTube',
    'platform.twitch': 'Twitch',

    'card.viewers': '{{count}} 人观看',
    'card.startedAt': '{{time}} 开播',
    'card.scheduledAt': '预定 {{time}}',
    'card.endedAt': '{{time}} 结束',
    'card.select': '选择 {{name}}',
    'card.openOriginal': '在 {{platform}} 打开',
    'card.untitled': '（未命名）',

    'selection.count': '已选 {{count}} 位',
    'selection.open': '在画布同时观看',
    'selection.clear': '清除',
    'selection.selectHour': '选择这个时段',
    'selection.limit': '画布最多 16 路，目前还能加 {{count}} 路',

    'toast.added': '已加入 {{count}} 路直播',
    'toast.partial': '已加入 {{added}} 路，{{failed}} 路加入失败',
    'toast.skipped': '画布已满，另外 {{count}} 路没有加入',
    'toast.none': '没有加入任何直播',

    'state.loading': '周表加载中…',
    'state.error': '周表暂时无法加载',
    'state.errorStale': '更新失败，目前显示的是上一次的数据',
    'state.retry': '重试',
    'state.empty': '目前没有符合条件的场次',
    'state.emptyFavorites': '你的收藏里还没有周表上的主播',
    'state.emptyFavoritesHint': '在画布用搜索把主播加入收藏，这里就会只显示他们的开播时间。',
    'state.updatedAt': '更新于 {{time}}',

    'board.today': '今天',
    'board.none': '没有预定',

    'about.title': '数据来源',
    'about.body': '周表只收录平台上已建立的排程：YouTube 的直播待机室，以及 Twitch 正在直播的频道。主播只发周表图、没有开待机室的场次不会出现。预定时间超过 14 天的「常驻框」不列入，预定时间过后 3 小时仍未开播的场次会自动移除。',
    'about.tz': '时间按你的设备时区显示。',
};
