// D3：只有弱比對（名稱片段巧合）時不可自動寫入 X 帳號，要送審；強證據（帳號＝YouTube handle、名稱完全相同）照常寫入
import { describe, expect, it } from 'vitest';
import { decideHandle } from '../../scripts/schedule-posts/lib/xhandles.mjs';

const VTUBER = '仙杜波拉 Cinderpola';
const checked = (screenName: string, name: string, description = '') => [
  { handle: screenName, profile: { ok: true as const, user: { screen_name: screenName, name, description } } },
];

describe('decideHandle 弱比對防誤寫', () => {
  it('D3a 只有名稱片段巧合（畫師帳號）時改送審', () => {
    const r = decideHandle(VTUBER, ['artist'], checked('artist', '仙杜波拉のママ'), 'cinderpola');
    expect(r.action).toBe('review');
  });

  it('D3b 帳號與 YouTube handle 相同時照常寫入', () => {
    const r = decideHandle(VTUBER, ['cinderpola'], checked('cinderpola', '完全不同的顯示名稱'), 'cinderpola');
    expect(r).toMatchObject({ action: 'write', handle: 'cinderpola' });
  });

  it('D3c 顯示名稱與 VTuber 名完全相同時照常寫入', () => {
    const r = decideHandle(VTUBER, ['someone_else'], checked('someone_else', '仙杜波拉 Cinderpola'), 'cinderpola');
    expect(r).toMatchObject({ action: 'write', handle: 'someone_else' });
  });
});
