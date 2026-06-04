export default {
  // Navigation
  favoritesManager: 'お気に入り管理',
  myFavorites: 'お気に入り',
  batchImport: '一括インポート',
  settings: '設定',
  categoryManagement: 'お気に入りリスト',
  manageCategories: 'リスト管理',

  // Quick Filters
  all: 'すべて',

  // Toolbar
  searchPlaceholder: '検索...',
  batchDelete: '一括削除',
  batchLoad: '一括読み込み',
  addNew: '新規追加',

  // Dialog
  editFavorite: '編集',
  addFavorite: '新規追加',
  dialogDesc: '詳細情報を入力してください',
  streamUrl: '配信URL',
  streamName: '名前 (任意)',
  category: 'カテゴリ',
  categories: 'カテゴリ',
  'navigation': 'ナビゲーション',
  'confirmDeleteTagDesc': 'タグを削除すると、すべてのお気に入りから削除されます。',
  uncategorized: '未分類',
  cancel: 'キャンセル',
  save: '保存',
  create: '作成',

  // Messages
  urlRequired: 'URLを入力してください',
  successAdded: '追加しました',
  successUpdated: '更新しました',
  successDeleted: '削除しました',

  // Batch Import
  batchImportTitle: 'URL一括インポート',

  startImport: 'インポート開始',
  importSuccess: '{{count}} 件インポート成功',

  // Empty States
  noFavorites: 'お気に入りがありません',
  noCategories: 'カテゴリがありません',

  // Backup
  backup: 'バックアップ',
  backupTitle: 'バックアップと復元',
  backupDesc: 'データのエクスポートまたはインポート',
  export: 'バックアップをエクスポート',
  import: 'バックアップをインポート',
  importWarning: '警告：インポートすると既存のデータはすべて上書きされます。元に戻すことはできません。',
  confirmImport: '上書きを承認する',
  'backup.export_success': 'バックアップの書き出しに成功しました',
  'backup.export_error': '書き出し失敗: {{error}}',
  'backup.invalid_format': '無効なファイル形式',
  'backup.import_success': '読み込み成功。データを更新しています...',
  'backup.import_error': '読み込み失敗: {{error}}',
  'backup.unknown_error': '不明なエラー',
  'backup.export_desc': 'すべてのお気に入り、カテゴリ、カスタム設定をJSONファイルとしてダウンロードします。',
  'backup.export_helper': 'これは最も安全なバックアップ方法です。このファイルを外部ドライブやクラウドに保存して、他のPCで設定を復元できます。',
  'backup.export_btn': 'バックアップをダウンロード (.json)',
  'backup.import_desc': '以前にバックアップしたJSONファイルからデータを復元します。',
  'backup.import_warning_detail': '警告：インポートすると、お気に入り、タグ、レイアウトを含むブラウザ内のすべての現在のデータが「完全に上書き」されます。インポート後、ページは自動的に再読み込みされます。',
  'backup.processing': '処理中、更新準備中...',
  'backup.select_file': 'ファイルを選択して復元',

  // Settings
  'settings.theme_desc': 'ライトモードとダークモードを切り替えます',
  'settings.language_desc': 'インターフェースの言語を選択してください',
  'settings.about_desc': 'Multi-Streamは、最高の視聴体験を提供することを目的としたオープンソースのマルチストリーム視聴プラットフォームです。',
  'settings.sponsor': 'スポンサー',
  'settings.feedback': 'フィードバック',
  'settings.close_window_mode': 'ウィンドウ終了モード',
  'settings.close_window_mode_desc': 'ウィンドウを閉じる際の動作を選択',
  'settings.mode_remove': 'ウィンドウを削除 (デフォルト)',
  'settings.mode_empty': '空のウィンドウを残す',
  'group.ungrouped': '未分類',

  // Placeholders
  'placeholder.search_url': '名前またはURLを検索...',
  'placeholder.stream_example': '例: ゲーム配信, 音楽...',
  'placeholder.category_example': '例: お気に入り, ゲーム, 音楽...',
  'customName': 'カスタム名 (任意)',
  'batchImportPlaceholder': 'TwitchチャンネルのURLを1行に1つずつ入力してください。\n例：\nhttps://www.twitch.tv/shroud\nhttps://www.twitch.tv/ninja',

  // Twitch
  twitchIntegration: 'Twitch インポート',
  connectTwitch: 'Twitchと連携',
  disconnectTwitch: '連携解除',
  twitchConnectDescription: 'Twitchアカウントを連携してフォロー中のチャンネルをインポートします。',
  connectedAs: '{{name}} として接続中',
  importFollowedChannels: 'フォロー中のチャンネルを表示',
  loadMore: 'もっと読み込む',
  noChannelsFound: 'チャンネルが見つかりません',
  selectAll: 'すべて選択',
  importSelected: '選択項目をインポート',

  // Misc
  loading: '読み込み中...',
  confirmDelete: '本当に削除しますか？',
  confirmDeleteCount: '選択した {{count}} 件を削除しますか？',
  addCategory: 'リスト追加',
  categoryName: 'リスト名',
  addCategorySuccess: 'リストを追加しました',

  // Settings
  appearance: '外観設定',
  theme: 'テーマ',
  language: '表示言語',
  about: 'アプリについて',
  // Layout Manager
  'layout_manager.delete_confirm': '削除',
  'layout_manager.apply': '適用',
  'layout_manager.update_from_current': '現在のレイアウトで更新',
  'layout_manager.update_from_current_desc': '現在のウィンドウ配置でこの保存を上書きします',
  'layout_manager.delete_layout': 'レイアウトを削除',
  'layout_manager.delete_layout_desc': 'このレイアウトを削除してもよろしいですか？この操作は取り消せません。',
  'layout_manager.rename': '名前を変更',
  'layout_manager.confirm_update': '「{{name}}」を現在のレイアウトで上書きしてもよろしいですか？',
  'layout_manager.no_layouts': 'カスタムレイアウトがありません',
  'layout_manager.no_layouts_desc': 'ウィンドウの位置を調整して、テンプレートとして保存できます。',
  'sidebar.version_history': '更新履歴',
};

