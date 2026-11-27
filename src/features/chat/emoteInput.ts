/** 合併聊天室輸入框（contenteditable）：純文字是唯一來源，畫面把貼圖名稱畫成圖片 */

export type InputPart = { type: 'text'; text: string } | { type: 'emote'; name: string; url: string };

/** 切段：貼圖名稱「後面接著空白」才畫成圖（選單／Tab 補完都會補空白；打字打到一半不閃） */
export function inputParts(text: string, urlByName: ReadonlyMap<string, string>): InputPart[] {
    const out: InputPart[] = [];
    let buf = '';
    for (const m of text.matchAll(/(\S+)(?=\s)|\S+|\s+/g)) {
        const url = m[1] !== undefined ? urlByName.get(m[1]) : undefined;
        if (url === undefined) { buf += m[0]; continue; }
        if (buf) out.push({ type: 'text', text: buf });
        buf = '';
        out.push({ type: 'emote', name: m[1], url });
    }
    if (buf) out.push({ type: 'text', text: buf });
    return out;
}

/** 畫面已經是這段文字畫出來的樣子：一般打字（沒新增貼圖）就不重畫，保留瀏覽器的復原紀錄 */
export function isRendered(el: HTMLElement, text: string, urlByName: ReadonlyMap<string, string>): boolean {
    const parts = inputParts(text, urlByName);
    const kids = el.childNodes;
    return kids.length === parts.length && parts.every((p, i) => {
        const n = kids[i];
        return p.type === 'text' ? n.nodeType === Node.TEXT_NODE && n.nodeValue === p.text
            : n instanceof HTMLImageElement && n.alt === p.name && n.getAttribute('src') === p.url;
    });
}

export function renderInput(el: HTMLElement, text: string, urlByName: ReadonlyMap<string, string>): void {
    const doc = el.ownerDocument;
    el.replaceChildren(...inputParts(text, urlByName).map(p => {
        if (p.type === 'text') return doc.createTextNode(p.text);
        const img = doc.createElement('img');
        img.dataset.emote = '';
        img.alt = p.name;
        img.title = p.name;
        img.src = p.url;
        img.referrerPolicy = 'no-referrer';
        img.draggable = false;
        img.className = 'mx-px inline h-6 w-auto align-middle';
        return img;
    }));
}

// 節點換算成純文字長度：文字取字數、img 取名稱長度、其他元素（瀏覽器塞的 br、div）往下找
const lengthOf = (n: Node): number =>
    n.nodeType === Node.TEXT_NODE ? (n.nodeValue ?? '').length
        : n instanceof HTMLImageElement ? n.alt.length
            : [...n.childNodes].reduce((s, c) => s + lengthOf(c), 0);

export function serializeInput(el: HTMLElement): string {
    let s = '';
    const walk = (n: Node) => {
        if (n.nodeType === Node.TEXT_NODE) s += n.nodeValue ?? '';
        else if (n instanceof HTMLImageElement) s += n.alt;
        else n.childNodes.forEach(walk);
    };
    el.childNodes.forEach(walk);
    // 部分瀏覽器在可編輯區打空白會塞不換行空白（U+00A0）：送出前換回一般空白
    return s.replace(/ /g, ' ');
}

/** (container, offset) 在純文字中的位置 */
function offsetOf(el: HTMLElement, container: Node, offset: number): number {
    let pos = 0;
    // 先加上 container 之前所有兄弟與祖先兄弟的長度
    const before = (node: Node) => {
        for (let n = node; n !== el; n = n.parentNode!) {
            for (let p = n.previousSibling; p; p = p.previousSibling) pos += lengthOf(p);
        }
    };
    if (container.nodeType === Node.TEXT_NODE) { before(container); return pos + offset; }
    const kids = [...container.childNodes];
    for (let i = 0; i < offset && i < kids.length; i++) pos += lengthOf(kids[i]);
    if (container !== el) before(container);
    return pos;
}

/** 目前選取範圍在純文字中的 [起點, 終點]；不在 el 裡回 null */
export function getInputSelection(el: HTMLElement): [number, number] | null {
    const sel = el.ownerDocument.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    const r = sel.getRangeAt(0);
    if (!el.contains(r.startContainer) || !el.contains(r.endContainer)) return null;
    return [offsetOf(el, r.startContainer, r.startOffset), offsetOf(el, r.endContainer, r.endOffset)];
}

export function getInputCaret(el: HTMLElement): number | null {
    return getInputSelection(el)?.[1] ?? null;
}

export function setInputCaret(el: HTMLElement, offset: number): void {
    const doc = el.ownerDocument;
    const range = doc.createRange();
    let left = Math.max(0, offset);
    let placed = false;
    for (const n of [...el.childNodes]) {
        const len = lengthOf(n);
        if (n.nodeType === Node.TEXT_NODE && left <= len) { range.setStart(n, left); placed = true; break; }
        // 圖片不能切一半：剛好在圖片前就放前面，落在中間就放後面
        if (left === 0) { range.setStartBefore(n); placed = true; break; }
        if (left <= len) { range.setStartAfter(n); placed = true; break; }
        left -= len;
    }
    if (!placed) { range.selectNodeContents(el); range.collapse(false); }
    range.collapse(true);
    const sel = doc.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
}

/** 貼上／輸入取代選取範圍；單行輸入框，換行一律變空白 */
export function replaceRange(text: string, start: number, end: number, insert: string): { text: string; caret: number } {
    const clean = insert.replace(/\r\n|\r|\n/g, ' ');
    return { text: text.slice(0, start) + clean + text.slice(end), caret: start + clean.length };
}
