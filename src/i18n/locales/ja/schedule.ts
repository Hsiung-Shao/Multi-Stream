// 配信スケジュール（/schedule）の文言。更新時は 5 言語すべてを同期すること。
export default {
    'title': '配信スケジュール',
    'hero.title': '台湾 VTuber 配信スケジュール',
    'hero.subtitle': '今だれが配信中か、これから 7 日間にだれが配信するかを 1 ページで。数人を選んでワンクリックでキャンバスに同時表示できます。',

    'section.live': '配信中',
    'section.upcoming': 'これから',
    'section.recent': '終了したばかり',
    'section.showAll': 'すべて表示（{{count}} 人）',
    'section.showLess': '閉じる',

    'day.today': '今日',
    'day.tomorrow': '明日',
    'day.count': '{{count}} 件',
    'day.none': 'この日の待機所はまだありません',

    'timeline.now': '現在',
    'timeline.overdue': '予定時刻を過ぎています',

    'scope.label': '範囲',
    'scope.all': 'すべて',
    'scope.favorites': 'お気に入り',

    'filter.nationality': '地域',
    'filter.group': 'グループ',
    'filter.platform': 'プラットフォーム',
    'nationality.all': 'すべての地域',
    'nationality.TW': '台湾',
    'nationality.HK': '香港',
    'nationality.MY': 'マレーシア',
    'nationality.JP': '日本',
    'nationality.OTHER': 'その他',
    'group.all': 'すべてのグループ',
    'platform.all': 'すべて',
    'platform.youtube': 'YouTube',
    'platform.twitch': 'Twitch',

    'card.viewers': '{{count}} 人が視聴中',
    'card.startedAt': '{{time}} 開始',
    'card.select': '{{name}} を選択',
    'card.openOriginal': '{{platform}} で開く',
    'card.untitled': '（タイトルなし）',

    'selection.count': '{{count}} 人選択中',
    'selection.open': 'キャンバスで同時に見る',
    'selection.clear': 'クリア',
    'selection.selectHourShort': '{{count}} 人を選択',
    'selection.limit': 'キャンバスは最大 16 枠、あと {{count}} 枠追加できます',

    'toast.added': '{{count}} 件の配信を追加しました',
    'toast.partial': '{{added}} 件追加、{{failed}} 件は失敗しました',
    'toast.skipped': 'キャンバスがいっぱいのため {{count}} 件は追加されませんでした',
    'toast.none': '追加された配信はありません',

    'state.loading': 'スケジュールを読み込み中…',
    'state.error': 'スケジュールを読み込めませんでした',
    'state.errorStale': '更新に失敗したため、前回のデータを表示しています',
    'state.retry': '再試行',
    'state.noneLive': '今配信している人はいません。',
    'state.noneUpcoming': 'これから 7 日間に条件に合う待機所はありません。',
    'state.emptyFavorites': 'お気に入りのうちスケジュールに載っている配信者はまだいません',
    'state.emptyFavoritesHint': 'キャンバスの検索から配信者をお気に入りに追加すると、ここにはその人たちの予定だけが表示されます。',
    'state.updatedAt': 'データ更新：{{time}}',

    'about.title': 'データについて',
    'about.body': 'スケジュールには、プラットフォーム上に実際に作成された予定だけを載せています。YouTube の配信待機所と、Twitch で配信中のチャンネルです。スケジュール画像だけで告知された配信は表示されません。14 日以上先の「常設枠」は除外し、予定時刻から 3 時間たっても始まらない配信は自動的に消えます。',
    'about.tz': '時刻はお使いの端末のタイムゾーンで表示されます。',
};
