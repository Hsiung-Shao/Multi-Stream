const faq = {
    'title': '功能說明 (FAQ)',
    'header_title': '常見問題與功能導覽',
    'header_subtitle': '深入了解 MultiStream Hub 的各項強大功能，打造您的專屬直播工作台。',
    'go_to_canvas': '前往畫布',
    'footer_note': '若還有其他問題，歡迎透過 GitHub 或意見回饋功能聯繫我們。',

    'items.dynamic_island.title': '動態島 (Dynamic Island)',
    'items.dynamic_island.content': '位於畫面下方中央的懸浮工具列，整合了搜尋、新增視窗、佈局切換、媒體控制與收藏清單等核心功能。它會在閒置時自動隱藏，滑鼠移至下方即可喚醒。',
    'items.dynamic_island.tip': '點擊動態島上的圖示可快速展開對應的選單。',

    'items.favorites_manager.title': '收藏管理',
    'items.favorites_manager.content': '集中管理您的 Twitch 與 YouTube 頻道。支援新增、編輯、刪除以及自訂標籤與分類。您可以透過 Twitch 帳號連結匯入追隨名單，或手動輸入 URL 新增頻道。',

    'items.media_control.title': '媒體控制功能',
    'items.media_control.content': '透過動態島上的電視圖示 (TV Icon) 開啟媒體控制面板。您可以由此調整「全域音量 (Master Volume)」或一鍵靜音所有視窗 (Mute All)，無需逐一切換視窗調整音量。',

    'items.search_bar.title': '搜尋框',
    'items.search_bar.content': '位於動態島左側或導覽列中央。支援輸入傳送門 URL (Twitch/YouTube) 直接新增，或是輸入關鍵字搜尋 Twitch 頻道。',

    'items.layout_control.title': '布局控制',
    'items.layout_control.content': '提供多種預設佈局 (如格狀、主從式、直式等) 以及「自由畫布」模式。在自由模式下，您可以任意拖曳與縮放視窗大小。',

    'items.one_click_favorite.title': '一鍵收藏',
    'items.one_click_favorite.content': '位於動態島上的「資料夾愛心」圖示。點擊後，系統會自動將當前畫布上所有正在開啟的視窗加入到您的收藏清單中，方便日後快速存取。',

    'items.clear_canvas.title': '一鍵清空畫布',
    'items.clear_canvas.content': '位於動態島右側的垃圾桶圖示。點擊並確認後，將移除畫布上所有的視窗，讓您重新開始配置。',

    'items.fullscreen.title': '全螢幕',
    'items.fullscreen.content': '點擊動態島或個別視窗的全螢幕圖示，可將應用程式或特定視訊切換至全螢幕模式，提供沈浸式的觀看體驗。',

    'items.batch_import.title': '批量匯入',
    'items.batch_import.content': '在收藏管理的「批量匯入」頁籤中，您可以貼上多行 URL 或 JSON 格式的資料，一次性匯入多個頻道至收藏清單。',

    'items.multi_tabs.title': '多標籤 (Multi-tabs)',
    'items.multi_tabs.content': '聊天室視窗支援多分頁功能。您可以在同一個聊天視窗中開啟多個頻道的聊天室，並透過上方標籤快速切換，節省螢幕空間。',

    'items.categories.title': '分類 (Categories)',
    'items.categories.content': '您可以建立自訂分類 (如：Vtuber, 音樂, 電競) 來整理您的收藏頻道。在收藏管理中，可將頻道拖曳或指派至特定分類。',

    'items.backup_restore.title': '備份還原',
    'items.backup_restore.content': '在收藏管理的「備份」頁籤中，您可以將所有的設定、收藏、標籤與佈局匯出為 JSON 檔案。日後或在不同裝置上，可透過匯入該檔案還原您的個人化設定。',

    'items.twitch_linking.title': 'Twitch 帳號連結',
    'items.twitch_linking.content': '登入 Twitch 帳號後，系統可讀取您的追隨名單，並讓您選擇性地匯入至 MultiStream Hub 的收藏中。我們僅存取公開追隨資訊，不會保存您的帳號憑證。',

    'items.live_detection.title': '開台檢測方式',
    'items.live_detection.content': '系統會定期於背景檢查您收藏的 Twitch 頻道是否在線 (Live)。當偵測到開台時，收藏列表會顯示綠色燈號與觀眾人數。',

    'items.empty_window.title': '空白視窗的用法',
    'items.empty_window.content': '您可以透過「新增組合 -> 新增空白群組」加入一個空白視窗框。此視窗可用於占位，方便您先規劃佈局，之後再將收藏的頻道拖曳進去播放。',

    'items.brave_twitch.title': 'Brave 瀏覽器 Twitch 無法播放',
    'items.brave_twitch.content': '由於 Brave 瀏覽器的隱私保護機制，Twitch 的反機器人系統 (Kasada) 會偵測到 Brave 的瀏覽器標識並拒絕請求，導致 Twitch 串流無法正常播放（畫面卡住或顯示錯誤）。此問題可透過安裝 ModHeader 擴充功能，覆寫瀏覽器標識來解決。',
    'items.brave_twitch.install_btn': '安裝 ModHeader 擴充功能',
    'items.brave_twitch.download_btn': '下載設定檔 (twitch.json)',
    'items.brave_twitch.step0': '在瀏覽器的擴充功能列表中找到已安裝的 ModHeader 套件',
    'items.brave_twitch.step1': '開啟 ModHeader，點擊右上方的選單按鈕（三個點圖示）',
    'items.brave_twitch.step2': '在選單中找到並點擊「Import profile」',
    'items.brave_twitch.step3': '點擊「Load file」按鈕，選擇剛剛下載的 twitch.json 設定檔匯入',
    'items.brave_twitch.tip': '匯入完成後，重新整理 Twitch 頁面即可正常播放。此設定僅影響 Twitch 相關請求的瀏覽器標識，不會影響其他網站的正常使用。'
};

export default faq;
