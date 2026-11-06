// 後台歌回編輯器：觀眾剪輯來源與每段合唱者的載入、增刪與存檔 body（FE9）
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import i18n from '../../../src/i18n/i18n';
import { SongVideoEditor } from '../../../src/features/admin/components/SongVideoEditor';
import { resetRestConfigCache } from '../../../src/features/schedule/restClient';

vi.mock('../../../src/utils/apiLoader', () => ({ apiLoader: { loadYouTubePlayerApi: vi.fn(async () => undefined) } }));

const VID = '11111111-1111-4111-8111-111111111111';
const VIDEO = 'dQw4w9WgXcQ';
const SEG1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SEG2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const OWNER = '33333333-3333-4333-8333-333333333333';
const VT2 = '22222222-2222-4222-8222-222222222222';
const VT3 = '44444444-4444-4444-8444-444444444444';

type Performer = { vtuber_id: string | null; name: string | null };
const seg = (id: string, code: string, start: number, title: string, performers: Performer[]) => ({
    id, code, video_ref: VID, song_id: 1, start_seconds: start, end_seconds: start + 100, title, original_artist: null, version_note: null, position: 0, performers,
});

let videoRecord: Record<string, unknown>;
let segments: ReturnType<typeof seg>[];
let calls: { url: string; method: string; body: any }[] = [];

const saveCalls = () => calls.filter((c) => c.method === 'PUT' && c.url.startsWith('/api/admin/songs'));

beforeAll(async () => {
    await i18n.changeLanguage('zh-TW');
});

beforeEach(() => {
    resetRestConfigCache();
    calls = [];
    localStorage.setItem('ms_admin_api_token', 'tok');
    videoRecord = {
        id: VID, video_id: VIDEO, title: '歌回標題', vtuber_id: OWNER, streamed_at: '2026-10-01T12:00:00Z',
        duration_seconds: 5400, status: 'draft', created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z',
        clip_channel_name: null, clip_channel_url: null,
    };
    segments = [
        seg(SEG1, 'code0001', 10, '歌A', []),
        seg(SEG2, 'code0002', 200, '歌B', []),
    ];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? 'GET';
        calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : null });
        if (url.includes('/api/admin/song-library')) return new Response(JSON.stringify({ ok: true, data: [] }));
        if (url.startsWith('/api/admin/songs') && (method === 'GET' || method === 'PUT')) {
            return new Response(JSON.stringify({ ok: true, video: videoRecord, segments }));
        }
        if (url.startsWith('/api/supabase-config')) return new Response(JSON.stringify({ url: 'https://db.example.co', anonKey: 'anon' }));
        if (url.includes('/rest/v1/vtubers')) {
            const rows = [{ id: OWNER, name: '主唱測試', img_url: null }, { id: VT2, name: '月見合唱', img_url: null }, { id: VT3, name: '路過合唱', img_url: null }].filter((r) => url.includes(r.id));
            return new Response(JSON.stringify(rows));
        }
        return new Response('[]');
    }));
});

afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
});

function renderEditor() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
        <QueryClientProvider client={client}>
            <SongVideoEditor id={VID} playerEnabled={false} onClose={vi.fn()} onSaved={vi.fn()} />
        </QueryClientProvider>,
    );
}
const loaded = () => waitFor(() => expect(screen.getByRole('textbox', { name: '第 1 首歌名' })).toHaveValue('歌A'));
const clipBox = () => screen.getByRole('checkbox', { name: '這是觀眾剪輯' });
const clipName = () => screen.getByRole('textbox', { name: '剪輯頻道名稱' });
const clipUrl = () => screen.getByRole('textbox', { name: '剪輯頻道網址' });
async function save() {
    const btn = screen.getByRole('button', { name: '存成草稿' });
    await waitFor(() => expect(btn).toBeEnabled());
    fireEvent.click(btn);
    await waitFor(() => expect(saveCalls()).toHaveLength(1));
    return saveCalls()[0].body;
}
/** 在第 n 列（1 起算）加一位站外合唱者 */
async function addOutside(n: number, name: string) {
    fireEvent.click(screen.getAllByRole('button', { name: '新增合唱' })[n - 1]);
    fireEvent.change(await screen.findByRole('textbox', { name: /站外名字/ }), { target: { value: name } });
    fireEvent.click(screen.getByRole('button', { name: '加入' }));
    expect(await screen.findByRole('button', { name: `移除合唱 ${name}` })).toBeInTheDocument();
}

