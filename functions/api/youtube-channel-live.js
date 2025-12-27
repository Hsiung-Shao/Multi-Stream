// Cloudflare Pages Function: YouTube 頻道直播偵測（強化版：不使用 YouTube Data API）
// 目標：
// 1) 多入口拿候選 watch?v=（/live + 頻道首頁）
// 2) 一旦拿到 watch?v=，立刻抓 watch HTML 解析「影片所屬 channelId + isLive/isUpcoming」
// 3) 只有 channelId match 且 isLiveNow 才回 LIVE（Fail-Closed）
// 4) 排程直播（UPCOMING）會被標記，但不當作 LIVE（避免誤加串流）

export async function onRequestGet(contextOrRequest, env) {
  let request, envObj;
  if (contextOrRequest && contextOrRequest.request) {
    request = contextOrRequest.request;
    envObj = contextOrRequest.env;
  } else {
    request = contextOrRequest;
    envObj = env;
  }

  return handleChannelLiveRequest(request, envObj);
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400'
    }
  });
}

const MAX_REDIRECTS = 6;
const MAX_CANDIDATES_TO_VERIFY = 3;

// --- 通用 headers：讓 YouTube 回比較容易解析的 HTML ---
function baseHtmlHeaders(extra = {}) {
  return {
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
    'Cache-Control': 'no-store',
    // 有些情境會被導去 consent/interstitial；這個 cookie 有時可降低干擾（非保證）
    'Cookie': 'CONSENT=YES+cb.20210328-17-p0.en+FX+917;',
    ...extra
  };
}

function jsonHeaders() {
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*'
  };
}

function withCommonQuery(urlStr) {
  // 盡量降低 consent/語系差異造成解析困難（非保證，但實務提升穩定度）
  const u = new URL(urlStr);
  if (!u.searchParams.has('ucbcb')) u.searchParams.set('ucbcb', '1');
  if (!u.searchParams.has('hl')) u.searchParams.set('hl', 'en');
  if (!u.searchParams.has('gl')) u.searchParams.set('gl', 'US');
  return u.toString();
}

async function fetchHtml(url, { redirect = 'follow', headers = {} } = {}) {
  const resp = await fetch(url, {
    method: 'GET',
    redirect,
    credentials: 'omit',
    cache: 'no-store',
    headers: baseHtmlHeaders(headers)
  });
  const text = await resp.text().catch(() => '');
  return { resp, text };
}

// ------------------------------
// Watch 頁解析（ytInitialPlayerResponse）
// ------------------------------
function tryExtractJsonAssignment(html, varName) {
  const needles = [
    `var ${varName} =`,
    `${varName} =`,
    `"${varName}":`
  ];

  for (const needle of needles) {
    const idx = html.indexOf(needle);
    if (idx === -1) continue;

    const jsonStr = extractJsonObjectByBraceMatching(html, idx + needle.length);
    if (!jsonStr) continue;

    try {
      return JSON.parse(jsonStr);
    } catch {
      // keep trying
    }
  }

  return null;
}

function extractJsonObjectByBraceMatching(text, startIndex) {
  const firstBrace = text.indexOf('{', startIndex);
  if (firstBrace === -1) return null;

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = firstBrace; i < text.length; i++) {
    const ch = text[i];

    if (inString) {
      if (escape) {
        escape = false;
      } else if (ch === '\\') {
        escape = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === '{') depth++;
    if (ch === '}') depth--;

    if (depth === 0) {
      return text.slice(firstBrace, i + 1);
    }
  }

  return null;
}

