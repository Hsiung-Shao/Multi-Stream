// 後台歌回編輯器 v1.3（C2）：版本備註存檔／核准、歌名原唱改動後 debounce 呼叫配對預覽並顯示標籤、取代時保留舊備註
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import i18n from '../../../src/i18n/i18n';
import { SongVideoEditor } from '../../../src/features/admin/components/SongVideoEditor';

vi.mock('../../../src/utils/apiLoader', () => ({ apiLoader: { loadYouTubePlayerApi: vi.fn(async () => undefined) } }));

const VID = '11111111-1111-4111-8111-111111111111';
const VIDEO = 'dQw4w9WgXcQ';
const SEG1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SEG2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const SEG3 = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

const seg = (id: string, code: string, start: number, title: string, artist: string | null, note: string | null) => ({
    id, code, video_ref: VID, song_id: 1, start_seconds: start, end_seconds: start + 100, title, original_artist: artist, version_note: note, position: 0,
});
const videoRecord = {
    id: VID, video_id: VIDEO, title: '歌回標題', vtuber_id: null, streamed_at: '2026-10-01T12:00:00Z',
    duration_seconds: 5400, status: 'draft', created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z',
};

type Call = { url: string; method: string; body: any };
let calls: Call[] = [];
let segments: ReturnType<typeof seg>[];
let matchResponse: (items: any[]) => unknown[];

const matchCalls = () => calls.filter((c) => c.url.includes('/api/admin/song-library') && c.url.includes('action=match'));
const saveCalls = () => calls.filter((c) => c.method === 'PUT' && c.url.startsWith('/api/admin/songs'));

function stubFetch(extra?: (url: string, method: string) => Response | null) {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? 'GET';
        const body = init?.body ? JSON.parse(String(init.body)) : null;
        calls.push({ url, method, body });
        const custom = extra?.(url, method);
        if (custom) return custom;
        if (url.includes('/api/admin/song-library') && url.includes('action=match')) {
            return new Response(JSON.stringify({ ok: true, data: matchResponse(body.items) }));
        }
        if (url.startsWith('/api/admin/songs') && method === 'GET') return new Response(JSON.stringify({ ok: true, video: videoRecord, segments }));
        if (url.startsWith('/api/admin/songs') && method === 'PUT') return new Response(JSON.stringify({ ok: true, video: videoRecord, segments }));
        if (url.startsWith('/api/supabase-config')) return new Response(JSON.stringify({ url: 'https://db.example.co', anonKey: 'anon' }));
        return new Response('[]');
    }));
}

beforeAll(async () => {
    await i18n.changeLanguage('zh-TW');
});

beforeEach(() => {
    calls = [];
    localStorage.setItem('ms_admin_api_token', 'tok');
    segments = [
        seg(SEG1, 'code0001', 10, '歌A', '原唱A', '練歌版'),
        seg(SEG2, 'code0002', 200, '歌B', '原唱B', '舊備註'),
        seg(SEG3, 'code0003', 400, '歌C', null, null),
    ];
    matchResponse = (items) => items.map(() => ({ status: 'new', song_id: null, song: null, similar: [] }));
    stubFetch();
});
afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    localStorage.clear();
});

function renderEditor(props: { id?: string | null } = { id: VID }) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
        <QueryClientProvider client={client}>
            <SongVideoEditor id={props.id ?? null} playerEnabled={false} onClose={vi.fn()} onSaved={vi.fn()} />
        </QueryClientProvider>,
    );
}

const noteBoxes = () =>
    screen.getAllByRole('textbox').filter((el) => {
        const name = el.getAttribute('aria-label') ?? '';
        return name.includes('備註') && !/駁回|審核|來源|投稿/.test(name);
    });
const noteValues = () => noteBoxes().map((b) => (b as HTMLInputElement).value);
const loaded = async (title = '歌A') => {
    await waitFor(() => expect(screen.getByRole('textbox', { name: '第 1 首歌名' })).toHaveValue(title));
};

describe('SongVideoEditor 版本備註存檔（C2）', () => {
    it('載入既有片段的備註到備註欄', async () => {
        renderEditor();
        await loaded();
        expect(noteValues()).toEqual(['練歌版', '舊備註', '']);
    });

    it('存檔送出的每個片段帶 version_note：沒動保留、改成空白變 null、前後空白被 trim', async () => {
        renderEditor();
        await loaded();
        fireEvent.change(noteBoxes()[1], { target: { value: '   ' } });
        fireEvent.change(noteBoxes()[2], { target: { value: '  合唱 ' } });
        const save = screen.getByRole('button', { name: '存成草稿' });
        await waitFor(() => expect(save).toBeEnabled());
        fireEvent.click(save);
        await waitFor(() => expect(saveCalls()).toHaveLength(1));
        const sent = saveCalls()[0].body.segments as { id: string; version_note: string | null }[];
        expect(sent.map((s) => [s.id, s.version_note])).toEqual([[SEG1, '練歌版'], [SEG2, null], [SEG3, '合唱']]);
    });

    it('備註超過 30 字：該列顯示錯誤、存檔鍵停用', async () => {
        renderEditor();
        await loaded();
        fireEvent.change(noteBoxes()[0], { target: { value: '字'.repeat(31) } });
        expect(screen.getAllByText(/備註最多 30 字/).length).toBeGreaterThan(0);
        expect(screen.getByRole('button', { name: '存成草稿' })).toBeDisabled();
        expect(saveCalls()).toHaveLength(0);
    });
});

