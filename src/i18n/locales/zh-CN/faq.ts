const faq = {
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
    'items.live_detection.content': '系统会定期于后台检查您收藏的 Twitch 频道是否在线 (Live)。当检测到开播时，收藏列表会显示绿色状态灯与观众人数。',

    'items.performance.title': '如何改善性能问题？',
    'items.performance.content': '同时播放多个高画质串流会消耗大量 CPU 和网络带宽。建议在设置中降低个别串流的画质，或减少同时播放的数量。',

    'items.data_saved.title': '我的设置会被保存吗？',
    'items.data_saved.content': '是的，您的布局、收藏和设置会自动储存在您的浏览器中，下次访问时会自动还原。',

    'items.empty_window.title': '空白视窗的用法',
    'items.empty_window.content': '您可以通过"新增组合 -> 新增空白群组"加入一个空白视窗框。此视窗可用于占位，方便您先规划布局，之后再将收藏的频道拖曳进去播放。'
};

export default faq;
