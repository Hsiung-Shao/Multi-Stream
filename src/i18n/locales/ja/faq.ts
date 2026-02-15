const faq = {
    'title': 'FAQ',
    'header_title': 'よくある質問と機能ガイド',
    'header_subtitle': 'MultiStream Hubの強力な機能を活用して、究極の視聴環境を構築しましょう。',
    'go_to_canvas': 'キャンバスへ',
    'footer_note': 'その他の質問は、GitHubまたはフィードバック機能からお問い合わせください。',

    'items.dynamic_island.title': 'ダイナミックアイランド (Dynamic Island)',
    'items.dynamic_island.content': '画面下部中央にあるフローティングツールバーです。検索、ウィンドウ追加、レイアウト切替、メディア操作、お気に入りに素早くアクセスできます。アイドル時は自動的に隠れます。',
    'items.dynamic_island.tip': 'アイコンをクリックすると、各メニューが展開されます。',

    'items.favorites_manager.title': 'お気に入り管理',
    'items.favorites_manager.content': 'TwitchとYouTubeチャンネルを一括管理。追加、編集、削除、タグやカテゴリによる整理が可能です。Twitch連携でのフォローリストインポートや、URL手動入力にも対応しています。',

    'items.media_control.title': 'メディアコントロール',
    'items.media_control.content': 'ダイナミックアイランドのTVアイコンからアクセスできます。「マスターボリューム」の調整や、全ウィンドウの「一括ミュート」が可能です。',

    'items.search_bar.title': '検索バー',
    'items.search_bar.content': 'ダイナミックアイランドまたはナビゲーションバーにあります。Twitch/YouTubeのURL直接入力や、Twitchチャンネルのキーワード検索が可能です。',

    'items.layout_control.title': 'レイアウト設定',
    'items.layout_control.content': 'グリッド、マスタースレーブ、縦並びなどのプリセットに加え、「フリーキャンバス」モードも提供。フリーモードではウィンドウを自由に配置・サイズ変更できます。',

    'items.one_click_favorite.title': 'ワンクリックお気に入り',
    'items.one_click_favorite.content': 'ダイナミックアイランドの「フォルダ＋ハート」アイコンです。現在キャンバスで開いているすべてのウィンドウを、一括でお気に入りリストに保存します。',

    'items.clear_canvas.title': 'キャンバスをクリア',
    'items.clear_canvas.content': 'ダイナミックアイランド右側のゴミ箱アイコンです。確認後、キャンバス上のすべてのウィンドウを削除します。',

    'items.fullscreen.title': '全画面表示',
    'items.fullscreen.content': 'アプリ全体または個別のビデオウィンドウを全画面モードに切り替え、没入感のある視聴体験を提供します。',

    'items.batch_import.title': '一括インポート',
    'items.batch_import.content': 'お気に入り管理の「一括インポート」タブで、複数のURLやJSONデータを貼り付け、一度に多数のチャンネルを追加できます。',

    'items.multi_tabs.title': 'マルチタブ',
    'items.multi_tabs.content': 'チャットウィンドウはタブ機能をサポートしています。一つのウィンドウで複数のチャットルームを開き、タブで切り替えることで画面スペースを節約できます。',

    'items.categories.title': 'カテゴリ',
    'items.categories.content': 'カスタムカテゴリ（例：Vtuber、音楽、eスポーツなど）を作成して整理できます。管理画面でチャンネルをドラッグ＆ドロップして分類できます。',

    'items.backup_restore.title': 'バックアップと復元',
    'items.backup_restore.content': '「バックアップ」タブから、設定、お気に入り、タグ、レイアウトをJSONファイルとしてエクスポートできます。後でインポートして環境を復元できます。',

    'items.twitch_linking.title': 'Twitchアカウント連携',
    'items.twitch_linking.content': 'Twitchアカウントでログインすると、フォローリストを読み込み、選択してお気に入りにインポートできます。公開情報のみアクセスし、認証情報は保存しません。',

    'items.live_detection.title': '配信検知',
    'items.live_detection.content': 'システムはバックグラウンドで定期的にTwitchチャンネルの配信状況をチェックします。配信中のチャンネルには緑色のインジケーターと視聴者数が表示されます。',

    'items.empty_window.title': '空ウィンドウの使い方',
    'items.empty_window.content': '「グループ追加 -> 空のグループを追加」でプレースホルダーウィンドウを作成できます。レイアウトを先に決めてから、チャンネルをドラッグして再生する際に便利です。',

    'items.brave_twitch.title': 'Brave ブラウザで Twitch が再生できない',
    'items.brave_twitch.content': 'Brave ブラウザのプライバシー保護機能により、Twitch のアンチボットシステム (Kasada) が Brave のブラウザ識別子を検出してリクエストを拒否し、Twitch ストリームが正常に再生できなくなります（画面がフリーズまたはエラー表示）。ModHeader 拡張機能をインストールしてブラウザ識別子を上書きすることで解決できます。',
    'items.brave_twitch.install_btn': 'ModHeader 拡張機能をインストール',
    'items.brave_twitch.download_btn': '設定ファイルをダウンロード (twitch.json)',
    'items.brave_twitch.step0': 'ブラウザの拡張機能リストからインストール済みの ModHeader を見つける',
    'items.brave_twitch.step1': 'ModHeader を開き、右上のメニューボタン（3つの点アイコン）をクリック',
    'items.brave_twitch.step2': 'メニューから「Import profile」を見つけてクリック',
    'items.brave_twitch.step3': '「Load file」ボタンをクリックし、ダウンロードした twitch.json 設定ファイルを選択してインポート',
    'items.brave_twitch.tip': 'インポート完了後、Twitch ページを更新すると正常に再生できます。この設定は Twitch 関連リクエストのブラウザ識別子のみに影響し、他のウェブサイトには影響しません。'
};
export default faq;
