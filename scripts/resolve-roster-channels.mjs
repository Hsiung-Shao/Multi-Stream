// 企業勢名冊：把調查結果的頻道解析成可寫入資料庫的形式，並和資料庫比對。
//
// 用法：node scripts/resolve-roster-channels.mjs --roster <名冊.json> --db <vtubers.json> --out <resolved.json>
//   名冊：scripts/data/tw-agency-rosters-2026-09.json（研究代理彙整，含出處）
//   db：本地匯出的 vtubers（id,name,activity,youtube_channel_id,twitch_channel_id,group_id,debut_date）
//
// 解析：
//   - YouTube @handle → 頻道 ID＋頭像：Data API channels?forHandle（1 單位／次）；已有 UC 的一次批 50 個補頭像
//   - Twitch login → broadcaster id＋頭像：Helix /users（一次 100 個，順便驗證帳號存在）
//   - 資料庫比對：先比 YouTube 頻道 ID、再比 Twitch login
// 金鑰讀 supabase/functions/.env（YOUTUBE_API_KEY、YOUTUBE_API_REFERER、TWITCH_CLIENT_ID／SECRET），不印出任何值。
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const arg = (name) => {
    const i = process.argv.indexOf(name);
    return i > 0 ? process.argv[i + 1] : null;
};

function loadEnv(path) {
    const env = {};
    for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
        const m = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line);
        if (m) env[m[1]] = m[2].replace(/^"|"$/g, '');
    }
    return env;
}

const UC_RE = /^UC[\w-]{22}$/;

export function normalizeHandle(h) {
    if (!h) return null;
    const m = /(?:youtube\.com\/)?@([\p{L}\p{N}_.\-·]+)/u.exec(h.trim());
    return m ? `@${m[1]}` : h.trim().startsWith('@') ? h.trim() : null;
}

async function ytGet(env, path) {
    const url = `https://www.googleapis.com/youtube/v3/${path}&key=${env.YOUTUBE_API_KEY}`;
    const res = await fetch(url, { headers: { Referer: env.YOUTUBE_API_REFERER || 'https://multistreaming.org' } });
    if (!res.ok) throw new Error(`youtube ${path.split('?')[0]} HTTP ${res.status}`);
    return res.json();
}

async function twitchToken(env) {
    const res = await fetch('https://id.twitch.tv/oauth2/token', {
        method: 'POST',
        body: new URLSearchParams({ client_id: env.TWITCH_CLIENT_ID, client_secret: env.TWITCH_CLIENT_SECRET, grant_type: 'client_credentials' }),
    });
    if (!res.ok) throw new Error(`twitch token HTTP ${res.status}`);
    return (await res.json()).access_token;
}

/** 比對資料庫：先 YouTube 頻道 ID、再 Twitch login；回傳資料庫那列或 null */
export function matchDb(member, db) {
    if (member.youtube_channel_id) {
        const hit = db.byYoutube.get(member.youtube_channel_id);
        if (hit) return hit;
    }
    if (member.twitch_login) {
        const hit = db.byTwitch.get(member.twitch_login.toLowerCase());
        if (hit) return hit;
    }
    return null;
}

export function indexDb(rows) {
    return {
        // 完全沒有頻道資料的舊列（第三方名單只有名字）：頻道對不到時才用名字認人
        byNameNoChannel: new Map(rows.filter((r) => !r.youtube_channel_id && !r.twitch_channel_id).map((r) => [r.name, r])),
        byYoutube: new Map(rows.filter((r) => r.youtube_channel_id).map((r) => [r.youtube_channel_id, r])),
        byTwitch: new Map(rows.filter((r) => r.twitch_channel_id).map((r) => [r.twitch_channel_id.toLowerCase(), r])),
    };
}

