// PostgREST 存取（service_role）。memory 教訓：
//   - 預設 max_rows=1000 會靜默截斷 → getAll 一律 Range 分頁、固定排序
//   - return=minimal 的空 body 不能 res.json() → 先 text() 再判空
//   - upsert 每列欄位集要一致，否則 merge-duplicates 會把缺的欄位寫成 null

const PAGE = 1000;

export class RestError extends Error {
  constructor(message, status, body) {
    super(message);
    this.name = 'RestError';
    this.status = status;
    this.body = body;
  }
  get isUniqueViolation() {
    try {
      return JSON.parse(this.body)?.code === '23505';
    } catch {
      return false;
    }
  }
}

export class Rest {
  constructor({ url, key, fetch: fetchFn = globalThis.fetch }) {
    this.url = url.replace(/\/$/, '');
    this.key = key;
    this.fetch = fetchFn;
  }

  headers(extra = {}) {
    return { apikey: this.key, Authorization: `Bearer ${this.key}`, 'Content-Type': 'application/json', ...extra };
  }

  async request(path, init = {}) {
    const res = await this.fetch(`${this.url}/rest/v1/${path}`, { ...init, headers: this.headers(init.headers) });
    const text = await res.text();
    if (!res.ok) throw new RestError(`${init.method ?? 'GET'} ${path} → HTTP ${res.status}: ${text.slice(0, 300)}`, res.status, text);
    return { status: res.status, headers: res.headers, data: text ? JSON.parse(text) : null };
  }

  /** 單次查詢（呼叫端自己確定不會超過 1000 列） */
  async get(path) {
    return (await this.request(path)).data ?? [];
  }

  /** 分頁撈完；path 不要帶 order（這裡加） */
  async getAll(path, orderBy = 'id') {
    const rows = [];
    for (let from = 0; ; from += PAGE) {
      const sep = path.includes('?') ? '&' : '?';
      const r = await this.request(`${path}${sep}order=${orderBy}`, {
        headers: { Range: `${from}-${from + PAGE - 1}`, 'Range-Unit': 'items', Prefer: 'count=exact' },
      });
      const chunk = r.data ?? [];
      rows.push(...chunk);
      const total = Number((r.headers.get('content-range') || '').split('/')[1]);
      if (chunk.length < PAGE || (Number.isFinite(total) && rows.length >= total)) break;
    }
    return rows;
  }

  async insert(table, rows, { returning = false } = {}) {
    const r = await this.request(table, {
      method: 'POST',
      body: JSON.stringify(rows),
      headers: { Prefer: returning ? 'return=representation' : 'return=minimal' },
    });
    return r.data;
  }

  /** upsert：rows 的欄位集必須一致 */
  async upsert(table, rows, onConflict) {
    if (!rows.length) return;
    await this.request(`${table}?on_conflict=${onConflict}`, {
      method: 'POST',
      body: JSON.stringify(rows),
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    });
  }

  /** 回更新的列數 */
  async patch(table, filter, body) {
    const r = await this.request(`${table}?${filter}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
      headers: { Prefer: 'return=representation' },
    });
    return Array.isArray(r.data) ? r.data.length : 0;
  }
}

export const inList = (values) => `in.(${values.map((v) => `"${String(v).replace(/"/g, '')}"`).join(',')})`;
