// 配信スケジュール（/schedule）の文言。更新時は 5 言語すべてを同期すること。
export default {
    'title': '配信スケジュール',
    'hero.eyebrow': '配信スケジュール',
    'hero.title': '台湾 VTuber 配信スケジュール',
    'hero.subtitle': 'YouTube の待機所と Twitch の配信中チャンネルをまとめて、今だれが配信中か、これから 7 日間にだれが配信するかがひと目でわかります。数人を選んでワンクリックでキャンバスに同時表示できます。',

    'tabs.live': '配信中',
    'tabs.upcoming': 'これから',
    'tabs.recent': '終了したばかり',

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
    'card.scheduledAt': '{{time}} 予定',
    'card.endedAt': '{{time}} 終了',
    'card.select': '{{name}} を選択',
    'card.openOriginal': '{{platform}} で開く',
    'card.untitled': '（タイトルなし）',

    'selection.count': '{{count}} 人選択中',
    'selection.open': 'キャンバスで同時に見る',
    'selection.clear': 'クリア',
    'selection.selectHour': 'この時間帯を選択',
    'selection.limit': 'キャンバスは最大 16 枠、あと {{count}} 枠追加できます',

    'toast.added': '{{count}} 件の配信を追加しました',
    'toast.partial': '{{added}} 件追加、{{failed}} 件は失敗しました',
    'toast.skipped': 'キャンバスがいっぱいのため {{count}} 件は追加されませんでした',
    'toast.none': '追加された配信はありません',

    'state.loading': 'スケジュールを読み込み中…',
    'state.error': 'スケジュールを読み込めませんでした',
    'state.errorStale': '更新に失敗したため、前回のデータを表示しています',
    'state.retry': '再試行',
    'state.empty': '条件に合う配信はありません',
    'state.emptyFavorites': 'お気に入りのうちスケジュールに載っている配信者はまだいません',
    'state.emptyFavoritesHint': 'キャンバスの検索から配信者をお気に入りに追加すると、ここにはその人たちの予定だけが表示されます。',
    'state.updatedAt': '{{time}} に更新',

    'board.today': '今日',
    'board.none': '予定なし',

    'about.title': 'データについて',
    'about.body': 'スケジュールには、プラットフォーム上に実際に作成された予定だけを載せています。YouTube の配信待機所と、Twitch で配信中のチャンネルです。スケジュール画像だけで告知された配信は表示されません。14 日以上先の「常設枠」は除外し、予定時刻から 3 時間たっても始まらない配信は自動的に消えます。',
    'about.tz': '時刻はお使いの端末のタイムゾーンで表示されます。',
};