describe('SongVideoEditor 取代時保留舊備註（L9 整合）', () => {
    it('貼上同開始時間的時間軸取代後，每列沿用對回的舊片段備註；新增的列沒有備註', async () => {
        renderEditor();
        await loaded();
        const text = ['0:10-1:50 歌A新 / 原唱A', '3:20-5:00 歌B新 / 原唱B', '6:40-8:20 歌C新', '9:00-10:00 全新歌'].join('\n');
        fireEvent.change(screen.getByRole('textbox', { name: '時間軸文字' }), { target: { value: text } });
        fireEvent.click(screen.getByRole('button', { name: /取代現有片段/ }));
        await waitFor(() => expect(screen.getByRole('textbox', { name: '第 1 首歌名' })).toHaveValue('歌A新'));
        expect(screen.getByRole('textbox', { name: '第 4 首歌名' })).toHaveValue('全新歌');
        expect(noteValues()).toEqual(['練歌版', '舊備註', '', '']);
    });
});

describe('SongVideoEditor 配對預覽（C2）', () => {
    const fakeTimers = () => vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ['setTimeout', 'clearTimeout'] });
    const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
    const matchWith = (title: string) => matchCalls().filter((c) => (c.body.items as { title: string }[]).some((i) => i.title === title));

    it('改歌名後約 600ms 才 POST match，body 帶 segment_id、title、original_artist', async () => {
        fakeTimers();
        renderEditor();
        await loaded();
        await advance(1000);
        fireEvent.change(screen.getByRole('textbox', { name: '第 1 首歌名' }), { target: { value: '新歌名' } });
        await advance(300);
        expect(matchWith('新歌名')).toHaveLength(0);
        await advance(500);
        await waitFor(() => expect(matchWith('新歌名')).toHaveLength(1));
        const call = matchWith('新歌名')[0];
        expect(call.method).toBe('POST');
        expect(call.url).toContain('/api/admin/song-library?action=match');
        expect(call.body.items[0]).toEqual({ segment_id: SEG1, title: '新歌名', original_artist: '原唱A' });
    });

    it('連續輸入只送最後一次（debounce 會合併）', async () => {
        fakeTimers();
        renderEditor();
        await loaded();
        await advance(1000);
        const box = screen.getByRole('textbox', { name: '第 1 首歌名' });
        fireEvent.change(box, { target: { value: '半' } });
        await advance(300);
        fireEvent.change(box, { target: { value: '完整歌名' } });
        await advance(900);
        await waitFor(() => expect(matchWith('完整歌名')).toHaveLength(1));
        expect(matchWith('半')).toHaveLength(0);
    });

    it('改原唱也會觸發配對', async () => {
        fakeTimers();
        renderEditor();
        await loaded();
        await advance(1000);
        fireEvent.change(screen.getByRole('textbox', { name: '第 1 首原唱' }), { target: { value: '換原唱' } });
        await advance(900);
        await waitFor(() => expect(matchCalls().some((c) => c.body.items[0].original_artist === '換原唱')).toBe(true));
    });

    it('拿到回應後，existing／new／similar 三種標籤各自顯示在對應列', async () => {
        fakeTimers();
        matchResponse = (items) => items.map((it) => {
            if (it.title === '甲') return { status: 'existing', song_id: 9, song: { id: 9, title: '甲', artist: '原唱A', versions: 3 }, similar: [] };
            if (it.title === '丙') return { status: 'similar', song_id: null, song: null, similar: [{ id: 5, title: '丙', artist: null, versions: 2 }] };
            return { status: 'new', song_id: null, song: null, similar: [] };
        });
        renderEditor();
        await loaded();
        await advance(1000);
        fireEvent.change(screen.getByRole('textbox', { name: '第 1 首歌名' }), { target: { value: '甲' } });
        fireEvent.change(screen.getByRole('textbox', { name: '第 2 首歌名' }), { target: { value: '乙' } });
        fireEvent.change(screen.getByRole('textbox', { name: '第 3 首歌名' }), { target: { value: '丙' } });
        await advance(900);
        expect(await screen.findByText('已配對：甲（3 個版本）')).toBeInTheDocument();
        expect(screen.getByText('新歌曲')).toBeInTheDocument();
        expect(screen.getByText('新歌曲・同名：丙／未填原唱（2）')).toBeInTheDocument();
    });
});

describe('SongVideoEditor 存檔帶 end_estimated（C11）', () => {
    it('C11 估計列存 true、使用者改過結束時間的列存 false', async () => {
        stubFetch((url) =>
            url.includes('/api/songs/lengths')
                ? new Response(JSON.stringify({ ok: true, items: [{ seconds: null, source: 'miss' }, { seconds: null, source: 'miss' }, { seconds: null, source: 'miss' }] }))
                : null,
        );
        renderEditor();
        await loaded();
        // 開始時間對回舊片段，取代時不會跳出「移除已存檔片段」確認
        fireEvent.change(screen.getByRole('textbox', { name: '時間軸文字' }), { target: { value: '0:10 歌X / 手X\n3:20 歌Y / 手Y\n6:40 歌Z / 手Z' } });
        fireEvent.click(screen.getByRole('button', { name: /取代現有片段/ }));
        await waitFor(() => expect(screen.getByRole('textbox', { name: '第 1 首歌名' })).toHaveValue('歌X'));
        fireEvent.change(screen.getByRole('textbox', { name: '第 2 首結束時間' }), { target: { value: '5:00' } });

        const save = screen.getByRole('button', { name: '存成草稿' });
        await waitFor(() => expect(save).toBeEnabled());
        fireEvent.click(save);
        await waitFor(() => expect(saveCalls()).toHaveLength(1));
        const sent = saveCalls()[0].body.segments as { title: string; end_estimated: boolean }[];
        expect(sent.map((s) => [s.title, s.end_estimated])).toEqual([['歌X', true], ['歌Y', false], ['歌Z', true]]);
    });
});
