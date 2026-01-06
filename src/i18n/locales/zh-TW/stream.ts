const stream = {
    'url_empty': 'URL 不能為空',
    'unsupported_platform': '不支援的平台，目前支援 Twitch、YouTube',
    'url_invalid_format': '無效的 URL 格式',
    'twitch_id_invalid': '無效的 Twitch 頻道 ID',
    'twitch_parse_error': '無法解析 Twitch 網址',
    'youtube_url_guide': '請使用 YouTube 直播影片的完整網址（例如：https://www.youtube.com/watch?v=VIDEO_ID）\n\n頻道 /live 網址需要先檢查直播狀態，請從收藏功能中使用。',
    'youtube_parse_error': '無法解析 YouTube 網址，請確認網址格式正確\n\n支援的格式：\n- https://www.youtube.com/watch?v=VIDEO_ID\n- https://youtu.be/VIDEO_ID\n- https://www.youtube.com/live/VIDEO_ID',
    'youtube_video_id_invalid': '無效的 YouTube 視頻 ID: {{videoId}}',
    'apikey_missing': 'YouTube API Key 未配置',
    'apikey_error': '獲取 API Key 時發生錯誤',
    'video_not_found': '找不到該影片',
    'fetch_video_error': '無法獲取影片資訊',
    'channel_id_invalid': '無效的 channelId',
    'channel_not_found': '找不到該頻道',
    'fetch_channel_error': '無法獲取頻道標題'
};

export default stream;
