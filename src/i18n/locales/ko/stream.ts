const stream = {
    'url_empty': 'URL을 입력해주세요',
    'unsupported_platform': '지원되지 않는 플랫폼입니다. 현재 Twitch와 YouTube만 지원합니다',
    'url_invalid_format': '유효하지 않은 URL 형식입니다',
    'twitch_id_invalid': '유효하지 않은 Twitch 채널 ID입니다',
    'twitch_parse_error': 'Twitch URL을 분석할 수 없습니다',
    'youtube_url_guide': 'YouTube 라이브 동영상의 전체 URL을 사용해주세요 (예: https://www.youtube.com/watch?v=VIDEO_ID)\n\n채널 /live URL은 먼저 방송 상태를 확인해야 합니다. 즐겨찾기 기능에서 사용해주세요.',
    'youtube_parse_error': 'YouTube URL을 분석할 수 없습니다. URL 형식이 올바른지 확인해주세요\n\n지원되는 형식:\n- https://www.youtube.com/watch?v=VIDEO_ID\n- https://youtu.be/VIDEO_ID\n- https://www.youtube.com/live/VIDEO_ID',
    'youtube_video_id_invalid': '유효하지 않은 YouTube 동영상 ID: {{videoId}}',
    'apikey_missing': 'YouTube API 키가 구성되지 않았습니다',
    'apikey_error': 'API 키를 가져오는 중 오류가 발생했습니다',
    'video_not_found': '동영상을 찾을 수 없습니다',
    'fetch_video_error': '동영상 정보를 가져올 수 없습니다',
    'channel_id_invalid': '유효하지 않은 channelId',
    'channel_not_found': '채널을 찾을 수 없습니다',
    'fetch_channel_error': '채널 제목을 가져올 수 없습니다',
    'already_exists': '이미 추가된 스트림입니다',
    'twitch_api_timeout': 'Twitch API 요청 시간이 초과되었습니다(10초). 네트워크 상태를 확인해 주세요',
    'twitch_api_network': 'Twitch API에 연결할 수 없습니다. 네트워크 연결을 확인해 주세요',
    'twitch_api_rate_limited': 'Twitch API 요청 한도: {{seconds}}초 후에 다시 시도해 주세요',
    'twitch_api_too_many_requests': 'API 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요',
    'twitch_api_request_failed': 'API 요청 실패: {{status}} {{statusText}}',
    'twitch_rate_limit_title': 'Twitch API 요청 한도',
    'twitch_rate_limit_body': 'Twitch API 분당 요청 한도에 도달했습니다. {{seconds}}초 후에 다시 시도해 주세요.'
};

export default stream;
