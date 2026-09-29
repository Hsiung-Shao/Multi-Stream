// 방송 스케줄(/schedule) 문구. 수정 시 5개 언어를 모두 맞춰 주세요.
export default {
    'title': '방송 스케줄',
    'hero.title': '대만 VTuber 방송 스케줄',
    'hero.subtitle': '지금 누가 방송 중이고 앞으로 7일 동안 누가 방송하는지 한 페이지에서. 몇 명을 골라 한 번에 캔버스에서 함께 시청하세요.',

    'section.live': '방송 중',
    'section.upcoming': '다가오는 방송',
    'section.recent': '방금 종료',
    'section.showAll': '전체 {{count}}명 보기',
    'section.showLess': '접기',

    'day.today': '오늘',
    'day.tomorrow': '내일',
    'day.count': '{{count}}개',
    'day.none': '이 날에는 아직 대기실이 없습니다',

    'timeline.now': '지금',
    'timeline.overdue': '예정 시각 지남',

    'scope.label': '범위',
    'scope.all': '전체',
    'scope.favorites': '내 즐겨찾기',

    'filter.nationality': '지역',
    'filter.group': '그룹',
    'filter.platform': '플랫폼',
    'nationality.all': '전체 지역',
    'nationality.TW': '대만',
    'nationality.HK': '홍콩',
    'nationality.MY': '말레이시아',
    'nationality.JP': '일본',
    'nationality.OTHER': '기타',
    'group.all': '전체 그룹',
    'platform.all': '전체',
    'platform.youtube': 'YouTube',
    'platform.twitch': 'Twitch',

    'card.viewers': '{{count}}명 시청 중',
    'card.startedAt': '{{time}} 시작',
    'card.select': '{{name}} 선택',
    'card.openOriginal': '{{platform}}에서 열기',
    'card.untitled': '(제목 없음)',

    'selection.count': '{{count}}명 선택됨',
    'selection.open': '캔버스에서 함께 보기',
    'selection.clear': '지우기',
    'selection.selectHourShort': '{{count}}명 모두 선택',
    'selection.limit': '캔버스는 최대 16개, 지금 {{count}}개 더 추가할 수 있습니다',

    'toast.added': '방송 {{count}}개를 추가했습니다',
    'toast.partial': '{{added}}개 추가, {{failed}}개 실패',
    'toast.skipped': '캔버스가 가득 차서 {{count}}개는 추가하지 못했습니다',
    'toast.none': '추가된 방송이 없습니다',

    'state.loading': '스케줄을 불러오는 중…',
    'state.error': '스케줄을 불러오지 못했습니다',
    'state.errorStale': '업데이트에 실패해 마지막 데이터를 보여 주고 있습니다',
    'state.retry': '다시 시도',
    'state.noneLive': '지금 방송 중인 사람이 없습니다.',
    'state.noneUpcoming': '앞으로 7일 동안 조건에 맞는 대기실이 없습니다.',
    'state.emptyFavorites': '즐겨찾기 중 스케줄에 있는 방송인이 아직 없습니다',
    'state.emptyFavoritesHint': '캔버스 검색에서 방송인을 즐겨찾기에 추가하면 여기에는 그 사람들의 일정만 표시됩니다.',
    'state.updatedAt': '데이터 업데이트 {{time}}',

    'about.title': '데이터 출처',
    'about.body': '스케줄에는 플랫폼에 실제로 만들어진 일정만 담습니다. YouTube 방송 대기실과 지금 방송 중인 Twitch 채널입니다. 스케줄 이미지로만 공지한 방송은 나타나지 않습니다. 14일 이상 뒤로 잡힌 "상시 대기실"은 제외하고, 예정 시각에서 3시간이 지나도 시작하지 않은 방송은 자동으로 사라집니다.',
    'about.tz': '시간은 기기의 시간대로 표시됩니다.',
};
