// Db.upsert 送出前清掉 PostgREST 會拒收的字元（NUL、孤立代理碼）
import { describe, expect, it } from 'vitest';
import { Db } from '../../supabase/functions/_shared/db.ts';

describe('Db.upsert 字串清理', () => {
    it('B4 title 含 NUL 與孤立代理碼時送出的 body 乾淨、合法 emoji 保留', async () => {
        let sent = '';
        const fetchFn = (async (_url: string | URL | Request, init?: RequestInit) => {
            sent = String(init?.body);
            return new Response('', { status: 201 });
        }) as unknown as typeof fetch;
        const db = new Db({ url: 'http://db', serviceRoleKey: 'k', fetch: fetchFn });
        await db.upsert('t', [{ id: 1, title: 'a\u0000b\uD800c 🎮' }], 'id');
        const title: string = JSON.parse(sent)[0].title;
        expect(title).not.toContain('\u0000');
        expect(title.isWellFormed()).toBe(true);
        expect(title).toContain('🎮');
        for (const ch of ['a', 'b', 'c']) expect(title).toContain(ch);
    });
});