function parseWatchHtml(html) {
  const ipr = tryExtractJsonAssignment(html, 'ytInitialPlayerResponse');
  const vd = ipr?.videoDetails || null;

  let videoId = vd?.videoId || null;
  let channelId = vd?.channelId || null;

  // fallback：有些頁面 videoDetails 不完整，但 html 仍可能有 channelId
  if (!channelId) {
    const m1 = html.match(/"channelId":"(UC[a-zA-Z0-9_-]{22})"/);
    if (m1) channelId = m1[1];
    if (!channelId) {
      const m2 = html.match(/itemprop="channelId"\s+content="(UC[a-zA-Z0-9_-]{22})"/);
      if (m2) channelId = m2[1];
    }
  }
  if (!videoId) {
    const mv = html.match(/"videoId":"([a-zA-Z0-9_-]{11})"/);
    if (mv) videoId = mv[1];
  }

  const mf = ipr?.microformat?.playerMicroformatRenderer;
  const liveDetails = mf?.liveBroadcastDetails;

  const isLiveNow =
    liveDetails?.isLiveNow === true ||
    ipr?.playabilityStatus?.status === 'LIVE_STREAM' ||
    /"playabilityStatus":\{"status":"LIVE_STREAM"/.test(html);

  const isUpcoming =
    liveDetails?.isUpcoming === true ||
    /"isUpcoming":true/.test(html);

  const looksLikeConsent =
    html.includes('consent.youtube.com') ||
    (html.includes('consent') && html.includes('Continue') && !channelId);

  return {
    videoId,
    channelId,
    isLiveNow: !!isLiveNow,
    isUpcoming: !!isUpcoming,
    looksLikeConsent: !!looksLikeConsent
  };
}

function extractVideoIdFromWatchUrl(watchUrl) {
  try {
    const u = new URL(watchUrl);
    const v = u.searchParams.get('v');
    if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) return v;
  } catch { }
  const parts = watchUrl.split('v=');
  const vid = parts.length > 1 ? parts[1].split('&')[0] : null;
  return vid && /^[a-zA-Z0-9_-]{11}$/.test(vid) ? vid : null;
}

// --- watch 驗證：替代 YouTube Data API 的第 3 步 ---
async function verifyWatchUrlAgainstChannel(originalChannelId, watchUrl, stepInfo) {
  const verifiedUrl = withCommonQuery(watchUrl);

  const { resp, text } = await fetchHtml(verifiedUrl, { redirect: 'follow' });
  stepInfo.watchFetchStatus = resp.status;

  if (!resp.ok || !text) {
    return {
      ok: false,
      status: 'VERIFY_FAILED',
      reason: `watch fetch failed: ${resp.status}`,
      verifiedVideoChannelId: null,
      liveStatus: 'OFFLINE'
    };
  }

  const w = parseWatchHtml(text);

  if (w.looksLikeConsent) {
    return {
      ok: false,
      status: 'CONSENT',
      reason: 'consent/interstitial detected',
      verifiedVideoChannelId: w.channelId || null,
      liveStatus: 'OFFLINE'
    };
  }

  if (!w.channelId) {
    return {
      ok: false,
      status: 'VERIFY_FAILED',
      reason: 'watch missing channelId',
      verifiedVideoChannelId: null,
      liveStatus: 'OFFLINE'
    };
  }

  if (w.channelId !== originalChannelId) {
    return {
      ok: false,
      status: 'MISMATCH',
      reason: `channel mismatch: ${w.channelId}`,
      verifiedVideoChannelId: w.channelId,
      liveStatus: 'OFFLINE'
    };
  }

  // ✅ 排程直播：可回傳 upcoming，但外層不把它當 LIVE
  if (w.isLiveNow) {
    return {
      ok: true,
      status: 'VERIFIED',
      reason: 'live now (watch verified)',
      verifiedVideoChannelId: w.channelId,
      liveStatus: 'LIVE'
    };
  }

  if (w.isUpcoming) {
    return {
      ok: true,
      status: 'VERIFIED',
      reason: 'upcoming (watch verified)',
      verifiedVideoChannelId: w.channelId,
      liveStatus: 'UPCOMING'
    };
  }

  return {
    ok: true,
    status: 'VERIFIED',
    reason: 'not live (watch verified)',
    verifiedVideoChannelId: w.channelId,
    liveStatus: 'OFFLINE'
  };
}