describe('FE9 SongVideoEditor 剪輯來源', () => {
    it('FE9 沒有剪輯來源的影片：勾選框未勾、不顯示欄位，存檔兩欄都是 null', async () => {
        renderEditor();
        await loaded();
        expect(clipBox()).not.toBeChecked();
        expect(screen.queryByRole('textbox', { name: '剪輯頻道名稱' })).toBeNull();
        const body = await save();
        expect(body.clip_channel_name).toBeNull();
        expect(body.clip_channel_url).toBeNull();
    });

    it('FE9 載入既有剪輯來源：勾選框已勾，兩欄帶入現值', async () => {
        videoRecord.clip_channel_name = '舊剪輯頻道';
        videoRecord.clip_channel_url = 'https://www.youtube.com/@old';
        renderEditor();
        await loaded();
        expect(clipBox()).toBeChecked();
        expect(clipName()).toHaveValue('舊剪輯頻道');
        expect(clipUrl()).toHaveValue('https://www.youtube.com/@old');
    });

    it('FE9 勾選並填兩欄後存檔，body 帶 clip_channel_name／clip_channel_url（trim 後）', async () => {
        renderEditor();
        await loaded();
        fireEvent.click(clipBox());
        fireEvent.change(clipName(), { target: { value: '  新剪輯頻道 ' } });
        fireEvent.change(clipUrl(), { target: { value: ' https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv ' } });
        const body = await save();
        expect(body.clip_channel_name).toBe('新剪輯頻道');
        expect(body.clip_channel_url).toBe('https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv');
    });

    it('FE9 取消勾選後存檔，兩欄變 null（用來清除既有剪輯來源）', async () => {
        videoRecord.clip_channel_name = '舊剪輯頻道';
        videoRecord.clip_channel_url = 'https://www.youtube.com/@old';
        renderEditor();
        await loaded();
        fireEvent.click(clipBox());
        expect(clipBox()).not.toBeChecked();
        const body = await save();
        expect(body.clip_channel_name).toBeNull();
        expect(body.clip_channel_url).toBeNull();
    });
});

describe('FE9 SongVideoEditor 合唱者', () => {
    it('FE9 載入既有合唱者以 chip 顯示（站內顯示 VTuber 名稱）', async () => {
        segments[0] = seg(SEG1, 'code0001', 10, '歌A', [{ vtuber_id: VT2, name: null }, { vtuber_id: null, name: '站外歌手' }]);
        renderEditor();
        await loaded();
        expect(await screen.findByRole('button', { name: '移除合唱 月見合唱' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: '移除合唱 站外歌手' })).toBeInTheDocument();
    });

    it('FE9 沒動合唱者就存檔：每個片段原樣帶回 performers，不會抹掉', async () => {
        segments[0] = seg(SEG1, 'code0001', 10, '歌A', [{ vtuber_id: VT2, name: null }, { vtuber_id: null, name: '站外歌手' }]);
        renderEditor();
        await loaded();
        await screen.findByRole('button', { name: '移除合唱 站外歌手' });
        const body = await save();
        const first = body.segments[0].performers as Performer[];
        expect(first).toHaveLength(2);
        expect(first[0]).toMatchObject({ vtuber_id: VT2 });
        expect(first[1]).toEqual({ vtuber_id: null, name: '站外歌手' });
        expect(body.segments[1].performers).toEqual([]);
    });

    it('FE9 在指定片段加站外合唱者，只有該片段的 body 帶這位', async () => {
        renderEditor();
        await loaded();
        await addOutside(2, '新來的歌手');
        const body = await save();
        expect(body.segments[0].performers).toEqual([]);
        expect(body.segments[1].performers).toEqual([{ vtuber_id: null, name: '新來的歌手' }]);
    });

    it('FE9 加站內合唱者（貼 uuid）後存檔，body 帶 vtuber_id', async () => {
        renderEditor();
        await loaded();
        fireEvent.click(screen.getAllByRole('button', { name: '新增合唱' })[0]);
        // 影片 VTuber 已選定，剩下的搜尋框就是合唱者的
        fireEvent.change(await screen.findByRole('textbox', { name: '搜尋 VTuber 名稱' }), { target: { value: VT3 } });
        expect(await screen.findByRole('button', { name: '移除合唱 路過合唱' })).toBeInTheDocument();
        const body = await save();
        expect(body.segments[0].performers).toHaveLength(1);
        expect(body.segments[0].performers[0]).toMatchObject({ vtuber_id: VT3 });
    });

    it('FE9 移除既有合唱者後存檔，該片段 performers 少掉這位（空陣列代表清除）', async () => {
        segments[0] = seg(SEG1, 'code0001', 10, '歌A', [{ vtuber_id: null, name: '站外歌手' }]);
        renderEditor();
        await loaded();
        fireEvent.click(await screen.findByRole('button', { name: '移除合唱 站外歌手' }));
        await waitFor(() => expect(screen.queryByRole('button', { name: '移除合唱 站外歌手' })).toBeNull());
        const body = await save();
        expect(body.segments[0].performers).toEqual([]);
    });

    it('FE9 合唱者與剪輯來源一起存檔，其他欄位（id、標題）照舊', async () => {
        renderEditor();
        await loaded();
        await addOutside(1, '合唱甲');
        fireEvent.click(clipBox());
        fireEvent.change(clipName(), { target: { value: '剪輯乙' } });
        fireEvent.change(clipUrl(), { target: { value: 'https://www.youtube.com/@yi' } });
        const body = await save();
        expect(body).toMatchObject({ video_id: VIDEO, title: '歌回標題', clip_channel_name: '剪輯乙', clip_channel_url: 'https://www.youtube.com/@yi' });
        expect(body.segments.map((s: { id: string }) => s.id)).toEqual([SEG1, SEG2]);
        expect(body.segments[0].performers).toEqual([{ vtuber_id: null, name: '合唱甲' }]);
    });
});
