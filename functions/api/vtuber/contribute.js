// POST /api/vtuber/contribute：匿名投稿新 VTuber → vtuber_contributions（pending），後台核准才上線。
//
// 檢查順序見 functions/lib/submit-guard.js；之後在伺服器端重新查詢頻道（不信任前端送來的 ID 與名稱）、查重：
//   已在站上 → 409 exists（附 name、slug，前端改導個人頁／回報資料錯誤）
//   已有待審 → 409 pending_exists（資料庫也有部分唯一索引兜底）
// 只存雜湊 IP（ip_hash、submitted_by='anon:<前 16 碼>'），不存原始 IP。
// 緊急開關：SUBMISSIONS_DISABLED=true → 503。
//
// 回應：201 { ok: true, id } 或 { ok: false, error, vtuber? }

import { jsonResponse, handleOptions } from '../../lib/cors.js';
import { insert } from '../../lib/supabase-server.js';
import { logError } from '../../lib/logger.js';
import { guardSubmission, isUniqueViolation, findExisting } from '../../lib/submit-guard.js';
import { validateContribution, lookupYoutubeChannel } from '../../lib/vtuber-submit.js';

const MAX_BODY_BYTES = 16 * 1024;
const NO_STORE = { 'Cache-Control': 'no-store' };

export async function onRequestPost(context) {
    const { request, env } = context;
    const reply = (data, status) => jsonResponse(data, status, request, NO_STORE);

    const g = await guardSubmission(context, {
        disabledFlag: 'SUBMISSIONS_DISABLED',
        maxBytes: MAX_BODY_BYTES,
        validate: validateContribution,
        quotas: (ipHash, w) => ({
            personal: [
                { key: `contrib:h:${ipHash}:${w.hour}`, limit: 3, ttl: 3700 },
                { key: `contrib:d:${ipHash}:${w.day}`, limit: 10, ttl: 90000 },
            ],
            global: [{ key: `contrib:g:${w.hour}`, limit: 100, ttl: 3700 }],
        }),
    });
    if (!g.ok) return g.response;
    const v = g.value;

    const found = await lookupYoutubeChannel(v.channelInput);
    if (!found.ok) {
        return reply({ ok: false, error: found.error === 'not_found' ? 'youtube_not_found' : 'youtube_fetch_failed' }, found.error === 'not_found' ? 400 : 502);
    }
    const ch = found.channel;

    const { exists, pending, twitchTaken } = await findExisting(env, ch.channelId, v.socials.twitch);
    if (exists) return reply({ ok: false, error: 'exists', vtuber: exists }, 409);
    if (pending) return reply({ ok: false, error: 'pending_exists' }, 409);
    if (twitchTaken) return reply({ ok: false, error: 'twitch_exists' }, 409);

    const payload = {
        name: v.name,
        youtube_channel_id: ch.channelId,
        handle: ch.handle,
        avatar_url: v.avatarUrl || ch.avatarUrl,
        channel_title: ch.title,
        nationality: v.nationality,
        nationality_evidence_url: v.nationalityEvidenceUrl,
        affiliation_type: v.affiliation.type,
        group_id: v.affiliation.groupId,
        group_name: v.affiliation.groupName,
        bio: v.bio,
        x_url: v.socials.x,
        facebook_url: v.socials.facebook,
        instagram_url: v.socials.instagram,
        twitch_login: v.socials.twitch,
        subscriber_count_claimed: v.subscriberClaim,
    };
    const row = {
        action: 'add',
        status: 'pending',
        payload,
        youtube_channel_id: ch.channelId,
        submitted_by: `anon:${g.ipHash.slice(0, 16)}`,
        submitter_contact: v.contact,
        source_urls: v.sourceUrls,
        source_note: v.note,
        ip_hash: g.ipHash,
        auto_check: {
            channel_title: ch.title,
            avatar_fetched: ch.avatarUrl,
            name_matches_title: !!ch.title && ch.title.toLowerCase().includes(v.name.toLowerCase()),
            avatar_is_channel_avatar: !v.avatarUrl || v.avatarUrl === ch.avatarUrl,
            checked_at: new Date().toISOString(),
        },
    };

    const res = await insert(env, 'vtuber_contributions', row);
    if (!res.ok) {
        if (isUniqueViolation(res.error)) return reply({ ok: false, error: 'pending_exists' }, 409);
        await logError(env, 'vtuber-contribute', 'insert failed', { metadata: { status: res.status, error: res.error?.slice(0, 300) } });
        return reply({ ok: false, error: 'insert_failed' }, 500);
    }
    return reply({ ok: true, id: res.data?.[0]?.id ?? null }, 201);
}

export async function onRequestOptions(context) {
    return handleOptions(context.request);
}