// ------------------------------
// /live 頁解析：只用來拿候選 videoId（不直接宣告 LIVE）
// ------------------------------
async function checkYouTubeChannelLiveFromHTML(channelId, html) {
  const vidMatch = html.match(/"videoId":"([a-zA-Z0-9_-]{11})"/);
  const videoId = vidMatch ? vidMatch[1] : null;

  const isActuallyLive =
    /"isUpcoming":false[^}]*"isLive":true/.test(html) ||
    /"isLive":true[^}]*"isUpcoming":false/.test(html);

  if (isActuallyLive && videoId) {
    return {
      status: 'CANDIDATE',
      videoId,
      finalUrl: `https://www.youtube.com/watch?v=${videoId}`,
      message: '偵測到可能直播（/live 標記）',
      method: 'HTML_PARSE_LIVE_AS_CANDIDATE'
    };
  }

  const isUpcoming = /"isUpcoming":true/.test(html);
  if (isUpcoming && videoId) {
    return {
      status: 'UPCOMING',
      videoId,
      finalUrl: `https://www.youtube.com/watch?v=${videoId}`,
      message: '偵測到排程（/live 標記）',
      method: 'HTML_PARSE_UPCOMING'
    };
  }

  const hasLiveMarkers =
    html.includes('"isLive":true') ||
    html.includes('isLiveBroadcast') ||
    /"playabilityStatus":{"status":"LIVE_STREAM"/.test(html);

  if (hasLiveMarkers && videoId) {
    return {
      status: 'CANDIDATE',
      videoId,
      finalUrl: `https://www.youtube.com/watch?v=${videoId}`,
      message: '偵測到可能直播（待 watch 驗證）',
      method: 'HTML_PARSE_CANDIDATE'
    };
  }

  return {
    status: 'OFFLINE',
    videoId: null,
    finalUrl: null,
    message: '未開台（/live 解析）',
    method: 'HTML_PARSE_OFFLINE'
  };
}

// ------------------------------
// 頻道首頁解析：你提出的「從頻道頁 HTML 搜直播連結」入口
// ------------------------------
function uniq(arr) {
  return Array.from(new Set(arr.filter(Boolean)));
}

function extractCandidatesFromChannelPageHtml(html) {
  // 1) 優先：抓 LIVE badge 附近的 videoId（最像你截圖那種「直播中」區塊）
  // 常見結構會出現 thumbnailOverlayTimeStatusRenderer + style LIVE
  const liveIds = [];
  const liveBadgeRegex = /thumbnailOverlayTimeStatusRenderer"\s*:\s*\{[^}]*"style"\s*:\s*"LIVE"[^}]*\}[\s\S]{0,800}?"videoId"\s*:\s*"([a-zA-Z0-9_-]{11})"/g;
  let m;
  while ((m = liveBadgeRegex.exec(html)) !== null) {
    liveIds.push(m[1]);
    if (liveIds.length >= 8) break;
  }

  // 2) fallback：如果抓不到 badge，用 isLive/isUpcoming 附近關聯的 videoId
  const liveJsonRegex = /"isLive"\s*:\s*true[\s\S]{0,500}?"isUpcoming"\s*:\s*false[\s\S]{0,800}?"videoId"\s*:\s*"([a-zA-Z0-9_-]{11})"/g;
  while ((m = liveJsonRegex.exec(html)) !== null) {
    liveIds.push(m[1]);
    if (liveIds.length >= 12) break;
  }

  // 3) 排程候選（我們會回報 isUpcoming，但不當 LIVE）
  const upcomingIds = [];
  const upcomingRegex = /"isUpcoming"\s*:\s*true[\s\S]{0,800}?"videoId"\s*:\s*"([a-zA-Z0-9_-]{11})"/g;
  while ((m = upcomingRegex.exec(html)) !== null) {
    upcomingIds.push(m[1]);
    if (upcomingIds.length >= 12) break;
  }

  return {
    liveVideoIds: uniq(liveIds),
    upcomingVideoIds: uniq(upcomingIds)
  };
}

