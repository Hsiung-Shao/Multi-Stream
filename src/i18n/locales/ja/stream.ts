const stream = {
    'url_empty': 'URLを入力してください',
    'unsupported_platform': 'サポートされていないプラットフォームです。現在はTwitchとYouTubeのみ対応しています',
    'url_invalid_format': 'URLの形式が無効です',
    'twitch_id_invalid': '無効なTwitchチャンネルIDです',
    'twitch_parse_error': 'TwitchのURLを解析できません',
    'youtube_url_guide': 'YouTubeライブ動画の完全なURLを使用してください（例：https://www.youtube.com/watch?v=VIDEO_ID）\n\nチャンネルの /live URLは、まずライブステータスを確認する必要があります。お気に入り機能から使用してください。',
    'youtube_parse_error': 'YouTubeのURLを解析できません。URLの形式が正しいか確認してください\n\nサポートされている形式：\n- https://www.youtube.com/watch?v=VIDEO_ID\n- https://youtu.be/VIDEO_ID\n- https://www.youtube.com/live/VIDEO_ID',
    'youtube_video_id_invalid': '無効なYouTube動画ID: {{videoId}}',
    'apikey_missing': 'YouTube APIキーが設定されていません',
    'apikey_error': 'APIキーの取得中にエラーが発生しました',
    'video_not_found': '動画が見つかりません',
    'fetch_video_error': '動画情報を取得できません',
    'channel_id_invalid': '無効なchannelIdです',
    'channel_not_found': 'チャンネルが見つかりません',
    'fetch_channel_error': 'チャンネルタイトルを取得できません'
};

export default stream;