async function main() {
    const rosterPath = arg('--roster');
    const dbPath = arg('--db');
    const outPath = arg('--out');
    if (!rosterPath || !dbPath || !outPath) throw new Error('需要 --roster --db --out');
    const env = loadEnv(resolve('supabase/functions/.env'));
    const file = JSON.parse(readFileSync(rosterPath, 'utf8'));
    // 名冊檔是 { agencies: [...] }（也接受直接給陣列）
    const roster = Array.isArray(file) ? file : file.agencies;
    const db = indexDb(JSON.parse(readFileSync(dbPath, 'utf8')));
    const members = roster.flatMap((a) => a.members.map((m) => ({ agency: a.agency, m })));

    // 1. YouTube handle → 頻道 ID
    let ytCalls = 0;
    for (const { m } of members) {
        if (m.youtube_channel_id && !UC_RE.test(m.youtube_channel_id)) m.youtube_channel_id = null;
        const handle = normalizeHandle(m.youtube_handle);
        if (!m.youtube_channel_id && handle) {
            try {
                const j = await ytGet(env, `channels?part=id,snippet&forHandle=${encodeURIComponent(handle)}`);
                ytCalls += 1;
                const it = j.items?.[0];
                if (it) {
                    m.youtube_channel_id = it.id;
                    m._avatar = it.snippet?.thumbnails?.default?.url ?? null;
                    m._resolved = 'youtube-handle';
                } else m._unresolved = `youtube handle 查無 ${handle}`;
            } catch (e) {
                m._unresolved = String(e.message);
            }
        }
    }
    // 2. 已有頻道 ID 的補頭像（只補資料庫沒有的人，批 50）
    const needAvatar = members.filter(({ m }) => m.youtube_channel_id && !m._avatar && !matchDb(m, db));
    for (let i = 0; i < needAvatar.length; i += 50) {
        const batch = needAvatar.slice(i, i + 50);
        const j = await ytGet(env, `channels?part=snippet&id=${batch.map(({ m }) => m.youtube_channel_id).join(',')}`);
        ytCalls += 1;
        const byId = new Map((j.items ?? []).map((it) => [it.id, it]));
        for (const { m } of batch) {
            const it = byId.get(m.youtube_channel_id);
            if (it) m._avatar = it.snippet?.thumbnails?.default?.url ?? null;
            else {
                m._unresolved = `youtube 頻道不存在 ${m.youtube_channel_id}`;
                m.youtube_channel_id = null;
            }
        }
    }
    // 3. Twitch login → broadcaster id＋頭像（驗證存在）
    const token = await twitchToken(env);
    const withTwitch = members.filter(({ m }) => m.twitch_login);
    let twCalls = 0;
    for (let i = 0; i < withTwitch.length; i += 100) {
        const batch = withTwitch.slice(i, i + 100);
        const params = new URLSearchParams();
        for (const { m } of batch) params.append('login', m.twitch_login.toLowerCase());
        const res = await fetch(`https://api.twitch.tv/helix/users?${params}`, { headers: { 'Client-Id': env.TWITCH_CLIENT_ID, Authorization: `Bearer ${token}` } });
        twCalls += 1;
        if (!res.ok) throw new Error(`twitch users HTTP ${res.status}`);
        const byLogin = new Map(((await res.json()).data ?? []).map((u) => [u.login, u]));
        for (const { m } of batch) {
            const u = byLogin.get(m.twitch_login.toLowerCase());
            if (u) {
                m.twitch_login = u.login;
                m._twitch_id = u.id;
                if (!m._avatar) m._avatar = u.profile_image_url ?? null;
            } else {
                m._unresolved = [m._unresolved, `twitch 帳號不存在 ${m.twitch_login}`].filter(Boolean).join('；');
                m.twitch_login = null;
            }
        }
    }
    // 4. 比對資料庫
    const report = { ytCalls, twCalls, matched: 0, newWithChannel: 0, noChannel: 0, collaborator: 0, official: 0 };
    for (const { m } of members) {
        if (m.collaborator) report.collaborator += 1;
        if (m.is_official_channel) report.official += 1;
        let hit = matchDb(m, db);
        // 頻道對不到、但資料庫有同名且完全沒頻道的一列：視為同一人（補上頻道），不另外新增
        if (!hit && db.byNameNoChannel) {
            const byName = db.byNameNoChannel.get(m.name);
            if (byName) {
                hit = byName;
                m._match_name = true;
            }
        }
        m._db_id = hit?.id ?? null;
        m._db_group_id = hit?.group_id ?? null;
        m._db_name = hit?.name ?? null;
        m._db_activity = hit?.activity ?? null;
        if (hit) report.matched += 1;
        else if (m.youtube_channel_id || m.twitch_login) report.newWithChannel += 1;
        else report.noChannel += 1;
    }
    writeFileSync(outPath, JSON.stringify(roster, null, 2) + '\n', 'utf8');
    console.log(JSON.stringify(report));
}

if (process.argv[1] && resolve(process.argv[1]).endsWith('resolve-roster-channels.mjs')) {
    main().catch((e) => {
        console.error(String(e.message ?? e));
        process.exitCode = 1;
    });
}
