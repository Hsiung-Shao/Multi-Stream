// Cloudflare Pages Function: YouTube 頻道 /live 端點代理（強化版：不使用 YouTube Data API）
// 目的：
// 1) 透過 /channel/{id}/live 找候選 watch?v=
// 2) 一旦拿到 watch?v=，立刻抓 watch HTML 解析「影片所屬 channelId + isLive/isUpcoming」
// 3) 僅在 channelId match 且 isLiveNow 才回 LIVE（Fail-Closed）
// 4) 避免 redirect/consent/地區限制造成誤判或播到別人的台

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

// --- 通用 headers：讓 YouTube 回比較容易解析的 HTML ---
function baseHtmlHeaders(extra = {}) {
  return {
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
    'Cache-Control': 'no-store',
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
  // ucbcb=1 常見用法：降低 consent redirect 干擾
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

// --- 解析 ytInitialPlayerResponse (watch 頁最可靠) ---
function tryExtractJsonAssignment(html, varName) {
  // 支援多種常見型態：
  // 1) var ytInitialPlayerResponse = {...};
  // 2) ytInitialPlayerResponse = {...};
  // 3) "ytInitialPlayerResponse": {...}  (較少，但存在於某些內嵌 JSON)
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
      // 解析失敗就試下一種 needle
    }
  }

  return null;
}

function extractJsonObjectByBraceMatching(text, startIndex) {
  // 從 startIndex 開始，找到第一個 '{'，然後做大括號配對
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
  // 核心：watch 頁的 ytInitialPlayerResponse 裡通常有 videoDetails.channelId
  const ipr = tryExtractJsonAssignment(html, 'ytInitialPlayerResponse');
  const vd = ipr?.videoDetails || null;

  const videoId = vd?.videoId || null;
  const channelId = vd?.channelId || null;

  // live / upcoming
  const mf = ipr?.microformat?.playerMicroformatRenderer;
  const liveDetails = mf?.liveBroadcastDetails;

  const isLiveNow =
    liveDetails?.isLiveNow === true ||
    ipr?.playabilityStatus?.status === 'LIVE_STREAM';

  const isUpcoming =
    liveDetails?.isUpcoming === true;

  // 額外：同意頁/年齡限制頁通常沒有 videoDetails
  const looksLikeConsent =
    html.includes('consent.youtube.com') ||
    html.includes('consent') && html.includes('Continue') && !channelId;

  return {
    videoId,
    channelId,
    isLiveNow: !!isLiveNow,
    isUpcoming: !!isUpcoming,
    looksLikeConsent: !!looksLikeConsent
  };
}

// --- 你原本的 /live HTML 解析（保留：拿候選 videoId 用） ---
async function checkYouTubeChannelLiveFromHTML(channelId, html) {
  const vidMatch = html.match(/"videoId":"([a-zA-Z0-9_-]{11})"/);
  const videoId = vidMatch ? vidMatch[1] : null;

  const isActuallyLive =
    /"isUpcoming":false[^}]*"isLive":true/.test(html) ||
    /"isLive":true[^}]*"isUpcoming":false/.test(html);

  if (isActuallyLive && videoId) {
    return {
      status: 'LIVE',
      videoId,
      finalUrl: `https://www.youtube.com/watch?v=${videoId}`,
      message: '開台中',
      method: 'HTML_PARSE_LIVE'
    };
  }

  const isUpcoming = html.includes('"isUpcoming":true') || /"isUpcoming":true/.test(html);
  if (isUpcoming) {
    return {
      status: 'UPCOMING',
      videoId,
      finalUrl: videoId ? `https://www.youtube.com/watch?v=${videoId}` : null,
      message: '待機中（首播尚未開始）',
      method: 'HTML_PARSE_UPCOMING'
    };
  }

  const hasLiveMarkers =
    html.includes('"isLive":true') ||
    html.includes('isLiveBroadcast') ||
    /"playabilityStatus":{"status":"LIVE_STREAM"/.test(html);

  if (hasLiveMarkers && videoId) {
    // 這裡先不直接宣告 LIVE（因為 /live 頁不一定可信）
    // 只提供候選 videoId 給後續 watch 驗證使用
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
    message: '未開台',
    method: 'HTML_PARSE_OFFLINE'
  };
}

function extractVideoIdFromWatchUrl(watchUrl) {
  try {
    const u = new URL(watchUrl);
    const v = u.searchParams.get('v');
    if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) return v;
  } catch {}
  // fallback
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

