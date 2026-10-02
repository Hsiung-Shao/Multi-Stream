// AdSense publisher id 有三份複本：index.html 的驗證 meta、src/utils/adsense.ts 的載入器、ads.txt。
// 任一份改錯都不會報錯，只會讓審核驗證或廣告收益靜默失效，這裡鎖住三者一致。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const rootDir = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(resolve(rootDir, p), 'utf8');

describe('AdSense publisher id 一致', () => {
    it('index.html 驗證 meta、adsense.ts、ads.txt 是同一個 pub id', () => {
        const meta = read('index.html').match(/<meta name="google-adsense-account" content="ca-(pub-\d+)"/);
        const loader = read('src/utils/adsense.ts').match(/ADSENSE_CLIENT = 'ca-(pub-\d+)'/);
        const adsTxt = read('ads.txt').match(/^google\.com, (pub-\d+), DIRECT/m);
        expect(meta?.[1]).toBeTruthy();
        expect(loader?.[1]).toBe(meta?.[1]);
        expect(adsTxt?.[1]).toBe(meta?.[1]);
    });
});
