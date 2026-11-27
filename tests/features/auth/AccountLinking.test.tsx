// 帳號綁定 UI（U13、U14，只依介面規格撰寫）：已登入時列出 Twitch／Google／Discord 三列綁定按鈕
// 只 mock 外部 I/O：getSupabase 回傳的假 client
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import i18n from '../../../src/i18n/i18n';

const { client, getSupabase } = vi.hoisted(() => {
    const client = {
        auth: {
            linkIdentity: vi.fn(async (_args: unknown) => ({ data: {}, error: null })),
            getSession: vi.fn(async () => ({ data: { session: null }, error: null })),
            signOut: vi.fn(async () => ({ error: null })),
            onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
        },
        rows: [] as unknown[],
        rpc: vi.fn((_fn: string) => ({ abortSignal: async () => ({ data: client.rows, error: null }) })),
    };
    return { client, getSupabase: vi.fn(async () => client) };
});
vi.mock('../../../src/lib/supabase', () => ({ getSupabase }));

import { AccountSection } from '../../../src/features/auth/AccountSection';
import { useAuthStore } from '../../../src/features/auth/authStore';

const setUser = (providers: string[]) =>
    useAuthStore.setState({ status: 'authed', user: { id: 'u1', displayName: 'Jane', providers } });

// 兩語並容：jsdom 的 i18n 可能解析成英文；用 ^$ 避免「解除綁定 X」被當成「綁定 X」
const linkBtn = (p: string) => screen.getByRole('button', { name: new RegExp(`^(綁定|Link) ${p}$`) });
const unlinkBtn = (p: string) => screen.getByRole('button', { name: new RegExp(`^(解除綁定|Unlink) ${p}$`) });
const hasLinkBtn = (p: string) => screen.queryByRole('button', { name: new RegExp(`^(綁定|Link) ${p}$`) });
const hasUnlinkBtn = (p: string) => screen.queryByRole('button', { name: new RegExp(`^(解除綁定|Unlink) ${p}$`) });

beforeEach(async () => {
    await i18n.changeLanguage('zh-TW');
    client.auth.linkIdentity.mockClear();
    window.sessionStorage.clear();
});

describe('U13 只剩一種登入方式不能解除', () => {
    it('providers 只有 twitch：Twitch 的解除按鈕 disabled，其餘兩個顯示「綁定」', () => {
        setUser(['twitch']);
        render(<AccountSection />);
        expect(unlinkBtn('Twitch')).toBeDisabled();
        expect(hasLinkBtn('Twitch')).toBeNull();
        expect(linkBtn('Google')).toBeEnabled();
        expect(linkBtn('Discord')).toBeEnabled();
        expect(hasUnlinkBtn('Google')).toBeNull();
        expect(hasUnlinkBtn('Discord')).toBeNull();
    });

    it('providers 有兩種：兩個已綁定的解除按鈕都 enabled，第三個顯示「綁定」', () => {
        setUser(['twitch', 'google']);
        render(<AccountSection />);
        expect(unlinkBtn('Twitch')).toBeEnabled();
        expect(unlinkBtn('Google')).toBeEnabled();
        expect(linkBtn('Discord')).toBeEnabled();
    });

    it('三種都綁定：三個解除按鈕都 enabled', () => {
        setUser(['twitch', 'google', 'discord']);
        render(<AccountSection />);
        for (const p of ['Twitch', 'Google', 'Discord']) expect(unlinkBtn(p)).toBeEnabled();
    });
});

describe('U14 綁定帶正確的 provider 與 scopes', () => {
    it('點「綁定 Twitch」：linkIdentity 帶 provider=twitch 與聊天權限 scopes', async () => {
        setUser(['google']);
        render(<AccountSection />);
        fireEvent.click(linkBtn('Twitch'));

        await waitFor(() => expect(client.auth.linkIdentity).toHaveBeenCalledTimes(1));
        const arg = client.auth.linkIdentity.mock.calls[0][0] as { provider: string; options?: { redirectTo?: string; scopes?: string } };
        expect(arg.provider).toBe('twitch');
        expect(arg.options?.scopes).toBe('chat:read chat:edit user:read:emotes');
        expect(arg.options?.redirectTo).toBeTruthy();
    });

    it('點「綁定 Discord」：linkIdentity 帶 provider=discord 且不帶 scopes', async () => {
        setUser(['twitch']);
        render(<AccountSection />);
        fireEvent.click(linkBtn('Discord'));

        await waitFor(() => expect(client.auth.linkIdentity).toHaveBeenCalledTimes(1));
        const arg = client.auth.linkIdentity.mock.calls[0][0] as { provider: string; options?: { scopes?: string } };
        expect(arg.provider).toBe('discord');
        expect(arg.options?.scopes).toBeUndefined();
    });

    it('綁定走 linkIdentity，不會呼叫 signInWithOAuth 或踢人', async () => {
        setUser(['twitch']);
        render(<AccountSection />);
        fireEvent.click(linkBtn('Google'));

        await waitFor(() => expect(client.auth.linkIdentity).toHaveBeenCalledTimes(1));
        expect(client.auth.signOut).not.toHaveBeenCalled();
        expect(window.sessionStorage.getItem('ms_oauth_fresh')).toBeNull();
    });
});

describe('review 第 1 輪：我的投稿狀態對應', () => {
    it('spam／duplicate／wontfix 顯示未採用、archived 顯示已結案、edit 類型顯示 VTuber', async () => {
        client.rows = [
            { kind: 'report', id: 'r1', created_at: '2026-11-01T00:00:00Z', status: 'spam', title: '回報甲' },
            { kind: 'report', id: 'r2', created_at: '2026-11-02T00:00:00Z', status: 'duplicate', title: '回報乙' },
            { kind: 'feedback', id: 'f1', created_at: '2026-11-03T00:00:00Z', status: 'archived', title: '意見丙' },
            { kind: 'edit', id: 'c1', created_at: '2026-11-04T00:00:00Z', status: 'pending', title: '修改丁' },
            { kind: 'report', id: 'r3', created_at: '2026-11-05T00:00:00Z', status: 'wontfix', title: '回報戊' },
        ];
        setUser(['twitch']);
        render(<AccountSection />);
        const row = async (title: string) => (await screen.findByText(title)).closest('li') as HTMLElement;
        expect((await row('回報甲')).textContent).toContain('未採用');
        expect((await row('回報乙')).textContent).toContain('未採用');
        expect((await row('意見丙')).textContent).toContain('已結案');
        expect((await row('修改丁')).textContent).toContain('VTuber');
        expect((await row('回報戊')).textContent).toContain('未採用');
    });
});
