const faq = {
    'tipLabel': 'Tip',
    'title': 'FAQ',
    'header_title': 'FAQ & Troubleshooting',
    'header_subtitle': 'Answers to common questions about playback, performance, and data storage.',

    'cat_compat': 'Playback & Compatibility',
    'cat_compat_blurb': 'Troubleshooting for browsers, platforms, and playback issues.',
    'cat_usage': 'Performance & Data',
    'cat_usage_blurb': 'Common questions about performance tuning, data storage, and layout placeholders.',

    'items.brave_twitch.title': 'Twitch Not Working on Brave Browser',
    'items.brave_twitch.content': 'Due to Brave\'s privacy protection, Twitch\'s anti-bot system (Kasada) detects the Brave browser signature and rejects requests, causing Twitch streams to fail (frozen screen or errors). This can be fixed by installing the ModHeader extension to override the browser signature.',
    'items.brave_twitch.install_btn': 'Install ModHeader Extension',
    'items.brave_twitch.download_btn': 'Download Profile (twitch.json)',
    'items.brave_twitch.step0': 'Find the installed ModHeader extension in your browser\'s extension list',
    'items.brave_twitch.step1': 'Open ModHeader and click the menu button (three dots icon) in the top right',
    'items.brave_twitch.step2': 'Find and click "Import profile" in the menu',
    'items.brave_twitch.step3': 'Click "Load file" and select the downloaded twitch.json profile to import',
    'items.brave_twitch.tip': 'After importing, refresh the Twitch page to start streaming normally. This setting only affects browser signatures for Twitch-related requests and won\'t impact other websites.',

    'items.youtube_playback.title': 'Why won\'t YouTube videos play?',
    'items.youtube_playback.content': 'Some YouTube videos or streams are restricted from embedding by content creators and cannot be played on third-party platforms.',

    'items.platform_support.title': 'Which platforms are supported?',
    'items.platform_support.content': 'Currently supports Twitch and YouTube Live. More platforms may be added in the future.',

    'items.live_detection.title': 'Live Detection',
    'items.live_detection.content': 'Your favorite Twitch and YouTube channels are checked automatically when you open the site, when you enter the canvas and every 25 minutes after that; turning on “Auto-detect live status in background” in settings checks every 5 minutes instead. Live channels show a green dot in your favorites (viewer counts are not shown). YouTube channels are throttled, so one can take 15 minutes or more to turn green after going live.',

    'items.performance.title': 'How to improve performance?',
    'items.performance.content': 'Playing several high-quality streams at once uses a lot of CPU and bandwidth. There is no site-wide quality setting — lower the quality from each player’s own gear menu, or play fewer streams at once; when 2 or more YouTube streams are playing, use “Pause Others” on the warning. Twitch drops to the lowest quality automatically after the tab has been in the background for 30 seconds. Press F3 for a performance panel showing frame rate and memory.',

    'items.data_saved.title': 'Are my settings saved?',
    'items.data_saved.content': 'Your favorites, lists, tags, settings and custom layouts are saved in your browser and are still there next time. The canvas you are watching is not saved permanently: reloading clears it, and if you come back within 10 minutes you are asked whether to restore your last session. To move to another device, use Favorites Manager → Backup & Restore (the backup does not include custom layouts).',

    'items.empty_window.title': 'Empty Window Usage',
    'items.empty_window.content': 'Press + on the dynamic island and choose a combo (stream + chat), a stream window or a chat window to add an empty window to the canvas — handy as a placeholder while you plan the layout. An empty stream window has its own search box and a drop-down of live favorites; an empty chat window lets you pick which stream on the canvas to show the chat for.',

    'items.youtube_search.title': 'Why can\'t I find some YouTube channels?',
    'items.youtube_search.content': 'The Dynamic Island’s YouTube channel search matches names against the channels already indexed on our site — it does not search all of YouTube in real time. If a channel does not show up, it has usually not been added yet; you can suggest it on the Stream Schedule. When you pick a result, the site first checks whether the channel is live: if it is, it is added to the canvas; if not, it is added to your favorites so you can load it once it goes live.',
    'items.youtube_search.tip': 'If a channel you want never appears, let us know on Discord and we\'ll add it to the catalog.',
  // —— i18n 修補：design 改版新增 key，各語言在地化 ——
  'cat_all': 'All',
  'support_eyebrow': 'Support',
  'search_placeholder': 'Search questions, e.g. "Brave", "performance", "YouTube"…',
  'search_found': 'Found {{count}} question(s) matching "{{query}}"',
  'search_none': 'No questions matching "{{query}}"',
  'empty_title': 'No matching questions',
  'empty_desc': 'Try a different keyword, or just ask us on Discord.',
  'cta_title': 'Still can\'t find an answer?',
  'cta_desc': 'Join our Discord community and ask us — we\'re happy to help.',
  'cta_discord': 'Join Discord',
  'foot_home': 'Home',
  'foot_about': 'About',
  'foot_privacy': 'Privacy Policy',
};

export default faq;
