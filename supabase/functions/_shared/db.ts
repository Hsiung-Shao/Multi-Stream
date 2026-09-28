// 極簡 PostgREST client（service_role）。
//
// 為什麼不用 supabase-js：Edge Function 只需要 select / upsert / patch 三種操作，
// 自己包 fetch 才能照 memory 的教訓處理：
//   - return=minimal 回空 body，不能直接 res.json()（error_postgrest_upsert_not_null_and_empty_body）
//   - 預設 max_rows=1000 會靜默截斷，select 一律用 Range 分頁（error_postgrest_default_1000_row_cap）
//   - 批次 upsert 每筆欄位集要一致，缺的 key 會被寫成 NULL（enrich-youtube-channels.mjs 的註解）

export interface DbOptions {
  url: string;
  serviceRoleKey: string;
  fetch?: typeof fetch;
  pageSize?: number;
}

export class DbError extends Error {
  readonly status: number;
  readonly body: string;
  // 不用 TS parameter property：Node 的 type-strip 模式不支援，本地腳本要能直接 import 這個模組
  constructor(message: string, status: number, body: string) {
    super(message);
    this.name = 'DbError';
    this.status = status;
    this.body = body;
  }
}

export class Db {
  private readonly url: string;
  private readonly key: string;
  private readonly fetchFn: typeof fetch;
  private readonly pageSize: number;

  constructor(opts: DbOptions) {
    this.url = opts.url.replace(/\/$/, '');
    this.key = opts.serviceRoleKey;
    this.fetchFn = opts.fetch ?? fetch;
    this.pageSize = opts.pageSize ?? 1000;
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return {
      apikey: this.key,
      Authorization: `Bearer ${this.key}`,
      'Content-Type': 'application/json',
      ...extra,
    };
  }

  private async parse<T>(res: Response, what: string): Promise<T | null> {
    const text = await res.text();
    if (!res.ok) throw new DbError(`${what} HTTP ${res.status}`, res.status, text.slice(0, 500));
    if (!text) return null;
    return JSON.parse(text) as T;
  }

  /** 讀全部（自動分頁）。query 是 PostgREST 查詢字串，不含 select 以外的分頁參數。 */
  async selectAll<T>(table: string, query: string, orderBy = 'id'): Promise<T[]> {
    const rows: T[] = [];
    for (let from = 0; ; from += this.pageSize) {
      const to = from + this.pageSize - 1;
      const res = await this.fetchFn(`${this.url}/rest/v1/${table}?${query}&order=${orderBy}`, {
        headers: this.headers({ Range: `${from}-${to}`, 'Range-Unit': 'items' }),
      });
      const chunk = (await this.parse<T[]>(res, `select ${table}`)) ?? [];
      rows.push(...chunk);
      if (chunk.length < this.pageSize) break;
    }
    return rows;
  }

  /** 讀一頁（呼叫端自己決定 limit）。 */
  async select<T>(table: string, query: string): Promise<T[]> {
    const res = await this.fetchFn(`${this.url}/rest/v1/${table}?${query}`, { headers: this.headers() });
    return (await this.parse<T[]>(res, `select ${table}`)) ?? [];
  }

  /** 批次 upsert。rows 內每筆的欄位集必須一致。 */
  async upsert<T extends Record<string, unknown>>(
    table: string,
    rows: T[],
    onConflict: string,
    opts: { batch?: number; returning?: boolean } = {},
  ): Promise<T[]> {
    const batch = opts.batch ?? 500;
    const out: T[] = [];
    for (let i = 0; i < rows.length; i += batch) {
      const slice = rows.slice(i, i + batch);
      const res = await this.fetchFn(`${this.url}/rest/v1/${table}?on_conflict=${onConflict}`, {
        method: 'POST',
        headers: this.headers({
          Prefer: `resolution=merge-duplicates,return=${opts.returning ? 'representation' : 'minimal'}`,
        }),
        body: JSON.stringify(slice),
      });
      const parsed = await this.parse<T[]>(res, `upsert ${table}`);
      if (parsed) out.push(...parsed);
    }
    return out;
  }

  /** PATCH：query 是 where 條件（例：`id=eq.xxx`），patch 是要改的欄位。回傳影響列數（需 count）。 */
  async update(table: string, query: string, patch: Record<string, unknown>): Promise<number> {
    const res = await this.fetchFn(`${this.url}/rest/v1/${table}?${query}`, {
      method: 'PATCH',
      headers: this.headers({ Prefer: 'return=minimal,count=exact' }),
      body: JSON.stringify(patch),
    });
    await this.parse(res, `update ${table}`);
    const range = res.headers.get('content-range') || '';
    const total = Number(range.split('/')[1]);
    return Number.isFinite(total) ? total : 0;
  }

  /** 上傳 Storage 物件（x-upsert）。 */
  async putStorageObject(
    bucket: string,
    path: string,
    body: string,
    contentType: string,
    cacheControl: string,
  ): Promise<void> {
    const res = await this.fetchFn(`${this.url}/storage/v1/object/${bucket}/${path}`, {
      method: 'POST',
      headers: {
        apikey: this.key,
        Authorization: `Bearer ${this.key}`,
        'Content-Type': contentType,
        'x-upsert': 'true',
        // Storage 的 cache-control 只吃秒數（例如 "60"），不是完整的 Cache-Control 標頭
        'cache-control': cacheControl,
      },
      body,
    });
    await this.parse(res, `storage put ${bucket}/${path}`);
  }
}

/** PostgREST `in.(...)` 的值：字串要用雙引號包起來，內含雙引號要跳脫 */
export function inList(values: readonly string[]): string {
  return `in.(${values.map((v) => `"${v.replace(/"/g, '\\"')}"`).join(',')})`;
}