// ------------------------------
// 工具函數
// ------------------------------
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function tryChannelHomeFallback(channelId, redirectChain, stepBase = 100) {
  const channelHomeUrl = withCommonQuery(`https://www.youtube.com/channel/${channelId}`);
  const stepInfo = {
    step: stepBase,
    requestedUrl: channelHomeUrl,
    status: null,
    method: 'CHANNEL_HOME_HTML_PARSE',
    timestamp: new Date().toISOString()
  };

  try {
    const { resp, text } = await fetchHtml(channelHomeUrl, { redirect: 'follow' });
    stepInfo.status = resp.status;
    if (!resp.ok || !text) {
      redirectChain.push({ ...stepInfo, message: `channel home fetch failed: ${resp.status}` });
      return null;
    }

    const c = extractCandidatesFromChannelPageHtml(text);

    // 先驗證 LIVE 候選
    for (const vid of c.liveVideoIds.slice(0, MAX_CANDIDATES_TO_VERIFY)) {
      // 增加驗證間隔延遲 (1500ms)
      if (c.liveVideoIds.indexOf(vid) > 0) await delay(1500);

      const watchUrl = withCommonQuery(`https://www.youtube.com/watch?v=${vid}`);
      const perCandidate = {
        ...stepInfo,
        candidateWatch: watchUrl,
        candidateType: 'LIVE_CANDIDATE'
      };

      const v = await verifyWatchUrlAgainstChannel(channelId, watchUrl, perCandidate);

      redirectChain.push({
        ...perCandidate,
        verificationStatus: v.status,
        verifiedVideoChannelId: v.verifiedVideoChannelId,
        verifyReason: v.reason,
        watchFetchStatus: perCandidate.watchFetchStatus
      });

      if (v.liveStatus === 'LIVE') {
        return {
          kind: 'LIVE',
          videoId: vid,
          finalUrl: watchUrl,
          verificationStatus: v.status,
          verifiedVideoChannelId: v.verifiedVideoChannelId,
          message: v.reason
        };
      }
    }

    // 再處理 UPCOMING（回報，但不上線）
    for (const vid of c.upcomingVideoIds.slice(0, MAX_CANDIDATES_TO_VERIFY)) {
      // 增加驗證間隔延遲 (1500ms)
      // 如果前面有跑 LIVE 驗證，這裡也要 delay (簡單起見，每次迴圈前都 delay)
      await delay(1500);

      const watchUrl = withCommonQuery(`https://www.youtube.com/watch?v=${vid}`);
      const perCandidate = {
        ...stepInfo,
        candidateWatch: watchUrl,
        candidateType: 'UPCOMING_CANDIDATE'
      };

      const v = await verifyWatchUrlAgainstChannel(channelId, watchUrl, perCandidate);

      redirectChain.push({
        ...perCandidate,
        verificationStatus: v.status,
        verifiedVideoChannelId: v.verifiedVideoChannelId,
        verifyReason: v.reason,
        watchFetchStatus: perCandidate.watchFetchStatus
      });

      if (v.liveStatus === 'UPCOMING') {
        return {
          kind: 'UPCOMING',
          videoId: vid,
          finalUrl: watchUrl,
          verificationStatus: v.status,
          verifiedVideoChannelId: v.verifiedVideoChannelId,
          message: '排程直播（已驗證）'
        };
      }
    }

    return null;
  } catch (e) {
    redirectChain.push({ ...stepInfo, message: `channel home fetch error: ${e?.message || 'unknown'}` });
    return null;
  }
}

