// vendor 分包規則（2026-09 PageSpeed）：react-dom 的 client 本體沒被 vendor-react 認領時，
// 會被 Rollup 併進別的 vendor 群組（曾讓首頁預載整包圖表庫）。這裡鎖住分類結果。
import { describe, it, expect } from 'vitest';
import { vendorChunkOf } from '../../src/buildConfig/vendorChunks';

const nm = (p: string) => `D:/proj/node_modules/${p}`;

describe('vendorChunkOf', () => {
    it('react-dom 的 client 本體與 scheduler 一定在 vendor-react', () => {
        expect(vendorChunkOf(nm('react-dom/cjs/react-dom-client.production.js'))).toBe('vendor-react');
        expect(vendorChunkOf(nm('react-dom/client.js'))).toBe('vendor-react');
        expect(vendorChunkOf(nm('scheduler/cjs/scheduler.production.js'))).toBe('vendor-react');
        expect(vendorChunkOf(nm('@tanstack/query-core/build/modern/index.js'))).toBe('vendor-react');
    });

    it('圖表庫與 d3 在 vendor-charts', () => {
        expect(vendorChunkOf(nm('recharts/es6/index.js'))).toBe('vendor-charts');
        expect(vendorChunkOf(nm('d3-scale/src/linear.js'))).toBe('vendor-charts');
    });

    it('Radix 與未列出的套件不指定（交給 Rollup 依使用點分配）；專案原始碼不指定', () => {
        expect(vendorChunkOf(nm('@radix-ui/react-dialog/dist/index.mjs'))).toBeUndefined();
        expect(vendorChunkOf(nm('@supabase/supabase-js/dist/module/index.js'))).toBeUndefined();
        expect(vendorChunkOf('D:/proj/src/App.tsx')).toBeUndefined();
    });

    it('Windows 反斜線路徑與巢狀 node_modules（取最後一段）', () => {
        expect(vendorChunkOf('D:\\proj\\node_modules\\@tanstack\\react-query\\build\\index.js')).toBe('vendor-react');
        expect(vendorChunkOf(nm('@radix-ui/react-select/node_modules/clsx/dist/clsx.mjs'))).toBe('vendor-utils');
        // 前綴相同的其他套件不能被誤認
        expect(vendorChunkOf(nm('react-dom-extra/index.js'))).toBeUndefined();
    });
});
