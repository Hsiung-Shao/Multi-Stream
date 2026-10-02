const faq = {
    'tipLabel': '팁',
    'title': '자주 묻는 질문 (FAQ)',
    'header_title': '자주 묻는 질문 및 문제 해결',
    'header_subtitle': '재생, 성능, 데이터 저장에 관한 자주 묻는 질문의 답을 찾아보세요.',

    'cat_compat': '재생 및 호환성',
    'cat_compat_blurb': '브라우저, 플랫폼, 재생 관련 문제 해결.',
    'cat_usage': '성능 및 데이터',
    'cat_usage_blurb': '성능 조정, 데이터 저장, 레이아웃 자리 표시에 관한 자주 묻는 질문.',

    'items.brave_twitch.title': 'Brave 브라우저에서 Twitch 재생 불가',
    'items.brave_twitch.content': 'Brave 브라우저의 개인정보 보호 기능으로 인해 Twitch의 안티봇 시스템(Kasada)이 Brave 브라우저 식별자를 감지하고 요청을 거부하여 Twitch 스트림이 정상적으로 재생되지 않습니다(화면 멈춤 또는 오류). ModHeader 확장 프로그램을 설치하여 브라우저 식별자를 덮어쓰면 해결할 수 있습니다.',
    'items.brave_twitch.install_btn': 'ModHeader 확장 프로그램 설치',
    'items.brave_twitch.download_btn': '설정 파일 다운로드 (twitch.json)',
    'items.brave_twitch.step0': '브라우저 확장 프로그램 목록에서 설치된 ModHeader를 찾기',
    'items.brave_twitch.step1': 'ModHeader를 열고 오른쪽 상단의 메뉴 버튼(점 3개 아이콘)을 클릭',
    'items.brave_twitch.step2': '메뉴에서 "Import profile"을 찾아 클릭',
    'items.brave_twitch.step3': '"Load file" 버튼을 클릭하고 다운로드한 twitch.json 설정 파일을 선택하여 가져오기',
    'items.brave_twitch.tip': '가져오기 완료 후 Twitch 페이지를 새로고침하면 정상적으로 재생됩니다. 이 설정은 Twitch 관련 요청의 브라우저 식별자에만 영향을 미치며 다른 웹사이트에는 영향을 주지 않습니다.',

    'items.youtube_playback.title': '왜 YouTube 동영상이 재생되지 않나요?',
    'items.youtube_playback.content': '일부 YouTube 동영상이나 방송은 크리에이터가 "퍼가기 금지"로 설정하여 타사 플랫폼에서 재생할 수 없습니다.',

    'items.platform_support.title': '지원하는 플랫폼은 무엇인가요?',
    'items.platform_support.content': '현재는 주로 Twitch와 YouTube Live를 지원합니다. 추후 더 많은 플랫폼이 추가될 수 있습니다.',

    'items.live_detection.title': '방송 감지',
    'items.live_detection.content': '사이트에 들어올 때, 캔버스에 들어갈 때, 그리고 그 후 25분마다 즐겨찾기한 Twitch와 YouTube 채널이 방송 중인지 자동으로 확인합니다. 설정에서 "백그라운드에서 라이브 상태 자동 감지"를 켜면 5분마다 확인합니다. 방송이 감지되면 즐겨찾기 목록에 녹색 점이 표시됩니다(시청자 수는 표시하지 않습니다). YouTube 채널은 확인 빈도가 제한되어 있어 방송 시작 후 녹색으로 바뀌기까지 15분 이상 걸릴 수 있습니다.',

    'items.performance.title': '성능을 개선하려면 어떻게 해야 하나요?',
    'items.performance.content': '여러 고화질 방송을 동시에 재생하면 CPU와 네트워크 대역폭을 많이 사용합니다. 사이트 전체에 적용되는 화질 설정은 없으니, 각 플레이어의 톱니바퀴 메뉴에서 화질을 낮추거나 동시에 재생하는 방송 수를 줄이세요. YouTube를 2개 이상 동시에 재생할 때는 경고에 있는 "다른 YouTube 일시 중지"를 누를 수 있습니다. 탭이 백그라운드에 30초 넘게 있으면 Twitch는 자동으로 가장 낮은 화질로 내려갑니다. F3을 누르면 프레임 수와 메모리를 확인할 수 있는 성능 패널이 열립니다.',

    'items.data_saved.title': '설정은 저장되나요?',
    'items.data_saved.content': '즐겨찾기, 즐겨찾기 리스트, 태그, 설정, 사용자 지정 레이아웃은 브라우저에 저장되어 다음 방문 때도 그대로 있습니다. 지금 보고 있는 캔버스는 영구 저장되지 않습니다. 새로고침하면 캔버스가 비워지고, 10분 안에 돌아오면 이전 시청 화면을 복원할지 묻습니다. 다른 기기로 옮기려면 "즐겨찾기 관리 → 백업 및 복원"을 사용하세요(백업 파일에는 사용자 지정 레이아웃도 포함됩니다).',

    'items.empty_window.title': '빈 창 활용',
    'items.empty_window.content': '다이내믹 아일랜드에서 "+"를 누르고 "그룹 추가"(스트림＋채팅), "방송 창 추가" 또는 "채팅 창 추가"를 고르면 캔버스에 빈 창이 생겨, 먼저 자리를 잡아 두고 배치를 계획할 수 있습니다. 빈 스트림 창에는 검색창이 있고, 드롭다운에서 방송 중인 즐겨찾기 채널을 고를 수도 있습니다. 빈 채팅 창에서는 캔버스에 있는 방송 중 하나를 골라 그 채팅을 표시합니다.',

    'items.youtube_search.title': '왜 일부 YouTube 채널이 검색되지 않나요?',
    'items.youtube_search.content': '다이내믹 아일랜드 검색창의 YouTube 채널 검색은 사이트에 이미 수록된 채널 목록과 이름을 대조하는 방식이며, YouTube 전체를 실시간으로 검색하지 않습니다. 검색되지 않는다면 대개 해당 채널이 아직 수록되지 않은 것이니, 방송 스케줄에서 추가를 추천할 수 있습니다. 검색 결과를 고르면 먼저 그 채널이 방송 중인지 확인합니다. 방송 중이면 바로 캔버스에 추가하고, 방송 중이 아니면 즐겨찾기에 추가하므로 방송이 시작된 뒤 즐겨찾기 목록에서 불러오면 됩니다.',
    'items.youtube_search.tip': '원하는 채널이 계속 검색되지 않으면 Discord로 알려 주세요. 수록 목록에 추가하겠습니다.',
  // —— i18n 修補：design 改版新增 key，各語言在地化 ——
  'cat_all': '전체',
  'support_eyebrow': '지원',
  'search_placeholder': '질문 검색, 예: "Brave", "성능", "YouTube"…',
  'search_found': '"{{query}}"와(과) 일치하는 질문 {{count}}개를 찾았습니다',
  'search_none': '"{{query}}"와(과) 일치하는 질문이 없습니다',
  'empty_title': '관련 질문을 찾을 수 없습니다',
  'empty_desc': '다른 키워드로 시도하거나 Discord에서 직접 문의해 주세요.',
  'cta_title': '답을 찾지 못하셨나요？',
  'cta_desc': 'Discord 커뮤니티에 참여해 물어보세요. 기꺼이 도와드리겠습니다.',
  'cta_discord': 'Discord 참여',
  'foot_home': '홈',
  'foot_about': '소개',
  'foot_privacy': '개인정보 처리방침',
};

export default faq;
