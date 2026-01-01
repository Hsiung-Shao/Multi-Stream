var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// .wrangler/tmp/pages-vd7pGV/functionsWorker-0.9334920914848587.mjs
var __defProp2 = Object.defineProperty;
var __name2 = /* @__PURE__ */ __name((target, value) => __defProp2(target, "name", { value, configurable: true }), "__name");
async function onRequestGet(context) {
  const { request, env } = context;
  return handleConfigRequest(request, env);
}
__name(onRequestGet, "onRequestGet");
__name2(onRequestGet, "onRequestGet");
async function handleConfigRequest(request, env) {
  try {
    const clientId = env?.TWITCH_CLIENT_ID || null;
    return new Response(
      JSON.stringify({
        clientId,
        useProxy: false
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
          "Cache-Control": "public, max-age=3600"
        }
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: "\u4F3A\u670D\u5668\u932F\u8AA4",
        message: error.message || "\u8655\u7406\u8ACB\u6C42\u6642\u767C\u751F\u672A\u77E5\u932F\u8AA4"
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type"
        }
      }
    );
  }
}
__name(handleConfigRequest, "handleConfigRequest");
__name2(handleConfigRequest, "handleConfigRequest");
async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400"
    }
  });
}
__name(onRequestOptions, "onRequestOptions");
__name2(onRequestOptions, "onRequestOptions");
async function onRequestGet2(contextOrRequest, env) {
  let request, envObj;
  if (contextOrRequest && contextOrRequest.request) {
    request = contextOrRequest.request;
    envObj = contextOrRequest.env;
  } else {
    request = contextOrRequest;
    envObj = env;
  }
  return handleTokenRequest(request, envObj);
}
__name(onRequestGet2, "onRequestGet2");
__name2(onRequestGet2, "onRequestGet");
async function onRequestPost(contextOrRequest, env) {
  let request, envObj;
  if (contextOrRequest && contextOrRequest.request) {
    request = contextOrRequest.request;
    envObj = contextOrRequest.env;
  } else {
    request = contextOrRequest;
    envObj = env;
  }
  return handleTokenRequest(request, envObj);
}
__name(onRequestPost, "onRequestPost");
__name2(onRequestPost, "onRequestPost");
async function handleTokenRequest(request, env) {
  try {
    if (!env) {
      return new Response(
        JSON.stringify({
          error: "\u914D\u7F6E\u932F\u8AA4",
          message: "\u74B0\u5883\u8B8A\u6578\u672A\u914D\u7F6E"
        }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type"
          }
        }
      );
    }
    const clientId = env.TWITCH_CLIENT_ID;
    const clientSecret = env.TWITCH_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return new Response(
        JSON.stringify({
          error: "\u914D\u7F6E\u932F\u8AA4",
          message: "\u7F3A\u5C11\u5FC5\u8981\u7684\u74B0\u5883\u8B8A\u6578"
        }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type"
          }
        }
      );
    }
    const params = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "client_credentials"
    });
    const response = await fetch("https://id.twitch.tv/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: params.toString()
    });
    if (!response.ok) {
      const errorText = await response.text();
      return new Response(
        JSON.stringify({
          error: "\u53D6\u5F97 Token \u5931\u6557",
          message: `Twitch API \u56DE\u61C9\uFF1A${response.status} ${response.statusText}`
        }),
        {
          status: response.status,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type"
          }
        }
      );
    }
    const data = await response.json();
    if (!data.access_token) {
      return new Response(
        JSON.stringify({
          error: "\u7121\u6548\u7684\u56DE\u61C9",
          message: "Twitch API \u56DE\u61C9\u4E2D\u6C92\u6709 access_token"
        }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type"
          }
        }
      );
    }
    return new Response(
      JSON.stringify({
        access_token: data.access_token,
        expires_in: data.expires_in || 3600,
        token_type: data.token_type || "bearer"
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
          // 快取控制：Token 通常有效期為 1 小時，建議客戶端快取
          "Cache-Control": "private, max-age=3000"
          // 快取 50 分鐘（略小於 1 小時）
        }
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: "\u4F3A\u670D\u5668\u932F\u8AA4",
        message: error.message || "\u8655\u7406\u8ACB\u6C42\u6642\u767C\u751F\u672A\u77E5\u932F\u8AA4"
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type"
        }
      }
    );
  }
}
__name(handleTokenRequest, "handleTokenRequest");
__name2(handleTokenRequest, "handleTokenRequest");
async function onRequestOptions2(contextOrRequest, env) {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400"
      // 24 小時
    }
  });
}
__name(onRequestOptions2, "onRequestOptions2");
__name2(onRequestOptions2, "onRequestOptions");
async function onRequestGet3(contextOrRequest, env) {
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
__name(onRequestGet3, "onRequestGet3");
__name2(onRequestGet3, "onRequestGet");
async function onRequestOptions3() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400"
    }
  });
}
__name(onRequestOptions3, "onRequestOptions3");
__name2(onRequestOptions3, "onRequestOptions");
var MAX_REDIRECTS = 6;
var MAX_CANDIDATES_TO_VERIFY = 3;
function baseHtmlHeaders(extra = {}) {
  return {
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
    "Cache-Control": "no-store",
    // 有些情境會被導去 consent/interstitial；這個 cookie 有時可降低干擾（非保證）
    "Cookie": "CONSENT=YES+cb.20210328-17-p0.en+FX+917;",
    ...extra
  };
}
__name(baseHtmlHeaders, "baseHtmlHeaders");
__name2(baseHtmlHeaders, "baseHtmlHeaders");
function jsonHeaders() {
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*"
  };
}
__name(jsonHeaders, "jsonHeaders");
__name2(jsonHeaders, "jsonHeaders");
function withCommonQuery(urlStr) {
  const u = new URL(urlStr);
  if (!u.searchParams.has("ucbcb")) u.searchParams.set("ucbcb", "1");
  if (!u.searchParams.has("hl")) u.searchParams.set("hl", "en");
  if (!u.searchParams.has("gl")) u.searchParams.set("gl", "US");
  return u.toString();
}
__name(withCommonQuery, "withCommonQuery");
__name2(withCommonQuery, "withCommonQuery");
async function fetchHtml(url, { redirect = "follow", headers = {} } = {}) {
  const resp = await fetch(url, {
    method: "GET",
    redirect,
    credentials: "omit",
    cache: "no-store",
    headers: baseHtmlHeaders(headers)
  });
  const text = await resp.text().catch(() => "");
  return { resp, text };
}
__name(fetchHtml, "fetchHtml");
__name2(fetchHtml, "fetchHtml");
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
    }
  }
  return null;
}
__name(tryExtractJsonAssignment, "tryExtractJsonAssignment");
__name2(tryExtractJsonAssignment, "tryExtractJsonAssignment");
function extractJsonObjectByBraceMatching(text, startIndex) {
  const firstBrace = text.indexOf("{", startIndex);
  if (firstBrace === -1) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = firstBrace; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escape) {
        escape = false;
      } else if (ch === "\\") {
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
    if (ch === "{") depth++;
    if (ch === "}") depth--;
    if (depth === 0) {
      return text.slice(firstBrace, i + 1);
    }
  }
  return null;
}
__name(extractJsonObjectByBraceMatching, "extractJsonObjectByBraceMatching");
__name2(extractJsonObjectByBraceMatching, "extractJsonObjectByBraceMatching");
function parseWatchHtml(html) {
  const ipr = tryExtractJsonAssignment(html, "ytInitialPlayerResponse");
  const vd = ipr?.videoDetails || null;
  let videoId = vd?.videoId || null;
  let channelId = vd?.channelId || null;
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
  const isLiveNow = liveDetails?.isLiveNow === true || ipr?.playabilityStatus?.status === "LIVE_STREAM" || /"playabilityStatus":\{"status":"LIVE_STREAM"/.test(html);
  const isUpcoming = liveDetails?.isUpcoming === true || /"isUpcoming":true/.test(html);
  const looksLikeConsent = html.includes("consent.youtube.com") || html.includes("consent") && html.includes("Continue") && !channelId;
  return {
    videoId,
    channelId,
    isLiveNow: !!isLiveNow,
    isUpcoming: !!isUpcoming,
    looksLikeConsent: !!looksLikeConsent
  };
}
__name(parseWatchHtml, "parseWatchHtml");
__name2(parseWatchHtml, "parseWatchHtml");
function extractVideoIdFromWatchUrl(watchUrl) {
  try {
    const u = new URL(watchUrl);
    const v = u.searchParams.get("v");
    if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) return v;
  } catch {
  }
  const parts = watchUrl.split("v=");
  const vid = parts.length > 1 ? parts[1].split("&")[0] : null;
  return vid && /^[a-zA-Z0-9_-]{11}$/.test(vid) ? vid : null;
}
__name(extractVideoIdFromWatchUrl, "extractVideoIdFromWatchUrl");
__name2(extractVideoIdFromWatchUrl, "extractVideoIdFromWatchUrl");
async function verifyWatchUrlAgainstChannel(originalChannelId, watchUrl, stepInfo) {
  const verifiedUrl = withCommonQuery(watchUrl);
  const { resp, text } = await fetchHtml(verifiedUrl, { redirect: "follow" });
  stepInfo.watchFetchStatus = resp.status;
  if (!resp.ok || !text) {
    return {
      ok: false,
      status: "VERIFY_FAILED",
      reason: `watch fetch failed: ${resp.status}`,
      verifiedVideoChannelId: null,
      liveStatus: "OFFLINE"
    };
  }
  const w = parseWatchHtml(text);
  if (w.looksLikeConsent) {
    return {
      ok: false,
      status: "CONSENT",
      reason: "consent/interstitial detected",
      verifiedVideoChannelId: w.channelId || null,
      liveStatus: "OFFLINE"
    };
  }
  if (!w.channelId) {
    return {
      ok: false,
      status: "VERIFY_FAILED",
      reason: "watch missing channelId",
      verifiedVideoChannelId: null,
      liveStatus: "OFFLINE"
    };
  }
  if (w.channelId !== originalChannelId) {
    return {
      ok: false,
      status: "MISMATCH",
      reason: `channel mismatch: ${w.channelId}`,
      verifiedVideoChannelId: w.channelId,
      liveStatus: "OFFLINE"
    };
  }
  if (w.isLiveNow) {
    return {
      ok: true,
      status: "VERIFIED",
      reason: "live now (watch verified)",
      verifiedVideoChannelId: w.channelId,
      liveStatus: "LIVE"
    };
  }
  if (w.isUpcoming) {
    return {
      ok: true,
      status: "VERIFIED",
      reason: "upcoming (watch verified)",
      verifiedVideoChannelId: w.channelId,
      liveStatus: "UPCOMING"
    };
  }
  return {
    ok: true,
    status: "VERIFIED",
    reason: "not live (watch verified)",
    verifiedVideoChannelId: w.channelId,
    liveStatus: "OFFLINE"
  };
}
__name(verifyWatchUrlAgainstChannel, "verifyWatchUrlAgainstChannel");
__name2(verifyWatchUrlAgainstChannel, "verifyWatchUrlAgainstChannel");
async function checkYouTubeChannelLiveFromHTML(channelId, html) {
  const vidMatch = html.match(/"videoId":"([a-zA-Z0-9_-]{11})"/);
  const videoId = vidMatch ? vidMatch[1] : null;
  const isActuallyLive = /"isUpcoming":false[^}]*"isLive":true/.test(html) || /"isLive":true[^}]*"isUpcoming":false/.test(html);
  if (isActuallyLive && videoId) {
    return {
      status: "CANDIDATE",
      videoId,
      finalUrl: `https://www.youtube.com/watch?v=${videoId}`,
      message: "\u5075\u6E2C\u5230\u53EF\u80FD\u76F4\u64AD\uFF08/live \u6A19\u8A18\uFF09",
      method: "HTML_PARSE_LIVE_AS_CANDIDATE"
    };
  }
  const isUpcoming = /"isUpcoming":true/.test(html);
  if (isUpcoming && videoId) {
    return {
      status: "UPCOMING",
      videoId,
      finalUrl: `https://www.youtube.com/watch?v=${videoId}`,
      message: "\u5075\u6E2C\u5230\u6392\u7A0B\uFF08/live \u6A19\u8A18\uFF09",
      method: "HTML_PARSE_UPCOMING"
    };
  }
  const hasLiveMarkers = html.includes('"isLive":true') || html.includes("isLiveBroadcast") || /"playabilityStatus":{"status":"LIVE_STREAM"/.test(html);
  if (hasLiveMarkers && videoId) {
    return {
      status: "CANDIDATE",
      videoId,
      finalUrl: `https://www.youtube.com/watch?v=${videoId}`,
      message: "\u5075\u6E2C\u5230\u53EF\u80FD\u76F4\u64AD\uFF08\u5F85 watch \u9A57\u8B49\uFF09",
      method: "HTML_PARSE_CANDIDATE"
    };
  }
  return {
    status: "OFFLINE",
    videoId: null,
    finalUrl: null,
    message: "\u672A\u958B\u53F0\uFF08/live \u89E3\u6790\uFF09",
    method: "HTML_PARSE_OFFLINE"
  };
}
__name(checkYouTubeChannelLiveFromHTML, "checkYouTubeChannelLiveFromHTML");
__name2(checkYouTubeChannelLiveFromHTML, "checkYouTubeChannelLiveFromHTML");
function uniq(arr) {
  return Array.from(new Set(arr.filter(Boolean)));
}
__name(uniq, "uniq");
__name2(uniq, "uniq");
function extractCandidatesFromChannelPageHtml(html) {
  const liveIds = [];
  const liveBadgeRegex = /thumbnailOverlayTimeStatusRenderer"\s*:\s*\{[^}]*"style"\s*:\s*"LIVE"[^}]*\}[\s\S]{0,800}?"videoId"\s*:\s*"([a-zA-Z0-9_-]{11})"/g;
  let m;
  while ((m = liveBadgeRegex.exec(html)) !== null) {
    liveIds.push(m[1]);
    if (liveIds.length >= 8) break;
  }
  const liveJsonRegex = /"isLive"\s*:\s*true[\s\S]{0,500}?"isUpcoming"\s*:\s*false[\s\S]{0,800}?"videoId"\s*:\s*"([a-zA-Z0-9_-]{11})"/g;
  while ((m = liveJsonRegex.exec(html)) !== null) {
    liveIds.push(m[1]);
    if (liveIds.length >= 12) break;
  }
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
__name(extractCandidatesFromChannelPageHtml, "extractCandidatesFromChannelPageHtml");
__name2(extractCandidatesFromChannelPageHtml, "extractCandidatesFromChannelPageHtml");
var delay = /* @__PURE__ */ __name2((ms) => new Promise((resolve) => setTimeout(resolve, ms)), "delay");
async function tryChannelHomeFallback(channelId, redirectChain, stepBase = 100) {
  const channelHomeUrl = withCommonQuery(`https://www.youtube.com/channel/${channelId}`);
  const stepInfo = {
    step: stepBase,
    requestedUrl: channelHomeUrl,
    status: null,
    method: "CHANNEL_HOME_HTML_PARSE",
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  };
  try {
    const { resp, text } = await fetchHtml(channelHomeUrl, { redirect: "follow" });
    stepInfo.status = resp.status;
    if (!resp.ok || !text) {
      redirectChain.push({ ...stepInfo, message: `channel home fetch failed: ${resp.status}` });
      return null;
    }
    const c = extractCandidatesFromChannelPageHtml(text);
    for (const vid of c.liveVideoIds.slice(0, MAX_CANDIDATES_TO_VERIFY)) {
      if (c.liveVideoIds.indexOf(vid) > 0) await delay(1500);
      const watchUrl = withCommonQuery(`https://www.youtube.com/watch?v=${vid}`);
      const perCandidate = {
        ...stepInfo,
        candidateWatch: watchUrl,
        candidateType: "LIVE_CANDIDATE"
      };
      const v = await verifyWatchUrlAgainstChannel(channelId, watchUrl, perCandidate);
      redirectChain.push({
        ...perCandidate,
        verificationStatus: v.status,
        verifiedVideoChannelId: v.verifiedVideoChannelId,
        verifyReason: v.reason,
        watchFetchStatus: perCandidate.watchFetchStatus
      });
      if (v.liveStatus === "LIVE") {
        return {
          kind: "LIVE",
          videoId: vid,
          finalUrl: watchUrl,
          verificationStatus: v.status,
          verifiedVideoChannelId: v.verifiedVideoChannelId,
          message: v.reason
        };
      }
    }
    for (const vid of c.upcomingVideoIds.slice(0, MAX_CANDIDATES_TO_VERIFY)) {
      await delay(1500);
      const watchUrl = withCommonQuery(`https://www.youtube.com/watch?v=${vid}`);
      const perCandidate = {
        ...stepInfo,
        candidateWatch: watchUrl,
        candidateType: "UPCOMING_CANDIDATE"
      };
      const v = await verifyWatchUrlAgainstChannel(channelId, watchUrl, perCandidate);
      redirectChain.push({
        ...perCandidate,
        verificationStatus: v.status,
        verifiedVideoChannelId: v.verifiedVideoChannelId,
        verifyReason: v.reason,
        watchFetchStatus: perCandidate.watchFetchStatus
      });
      if (v.liveStatus === "UPCOMING") {
        return {
          kind: "UPCOMING",
          videoId: vid,
          finalUrl: watchUrl,
          verificationStatus: v.status,
          verifiedVideoChannelId: v.verifiedVideoChannelId,
          message: "\u6392\u7A0B\u76F4\u64AD\uFF08\u5DF2\u9A57\u8B49\uFF09"
        };
      }
    }
    return null;
  } catch (e) {
    redirectChain.push({ ...stepInfo, message: `channel home fetch error: ${e?.message || "unknown"}` });
    return null;
  }
}
__name(tryChannelHomeFallback, "tryChannelHomeFallback");
__name2(tryChannelHomeFallback, "tryChannelHomeFallback");
async function checkLiveStatusRecursive(channelId, url, redirects, redirectChain = []) {
  if (redirects >= MAX_REDIRECTS) {
    return {
      status: "ERROR",
      videoId: null,
      finalUrl: url,
      message: "Reached maximum redirect count.",
      verificationStatus: "VERIFY_FAILED",
      verifiedVideoChannelId: null,
      redirectChain
    };
  }
  const headers = baseHtmlHeaders({
    "DNT": "1",
    "Connection": "keep-alive",
    "Upgrade-Insecure-Requests": "1"
  });
  try {
    const requestUrl = withCommonQuery(url);
    const response = await fetch(requestUrl, {
      method: "GET",
      redirect: "manual",
      headers
    });
    const status = response.status;
    const finalUrl = response.url || url;
    const locationHeader = response.headers.get("Location");
    const stepInfo = {
      step: redirects + 1,
      requestedUrl: requestUrl,
      status,
      responseUrl: finalUrl,
      locationHeader: locationHeader || null,
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    };
    redirectChain.push(stepInfo);
    if (status >= 300 && status < 400) {
      if (!locationHeader) {
        return {
          status: "ERROR",
          videoId: null,
          finalUrl: url,
          message: "Redirect without Location header",
          verificationStatus: "VERIFY_FAILED",
          verifiedVideoChannelId: null,
          redirectChain
        };
      }
      const newUrl = new URL(locationHeader, requestUrl).toString();
      stepInfo.redirectTo = newUrl;
      if (newUrl.includes("watch?v=")) {
        const videoId = extractVideoIdFromWatchUrl(newUrl);
        const v = await verifyWatchUrlAgainstChannel(channelId, newUrl, stepInfo);
        if (v.liveStatus === "LIVE") {
          return {
            status: "LIVE",
            videoId,
            finalUrl: newUrl,
            message: v.reason,
            verificationStatus: v.status,
            verifiedVideoChannelId: v.verifiedVideoChannelId,
            redirectChain
          };
        }
        if (v.liveStatus === "UPCOMING") {
          return {
            status: "UPCOMING",
            videoId,
            finalUrl: newUrl,
            message: "\u6392\u7A0B\u76F4\u64AD\uFF08\u5DF2\u9A57\u8B49\uFF09",
            verificationStatus: v.status,
            verifiedVideoChannelId: v.verifiedVideoChannelId,
            redirectChain
          };
        }
        return {
          status: "OFFLINE",
          videoId: null,
          finalUrl: url,
          message: v.reason,
          verificationStatus: v.status,
          verifiedVideoChannelId: v.verifiedVideoChannelId,
          redirectChain
        };
      }
      await delay(1500);
      return checkLiveStatusRecursive(channelId, newUrl, redirects + 1, redirectChain);
    }
    if (status === 200) {
      if (finalUrl.includes("watch?v=")) {
        const videoId = extractVideoIdFromWatchUrl(finalUrl);
        const v = await verifyWatchUrlAgainstChannel(channelId, finalUrl, stepInfo);
        if (v.liveStatus === "LIVE") {
          return {
            status: "LIVE",
            videoId,
            finalUrl,
            message: v.reason,
            verificationStatus: v.status,
            verifiedVideoChannelId: v.verifiedVideoChannelId,
            redirectChain
          };
        }
        if (v.liveStatus === "UPCOMING") {
          return {
            status: "UPCOMING",
            videoId,
            finalUrl,
            message: "\u6392\u7A0B\u76F4\u64AD\uFF08\u5DF2\u9A57\u8B49\uFF09",
            verificationStatus: v.status,
            verifiedVideoChannelId: v.verifiedVideoChannelId,
            redirectChain
          };
        }
        return {
          status: "OFFLINE",
          videoId: null,
          finalUrl: url,
          message: v.reason,
          verificationStatus: v.status,
          verifiedVideoChannelId: v.verifiedVideoChannelId,
          redirectChain
        };
      }
      try {
        const { resp: htmlResp, text: html } = await fetchHtml(requestUrl, { redirect: "follow" });
        if (htmlResp.ok && html) {
          const htmlCheckResult = await checkYouTubeChannelLiveFromHTML(channelId, html);
          stepInfo.redirectSource = htmlCheckResult.method || "HTML_PARSE";
          if (htmlCheckResult.finalUrl && htmlCheckResult.finalUrl.includes("watch?v=")) {
            const watchUrl = withCommonQuery(htmlCheckResult.finalUrl);
            const videoId = extractVideoIdFromWatchUrl(watchUrl);
            const v = await verifyWatchUrlAgainstChannel(channelId, watchUrl, stepInfo);
            if (v.liveStatus === "LIVE") {
              stepInfo.redirectTo = watchUrl;
              stepInfo.redirectSource = "LIVE_FROM_WATCH_VERIFY";
              return {
                status: "LIVE",
                videoId,
                finalUrl: watchUrl,
                message: v.reason,
                verificationStatus: v.status,
                verifiedVideoChannelId: v.verifiedVideoChannelId,
                redirectChain
              };
            }
            if (v.liveStatus === "UPCOMING") {
              stepInfo.redirectTo = watchUrl;
              stepInfo.redirectSource = "UPCOMING_FROM_WATCH_VERIFY";
              return {
                status: "UPCOMING",
                videoId,
                finalUrl: watchUrl,
                message: "\u6392\u7A0B\u76F4\u64AD\uFF08\u5DF2\u9A57\u8B49\uFF09",
                verificationStatus: v.status,
                verifiedVideoChannelId: v.verifiedVideoChannelId,
                redirectChain
              };
            }
            return {
              status: "OFFLINE",
              videoId: null,
              finalUrl: url,
              message: v.reason,
              verificationStatus: v.status,
              verifiedVideoChannelId: v.verifiedVideoChannelId,
              redirectChain
            };
          }
          if (htmlCheckResult.status === "OFFLINE") {
            return {
              status: "OFFLINE",
              videoId: null,
              finalUrl: url,
              message: htmlCheckResult.message,
              verificationStatus: "NOT_NEEDED",
              verifiedVideoChannelId: null,
              redirectChain
            };
          }
        }
      } catch {
      }
      return {
        status: "OFFLINE",
        videoId: null,
        finalUrl: url,
        message: "\u672A\u958B\u53F0",
        verificationStatus: "NOT_NEEDED",
        verifiedVideoChannelId: null,
        redirectChain
      };
    }
    if (status === 404) {
      return {
        status: "ERROR",
        videoId: null,
        finalUrl: url,
        message: "\u983B\u9053\u4E0D\u5B58\u5728\u6216\u5DF2\u522A\u9664 (404)",
        verificationStatus: "VERIFY_FAILED",
        verifiedVideoChannelId: null,
        redirectChain
      };
    }
    return {
      status: "ERROR",
      videoId: null,
      finalUrl: url,
      message: `Received unexpected status code: ${status}`,
      verificationStatus: "VERIFY_FAILED",
      verifiedVideoChannelId: null,
      redirectChain
    };
  } catch (error) {
    return {
      status: "ERROR",
      videoId: null,
      finalUrl: url,
      message: `Fetch error: ${error.message}`,
      verificationStatus: "VERIFY_FAILED",
      verifiedVideoChannelId: null,
      redirectChain
    };
  }
}
__name(checkLiveStatusRecursive, "checkLiveStatusRecursive");
__name2(checkLiveStatusRecursive, "checkLiveStatusRecursive");
async function handleChannelLiveRequest(request) {
  try {
    const url = new URL(request.url);
    const channelId = url.searchParams.get("channelId");
    if (!channelId) {
      return new Response(JSON.stringify({ error: "\u7F3A\u5C11 channelId \u53C3\u6578" }), {
        status: 400,
        headers: jsonHeaders()
      });
    }
    if (!/^UC[a-zA-Z0-9_-]{22}$/.test(channelId)) {
      return new Response(JSON.stringify({ error: "\u7121\u6548\u7684 channelId \u683C\u5F0F" }), {
        status: 400,
        headers: jsonHeaders()
      });
    }
    const liveUrl = withCommonQuery(`https://www.youtube.com/channel/${channelId}/live`);
    const redirectChain = [];
    try {
      const { resp: htmlResp, text: html } = await fetchHtml(liveUrl, { redirect: "follow" });
      if (!htmlResp.ok) throw new Error(`HTTP ${htmlResp.status}: ${htmlResp.statusText}`);
      const htmlCheckResult = await checkYouTubeChannelLiveFromHTML(channelId, html);
      if (htmlCheckResult.finalUrl && htmlCheckResult.finalUrl.includes("watch?v=")) {
        const candidateWatch = withCommonQuery(htmlCheckResult.finalUrl);
        const videoId = extractVideoIdFromWatchUrl(candidateWatch);
        const stepInfo = {
          step: 1,
          requestedUrl: liveUrl,
          status: htmlResp.status,
          method: htmlCheckResult.method || "HTML_PARSE",
          candidateWatch,
          timestamp: (/* @__PURE__ */ new Date()).toISOString()
        };
        const v = await verifyWatchUrlAgainstChannel(channelId, candidateWatch, stepInfo);
        if (v.liveStatus === "LIVE") {
          return new Response(JSON.stringify({
            status: 200,
            finalUrl: candidateWatch,
            isLive: true,
            liveVideoId: videoId || null,
            scheduledVideoId: null,
            isUpcoming: false,
            message: v.reason,
            method: "HTML_PARSE(/live) + WATCH_VERIFY",
            verificationStatus: v.status,
            verifiedVideoChannelId: v.verifiedVideoChannelId,
            redirectChain: [stepInfo]
          }), { status: 200, headers: jsonHeaders() });
        }
        if (v.liveStatus === "UPCOMING") {
          return new Response(JSON.stringify({
            status: 200,
            finalUrl: liveUrl,
            isLive: false,
            liveVideoId: null,
            scheduledVideoId: videoId || null,
            isUpcoming: true,
            message: "\u6392\u7A0B\u76F4\u64AD\uFF08\u5DF2\u9A57\u8B49\uFF0C\u5DF2\u6392\u9664\u4E0D\u4E0A\u7DDA\uFF09",
            method: "HTML_PARSE(/live) + WATCH_VERIFY",
            verificationStatus: v.status,
            verifiedVideoChannelId: v.verifiedVideoChannelId,
            redirectChain: [stepInfo]
          }), { status: 200, headers: jsonHeaders() });
        }
        redirectChain.push(stepInfo);
      } else if (htmlCheckResult.status === "OFFLINE") {
        redirectChain.push({
          step: 1,
          requestedUrl: liveUrl,
          status: htmlResp.status,
          method: htmlCheckResult.method || "HTML_PARSE",
          timestamp: (/* @__PURE__ */ new Date()).toISOString(),
          message: htmlCheckResult.message
        });
      }
    } catch {
    }
    const homeFallback = await tryChannelHomeFallback(channelId, redirectChain, 100);
    if (homeFallback?.kind === "LIVE") {
      return new Response(JSON.stringify({
        status: 200,
        finalUrl: homeFallback.finalUrl,
        isLive: true,
        liveVideoId: homeFallback.videoId,
        scheduledVideoId: null,
        isUpcoming: false,
        message: homeFallback.message || "\u958B\u53F0\u4E2D\uFF08\u983B\u9053\u9801\u5165\u53E3\uFF09",
        method: "CHANNEL_HOME_HTML + WATCH_VERIFY",
        verificationStatus: homeFallback.verificationStatus || "VERIFIED",
        verifiedVideoChannelId: homeFallback.verifiedVideoChannelId || channelId,
        redirectChain
      }), { status: 200, headers: jsonHeaders() });
    }
    if (homeFallback?.kind === "UPCOMING") {
      return new Response(JSON.stringify({
        status: 200,
        finalUrl: liveUrl,
        isLive: false,
        liveVideoId: null,
        scheduledVideoId: homeFallback.videoId,
        isUpcoming: true,
        message: "\u6392\u7A0B\u76F4\u64AD\uFF08\u983B\u9053\u9801\u5165\u53E3\u5DF2\u9A57\u8B49\uFF0C\u5DF2\u6392\u9664\u4E0D\u4E0A\u7DDA\uFF09",
        method: "CHANNEL_HOME_HTML + WATCH_VERIFY",
        verificationStatus: homeFallback.verificationStatus || "VERIFIED",
        verifiedVideoChannelId: homeFallback.verifiedVideoChannelId || channelId,
        redirectChain
      }), { status: 200, headers: jsonHeaders() });
    }
    const result = await checkLiveStatusRecursive(channelId, liveUrl, 0, redirectChain);
    const responseData = {
      status: result.status === "ERROR" ? 500 : 200,
      finalUrl: result.status === "LIVE" ? result.finalUrl : liveUrl,
      isLive: result.status === "LIVE",
      liveVideoId: result.status === "LIVE" ? result.videoId || null : null,
      scheduledVideoId: result.status === "UPCOMING" ? result.videoId || null : null,
      isUpcoming: result.status === "UPCOMING",
      message: result.status === "LIVE" ? "\u958B\u53F0\u4E2D" : result.status === "UPCOMING" ? "\u6392\u7A0B\u76F4\u64AD\uFF08\u5DF2\u6392\u9664\u4E0D\u4E0A\u7DDA\uFF09" : result.status === "OFFLINE" ? "\u672A\u958B\u53F0" : result.message || "\u672A\u77E5\u72C0\u614B",
      method: "REDIRECT + WATCH_VERIFY (+ CHANNEL_HOME_FALLBACK)",
      verificationStatus: result.verificationStatus || "VERIFY_FAILED",
      verifiedVideoChannelId: result.verifiedVideoChannelId || null,
      redirectChain: result.redirectChain || redirectChain || []
    };
    if (result.status === "ERROR" && result.message && result.message.includes("404")) {
      responseData.status = 404;
      responseData.isLive = false;
      responseData.message = "\u983B\u9053\u4E0D\u5B58\u5728\u6216\u5DF2\u522A\u9664";
    }
    return new Response(JSON.stringify(responseData), { status: 200, headers: jsonHeaders() });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: "\u4F3A\u670D\u5668\u932F\u8AA4", message: error.message || "\u8655\u7406\u8ACB\u6C42\u6642\u767C\u751F\u672A\u77E5\u932F\u8AA4" }),
      { status: 500, headers: jsonHeaders() }
    );
  }
}
__name(handleChannelLiveRequest, "handleChannelLiveRequest");
__name2(handleChannelLiveRequest, "handleChannelLiveRequest");
async function onRequestGet4(context) {
  const { request } = context;
  const url = new URL(request.url);
  const channelId = url.searchParams.get("channelId");
  if (!channelId) {
    return new Response(JSON.stringify({ error: "\u7F3A\u5C11 channelId \u53C2\u6570" }), {
      status: 400,
      headers: jsonHeaders2()
    });
  }
  if (!/^UC[a-zA-Z0-9_-]{22}$/.test(channelId)) {
    return new Response(JSON.stringify({ error: "\u7121\u6548\u7684 channelId \u683C\u5F0F" }), {
      status: 400,
      headers: jsonHeaders2()
    });
  }
  const liveUrl = `https://www.youtube.com/channel/${channelId}/live`;
  const fetchUrl = new URL(liveUrl);
  fetchUrl.searchParams.set("ucbcb", "1");
  fetchUrl.searchParams.set("hl", "en");
  fetchUrl.searchParams.set("gl", "US");
  try {
    const htmlResp = await fetch(fetchUrl.toString(), {
      method: "GET",
      headers: {
        // Use a Social Bot UA to encourage YouTube to serve static meta tags
        "User-Agent": "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Cache-Control": "no-cache",
        "Pragma": "no-cache",
        "Cookie": "CONSENT=YES+cb.20210328-17-p0.en+FX+917;"
      },
      redirect: "follow"
    });
    if (!htmlResp.ok) {
      return new Response(JSON.stringify({
        isLive: false,
        message: `YouTube Page Fetch Failed: ${htmlResp.status}`,
        debug: { liveUrl, status: htmlResp.status }
      }), { status: 200, headers: jsonHeaders2() });
    }
    const html = await htmlResp.text();
    const titleMatch = html.match(/<title>(.*?)<\/title>/);
    const pageTitle = titleMatch ? titleMatch[1] : "Unknown Title";
    let videoId = null;
    let extractionSource = null;
    if (!videoId) {
      let potentialImgUrl = null;
      const metaOg = html.match(/<meta\s+(?:property|name|itemprop)=["'](?:og:image|twitter:image|image)["']\s+content=["'](.*?)["']/i) || html.match(/<meta\s+content=["'](.*?)["']\s+(?:property|name|itemprop)=["'](?:og:image|twitter:image|image)["']/i);
      if (metaOg) {
        potentialImgUrl = metaOg[1];
        const vidMatch = potentialImgUrl.match(/\/vi\/([a-zA-Z0-9_-]{11})\//);
        if (vidMatch) {
          videoId = vidMatch[1];
          extractionSource = "meta-image";
        }
      }
    }
    if (!videoId) {
      const canonicalMatch = html.match(/<link\s+rel=["']canonical["']\s+href=["'](.*?)["']/i);
      if (canonicalMatch) {
        const href = canonicalMatch[1];
        const vMatch = href.match(/\/watch\?v=([a-zA-Z0-9_-]{11})/);
        if (vMatch) {
          videoId = vMatch[1];
          extractionSource = "canonical-link";
        }
      }
    }
    if (!videoId) {
      const ogUrlMatch = html.match(/<meta\s+property=["']og:url["']\s+content=["'](.*?)["']/i);
      if (ogUrlMatch && ogUrlMatch[1].includes("watch?v=")) {
        const vMatch = ogUrlMatch[1].match(/v=([a-zA-Z0-9_-]{11})/);
        if (vMatch) {
          videoId = vMatch[1];
          extractionSource = "og-url";
        }
      }
    }
    if (!videoId) {
      const liveImgMatch = html.match(/https:\/\/i\.ytimg\.com\/vi\/([a-zA-Z0-9_-]{11})\/(?:maxres|hq)default_live\.jpg/);
      if (liveImgMatch) {
        videoId = liveImgMatch[1];
        extractionSource = "brute-force-regex";
      }
    }
    if (!videoId) {
      return new Response(JSON.stringify({
        isLive: false,
        message: "Video ID not found in HTML",
        debug: { liveUrl, pageTitle, snippet: html.substring(0, 1e3) }
        // Increased snippet again
      }), { status: 200, headers: jsonHeaders2() });
    }
    const verifyUrl = `https://i.ytimg.com/vi/${videoId}/hqdefault_live.jpg`;
    const imgResp = await fetch(verifyUrl, {
      method: "HEAD",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"
      }
    });
    const isConfirmedLive = imgResp.status === 200;
    let isUpcoming = false;
    let scheduledStartTime = null;
    if (html.includes('"status":"UPCOMING"')) {
      isUpcoming = true;
    }
    if (!isUpcoming && html.includes('"isUpcoming":true')) {
      isUpcoming = true;
    }
    const timeMatch = html.match(/"scheduledStartTime"\s*:\s*"(\d+)"/);
    if (timeMatch) {
      isUpcoming = true;
      scheduledStartTime = timeMatch[1];
    }
    if (isUpcoming) {
      return new Response(JSON.stringify({
        isLive: false,
        isUpcoming: true,
        videoId,
        scheduledVideoId: videoId,
        scheduledStartTime,
        finalUrl: `https://www.youtube.com/watch?v=${videoId}`,
        message: "Upcoming stream detected via HTML parse",
        debug: {
          extractionSource,
          verifyUrl,
          verifyStatus: imgResp.status,
          method: "HTML_PARSE_UPCOMING",
          liveUrl
        }
      }), { status: 200, headers: jsonHeaders2() });
    }
    if (isConfirmedLive) {
      return new Response(JSON.stringify({
        isLive: true,
        videoId,
        finalUrl: `https://www.youtube.com/watch?v=${videoId}`,
        message: "Live confirmed via Image Server",
        debug: {
          extractionSource,
          verifyUrl,
          verifyStatus: imgResp.status,
          method: "OG_IMAGE_PLUS_HEAD_CHECK",
          liveUrl
        }
      }), { status: 200, headers: jsonHeaders2() });
    }
    return new Response(JSON.stringify({
      isLive: false,
      isUpcoming: false,
      videoId,
      // Return the ID anyway as it was found
      finalUrl: `https://www.youtube.com/watch?v=${videoId}`,
      message: "Video ID found but not Live or Upcoming",
      debug: {
        extractionSource,
        verifyUrl,
        verifyStatus: imgResp.status,
        method: "OFFLINE_CHECK"
      }
    }), { status: 200, headers: jsonHeaders2() });
  } catch (err) {
    return new Response(JSON.stringify({
      error: "Internal Error",
      message: err.message
    }), { status: 500, headers: jsonHeaders2() });
  }
}
__name(onRequestGet4, "onRequestGet4");
__name2(onRequestGet4, "onRequestGet");
function jsonHeaders2() {
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-store"
  };
}
__name(jsonHeaders2, "jsonHeaders2");
__name2(jsonHeaders2, "jsonHeaders");
async function onRequestGet5(contextOrRequest, env) {
  let request, envObj;
  if (contextOrRequest && contextOrRequest.request) {
    request = contextOrRequest.request;
    envObj = contextOrRequest.env;
  } else {
    request = contextOrRequest;
    envObj = env;
  }
  return handleChannelPageRequest(request, envObj);
}
__name(onRequestGet5, "onRequestGet5");
__name2(onRequestGet5, "onRequestGet");
async function handleChannelPageRequest(request, env) {
  try {
    const url = new URL(request.url);
    const username = url.searchParams.get("username") || url.searchParams.get("handle");
    if (!username) {
      return new Response(
        JSON.stringify({ error: "\u7F3A\u5C11 username \u6216 handle \u53C3\u6578" }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          }
        }
      );
    }
    const cleanUsername = username.replace(/^@/, "").trim();
    if (!cleanUsername || cleanUsername.length > 100) {
      return new Response(
        JSON.stringify({ error: "\u7121\u6548\u7684 username \u683C\u5F0F" }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          }
        }
      );
    }
    const channelUrl = `https://www.youtube.com/@${cleanUsername}`;
    const response = await fetch(channelUrl, {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9"
      }
    });
    if (!response.ok) {
      return new Response(
        JSON.stringify({
          error: "\u7121\u6CD5\u7372\u53D6\u983B\u9053\u9801\u9762",
          status: response.status,
          statusText: response.statusText
        }),
        {
          status: response.status,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          }
        }
      );
    }
    const htmlText = await response.text();
    let channelId = null;
    let channelTitle = null;
    try {
      const ytInitialDataPatterns = [
        /var ytInitialData\s*=\s*({[\s\S]*?});/,
        /window\["ytInitialData"\]\s*=\s*({[\s\S]*?});/,
        /ytInitialData\s*=\s*({[\s\S]*?});/
      ];
      for (const pattern of ytInitialDataPatterns) {
        const ytInitialDataMatch = htmlText.match(pattern);
        if (ytInitialDataMatch) {
          try {
            let jsonStr = ytInitialDataMatch[1];
            let braceCount = 0;
            let lastValidIndex = -1;
            for (let i = 0; i < jsonStr.length; i++) {
              if (jsonStr[i] === "{") braceCount++;
              if (jsonStr[i] === "}") braceCount--;
              if (braceCount === 0) {
                lastValidIndex = i;
                break;
              }
            }
            if (lastValidIndex > 0) {
              jsonStr = jsonStr.substring(0, lastValidIndex + 1);
            }
            const ytInitialData = JSON.parse(jsonStr);
            if (ytInitialData?.metadata?.channelMetadataRenderer?.externalId) {
              channelId = ytInitialData.metadata.channelMetadataRenderer.externalId;
              break;
            } else if (ytInitialData?.header?.c4TabbedHeaderRenderer?.channelId) {
              channelId = ytInitialData.header.c4TabbedHeaderRenderer.channelId;
              break;
            } else if (ytInitialData?.microformat?.microformatDataRenderer?.channelId) {
              channelId = ytInitialData.microformat.microformatDataRenderer.channelId;
              break;
            }
          } catch (e) {
            continue;
          }
        }
      }
    } catch (e) {
    }
    if (!channelId) {
      const canonicalMatch = htmlText.match(/<link[^>]*rel="canonical"[^>]*href="[^"]*\/channel\/(UC[a-zA-Z0-9_-]{22})/);
      if (canonicalMatch) {
        channelId = canonicalMatch[1];
      }
    }
    if (!channelId) {
      const jsonLdMatches = htmlText.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g);
      for (const match2 of jsonLdMatches) {
        try {
          const jsonLd = JSON.parse(match2[1]);
          if (jsonLd["@type"] === "Person" || jsonLd["@type"] === "Organization") {
            const url2 = jsonLd.url || jsonLd.sameAs?.[0];
            if (url2 && url2.includes("/channel/")) {
              const urlMatch = url2.match(/\/channel\/(UC[a-zA-Z0-9_-]{22})/);
              if (urlMatch) {
                channelId = urlMatch[1];
                break;
              }
            }
          }
        } catch (e) {
        }
      }
    }
    if (!channelId) {
      const ogUrlMatch = htmlText.match(/<meta[^>]*property="og:url"[^>]*content="[^"]*\/channel\/(UC[a-zA-Z0-9_-]{22})/);
      if (ogUrlMatch) {
        channelId = ogUrlMatch[1];
      }
    }
    if (!channelId) {
      const channelIdMatches = htmlText.matchAll(/"channelId":"(UC[a-zA-Z0-9_-]{22})"/g);
      const matches = Array.from(channelIdMatches);
      if (matches.length === 1) {
        channelId = matches[0][1];
      } else if (matches.length > 1) {
        for (const match2 of matches) {
          const contextStart = Math.max(0, match2.index - 500);
          const contextEnd = Math.min(htmlText.length, match2.index + match2[0].length + 500);
          const context = htmlText.substring(contextStart, contextEnd);
          if (context.includes(`@${cleanUsername}`) || context.includes("channelMetadataRenderer")) {
            channelId = match2[1];
            break;
          }
        }
        if (!channelId && matches.length > 0) {
          channelId = matches[0][1];
        }
      }
    }
    if (!channelId) {
      const externalIdMatch = htmlText.match(/"externalId":"(UC[a-zA-Z0-9_-]{22})"/);
      if (externalIdMatch) {
        channelId = externalIdMatch[1];
      }
    }
    if (!channelId) {
      const channelMatches = htmlText.matchAll(/\/channel\/(UC[a-zA-Z0-9_-]{22})/g);
      const matches = Array.from(channelMatches);
      if (matches.length > 0) {
        channelId = matches[0][1];
      }
    }
    if (!channelTitle) {
      try {
        const ytInitialDataMatch = htmlText.match(/var ytInitialData = ({.+?});/s);
        if (ytInitialDataMatch) {
          const ytInitialData = JSON.parse(ytInitialDataMatch[1]);
          if (ytInitialData?.metadata?.channelMetadataRenderer?.title) {
            channelTitle = ytInitialData.metadata.channelMetadataRenderer.title;
          } else if (ytInitialData?.header?.c4TabbedHeaderRenderer?.title) {
            channelTitle = ytInitialData.header.c4TabbedHeaderRenderer.title;
          }
        }
      } catch (e) {
      }
    }
    if (!channelTitle) {
      const titleMatch = htmlText.match(/<title>([^<]+)<\/title>/);
      if (titleMatch) {
        channelTitle = titleMatch[1].replace(/\s*-\s*YouTube\s*$/, "").trim();
      }
    }
    if (!channelTitle) {
      const metaTitleMatch = htmlText.match(/<meta[^>]*property="og:title"[^>]*content="([^"]+)"/);
      if (metaTitleMatch) {
        channelTitle = metaTitleMatch[1];
      }
    }
    if (channelId) {
      const canonicalMatch = htmlText.match(/<link[^>]*rel="canonical"[^>]*href="([^"]+)"/);
      if (canonicalMatch) {
        const canonicalUrl = canonicalMatch[1];
        if (canonicalUrl.includes(`@${cleanUsername}`)) {
        } else if (canonicalUrl.includes("/channel/")) {
          const canonicalChannelIdMatch = canonicalUrl.match(/\/channel\/(UC[a-zA-Z0-9_-]{22})/);
          if (canonicalChannelIdMatch && canonicalChannelIdMatch[1] !== channelId) {
            channelId = canonicalChannelIdMatch[1];
          }
        }
      }
    }
    return new Response(
      JSON.stringify({
        channelId,
        channelTitle,
        username: cleanUsername,
        success: !!channelId,
        error: channelId ? null : "\u7121\u6CD5\u5F9E\u9801\u9762\u4E2D\u63D0\u53D6 channelId"
      }),
      {
        status: channelId ? 200 : 404,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
          "Cache-Control": "public, max-age=3600"
          // 快取 1 小時（頻道 ID 不會頻繁變化）
        }
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: "\u4F3A\u670D\u5668\u932F\u8AA4",
        message: error.message || "\u8655\u7406\u8ACB\u6C42\u6642\u767C\u751F\u672A\u77E5\u932F\u8AA4"
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        }
      }
    );
  }
}
__name(handleChannelPageRequest, "handleChannelPageRequest");
__name2(handleChannelPageRequest, "handleChannelPageRequest");
async function onRequestOptions4(contextOrRequest, env) {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400"
      // 24 小時
    }
  });
}
__name(onRequestOptions4, "onRequestOptions4");
__name2(onRequestOptions4, "onRequestOptions");
async function onRequestGet6(contextOrRequest, env) {
  let request, envObj;
  if (contextOrRequest && contextOrRequest.request) {
    request = contextOrRequest.request;
    envObj = contextOrRequest.env;
  } else {
    request = contextOrRequest;
    envObj = env;
  }
  return handleConfigRequest2(request, envObj);
}
__name(onRequestGet6, "onRequestGet6");
__name2(onRequestGet6, "onRequestGet");
async function handleConfigRequest2(request, env) {
  const requestUrl = request.url;
  const requestMethod = request.method;
  try {
    const apiKey = env?.YOUTUBE_API_KEY || null;
    return new Response(
      JSON.stringify({
        apiKey
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
          "Cache-Control": "public, max-age=3600"
        }
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: "\u4F3A\u670D\u5668\u932F\u8AA4",
        message: error.message || "\u8655\u7406\u8ACB\u6C42\u6642\u767C\u751F\u672A\u77E5\u932F\u8AA4"
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type"
        }
      }
    );
  }
}
__name(handleConfigRequest2, "handleConfigRequest2");
__name2(handleConfigRequest2, "handleConfigRequest");
async function onRequestOptions5(contextOrRequest, env) {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400"
      // 24 小時
    }
  });
}
__name(onRequestOptions5, "onRequestOptions5");
__name2(onRequestOptions5, "onRequestOptions");
var routes = [
  {
    routePath: "/api/twitch-config",
    mountPath: "/api",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet]
  },
  {
    routePath: "/api/twitch-config",
    mountPath: "/api",
    method: "OPTIONS",
    middlewares: [],
    modules: [onRequestOptions]
  },
  {
    routePath: "/api/twitch-token",
    mountPath: "/api",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet2]
  },
  {
    routePath: "/api/twitch-token",
    mountPath: "/api",
    method: "OPTIONS",
    middlewares: [],
    modules: [onRequestOptions2]
  },
  {
    routePath: "/api/twitch-token",
    mountPath: "/api",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost]
  },
  {
    routePath: "/api/youtube-channel-live",
    mountPath: "/api",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet3]
  },
  {
    routePath: "/api/youtube-channel-live",
    mountPath: "/api",
    method: "OPTIONS",
    middlewares: [],
    modules: [onRequestOptions3]
  },
  {
    routePath: "/api/youtube-channel-live-og",
    mountPath: "/api",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet4]
  },
  {
    routePath: "/api/youtube-channel-page",
    mountPath: "/api",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet5]
  },
  {
    routePath: "/api/youtube-channel-page",
    mountPath: "/api",
    method: "OPTIONS",
    middlewares: [],
    modules: [onRequestOptions4]
  },
  {
    routePath: "/api/youtube-config",
    mountPath: "/api",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet6]
  },
  {
    routePath: "/api/youtube-config",
    mountPath: "/api",
    method: "OPTIONS",
    middlewares: [],
    modules: [onRequestOptions5]
  }
];
function lexer(str) {
  var tokens = [];
  var i = 0;
  while (i < str.length) {
    var char = str[i];
    if (char === "*" || char === "+" || char === "?") {
      tokens.push({ type: "MODIFIER", index: i, value: str[i++] });
      continue;
    }
    if (char === "\\") {
      tokens.push({ type: "ESCAPED_CHAR", index: i++, value: str[i++] });
      continue;
    }
    if (char === "{") {
      tokens.push({ type: "OPEN", index: i, value: str[i++] });
      continue;
    }
    if (char === "}") {
      tokens.push({ type: "CLOSE", index: i, value: str[i++] });
      continue;
    }
    if (char === ":") {
      var name = "";
      var j = i + 1;
      while (j < str.length) {
        var code = str.charCodeAt(j);
        if (
          // `0-9`
          code >= 48 && code <= 57 || // `A-Z`
          code >= 65 && code <= 90 || // `a-z`
          code >= 97 && code <= 122 || // `_`
          code === 95
        ) {
          name += str[j++];
          continue;
        }
        break;
      }
      if (!name)
        throw new TypeError("Missing parameter name at ".concat(i));
      tokens.push({ type: "NAME", index: i, value: name });
      i = j;
      continue;
    }
    if (char === "(") {
      var count = 1;
      var pattern = "";
      var j = i + 1;
      if (str[j] === "?") {
        throw new TypeError('Pattern cannot start with "?" at '.concat(j));
      }
      while (j < str.length) {
        if (str[j] === "\\") {
          pattern += str[j++] + str[j++];
          continue;
        }
        if (str[j] === ")") {
          count--;
          if (count === 0) {
            j++;
            break;
          }
        } else if (str[j] === "(") {
          count++;
          if (str[j + 1] !== "?") {
            throw new TypeError("Capturing groups are not allowed at ".concat(j));
          }
        }
        pattern += str[j++];
      }
      if (count)
        throw new TypeError("Unbalanced pattern at ".concat(i));
      if (!pattern)
        throw new TypeError("Missing pattern at ".concat(i));
      tokens.push({ type: "PATTERN", index: i, value: pattern });
      i = j;
      continue;
    }
    tokens.push({ type: "CHAR", index: i, value: str[i++] });
  }
  tokens.push({ type: "END", index: i, value: "" });
  return tokens;
}
__name(lexer, "lexer");
__name2(lexer, "lexer");
function parse(str, options) {
  if (options === void 0) {
    options = {};
  }
  var tokens = lexer(str);
  var _a = options.prefixes, prefixes = _a === void 0 ? "./" : _a, _b = options.delimiter, delimiter = _b === void 0 ? "/#?" : _b;
  var result = [];
  var key = 0;
  var i = 0;
  var path = "";
  var tryConsume = /* @__PURE__ */ __name2(function(type) {
    if (i < tokens.length && tokens[i].type === type)
      return tokens[i++].value;
  }, "tryConsume");
  var mustConsume = /* @__PURE__ */ __name2(function(type) {
    var value2 = tryConsume(type);
    if (value2 !== void 0)
      return value2;
    var _a2 = tokens[i], nextType = _a2.type, index = _a2.index;
    throw new TypeError("Unexpected ".concat(nextType, " at ").concat(index, ", expected ").concat(type));
  }, "mustConsume");
  var consumeText = /* @__PURE__ */ __name2(function() {
    var result2 = "";
    var value2;
    while (value2 = tryConsume("CHAR") || tryConsume("ESCAPED_CHAR")) {
      result2 += value2;
    }
    return result2;
  }, "consumeText");
  var isSafe = /* @__PURE__ */ __name2(function(value2) {
    for (var _i = 0, delimiter_1 = delimiter; _i < delimiter_1.length; _i++) {
      var char2 = delimiter_1[_i];
      if (value2.indexOf(char2) > -1)
        return true;
    }
    return false;
  }, "isSafe");
  var safePattern = /* @__PURE__ */ __name2(function(prefix2) {
    var prev = result[result.length - 1];
    var prevText = prefix2 || (prev && typeof prev === "string" ? prev : "");
    if (prev && !prevText) {
      throw new TypeError('Must have text between two parameters, missing text after "'.concat(prev.name, '"'));
    }
    if (!prevText || isSafe(prevText))
      return "[^".concat(escapeString(delimiter), "]+?");
    return "(?:(?!".concat(escapeString(prevText), ")[^").concat(escapeString(delimiter), "])+?");
  }, "safePattern");
  while (i < tokens.length) {
    var char = tryConsume("CHAR");
    var name = tryConsume("NAME");
    var pattern = tryConsume("PATTERN");
    if (name || pattern) {
      var prefix = char || "";
      if (prefixes.indexOf(prefix) === -1) {
        path += prefix;
        prefix = "";
      }
      if (path) {
        result.push(path);
        path = "";
      }
      result.push({
        name: name || key++,
        prefix,
        suffix: "",
        pattern: pattern || safePattern(prefix),
        modifier: tryConsume("MODIFIER") || ""
      });
      continue;
    }
    var value = char || tryConsume("ESCAPED_CHAR");
    if (value) {
      path += value;
      continue;
    }
    if (path) {
      result.push(path);
      path = "";
    }
    var open = tryConsume("OPEN");
    if (open) {
      var prefix = consumeText();
      var name_1 = tryConsume("NAME") || "";
      var pattern_1 = tryConsume("PATTERN") || "";
      var suffix = consumeText();
      mustConsume("CLOSE");
      result.push({
        name: name_1 || (pattern_1 ? key++ : ""),
        pattern: name_1 && !pattern_1 ? safePattern(prefix) : pattern_1,
        prefix,
        suffix,
        modifier: tryConsume("MODIFIER") || ""
      });
      continue;
    }
    mustConsume("END");
  }
  return result;
}
__name(parse, "parse");
__name2(parse, "parse");
function match(str, options) {
  var keys = [];
  var re = pathToRegexp(str, keys, options);
  return regexpToFunction(re, keys, options);
}
__name(match, "match");
__name2(match, "match");
function regexpToFunction(re, keys, options) {
  if (options === void 0) {
    options = {};
  }
  var _a = options.decode, decode = _a === void 0 ? function(x) {
    return x;
  } : _a;
  return function(pathname) {
    var m = re.exec(pathname);
    if (!m)
      return false;
    var path = m[0], index = m.index;
    var params = /* @__PURE__ */ Object.create(null);
    var _loop_1 = /* @__PURE__ */ __name2(function(i2) {
      if (m[i2] === void 0)
        return "continue";
      var key = keys[i2 - 1];
      if (key.modifier === "*" || key.modifier === "+") {
        params[key.name] = m[i2].split(key.prefix + key.suffix).map(function(value) {
          return decode(value, key);
        });
      } else {
        params[key.name] = decode(m[i2], key);
      }
    }, "_loop_1");
    for (var i = 1; i < m.length; i++) {
      _loop_1(i);
    }
    return { path, index, params };
  };
}
__name(regexpToFunction, "regexpToFunction");
__name2(regexpToFunction, "regexpToFunction");
function escapeString(str) {
  return str.replace(/([.+*?=^!:${}()[\]|/\\])/g, "\\$1");
}
__name(escapeString, "escapeString");
__name2(escapeString, "escapeString");
function flags(options) {
  return options && options.sensitive ? "" : "i";
}
__name(flags, "flags");
__name2(flags, "flags");
function regexpToRegexp(path, keys) {
  if (!keys)
    return path;
  var groupsRegex = /\((?:\?<(.*?)>)?(?!\?)/g;
  var index = 0;
  var execResult = groupsRegex.exec(path.source);
  while (execResult) {
    keys.push({
      // Use parenthesized substring match if available, index otherwise
      name: execResult[1] || index++,
      prefix: "",
      suffix: "",
      modifier: "",
      pattern: ""
    });
    execResult = groupsRegex.exec(path.source);
  }
  return path;
}
__name(regexpToRegexp, "regexpToRegexp");
__name2(regexpToRegexp, "regexpToRegexp");
function arrayToRegexp(paths, keys, options) {
  var parts = paths.map(function(path) {
    return pathToRegexp(path, keys, options).source;
  });
  return new RegExp("(?:".concat(parts.join("|"), ")"), flags(options));
}
__name(arrayToRegexp, "arrayToRegexp");
__name2(arrayToRegexp, "arrayToRegexp");
function stringToRegexp(path, keys, options) {
  return tokensToRegexp(parse(path, options), keys, options);
}
__name(stringToRegexp, "stringToRegexp");
__name2(stringToRegexp, "stringToRegexp");
function tokensToRegexp(tokens, keys, options) {
  if (options === void 0) {
    options = {};
  }
  var _a = options.strict, strict = _a === void 0 ? false : _a, _b = options.start, start = _b === void 0 ? true : _b, _c = options.end, end = _c === void 0 ? true : _c, _d = options.encode, encode = _d === void 0 ? function(x) {
    return x;
  } : _d, _e = options.delimiter, delimiter = _e === void 0 ? "/#?" : _e, _f = options.endsWith, endsWith = _f === void 0 ? "" : _f;
  var endsWithRe = "[".concat(escapeString(endsWith), "]|$");
  var delimiterRe = "[".concat(escapeString(delimiter), "]");
  var route = start ? "^" : "";
  for (var _i = 0, tokens_1 = tokens; _i < tokens_1.length; _i++) {
    var token = tokens_1[_i];
    if (typeof token === "string") {
      route += escapeString(encode(token));
    } else {
      var prefix = escapeString(encode(token.prefix));
      var suffix = escapeString(encode(token.suffix));
      if (token.pattern) {
        if (keys)
          keys.push(token);
        if (prefix || suffix) {
          if (token.modifier === "+" || token.modifier === "*") {
            var mod = token.modifier === "*" ? "?" : "";
            route += "(?:".concat(prefix, "((?:").concat(token.pattern, ")(?:").concat(suffix).concat(prefix, "(?:").concat(token.pattern, "))*)").concat(suffix, ")").concat(mod);
          } else {
            route += "(?:".concat(prefix, "(").concat(token.pattern, ")").concat(suffix, ")").concat(token.modifier);
          }
        } else {
          if (token.modifier === "+" || token.modifier === "*") {
            throw new TypeError('Can not repeat "'.concat(token.name, '" without a prefix and suffix'));
          }
          route += "(".concat(token.pattern, ")").concat(token.modifier);
        }
      } else {
        route += "(?:".concat(prefix).concat(suffix, ")").concat(token.modifier);
      }
    }
  }
  if (end) {
    if (!strict)
      route += "".concat(delimiterRe, "?");
    route += !options.endsWith ? "$" : "(?=".concat(endsWithRe, ")");
  } else {
    var endToken = tokens[tokens.length - 1];
    var isEndDelimited = typeof endToken === "string" ? delimiterRe.indexOf(endToken[endToken.length - 1]) > -1 : endToken === void 0;
    if (!strict) {
      route += "(?:".concat(delimiterRe, "(?=").concat(endsWithRe, "))?");
    }
    if (!isEndDelimited) {
      route += "(?=".concat(delimiterRe, "|").concat(endsWithRe, ")");
    }
  }
  return new RegExp(route, flags(options));
}
__name(tokensToRegexp, "tokensToRegexp");
__name2(tokensToRegexp, "tokensToRegexp");
function pathToRegexp(path, keys, options) {
  if (path instanceof RegExp)
    return regexpToRegexp(path, keys);
  if (Array.isArray(path))
    return arrayToRegexp(path, keys, options);
  return stringToRegexp(path, keys, options);
}
__name(pathToRegexp, "pathToRegexp");
__name2(pathToRegexp, "pathToRegexp");
var escapeRegex = /[.+?^${}()|[\]\\]/g;
function* executeRequest(request) {
  const requestPath = new URL(request.url).pathname;
  for (const route of [...routes].reverse()) {
    if (route.method && route.method !== request.method) {
      continue;
    }
    const routeMatcher = match(route.routePath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const mountMatcher = match(route.mountPath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const matchResult = routeMatcher(requestPath);
    const mountMatchResult = mountMatcher(requestPath);
    if (matchResult && mountMatchResult) {
      for (const handler of route.middlewares.flat()) {
        yield {
          handler,
          params: matchResult.params,
          path: mountMatchResult.path
        };
      }
    }
  }
  for (const route of routes) {
    if (route.method && route.method !== request.method) {
      continue;
    }
    const routeMatcher = match(route.routePath.replace(escapeRegex, "\\$&"), {
      end: true
    });
    const mountMatcher = match(route.mountPath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const matchResult = routeMatcher(requestPath);
    const mountMatchResult = mountMatcher(requestPath);
    if (matchResult && mountMatchResult && route.modules.length) {
      for (const handler of route.modules.flat()) {
        yield {
          handler,
          params: matchResult.params,
          path: matchResult.path
        };
      }
      break;
    }
  }
}
__name(executeRequest, "executeRequest");
__name2(executeRequest, "executeRequest");
var pages_template_worker_default = {
  async fetch(originalRequest, env, workerContext) {
    let request = originalRequest;
    const handlerIterator = executeRequest(request);
    let data = {};
    let isFailOpen = false;
    const next = /* @__PURE__ */ __name2(async (input, init) => {
      if (input !== void 0) {
        let url = input;
        if (typeof input === "string") {
          url = new URL(input, request.url).toString();
        }
        request = new Request(url, init);
      }
      const result = handlerIterator.next();
      if (result.done === false) {
        const { handler, params, path } = result.value;
        const context = {
          request: new Request(request.clone()),
          functionPath: path,
          next,
          params,
          get data() {
            return data;
          },
          set data(value) {
            if (typeof value !== "object" || value === null) {
              throw new Error("context.data must be an object");
            }
            data = value;
          },
          env,
          waitUntil: workerContext.waitUntil.bind(workerContext),
          passThroughOnException: /* @__PURE__ */ __name2(() => {
            isFailOpen = true;
          }, "passThroughOnException")
        };
        const response = await handler(context);
        if (!(response instanceof Response)) {
          throw new Error("Your Pages function should return a Response");
        }
        return cloneResponse(response);
      } else if ("ASSETS") {
        const response = await env["ASSETS"].fetch(request);
        return cloneResponse(response);
      } else {
        const response = await fetch(request);
        return cloneResponse(response);
      }
    }, "next");
    try {
      return await next();
    } catch (error) {
      if (isFailOpen) {
        const response = await env["ASSETS"].fetch(request);
        return cloneResponse(response);
      }
      throw error;
    }
  }
};
var cloneResponse = /* @__PURE__ */ __name2((response) => (
  // https://fetch.spec.whatwg.org/#null-body-status
  new Response(
    [101, 204, 205, 304].includes(response.status) ? null : response.body,
    response
  )
), "cloneResponse");
var drainBody = /* @__PURE__ */ __name2(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
__name2(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name2(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    return Response.json(error, {
      status: 500,
      headers: { "MF-Experimental-Error-Stack": "true" }
    });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = pages_template_worker_default;
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
__name2(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
__name2(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");
__name2(__facade_invoke__, "__facade_invoke__");
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  static {
    __name(this, "___Facade_ScheduledController__");
  }
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  static {
    __name2(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name2(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name2(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
__name2(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name2((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name2((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
__name2(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;

// C:/Users/jerry/AppData/Roaming/npm/node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody2 = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default2 = drainBody2;

// C:/Users/jerry/AppData/Roaming/npm/node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError2(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError2(e.cause)
  };
}
__name(reduceError2, "reduceError");
var jsonError2 = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError2(e);
    return Response.json(error, {
      status: 500,
      headers: { "MF-Experimental-Error-Stack": "true" }
    });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default2 = jsonError2;

// .wrangler/tmp/bundle-T1526P/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__2 = [
  middleware_ensure_req_body_drained_default2,
  middleware_miniflare3_json_error_default2
];
var middleware_insertion_facade_default2 = middleware_loader_entry_default;

// C:/Users/jerry/AppData/Roaming/npm/node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__2 = [];
function __facade_register__2(...args) {
  __facade_middleware__2.push(...args.flat());
}
__name(__facade_register__2, "__facade_register__");
function __facade_invokeChain__2(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__2(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__2, "__facade_invokeChain__");
function __facade_invoke__2(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__2(request, env, ctx, dispatch, [
    ...__facade_middleware__2,
    finalMiddleware
  ]);
}
__name(__facade_invoke__2, "__facade_invoke__");

// .wrangler/tmp/bundle-T1526P/middleware-loader.entry.ts
var __Facade_ScheduledController__2 = class ___Facade_ScheduledController__2 {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__2)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler2(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__2 === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__2.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__2) {
    __facade_register__2(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__2(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__2(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler2, "wrapExportedHandler");
function wrapWorkerEntrypoint2(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__2 === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__2.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__2) {
    __facade_register__2(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__2(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__2(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint2, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY2;
if (typeof middleware_insertion_facade_default2 === "object") {
  WRAPPED_ENTRY2 = wrapExportedHandler2(middleware_insertion_facade_default2);
} else if (typeof middleware_insertion_facade_default2 === "function") {
  WRAPPED_ENTRY2 = wrapWorkerEntrypoint2(middleware_insertion_facade_default2);
}
var middleware_loader_entry_default2 = WRAPPED_ENTRY2;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__2 as __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default2 as default
};
//# sourceMappingURL=functionsWorker-0.9334920914848587.js.map
