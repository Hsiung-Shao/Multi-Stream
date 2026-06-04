export default {
  // Navigation
  favoritesManager: '收藏管理',
  myFavorites: '我的收藏',
  batchImport: '批量导入',
  settings: '设置',
  categoryManagement: '收藏清单',
  manageCategories: '管理清单',

  // Quick Filters
  all: '全部',

  // Toolbar
  searchPlaceholder: '搜索收藏...',
  batchDelete: '批量删除',
  batchLoad: '批量加载',
  addNew: '新增收藏',

  // Dialog
  editFavorite: '编辑收藏',
  addFavorite: '新增收藏',
  dialogDesc: '请输入收藏详细信息',
  streamUrl: '直播网址',
  streamName: '名称 (选填)',
  category: '收藏清单',
  categories: '收藏清单',
  'navigation': '导航',
  'confirmDeleteTagDesc': '删除标签后，该标签将从所有收藏中移除。',
  uncategorized: '未分类',
  cancel: '取消',
  save: '保存',
  create: '新增',

  // Messages
  urlRequired: '请输入网址',
  successAdded: '已新增收藏',
  successUpdated: '已更新收藏',
  successDeleted: '已删除收藏',

  // Batch Import
  batchImportTitle: '批量导入网址',

  startImport: '开始导入',
  importSuccess: '成功导入 {{count}} 笔数据',

  // Empty States
  noFavorites: '尚无收藏，点击右上角新增',
  noCategories: '尚无分类',

  // Backup
  backup: '备份与还原',
  backupTitle: '备份与还原',
  backupDesc: '导出 or 导入您的收藏数据',
  export: '导出备份',
  import: '导入备份',
  importWarning: '警告：导入将会覆盖现有的所有收藏数据，此操作无法恢复。',
  confirmImport: '我了解并确认要覆盖数据',
  'backup.export_success': '备份导出成功',
  'backup.export_error': '导出失败: {{error}}',
  'backup.invalid_format': '无效的文件格式',
  'backup.import_success': '导入成功，正在刷新数据...',
  'backup.import_error': '导入失败: {{error}}',
  'backup.unknown_error': '未知错误',
  'backup.export_desc': '将您的所有收藏、分类与自定义设置下载为 JSON 文件。',
  'backup.export_helper': '这是最安全的备份方式。您可以将此文件保存在外部硬盘或云端，以便在其他电脑上恢复您的个性化配置。',
  'backup.export_btn': '立即下载备份文件 (.json)',
  'backup.import_desc': '从之前备份的 JSON 文件中恢复数据。',
  'backup.import_warning_detail': '警告：导入操作会“全数覆盖”您目前在浏览器中的所有数据，包括收藏、标签与布局设置。导入后页面会自动重新加载。',
  'backup.processing': '正在处理并准备刷新...',
  'backup.select_file': '选择文件并开始还原',

  // Settings
  'settings.theme_desc': '切换应用程序的亮色或暗色外观',
  'settings.language_desc': '选择您偏好的界面语言',
  'settings.about_desc': 'Multi-Stream 是一个开源的多流观看平台，致力于提供最佳的观看体验。',
  'settings.sponsor': '赞助',
  'settings.feedback': '意见反馈',
  'settings.close_window_mode': '视窗关闭模式',
  'settings.close_window_mode_desc': '选择当关闭视窗时的行为',
  'settings.mode_remove': '移除视窗 (默认)',
  'settings.mode_empty': '保留空白视窗',
  'group.ungrouped': '未分类',

  // Placeholders
  'placeholder.search_url': '搜索名称或网址...',
  'placeholder.stream_example': '例如: 游戏实况, 音乐台...',
  'placeholder.category_example': '例如: 最爱, 游戏, 音乐...',
  'customName': '自定义名称 (选填)',
  'batchImportPlaceholder': '请输入 Twitch 频道网址，每行一个。\n例如：\nhttps://www.twitch.tv/shroud\nhttps://www.twitch.tv/ninja',

  // Twitch
  twitchIntegration: 'Twitch 导入',
  connectTwitch: '连接 Twitch 账号',
  disconnectTwitch: '解除连接',
  twitchConnectDescription: '连接您的 Twitch 账号以快速导入您关注的频道。',
  connectedAs: '已连接为 {{name}}',
  importFollowedChannels: '显示关注频道列表',
  loadMore: '加载更多',
  noChannelsFound: '找不到频道',
  selectAll: '全选',
  importSelected: '导入选中项',

  // Misc
  loading: '加载中...',
  confirmDelete: '确定要删除吗？',
  confirmDeleteCount: '确定要删除选定的 {{count}} 项吗？',
  addCategory: '新增清单',
  categoryName: '清单名称',
  addCategorySuccess: '清单已新增',

  // Settings
  appearance: '外观设置',
  theme: '主题模式',
  language: '显示语言',
  about: '关于',
  // Layout Manager
  'layout_manager.delete_confirm': '删除',
  'layout_manager.apply': '应用',
  'layout_manager.update_from_current': '使用当前布局更新',
  'layout_manager.update_from_current_desc': '将当前画面的视窗配置覆盖此存档',
  'layout_manager.delete_layout': '删除布局',
  'layout_manager.delete_layout_desc': '确定要删除此布局存档吗？此动作无法复原。',
  'layout_manager.rename': '重命名',
  'layout_manager.confirm_update': '确定要使用目前的画面配置来覆写“{{name}}”吗？',
  'layout_manager.no_layouts': '尚无自定布局',
  'layout_manager.no_layouts_desc': '调整视窗位置后，可将其存储为模板。',
  'sidebar.version_history': '版本信息',

  // Add/Edit Favorite Dialog (Phase 3 redesign)
  addFavoriteDesc: '粘贴频道网址,自动识别平台',
  editFavoriteDesc: '更新名称、收藏清单与标签',
  channelUrlOrName: '频道网址或名称',
  paste: '粘贴',
  pasteFromClipboard: '粘贴剪贴板',
  urlHint: '支持 twitch.tv/名称、youtube.com/@名称 或直接输入频道名称。',
  whichPlatform: '这是哪个平台?',
  preview: '预览',
  previewEmpty: '输入网址后,这里会即时预览频道',
  displayName: '显示名称',
  displayNamePlaceholder: '频道显示名称',
  optional: '选填',
  multiSelect: '可多选',
  autoLoadTitle: '添加后立即加载画面',
  autoLoadDesc: '保存收藏的同时,把这个频道开到多视窗',
  addAndLoad: '添加并加载',
};

