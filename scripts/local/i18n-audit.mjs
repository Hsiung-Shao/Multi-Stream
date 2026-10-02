// 【語系稽核】找出 zh-CN／ja／ko 相對於 en、zh-TW 基準的缺漏與過時 key。
//
// 用法：
//   node scripts/local/i18n-audit.mjs                  # 以 origin/main 為比較點
//   node scripts/local/i18n-audit.mjs <ref> [out.json]  # 指定比較點（例如上一次發版的 tag）
//
// - missing：en 或 zh-TW 有、目標語言沒有的 key（畫面會 fallback 成英文）
// - stale：en 或 zh-TW 在 <ref>..工作區之間改過、但目標語言從 <ref> 以來沒動的 key（內容可能已過時）
// 輸出 JSON 含每個 key 的 en、zh-TW 與目標語言現值，可以直接拿去翻譯。
// 只是比對工具，不改任何檔案。巢狀物件會攤平成 a.b 形式。
import { buildSync } from 'esbuild';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '../..');
const base = process.argv[2] || 'origin/main';
const out = process.argv[3] || path.join(os.tmpdir(), 'i18n-audit.json');
const TARGETS = ['zh-CN', 'ja', 'ko'];
const dir = path.join(root, 'src/i18n/locales');

// seo.ts 會 import src/seo/defaults.ts：這裡只比對 key，值用佔位字串
const stub = new Proxy({}, { get: (_, p) => (p === '__esModule' ? false : new Proxy({}, { get: () => '(defaults.ts)' })) });

function load(code) {
  const r = buildSync({ stdin: { contents: code, loader: 'ts' }, format: 'cjs', write: false, logLevel: 'silent' });
  const m = { exports: {} };
  new Function('module', 'exports', 'require', r.outputFiles[0].text)(m, m.exports, () => stub);
  return flatten(m.exports.default ?? m.exports);
}
function flatten(o, pre = '', acc = {}) {
  for (const [k, v] of Object.entries(o)) {
    const key = pre ? `${pre}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, key, acc); else acc[key] = v;
  }
  return acc;
}
const atRef = (lang, ns) => {
  try { return load(execSync(`git -C "${root}" show ${base}:src/i18n/locales/${lang}/${ns}.ts`, { encoding: 'utf8', maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'ignore'] })); }
  catch { return {}; }
};
const now = (lang, ns) => {
  const p = path.join(dir, lang, `${ns}.ts`);
  return fs.existsSync(p) ? load(fs.readFileSync(p, 'utf8')) : {};
};

const report = {};
for (const ns of fs.readdirSync(path.join(dir, 'en')).filter(f => f.endsWith('.ts')).map(f => f.slice(0, -3))) {
  const cur = { en: now('en', ns), 'zh-TW': now('zh-TW', ns) };
  const old = { en: atRef('en', ns), 'zh-TW': atRef('zh-TW', ns) };
  const keys = new Set([...Object.keys(cur.en), ...Object.keys(cur['zh-TW'])]);
  for (const t of TARGETS) {
    const tc = now(t, ns), to = atRef(t, ns);
    for (const k of keys) {
      const missing = !(k in tc);
      const srcChanged = cur.en[k] !== old.en[k] || cur['zh-TW'][k] !== old['zh-TW'][k];
      const stale = !missing && srcChanged && tc[k] === to[k] && (k in old.en || k in old['zh-TW']);
      if (missing || stale) {
        ((report[t] ??= {})[ns] ??= {})[k] = { status: missing ? 'missing' : 'stale', en: cur.en[k], 'zh-TW': cur['zh-TW'][k], current: tc[k] ?? null };
      }
    }
  }
}
fs.writeFileSync(out, JSON.stringify(report, null, 1));
for (const t of TARGETS) {
  const lines = Object.entries(report[t] || {}).map(([ns, o]) => {
    const v = Object.values(o);
    return `  ${ns}: missing ${v.filter(x => x.status === 'missing').length} / stale ${v.filter(x => x.status === 'stale').length}`;
  });
  console.log(`${t}${lines.length ? '\n' + lines.join('\n') : ': OK'}`);
}
console.log(`→ ${path.relative(root, out)}（比較點 ${base}）`);
