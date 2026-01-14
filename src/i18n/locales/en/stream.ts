const stream = {
    'url_empty': 'URL cannot be empty',
    'unsupported_platform': 'Unsupported platform. Currently supports Twitch and YouTube',
    'url_invalid_format': 'Invalid URL format',
    'twitch_id_invalid': 'Invalid Twitch Channel ID',
    'twitch_parse_error': 'Unable to parse Twitch URL',
    'youtube_url_guide': 'Please use the full URL of the YouTube live video (e.g., https://www.youtube.com/watch?v=VIDEO_ID)\n\nChannel /live URLs need to check live status first, please use from Favorites.',
    'youtube_parse_error': 'Unable to parse YouTube URL, please confirm the URL format is correct\n\nSupported formats:\n- https://www.youtube.com/watch?v=VIDEO_ID\n- https://youtu.be/VIDEO_ID\n- https://www.youtube.com/live/VIDEO_ID',
    'youtube_video_id_invalid': 'Invalid YouTube video ID: {{videoId}}',
    'apikey_missing': 'YouTube API Key not configured',
    'apikey_error': 'Error retrieving API Key',
    'video_not_found': 'Video not found',
    'fetch_video_error': 'Unable to retrieve video information',
    'channel_id_invalid': 'Invalid channelId',
    'channel_not_found': 'Channel not found',
    'fetch_channel_error': 'Unable to retrieve channel title'
};

export default stream;