// --- 遞迴重導向追蹤（強化：watch 一律走 verify，不再 fallback 假設 LIVE） ---
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

        // ★核心：watch 一律驗證
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
            message: v.reason,
            verificationStatus: v.status,
            verifiedVideoChannelId: v.verifiedVideoChannelId,
            redirectChain
          };
        }

        // mismatch / verify failed / not live → 一律不回 LIVE
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
            message: v.reason,
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

      // 先用 /live HTML 解析拿候選 videoId（但不直接判 LIVE）
      try {
        const { resp: htmlResp, text: html } = await fetchHtml(requestUrl, { redirect: 'follow' });
        if (htmlResp.ok && html) {
          const htmlCheckResult = await checkYouTubeChannelLiveFromHTML(channelId, html);
          stepInfo.redirectSource = htmlCheckResult.method || 'HTML_PARSE';

          if (htmlCheckResult.status === 'LIVE' || htmlCheckResult.status === 'CANDIDATE') {
            const watchUrl = htmlCheckResult.finalUrl;
            if (watchUrl && watchUrl.includes('watch?v=')) {
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
                  message: v.reason,
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
          // UPCOMING：也讓它走 watch 驗證（上面 candidate 分支已覆蓋）
        }
      } catch {
        // ignore
      }

      // 最後：停在非 watch 頁（通常表示沒開台）
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

    // /live endpoint（加 query 降低干擾）
    const liveUrl = withCommonQuery(`https://www.youtube.com/channel/${channelId}/live`);

    // 優先：抓 /live HTML 取候選 videoId → 再走 watch 驗證
    try {
      const { resp: htmlResp, text: html } = await fetchHtml(liveUrl, { redirect: 'follow' });
      if (!htmlResp.ok) throw new Error(`HTTP ${htmlResp.status}: ${htmlResp.statusText}`);

      const htmlCheckResult = await checkYouTubeChannelLiveFromHTML(channelId, html);

      // 若 /live 看起來有候選 videoId，立刻做 watch 驗證
      if (
        (htmlCheckResult.status === 'LIVE' || htmlCheckResult.status === 'UPCOMING' || htmlCheckResult.status === 'CANDIDATE') &&
        htmlCheckResult.finalUrl &&
        htmlCheckResult.finalUrl.includes('watch?v=')
      ) {
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

        const responseData = {
          status: 200,
          finalUrl: v.liveStatus === 'LIVE' || v.liveStatus === 'UPCOMING' ? candidateWatch : liveUrl,
          isLive: v.liveStatus === 'LIVE',
          liveVideoId: v.liveStatus === 'LIVE' ? (videoId || null) : null,
          scheduledVideoId: v.liveStatus === 'UPCOMING' ? (videoId || null) : null,
          isUpcoming: v.liveStatus === 'UPCOMING',
          message: v.reason,
          method: 'HTML_PARSE + WATCH_VERIFY',
          verificationStatus: v.status,
          verifiedVideoChannelId: v.verifiedVideoChannelId,
          redirectChain: [stepInfo]
        };

        return new Response(JSON.stringify(responseData), { status: 200, headers: jsonHeaders() });
      }

      // /live HTML 明確 OFFLINE
      if (htmlCheckResult.status === 'OFFLINE') {
        const responseData = {
          status: 200,
          finalUrl: liveUrl,
          isLive: false,
          liveVideoId: null,
          scheduledVideoId: null,
          isUpcoming: false,
          message: htmlCheckResult.message,
          method: htmlCheckResult.method || 'HTML_PARSE',
          verificationStatus: 'NOT_NEEDED',
          verifiedVideoChannelId: null,
          redirectChain: [{
            step: 1,
            requestedUrl: liveUrl,
            status: htmlResp.status,
            method: htmlCheckResult.method || 'HTML_PARSE',
            timestamp: new Date().toISOString()
          }]
        };
        return new Response(JSON.stringify(responseData), { status: 200, headers: jsonHeaders() });
      }

      // 其他情況：走 redirect 遞迴（內含 watch 驗證）
    } catch {
      // ignore → redirect 遞迴
    }

    const result = await checkLiveStatusRecursive(channelId, liveUrl, 0);

    const responseData = {
      status: result.status === 'ERROR' ? 500 : 200,
      finalUrl: result.finalUrl,
      isLive: result.status === 'LIVE',
      liveVideoId: result.status === 'LIVE' ? (result.videoId || null) : null,
      scheduledVideoId: result.status === 'UPCOMING' ? (result.videoId || null) : null,
      isUpcoming: result.status === 'UPCOMING',
      message:
        result.status === 'LIVE'
          ? '開台中'
          : result.status === 'UPCOMING'
            ? '待機中（首播尚未開始）'
            : result.status === 'OFFLINE'
              ? '未開台'
              : (result.message || '未知狀態'),
      method: 'REDIRECT + WATCH_VERIFY',
      verificationStatus: result.verificationStatus || 'VERIFY_FAILED',
      verifiedVideoChannelId: result.verifiedVideoChannelId || null,
      redirectChain: result.redirectChain || []
    };

    // 頻道不存在
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
