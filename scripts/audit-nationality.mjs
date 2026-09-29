// 地區（vtubers.nationality）嚴格檢查：第一步，自動篩檢（唯讀，不寫資料庫）。
// 2026-09-30 使用者：「有發現部分的地區配對資料是錯誤的，要嚴格檢查地區資料是否正確」；地區＝社群歸屬（本人或所屬公司自稱）。
//
// 用法：node scripts/audit-nationality.mjs --vtubers <json> --groups <json> --yt-local <json> --out <audit.json> [--cache <api-cache.json>]
//   vtubers：id,name,nationality,activity,youtube_channel_id,twitch_channel_id,group_id,former_group_id,last_live_at
//   groups：id,name,nationality,kind,parent_id；yt-local：youtube_channels 的 channel_id,title,description
//
// 訊號：
//   強（依可信度分三層）：本人自稱（名字／頻道標題／簡介裡的台V、港V、馬V、「台灣Vtuber」等）＞
//       所屬（或前所屬）為查證過的企業勢（kind=agency）＞ 單一國旗與 YouTube 自填國家 snippet.country（兩者都常誤導）
//   弱：粵語用字（港、馬華都用，只作輔助）、簡體字比例（台V 幾乎不用簡體；馬華、中國常用）、日文假名比例
// 分類：agree（強訊號一致且等於資料庫）／conflict（強訊號指向別處、或互相矛盾、或弱訊號明顯不符）／no_signal
// API：YouTube channels?part=snippet（50 個／次，帶 Referer）、Twitch Helix /users（100 個／次）；回應存 cache 可重跑。
// 金鑰讀 supabase/functions/.env，不印出任何值。
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

export const REGIONS = ['TW', 'HK', 'MY', 'JP', 'KR', 'OTHER'];

// 「V」後面只接 tuber 或非英文字母：台V、台Vtuber 算；台VR、台灣VALORANT 不算
const V = String.raw`V(?:tuber)?(?![a-z])`;
// 「台V」前面是舞、平、電、後、上、登、櫃、擂、講、月台等詞的一部分時不算（舞台V、平台V 主）
const TAI = String.raw`(?<![舞平電电後后上登櫃柜擂講讲月])[台臺]`;
/** 地區自稱（強訊號）。只收「自我介紹式」寫法；單獨出現的「台灣」可能是「台灣時間」等，只算弱訊號 */
const STRONG = [
    ['TW', new RegExp(String.raw`${TAI}\s*${V}|${TAI}[灣湾]\s*(?:的\s*)?(?:${V}|虛擬|虚拟|個人勢|个人势|新人)|來自台灣|来自台湾|taiwan(?:ese)?\s*v(?:tuber)?\b|\bTW\s*[-_]?\s*Vtuber`, 'i')],
    // 「港台Vtuber」兩地並稱：港與台都算，判定時成為矛盾交人工
    ['HK', new RegExp(String.raw`港\s*(?:台\s*)?${V}|香港\s*(?:的\s*)?(?:${V}|虛擬|虚拟|个人勢|個人勢|个人势|新人)|來自香港|来自香港|hong\s*kong(?:er)?\s*v(?:tuber)?\b|\bHK\s*[-_]?\s*Vtuber`, 'i')],
    // 「馬V」前面是競、海、斑、木等字時是別的詞（競馬 Vtuber、海馬Vtuber），不算
    ['MY', new RegExp(String.raw`(?<![競竞海斑野木白黑駿骏戰战寶宝鐵铁河羅罗小天神出])[馬马]\s*${V}|(?:馬來西亞|马来西亚)\s*(?:的\s*)?(?:${V}|虛擬|虚拟|個人勢|个人势)|來自馬來西亞|来自马来西亚|malaysia(?:n)?\s*v(?:tuber)?\b`, 'i')],
    // 「MY Vtuber」只認大寫（英文的 my Vtuber 是「我的」）
    ['MY', /\bMY\s*[-_]?\s*(?:Vtuber|VTuber|VTUBER)/],
    ['JP', /日本\s*(?:の)?\s*(?:Vtuber|VTuber)|japanese\s*vtuber/i],
    ['KR', /韓國\s*(?:V|Vtuber)|韩国\s*(?:V|Vtuber)|korean\s*vtuber/i],
    ['OTHER', /新加坡\s*(?:V|Vtuber)|singapore(?:an)?\s*vtuber|中國\s*(?:V|Vtuber)|中国\s*(?:V|Vtuber)|澳門\s*(?:V|Vtuber)|澳门\s*(?:V|Vtuber)|菲律賓\s*(?:V|Vtuber)|philippine\s*vtuber|印尼\s*(?:V|Vtuber)|indonesian?\s*vtuber|泰國\s*(?:V|Vtuber)|thai\s*vtuber|美國\s*(?:V|Vtuber)|加拿大\s*(?:V|Vtuber)|澳洲\s*(?:V|Vtuber)|越南\s*(?:V|Vtuber)/i],
];