// ------------------------------
// redirect 遞迴（保留你原本行為，但不再「看到 watch 就當 LIVE」）
// ------------------------------
async function checkLiveStatusRecursive(channelId, url, redirects, redirectChain = []) {
  if (redirects >= MAX_REDIRECTS) {
    return {
      status: 'ERROR',
      videoId: null,
      finalUrl: url,
      message: 'Reached maximum redirect count.',
      verificationStatus: 'VERIFY_FAILED',
      verifiedVideoChannelId: null,
      redirectChain
    };
  }

  const headers = baseHtmlHeaders({
    'DNT': '1',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1'
  });

  try {
    const requestUrl = withCommonQuery(url);

    const response = await fetch(requestUrl, {
      method: 'GET',
      redirect: 'manual',
      headers
    });

    const status = response.status;
    const finalUrl = response.url || url;
    const locationHeader = response.headers.get('Location');

    const stepInfo = {
      step: redirects + 1,
      requestedUrl: requestUrl,
      status,
      responseUrl: finalUrl,
      locationHeader: locationHeader || null,
      timestamp: new Date().toISOString()
    };
    redirectChain.push(stepInfo);

    // --- 3xx redirect ---
    if (status >= 300 && status < 400) {
      if (!locationHeader) {
        return {
          status: 'ERROR',
          videoId: null,
          finalUrl: url,
          message: 'Redirect without Location header',
          verificationStatus: 'VERIFY_FAILED',
          verifiedVideoChannelId: null,
          redirectChain
        };
      }

      const newUrl = new URL(locationHeader, requestUrl).toString();
      stepInfo.redirectTo = newUrl;

      if (newUrl.includes('watch?v=')) {
        const videoId = extractVideoIdFromWatchUrl(newUrl);
        const v = await verifyWatchUrlAgainstChannel(channelId, newUrl, stepInfo);

        if (v.liveStatus === 'LIVE') {
          return {
            status: 'LIVE',
            videoId,
            finalUrl: newUrl,
            message: v.reason,
            verificationStatus: v.status,
            verifiedVideoChannelId: v.verifiedVideoChannelId,
            redirectChain
          };
        }

        if (v.liveStatus === 'UPCOMING') {
          return {
            status: 'UPCOMING',
            videoId,
            finalUrl: newUrl,
            message: '排程直播（已驗證）',
            verificationStatus: v.status,
            verifiedVideoChannelId: v.verifiedVideoChannelId,
            redirectChain
          };
        }

        return {
          status: 'OFFLINE',
          videoId: null,
          finalUrl: url,
          message: v.reason,
          verificationStatus: v.status,
          verifiedVideoChannelId: v.verifiedVideoChannelId,
          redirectChain
        };
      }

      // 增加轉導延遲 (1500ms)
      await delay(1500);

      return checkLiveStatusRecursive(channelId, newUrl, redirects + 1, redirectChain);
    }

    // --- 200 OK ---
    if (status === 200) {
      // 如果這次 response.url 就已是 watch?v=
      if (finalUrl.includes('watch?v=')) {
        const videoId = extractVideoIdFromWatchUrl(finalUrl);
        const v = await verifyWatchUrlAgainstChannel(channelId, finalUrl, stepInfo);

        if (v.liveStatus === 'LIVE') {
          return {
            status: 'LIVE',
            videoId,
            finalUrl,
            message: v.reason,
            verificationStatus: v.status,
            verifiedVideoChannelId: v.verifiedVideoChannelId,
            redirectChain
          };
        }

        if (v.liveStatus === 'UPCOMING') {
          return {
            status: 'UPCOMING',
            videoId,
            finalUrl,
            message: '排程直播（已驗證）',
            verificationStatus: v.status,
            verifiedVideoChannelId: v.verifiedVideoChannelId,
            redirectChain
          };
        }

        return {
          status: 'OFFLINE',
          videoId: null,
          finalUrl: url,
          message: v.reason,
          verificationStatus: v.status,
          verifiedVideoChannelId: v.verifiedVideoChannelId,
          redirectChain
        };
      }

      // 先用 HTML 解析拿候選 videoId（不直接判 LIVE）
      try {
        const { resp: htmlResp, text: html } = await fetchHtml(requestUrl, { redirect: 'follow' });
        if (htmlResp.ok && html) {
          const htmlCheckResult = await checkYouTubeChannelLiveFromHTML(channelId, html);
          stepInfo.redirectSource = htmlCheckResult.method || 'HTML_PARSE';

          if (htmlCheckResult.finalUrl && htmlCheckResult.finalUrl.includes('watch?v=')) {
            const watchUrl = withCommonQuery(htmlCheckResult.finalUrl);
            const videoId = extractVideoIdFromWatchUrl(watchUrl);

            const v = await verifyWatchUrlAgainstChannel(channelId, watchUrl, stepInfo);

            if (v.liveStatus === 'LIVE') {
              stepInfo.redirectTo = watchUrl;
              stepInfo.redirectSource = 'LIVE_FROM_WATCH_VERIFY';
              return {
                status: 'LIVE',
                videoId,
                finalUrl: watchUrl,
                message: v.reason,
                verificationStatus: v.status,
                verifiedVideoChannelId: v.verifiedVideoChannelId,
                redirectChain
              };
            }

            if (v.liveStatus === 'UPCOMING') {
              stepInfo.redirectTo = watchUrl;
              stepInfo.redirectSource = 'UPCOMING_FROM_WATCH_VERIFY';
              return {
                status: 'UPCOMING',
                videoId,
                finalUrl: watchUrl,
                message: '排程直播（已驗證）',
                verificationStatus: v.status,
                verifiedVideoChannelId: v.verifiedVideoChannelId,
                redirectChain
              };
            }

            return {
              status: 'OFFLINE',
              videoId: null,
              finalUrl: url,
              message: v.reason,
              verificationStatus: v.status,
              verifiedVideoChannelId: v.verifiedVideoChannelId,
              redirectChain
            };
          }

          if (htmlCheckResult.status === 'OFFLINE') {
            return {
              status: 'OFFLINE',
              videoId: null,
              finalUrl: url,
              message: htmlCheckResult.message,
              verificationStatus: 'NOT_NEEDED',
              verifiedVideoChannelId: null,
              redirectChain
            };
          }
        }
      } catch {
        // ignore
      }

      return {
        status: 'OFFLINE',
        videoId: null,
        finalUrl: url,
        message: '未開台',
        verificationStatus: 'NOT_NEEDED',
        verifiedVideoChannelId: null,
        redirectChain
      };
    }

    if (status === 404) {
      return {
        status: 'ERROR',
        videoId: null,
        finalUrl: url,
        message: '頻道不存在或已刪除 (404)',
        verificationStatus: 'VERIFY_FAILED',
        verifiedVideoChannelId: null,
        redirectChain
      };
    }

    return {
      status: 'ERROR',
      videoId: null,
      finalUrl: url,
      message: `Received unexpected status code: ${status}`,
      verificationStatus: 'VERIFY_FAILED',
      verifiedVideoChannelId: null,
      redirectChain
    };
  } catch (error) {
    return {
      status: 'ERROR',
      videoId: null,
      finalUrl: url,
      message: `Fetch error: ${error.message}`,
      verificationStatus: 'VERIFY_FAILED',
      verifiedVideoChannelId: null,
      redirectChain
    };
  }
}

