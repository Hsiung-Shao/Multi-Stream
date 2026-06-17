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
    'items.live_detection.content': 'The system periodically checks the live status of your favorite Twitch channels in the background. Online channels show a green indicator and viewer count.',

    'items.performance.title': 'How to improve performance?',
    'items.performance.content': 'Simultaneously playing multiple high-quality streams consumes significant CPU and bandwidth. Try lowering the quality of individual streams or reducing the number of active streams.',

    'items.data_saved.title': 'Are my settings saved?',
    'items.data_saved.content': 'Yes, your layout, favorites, and settings are automatically saved in your browser and restored on your next visit.',

    'items.empty_window.title': 'Empty Window Usage',
    'items.empty_window.content': 'Add an empty window group via "Add Group -> Add Empty Group". Use this as a placeholder to plan your layout before dragging channels into it.',
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
