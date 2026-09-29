// Twitch Helix：app access token（client_credentials）快取在 service_tokens 表；
// /helix/streams（直播中，100 個 user_id／次）、/helix/users（login → broadcaster id，100 個／次）。
//
// 為什麼 token 存表而不是每次重拿：Light 每 5 分鐘跑一次，token 有效期約 60 天，
// 每次都打 id.twitch.tv 既浪費也容易撞 token 端點的速率限制。Edge Function 沒有 KV，改用資料表。

import type { Db } from './db.ts';

const TOKEN_URL = 'https://id.twitch.tv/oauth2/token';
const STREAMS_URL = 'https://api.twitch.tv/helix/streams';
const USERS_URL = 'https://api.twitch.tv/helix/users';
const SCHEDULE_URL = 'https://api.twitch.tv/helix/schedule';
const TOKEN_NAME = 'twitch_app';
/** 提前 1 小時視為過期，避免邊界用到剛失效的 token */
const TOKEN_BUFFER_MS = 3_600_000;
export const TWITCH_BATCH = 100;

export interface TwitchClientOptions {
  clientId: string;
  clientSecret: string;
  db: Db | null; // null = 只用記憶體（測試）
  fetch?: typeof fetch;
  timeoutMs?: number;
}

export interface TwitchLiveStream {
  streamId: string;
  userId: string;
  userLogin: string;
  title: string | null;
  gameName: string | null;
  viewerCount: number | null;
  startedAt: string | null;
  thumbnailUrl: string | null;
}

/** helix 非 2xx：帶狀態碼，呼叫端可分辨 429（限速）與其他錯誤 */
export class HelixError extends Error {
  readonly status: number;
  constructor(status: number) {
    super(`twitch helix HTTP ${status}`);
    this.name = 'HelixError';
    this.status = status;
  }
}

export interface TwitchScheduleSegment {
  id: string;
  startTime: string;
  endTime: string | null;
  title: string | null;
  category: string | null;
  /** 有值＝這段被取消（重複時段取消到這個時間為止） */
  canceledUntil: string | null;
  isRecurring: boolean;
}

export interface TwitchSchedule {
  segments: TwitchScheduleSegment[];
  vacation: { start: string; end: string } | null;
  /**
   * 翻到頁數上限還沒走完時，最後一段的開始時間：只有這個時間以前的段是完整的，
   * 之後「沒回來」不代表取消（tombstone 只能作用到這裡）。沒有這個欄位＝已涵蓋到 until。
   */
  coveredUntil?: string;
}

/** helix schedule 的一段 → 內部表示（缺 id 或開始時間的丟掉） */
export function toScheduleSegment(s: Record<string, unknown>): TwitchScheduleSegment | null {
  const id = typeof s.id === 'string' ? s.id : '';
  const start = typeof s.start_time === 'string' ? s.start_time : '';
  if (!id || !start || !Number.isFinite(Date.parse(start))) return null;
  const category = s.category as { name?: string } | null | undefined;
  return {
    id,
    startTime: start,
    endTime: typeof s.end_time === 'string' ? s.end_time : null,
    title: typeof s.title === 'string' && s.title ? s.title.slice(0, 300) : null,
    category: category?.name ? String(category.name).slice(0, 100) : null,
    canceledUntil: typeof s.canceled_until === 'string' ? s.canceled_until : null,
    isRecurring: s.is_recurring === true,
  };
}

interface TokenRow extends Record<string, unknown> {
  name: string;
  token: string;
  expires_at: string;
}

export class TwitchClient {
  private readonly fetchFn: typeof fetch;
  private readonly timeoutMs: number;
  private memToken: { token: string; expiresAt: number } | null = null;
  /** 統計：本次執行呼叫了幾次 helix */
  calls = { streams: 0, users: 0, token: 0, schedule: 0 };
  private readonly opts: TwitchClientOptions;

  constructor(opts: TwitchClientOptions) {
    this.opts = opts;
    this.fetchFn = opts.fetch ?? fetch;
    this.timeoutMs = opts.timeoutMs ?? 10000;
  }

