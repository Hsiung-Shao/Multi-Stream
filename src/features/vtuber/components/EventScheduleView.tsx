import { useMemo, useState } from 'react';
import { useEvents } from '../hooks/useEvents';
import { EventDetailSheet } from './EventDetailSheet';
import {
  CalendarDays,
  CalendarSearch,
  Moon,
  ChevronDown,
  ChevronUp,
  Plus,
} from 'lucide-react';
import { logEvent } from '../../../utils/analytics';
import type { VTuberEvent, VTuberRecord } from '../types';

// ════════════════════════════════════════════════════════════════════════════
//  活動行程表（days variant）— 接真實 events 資料
//
//  設計來源：design-ref/ui_kits/multistream-hub/VTuberRecommend.jsx 的 EventSchedule。
//  取捨：設計稿是固定 3 天 mock，這裡改成「今日 / 明日 / 後續」動態三欄框架，
//  依 start_time（user 本地時區）分日；尖峰時段熱度、>3 場可展開的邏輯沿用設計。
// ════════════════════════════════════════════════════════════════════════════

interface EventScheduleViewProps {
  /** ScheduleEmpty 的「推薦 VTuber」CTA → 開既有的建立活動流程 */
  onCreateEvent?: () => void;
  /**
   * 'days'（預設）：三日欄框架，活動頁/獨立使用。
   * 'sidebar'：探索 hub 右側 sticky 側欄，垂直 timeline 變體（照設計稿 EventScheduleSidebar）。
   */
  variant?: 'days' | 'sidebar';
}

// 名稱衍生的穩定色（真實資料無設計 mock 的 color，用 hash 取穩定 hue）。
// 沿用 recommendations 域 RecommendationCard.avatarGradient 的 hash 作法。
function seedColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return `oklch(0.62 0.2 ${h})`;
}

function seedGradient(seed: string): string {
  const c = seedColor(seed);
  return `linear-gradient(135deg, color-mix(in oklch, ${c} 35%, transparent), ${c})`;
}

// 由 vtuber 的頻道判斷平台（無關聯 vtuber 時回傳 null，改用 event_type tag）
type Platform = 'youtube' | 'twitch' | 'duo';
function platformOf(vtuber?: VTuberRecord): Platform | null {
  if (!vtuber) return null;
  const hasYT = !!vtuber.youtube_channel_id;
  const hasTW = !!vtuber.twitch_channel_id;
  if (hasYT && hasTW) return 'duo';
  if (hasTW) return 'twitch';
  if (hasYT) return 'youtube';
  return null;
}

const PLATFORM_STYLE: Record<Platform, { className: string; label: string }> = {
  twitch: { className: 'bg-purple-500/15 text-purple-400 border-purple-500/30', label: 'Twitch' },
  youtube: { className: 'bg-red-500/15 text-red-400 border-red-500/30', label: 'YouTube' },
  duo: { className: 'bg-amber-500/15 text-amber-400 border-amber-500/30', label: '雙平台' },
};

// event_type → 中文 tag（vtuber_event 不顯示 tag，避免冗字）
const EVENT_TYPE_TAG: Record<VTuberEvent['event_type'], string | null> = {
  livestream: '直播',
  community: '社群',
  vtuber_event: null,
};

function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}

