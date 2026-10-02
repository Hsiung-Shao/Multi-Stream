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
    'items.live_detection.content': '系統會在進站、進入畫布以及之後每 25 分鐘，自動檢查你收藏的 Twitch 與 YouTube 頻道是否正在直播；在設定裡打開「背景自動偵測直播狀態」則改成每 5 分鐘一次。偵測到開台時，收藏清單會顯示綠點（不顯示觀看人數）。YouTube 頻道有節流，開台後最慢可能 15 分鐘以上才會亮起。',

    'items.performance.title': '如何改善效能問題？',
    'items.performance.content': '同時播放多個高畫質直播會消耗大量 CPU 與網路頻寬。本站沒有統一的畫質設定，請用各播放器自己的齒輪選單降低畫質，或減少同時播放的數量；同時播放 2 路以上 YouTube 時，可以按提醒上的「暫停其他 YouTube 串流」。分頁在背景超過 30 秒時，Twitch 會自動降到最低畫質。按 F3 可以開啟效能面板觀察幀數與記憶體。',

    'items.data_saved.title': '我的設定會被保存嗎？',
    'items.data_saved.content': '收藏、收藏清單、標籤、設定與自訂布局會儲存在你的瀏覽器裡，下次訪問時仍在。正在觀看的畫布則不會永久保存：重新整理後畫布會清空，10 分鐘內回來會詢問是否恢復上次的觀看畫面。要換裝置，請用「收藏管理 → 備份與還原」（備份檔也包含自訂布局）。',

    'items.empty_window.title': '空白視窗的用法',
    'items.empty_window.content': '在動態島按「+」，選「新增組合」（串流＋聊天室）、「新增串流視窗」或「新增聊天室視窗」，畫布上會多出空白視窗，可以先佔位規劃排版。空白的串流視窗裡有搜尋框，也能從下拉選單挑一個正在直播的收藏頻道；空白的聊天室視窗則從畫布上的直播挑一路顯示聊天室。',

    'items.youtube_search.title': '為什麼有些 YouTube 頻道搜尋不到？',
    'items.youtube_search.content': '動態島搜尋框的 YouTube 頻道搜尋，是從本站已收錄的頻道名單中比對，並不是即時搜尋整個 YouTube。若搜尋不到，通常代表該頻道尚未被本站收錄，可以到開台週表推薦新增。選了搜尋結果後，系統會先檢查該頻道是否正在直播：正在直播就直接加入畫布，沒有直播則加入收藏，等開台後再從收藏清單載入。',
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
    'search_clear': '清除搜尋',
};

export default faq;