/** 國旗 → 地區。單一國旗常代表語言（日本語OK🇯🇵），只當與自填國家同層的參考 */
const FLAG_REGION = { '🇹🇼': 'TW', '🇭🇰': 'HK', '🇲🇾': 'MY', '🇯🇵': 'JP', '🇰🇷': 'KR' };

/** YouTube 自填國家 → 本站地區 */
export function countryToRegion(c) {
    if (!c) return null;
    const u = String(c).toUpperCase();
    return REGIONS.includes(u) && u !== 'OTHER' ? u : 'OTHER';
}

// 不收「係」（繁中「關係」也會出現）
const CANTONESE = /[嘅咗唔冇啲嚟佢哋喺嘢咩乜噉嗰]/g;
// 只取「簡體獨有」的常用字（繁體不會出現）
const SIMPLIFIED = /[这们说时发为个对过还没么请关欢频视语头动开给见让马来国东车长门问间现实点应样该经从边书电话认记许论设试选运进远连选择难]/g;
const TRADITIONAL = /[這們說時發為個對過還沒麼請關歡頻視語頭動開給見讓馬來國東車長門問間現實點應樣該經從邊書電話認記許論設試選運進遠連擇難]/g;
const KANA = /[぀-ヿ]/g;

const count = (s, re) => (s.match(re) ?? []).length;

const FLAGS = /🇹🇼|🇭🇰|🇲🇾|🇯🇵|🇰🇷|🇸🇬|🇨🇳|🇲🇴|🇵🇭|🇮🇩|🇹🇭|🇺🇸|🇨🇦|🇦🇺|🇻🇳|🇬🇧/gu;

/** 一段文字的訊號：強（地區自稱）與弱（字形、粵語、假名） */
export function textSignals(text) {
    const t = (text ?? '').normalize('NFKC');
    // 簡介裡並排多國國旗通常是「會說的語言」（🇹🇼🇯🇵🇺🇸），不是地區：兩種以上國旗時國旗不採計
    const flags = new Set(t.match(FLAGS) ?? []);
    const strong = [];
    for (const [region, re] of STRONG) {
        const m = re.exec(t);
        if (m) strong.push({ region, kind: 'self', match: m[0].trim().slice(0, 30) });
    }
    if (flags.size === 1) {
        const [f] = flags;
        strong.push({ region: FLAG_REGION[f] ?? 'OTHER', kind: 'flag', match: f });
    }
    const simp = count(t, SIMPLIFIED);
    const trad = count(t, TRADITIONAL);
    const weak = [];
    if (simp >= 8 && simp > trad * 2) weak.push({ hint: 'simplified', simp, trad });
    if (count(t, CANTONESE) >= 4) weak.push({ hint: 'cantonese', n: count(t, CANTONESE) });
    if (count(t, KANA) >= 40) weak.push({ hint: 'kana', n: count(t, KANA) });
    return { strong, weak };
}

/**
 * 訊號可信度由高到低：本人自稱 > 所屬企業勢 > 單一國旗與 YouTube 自填國家（很多台V把國家設成日本、國旗常代表語言，只能當最後參考）。
 * 國旗與自填國家同一層：兩者不同時算該層矛盾，交人工
 */
const TIERS = [['self'], ['agency'], ['flag', 'country']];

