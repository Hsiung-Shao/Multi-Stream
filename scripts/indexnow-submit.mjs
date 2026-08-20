// IndexNow 提交腳本（手動步驟，非 CI）：production 部署完成後跑 `npm run indexnow`，
// 通知 Bing / Yandex / Naver / Seznam 等支援 IndexNow 的搜尋引擎重新抓取。
// - key 檔：public/<64hex>.txt（key 本身設計上就是公開的，非機密）
// - URL 清單：讀 repo 根的 sitemap.xml（由 npm run generate-sitemap 產生，單一來源）
// Node 18+，零依賴。
import { readdirSync, readFileSync } from 'node:fs';

const HOST = 'multistreaming.org';

const publicDir = new URL('../public/', import.meta.url);
const keyFile = readdirSync(publicDir).find((f) => /^[0-9a-f]{64}\.txt$/.test(f));
if (!keyFile) {
    console.error('❌ 在 public/ 找不到 IndexNow key 檔（<64hex>.txt）');
    process.exit(1);
}
const key = keyFile.slice(0, -4);

let xml;
try {
    xml = readFileSync(new URL('../sitemap.xml', import.meta.url), 'utf8');
} catch {
    console.error('❌ 找不到 sitemap.xml，先跑 npm run generate-sitemap');
    process.exit(1);
}
const urlList = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
if (urlList.length === 0) {
    console.error('❌ sitemap.xml 解析不到任何 <loc>');
    process.exit(1);
}

const res = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
        host: HOST,
        key,
        keyLocation: `https://${HOST}/${keyFile}`,
        urlList,
    }),
});
const body = await res.text();
console.log(`IndexNow: HTTP ${res.status}${body ? ` — ${body}` : ''}（提交 ${urlList.length} 條 URL）`);
process.exit(res.status === 200 || res.status === 202 ? 0 : 1);