  private async fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await this.fetchFn(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  async getAppToken(now = Date.now()): Promise<string> {
    if (this.memToken && this.memToken.expiresAt - TOKEN_BUFFER_MS > now) return this.memToken.token;

    if (this.opts.db) {
      const rows = await this.opts.db.select<TokenRow>('service_tokens', `select=name,token,expires_at&name=eq.${TOKEN_NAME}`);
      const row = rows[0];
      if (row) {
        const exp = Date.parse(row.expires_at);
        if (Number.isFinite(exp) && exp - TOKEN_BUFFER_MS > now) {
          this.memToken = { token: row.token, expiresAt: exp };
          return row.token;
        }
      }
    }

    const params = new URLSearchParams({
      client_id: this.opts.clientId,
      client_secret: this.opts.clientSecret,
      grant_type: 'client_credentials',
    });
    const res = await this.fetchWithTimeout(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    this.calls.token += 1;
    if (!res.ok) throw new Error(`twitch token HTTP ${res.status}`);
    const data = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!data.access_token) throw new Error('twitch token: no access_token');
    const expiresAt = now + Math.max(60, data.expires_in ?? 3600) * 1000;
    this.memToken = { token: data.access_token, expiresAt };

    if (this.opts.db) {
      await this.opts.db.upsert<TokenRow>(
        'service_tokens',
        [{ name: TOKEN_NAME, token: data.access_token, expires_at: new Date(expiresAt).toISOString() }],
        'name',
      );
    }
    return data.access_token;
  }

  /** 帶 token 打 helix；401（token 被撤銷）會清快取重拿一次。回傳原始 Response，由呼叫端決定狀態碼怎麼處理。 */
  private async helixResponse(url: string): Promise<Response> {
    const token = await this.getAppToken();
    const res = await this.fetchWithTimeout(url, {
      headers: { 'Client-Id': this.opts.clientId, Authorization: `Bearer ${token}` },
    });
    if (res.status !== 401) return res;
    this.memToken = null;
    if (this.opts.db) await this.opts.db.update('service_tokens', `name=eq.${TOKEN_NAME}`, { expires_at: new Date(0).toISOString() });
    const retryToken = await this.getAppToken();
    return this.fetchWithTimeout(url, {
      headers: { 'Client-Id': this.opts.clientId, Authorization: `Bearer ${retryToken}` },
    });
  }

  private async helix(url: string): Promise<unknown> {
    const res = await this.helixResponse(url);
    if (!res.ok) throw new HelixError(res.status);
    return res.json();
  }

  /** 同 helix，但 404 回 null（例如 /schedule：頻道沒有設定週表時 Twitch 回 404） */
  private async helixOrNull(url: string): Promise<unknown | null> {
    const res = await this.helixResponse(url);
    if (res.status === 404) {
      await res.text().catch(() => '');
      return null;
    }
    if (!res.ok) throw new HelixError(res.status);
    return res.json();
  }

  /**
   * 頻道週表（/helix/schedule）：一次只能查一個 broadcaster，每頁最多 25 段；翻頁到超過 until 為止。
   * 沒有週表回 null。重複時段 Twitch 會展開成一段一段（各有自己的 segment id）。
   */
  async fetchSchedule(broadcasterId: string, startTime: string, until: number, maxPages = 4): Promise<TwitchSchedule | null> {
    const segments: TwitchScheduleSegment[] = [];
    let vacation: TwitchSchedule['vacation'] = null;
    let cursor: string | null = null;
    for (let page = 0; page < maxPages; page++) {
      const params = new URLSearchParams({ broadcaster_id: broadcasterId, start_time: startTime, first: '25' });
      if (cursor) params.set('after', cursor);
      const body = (await this.helixOrNull(`${SCHEDULE_URL}?${params}`)) as
        | { data?: { segments?: Record<string, unknown>[] | null; vacation?: { start_time?: string; end_time?: string } | null }; pagination?: { cursor?: string } }
        | null;
      this.calls.schedule += 1;
      if (!body) return page === 0 ? null : { segments, vacation };
      const data = body.data ?? {};
      if (data.vacation?.start_time && data.vacation?.end_time) {
        vacation = { start: data.vacation.start_time, end: data.vacation.end_time };
      }
      let last = 0;
      for (const s of data.segments ?? []) {
        const seg = toScheduleSegment(s);
        if (!seg) continue;
        segments.push(seg);
        last = Math.max(last, Date.parse(seg.startTime));
      }
      cursor = body.pagination?.cursor ?? null;
      if (!cursor || last > until) return { segments, vacation };
    }
    // 翻到上限還有下一頁：只宣告涵蓋到最後一段
    const lastStart = segments.reduce((m, s) => Math.max(m, Date.parse(s.startTime)), 0);
    return { segments, vacation, coveredUntil: new Date(lastStart).toISOString() };
  }

  /** 直播中的頻道（user_id 每批 100）。不在回傳裡的就是沒開台。 */
  async fetchLiveStreams(userIds: readonly string[]): Promise<Map<string, TwitchLiveStream>> {
    const out = new Map<string, TwitchLiveStream>();
    const unique = [...new Set(userIds)];
    for (let i = 0; i < unique.length; i += TWITCH_BATCH) {
      const batch = unique.slice(i, i + TWITCH_BATCH);
      const params = new URLSearchParams();
      for (const id of batch) params.append('user_id', id);
      params.append('first', String(TWITCH_BATCH));
      const data = (await this.helix(`${STREAMS_URL}?${params}`)) as { data?: Record<string, unknown>[] };
      this.calls.streams += 1;
      for (const s of data.data ?? []) {
        const userId = String(s.user_id ?? '');
        if (!userId) continue;
        out.set(userId, {
          streamId: String(s.id ?? ''),
          userId,
          userLogin: String(s.user_login ?? '').toLowerCase(),
          title: typeof s.title === 'string' ? s.title.slice(0, 300) : null,
          gameName: typeof s.game_name === 'string' ? s.game_name.slice(0, 100) : null,
          viewerCount: typeof s.viewer_count === 'number' ? s.viewer_count : null,
          startedAt: typeof s.started_at === 'string' ? s.started_at : null,
          thumbnailUrl:
            typeof s.thumbnail_url === 'string'
              ? s.thumbnail_url.replace('{width}', '640').replace('{height}', '360')
              : null,
        });
      }
    }
    return out;
  }

  /** login（小寫）→ broadcaster id。查不到的 login 不在 Map 裡。 */
  async fetchUserIdsByLogin(logins: readonly string[]): Promise<Map<string, { id: string; displayName: string | null }>> {
    const out = new Map<string, { id: string; displayName: string | null }>();
    const unique = [...new Set(logins.map((l) => l.toLowerCase()))];
    for (let i = 0; i < unique.length; i += TWITCH_BATCH) {
      const batch = unique.slice(i, i + TWITCH_BATCH);
      const params = new URLSearchParams();
      for (const l of batch) params.append('login', l);
      const data = (await this.helix(`${USERS_URL}?${params}`)) as { data?: Record<string, unknown>[] };
      this.calls.users += 1;
      for (const u of data.data ?? []) {
        const login = String(u.login ?? '').toLowerCase();
        if (login && u.id) out.set(login, { id: String(u.id), displayName: typeof u.display_name === 'string' ? u.display_name : null });
      }
    }
    return out;
  }
}
