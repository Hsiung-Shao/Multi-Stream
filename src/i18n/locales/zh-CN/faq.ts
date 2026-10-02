const faq = {
    'tipLabel': '提示',
    'title': '常见问题 (FAQ)',
    'header_title': '常见问题与疑难解答',
    'header_subtitle': '播放问题、性能调校与数据存储的常见疑问，都在这里找到解答。',

    'cat_compat': '播放与兼容性',
    'cat_compat_blurb': '浏览器、平台与播放相关的疑难解答。',
    'cat_usage': '性能与数据',
    'cat_usage_blurb': '性能调校、数据存储与布局占位的常见疑问。',

    'items.brave_twitch.title': 'Brave 浏览器 Twitch 无法播放',
    'items.brave_twitch.content': '由于 Brave 浏览器的隐私保护机制，Twitch 的反机器人系统 (Kasada) 会检测到 Brave 的浏览器标识并拒绝请求，导致 Twitch 串流无法正常播放（画面卡住或显示错误）。此问题可通过安装 ModHeader 扩展程序，覆写浏览器标识来解决。',
    'items.brave_twitch.install_btn': '安装 ModHeader 扩展程序',
    'items.brave_twitch.download_btn': '下载配置文件 (twitch.json)',
    'items.brave_twitch.step0': '在浏览器的扩展程序列表中找到已安装的 ModHeader 插件',
    'items.brave_twitch.step1': '打开 ModHeader，点击右上方的菜单按钮（三个点图标）',
    'items.brave_twitch.step2': '在菜单中找到并点击「Import profile」',
    'items.brave_twitch.step3': '点击「Load file」按钮，选择刚刚下载的 twitch.json 配置文件导入',
    'items.brave_twitch.tip': '导入完成后，刷新 Twitch 页面即可正常播放。此设置仅影响 Twitch 相关请求的浏览器标识，不会影响其他网站的正常使用。',

    'items.youtube_playback.title': '为什么 YouTube 视频无法播放？',
    'items.youtube_playback.content': '部分 YouTube 视频或直播可能被创作者设定为“不允许嵌入播放”，这类内容无法在第三方平台播放。',

    'items.platform_support.title': '支持哪些平台？',
    'items.platform_support.content': '目前主要支持 Twitch 和 YouTube 直播。未来可能会增加更多平台的支持。',

    'items.live_detection.title': '开播检测方式',
    'items.live_detection.content': '系统会在进入网站时、进入画布时以及之后每 25 分钟，自动检查您收藏的 Twitch 与 YouTube 频道是否正在直播；在设置里打开「后台自动检测直播状态」则改为每 5 分钟一次。检测到开播时，收藏列表会显示绿点（不显示观看人数）。YouTube 频道有节流，开播后最慢可能要 15 分钟以上才会亮起。',

    'items.performance.title': '如何改善性能问题？',
    'items.performance.content': '同时播放多个高画质直播会消耗大量 CPU 与网络带宽。本站没有统一的画质设置，请用各播放器自己的齿轮菜单降低画质，或减少同时播放的数量；同时播放 2 路以上 YouTube 时，可以按提醒上的「暂停其他 YouTube 串流」。标签页在后台超过 30 秒时，Twitch 会自动降到最低画质。按 F3 可以打开性能面板，查看帧率与内存。',

    'items.data_saved.title': '我的设置会被保存吗？',
    'items.data_saved.content': '收藏、收藏清单、标签、设置与自定义布局会保存在您的浏览器里，下次访问时仍在。正在观看的画布则不会永久保存：刷新后画布会清空，10 分钟内回来会询问是否恢复上次的观看画面。要换设备，请使用「收藏管理 → 备份与还原」（备份文件也包含自定义布局）。',

    'items.empty_window.title': '空白视窗的用法',
    'items.empty_window.content': '在动态岛按「+」，选择「新增组合」（串流＋聊天室）、「新增串流窗口」或「新增聊天室窗」，画布上会多出空白窗口，可以先占位规划排版。空白的串流窗口里有搜索框，也能从下拉菜单挑一个正在直播的收藏频道；空白的聊天室窗口则从画布上的直播中挑一路显示其聊天室。',

    'items.youtube_search.title': '为什么有些 YouTube 频道搜索不到？',
    'items.youtube_search.content': '动态岛搜索框的 YouTube 频道搜索，是从本站已收录的频道名单中比对，并不是实时搜索整个 YouTube。若搜索不到，通常代表该频道尚未被本站收录，可以到开播周表推荐添加。选择搜索结果后，系统会先检查该频道是否正在直播：正在直播就直接加入画布，没有直播则加入收藏，等开播后再从收藏列表加载。',
    'items.youtube_search.tip': '若想看的频道一直搜索不到，欢迎到 Discord 回报，我们会将它补进收录名单。',
  // —— i18n 修補：design 改版新增 key，各語言在地化 ——
  'cat_all': '全部',
  'support_eyebrow': '支持',
  'search_placeholder': '搜索问题，例如「Brave」、「性能」、「YouTube」…',
  'search_found': '找到 {{count}} 条符合「{{query}}」的问题',
  'search_none': '没有符合「{{query}}」的问题',
  'empty_title': '找不到相关问题',
  'empty_desc': '换个关键字试试，或直接到 Discord 问我们。',
  'cta_title': '还是没找到答案？',
  'cta_desc': '加入 Discord 社区问我们，我们很乐意帮忙。',
  'cta_discord': '加入 Discord',
  'foot_home': '首页',
  'foot_about': '关于',
  'foot_privacy': '隐私权政策',
};

export default faq;
