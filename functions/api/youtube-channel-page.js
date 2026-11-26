// Cloudflare Pages Function: YouTube 頻道頁面代理端點
// 用於代理 YouTube 頻道頁面請求，解決 CORS 問題，用於提取 channel ID

import { getCorsHeaders, isRequestFromAllowedSite } from '../lib/cors.js';
import { checkQuotas, getVisitorIp, ipKey, quotaWindow } from '../lib/rate-limit.js';
import { writeChannelCacheBackground } from '../lib/youtube-channel-cache.js';

// 2026-11-27 資安稽核 C 組：比照 youtube-channel-live-og 補上降載控制（整頁抓 YouTube 單次 CPU 接近免費方案上限）
//   - 只接受本站頁面發出的請求（header 可偽造，真正防線是 WAF）
//   - Cache API 以小寫 handle 為鍵（YouTube handle 不分大小寫，避免換大小寫或加參數繞過快取）
//   - 未命中快取時每 IP 每小時 30 次；抓 YouTube 逾時 8 秒
//   - 解析到的頻道名由伺服器寫進 youtube_channels
const CACHE_TTL_SECONDS = 86400;
const NOT_FOUND_CACHE_TTL_SECONDS = 3600;
const HOURLY_LIMIT_PER_IP = 30;
const YOUTUBE_TIMEOUT_MS = 8000;

function toClientResponse(response, request, cacheStatus) {
  const out = new Response(response.body, response);
  out.headers.set('Cache-Control', 'no-store');
  out.headers.delete('Access-Control-Allow-Origin');
  for (const [key, value] of Object.entries(getCorsHeaders(request, { methods: 'GET, OPTIONS' }))) {
    out.headers.set(key, value);
  }
  if (cacheStatus) out.headers.set('X-Edge-Cache', cacheStatus);
  return out;
}

export async function onRequestGet(context) {
  const { request, env } = context;
  if (!isRequestFromAllowedSite(request)) {
    return toClientResponse(new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: { 'Content-Type': 'application/json' } }), request);
  }

  const url = new URL(request.url);
  const handle = (url.searchParams.get('username') || url.searchParams.get('handle') || '').replace(/^@/, '').trim().toLowerCase();
  // 格式不合交給原邏輯回 400，不進快取
  if (!handle || handle.length > 100) return toClientResponse(await handleChannelPageRequest(request, env), request);

  const cache = typeof caches !== 'undefined' ? caches.default : null;
  const cacheKey = new Request(`${url.origin}/api/youtube-channel-page?handle=${encodeURIComponent(handle)}`);
  if (cache) {
    const hit = await cache.match(cacheKey);
    if (hit) return toClientResponse(hit, request, 'HIT');
  }

  const ip = getVisitorIp(request);
  if (ip) {
    const quota = await checkQuotas(env?.RATE_LIMIT_KV, [
      { key: `yt-channel-page:${ipKey(ip)}:${quotaWindow().hour}`, limit: HOURLY_LIMIT_PER_IP, ttl: 3700 },
    ]);
    if (!quota.ok) {
      return toClientResponse(new Response(JSON.stringify({ error: 'rate_limited' }), { status: 429, headers: { 'Content-Type': 'application/json' } }), request);
    }
  }

  const response = await handleChannelPageRequest(request, env);
  if (response.status === 200) {
    const data = await response.clone().json().catch(() => null);
    context.waitUntil?.(writeChannelCacheBackground(env, data?.channelId, data?.channelTitle));
  }
  if (cache && (response.status === 200 || response.status === 404)) {
    const stored = new Response(response.clone().body, response);
    stored.headers.set('Cache-Control', `public, max-age=${response.status === 200 ? CACHE_TTL_SECONDS : NOT_FOUND_CACHE_TTL_SECONDS}`);
    context.waitUntil?.(cache.put(cacheKey, stored));
  }
  return toClientResponse(response, request, 'MISS');
}

