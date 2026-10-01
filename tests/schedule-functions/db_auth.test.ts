import { describe, expect, it } from 'vitest';
import { Db, inList } from '../../supabase/functions/_shared/db.ts';
import { isAuthorized } from '../../supabase/functions/_shared/auth.ts';
import { mapLimit } from '../../supabase/functions/_shared/sweep.ts';

describe('Db（PostgREST 包裝）', () => {
  it('upsert 用 return=minimal 時空 body 不會炸', async () => {
    let prefer = '';
    const fetchFn = (async (_url: string | URL | Request, init?: RequestInit) => {
      prefer = new Headers(init?.headers).get('Prefer') ?? '';
      return new Response('', { status: 201 });
    }) as unknown as typeof fetch;
    const db = new Db({ url: 'http://db', serviceRoleKey: 'k', fetch: fetchFn });
    await expect(db.upsert('t', [{ a: 1 }], 'a')).resolves.toEqual([]);
    expect(prefer).toBe('resolution=merge-duplicates,return=minimal');
  });

  it('selectAll 以 Range 分頁直到不足一頁', async () => {
    const ranges: string[] = [];
    const fetchFn = (async (_url: string | URL | Request, init?: RequestInit) => {
      const range = new Headers(init?.headers).get('Range')!;
      ranges.push(range);
      const from = Number(range.split('-')[0]);
      const rows = from === 0 ? Array.from({ length: 2 }, (_, i) => ({ id: i })) : [{ id: 2 }];
      return new Response(JSON.stringify(rows), { status: 206 });
    }) as unknown as typeof fetch;
    const db = new Db({ url: 'http://db', serviceRoleKey: 'k', fetch: fetchFn, pageSize: 2 });
    const rows = await db.selectAll<{ id: number }>('t', 'select=id');
    expect(rows.map((r) => r.id)).toEqual([0, 1, 2]);
    expect(ranges).toEqual(['0-1', '2-3']);
  });

  it('非 2xx 丟 DbError 並帶狀態碼', async () => {
    const fetchFn = (async () => new Response('{"code":"23502"}', { status: 400 })) as unknown as typeof fetch;
    const db = new Db({ url: 'http://db', serviceRoleKey: 'k', fetch: fetchFn });
    await expect(db.select('t', 'select=*')).rejects.toMatchObject({ name: 'DbError', status: 400 });
  });

  it('update 從 content-range 讀影響列數', async () => {
    const fetchFn = (async () => new Response('', { status: 200, headers: { 'content-range': '0-4/5' } })) as unknown as typeof fetch;
    const db = new Db({ url: 'http://db', serviceRoleKey: 'k', fetch: fetchFn });
    expect(await db.update('t', 'id=eq.1', { a: 1 })).toBe(5);
  });

  it('上傳 Storage 物件時 cache-control 送完整的 max-age（Storage 會原樣當回應標頭）', async () => {
    let headers: Record<string, string> = {};
    const fetchFn = (async (_url: string | URL | Request, init?: RequestInit) => {
      headers = init?.headers as Record<string, string>;
      return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch;
    const db = new Db({ url: 'http://db', serviceRoleKey: 'k', fetch: fetchFn });
    await db.putStorageObject('streams', 'v1/snapshot.json', '{}', 'application/json', '60');
    expect(headers['cache-control']).toBe('max-age=60');
    expect(headers['x-upsert']).toBe('true');
  });

  it('inList 用雙引號包值並跳脫', () => {
    expect(inList(['a', 'b"c'])).toBe('in.("a","b\\"c")');
  });
});

describe('isAuthorized', () => {
  const env = { serviceRoleKey: 'service-key-123', cronSecret: 'cron-secret' };
  const req = (headers: Record<string, string>) => new Request('http://x', { headers });
  it('service_role bearer 或 x-schedule-secret 通過；anon key、空值、長度相同但不同都擋', () => {
    expect(isAuthorized(req({ Authorization: 'Bearer service-key-123' }), env)).toBe(true);
    expect(isAuthorized(req({ 'x-schedule-secret': 'cron-secret' }), env)).toBe(true);
    expect(isAuthorized(req({ Authorization: 'Bearer anon-key-xxxxxxx' }), env)).toBe(false);
    expect(isAuthorized(req({ Authorization: 'Bearer service-key-124' }), env)).toBe(false);
    expect(isAuthorized(req({}), env)).toBe(false);
    expect(isAuthorized(req({ 'x-schedule-secret': 'cron-secret' }), { ...env, cronSecret: null })).toBe(false);
  });
});

describe('mapLimit', () => {
  it('遵守並行上限，預算用完就不再開始新項目', async () => {
    let active = 0;
    let peak = 0;
    const deadline = { at: Date.now() + 10_000 };
    const done = await mapLimit([1, 2, 3, 4, 5], 2, deadline, async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active -= 1;
    });
    expect(done).toBe(5);
    expect(peak).toBe(2);

    const expired = await mapLimit([1, 2, 3], 2, { at: Date.now() - 1 }, async () => {});
    expect(expired).toBe(0);
  });
});
