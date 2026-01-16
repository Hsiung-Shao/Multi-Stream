const stream = {
    'url_empty': 'URL 不能为空',
    'unsupported_platform': '不支持的平台，目前支持 Twitch、YouTube',
    'url_invalid_format': '无效的 URL 格式',
    'twitch_id_invalid': '无效的 Twitch 频道 ID',
    'twitch_parse_error': '无法解析 Twitch 网址',
    'youtube_url_guide': '请使用 YouTube 直播视频的完整网址（例如：https://www.youtube.com/watch?v=VIDEO_ID）\n\n频道 /live 网址需要先检查直播状态，请从收藏功能中使用。',
    'youtube_parse_error': '无法解析 YouTube 网址，请确认网址格式正确\n\n支持的格式：\n- https://www.youtube.com/watch?v=VIDEO_ID\n- https://youtu.be/VIDEO_ID\n- https://www.youtube.com/live/VIDEO_ID',
    'youtube_video_id_invalid': '无效的 YouTube 视频 ID: {{videoId}}',
    'apikey_missing': 'YouTube API Key 未配置',
    'apikey_error': '获取 API Key 时发生错误',
    'video_not_found': '找不到该视频',
    'fetch_video_error': '无法获取视频信息',
    'channel_id_invalid': '无效的 channelId',
    'channel_not_found': '找不到该频道',
    'fetch_channel_error': '无法获取频道标题'
};

export default stream;
