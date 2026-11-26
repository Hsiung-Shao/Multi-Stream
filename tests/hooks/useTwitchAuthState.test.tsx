// useTwitchAuth OAuth 回呼：沒有對應 state 的權杖不可接受（CSRF／權杖注入）
import { beforeEach, describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useTwitchAuth } from '../../src/hooks/useTwitchAuth';

const TOKEN_KEY = 'twitch_user_token';
const STATE_KEY = 'twitch_auth_state';

describe('useTwitchAuth state 驗證', () => {
    beforeEach(() => {
        sessionStorage.clear();
        window.history.replaceState(null, '', '/');
    });

    it('B5 本機沒有 state 但網址帶權杖時，不寫入權杖', () => {
        window.history.replaceState(null, '', '/#access_token=evil&token_type=bearer');
        renderHook(() => useTwitchAuth());
        expect(sessionStorage.getItem(TOKEN_KEY)).not.toBe('evil');
        expect(window.location.hash).not.toContain('access_token'); // 拒收的權杖要從網址清掉，免得 GA4 事件帶出去
    });

    it('B6 state 相符的正常回呼會寫入權杖', () => {
        sessionStorage.setItem(STATE_KEY, 's1');
        window.history.replaceState(null, '', '/#access_token=good&state=s1');
        renderHook(() => useTwitchAuth());
        expect(sessionStorage.getItem(TOKEN_KEY)).toBe('good');
    });
});
