import { describe, it, expect } from 'vitest';
import { parseTimeline, parseTimelineDetailed } from '../../../src/features/songs/lib/timelineParser';

describe('parseTimeline', () => {
    it('時間軸文字拆成多首', () => {
        const rows = parseTimeline('0:00 歌A / 原唱A\n3:30 歌B / 原唱B\n7:45 歌C / 原唱C');
        expect(rows).toHaveLength(3);
        expect(rows.map((r) => r.start)).toEqual([0, 210, 465]);
        expect(rows.map((r) => r.title)).toEqual(['歌A', '歌B', '歌C']);
        expect(rows.map((r) => r.artist)).toEqual(['原唱A', '原唱B', '原唱C']);
    });

    it('支援 " - " 與 " by " 分隔，無分隔時 artist 為 null', () => {
        const rows = parseTimeline('0:00 Song A - Artist A\n1:00 Song B BY Artist B\n2:00 只有歌名');
        expect(rows[0]).toMatchObject({ title: 'Song A', artist: 'Artist A' });
        expect(rows[1]).toMatchObject({ title: 'Song B', artist: 'Artist B' });
        expect(rows[2]).toMatchObject({ title: '只有歌名', artist: null });
    });

    it('歌名中的連字號（前後無空白）不被當成分隔符', () => {
        const rows = parseTimeline('0:00 Spider-Man');
        expect(rows[0]).toMatchObject({ title: 'Spider-Man', artist: null });
    });

    it('缺結束時間取下一首開始，最後一列 end 為 null', () => {
        const rows = parseTimeline('0:00 A\n3:30 B\n7:45 C');
        expect(rows[0].end).toBe(210);
        expect(rows[1].end).toBe(465);
        expect(rows[2].end).toBeNull();
    });

    it('全形符號與編號正規化', () => {
        const [full] = parseTimeline('０１．１２：３４ 歌名／原唱');
        expect(full).toMatchObject({ start: 754, title: '歌名', artist: '原唱' });

        const rows = parseTimeline('#2 13:00 X\n3) 14:00 Y');
        expect(rows[0]).toMatchObject({ start: 780, title: 'X' });
        expect(rows[1]).toMatchObject({ start: 840, title: 'Y' });
    });

    it('區間寫法取兩端', () => {
        const [a] = parseTimeline('12:34-15:00 歌名');
        expect(a).toMatchObject({ start: 754, end: 900, title: '歌名' });
        const [b] = parseTimeline('12:34 ~ 15:00 歌名');
        expect(b).toMatchObject({ start: 754, end: 900, title: '歌名' });
    });

    it('沒時間的行略過，line 為原始 0-based 行號', () => {
        const rows = parseTimeline('【歌單】\n\n0:00 A\n\n3:00 B');
        expect(rows).toHaveLength(2);
        expect(rows.map((r) => r.line)).toEqual([2, 4]);
        expect(rows.map((r) => r.title)).toEqual(['A', 'B']);
    });

    it('時間後接 - 歌名時去掉前導破折號', () => {
        expect(parseTimeline('00:00 - Opening')[0]).toMatchObject({ title: 'Opening', artist: null });
        expect(parseTimeline('12:34 - Song / Artist')[0]).toMatchObject({ title: 'Song', artist: 'Artist' });
        expect(parseTimeline('12:34 – Song')[0]).toMatchObject({ title: 'Song', artist: null });
    });

    it('歌名本身以 - 開頭時保留，分隔符後有空白才剝掉', () => {
        expect(parseTimeline('00:00 -ERROR-')[0]).toMatchObject({ title: '-ERROR-', artist: null });
        expect(parseTimeline('00:00 - Opening')[0]).toMatchObject({ title: 'Opening', artist: null });
        expect(parseTimeline('00:00 | Song')[0]).toMatchObject({ title: 'Song', artist: null });
        expect(parseTimeline('00:00 —Song')[0]).toMatchObject({ title: '—Song', artist: null });
    });

    it('支援〜區間與括號包住的時間', () => {
        expect(parseTimeline('17:00〜18:00 歌')[0]).toMatchObject({ start: 1020, end: 1080, title: '歌' });
        for (const line of ['[19:00] 歌2', '(19:00) 歌2', '【19:00】歌2']) {
            expect(parseTimeline(line)[0], line).toMatchObject({ start: 1140, title: '歌2' });
        }
    });

    it('看似時間卻解析失敗的行回報在 unparsed', () => {
        const text = '00:10 A\n中間 12:34 不在行首\n12:34-12:75 壞區間\n20:00 B';
        const { rows, unparsed } = parseTimelineDetailed(text);
        expect(rows.map((r) => r.title)).toEqual(['A', 'B']);
        expect(rows[0].end).toBe(1200);
        expect(unparsed).toEqual([1, 2]);
        // parseTimeline 仍等於 .rows
        expect(parseTimeline(text)).toEqual(rows);
    });

    it('純文字標題行與空行不進 unparsed', () => {
        const { rows, unparsed } = parseTimelineDetailed('【歌單】\n\n00:10 A\n感謝收看');
        expect(rows).toHaveLength(1);
        expect(unparsed).toEqual([]);
    });
});

