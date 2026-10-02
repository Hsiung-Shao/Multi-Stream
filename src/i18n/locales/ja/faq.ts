const faq = {
    'tipLabel': 'ヒント',
    'title': 'よくある質問 (FAQ)',
    'header_title': 'よくある質問とトラブルシューティング',
    'header_subtitle': '再生、パフォーマンス、データ保存に関するよくある質問にお答えします。',

    'cat_compat': '再生と互換性',
    'cat_compat_blurb': 'ブラウザやプラットフォーム、再生に関するトラブルシューティング。',
    'cat_usage': 'パフォーマンスとデータ',
    'cat_usage_blurb': 'パフォーマンス調整、データ保存、レイアウトの占位に関するよくある質問。',

    'items.brave_twitch.title': 'Brave ブラウザで Twitch が再生できない',
    'items.brave_twitch.content': 'Brave ブラウザのプライバシー保護機能により、Twitch のアンチボットシステム (Kasada) が Brave のブラウザ識別子を検出してリクエストを拒否し、Twitch ストリームが正常に再生できなくなります（画面がフリーズまたはエラー表示）。ModHeader 拡張機能をインストールしてブラウザ識別子を上書きすることで解決できます。',
    'items.brave_twitch.install_btn': 'ModHeader 拡張機能をインストール',
    'items.brave_twitch.download_btn': '設定ファイルをダウンロード (twitch.json)',
    'items.brave_twitch.step0': 'ブラウザの拡張機能リストからインストール済みの ModHeader を見つける',
    'items.brave_twitch.step1': 'ModHeader を開き、右上のメニューボタン（3つの点アイコン）をクリック',
    'items.brave_twitch.step2': 'メニューから「Import profile」を見つけてクリック',
    'items.brave_twitch.step3': '「Load file」ボタンをクリックし、ダウンロードした twitch.json 設定ファイルを選択してインポート',
    'items.brave_twitch.tip': 'インポート完了後、Twitch ページを更新すると正常に再生できます。この設定は Twitch 関連リクエストのブラウザ識別子のみに影響し、他のウェブサイトには影響しません。',

    'items.youtube_playback.title': 'なぜYouTube動画が再生できないのですか？',
    'items.youtube_playback.content': '一部のYouTube動画や配信は、クリエイターによって埋め込み再生が許可されていないため、外部プラットフォームでは再生できません。',

    'items.platform_support.title': '対応しているプラットフォームは？',
    'items.platform_support.content': '現在、主にTwitchとYouTube Liveに対応しています。将来的にはさらに多くのプラットフォームが追加される可能性があります。',

    'items.live_detection.title': '配信検知',
    'items.live_detection.content': 'サイトを開いたとき、キャンバスに入ったとき、その後は 25 分ごとに、お気に入りの Twitch と YouTube チャンネルが配信中かどうかを自動で確認します。設定で「バックグラウンドで配信状態を自動検出」をオンにすると、5 分ごとの確認に変わります。配信開始を検出すると、お気に入り一覧に緑の点が表示されます（視聴者数は表示されません）。YouTube チャンネルは確認頻度を抑えているため、配信開始から緑の点が付くまで 15 分以上かかることがあります。',

    'items.performance.title': 'パフォーマンスを改善するには？',
    'items.performance.content': '複数の高画質配信を同時に再生すると、CPU とネットワーク帯域を大量に消費します。サイト全体で画質を一括設定する機能はないため、各プレーヤーの歯車メニューで画質を下げるか、同時に再生する数を減らしてください。YouTube を 2 つ以上同時に再生しているときは、警告にある「他のYouTubeを一時停止」を押せます。タブがバックグラウンドに 30 秒以上あると、Twitch は自動で最低画質に下がります。F3 を押すとパフォーマンスパネルが開き、フレームレートとメモリを確認できます。',

    'items.data_saved.title': '設定は保存されますか？',
    'items.data_saved.content': 'お気に入り、お気に入りリスト、タグ、設定、カスタムレイアウトはブラウザに保存され、次回アクセス時もそのまま残っています。ただし視聴中のキャンバスは永続的には保存されません。再読み込みするとキャンバスは空になり、10 分以内に戻ってくると前回の視聴画面を復元するか確認されます。別の端末に移すには「お気に入り管理 → バックアップ」を使ってください（バックアップファイルにはカスタムレイアウトも含まれます）。',

    'items.empty_window.title': '空ウィンドウの使い方',
    'items.empty_window.content': 'ダイナミックアイランドの「＋」を押して「グループ追加」（配信＋チャット）、「配信ウィンドウ追加」、「チャットウィンドウ追加」のいずれかを選ぶと、キャンバスに空のウィンドウが追加され、レイアウトを考えるためのプレースホルダーとして使えます。空の配信ウィンドウには検索ボックスがあり、配信中のお気に入りチャンネルをドロップダウンから選ぶこともできます。空のチャットウィンドウでは、キャンバス上の配信から 1 つ選んでそのチャットを表示します。',

    'items.youtube_search.title': 'なぜ一部の YouTube チャンネルが検索できないのですか？',
    'items.youtube_search.content': 'ダイナミックアイランドの検索ボックスでの YouTube チャンネル検索は、サイトに収録済みのチャンネル名簿と照合するもので、YouTube 全体をリアルタイムに検索するわけではありません。検索できない場合は、そのチャンネルがまだ収録されていないことがほとんどです。配信スケジュールから追加をリクエストできます。検索結果を選ぶと、まずそのチャンネルが配信中かどうかを確認し、配信中ならそのままキャンバスに追加、配信していなければお気に入りに追加されます。配信が始まったら、お気に入り一覧から読み込んでください。',
    'items.youtube_search.tip': '見たいチャンネルがどうしても見つからない場合は、Discord までお知らせください。収録名簿に追加します。',
  // —— i18n 修補：design 改版新增 key，各語言在地化 ——
  'cat_all': 'すべて',
  'support_eyebrow': 'サポート',
  'search_placeholder': '質問を検索（例：「Brave」「パフォーマンス」「YouTube」）…',
  'search_found': '「{{query}}」に一致する質問が {{count}} 件見つかりました',
  'search_none': '「{{query}}」に一致する質問はありません',
  'empty_title': '該当する質問が見つかりません',
  'empty_desc': '別のキーワードで試すか、Discord で直接お尋ねください。',
  'cta_title': '答えが見つかりませんか？',
  'cta_desc': 'Discord コミュニティに参加してお尋ねください。喜んでお手伝いします。',
  'cta_discord': 'Discord に参加',
  'foot_home': 'ホーム',
  'foot_about': '概要',
  'foot_privacy': 'プライバシーポリシー',
};

export default faq;
