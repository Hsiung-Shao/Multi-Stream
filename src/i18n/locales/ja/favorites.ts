export default {
  // Island favorites chooser
  select_category: 'カテゴリを選択',
  all_categories: 'すべてのカテゴリ',
  no_categories: 'カテゴリなし',
  select_tags_multi: 'タグを選択（複数可）',
  // FM Settings — 外観/再生カード
  theme_light: 'ライト',
  theme_dark: 'ダーク',
  theme_system: 'システム',
  playback: '再生',
  auto_mute_new: '新規ストリームを開いたら自動ミュート',
  auto_mute_new_desc: '一度に多数開いたときの音量爆発を防ぎます。',
  yt_risk_warn: 'YouTube 複数配信の警告',
  yt_risk_warn_desc: 'YouTube 配信が 3 つを超えると警告します。',
  bg_live_detect: 'バックグラウンドで配信状態を自動検出',
  bg_live_detect_desc: '5 分ごとにお気に入りチャンネルを確認します。',
  // Navigation
  favoritesManager: 'お気に入り管理',
  myFavorites: 'お気に入り',
  batchImport: '一括インポート',
  settings: '設定',
  categoryManagement: 'お気に入りリスト',
  manageCategories: 'リスト管理',

  // Sidebar section labels (對齊設計 FMSidebar 分區)
  sidebarFilter: 'フィルター',
  sidebarLiveNow: '配信中',
  sidebarCategoryGroup: 'カテゴリー',

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

  // ExitLag アフィリエイト(サイドバー)
  exitlag_title: '配信の遅延を軽減',
  exitlag_subtitle: 'ExitLag マルチパス高速化',

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

  // Add/Edit Favorite Dialog (Phase 3 redesign)
  addFavoriteDesc: 'チャンネルURLを貼り付けると、プラットフォームを自動判別します',
  editFavoriteDesc: '名前・リスト・タグを更新',
  channelUrlOrName: 'チャンネルURLまたは名前',
  paste: '貼り付け',
  pasteFromClipboard: 'クリップボードから貼り付け',
  urlHint: 'twitch.tv/名前、youtube.com/@名前、またはチャンネル名の入力に対応。',
  whichPlatform: 'どのプラットフォームですか?',
  preview: 'プレビュー',
  previewEmpty: 'URLを入力すると、ここにチャンネルがプレビュー表示されます',
  displayName: '表示名',
  displayNamePlaceholder: 'チャンネルの表示名',
  optional: '任意',
  multiSelect: '複数選択可',
  autoLoadTitle: '追加後すぐに画面に読み込む',
  autoLoadDesc: '保存と同時にこのチャンネルをマルチビューに開きます',
  addAndLoad: '追加して読み込む',

  // 補齊在地化:一括操作 / ダイナミックアイランド / カテゴリ削除確認(zh-TW/en と整合)
  loadSelected: '選択を読み込む',
  deselectAll: '選択を解除',
  delete: '削除',
  batchEdit: '一括編集',
  batchOperations: '一括操作',
  setCategory: 'カテゴリを設定',
  addTags: 'タグを追加',
  batchSetCategoryConfirm: '{{count}} 件をカテゴリ「{{category}}」に設定しますか？',
  batchAddTagsConfirm: '{{count}} 件にタグを追加しますか？',
  load: '読み込み',
  loadSuccess: '読み込みました',
  loadError: '読み込みに失敗しました',
  confirmDeleteCategoryDesc: 'カテゴリを削除すると、その中のお気に入りは未分類になります。',
  favorites_menu: 'お気に入り配信',
  online_only: '配信中のみ表示',
  added_count: '{{count}} 個のチャンネルを読み込みました',
  no_streams_in_category: 'カテゴリにチャンネルがありません',
  confirm_load_large: '{{count}} 個のチャンネルを読み込みますか？動作が重くなる可能性があります',
  load_selected_count: '{{count}} 個のチャンネルを読み込む',
  load_category_all: 'このカテゴリのすべてを読み込む',
  no_streams_to_save: '保存できるストリームがありません',
  save_entire_canvas: '現在のキャンバスを保存',
  batch_save_success_simple: '{{count}} 個のストリームを保存しました',
};

