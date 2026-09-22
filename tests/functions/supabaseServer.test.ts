// functions/lib/supabase-server.js 的回應解析：Prefer: return=minimal 的成功回應是空 body，
// 以前無條件 res.json() 會丟 SyntaxError，讓「其實已寫入」的 upsert 回報失敗
//（memory error_postgrest_upsert_not_null_and_empty_body；當初只修在 next 分支）。
import { describe, it, expect, vi, afterEach } from 'vitest';
// @ts-expect-error functions 目錄的 ESM JS 無型別宣告
import { upsert, select } from '../../functions/lib/supabase-server.js';

const ENV = { SUPABASE_URL: 'https://sb.example', SUPABASE_SERVICE_ROLE_KEY: 'k' };

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('supabase-server 回應解析', () => {
    it('upsert 成功但空 body（return=minimal）→ ok: true', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 201 })));
        const res = await upsert(ENV, 'youtube_live_status', [{ channel_id: 'x' }], { onConflict: 'channel_id' });
        expect(res).toMatchObject({ ok: true, status: 201, data: null, error: null });
    });

    it('有 JSON body → 解析成 data', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response('[{"a":1}]', { status: 200 })));
        const res = await select(ENV, 'youtube_live_status?select=*');
        expect(res).toMatchObject({ ok: true, data: [{ a: 1 }] });
    });

    it('失敗 → ok: false，error 為回應文字', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response('{"code":"42501"}', { status: 403 })));
        const res = await upsert(ENV, 't', [{}]);
        expect(res).toMatchObject({ ok: false, status: 403, data: null, error: '{"code":"42501"}' });
    });
});
