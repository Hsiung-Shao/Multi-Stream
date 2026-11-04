// 名錄頁 /vtubers 的 edge 端：一支 RPC（schedule_directory）拿頂層團體＋全部可索引成員，edge 快取 1 小時，
// 內文放進 #root 給不跑 JS 的爬蟲（1600 多個真實 <a href="/schedule/<slug>">，個人頁彼此才不是孤島）。
// React 掛載時會整個換掉（src/main.tsx 的 canHydrate：shell 沒有 data-prerender-lang）。
// 文案與 src/i18n/locales/{zh-TW,en}/schedule.ts 的 directory.* 同步（tests/functions/vtuberDirectoryEdge.test.ts 鎖）。
import { withLang } from './locale.js';
import { anonRpc, escapeHtml } from './schedule-person.js';
import { groupDirectory, splitBySubgroup } from './directory-group.js';

export const DIRECTORY_CACHE_TTL_S = 3600;
/** RPC 失敗時的負快取：Supabase 故障期間不讓每個 /vtubers 請求都等滿逾時 */
export const DIRECTORY_FAIL_TTL_S = 30;
const CACHE_KEY = 'https://multistreaming.org/__edge-cache/vtuber-directory/v1';

export const DIRECTORY_BODY = {
    'zh-TW': {
        title: '台灣 VTuber 名錄',
        intro: '依公司與團體瀏覽開台週表上的 VTuber，點名字看開台時間與最近的直播紀錄。只列最近三個月有開台的頻道。',
        independent: '個人勢',
        count: '{{count}} 位',
        lastLive: '最近開台',
    },
    en: {
        title: 'Taiwanese VTuber Directory',
        intro: 'Browse the VTubers on the stream schedule by agency and group; open a name for live times and recent streams. Only channels that streamed in the last three months are listed.',
        independent: 'Independent',
        count: '{{count}} VTubers',
        lastLive: 'Last streamed',
    },
};

/**
 * 名錄資料：{ ok: true, data: { groups, people } } 或 { ok: false }。
 * 命中 edge 快取就不打 RPC；RPC 失敗不快取（下一個請求再試）。
 */
export async function resolveDirectory(env, rpcFn = anonRpc, cache = globalThis.caches?.default ?? null) {
    const cacheKey = new Request(CACHE_KEY);
    if (cache) {
        const hit = await cache.match(cacheKey).catch(() => null);
        if (hit) {
            const cached = await hit.json().catch(() => null);
            if (cached && Array.isArray(cached.groups) && Array.isArray(cached.people)) return { ok: true, data: cached };
            if (cached && cached.failed === true) return { ok: false };
        }
    }
    const res = await rpcFn(env, 'schedule_directory', {});
    const data = res && res.ok ? res.data : null;
    if (!data || !Array.isArray(data.groups) || !Array.isArray(data.people)) {
        if (cache) {
            const body = new Response(JSON.stringify({ failed: true }), {
                headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${DIRECTORY_FAIL_TTL_S}` },
            });
            await cache.put(cacheKey, body).catch(() => {});
        }
        return { ok: false };
    }
    if (cache) {
        const body = new Response(JSON.stringify(data), {
            headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${DIRECTORY_CACHE_TTL_S}` },
        });
        await cache.put(cacheKey, body).catch(() => {});
    }
    return { ok: true, data };
}

const fill = (tpl, vars) => tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => (k in vars ? String(vars[k]) : ''));

function personItem(lang, p) {
    const href = withLang(lang, `/schedule/${encodeURIComponent(p.slug)}`);
    // 名錄不帶頭像（RPC 已不回 img_url，省 220 KB）；頭像在個人頁
    return `<li><a href="${href}" class="hover:underline">${escapeHtml(p.name)}</a></li>`;
}

function sectionHtml(lang, t, heading, count, listHtml, id = null) {
    const idAttr = id ? ` id="${escapeHtml(id)}"` : '';
    return `<section class="mt-8"><h2${idAttr} class="text-lg font-semibold">${escapeHtml(heading)}</h2><p class="text-sm text-muted-foreground">${escapeHtml(fill(t.count, { count }))}</p>${listHtml}</section>`;
}

/** 名錄內文：h1、說明、每個頂層團體一個 section（子團用小標分段）、個人勢一個 section。所有資料庫字串都經 escapeHtml。 */
export function renderDirectoryBodyHtml(lang, data) {
    const t = DIRECTORY_BODY[lang] ?? DIRECTORY_BODY.en;
    const { groups, independent } = groupDirectory(data);
    const parts = [
        `<h1 class="text-3xl font-bold">${escapeHtml(t.title)}</h1>`,
        `<p class="mt-2 text-muted-foreground">${escapeHtml(t.intro)}</p>`,
        `<p class="mt-1 text-sm text-muted-foreground">${escapeHtml(fill(t.count, { count: data.people.length }))}</p>`,
    ];
    for (const { group, members } of groups) {
        const blocks = splitBySubgroup(members).map(({ subgroup, people }) => {
            const list = `<ul class="mt-2 flex flex-wrap gap-x-6 gap-y-2 text-sm">${people.map((p) => personItem(lang, p)).join('')}</ul>`;
            return subgroup ? `<h3 class="mt-3 text-sm font-semibold text-muted-foreground">${escapeHtml(subgroup)}</h3>${list}` : list;
        });
        parts.push(sectionHtml(lang, t, group.name, members.length, blocks.join(''), `directory-group-${group.id}`));
    }
    if (independent.length) {
        parts.push(sectionHtml(lang, t, t.independent, independent.length, `<ul class="mt-2 flex flex-wrap gap-x-6 gap-y-2 text-sm">${independent.map((p) => personItem(lang, p)).join('')}</ul>`));
    }
    return `<div class="min-h-svh"><main class="mx-auto max-w-5xl px-4 py-8">${parts.join('')}</main></div>`;
}
