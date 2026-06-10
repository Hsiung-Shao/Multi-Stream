const faq = {
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
    'items.live_detection.content': 'システムはバックグラウンドで定期的にTwitchチャンネルの配信状況をチェックします。配信中のチャンネルには緑色のインジケーターと視聴者数が表示されます。',

    'items.performance.title': 'パフォーマンスを改善するには？',
    'items.performance.content': '複数の高画質ストリームを同時に再生すると、CPUと帯域幅を大量に消費します。個々のストリームの画質を下げるか、同時再生数を減らすことをお勧めします。',

    'items.data_saved.title': '設定は保存されますか？',
    'items.data_saved.content': 'はい、レイアウト、お気に入り、設定はブラウザに自動的に保存され、次回アクセス時に復元されます。',

    'items.empty_window.title': '空ウィンドウの使い方',
    'items.empty_window.content': '「グループ追加 -> 空のグループを追加」でプレースホルダーウィンドウを作成できます。レイアウトを先に決めてから、チャンネルをドラッグして再生する際に便利です。'
};

export default faq;
