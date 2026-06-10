const faq = {
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
    'items.live_detection.content': '시스템은 백그라운드에서 주기적으로 Twitch 채널의 방송 상태를 확인합니다. 방송 중인 채널에는 녹색 표시등과 시청자 수가 표시됩니다.',

    'items.performance.title': '성능을 개선하려면 어떻게 해야 하나요?',
    'items.performance.content': '여러 고화질 스트림을 동시에 재생하면 CPU와 네트워크 대역폭을 많이 소모합니다. 개별 스트림의 화질을 낮추거나 동시 재생 수를 줄이는 것을 권장합니다.',

    'items.data_saved.title': '설정은 저장되나요?',
    'items.data_saved.content': '네, 레이아웃, 즐겨찾기 및 설정은 브라우저에 자동으로 저장되며 다음 방문 시 복원됩니다.',

    'items.empty_window.title': '빈 창 활용',
    'items.empty_window.content': '빈 그룹을 추가하여 자리 표시자로 사용할 수 있습니다. 레이아웃을 미리 계획한 후 채널을 드래그하여 재생할 때 유용합니다.'
};

export default faq;