// ---------- v1.2：歌名保留原文、重唱子行、時間軸段落標題停止 ----------

// 真實樣本（煦Hiyori 熱門留言）：數學粗體編號、└├ 子行、後半是聊天用的「時間軸」段落
const HIYORI = [
    '煦老大開台辛苦了，沒想到在星期六的晚上可以聽到煦老大的歌聲，祝煦老大的舌頭早日恢復',
    '【【歌回】休假完回來唱歌了！但我有點大舌頭因為我燙到舌頭｜煦Hiyori ﻿歌單 Songlist】',
    '𝟎𝟏. 14:34 甲乙丙丁 / 李佳薇',
    '𝟎𝟐. 27:22 等一個人 / 林芯儀  ',
    '𝟎𝟑. 36:37 不愛就不愛 / 李艾薇',
    ' └ 35:28 不愛就不愛 / 李艾薇 (煦:口水要流出來了)',
    '𝟎𝟒. 57:45 道聽塗說 / 林芯儀',
    ' └ 56:14 道聽塗說 / 林芯儀 (煦:我口水啦)',
    '𝟎𝟓. 1:03:57 聽見下雨的聲音 / 魏如昀',
    '𝟎𝟔. 1:10:38 少一點天份 / 孫盛希',
    '𝟎𝟕. 1:16:17 慢冷 / 梁靜茹',
    '𝟎𝟖. 1:24:26 我想要擁有你 / 小男孩樂團',
    '𝟎𝟗. 1:30:39 海嶼你 / 馬也',
    ' └ 1:30:15 海嶼你',
    '𝟏𝟎. 1:37:52 訣愛 / 詹雯婷',
    ' └ 1:37:10 訣愛 / 詹雯婷',
    '𝟏𝟏. 1:43:35 愛，存在 / 魏奇奇',
    '𝟏𝟐. 1:53:09 說說話 / 王靖雯不胖',
    '𝟏𝟑. 1:59:53 想你時風起 / 單依純',
    ' ├ 1:59:12 想你時風起 / 單依純',
    ' └ 2:16:27 想你時風起 (煦有禮練歌版)',
    '𝟏𝟒. 2:08:20 心訊 Heart Signal / 煦Hiyori',
    ' └ 2:34:39 肚主播的心訊',
    '【 時間軸||Timestamp】',
    '3:27 開始',
    '3:32 煦老大打招呼',
    '4:39 煦有理的無線滑鼠',
    '19:53 ~ 23:01 煦有禮的台語小教室',
    '25:31 - 26:13 Sachi:我笑完再幫你呼',
    '2:47:40 轉ED',
].join('\n');

describe('parseTimeline 歌名保留原文（v1.2）', () => {
    it('歌名保留原文標點，只正規化前綴的編號與時間', () => {
        const [row] = parseTimeline('𝟏𝟏. 1:43:35 愛，存在 / 魏奇奇');
        expect(row).toMatchObject({ start: 6215, title: '愛，存在', artist: '魏奇奇' });
    });

    it('全形「／」分隔時原唱照樣切開，歌名與原唱各自保留全形標點', () => {
        const [row] = parseTimeline('0:10 你好！（現場版）／ 某人～Ａ');
        expect(row).toMatchObject({ start: 10, title: '你好！（現場版）', artist: '某人～Ａ' });
    });

    it('歌名裡的全形英數不被轉成半形', () => {
        const [row] = parseTimeline('0:00 ＡＢＣ');
        expect(row.title).toBe('ＡＢＣ');
    });
});