/**
 * 一位藝人的判定：取「有訊號的最高一層」。該層一致 → 與資料庫比對（basis 記是哪一層）；該層自己矛盾 → conflict（mixed）。
 * 沒有強訊號時，弱訊號明顯不符資料庫（記 TW 卻整段簡體或粵語、記 HK／MY／TW 卻大量假名）→ conflict（weak）
 */
export function classify(dbRegion, strong, weak) {
    for (const kinds of TIERS) {
        const tier = kinds.join('+');
        const regions = [...new Set(strong.filter((s) => kinds.includes(s.kind)).map((s) => s.region))];
        if (!regions.length) continue;
        if (regions.length > 1) return { verdict: 'conflict', suggestion: null, basis: `mixed:${tier}` };
        return regions[0] === dbRegion
            ? { verdict: 'agree', suggestion: dbRegion, basis: tier }
            : { verdict: 'conflict', suggestion: regions[0], basis: tier };
    }
    const hints = new Set(weak.map((w) => w.hint));
    if (dbRegion === 'TW' && hints.has('simplified')) return { verdict: 'conflict', suggestion: null, basis: 'weak:simplified' };
    if (dbRegion === 'TW' && hints.has('cantonese')) return { verdict: 'conflict', suggestion: null, basis: 'weak:cantonese' };
    if ((dbRegion === 'HK' || dbRegion === 'MY' || dbRegion === 'TW') && hints.has('kana')) return { verdict: 'conflict', suggestion: null, basis: 'weak:kana' };
    return { verdict: 'no_signal', suggestion: null };
}

/** 資料庫匯出＋API 回應 → 每位藝人的篩檢結果（純函式，測試直接餵資料） */
export function auditAll(vtubers, groups, ytLocal, ytApi = {}, twApi = {}) {
    const gById = new Map(groups.map((g) => [g.id, g]));
    const ytById = new Map(ytLocal.map((c) => [c.channel_id, c]));
    const topAgency = (gid) => {
        let g = gById.get(gid);
        if (g?.parent_id) g = gById.get(g.parent_id) ?? g;
        return g?.kind === 'agency' ? g : null;
    };
    return vtubers.map((v) => {
        const strong = [];
        const weak = [];
        const add = (source, text) => {
            const s = textSignals(text);
            strong.push(...s.strong.map((x) => ({ ...x, source })));
            weak.push(...s.weak.map((x) => ({ ...x, source })));
        };
        add('name', v.name);
        const yl = v.youtube_channel_id ? ytById.get(v.youtube_channel_id) : null;
        const ya = v.youtube_channel_id ? ytApi[v.youtube_channel_id] : null;
        add('youtube', [ya?.title ?? yl?.title, ya?.description ?? yl?.description].filter(Boolean).join('\n'));
        const tw = v.twitch_channel_id ? twApi[v.twitch_channel_id.toLowerCase()] : null;
        add('twitch', [tw?.display_name, tw?.description].filter(Boolean).join('\n'));
        const country = countryToRegion(ya?.country);
        if (country) strong.push({ region: country, kind: 'country', source: 'youtube.country', match: ya.country });
        const ag = topAgency(v.group_id) ?? topAgency(v.former_group_id);
        if (ag) strong.push({ region: ag.nationality, kind: 'agency', source: 'agency', match: ag.name });
        const c = classify(v.nationality, strong, weak);
        return {
            id: v.id,
            name: v.name,
            db: v.nationality,
            activity: v.activity,
            last_live_at: v.last_live_at ?? null,
            youtube: v.youtube_channel_id ?? null,
            twitch: v.twitch_channel_id ?? null,
            ...c,
            strong,
            weak,
        };
    });
}

