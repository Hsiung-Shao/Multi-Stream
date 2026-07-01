const faq = {
    'tipLabel': '提示',
    'title': '常見問題 (FAQ)',
    'header_title': '常見問題與疑難排解',
    'header_subtitle': '播放問題、效能調校與資料儲存的常見疑問，都在這裡找到解答。',

    'cat_compat': '播放與相容性',
    'cat_compat_blurb': '瀏覽器、平台與播放相關的疑難排解。',
    'cat_usage': '效能與資料',
    'cat_usage_blurb': '效能調校、資料儲存與佈局占位的常見疑問。',

    'items.brave_twitch.title': 'Brave 瀏覽器 Twitch 無法播放',
    'items.brave_twitch.content': '由於 Brave 瀏覽器的隱私保護機制，Twitch 的反機器人系統 (Kasada) 會偵測到 Brave 的瀏覽器標識並拒絕請求，導致 Twitch 串流無法正常播放（畫面卡住或顯示錯誤）。此問題可透過安裝 ModHeader 擴充功能，覆寫瀏覽器標識來解決。',
    'items.brave_twitch.install_btn': '安裝 ModHeader 擴充功能',
    'items.brave_twitch.download_btn': '下載設定檔 (twitch.json)',
    'items.brave_twitch.step0': '在瀏覽器的擴充功能列表中找到已安裝的 ModHeader 套件',
    'items.brave_twitch.step1': '開啟 ModHeader，點擊右上方的選單按鈕（三個點圖示）',
    'items.brave_twitch.step2': '在選單中找到並點擊「Import profile」',
    'items.brave_twitch.step3': '點擊「Load file」按鈕，選擇剛剛下載的 twitch.json 設定檔匯入',
    'items.brave_twitch.tip': '匯入完成後，重新整理 Twitch 頁面即可正常播放。此設定僅影響 Twitch 相關請求的瀏覽器標識，不會影響其他網站的正常使用。',

    'items.youtube_playback.title': '為什麼 YouTube 影片無法播放？',
    'items.youtube_playback.content': '部分 YouTube 影片或直播可能被創作者設定為「不允許嵌入播放」，這類內容無法在第三方平台播放。',

    'items.platform_support.title': '支援哪些平台？',
    'items.platform_support.content': '目前主要支援 Twitch 和 YouTube 直播。未來可能會增加更多平台的支援。',

    'items.live_detection.title': '開台檢測方式',
    'items.live_detection.content': '系統會定期於背景檢查您收藏的 Twitch 頻道是否在線 (Live)。當偵測到開台時，收藏列表會顯示綠色燈號與觀眾人數。',

    'items.performance.title': '如何改善效能問題？',
    'items.performance.content': '同時播放多個高畫質串流會消耗大量 CPU 和網路頻寬。建議在設定中降低個別串流的畫質，或減少同時播放的數量。',

    'items.data_saved.title': '我的設定會被保存嗎？',
    'items.data_saved.content': '是的，您的布局、收藏和設定會自動儲存在您的瀏覽器中，下次訪問時會自動還原。',

    'items.empty_window.title': '空白視窗的用法',
    'items.empty_window.content': '您可以透過「新增組合 -> 新增空白群組」加入一個空白視窗框。此視窗可用於占位，方便您先規劃佈局，之後再將收藏的頻道拖曳進去播放。',

    'items.youtube_search.title': '為什麼有些 YouTube 頻道搜尋不到？',
    'items.youtube_search.content': '動態島搜尋框的 YouTube 頻道搜尋，是從本站已收錄的頻道名單中比對，並不是即時搜尋整個 YouTube。若搜尋不到，通常代表該頻道尚未被本站收錄。此外，搜尋到的 YouTube 頻道會加入收藏，而不像 Twitch 頻道那樣可即時預覽並直接播放——因為名單中沒有該頻道當前的直播網址；待頻道開台後，再從收藏清單載入即可觀看。',
    'items.youtube_search.tip': '若想看的頻道一直搜尋不到，歡迎到 Discord 回報，我們會將它補進收錄名單。',
  // —— i18n 修補：design 改版新增 key，各語言在地化 ——
  'cat_all': '全部',
  'support_eyebrow': '支援',
  'search_placeholder': '搜尋問題，例如「Brave」、「效能」、「YouTube」…',
  'search_found': '找到 {{count}} 則符合「{{query}}」的問題',
  'search_none': '沒有符合「{{query}}」的問題',
  'empty_title': '找不到相關問題',
  'empty_desc': '換個關鍵字試試，或直接到 Discord 問我們。',
  'cta_title': '還是沒找到答案？',
  'cta_desc': '加入 Discord 社群問我們，我們很樂意幫忙。',
  'cta_discord': '加入 Discord',
  'foot_home': '首頁',
  'foot_about': '關於',
  'foot_privacy': '隱私權政策',
};

export default faq;