async function handleChannelLiveRequest(request) {
  try {
    const url = new URL(request.url);
    const channelId = url.searchParams.get('channelId');

    if (!channelId) {
      return new Response(JSON.stringify({ error: '缺少 channelId 參數' }), {
        status: 400,
        headers: jsonHeaders()
      });
    }

    if (!/^UC[a-zA-Z0-9_-]{22}$/.test(channelId)) {
      return new Response(JSON.stringify({ error: '無效的 channelId 格式' }), {
        status: 400,
        headers: jsonHeaders()
      });
    }

    const liveUrl = withCommonQuery(`https://www.youtube.com/channel/${channelId}/live`);
    const redirectChain = [];

    // 入口 A：/live HTML → watch 驗證
    try {
      const { resp: htmlResp, text: html } = await fetchHtml(liveUrl, { redirect: 'follow' });
      if (!htmlResp.ok) throw new Error(`HTTP ${htmlResp.status}: ${htmlResp.statusText}`);

      const htmlCheckResult = await checkYouTubeChannelLiveFromHTML(channelId, html);

      if (htmlCheckResult.finalUrl && htmlCheckResult.finalUrl.includes('watch?v=')) {
        const candidateWatch = withCommonQuery(htmlCheckResult.finalUrl);
        const videoId = extractVideoIdFromWatchUrl(candidateWatch);

        const stepInfo = {
          step: 1,
          requestedUrl: liveUrl,
          status: htmlResp.status,
          method: htmlCheckResult.method || 'HTML_PARSE',
          candidateWatch,
          timestamp: new Date().toISOString()
        };

        const v = await verifyWatchUrlAgainstChannel(channelId, candidateWatch, stepInfo);

        // ✅ LIVE
        if (v.liveStatus === 'LIVE') {
          return new Response(JSON.stringify({
            status: 200,
            finalUrl: candidateWatch,
            isLive: true,
            liveVideoId: videoId || null,
            scheduledVideoId: null,
            isUpcoming: false,
            message: v.reason,
            method: 'HTML_PARSE(/live) + WATCH_VERIFY',
            verificationStatus: v.status,
            verifiedVideoChannelId: v.verifiedVideoChannelId,
            redirectChain: [stepInfo]
          }), { status: 200, headers: jsonHeaders() });
        }

        // ✅ UPCOMING：回報但不上線
        if (v.liveStatus === 'UPCOMING') {
          return new Response(JSON.stringify({
            status: 200,
            finalUrl: liveUrl,
            isLive: false,
            liveVideoId: null,
            scheduledVideoId: videoId || null,
            isUpcoming: true,
            message: '排程直播（已驗證，已排除不上線）',
            method: 'HTML_PARSE(/live) + WATCH_VERIFY',
            verificationStatus: v.status,
            verifiedVideoChannelId: v.verifiedVideoChannelId,
            redirectChain: [stepInfo]
          }), { status: 200, headers: jsonHeaders() });
        }

        // 若這裡驗證失敗/缺 channelId/consent，繼續走入口 B
        redirectChain.push(stepInfo);
      } else if (htmlCheckResult.status === 'OFFLINE') {
        redirectChain.push({
          step: 1,
          requestedUrl: liveUrl,
          status: htmlResp.status,
          method: htmlCheckResult.method || 'HTML_PARSE',
          timestamp: new Date().toISOString(),
          message: htmlCheckResult.message
        });
      }
    } catch {
      // ignore → 繼續入口 B / redirect
    }

    // 入口 B：頻道首頁 HTML → 候選 → watch 驗證
    const homeFallback = await tryChannelHomeFallback(channelId, redirectChain, 100);
    if (homeFallback?.kind === 'LIVE') {
      return new Response(JSON.stringify({
        status: 200,
        finalUrl: homeFallback.finalUrl,
        isLive: true,
        liveVideoId: homeFallback.videoId,
        scheduledVideoId: null,
        isUpcoming: false,
        message: homeFallback.message || '開台中（頻道頁入口）',
        method: 'CHANNEL_HOME_HTML + WATCH_VERIFY',
        verificationStatus: homeFallback.verificationStatus || 'VERIFIED',
        verifiedVideoChannelId: homeFallback.verifiedVideoChannelId || channelId,
        redirectChain
      }), { status: 200, headers: jsonHeaders() });
    }

    if (homeFallback?.kind === 'UPCOMING') {
      return new Response(JSON.stringify({
        status: 200,
        finalUrl: liveUrl,
        isLive: false,
        liveVideoId: null,
        scheduledVideoId: homeFallback.videoId,
        isUpcoming: true,
        message: '排程直播（頻道頁入口已驗證，已排除不上線）',
        method: 'CHANNEL_HOME_HTML + WATCH_VERIFY',
        verificationStatus: homeFallback.verificationStatus || 'VERIFIED',
        verifiedVideoChannelId: homeFallback.verifiedVideoChannelId || channelId,
        redirectChain
      }), { status: 200, headers: jsonHeaders() });
    }

    // 最後：redirect 遞迴（內含 watch 驗證）
    const result = await checkLiveStatusRecursive(channelId, liveUrl, 0, redirectChain);

    // ✅ 最終輸出：UPCOMING 一律不當 LIVE（但提供 scheduledVideoId）
    const responseData = {
      status: result.status === 'ERROR' ? 500 : 200,
      finalUrl: result.status === 'LIVE' ? result.finalUrl : liveUrl,
      isLive: result.status === 'LIVE',
      liveVideoId: result.status === 'LIVE' ? (result.videoId || null) : null,
      scheduledVideoId: result.status === 'UPCOMING' ? (result.videoId || null) : null,
      isUpcoming: result.status === 'UPCOMING',
      message:
        result.status === 'LIVE'
          ? '開台中'
          : result.status === 'UPCOMING'
            ? '排程直播（已排除不上線）'
            : result.status === 'OFFLINE'
              ? '未開台'
              : (result.message || '未知狀態'),
      method: 'REDIRECT + WATCH_VERIFY (+ CHANNEL_HOME_FALLBACK)',
      verificationStatus: result.verificationStatus || 'VERIFY_FAILED',
      verifiedVideoChannelId: result.verifiedVideoChannelId || null,
      redirectChain: result.redirectChain || redirectChain || []
    };

    if (result.status === 'ERROR' && result.message && result.message.includes('404')) {
      responseData.status = 404;
      responseData.isLive = false;
      responseData.message = '頻道不存在或已刪除';
    }

    return new Response(JSON.stringify(responseData), { status: 200, headers: jsonHeaders() });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: '伺服器錯誤', message: error.message || '處理請求時發生未知錯誤' }),
      { status: 500, headers: jsonHeaders() }
    );
  }
}