async function handleChannelPageRequest(request, env) {
  try {
    const url = new URL(request.url);
    const username = url.searchParams.get('username') || url.searchParams.get('handle');
    
    if (!username) {
      return new Response(
        JSON.stringify({ error: '缺少 username 或 handle 參數' }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        }
      );
    }
    
    // 移除 @ 符號（如果有的話）
    const cleanUsername = username.replace(/^@/, '').trim();
    
    // 驗證 username 格式（允許 Unicode 字符，因為有些頻道名稱包含中文等）
    if (!cleanUsername || cleanUsername.length > 100) {
      return new Response(
        JSON.stringify({ error: '無效的 username 格式' }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        }
      );
    }
    
    // 構建 YouTube 頻道頁面 URL（使用主頁面，因為它包含更多資訊）
    const channelUrl = `https://www.youtube.com/@${cleanUsername}`;
    
    // 從 YouTube 獲取頻道頁面 HTML
    const response = await fetch(channelUrl, {
      method: 'GET',
      signal: AbortSignal.timeout(YOUTUBE_TIMEOUT_MS),
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });
    
    if (!response.ok) {
      return new Response(
        JSON.stringify({ 
          error: '無法獲取頻道頁面',
          status: response.status,
          statusText: response.statusText
        }),
        {
          status: response.status,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        }
      );
    }
    
    const htmlText = await response.text();
    
    // 從 HTML 中提取 channelId（多種可能的模式，優先使用最準確的方法）
    let channelId = null;
    let channelTitle = null;
    
    // 優先方法1: 從 ytInitialData 中提取（最準確，因為這是頻道的主要數據）
    try {
      // 查找 ytInitialData 變數（使用更精確的正則表達式）
      // 匹配 var ytInitialData = {...}; 或 window["ytInitialData"] = {...};
      const ytInitialDataPatterns = [
        /var ytInitialData\s*=\s*({[\s\S]*?});/,
        /window\["ytInitialData"\]\s*=\s*({[\s\S]*?});/,
        /ytInitialData\s*=\s*({[\s\S]*?});/
      ];
      
      for (const pattern of ytInitialDataPatterns) {
        const ytInitialDataMatch = htmlText.match(pattern);
        if (ytInitialDataMatch) {
          try {
            // 嘗試解析 JSON（可能需要處理不完整的 JSON）
            let jsonStr = ytInitialDataMatch[1];
            // 如果 JSON 不完整（缺少結尾），嘗試修復
            let braceCount = 0;
            let lastValidIndex = -1;
            for (let i = 0; i < jsonStr.length; i++) {
              if (jsonStr[i] === '{') braceCount++;
              if (jsonStr[i] === '}') braceCount--;
              if (braceCount === 0) {
                lastValidIndex = i;
                break;
              }
            }
            if (lastValidIndex > 0) {
              jsonStr = jsonStr.substring(0, lastValidIndex + 1);
            }
            
            const ytInitialData = JSON.parse(jsonStr);
            // 從 metadata 中提取 channelId（最可靠的位置）
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
            // JSON 解析失敗，繼續嘗試下一個模式或其他方法
            continue;
          }
        }
      }
    } catch (e) {
      // 忽略錯誤，繼續嘗試其他方法
    }
    
    // 優先方法2: 從 canonical URL 提取（非常準確，因為這是該頁面的標準 URL）
    if (!channelId) {
      const canonicalMatch = htmlText.match(/<link[^>]*rel="canonical"[^>]*href="[^"]*\/channel\/(UC[a-zA-Z0-9_-]{22})/);
      if (canonicalMatch) {
        channelId = canonicalMatch[1];
      }
    }
    
    // 優先方法3: 從 JSON-LD 結構化數據提取（準確，因為這是該頻道的元數據）
    if (!channelId) {
      const jsonLdMatches = htmlText.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g);
      for (const match of jsonLdMatches) {
        try {
          const jsonLd = JSON.parse(match[1]);
          // 查找頻道相關的結構化數據
          if (jsonLd['@type'] === 'Person' || jsonLd['@type'] === 'Organization') {
            const url = jsonLd.url || jsonLd.sameAs?.[0];
            if (url && url.includes('/channel/')) {
              const urlMatch = url.match(/\/channel\/(UC[a-zA-Z0-9_-]{22})/);
              if (urlMatch) {
                channelId = urlMatch[1];
                break;
              }
            }
          }
        } catch (e) {
          // JSON 解析失敗，繼續下一個
        }
      }
    }
    
    // 方法4: 從 meta 標籤提取（og:url 通常包含 channelId）
    if (!channelId) {
      const ogUrlMatch = htmlText.match(/<meta[^>]*property="og:url"[^>]*content="[^"]*\/channel\/(UC[a-zA-Z0-9_-]{22})/);
      if (ogUrlMatch) {
        channelId = ogUrlMatch[1];
      }
    }
    
    // 方法5: 從頁面中的 "channelId" 字段提取（需要驗證是否與當前 @username 匹配）
    if (!channelId) {
      // 查找所有可能的 channelId，但優先選擇與 @username 相關的
      const channelIdMatches = htmlText.matchAll(/"channelId":"(UC[a-zA-Z0-9_-]{22})"/g);
      // 如果只有一個匹配，使用它；如果有多個，需要進一步驗證
      const matches = Array.from(channelIdMatches);
      if (matches.length === 1) {
        channelId = matches[0][1];
      } else if (matches.length > 1) {
        // 有多個 channelId，嘗試找到與 @username 相關的
        // 查找包含 @username 和 channelId 的上下文
        for (const match of matches) {
          const contextStart = Math.max(0, match.index - 500);
          const contextEnd = Math.min(htmlText.length, match.index + match[0].length + 500);
          const context = htmlText.substring(contextStart, contextEnd);
          // 如果上下文中包含 @username 或相關的頻道資訊，使用這個 channelId
          if (context.includes(`@${cleanUsername}`) || context.includes('channelMetadataRenderer')) {
            channelId = match[1];
            break;
          }
        }
        // 如果沒有找到匹配的，使用第一個（fallback）
        if (!channelId && matches.length > 0) {
          channelId = matches[0][1];
        }
      }
    }
    
    // 方法6: 從 externalId 提取（fallback）
    if (!channelId) {
      const externalIdMatch = htmlText.match(/"externalId":"(UC[a-zA-Z0-9_-]{22})"/);
      if (externalIdMatch) {
        channelId = externalIdMatch[1];
      }
    }
    
    // 方法7: 從 URL 路徑提取（最後的 fallback）
    if (!channelId) {
      // 查找所有 /channel/UC... 的出現
      const channelMatches = htmlText.matchAll(/\/channel\/(UC[a-zA-Z0-9_-]{22})/g);
      const matches = Array.from(channelMatches);
      if (matches.length > 0) {
        // 優先選擇出現在 canonical、og:url 或 JSON-LD 中的
        // 如果沒有，使用第一個出現的
        channelId = matches[0][1];
      }
    }
    
    // 提取頻道標題（多種方法）
    // 方法1: 從 ytInitialData 提取（最準確）
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
        // 忽略錯誤
      }
    }
    
    // 方法2: 從頁面標題提取
    if (!channelTitle) {
      const titleMatch = htmlText.match(/<title>([^<]+)<\/title>/);
      if (titleMatch) {
        channelTitle = titleMatch[1].replace(/\s*-\s*YouTube\s*$/, '').trim();
      }
    }
    
    // 方法3: 從 meta 標籤提取
    if (!channelTitle) {
      const metaTitleMatch = htmlText.match(/<meta[^>]*property="og:title"[^>]*content="([^"]+)"/);
      if (metaTitleMatch) {
        channelTitle = metaTitleMatch[1];
      }
    }
    
    // 驗證提取的 channelId 是否正確（通過檢查 canonical URL 是否包含 @username）
    if (channelId) {
      // 驗證：檢查 canonical URL 是否指向正確的頻道
      const canonicalMatch = htmlText.match(/<link[^>]*rel="canonical"[^>]*href="([^"]+)"/);
      if (canonicalMatch) {
        const canonicalUrl = canonicalMatch[1];
        // 如果 canonical URL 包含 @username，確保 channelId 匹配
        if (canonicalUrl.includes(`@${cleanUsername}`)) {
          // 驗證通過
        } else if (canonicalUrl.includes('/channel/')) {
          // canonical URL 是 /channel/ 格式，提取其中的 channelId 並驗證
          const canonicalChannelIdMatch = canonicalUrl.match(/\/channel\/(UC[a-zA-Z0-9_-]{22})/);
          if (canonicalChannelIdMatch && canonicalChannelIdMatch[1] !== channelId) {
            // 如果不匹配，使用 canonical URL 中的 channelId（更可靠）
            channelId = canonicalChannelIdMatch[1];
          }
        }
      }
    }
    
    // 返回 JSON 格式的響應，包含 channelId 和 channelTitle
    return new Response(
      JSON.stringify({
        channelId: channelId,
        channelTitle: channelTitle,
        username: cleanUsername,
        success: !!channelId,
        error: channelId ? null : '無法從頁面中提取 channelId'
      }),
      {
        status: channelId ? 200 : 404,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Cache-Control': 'public, max-age=3600' // 快取 1 小時（頻道 ID 不會頻繁變化）
        }
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ 
        error: '伺服器錯誤', 
        message: error.message || '處理請求時發生未知錯誤'
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      }
    );
  }
}

// 處理 OPTIONS 請求（CORS 預檢請求）
export function onRequestOptions(context) {
  return new Response(null, { status: 204, headers: getCorsHeaders(context.request, { methods: 'GET, OPTIONS' }) });
}

