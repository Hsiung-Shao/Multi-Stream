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
    'fetch_channel_error': 'Unable to retrieve channel title',
    'already_exists': 'This stream has already been added',
    'twitch_api_timeout': 'Twitch API request timed out (10s). Please check your network',
    'twitch_api_network': 'Unable to connect to the Twitch API. Please check your internet connection',
    'twitch_api_rate_limited': 'Twitch API rate limit: please wait {{seconds}} seconds and try again',
    'twitch_api_too_many_requests': 'Too many API requests. Please try again later',
    'twitch_api_request_failed': 'API request failed: {{status}} {{statusText}}',
    'twitch_rate_limit_title': 'Twitch API rate limit',
    'twitch_rate_limit_body': 'The Twitch API per-minute request limit has been reached. Please wait {{seconds}} seconds and try again.'
};

export default stream;