function hhmm(iso: string): string {
  const d = new Date(iso);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

// 以本地時區的「天」為單位的 key（YYYY-MM-DD）
function dayKey(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function isLiveNow(event: VTuberEvent): boolean {
  // 保守：只有「直播」型且 now 落在 start~end 之間才標 LIVE
  if (event.event_type !== 'livestream') return false;
  const now = Date.now();
  const start = new Date(event.start_time).getTime();
  if (now < start) return false;
  if (!event.end_time) return false; // 沒有 end_time 不亂標 LIVE
  return now <= new Date(event.end_time).getTime();
}

// 顯示名稱：有關聯 vtuber 用其 name，否則用活動標題
function displayName(event: VTuberEvent): string {
  return event.vtuber?.name ?? event.title;
}

// ── 分日框架：今日 / 明日 / 後續（接下來 7 天內，第 3+ 天合併為「後續」）──
interface DayFrame {
  key: string;
  weekday: string; // 今日 / 明日 / 後續
  day: string; // 5/21 或日期區間文字
  isToday: boolean;
  events: VTuberEvent[];
}

function buildFrames(events: VTuberEvent[]): DayFrame[] {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const dayAfter = new Date(today);
  dayAfter.setDate(today.getDate() + 2);

  const todayKey = dayKey(today);
  const tomorrowKey = dayKey(tomorrow);

  const todayEvents: VTuberEvent[] = [];
  const tomorrowEvents: VTuberEvent[] = [];
  const laterEvents: VTuberEvent[] = [];

  for (const e of events) {
    const d = new Date(e.start_time);
    const k = dayKey(d);
    if (k === todayKey) todayEvents.push(e);
    else if (k === tomorrowKey) tomorrowEvents.push(e);
    else if (d >= dayAfter) laterEvents.push(e);
    // 早於今天的事件略過（useEvents 已用 from=今日 00:00 過濾，這裡是雙保險）
  }

  const monthDay = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`;

  return [
    { key: 'today', weekday: '今日', day: monthDay(today), isToday: true, events: todayEvents },
    { key: 'tomorrow', weekday: '明日', day: monthDay(tomorrow), isToday: false, events: tomorrowEvents },
    { key: 'later', weekday: '後續', day: `${monthDay(dayAfter)} 起`, isToday: false, events: laterEvents },
  ];
}

// ── 時段分組：依小時分組，組內 live 優先、再依 start_time 排序 ──
interface Slot {
  hour: string;
  label: string;
  events: VTuberEvent[];
}

function buildSlots(events: VTuberEvent[]): Slot[] {
  const map: Record<string, Slot> = {};
  for (const e of events) {
    const hour = pad2(new Date(e.start_time).getHours());
    if (!map[hour]) map[hour] = { hour, label: `${hour}:00`, events: [] };
    map[hour].events.push(e);
  }
  return Object.values(map)
    .sort((a, b) => a.hour.localeCompare(b.hour))
    .map((s) => ({
      ...s,
      events: s.events
        .slice()
        .sort(
          (a, b) =>
            Number(isLiveNow(b)) - Number(isLiveNow(a)) ||
            new Date(a.start_time).getTime() - new Date(b.start_time).getTime(),
        ),
    }));
}

// ════════════════════════════════════════════════════════════════════════════

export function EventScheduleView({ onCreateEvent, variant = 'days' }: EventScheduleViewProps) {
  // 抓「今日 00:00 起、未來 7 天」、已核准的活動
  const { from, to } = useMemo(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const end = new Date(start);
    end.setDate(start.getDate() + 7);
    return { from: start.toISOString(), to: end.toISOString() };
  }, []);

  const { data: result, isLoading, isError } = useEvents({
    from,
    to,
    status: 'approved',
    pageSize: 100,
  });

  const events = result?.data ?? [];
  const frames = useMemo(() => buildFrames(events), [events]);

  const [selectedEvent, setSelectedEvent] = useState<VTuberEvent | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const handleEventClick = (event: VTuberEvent) => {
    setSelectedEvent(event);
    setDetailOpen(true);
    logEvent('VTuber', 'event_detail', event.title);
  };

  // ── 探索 hub：右側 sticky 側欄（垂直 timeline）──────────────────
  if (variant === 'sidebar') {
    // 只保留有事件的日框（側欄不顯示空日，避免冗長）
    const nonEmptyFrames = frames.filter((f) => f.events.length > 0);
    return (
      <aside className="lg:sticky lg:top-[76px] h-fit rounded-2xl bg-card border border-border p-3.5">
        <div className="flex items-center gap-2.5 mb-3.5">
          <CalendarDays className="w-[18px] h-[18px] text-blue-400" />
          <h2 className="text-[17px] font-bold tracking-[-0.005em] text-foreground">活動行程表</h2>
        </div>

        {isLoading ? (
          <TimelineSkeleton />
        ) : isError ? (
          <ScheduleError />
        ) : events.length === 0 ? (
          <ScheduleEmpty onCreateEvent={onCreateEvent} />
        ) : (
          <div>
            {nonEmptyFrames.map((frame, i) => (
              <TimelineDay
                key={frame.key}
                frame={frame}
                last={i === nonEmptyFrames.length - 1}
                onEventClick={handleEventClick}
              />
            ))}
          </div>
        )}

        <EventDetailSheet event={selectedEvent} open={detailOpen} onOpenChange={setDetailOpen} />
      </aside>
    );
  }

  return (
    <section className="space-y-4">
      {/* SectionHeader */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <CalendarDays className="w-[18px] h-[18px] text-blue-400" />
          <h2 className="text-[17px] font-bold tracking-[-0.005em] text-foreground">活動行程表</h2>
          <span className="hidden sm:inline text-xs text-muted-foreground">推薦 VTuber 的近期直播時程</span>
        </div>
      </div>

      {isLoading ? (
        <ScheduleSkeleton />
      ) : isError ? (
        <ScheduleError />
      ) : events.length === 0 ? (
        <ScheduleEmpty onCreateEvent={onCreateEvent} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 items-start">
          {frames.map((frame) => (
            <DayColumn key={frame.key} frame={frame} onEventClick={handleEventClick} />
          ))}
        </div>
      )}

      <EventDetailSheet event={selectedEvent} open={detailOpen} onOpenChange={setDetailOpen} />
    </section>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  TIMELINE 變體（sidebar）— 依日分組的垂直 timeline，照設計稿 ScheduleTimeline compact
// ════════════════════════════════════════════════════════════════════════════

const TIMELINE_CAP = 5; // 每日最多顯示幾場，其餘收成「+ 還有 N 場」

function TimelineDay({
  frame,
  last,
  onEventClick,
}: {
  frame: DayFrame;
  last: boolean;
  onEventClick: (event: VTuberEvent) => void;
}) {
  const [open, setOpen] = useState(false);
  const sorted = useMemo(
    () =>
      frame.events
        .slice()
        .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()),
    [frame.events],
  );
  const shown = open ? sorted : sorted.slice(0, TIMELINE_CAP);
  const more = sorted.length - TIMELINE_CAP;

  return (
    <div className={last ? '' : 'mb-4'}>
      {/* Day header */}
      <div className="flex items-center gap-2.5 pb-2 mb-2 border-b border-border/60">
        <span
          className={`inline-flex items-center justify-center min-w-[42px] h-6 px-2 rounded-md text-[11px] font-bold ${
            frame.isToday ? 'bg-primary text-primary-foreground' : 'bg-foreground/6 text-foreground'
          }`}
        >
          {frame.weekday}
        </span>
        <span className="text-xs text-muted-foreground tabular-nums">{frame.day}</span>
        <span className="ml-auto text-[11px] text-muted-foreground">{frame.events.length} 場</span>
      </div>

      {/* 垂直 timeline */}
      <div className="relative pl-4">
        <div className="absolute top-1 bottom-1 left-[5px] w-0.5 rounded-full bg-foreground/[0.06]" />
        {shown.map((event) => (
          <TimelineRow key={event.id} event={event} onClick={() => onEventClick(event)} />
        ))}
        {more > 0 && (
          <button
            type="button"
            onClick={() => setOpen(!open)}
            className="ml-3.5 mt-0.5 inline-flex items-center gap-1 text-[11px] font-semibold text-[#93c5fd] hover:text-[#bfdbfe] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
          >
            {open ? '收合' : `還有 ${more} 場直播`}
            {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        )}
      </div>
    </div>
  );
}

function TimelineRow({ event, onClick }: { event: VTuberEvent; onClick: () => void }) {
  const live = isLiveNow(event);
  const name = displayName(event);
  const platform = platformOf(event.vtuber);
  const tag = EVENT_TYPE_TAG[event.event_type];
  const seed = event.vtuber?.id ?? event.vtuber?.name ?? event.title;

  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative block w-full text-left pb-3 pl-3.5 focus-visible:outline-none"
    >
      {/* dot */}
      <span
        className="absolute left-[-16px] top-1 w-3 h-3 rounded-full"
        style={{
          background: live ? 'var(--live-red, #ef4444)' : seedColor(seed),
          border: '2px solid var(--background)',
          boxShadow: live ? '0 0 0 3px rgba(239,68,68,0.2)' : 'none',
        }}
      />
      <div className="flex items-baseline gap-2">
        <span className={`text-xs font-bold tabular-nums ${live ? 'text-red-500' : 'text-foreground'}`}>
          {hhmm(event.start_time)}
        </span>
        <span className="text-[11px] font-semibold text-muted-foreground truncate">{name}</span>
        {live && <span className="w-1 h-1 rounded-full bg-red-500 live-pulse shrink-0" />}
      </div>
      <div className="text-[11px] text-muted-foreground mt-0.5 truncate leading-[1.4] group-hover:text-foreground transition-colors">
        {event.title}
      </div>
      <div className="flex items-center gap-1 mt-1">
        {platform && (
          <span
            className={`inline-flex items-center px-1.5 h-4 rounded border text-[9px] font-semibold ${PLATFORM_STYLE[platform].className}`}
          >
            {PLATFORM_STYLE[platform].label}
          </span>
        )}
        {tag && (
          <span className="inline-flex items-center px-1.5 py-px rounded-[3px] text-[9px] font-semibold bg-primary/15 text-primary border border-primary/30">
            {tag}
          </span>
        )}
      </div>
    </button>
  );
}

// ── 側欄 timeline 載入骨架 ──
function TimelineSkeleton() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 2 }).map((_, i) => (
        <div key={i} className="space-y-2">
          <div className="h-6 w-24 rounded bg-muted animate-pulse" />
          <div className="pl-4 space-y-3">
            {Array.from({ length: 3 }).map((__, j) => (
              <div key={j} className="space-y-1.5">
                <div className="h-3 w-2/3 rounded bg-muted animate-pulse" />
                <div className="h-3 w-1/2 rounded bg-muted animate-pulse" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── 單日欄 ──
function DayColumn({
  frame,
  onEventClick,
}: {
  frame: DayFrame;
  onEventClick: (event: VTuberEvent) => void;
}) {
  const slots = useMemo(() => buildSlots(frame.events), [frame.events]);

  return (
    <div
      className={`flex flex-col gap-2.5 rounded-2xl bg-card p-3.5 border ${
        frame.isToday ? 'border-blue-400/25' : 'border-border'
      }`}
    >
      {/* Day header */}
      <div className="flex items-baseline justify-between pb-2 border-b border-border/60">
        <div className="flex items-baseline gap-2">
          <span className={`text-base font-bold ${frame.isToday ? 'text-blue-300' : 'text-foreground'}`}>
            {frame.weekday}
          </span>
          <span className="text-xs text-muted-foreground">{frame.day}</span>
        </div>
        <span className="text-[11px] text-muted-foreground">{frame.events.length} 場</span>
      </div>

      {frame.events.length === 0 ? (
        <DayEmpty />
      ) : (
        slots.map((slot) => <SlotGroup key={slot.hour} slot={slot} onEventClick={onEventClick} />)
      )}
    </div>
  );
}

// ── 時段組（>3 場可展開）──
const SLOT_LIMIT = 3;
function SlotGroup({
  slot,
  onEventClick,
}: {
  slot: Slot;
  onEventClick: (event: VTuberEvent) => void;
}) {
  const [open, setOpen] = useState(false);
  const list = open ? slot.events : slot.events.slice(0, SLOT_LIMIT);
  const more = slot.events.length - SLOT_LIMIT;
  const hot = slot.events.length >= 4;

  return (
    <div>
      <div className="flex items-center gap-2 mx-0.5 mt-0.5 mb-1.5">
        <span
          className={`text-[11px] font-bold tabular-nums ${hot ? 'text-orange-400' : 'text-muted-foreground'}`}
        >
          {slot.label}
        </span>
        <SlotHeat count={slot.events.length} hot={hot} />
        <span className="ml-auto text-[10px] text-muted-foreground">{slot.events.length} 場</span>
      </div>

      <div className="flex flex-col gap-1">
        {list.map((event) => (
          <EventRow key={event.id} event={event} onClick={() => onEventClick(event)} />
        ))}
      </div>

      {more > 0 && (
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="mt-1.5 w-full h-[30px] inline-flex items-center justify-center gap-1 rounded-lg bg-blue-400/10 border border-blue-400/25 text-blue-300 text-[11px] font-semibold transition-colors hover:bg-blue-400/15"
        >
          {open ? '收合' : `還有 ${more} 場同時段`}
          {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
      )}
    </div>
  );
}

// ── 尖峰熱度條 ──
function SlotHeat({ count, hot }: { count: number; hot: boolean }) {
  const max = 6;
  const lvl = Math.min(count, max);
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-flex gap-0.5">
        {Array.from({ length: max }).map((_, i) => (
          <span
            key={i}
            className={`w-1 h-[9px] rounded-[1px] ${
              i < lvl ? (hot ? 'bg-orange-400' : 'bg-blue-400') : 'bg-foreground/10'
            }`}
          />
        ))}
      </span>
      {hot && <span className="text-[9px] font-bold tracking-[0.04em] text-orange-400">尖峰</span>}
    </span>
  );
}

// ── 單筆活動列 ──
function EventRow({ event, onClick }: { event: VTuberEvent; onClick: () => void }) {
  const live = isLiveNow(event);
  const name = displayName(event);
  const platform = platformOf(event.vtuber);
  const tag = EVENT_TYPE_TAG[event.event_type];
  const seed = event.vtuber?.id ?? event.vtuber?.name ?? event.title;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`group flex items-stretch gap-2.5 p-2 rounded-[10px] text-left w-full transition-colors hover:bg-foreground/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring border ${
        live ? 'border-red-500/30' : 'border-transparent'
      }`}
    >
      {/* Time gutter */}
      <div className="w-11 flex flex-col items-end shrink-0">
        <div
          className={`text-sm font-bold tabular-nums ${live ? 'text-red-500' : 'text-foreground'}`}
        >
          {hhmm(event.start_time)}
        </div>
        {event.end_time && (
          <div className="text-[10px] text-muted-foreground">– {hhmm(event.end_time)}</div>
        )}
      </div>

      {/* Color rail */}
      <div className="w-[3px] rounded-full shrink-0" style={{ background: seedColor(seed) }} />

      {/* Body */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span
            className="w-[18px] h-[18px] rounded-full shrink-0 inline-flex items-center justify-center text-white font-bold text-[9px]"
            style={{ background: seedGradient(seed) }}
          >
            {name.charAt(0)}
          </span>
          <span className="text-xs font-semibold truncate text-foreground">{name}</span>
          {live && (
            <span className="inline-flex items-center gap-1 px-1.5 py-px rounded-[3px] bg-red-500 text-white text-[8px] font-bold tracking-[0.04em]">
              <span className="w-[3px] h-[3px] rounded-full bg-white animate-pulse" />
              直播中
            </span>
          )}
        </div>
        <div className="text-xs text-muted-foreground truncate leading-[1.4]">{event.title}</div>
        <div className="flex items-center gap-1.5 mt-1">
          {platform ? (
            <span
              className={`inline-flex items-center px-1.5 h-4 rounded border text-[9px] font-semibold ${PLATFORM_STYLE[platform].className}`}
            >
              {PLATFORM_STYLE[platform].label}
            </span>
          ) : tag ? (
            <span className="inline-flex items-center px-1.5 h-4 rounded border text-[9px] font-semibold bg-muted text-muted-foreground border-border">
              {tag}
            </span>
          ) : null}
          {/* 有 platform 又有 type tag 時，type tag 用紫色點綴（對應設計的 tag 樣式） */}
          {platform && tag && (
            <span className="inline-flex items-center px-1.5 py-px rounded-[3px] text-[9px] font-semibold bg-primary/15 text-primary border border-primary/30">
              {tag}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

// ── 單日空狀態 ──
function DayEmpty() {
  return (
    <div className="px-2 py-[22px] text-center rounded-[10px] border border-dashed border-foreground/10 bg-foreground/[0.015]">
      <Moon className="w-5 h-5 mx-auto text-foreground/30" />
      <div className="text-[11.5px] text-muted-foreground mt-1.5">這天還沒有排定的直播</div>
    </div>
  );
}

// ── 全域空狀態 ──
function ScheduleEmpty({ onCreateEvent }: { onCreateEvent?: () => void }) {
  return (
    <div className="px-6 py-10 text-center rounded-2xl bg-card border border-dashed border-foreground/[0.12] flex flex-col items-center gap-2">
      <div className="w-14 h-14 rounded-2xl flex items-center justify-center bg-blue-400/10 border border-blue-400/25 mb-1">
        <CalendarSearch className="w-[26px] h-[26px] text-blue-400" />
      </div>
      <h3 className="text-[15px] font-bold text-foreground">還沒有推薦 VTuber 的直播行程</h3>
      <p className="text-[13px] text-muted-foreground max-w-[380px] leading-[1.6]">
        當社群推薦的 VTuber 排定直播後，時程會自動顯示在這裡。你也可以建立活動，幫忙把這裡填滿。
      </p>
      {onCreateEvent && (
        <button
          type="button"
          onClick={onCreateEvent}
          className="mt-2 inline-flex items-center gap-1.5 h-[38px] px-[18px] rounded-full bg-primary text-primary-foreground text-[13px] font-semibold shadow-[0_10px_24px_-10px_oklch(0.63_0.23_304_/_0.6)] transition-opacity hover:opacity-90"
        >
          <Plus className="w-3.5 h-3.5" />
          建立活動
        </button>
      )}
    </div>
  );
}

// ── 載入骨架 ──
function ScheduleSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 items-start">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="rounded-2xl bg-card border border-border p-3.5 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-border/60">
            <div className="h-5 w-16 rounded bg-muted animate-pulse" />
            <div className="h-4 w-8 rounded bg-muted animate-pulse" />
          </div>
          {Array.from({ length: 3 }).map((__, j) => (
            <div key={j} className="flex gap-2.5">
              <div className="w-11 h-8 rounded bg-muted animate-pulse" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 w-3/4 rounded bg-muted animate-pulse" />
                <div className="h-3 w-1/2 rounded bg-muted animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ── 錯誤狀態 ──
function ScheduleError() {
  return (
    <div className="px-6 py-10 text-center rounded-2xl bg-card border border-dashed border-destructive/30">
      <p className="text-sm text-destructive">載入活動行程時發生錯誤，請稍後再試。</p>
    </div>
  );
}