describe('parseTimelineDetailed 重唱子行與停止（v1.2）', () => {
    it('重唱子行（└ ├ │）算其他版本：不產生列、不進 unparsed、行號進 variants', () => {
        const r = parseTimelineDetailed('0:10 A\n └ 0:05 A (另一版)\n ├ 0:06 A\n│ 0:07 A\n1:00 B');
        expect(r.rows.map((x) => x.title)).toEqual(['A', 'B']);
        expect(r.unparsed).toEqual([]);
        expect(r.variants).toEqual([1, 2, 3]);
        // 子行不影響「下一首開始」
        expect(r.rows[0].end).toBe(60);
    });

    it('遇到時間軸段落標題就停止，之後的行不進 rows／unparsed／variants（真實樣本）', () => {
        const r = parseTimelineDetailed(HIYORI);
        expect(r.rows).toHaveLength(14);
        expect(r.rows[0]).toMatchObject({ start: 874, title: '甲乙丙丁', artist: '李佳薇' });
        expect(r.rows[2]).toMatchObject({ start: 2197, title: '不愛就不愛', end: 3465 });
        expect(r.rows[13]).toMatchObject({ start: 7700, title: '心訊 Heart Signal', artist: '煦Hiyori', end: null });
        expect(r.stoppedAt).toBe(23);
        expect(r.unparsed).toEqual([]);
        expect(r.variants).toEqual([5, 7, 13, 15, 19, 20, 22]);
    });

    it('沒有停止時 stoppedAt 為 null', () => {
        expect(parseTimelineDetailed('0:10 A\n1:00 B').stoppedAt).toBeNull();
    });

    it('開頭的歌單標題含「歌單」不會停止；尚未有列前的「時間軸」標題行也不停止', () => {
        const a = parseTimelineDetailed('【歌回 歌單 Songlist】\n0:10 A\n1:00 B');
        expect(a.rows).toHaveLength(2);
        expect(a.stoppedAt).toBeNull();

        const b = parseTimelineDetailed('【時間軸 Timestamp】\n0:10 A\n1:00 B');
        expect(b.rows).toHaveLength(2);
        expect(b.stoppedAt).toBeNull();
        expect(b.unparsed).toEqual([]);
    });

    it('timestamp 不分大小寫、タイムスタンプ 也停止（後續時間重新起算時）', () => {
        expect(parseTimelineDetailed('0:10 A\nTIMESTAMP\n0:05 B').stoppedAt).toBe(1);
        expect(parseTimelineDetailed('0:10 A\nタイムスタンプ\n0:05 B').rows).toHaveLength(1);
    });

    it('含時間樣式的行即使有「時間軸」字樣也不當成停止標題', () => {
        const r = parseTimelineDetailed('0:10 A\n1:00 時間軸的歌\n2:00 C');
        expect(r.stoppedAt).toBeNull();
        expect(r.rows.map((x) => x.title)).toEqual(['A', '時間軸的歌', 'C']);
    });

    it('時間後的全形分隔符也會剝掉，分隔符後沒空白則保留', () => {
        expect(parseTimeline('00:00 － Opening')[0]).toMatchObject({ title: 'Opening', artist: null });
        expect(parseTimeline('00:00 ： 歌名')[0]).toMatchObject({ title: '歌名', artist: null });
        expect(parseTimeline('00:00 －ERROR－')[0]).toMatchObject({ title: '－ERROR－', artist: null });
    });

    it('中段「後半時間軸」標題不會讓解析停止（後面時間比已解析的更晚）', () => {
        const r = parseTimelineDetailed('前半時間軸\n0:10:00 歌1\n後半時間軸\n1:30:00 歌2');
        expect(r.rows.map((x) => x.title)).toEqual(['歌1', '歌2']);
        expect(r.stoppedAt).toBeNull();
        expect(r.unparsed).toEqual([]);
    });

    it('標題後的時間重新起算（≤ 已解析最後一首的開始）才停止', () => {
        const r = parseTimelineDetailed('1:00 A\n2:00 B\n時間軸\n0:05 聊天\n3:00 C');
        expect(r.rows.map((x) => x.title)).toEqual(['A', 'B']);
        expect(r.stoppedAt).toBe(2);
        // 剛好等於最後一首的開始也算重新起算
        expect(parseTimelineDetailed('1:00 A\n2:00 B\nTimestamp\n2:00 聊天').stoppedAt).toBe(2);
    });
});
