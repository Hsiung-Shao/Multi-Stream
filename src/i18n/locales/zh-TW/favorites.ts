export default {
  // Navigation
  myFavorites: '我的收藏',
  batchImport: '批量匯入',
  settings: '設定',
  categoryManagement: '收藏清單', // This is used as header
  manageCategories: '管理清單',    // New: For the button/tab

  // Quick Filters
  all: '全部',

  // Toolbar
  searchPlaceholder: '搜尋收藏...',
  batchDelete: '批量刪除',
  batchLoad: '批量載入',
  loadSelected: '載入選取',
  deselectAll: '取消全選',
  delete: '刪除',
  batchEdit: '批次編輯',
  batchOperations: '批次操作',
  setCategory: '設定分類',
  addTags: '新增標籤',
  batchSetCategoryConfirm: '確定要將 {{count}} 個項目設定為分類「{{category}}」嗎？',
  batchAddTagsConfirm: '確定要為 {{count}} 個項目新增標籤嗎？',

  load: '載入',
  loadSuccess: '載入成功',
  loadError: '載入失敗',
  addNew: '新增收藏',

  // Dialog
  editFavorite: '編輯收藏',
  addFavorite: '新增收藏',
  dialogDesc: '請輸入收藏詳細資訊',
  streamUrl: '直播網址',
  streamName: '名稱 (選填)',
  category: '收藏清單',
  categories: '收藏清單',
  'navigation': '導覽',
  'confirmDeleteTagDesc': '刪除標籤後，該標籤將從所有收藏中移除。',
  uncategorized: '未分類',
  cancel: '取消',
  save: '儲存',
  create: '新增',

  // Messages
  urlRequired: '請輸入網址',
  successAdded: '已新增收藏',
  successUpdated: '已更新收藏',
  successDeleted: '已刪除收藏',

  // Batch Import
  batchImportTitle: '批量匯入網址',

  startImport: '開始匯入',
  importSuccess: '成功匯入 {{count}} 筆資料',

  // Empty States
  noFavorites: '尚無收藏，點擊右上角新增',
  noCategories: '尚無分類',

  // Backup
  backup: '備份與還原', // Added missing key
  backupTitle: '備份與還原',
  backupDesc: '匯出或匯入您的收藏資料',
  export: '匯出備份',
  import: '匯入備份',
  importWarning: '警告：匯入將會覆蓋現有的所有收藏資料，此操作無法復原。',
  confirmImport: '我了解並確認要覆蓋資料',
  'backup.export_success': '已成功匯出備份檔案',
  'backup.export_error': '匯出失敗: {{error}}',
  'backup.invalid_format': '無效的檔案格式',
  'backup.import_success': '匯入成功，正在刷新資料...',
  'backup.import_error': '匯入失敗: {{error}}',
  'backup.unknown_error': '未知錯誤',
  'backup.export_desc': '將您的所有收藏、分類與自定義設定下載為 JSON 檔案。',
  'backup.export_helper': '這是最安全的備份方式。您可以將此檔案儲存在外部硬碟或雲端硬碟中，以便在其他電腦上恢復您的個人化配置。',
  'backup.export_btn': '立即下載備份檔案 (.json)',
  'backup.import_desc': '從先前備份的 JSON 檔案中恢復資料。',
  'backup.import_warning_detail': '警告：匯入操作會「全數覆蓋」您目前在瀏覽器中的所有數據，包括收藏、標籤與佈局設定。匯入後頁面會自動重新整理。',
  'backup.processing': '正在處理並準備刷新...',
  'backup.select_file': '選擇檔案並開始還原',

  // Settings
  'settings.theme_desc': '切換應用程式的亮色或暗色外觀',
  'settings.language_desc': '選擇您偏好的介面語言',
  'settings.about_desc': 'Multi-Stream 是一個開源的多串流觀看平台，致力於提供最佳的觀看體驗。',
  'settings.sponsor': '贊助',
  'settings.close_window_mode': '視窗關閉模式',
  'settings.close_window_mode_desc': '選擇當關閉視窗時的行為',
  'settings.feedback': '意見回饋',
  'settings.mode_remove': '移除視窗 (預設)',
  'settings.mode_empty': '保留空白視窗',

  // Placeholders
  'placeholder.search_url': '搜尋名稱或網址...',
  'placeholder.stream_example': '例如: 遊戲實況, 音樂台...',
  'placeholder.category_example': '例如: 最愛, 遊戲, 音樂...',
  'customName': '自訂名稱 (選填)',

  'batchImportPlaceholder': '請輸入 Twitch 頻道網址，每行一個。\n例如：\nhttps://www.twitch.tv/shroud\nhttps://www.twitch.tv/ninja',

  // Twitch
  twitchIntegration: 'Twitch 匯入',
  connectTwitch: '連接 Twitch 帳號',
  disconnectTwitch: '解除連接',
  twitchConnectDescription: '連接您的 Twitch 帳號以快速匯入您追隨的頻道。',
  connectedAs: '已連接為 {{name}}',
  importFollowedChannels: '顯示追隨頻道列表',
  loadMore: '載入更多',
  noChannelsFound: '找不到頻道',
  selectAll: '全選',
  importSelected: '匯入選取項目',

  // Misc
  loading: '載入中...',
  confirmDelete: '確定要刪除嗎？',
  confirmDeleteCategoryDesc: '刪除分類後，該分類下的收藏將會變為未分類。',
  loginRequiredForStatus: '請先登入 Twitch 以檢查狀態',
  confirmDeleteCount: '確定要刪除選定的 {{count}} 項嗎？',
  addCategory: '新增清單',
  categoryName: '清單名稱',
  addCategorySuccess: '清單已新增',

  // Settings
  appearance: '外觀設定',
  theme: '主題模式',
  language: '顯示語言',
  about: '關於',

  // Dynamic Island
  favorites_menu: '收藏直播',
  online_only: '僅顯示直播中',
  added_count: '已載入 {{count}} 個頻道',
  no_streams_in_category: '分類中沒有頻道',
  confirm_load_large: '確定要載入 {{count}} 個頻道嗎？可能會造成卡頓',
  load_selected_count: '載入 {{count}} 個頻道',
  load_category_all: '載入此分類所有頻道',
  no_streams_to_save: '沒有可收藏的串流',
  save_entire_canvas: '一鍵收藏當前畫布',
  batch_save_success_simple: '已收藏 {{count}} 個串流',
  // Layout Manager
  'layout_manager.delete_confirm': '刪除',
  'layout_manager.apply': '套用',
  'layout_manager.update_from_current': '使用當前布局更新',
  'layout_manager.update_from_current_desc': '將當前畫面的視窗配置覆蓋此存檔',
  'layout_manager.delete_layout': '刪除佈局',
  'layout_manager.delete_layout_desc': '確定要刪除此佈局存檔嗎？此動作無法復原。',
  'layout_manager.rename': '重新命名',
  'layout_manager.confirm_update': '確定要使用目前的畫面配置來覆寫「{{name}}」嗎？',
  'layout_manager.no_layouts': '尚無自定布局',
  'layout_manager.no_layouts_desc': '調整視窗位置後，可將其儲存為模板。',

  // Sidebar
  'sidebar.version_history': '版本資訊',
};

