// 多語言系統 (i18n)
// 支援語言：繁體中文、簡體中文、英文、日文

const i18n = {
  // 當前語言
  currentLang: 'zh-TW',
  
  // 語言資料
  translations: {
    'zh-TW': {
      // 控制面板
      'controlPanel': '控制面板',
      'settings': '設定',
      'expandPanel': '展開控制面板',
      'collapsePanel': '收起控制面板',
      'addStreamPlaceholder': '貼上 Twitch / YouTube 直播網址',
      'addStreamButton': '加入畫面',
      'layoutControl': '布局控制',
      'singleView': '單一畫面',
      'splitHorizontal': '左右分割',
      'splitVertical': '上下分割',
      'grid4': '四宮格',
      'largeTop3': '上大下三',
      'grid2x3': '2×3 網格',
      'grid3x3': '3×3 網格',
      'sideChatLayout': '側邊聊天布局',
      'dualColumnChat': '雙欄聊天布局（左側視頻可調整，右側固定兩個聊天室）',
      'quadChat': '四格聊天布局（左側視頻可調整，右側固定四個聊天室）',
      'singleChatLayout': '單一聊天室布局（左側視頻可調整，右側固定一個聊天室）',
      'chatControl': '聊天室控制',
      'showAllChats': '顯示所有聊天室',
      'hideAllChats': '隱藏所有聊天室',
      'favoriteStreams': '收藏串流',
      'manageFavorites': '管理收藏',
      'addCurrentToFavorites': '收藏當前',
      'allFavorites': '全部收藏',
      'uncategorized': '未分類',
      'mediaControl': '媒體控制',
      'masterVolume': '總音量',
      'muteAll': '全部靜音',
      'streamOrder': '串流順序',
      'noStreams': '暫無串流',
      'volume': '音量',
      'adjustVolume': '調整音量',
      'moveUp': '上移',
      'moveDown': '下移',
      'feedback': '意見回饋',
      'giveFeedback': '給予意見回饋',
      'versionHistory': '版本紀錄',
      'userGuide': '使用教學',
      'privacyPolicy': '隱私權政策',
      'copyright': '© 2025 Hsiung-Shao. All rights reserved.',
      'freeTool': '本工具完全免費開放給所有人使用，歡迎分享連結給朋友！',
      'language': '語言',
      'selectLanguage': '選擇語言',
      'chineseTraditional': '繁體中文',
      'chineseSimplified': '簡體中文',
      'english': 'English',
      'japanese': '日本語',
      
      // 版本紀錄
      'version': '版本',
      'close': '關閉',
      'version1.4.1.change1': '全站支援多國語言（繁中、簡中、英文、日語）',
      'version1.4.1.change2': '新增右側單一聊天室',
      'version1.4.0.change2': '修復多語言切換時收藏串流選單回到繁體中文的問題',
      'version1.4.0.change3': '修復控制面板標題和顯示所有聊天室按鈕的多語言顯示問題',
      'version1.4.0.change4': '修復多語言初始化導致的功能失效問題（控制面板縮放、聊天室切換、串流順序清單）',
      'version1.4.0.change5': '修復代碼錯誤（i18n 重複聲明、函數未定義等）',
      'version1.3.0.change1': '新增側邊聊天布局功能（雙欄版和四格版）',
      'version1.3.0.change2': '雙欄聊天布局：左側視頻區域可自由調整布局，右側固定顯示兩個聊天室（左右排列）',
      'version1.3.0.change3': '四格聊天布局：左側視頻區域可自由調整布局，右側固定顯示四個聊天室（2×2 網格排列）',
      'version1.3.0.change4': '聊天室選擇器功能，無需調整串流順序即可快速切換要顯示的聊天室',
      'version1.3.0.change5': '優化布局切換流暢度，一次點擊即可完成切換',
      'version1.3.0.change6': '改進選擇器響應速度，減少延遲',
      'version1.2.0.change1': '新增本地文件備份功能',
      'version1.2.0.change2': '改進收藏管理界面',
      'version1.2.0.change3': '新增設定標籤頁',
      'version1.2.0.change4': '優化安全性（XSS 防護）',
      'version1.2.0.change5': '改進 YouTube 聊天室嵌入支援',
      'version1.2.0.change6': '新增版本紀錄功能',
      'version1.2.0.change7': '新增滑鼠懸停自動展開控制面板',
      'version1.2.0.change8': '更新著作權資訊',
      'version1.1.0.change1': '新增分類管理功能',
      'version1.1.0.change2': '改進控制面板 UI',
      'version1.1.0.change3': '優化布局自動切換',
      'version1.1.0.change4': '修復多個已知問題',
      'version1.0.0.change1': '初始版本發布',
      'version1.0.0.change2': '支援 Twitch 和 YouTube 直播串流',
      'version1.0.0.change3': '多種布局模式',
      'version1.0.0.change4': '聊天室整合',
      'version1.0.0.change5': '音量控制功能',
      'version1.0.0.change6': '收藏功能',
      
      // 使用教學
      'addStreamTitle': '📺 添加串流',
      'addStreamStep1': '在控制面板頂部的輸入框中，貼上 Twitch 或 YouTube 直播網址',
      'addStreamStep2': '點擊「加入畫面」按鈕',
      'addStreamStep3': '串流會自動載入並顯示在畫面上',
      'addStreamTip': '💡 提示：支援的網址格式包括：',
      'addStreamTipTwitch': '• Twitch: https://www.twitch.tv/頻道名稱',
      'addStreamTipYouTube': '• YouTube: https://www.youtube.com/watch?v=視頻ID 或 https://youtu.be/視頻ID',
      'layoutTitle': '🎨 調整布局',
      'layoutBasic': '基本布局',
      'layoutBasicStep1': '在控制面板的「布局控制」區域，點擊布局預覽按鈕',
      'layoutBasicStep2': '可選擇：單一畫面、左右分割、上下分割、四宮格、上大下三、2×3 網格、3×3 網格',
      'layoutBasicStep3': '系統會根據串流數量自動選擇最適合的布局',
      'layoutSideChat': '側邊聊天布局（雙欄版 / 四格版）',
      'layoutSideChatStep1': '點擊「雙欄聊天布局」或「四格聊天布局」按鈕啟用側邊聊天布局',
      'layoutSideChatStep2': '左側視頻區域可以使用布局按鈕（1-6、9）調整顯示方式',
      'layoutSideChatStep3': '右側聊天室區域固定，不會隨視頻布局改變',
      'layoutSideChatStep4': '每個聊天室面板都有下拉選擇器，可以選擇要顯示的串流聊天室',
      'layoutSideChatStep5': '雙欄聊天布局：右側顯示兩個聊天室（左右排列）',
      'layoutSideChatStep6': '四格聊天布局：右側顯示四個聊天室（2×2 網格排列）',
      'layoutSideChatTip': '💡 提示：側邊聊天布局模式下，無需調整串流順序，直接從聊天室選擇器中選擇要顯示的串流即可',
      'chatTitle': '💬 聊天室功能',
      'chatBasic': '基本模式',
      'chatBasicStep1': '點擊串流視窗中的聊天室按鈕（💬）顯示/隱藏聊天室',
      'chatBasicStep2': '使用「顯示所有聊天室」按鈕一次性顯示所有聊天室',
      'chatBasicStep3': '聊天室會自動嵌入到串流視窗中',
      'chatSideLayout': '側邊聊天布局模式（雙欄版 / 四格版）',
      'chatSideLayoutStep1': '右側聊天室區域固定顯示，不會隨視頻布局改變',
      'chatSideLayoutStep2': '每個聊天室面板頂部都有下拉選擇器',
      'chatSideLayoutStep3': '從選擇器中選擇要顯示的串流聊天室',
      'chatSideLayoutStep4': '支援 Twitch 和 YouTube 聊天室嵌入',
      'chatSideLayoutStep5': '無需調整串流順序，直接選擇即可切換',
      'chatWarning': '⚠️ 注意：YouTube 聊天室需要在正式環境（非 localhost）才能嵌入',
      'volumeTitle': '🔊 音量控制',
      'volumeStep1': '使用「總音量」滑桿調整所有串流的音量',
      'volumeStep2': '在「串流順序」列表中，調整單個串流的音量',
      'volumeStep3': '點擊「全部靜音」快速靜音/取消靜音所有串流',
      'favoriteTitle': '⭐ 收藏功能',
      'favoriteStep1': '點擊「管理收藏」打開收藏管理界面',
      'favoriteStep2': '在「收藏串流」標籤頁中：',
      'favoriteStep2Item1': '輸入串流網址和自訂名稱（選填）',
      'favoriteStep2Item2': '選擇分類（可選）',
      'favoriteStep2Item3': '點擊「加入收藏」',
      'favoriteStep3': '在「分類管理」標籤頁中創建和管理分類',
      'favoriteStep4': '在控制面板的「收藏串流」區域：',
      'favoriteStep4Item1': '使用下拉選單選擇「全部收藏」或「未分類」',
      'favoriteStep4Item2': '點擊列表中的串流名稱即可載入',
      'backupTitle': '💾 數據備份',
      'backupStep1': '在「管理收藏」→「設定」標籤頁中啟用數據備份',
      'backupStep2': '點擊「選擇文件位置」選擇備份文件（會自動導入數據）',
      'backupStep3': '或點擊「創建新文件」創建新的備份文件',
      'backupStep4': '啟用後，每次修改收藏或分類時會自動保存',
      'backupTip': '💡 提示：頁面載入時會自動嘗試讀取備份文件',
      'controlPanelTitle': '🎛️ 控制面板',
      'controlPanelStep1': '控制面板位於畫面右側，可以收起/展開',
      'controlPanelStep2': '點擊控制面板標題或右側的展開按鈕來展開/收起面板',
      'controlPanelStep3': '如果沒有任何串流，控制面板會自動展開',
      'controlPanelStep4': '在「串流順序」中可以拖曳調整串流順序',
      'mobileTitle': '📱 移動設備',
      'mobileStep1': '在手機和平板上，控制面板會全屏顯示',
      'mobileStep2': '所有按鈕和輸入框都已優化，適合觸摸操作',
      'mobileStep3': '支援橫向和縱向模式',
      'tipsTitle': '💡 快捷提示',
      'tip1': '點擊「收藏當前」可以快速將當前顯示的串流加入收藏',
      'tip2': '在收藏列表中，可以點擊分類名稱旁的「▶ 載入」按鈕一鍵載入整個分類的串流',
      'tip3': '串流視窗可以拖曳調整大小和位置',
      'tip4': '點擊串流視窗可以切換為活動狀態（紫色邊框）',
      
      // 收藏系統
      'favoriteManager': '收藏管理',
      'favoriteStreamsTab': '收藏串流',
      'categoryManagementTab': '分類管理',
      'settingsTab': '設定',
      'pasteStreamUrl': '貼上串流網址',
      'customNameOptional': '自訂名稱（選填）',
      'addToFavorites': '加入收藏',
      'all': '全部',
      'selectAll': '全選',
      'deselectAll': '取消全選',
      'loadSelected': '一鍵載入選中',
      'noFavorites': '暫無收藏',
      'unknownCategory': '未知分類',
      'edit': '編輯',
      'load': '載入',
      'remove': '移除',
      'save': '保存',
      'cancel': '取消',
      'categoryName': '分類名稱',
      'addCategory': '新增分類',
      'noCategories': '暫無分類',
      'favoritesCount': '個收藏',
      'loadCategory': '一鍵載入此分類',
      'enableAutoBackup': '啟用數據自動備份',
      'backupWarning': '⚠️ 啟用後，請在下方設置備份文件位置。之後每次編輯、新增或刪除收藏時會自動保存到該固定位置，不會觸發下載。',
      'backupFileLocation': '備份文件位置：',
      'selectFileLocation': '選擇文件位置',
      'createNewFile': '創建新文件',
      'selectFileLocationDesc': '選擇文件位置：打開現有備份文件並自動載入數據',
      'createNewFileDesc': '創建新文件：創建新的備份文件（不會載入數據）',
      'notSet': '未設置',
      'dataSaved': '資料已儲存',
      'pleaseEnterStreamUrl': '請輸入串流網址',
      'streamAlreadyInFavorites': '此串流已在收藏列表中',
      'addedToFavorites': '已添加到收藏',
      'cannotParseStreamUrl': '無法解析串流網址',
      'favoriteNotFound': '收藏不存在',
      'favoriteUpdated': '收藏已更新',
      'favoriteRemoved': '已移除收藏',
      'invalidFavoriteItem': '無效的收藏項目',
      'noFavoritesToLoad': '沒有可加載的收藏',
      'loadingStreams': '正在加載',
      'streams': '個串流',
      'noStreamsToFavorite': '目前沒有串流可以收藏',
      'successfullyFavorited': '已成功收藏',
      'alreadyExists': '個已存在',
      'allStreamsAlreadyInFavorites': '所有串流都已在收藏列表中',
      'categoryAdded': '分類已添加',
      'categoryRemoved': '分類已移除',
      'categoryUpdated': '分類已更新',
      'pleaseEnterCategoryName': '請輸入分類名稱',
      'categoryExists': '此分類名稱已存在',
      'noFavoritesInCategory': '此分類下沒有收藏',
      'categoryFavoritesCount': '共',
      'favoritesInCategory': '個收藏',
      'loadCategoryFavorites': '一鍵載入此分類',
      'categoryNotFound': '分類不存在',
      'favoriteNameCannotBeEmpty': '收藏名稱不能為空',
      'pleaseSelectAtLeastOneFavorite': '請至少選擇一個收藏',
      'categoryExists': '此分類名稱已存在',
      'categoryAdded': '分類已添加',
      'categoryRemoved': '分類已移除',
      'categoryUpdated': '分類已更新'
    },
    
    'zh-CN': {
      // 控制面板
      'controlPanel': '控制面板',
      'settings': '设置',
      'expandPanel': '展开控制面板',
      'collapsePanel': '收起控制面板',
      'addStreamPlaceholder': '贴上 Twitch / YouTube 直播网址',
      'addStreamButton': '加入画面',
      'layoutControl': '布局控制',
      'singleView': '单一画面',
      'splitHorizontal': '左右分割',
      'splitVertical': '上下分割',
      'grid4': '四宫格',
      'largeTop3': '上大下三',
      'grid2x3': '2×3 网格',
      'grid3x3': '3×3 网格',
      'sideChatLayout': '侧边聊天布局',
      'dualColumnChat': '双栏聊天布局（左侧视频可调整，右侧固定两个聊天室）',
      'quadChat': '四格聊天布局（左侧视频可调整，右侧固定四个聊天室）',
      'singleChatLayout': '单一聊天室布局（左侧视频可调整，右侧固定一个聊天室）',
      'chatControl': '聊天室控制',
      'showAllChats': '显示所有聊天室',
      'hideAllChats': '隐藏所有聊天室',
      'favoriteStreams': '收藏串流',
      'manageFavorites': '管理收藏',
      'addCurrentToFavorites': '收藏当前',
      'allFavorites': '全部收藏',
      'uncategorized': '未分类',
      'mediaControl': '媒体控制',
      'masterVolume': '总音量',
      'muteAll': '全部静音',
      'streamOrder': '串流顺序',
      'noStreams': '暂无串流',
      'volume': '音量',
      'adjustVolume': '调整音量',
      'moveUp': '上移',
      'moveDown': '下移',
      'feedback': '意见反馈',
      'giveFeedback': '给予意见反馈',
      'versionHistory': '版本记录',
      'userGuide': '使用教学',
      'privacyPolicy': '隐私权政策',
      'copyright': '© 2025 Hsiung-Shao. All rights reserved.',
      'freeTool': '本工具完全免费开放给所有人使用，欢迎分享链接给朋友！',
      'language': '语言',
      'selectLanguage': '选择语言',
      'chineseTraditional': '繁體中文',
      'chineseSimplified': '简体中文',
      'english': 'English',
      'japanese': '日本語',
      
      // 版本紀錄
      'version': '版本',
      'close': '关闭',
      'version1.4.1.change1': '全站支援多國語言（繁中、簡中、英文、日語）',
      'version1.4.1.change2': '新增右侧单一聊天室',
      'version1.4.0.change2': '修复多语言切换时收藏串流选单回到繁体中文的问题',
      'version1.4.0.change3': '修复控制面板标题和显示所有聊天室按钮的多语言显示问题',
      'version1.4.0.change4': '修复多语言初始化导致的功能失效问题（控制面板缩放、聊天室切换、串流顺序清单）',
      'version1.4.0.change5': '修复代码错误（i18n 重复声明、函数未定义等）',
      'version1.3.0.change1': '新增侧边聊天布局功能（双栏版和四格版）',
      'version1.3.0.change2': '双栏聊天布局：左侧视频区域可自由调整布局，右侧固定显示两个聊天室（左右排列）',
      'version1.3.0.change3': '四格聊天布局：左侧视频区域可自由调整布局，右侧固定显示四个聊天室（2×2 网格排列）',
      'version1.3.0.change4': '聊天室选择器功能，无需调整串流顺序即可快速切换要显示的聊天室',
      'version1.3.0.change5': '优化布局切换流畅度，一次点击即可完成切换',
      'version1.3.0.change6': '改进选择器响应速度，减少延迟',
      'version1.2.0.change1': '新增本地文件备份功能',
      'version1.2.0.change2': '改进收藏管理界面',
      'version1.2.0.change3': '新增设定标签页',
      'version1.2.0.change4': '优化安全性（XSS 防护）',
      'version1.2.0.change5': '改进 YouTube 聊天室嵌入支持',
      'version1.2.0.change6': '新增版本记录功能',
      'version1.2.0.change7': '新增鼠标悬停自动展开控制面板',
      'version1.2.0.change8': '更新著作权信息',
      'version1.1.0.change1': '新增分类管理功能',
      'version1.1.0.change2': '改进控制面板 UI',
      'version1.1.0.change3': '优化布局自动切换',
      'version1.1.0.change4': '修复多个已知问题',
      'version1.0.0.change1': '初始版本发布',
      'version1.0.0.change2': '支持 Twitch 和 YouTube 直播串流',
      'version1.0.0.change3': '多种布局模式',
      'version1.0.0.change4': '聊天室整合',
      'version1.0.0.change5': '音量控制功能',
      'version1.0.0.change6': '收藏功能',
      
      // 使用教學
      'addStreamTitle': '📺 添加串流',
      'addStreamStep1': '在控制面板顶部的输入框中，贴上 Twitch 或 YouTube 直播网址',
      'addStreamStep2': '点击「加入画面」按钮',
      'addStreamStep3': '串流会自动载入并显示在画面上',
      'addStreamTip': '💡 提示：支持的网址格式包括：',
      'addStreamTipTwitch': '• Twitch: https://www.twitch.tv/频道名称',
      'addStreamTipYouTube': '• YouTube: https://www.youtube.com/watch?v=视频ID 或 https://youtu.be/视频ID',
      'layoutTitle': '🎨 调整布局',
      'layoutBasic': '基本布局',
      'layoutBasicStep1': '在控制面板的「布局控制」区域，点击布局预览按钮',
      'layoutBasicStep2': '可选择：单一画面、左右分割、上下分割、四宫格、上大下三、2×3 网格、3×3 网格',
      'layoutBasicStep3': '系统会根据串流数量自动选择最适合的布局',
      'layoutSideChat': '侧边聊天布局（双栏版 / 四格版）',
      'layoutSideChatStep1': '点击「双栏聊天布局」或「四格聊天布局」按钮启用侧边聊天布局',
      'layoutSideChatStep2': '左侧视频区域可以使用布局按钮（1-6、9）调整显示方式',
      'layoutSideChatStep3': '右侧聊天室区域固定，不会随视频布局改变',
      'layoutSideChatStep4': '每个聊天室面板都有下拉选择器，可以选择要显示的串流聊天室',
      'layoutSideChatStep5': '双栏聊天布局：右侧显示两个聊天室（左右排列）',
      'layoutSideChatStep6': '四格聊天布局：右侧显示四个聊天室（2×2 网格排列）',
      'layoutSideChatTip': '💡 提示：侧边聊天布局模式下，无需调整串流顺序，直接从聊天室选择器中选择要显示的串流即可',
      'chatTitle': '💬 聊天室功能',
      'chatBasic': '基本模式',
      'chatBasicStep1': '点击串流窗口中的聊天室按钮（💬）显示/隐藏聊天室',
      'chatBasicStep2': '使用「显示所有聊天室」按钮一次性显示所有聊天室',
      'chatBasicStep3': '聊天室会自动嵌入到串流窗口中',
      'chatSideLayout': '侧边聊天布局模式（双栏版 / 四格版）',
      'chatSideLayoutStep1': '右侧聊天室区域固定显示，不会随视频布局改变',
      'chatSideLayoutStep2': '每个聊天室面板顶部都有下拉选择器',
      'chatSideLayoutStep3': '从选择器中选择要显示的串流聊天室',
      'chatSideLayoutStep4': '支持 Twitch 和 YouTube 聊天室嵌入',
      'chatSideLayoutStep5': '无需调整串流顺序，直接选择即可切换',
      'chatWarning': '⚠️ 注意：YouTube 聊天室需要在正式环境（非 localhost）才能嵌入',
      'volumeTitle': '🔊 音量控制',
      'volumeStep1': '使用「总音量」滑杆调整所有串流的音量',
      'volumeStep2': '在「串流顺序」列表中，调整单个串流的音量',
      'volumeStep3': '点击「全部静音」快速静音/取消静音所有串流',
      'favoriteTitle': '⭐ 收藏功能',
      'favoriteStep1': '点击「管理收藏」打开收藏管理界面',
      'favoriteStep2': '在「收藏串流」标签页中：',
      'favoriteStep2Item1': '输入串流网址和自定义名称（选填）',
      'favoriteStep2Item2': '选择分类（可选）',
      'favoriteStep2Item3': '点击「加入收藏」',
      'favoriteStep3': '在「分类管理」标签页中创建和管理分类',
      'favoriteStep4': '在控制面板的「收藏串流」区域：',
      'favoriteStep4Item1': '使用下拉菜单选择「全部收藏」或「未分类」',
      'favoriteStep4Item2': '点击列表中的串流名称即可载入',
      'backupTitle': '💾 数据备份',
      'backupStep1': '在「管理收藏」→「设置」标签页中启用数据备份',
      'backupStep2': '点击「选择文件位置」选择备份文件（会自动导入数据）',
      'backupStep3': '或点击「创建新文件」创建新的备份文件',
      'backupStep4': '启用后，每次修改收藏或分类时会自动保存',
      'backupTip': '💡 提示：页面载入时会自动尝试读取备份文件',
      'controlPanelTitle': '🎛️ 控制面板',
      'controlPanelStep1': '控制面板位于画面右侧，可以收起/展开',
      'controlPanelStep2': '点击控制面板标题或右侧的展开按钮来展开/收起面板',
      'controlPanelStep3': '如果没有任何串流，控制面板会自动展开',
      'controlPanelStep4': '在「串流顺序」中可以拖拽调整串流顺序',
      'mobileTitle': '📱 移动设备',
      'mobileStep1': '在手机和平板上，控制面板会全屏显示',
      'mobileStep2': '所有按钮和输入框都已优化，适合触摸操作',
      'mobileStep3': '支持横向和纵向模式',
      'tipsTitle': '💡 快捷提示',
      'tip1': '点击「收藏当前」可以快速将当前显示的串流加入收藏',
      'tip2': '在收藏列表中，可以点击分类名称旁的「▶ 载入」按钮一键载入整个分类的串流',
      'tip3': '串流窗口可以拖拽调整大小和位置',
      'tip4': '点击串流窗口可以切换为活动状态（紫色边框）',
      
      // 收藏系統
      'favoriteManager': '收藏管理',
      'favoriteStreamsTab': '收藏串流',
      'categoryManagementTab': '分类管理',
      'settingsTab': '设置',
      'pasteStreamUrl': '贴上串流网址',
      'customNameOptional': '自定义名称（选填）',
      'addToFavorites': '加入收藏',
      'all': '全部',
      'selectAll': '全选',
      'deselectAll': '取消全选',
      'loadSelected': '一键载入选中',
      'noFavorites': '暂无收藏',
      'unknownCategory': '未知分类',
      'edit': '编辑',
      'load': '载入',
      'remove': '移除',
      'save': '保存',
      'cancel': '取消',
      'categoryName': '分类名称',
      'addCategory': '新增分类',
      'noCategories': '暂无分类',
      'favoritesCount': '个收藏',
      'loadCategory': '一键载入此分类',
      'enableAutoBackup': '启用数据自动备份',
      'backupWarning': '⚠️ 启用后，请在下方设置备份文件位置。之后每次编辑、新增或删除收藏时会自动保存到该固定位置，不会触发下载。',
      'backupFileLocation': '备份文件位置：',
      'selectFileLocation': '选择文件位置',
      'createNewFile': '创建新文件',
      'selectFileLocationDesc': '选择文件位置：打开现有备份文件并自动载入数据',
      'createNewFileDesc': '创建新文件：创建新的备份文件（不会载入数据）',
      'notSet': '未设置',
      'dataSaved': '资料已储存',
      'pleaseEnterStreamUrl': '请输入串流网址',
      'streamAlreadyInFavorites': '此串流已在收藏列表中',
      'addedToFavorites': '已添加到收藏',
      'cannotParseStreamUrl': '无法解析串流网址',
      'favoriteNotFound': '收藏不存在',
      'favoriteUpdated': '收藏已更新',
      'favoriteRemoved': '已移除收藏',
      'invalidFavoriteItem': '无效的收藏项目',
      'noFavoritesToLoad': '没有可载入的收藏',
      'loadingStreams': '正在载入',
      'streams': '个串流',
      'noStreamsToFavorite': '目前没有串流可以收藏',
      'successfullyFavorited': '已成功收藏',
      'alreadyExists': '个已存在',
      'allStreamsAlreadyInFavorites': '所有串流都已在收藏列表中',
      'categoryAdded': '分类已添加',
      'categoryRemoved': '分类已移除',
      'categoryUpdated': '分类已更新',
      'pleaseEnterCategoryName': '请输入分类名称',
      'categoryExists': '此分类名称已存在',
      'noFavoritesInCategory': '此分类下没有收藏',
      'categoryFavoritesCount': '共',
      'favoritesInCategory': '个收藏',
      'loadCategoryFavorites': '一键载入此分类',
      'categoryNotFound': '分类不存在',
      'favoriteNameCannotBeEmpty': '收藏名称不能为空',
      'pleaseSelectAtLeastOneFavorite': '请至少选择一个收藏',
      'categoryExists': '此分类名称已存在',
      'categoryAdded': '分类已添加',
      'categoryRemoved': '分类已移除',
      'categoryUpdated': '分类已更新'
    },
    
    'en': {
      // Control Panel
      'controlPanel': 'Control Panel',
      'settings': 'Settings',
      'expandPanel': 'Expand Control Panel',
      'collapsePanel': 'Collapse Control Panel',
      'addStreamPlaceholder': 'Paste Twitch / YouTube Stream URL',
      'addStreamButton': 'Add Stream',
      'layoutControl': 'Layout Control',
      'singleView': 'Single View',
      'splitHorizontal': 'Split Horizontal',
      'splitVertical': 'Split Vertical',
      'grid4': 'Grid 2×2',
      'largeTop3': 'Large Top + 3',
      'grid2x3': 'Grid 2×3',
      'grid3x3': 'Grid 3×3',
      'sideChatLayout': 'Side Chat Layout',
      'dualColumnChat': 'Dual Column Chat Layout (Left: adjustable video, Right: 2 fixed chat rooms)',
      'quadChat': 'Quad Chat Layout (Left: adjustable video, Right: 4 fixed chat rooms)',
      'singleChatLayout': 'Single Chat Layout (Left: adjustable video, Right: 1 fixed chat room)',
      'chatControl': 'Chat Control',
      'showAllChats': 'Show All Chats',
      'hideAllChats': 'Hide All Chats',
      'favoriteStreams': 'Favorite Streams',
      'manageFavorites': 'Manage Favorites',
      'addCurrentToFavorites': 'Add Current',
      'allFavorites': 'All Favorites',
      'uncategorized': 'Uncategorized',
      'mediaControl': 'Media Control',
      'masterVolume': 'Master Volume',
      'muteAll': 'Mute All',
      'streamOrder': 'Stream Order',
      'noStreams': 'No Streams',
      'volume': 'Volume',
      'adjustVolume': 'Adjust Volume',
      'moveUp': 'Move Up',
      'moveDown': 'Move Down',
      'feedback': 'Feedback',
      'giveFeedback': 'Give Feedback',
      'versionHistory': 'Version History',
      'userGuide': 'User Guide',
      'privacyPolicy': 'Privacy Policy',
      'copyright': '© 2025 Hsiung-Shao. All rights reserved.',
      'freeTool': 'This tool is completely free and open to everyone. Feel free to share the link with your friends!',
      'language': 'Language',
      'selectLanguage': 'Select Language',
      'chineseTraditional': '繁體中文',
      'chineseSimplified': '简体中文',
      'english': 'English',
      'japanese': '日本語',
      
      // Version History
      'version': 'Version',
      'close': 'Close',
      'version1.4.1.change1': 'Full site multi-language support (Traditional Chinese, Simplified Chinese, English, Japanese)',
      'version1.4.1.change2': 'Added right side single chat room',
      'version1.4.0.change2': 'Fixed issue where favorites dropdown menu reverted to Traditional Chinese after language switch',
      'version1.4.0.change3': 'Fixed multi-language display issues for control panel title and "Show All Chats" button',
      'version1.4.0.change4': 'Fixed functionality issues caused by multi-language initialization (control panel collapse, chat toggle, stream order list)',
      'version1.4.0.change5': 'Fixed code errors (duplicate i18n declarations, undefined functions, etc.)',
      'version1.3.0.change1': 'Added side chat layout feature (Dual Column and Quad versions)',
      'version1.3.0.change2': 'Dual Column Chat Layout: Left video area can be freely adjusted, right side fixed with 2 chat rooms (side by side)',
      'version1.3.0.change3': 'Quad Chat Layout: Left video area can be freely adjusted, right side fixed with 4 chat rooms (2×2 grid)',
      'version1.3.0.change4': 'Chat selector feature, quickly switch chat rooms without adjusting stream order',
      'version1.3.0.change5': 'Optimized layout switching smoothness, one click to complete switching',
      'version1.3.0.change6': 'Improved selector response speed, reduced latency',
      'version1.2.0.change1': 'Added local file backup feature',
      'version1.2.0.change2': 'Improved favorites management interface',
      'version1.2.0.change3': 'Added Settings tab',
      'version1.2.0.change4': 'Enhanced security (XSS protection)',
      'version1.2.0.change5': 'Improved YouTube chat embedding support',
      'version1.2.0.change6': 'Added version history feature',
      'version1.2.0.change7': 'Added auto-expand control panel on mouse hover',
      'version1.2.0.change8': 'Updated copyright information',
      'version1.1.0.change1': 'Added category management feature',
      'version1.1.0.change2': 'Improved control panel UI',
      'version1.1.0.change3': 'Optimized automatic layout switching',
      'version1.1.0.change4': 'Fixed multiple known issues',
      'version1.0.0.change1': 'Initial version release',
      'version1.0.0.change2': 'Support for Twitch and YouTube live streams',
      'version1.0.0.change3': 'Multiple layout modes',
      'version1.0.0.change4': 'Chat integration',
      'version1.0.0.change5': 'Volume control feature',
      'version1.0.0.change6': 'Favorites feature',
      
      // User Guide
      'addStreamTitle': '📺 Add Stream',
      'addStreamStep1': 'Paste a Twitch or YouTube stream URL in the input box at the top of the control panel',
      'addStreamStep2': 'Click the "Add Stream" button',
      'addStreamStep3': 'The stream will automatically load and display on the screen',
      'addStreamTip': '💡 Tip: Supported URL formats include:',
      'addStreamTipTwitch': '• Twitch: https://www.twitch.tv/channelname',
      'addStreamTipYouTube': '• YouTube: https://www.youtube.com/watch?v=videoID or https://youtu.be/videoID',
      'layoutTitle': '🎨 Adjust Layout',
      'layoutBasic': 'Basic Layout',
      'layoutBasicStep1': 'In the "Layout Control" area of the control panel, click the layout preview buttons',
      'layoutBasicStep2': 'Options: Single View, Split Horizontal, Split Vertical, Grid 2×2, Large Top + 3, Grid 2×3, Grid 3×3',
      'layoutBasicStep3': 'The system will automatically select the most suitable layout based on the number of streams',
      'layoutSideChat': 'Side Chat Layout (Dual Column / Quad)',
      'layoutSideChatStep1': 'Click the "Dual Column Chat Layout" or "Quad Chat Layout" button to enable side chat layout',
      'layoutSideChatStep2': 'The left video area can be adjusted using layout buttons (1-6, 9)',
      'layoutSideChatStep3': 'The right chat area is fixed and will not change with video layout',
      'layoutSideChatStep4': 'Each chat panel has a dropdown selector to choose which stream chat to display',
      'layoutSideChatStep5': 'Dual Column Chat Layout: Right side displays 2 chat rooms (side by side)',
      'layoutSideChatStep6': 'Quad Chat Layout: Right side displays 4 chat rooms (2×2 grid)',
      'layoutSideChatTip': '💡 Tip: In side chat layout mode, you don\'t need to adjust stream order, just select the stream from the chat selector',
      'chatTitle': '💬 Chat Features',
      'chatBasic': 'Basic Mode',
      'chatBasicStep1': 'Click the chat button (💬) in the stream window to show/hide chat',
      'chatBasicStep2': 'Use the "Show All Chats" button to show all chats at once',
      'chatBasicStep3': 'Chat will automatically embed into the stream window',
      'chatSideLayout': 'Side Chat Layout Mode (Dual Column / Quad)',
      'chatSideLayoutStep1': 'The right chat area is fixed and will not change with video layout',
      'chatSideLayoutStep2': 'Each chat panel has a dropdown selector at the top',
      'chatSideLayoutStep3': 'Select the stream chat to display from the selector',
      'chatSideLayoutStep4': 'Supports Twitch and YouTube chat embedding',
      'chatSideLayoutStep5': 'No need to adjust stream order, just select to switch',
      'chatWarning': '⚠️ Note: YouTube chat requires a production environment (not localhost) to embed',
      'volumeTitle': '🔊 Volume Control',
      'volumeStep1': 'Use the "Master Volume" slider to adjust volume for all streams',
      'volumeStep2': 'In the "Stream Order" list, adjust individual stream volume',
      'volumeStep3': 'Click "Mute All" to quickly mute/unmute all streams',
      'favoriteTitle': '⭐ Favorites',
      'favoriteStep1': 'Click "Manage Favorites" to open the favorites management interface',
      'favoriteStep2': 'In the "Favorite Streams" tab:',
      'favoriteStep2Item1': 'Enter stream URL and custom name (optional)',
      'favoriteStep2Item2': 'Select category (optional)',
      'favoriteStep2Item3': 'Click "Add to Favorites"',
      'favoriteStep3': 'Create and manage categories in the "Category Management" tab',
      'favoriteStep4': 'In the "Favorite Streams" area of the control panel:',
      'favoriteStep4Item1': 'Use the dropdown to select "All Favorites" or "Uncategorized"',
      'favoriteStep4Item2': 'Click the stream name in the list to load',
      'backupTitle': '💾 Data Backup',
      'backupStep1': 'Enable data backup in "Manage Favorites" → "Settings" tab',
      'backupStep2': 'Click "Select File Location" to choose a backup file (data will be automatically imported)',
      'backupStep3': 'Or click "Create New File" to create a new backup file',
      'backupStep4': 'Once enabled, data will be automatically saved when favorites or categories are modified',
      'backupTip': '💡 Tip: The page will automatically try to read the backup file on load',
      'controlPanelTitle': '🎛️ Control Panel',
      'controlPanelStep1': 'The control panel is located on the right side of the screen and can be collapsed/expanded',
      'controlPanelStep2': 'Click the control panel title or the expand button on the right to expand/collapse the panel',
      'controlPanelStep3': 'If there are no streams, the control panel will automatically expand',
      'controlPanelStep4': 'In "Stream Order", you can drag to adjust stream order',
      'mobileTitle': '📱 Mobile Devices',
      'mobileStep1': 'On phones and tablets, the control panel will display in full screen',
      'mobileStep2': 'All buttons and input boxes are optimized for touch operation',
      'mobileStep3': 'Supports both landscape and portrait modes',
      'tipsTitle': '💡 Quick Tips',
      'tip1': 'Click "Add Current" to quickly add the currently displayed stream to favorites',
      'tip2': 'In the favorites list, you can click the "▶ Load" button next to the category name to load all streams in that category',
      'tip3': 'Stream windows can be dragged to adjust size and position',
      'tip4': 'Click a stream window to switch it to active state (purple border)',
      
      // Favorite System
      'favoriteManager': 'Favorite Management',
      'favoriteStreamsTab': 'Favorite Streams',
      'categoryManagementTab': 'Category Management',
      'settingsTab': 'Settings',
      'pasteStreamUrl': 'Paste Stream URL',
      'customNameOptional': 'Custom Name (Optional)',
      'addToFavorites': 'Add to Favorites',
      'all': 'All',
      'selectAll': 'Select All',
      'deselectAll': 'Deselect All',
      'loadSelected': 'Load Selected',
      'noFavorites': 'No Favorites',
      'unknownCategory': 'Unknown Category',
      'edit': 'Edit',
      'load': 'Load',
      'remove': 'Remove',
      'save': 'Save',
      'cancel': 'Cancel',
      'categoryName': 'Category Name',
      'addCategory': 'Add Category',
      'noCategories': 'No Categories',
      'favoritesCount': ' favorites',
      'loadCategory': 'Load This Category',
      'enableAutoBackup': 'Enable Auto Backup',
      'backupWarning': '⚠️ After enabling, please set the backup file location below. After that, each time you edit, add or delete favorites, it will automatically save to that fixed location without triggering a download.',
      'backupFileLocation': 'Backup File Location:',
      'selectFileLocation': 'Select File Location',
      'createNewFile': 'Create New File',
      'selectFileLocationDesc': 'Select File Location: Open existing backup file and automatically load data',
      'createNewFileDesc': 'Create New File: Create a new backup file (will not load data)',
      'notSet': 'Not Set',
      'dataSaved': 'Data Saved',
      'pleaseEnterStreamUrl': 'Please enter stream URL',
      'streamAlreadyInFavorites': 'This stream is already in favorites',
      'addedToFavorites': 'Added to Favorites',
      'cannotParseStreamUrl': 'Cannot parse stream URL',
      'favoriteNotFound': 'Favorite not found',
      'favoriteUpdated': 'Favorite updated',
      'favoriteRemoved': 'Favorite removed',
      'invalidFavoriteItem': 'Invalid favorite item',
      'noFavoritesToLoad': 'No favorites to load',
      'loadingStreams': 'Loading',
      'streams': ' streams',
      'noStreamsToFavorite': 'No streams to favorite',
      'successfullyFavorited': 'Successfully favorited',
      'alreadyExists': ' already exist',
      'allStreamsAlreadyInFavorites': 'All streams are already in favorites',
      'categoryAdded': 'Category added',
      'categoryRemoved': 'Category removed',
      'categoryUpdated': 'Category updated',
      'pleaseEnterCategoryName': 'Please enter category name',
      'categoryExists': 'This category name already exists',
      'noFavoritesInCategory': 'No favorites in this category',
      'categoryFavoritesCount': 'Total',
      'favoritesInCategory': ' favorites',
      'loadCategoryFavorites': 'Load This Category',
      'categoryNotFound': 'Category not found',
      'favoriteNameCannotBeEmpty': 'Favorite name cannot be empty',
      'pleaseSelectAtLeastOneFavorite': 'Please select at least one favorite',
      'categoryExists': 'This category name already exists',
      'categoryAdded': 'Category added',
      'categoryRemoved': 'Category removed',
      'categoryUpdated': 'Category updated'
    },
    
    'ja': {
      // コントロールパネル
      'controlPanel': 'コントロールパネル',
      'settings': '設定',
      'expandPanel': 'コントロールパネルを展開',
      'collapsePanel': 'コントロールパネルを折りたたむ',
      'addStreamPlaceholder': 'Twitch / YouTube ストリーム URL を貼り付け',
      'addStreamButton': 'ストリームを追加',
      'layoutControl': 'レイアウト制御',
      'singleView': '単一画面',
      'splitHorizontal': '左右分割',
      'splitVertical': '上下分割',
      'grid4': '2×2 グリッド',
      'largeTop3': '上部大 + 3',
      'grid2x3': '2×3 グリッド',
      'grid3x3': '3×3 グリッド',
      'sideChatLayout': 'サイドチャットレイアウト',
      'dualColumnChat': 'デュアルカラムチャットレイアウト（左：調整可能な動画、右：2つの固定チャットルーム）',
      'quadChat': 'クアッドチャットレイアウト（左：調整可能な動画、右：4つの固定チャットルーム）',
      'singleChatLayout': 'シングルチャットレイアウト（左：調整可能な動画、右：1つの固定チャットルーム）',
      'singleChatLayout': 'シングルチャットレイアウト（左：調整可能な動画、右：1つの固定チャットルーム）',
      'chatControl': 'チャット制御',
      'showAllChats': 'すべてのチャットを表示',
      'hideAllChats': 'すべてのチャットを非表示',
      'favoriteStreams': 'お気に入りストリーム',
      'manageFavorites': 'お気に入りを管理',
      'addCurrentToFavorites': '現在を追加',
      'allFavorites': 'すべてのお気に入り',
      'uncategorized': '未分類',
      'mediaControl': 'メディア制御',
      'masterVolume': 'マスターボリューム',
      'muteAll': 'すべてミュート',
      'streamOrder': 'ストリーム順序',
      'noStreams': 'ストリームなし',
      'volume': '音量',
      'adjustVolume': '音量を調整',
      'moveUp': '上に移動',
      'moveDown': '下に移動',
      'feedback': 'フィードバック',
      'giveFeedback': 'フィードバックを送信',
      'versionHistory': 'バージョン履歴',
      'userGuide': 'ユーザーガイド',
      'privacyPolicy': 'プライバシーポリシー',
      'copyright': '© 2025 Hsiung-Shao. All rights reserved.',
      'freeTool': 'このツールは完全に無料で、すべての人に開放されています。リンクを友達と共有してください！',
      'language': '言語',
      'selectLanguage': '言語を選択',
      'chineseTraditional': '繁體中文',
      'chineseSimplified': '简体中文',
      'english': 'English',
      'japanese': '日本語',
      
      // バージョン履歴
      'version': 'バージョン',
      'close': '閉じる',
      'version1.4.1.change1': '全サイト多言語サポート（繁体中国語、簡体中国語、英語、日本語）',
      'version1.4.1.change2': '右側シングルチャットルームを追加',
      'version1.4.0.change2': '言語切り替え時にドロップダウンメニューが繁体中国語に戻る問題を修正',
      'version1.4.0.change3': 'コントロールパネルのタイトルと「すべてのチャットを表示」ボタンの多言語表示の問題を修正',
      'version1.4.0.change4': '多言語初期化による機能障害を修正（コントロールパネルの折りたたみ、チャット切り替え、ストリーム順序リスト）',
      'version1.4.0.change5': 'コードエラーを修正（i18n の重複宣言、未定義関数など）',
      'version1.3.0.change1': 'サイドチャットレイアウト機能を追加（デュアルカラム版とクアッド版）',
      'version1.3.0.change2': 'デュアルカラムチャットレイアウト：左側の動画エリアは自由に調整可能、右側は2つのチャットルームを固定表示（横並び）',
      'version1.3.0.change3': 'クアッドチャットレイアウト：左側の動画エリアは自由に調整可能、右側は4つのチャットルームを固定表示（2×2 グリッド）',
      'version1.3.0.change4': 'チャットセレクター機能、ストリーム順序を調整せずに表示するチャットルームをすばやく切り替え可能',
      'version1.3.0.change5': 'レイアウト切り替えの滑らかさを最適化、ワンクリックで切り替え完了',
      'version1.3.0.change6': 'セレクターの応答速度を改善、遅延を削減',
      'version1.2.0.change1': 'ローカルファイルバックアップ機能を追加',
      'version1.2.0.change2': 'お気に入り管理インターフェースを改善',
      'version1.2.0.change3': '設定タブを追加',
      'version1.2.0.change4': 'セキュリティを最適化（XSS 保護）',
      'version1.2.0.change5': 'YouTube チャット埋め込みサポートを改善',
      'version1.2.0.change6': 'バージョン履歴機能を追加',
      'version1.2.0.change7': 'マウスホバーでコントロールパネルを自動展開する機能を追加',
      'version1.2.0.change8': '著作権情報を更新',
      'version1.1.0.change1': 'カテゴリ管理機能を追加',
      'version1.1.0.change2': 'コントロールパネル UI を改善',
      'version1.1.0.change3': 'レイアウト自動切り替えを最適化',
      'version1.1.0.change4': '複数の既知の問題を修正',
      'version1.0.0.change1': '初期バージョンリリース',
      'version1.0.0.change2': 'Twitch と YouTube ライブストリームをサポート',
      'version1.0.0.change3': '複数のレイアウトモード',
      'version1.0.0.change4': 'チャット統合',
      'version1.0.0.change5': '音量制御機能',
      'version1.0.0.change6': 'お気に入り機能',
      
      // ユーザーガイド
      'addStreamTitle': '📺 ストリームを追加',
      'addStreamStep1': 'コントロールパネル上部の入力ボックスに、Twitch または YouTube ストリーム URL を貼り付けます',
      'addStreamStep2': '「ストリームを追加」ボタンをクリックします',
      'addStreamStep3': 'ストリームが自動的に読み込まれ、画面上に表示されます',
      'addStreamTip': '💡 ヒント：サポートされている URL 形式：',
      'addStreamTipTwitch': '• Twitch: https://www.twitch.tv/チャンネル名',
      'addStreamTipYouTube': '• YouTube: https://www.youtube.com/watch?v=動画ID または https://youtu.be/動画ID',
      'layoutTitle': '🎨 レイアウトを調整',
      'layoutBasic': '基本レイアウト',
      'layoutBasicStep1': 'コントロールパネルの「レイアウト制御」エリアで、レイアウトプレビューボタンをクリックします',
      'layoutBasicStep2': 'オプション：単一画面、左右分割、上下分割、2×2 グリッド、上部大 + 3、2×3 グリッド、3×3 グリッド',
      'layoutBasicStep3': 'システムはストリーム数に基づいて最適なレイアウトを自動的に選択します',
      'layoutSideChat': 'サイドチャットレイアウト（デュアルカラム版 / クアッド版）',
      'layoutSideChatStep1': '「デュアルカラムチャットレイアウト」または「クアッドチャットレイアウト」ボタンをクリックしてサイドチャットレイアウトを有効にします',
      'layoutSideChatStep2': '左側の動画エリアは、レイアウトボタン（1-6、9）を使用して表示方法を調整できます',
      'layoutSideChatStep3': '右側のチャットエリアは固定されており、動画レイアウトに応じて変更されません',
      'layoutSideChatStep4': '各チャットパネルには、表示するストリームチャットを選択するドロップダウンセレクターがあります',
      'layoutSideChatStep5': 'デュアルカラムチャットレイアウト：右側に2つのチャットルームを表示（横並び）',
      'layoutSideChatStep6': 'クアッドチャットレイアウト：右側に4つのチャットルームを表示（2×2 グリッド）',
      'layoutSideChatTip': '💡 ヒント：サイドチャットレイアウトモードでは、ストリーム順序を調整する必要はなく、チャットセレクターからストリームを選択するだけです',
      'chatTitle': '💬 チャット機能',
      'chatBasic': '基本モード',
      'chatBasicStep1': 'ストリームウィンドウのチャットボタン（💬）をクリックしてチャットを表示/非表示にします',
      'chatBasicStep2': '「すべてのチャットを表示」ボタンを使用して、すべてのチャットを一度に表示します',
      'chatBasicStep3': 'チャットは自動的にストリームウィンドウに埋め込まれます',
      'chatSideLayout': 'サイドチャットレイアウトモード（デュアルカラム版 / クアッド版）',
      'chatSideLayoutStep1': '右側のチャットエリアは固定表示され、動画レイアウトに応じて変更されません',
      'chatSideLayoutStep2': '各チャットパネルの上部にドロップダウンセレクターがあります',
      'chatSideLayoutStep3': 'セレクターから表示するストリームチャットを選択します',
      'chatSideLayoutStep4': 'Twitch と YouTube のチャット埋め込みをサポート',
      'chatSideLayoutStep5': 'ストリーム順序を調整する必要はなく、選択するだけで切り替えできます',
      'chatWarning': '⚠️ 注意：YouTube チャットは本番環境（localhost 以外）でないと埋め込めません',
      'volumeTitle': '🔊 音量制御',
      'volumeStep1': '「マスターボリューム」スライダーを使用して、すべてのストリームの音量を調整します',
      'volumeStep2': '「ストリーム順序」リストで、個別のストリーム音量を調整します',
      'volumeStep3': '「すべてミュート」をクリックして、すべてのストリームをすばやくミュート/ミュート解除します',
      'favoriteTitle': '⭐ お気に入り機能',
      'favoriteStep1': '「お気に入りを管理」をクリックして、お気に入り管理インターフェースを開きます',
      'favoriteStep2': '「お気に入りストリーム」タブで：',
      'favoriteStep2Item1': 'ストリーム URL とカスタム名（オプション）を入力します',
      'favoriteStep2Item2': 'カテゴリを選択します（オプション）',
      'favoriteStep2Item3': '「お気に入りに追加」をクリックします',
      'favoriteStep3': '「カテゴリ管理」タブでカテゴリを作成および管理します',
      'favoriteStep4': 'コントロールパネルの「お気に入りストリーム」エリアで：',
      'favoriteStep4Item1': 'ドロップダウンを使用して「すべてのお気に入り」または「未分類」を選択します',
      'favoriteStep4Item2': 'リスト内のストリーム名をクリックして読み込みます',
      'backupTitle': '💾 データバックアップ',
      'backupStep1': '「お気に入りを管理」→「設定」タブでデータバックアップを有効にします',
      'backupStep2': '「ファイルの場所を選択」をクリックしてバックアップファイルを選択します（データが自動的にインポートされます）',
      'backupStep3': 'または「新しいファイルを作成」をクリックして新しいバックアップファイルを作成します',
      'backupStep4': '有効にすると、お気に入りまたはカテゴリが変更されるたびに自動的に保存されます',
      'backupTip': '💡 ヒント：ページ読み込み時に自動的にバックアップファイルの読み取りを試みます',
      'controlPanelTitle': '🎛️ コントロールパネル',
      'controlPanelStep1': 'コントロールパネルは画面の右側にあり、折りたたみ/展開できます',
      'controlPanelStep2': 'コントロールパネルのタイトルまたは右側の展開ボタンをクリックして、パネルを展開/折りたたみます',
      'controlPanelStep3': 'ストリームがない場合、コントロールパネルは自動的に展開されます',
      'controlPanelStep4': '「ストリーム順序」でドラッグしてストリーム順序を調整できます',
      'mobileTitle': '📱 モバイルデバイス',
      'mobileStep1': 'スマートフォンやタブレットでは、コントロールパネルが全画面表示されます',
      'mobileStep2': 'すべてのボタンと入力ボックスはタッチ操作に最適化されています',
      'mobileStep3': '横向きと縦向きの両方のモードをサポート',
      'tipsTitle': '💡 クイックヒント',
      'tip1': '「現在を追加」をクリックして、現在表示されているストリームをお気に入りにすばやく追加できます',
      'tip2': 'お気に入りリストで、カテゴリ名の横にある「▶ 読み込み」ボタンをクリックして、そのカテゴリのすべてのストリームを一度に読み込むことができます',
      'tip3': 'ストリームウィンドウはドラッグしてサイズと位置を調整できます',
      'tip4': 'ストリームウィンドウをクリックしてアクティブ状態（紫色の境界線）に切り替えることができます',
      
      // お気に入りシステム
      'favoriteManager': 'お気に入り管理',
      'favoriteStreamsTab': 'お気に入りストリーム',
      'categoryManagementTab': 'カテゴリ管理',
      'settingsTab': '設定',
      'pasteStreamUrl': 'ストリーム URL を貼り付け',
      'customNameOptional': 'カスタム名（オプション）',
      'addToFavorites': 'お気に入りに追加',
      'all': 'すべて',
      'selectAll': 'すべて選択',
      'deselectAll': '選択解除',
      'loadSelected': '選択したものを読み込み',
      'noFavorites': 'お気に入りなし',
      'unknownCategory': '不明なカテゴリ',
      'edit': '編集',
      'load': '読み込み',
      'remove': '削除',
      'save': '保存',
      'cancel': 'キャンセル',
      'categoryName': 'カテゴリ名',
      'addCategory': 'カテゴリを追加',
      'noCategories': 'カテゴリなし',
      'favoritesCount': '個のお気に入り',
      'loadCategory': 'このカテゴリを読み込み',
      'enableAutoBackup': 'データ自動バックアップを有効にする',
      'backupWarning': '⚠️ 有効にした後、下でバックアップファイルの場所を設定してください。その後、お気に入りを編集、追加、または削除するたびに、ダウンロードをトリガーせずにその固定位置に自動的に保存されます。',
      'backupFileLocation': 'バックアップファイルの場所：',
      'selectFileLocation': 'ファイルの場所を選択',
      'createNewFile': '新しいファイルを作成',
      'selectFileLocationDesc': 'ファイルの場所を選択：既存のバックアップファイルを開いてデータを自動的に読み込みます',
      'createNewFileDesc': '新しいファイルを作成：新しいバックアップファイルを作成します（データは読み込まれません）',
      'notSet': '未設定',
      'dataSaved': 'データが保存されました',
      'pleaseEnterStreamUrl': 'ストリーム URL を入力してください',
      'streamAlreadyInFavorites': 'このストリームは既にお気に入りにあります',
      'addedToFavorites': 'お気に入りに追加されました',
      'cannotParseStreamUrl': 'ストリーム URL を解析できません',
      'favoriteNotFound': 'お気に入りが見つかりません',
      'favoriteUpdated': 'お気に入りが更新されました',
      'favoriteRemoved': 'お気に入りが削除されました',
      'invalidFavoriteItem': '無効なお気に入り項目',
      'noFavoritesToLoad': '読み込むお気に入りがありません',
      'loadingStreams': '読み込み中',
      'streams': '個のストリーム',
      'noStreamsToFavorite': 'お気に入りにするストリームがありません',
      'successfullyFavorited': 'お気に入りに追加しました',
      'alreadyExists': '個は既に存在します',
      'allStreamsAlreadyInFavorites': 'すべてのストリームが既にお気に入りにあります',
      'categoryAdded': 'カテゴリが追加されました',
      'categoryRemoved': 'カテゴリが削除されました',
      'categoryUpdated': 'カテゴリが更新されました',
      'pleaseEnterCategoryName': 'カテゴリ名を入力してください',
      'categoryExists': 'このカテゴリ名は既に存在します',
      'noFavoritesInCategory': 'このカテゴリにお気に入りがありません',
      'categoryFavoritesCount': '合計',
      'favoritesInCategory': '個のお気に入り',
      'loadCategoryFavorites': 'このカテゴリを読み込み',
      'categoryNotFound': 'カテゴリが見つかりません',
      'favoriteNameCannotBeEmpty': 'お気に入り名を空にすることはできません',
      'pleaseSelectAtLeastOneFavorite': '少なくとも1つのお気に入りを選択してください',
      'categoryExists': 'このカテゴリ名は既に存在します',
      'categoryAdded': 'カテゴリが追加されました',
      'categoryRemoved': 'カテゴリが削除されました',
      'categoryUpdated': 'カテゴリが更新されました'
    }
  },
  
  // 獲取翻譯
  t: function(key) {
    const lang = this.currentLang;
    if (this.translations[lang] && this.translations[lang][key]) {
      return this.translations[lang][key];
    }
    // 如果找不到翻譯，返回繁體中文
    if (this.translations['zh-TW'] && this.translations['zh-TW'][key]) {
      return this.translations['zh-TW'][key];
    }
    // 如果還是找不到，返回 key
    return key;
  },
  
  // 設置語言
  setLanguage: function(lang) {
    if (this.translations[lang]) {
      this.currentLang = lang;
      localStorage.setItem('preferredLanguage', lang);
      this.updatePage();
      return true;
    }
    return false;
  },
  
  // 獲取當前語言
  getLanguage: function() {
    return this.currentLang;
  },
  
  // 初始化語言
  init: function() {
    // 從 localStorage 讀取語言設置
    const savedLang = localStorage.getItem('preferredLanguage');
    if (savedLang && this.translations[savedLang]) {
      this.currentLang = savedLang;
    } else {
      // 根據瀏覽器語言自動選擇
      const browserLang = navigator.language || navigator.userLanguage;
      if (browserLang.startsWith('zh')) {
        if (browserLang.includes('CN') || browserLang.includes('Hans')) {
          this.currentLang = 'zh-CN';
        } else {
          this.currentLang = 'zh-TW';
        }
      } else if (browserLang.startsWith('ja')) {
        this.currentLang = 'ja';
      } else if (browserLang.startsWith('en')) {
        this.currentLang = 'en';
      }
    }
    // 立即更新頁面（不延遲，確保功能正常運作）
    this.updatePage();
  },
  
  // 更新頁面文字
  updatePage: function() {
    // 更新語言選擇器
    const langSelector = document.getElementById('language-selector');
    if (langSelector) {
      langSelector.value = this.currentLang;
    }
    // 更新控制面板
    this.updateControlPanel();
    // 更新版本紀錄（如果已打開）
    this.updateVersionHistory();
    // 更新使用教學（如果已打開）
    this.updateUserGuide();
    // 更新收藏管理界面（如果已打開）
    this.updateFavoriteManager();
    // 更新收藏列表顯示
    if (typeof updateFavoriteListDisplay === 'function') {
      updateFavoriteListDisplay();
    }
  },
  
  // 更新版本紀錄（重新生成內容）
  updateVersionHistory: function() {
    const versionModal = document.getElementById('version-history-modal');
    if (versionModal && versionModal.style.display !== 'none' && versionModal.style.display !== '') {
      // 如果版本紀錄視窗已打開，重新生成內容
      if (typeof updateVersionHistoryContent === 'function') {
        updateVersionHistoryContent(versionModal);
      }
    }
  },
  
  // 更新使用教學（重新生成內容）
  updateUserGuide: function() {
    const guideModal = document.getElementById('user-guide-modal');
    if (guideModal && guideModal.style.display !== 'none' && guideModal.style.display !== '') {
      // 如果使用教學視窗已打開，重新生成內容
      if (typeof updateUserGuideContent === 'function') {
        updateUserGuideContent(guideModal);
      }
    }
  },
  
  // 更新收藏管理界面
  updateFavoriteManager: function() {
    const manager = document.getElementById('favorite-streams-manager');
    if (manager && manager.classList.contains('show')) {
      // 如果收藏管理界面已打開，重新生成內容
      if (typeof showFavoriteStreamsManager === 'function') {
        showFavoriteStreamsManager();
      }
    }
  },
  
  // 更新控制面板
  updateControlPanel: function() {
    // 控制面板標題 - 使用更精確的選擇器
    const panelTitleContainer = document.querySelector('.control-panel-title');
    if (panelTitleContainer) {
      const spans = panelTitleContainer.querySelectorAll('span');
      if (spans.length >= 1) {
        // 第一個 span 是 "控制面板"
        spans[0].textContent = this.t('controlPanel');
      }
      if (spans.length >= 2) {
        // 第二個 span 是 "設定"
        spans[1].textContent = this.t('settings');
      }
    }
    
    // 展開/收起按鈕
    const toggleCollapsed = document.getElementById('control-panel-toggle-collapsed');
    if (toggleCollapsed) {
      toggleCollapsed.title = this.t('expandPanel');
    }
    
    const toggle = document.querySelector('.control-panel-toggle');
    if (toggle) {
      toggle.title = this.t('collapsePanel');
    }
    
    // 輸入框 placeholder
    const urlInput = document.getElementById('url-input');
    if (urlInput) {
      urlInput.placeholder = this.t('addStreamPlaceholder');
    }
    
    // 加入畫面按鈕
    const addButton = document.querySelector('#add-panel button');
    if (addButton) {
      addButton.textContent = this.t('addStreamButton');
    }
    
    // 布局控制標題
    const sections = document.querySelectorAll('.control-section .section-title');
    sections.forEach(section => {
      const text = section.textContent.trim();
      const dataI18n = section.getAttribute('data-i18n');
      if (dataI18n) {
        // 如果有 data-i18n 屬性，直接使用
        section.textContent = this.t(dataI18n);
      } else {
        // 否則根據文字內容判斷
        if (text === '布局控制' || text === 'Layout Control' || text === '布局控制' || text === 'レイアウト制御') {
          section.textContent = this.t('layoutControl');
        } else if (text === '側邊聊天布局' || text === 'Side Chat Layout' || text === '侧边聊天布局' || text === 'サイドチャットレイアウト') {
          section.textContent = this.t('sideChatLayout');
        } else if (text === '聊天室控制' || text === 'Chat Control' || text === '聊天室控制' || text === 'チャット制御') {
          section.textContent = this.t('chatControl');
        } else if (text === '收藏串流' || text === 'Favorite Streams' || text === '收藏串流' || text === 'お気に入りストリーム') {
          section.textContent = this.t('favoriteStreams');
        } else if (text === '媒體控制' || text === 'Media Control' || text === '媒体控制' || text === 'メディア制御') {
          section.textContent = this.t('mediaControl');
        } else if (text === '串流順序' || text === 'Stream Order' || text === '串流顺序' || text === 'ストリーム順序') {
          section.textContent = this.t('streamOrder');
        } else if (text === '意見回饋' || text === 'Feedback' || text === '意见反馈' || text === 'フィードバック') {
          section.textContent = this.t('feedback');
        } else if (text === '語言' || text === 'Language' || text === '语言' || text === '言語') {
          section.textContent = this.t('language');
        }
      }
    });
    
    // 布局預覽按鈕的 title
    const layoutPreviews = document.querySelectorAll('.layout-preview-inline');
    layoutPreviews.forEach((preview, index) => {
      const title = preview.getAttribute('title');
      if (title) {
        if (title === '單一畫面') preview.title = this.t('singleView');
        else if (title === '左右分割') preview.title = this.t('splitHorizontal');
        else if (title === '上下分割') preview.title = this.t('splitVertical');
        else if (title === '四宮格') preview.title = this.t('grid4');
        else if (title === '上大下三') preview.title = this.t('largeTop3');
        else if (title === '2×3 網格') preview.title = this.t('grid2x3');
        else if (title === '3×3 網格') preview.title = this.t('grid3x3');
      }
    });
    
    // 側邊聊天布局按鈕
    const sideChatLayouts = document.querySelectorAll('.layout-preview-inline[onclick*="setLayout(13"]');
    sideChatLayouts.forEach(btn => {
      if (btn.getAttribute('title') && btn.getAttribute('title').includes('雙欄')) {
        btn.title = this.t('dualColumnChat');
      }
    });
    
    const quadChatLayouts = document.querySelectorAll('.layout-preview-inline[onclick*="setLayout(14"]');
    quadChatLayouts.forEach(btn => {
      if (btn.getAttribute('title') && btn.getAttribute('title').includes('四格')) {
        btn.title = this.t('quadChat');
      }
    });
    
    const singleChatLayouts = document.querySelectorAll('.layout-preview-inline[onclick*="setLayout(15"]');
    singleChatLayouts.forEach(btn => {
      if (btn.getAttribute('title') && btn.getAttribute('title').includes('單一')) {
        btn.title = this.t('singleChatLayout');
      } else if (btn.hasAttribute('data-i18n-title')) {
        btn.title = this.t('singleChatLayout');
      }
    });
    
    // 聊天室控制按鈕 - 只更新文字，不調用函數避免破壞狀態
    const toggleChatsBtn = document.getElementById('toggle-all-chats-btn');
    if (toggleChatsBtn) {
      // 檢查當前按鈕文字，判斷應該顯示哪個狀態
      const currentText = toggleChatsBtn.textContent;
      // 如果包含隱藏相關文字，顯示隱藏；否則顯示顯示
      if (currentText.includes('隱藏') || currentText.includes('Hide') || currentText.includes('非表示') || currentText.includes('隐藏')) {
        toggleChatsBtn.textContent = '💬 ' + this.t('hideAllChats');
      } else {
        toggleChatsBtn.textContent = '💬 ' + this.t('showAllChats');
      }
    }
    
    // 收藏串流按鈕
    const manageFavoritesBtn = document.querySelector('button[onclick*="showFavoriteStreamsManager"]');
    if (manageFavoritesBtn) {
      manageFavoritesBtn.textContent = this.t('manageFavorites');
    }
    
    const addCurrentBtn = document.querySelector('button[onclick*="addCurrentStreamToFavorites"]');
    if (addCurrentBtn) {
      addCurrentBtn.textContent = this.t('addCurrentToFavorites');
    }
    
    // 收藏顯示過濾器
    const favoriteFilter = document.getElementById('favorite-display-filter');
    if (favoriteFilter) {
      const options = favoriteFilter.querySelectorAll('option');
      options.forEach(option => {
        if (option.value === 'all') {
          option.textContent = this.t('allFavorites');
        } else if (option.value === 'uncategorized') {
          option.textContent = this.t('uncategorized');
        }
      });
    }
    
    // 媒體控制
    const masterVolumeLabel = document.querySelector('label[for="master-volume"]');
    if (masterVolumeLabel) {
      masterVolumeLabel.textContent = this.t('masterVolume');
    }
    
    const muteAllBtn = document.querySelector('button[onclick*="muteAll"]');
    if (muteAllBtn) {
      muteAllBtn.textContent = this.t('muteAll');
    }
    
    // 意見回饋
    const feedbackLink = document.querySelector('a[href*="forms.gle"]');
    if (feedbackLink) {
      feedbackLink.textContent = this.t('giveFeedback');
    }
    
    const versionHistoryLink = document.querySelector('a[onclick*="showVersionHistory"]');
    if (versionHistoryLink) {
      versionHistoryLink.textContent = this.t('versionHistory');
    }
    
    const userGuideLink = document.querySelector('a[onclick*="showUserGuide"]');
    if (userGuideLink) {
      userGuideLink.textContent = this.t('userGuide');
    }
    
    // 隱私權政策
    const privacyLink = document.querySelector('a[href="/privacy.html"]');
    if (privacyLink) {
      privacyLink.textContent = this.t('privacyPolicy');
    }
    
    // 版權資訊
    const copyrightDiv = document.querySelector('.control-section:last-child div[style*="text-align: center"]');
    if (copyrightDiv) {
      const copyrightText = copyrightDiv.querySelector('div:first-child');
      if (copyrightText && copyrightText.textContent.includes('©')) {
        copyrightText.textContent = this.t('copyright');
      }
      const freeToolText = copyrightDiv.querySelector('div:last-child');
      if (freeToolText && freeToolText.textContent.includes('免費')) {
        freeToolText.textContent = this.t('freeTool');
      }
    }
    
    // 注意：不在此處更新串流順序列表，避免破壞功能
    // 串流順序列表由其他模組負責更新
  },
  
};

// 暴露到全局
if (typeof window !== 'undefined') {
  window.i18n = i18n;
}

// 頁面載入時初始化
// 延遲初始化，確保其他功能腳本先載入並初始化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    // 延遲初始化，確保所有功能腳本都已載入並初始化
    setTimeout(() => {
      i18n.init();
    }, 300);
  });
} else {
  // 如果 DOM 已經載入，也延遲一下
  setTimeout(() => {
    i18n.init();
  }, 300);
}

