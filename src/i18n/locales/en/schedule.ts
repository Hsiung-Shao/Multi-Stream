// Stream schedule page (/schedule) copy; keep all 5 languages in sync.
export default {
    'title': 'Stream Schedule',
    'hero.title': 'Taiwanese VTuber Stream Schedule',
    'hero.subtitle': 'Who is live now and who goes live in the next 7 days, on one page. Tick a few streamers and watch them together on the canvas in one click.',

    'section.live': 'Live now',
    'section.upcoming': 'Coming up',
    'section.recent': 'Just ended',
    'section.showAll': 'Show all {{count}}',
    'section.showLess': 'Show less',

    'day.today': 'Today',
    'day.tomorrow': 'Tomorrow',
    'day.count': '{{count}} streams',
    'day.none': 'No waiting rooms on this day yet',

    'timeline.now': 'Now',
    'timeline.overdue': 'Past start time',

    'scope.label': 'Scope',
    'scope.all': 'Everyone',
    'scope.favorites': 'My favorites',

    'filter.nationality': 'Region',
    'filter.group': 'Group',
    'filter.platform': 'Platform',
    'nationality.all': 'All regions',
    'nationality.TW': 'Taiwan',
    'nationality.HK': 'Hong Kong',
    'nationality.MY': 'Malaysia',
    'nationality.JP': 'Japan',
    'nationality.OTHER': 'Other',
    'group.all': 'All groups',
    'platform.all': 'All',
    'platform.youtube': 'YouTube',
    'platform.twitch': 'Twitch',

    'card.viewers': '{{count}} watching',
    'card.startedAt': 'started {{time}}',
    'card.select': 'Select {{name}}',
    'card.openOriginal': 'Open on {{platform}}',
    'card.untitled': '(untitled)',

    'selection.count': '{{count}} selected',
    'selection.open': 'Watch together on canvas',
    'selection.clear': 'Clear',
    'selection.selectHourShort': 'Select all {{count}}',
    'selection.limit': 'The canvas holds 16 streams; {{count}} more will fit',

    'toast.added': 'Added {{count}} streams',
    'toast.partial': 'Added {{added}} streams, {{failed}} failed',
    'toast.skipped': 'Canvas is full; {{count}} more were not added',
    'toast.none': 'No streams were added',

    'state.loading': 'Loading schedule…',
    'state.error': 'The schedule could not be loaded',
    'state.errorStale': 'Refresh failed; showing the last data we had',
    'state.retry': 'Retry',
    'state.noneLive': 'Nobody is live right now.',
    'state.noneUpcoming': 'No matching waiting rooms in the next 7 days.',
    'state.emptyFavorites': 'None of your favorites are on the schedule yet',
    'state.emptyFavoritesHint': 'Add streamers to your favorites from the canvas search, and this view will show only their streams.',
    'state.updatedAt': 'Data updated {{time}}',

    'about.title': 'Where the data comes from',
    'about.body': 'The schedule only lists streams that exist on the platforms: YouTube waiting rooms and Twitch channels that are live right now. Streams a creator only announced in a schedule image will not appear. "Placeholder" waiting rooms scheduled more than 14 days out are left out, and anything still not live 3 hours after its start time is removed.',
    'about.tz': 'Times are shown in your device time zone.',
};