function loadEnv(path) {
    const env = {};
    for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
        const m = /^\s*(?:export\s+)?([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
        if (m) env[m[1]] = m[2].replace(/^"|"$/g, '');
    }
    return env;
}

async function main() {
    const arg = (n) => {
        const i = process.argv.indexOf(n);
        return i > 0 ? process.argv[i + 1] : null;
    };
    const read = (n, fallback) => {
        const p = arg(n);
        if (!p) {
            if (fallback !== undefined) return fallback;
            throw new Error(`需要 ${n}`);
        }
        return JSON.parse(readFileSync(resolve(p), 'utf8'));
    };
    const vtubers = read('--vtubers');
    const groups = read('--groups');
    const ytLocal = read('--yt-local', []);
    if (!arg('--out')) throw new Error('需要 --out');
    const cachePath = arg('--cache');
    const cache = cachePath && existsSync(cachePath) ? JSON.parse(readFileSync(cachePath, 'utf8')) : { yt: {}, tw: {} };
    // 每批抓完就寫快取：中途 API 出錯時已抓到的不會遺失
    const saveCache = () => cachePath && writeFileSync(cachePath, JSON.stringify(cache), 'utf8');

    // YouTube：自填國家＋最新簡介（50 個／次）
    const ytIds = [...new Set(vtubers.map((v) => v.youtube_channel_id).filter(Boolean))].filter((id) => !(id in cache.yt));
    const logins = [...new Set(vtubers.map((v) => v.twitch_channel_id?.toLowerCase()).filter(Boolean))].filter((l) => !(l in cache.tw));
    // 快取已齊全時不讀金鑰
    const env = ytIds.length || logins.length ? loadEnv(resolve('supabase/functions/.env')) : {};
    let ytCalls = 0;
    for (let i = 0; i < ytIds.length; i += 50) {
        const batch = ytIds.slice(i, i + 50);
        const res = await fetch(`https://www.googleapis.com/youtube/v3/channels?part=snippet&id=${batch.join(',')}&key=${env.YOUTUBE_API_KEY}`, {
            headers: { Referer: env.YOUTUBE_API_REFERER || 'https://multistreaming.org' },
        });
        ytCalls += 1;
        if (!res.ok) throw new Error(`youtube channels HTTP ${res.status}`);
        const j = await res.json();
        for (const id of batch) cache.yt[id] = null;
        for (const it of j.items ?? []) cache.yt[it.id] = { title: it.snippet?.title ?? '', description: it.snippet?.description ?? '', country: it.snippet?.country ?? null };
        saveCache();
    }
    // Twitch：自介（100 個／次）
    let twCalls = 0;
    if (logins.length) {
        // client_secret 放在 form body，不放網址（避免留在代理或記錄檔）
        const tokRes = await fetch('https://id.twitch.tv/oauth2/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ client_id: env.TWITCH_CLIENT_ID, client_secret: env.TWITCH_CLIENT_SECRET, grant_type: 'client_credentials' }),
        });
        if (!tokRes.ok) throw new Error(`twitch token HTTP ${tokRes.status}`);
        const tok = await tokRes.json();
        for (let i = 0; i < logins.length; i += 100) {
            const batch = logins.slice(i, i + 100);
            const params = new URLSearchParams();
            for (const l of batch) params.append('login', l);
            const res = await fetch(`https://api.twitch.tv/helix/users?${params}`, { headers: { 'Client-Id': env.TWITCH_CLIENT_ID, Authorization: `Bearer ${tok.access_token}` } });
            twCalls += 1;
            if (!res.ok) throw new Error(`twitch users HTTP ${res.status}`);
            const j = await res.json();
            for (const l of batch) cache.tw[l] = null;
            for (const u of j.data ?? []) cache.tw[u.login] = { display_name: u.display_name, description: u.description ?? '' };
            saveCache();
        }
    }

    const ytApi = Object.fromEntries(Object.entries(cache.yt).filter(([, v]) => v));
    const twApi = Object.fromEntries(Object.entries(cache.tw).filter(([, v]) => v));
    const rows = auditAll(vtubers, groups, ytLocal, ytApi, twApi);
    writeFileSync(resolve(arg('--out')), JSON.stringify(rows, null, 1) + '\n', 'utf8');
    const tally = {};
    for (const r of rows) {
        const k = `${r.db}/${r.verdict}`;
        tally[k] = (tally[k] ?? 0) + 1;
    }
    console.log(JSON.stringify({ ytCalls, twCalls, total: rows.length, tally }, null, 1));
}

if (process.argv[1] && resolve(process.argv[1]).endsWith('audit-nationality.mjs')) {
    main().catch((e) => {
        console.error(String(e.message ?? e));
        process.exitCode = 1;
    });
}
