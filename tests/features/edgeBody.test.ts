// edge 預渲染內文擷取：只記個人週表頁路徑，且路徑完全相同才回傳
import { describe, it, expect, beforeEach } from 'vitest';
import { captureEdgeBody, edgeBodyFor, resetEdgeBody } from '../../src/features/schedule/edgeBody';

function rootWith(html: string): HTMLElement {
    const root = document.createElement('div');
    root.innerHTML = html;
    return root;
}

describe('edgeBody', () => {
    beforeEach(() => resetEdgeBody());

    it('只擷取個人頁路徑', () => {
        const root = rootWith('<h1>預渲染名字</h1>');
        captureEdgeBody(root, '/vtubers');
        expect(edgeBodyFor('/vtubers')).toBeNull();

        captureEdgeBody(root, '/zh-TW/schedule/x1');
        expect(edgeBodyFor('/zh-TW/schedule/x1')).toBe(root.innerHTML);
    });

    it('無前綴 /schedule/<slug> 也擷取；換成別的路徑查不到', () => {
        const root = rootWith('<p>內文</p>');
        captureEdgeBody(root, '/schedule/abc');
        expect(edgeBodyFor('/schedule/abc')).toBe('<p>內文</p>');
        expect(edgeBodyFor('/schedule/other')).toBeNull();
        expect(edgeBodyFor('/zh-TW/schedule/abc')).toBeNull();
    });

    it('root 沒有子節點不記；非個人頁路徑不清掉先前記的', () => {
        captureEdgeBody(rootWith('<p>舊內文</p>'), '/schedule/abc');
        captureEdgeBody(rootWith(''), '/schedule/abc');
        expect(edgeBodyFor('/schedule/abc')).toBe('<p>舊內文</p>');
        captureEdgeBody(rootWith('<p>別頁</p>'), '/vtubers');
        expect(edgeBodyFor('/schedule/abc')).toBe('<p>舊內文</p>');
    });

    it('resetEdgeBody 清空', () => {
        captureEdgeBody(rootWith('<p>x</p>'), '/schedule/abc');
        resetEdgeBody();
        expect(edgeBodyFor('/schedule/abc')).toBeNull();
    });
});
