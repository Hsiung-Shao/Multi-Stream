/** 輸入框的貼圖補完（Tab）與插入（選單點選），純函式 */
export interface CompletionState { start: number; candidates: string[]; index: number }

/** 游標前最後一個詞當開頭補完；帶上一次的 state 就換下一個候選。沒有候選回 null（呼叫端不攔 Tab） */
export function completeEmote(text: string, caret: number, names: string[], prev?: CompletionState | null): { text: string; caret: number; state: CompletionState } | null {
    let state: CompletionState;
    // 游標還停在上一次補完的結尾才算連按；被滑鼠移走就重新開始
    const last = prev?.candidates[prev.index];
    if (prev && last !== undefined && text.slice(prev.start, caret) === last + ' ') {
        state = { ...prev, index: (prev.index + 1) % prev.candidates.length };
    } else {
        const start = text.lastIndexOf(' ', caret - 1) + 1;
        const word = text.slice(start, caret).toLowerCase();
        if (!word) return null;
        const candidates = names.filter(n => n.toLowerCase().startsWith(word)).sort((a, b) => a.localeCompare(b));
        if (!candidates.length) return null;
        state = { start, candidates, index: 0 };
    }
    const insert = state.candidates[state.index] + ' ';
    return { text: text.slice(0, state.start) + insert + text.slice(caret), caret: state.start + insert.length, state };
}

/** 在游標處插入貼圖名稱：緊貼前一個字就補前空白，後面一律補空白 */
export function insertEmote(text: string, caret: number, name: string): { text: string; caret: number } {
    const insert = (caret > 0 && !/\s/.test(text[caret - 1]) ? ' ' : '') + name + ' ';
    return { text: text.slice(0, caret) + insert + text.slice(caret), caret: caret + insert.length };
}
