// Cloudflare Pages Function: 環境變數診斷端點
// 此函數用於檢查 Cloudflare Pages 環境變數配置狀態
// 訪問：/api/env-check

// HTML 轉義函數（防止 XSS）
function escapeHtml(text) {
  if (!text) return '';
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return String(text).replace(/[&<>"']/g, m => map[m]);
}

// 提取診斷邏輯為獨立函數（必須在最前面定義，非異步函數）
function getDiagnostics(env) {
  if (!env) {
    return {
      allConfigured: false,
      message: '環境變數對象不存在',
      envExists: false,
      twitchClientId: { exists: false, isEmpty: true, preview: null },
      twitchClientSecret: { exists: false, isEmpty: true, preview: null },
      totalEnvVars: 0
    };
  }

  const twitchClientId = env.TWITCH_CLIENT_ID;
  const twitchClientSecret = env.TWITCH_CLIENT_SECRET;
  const allEnvKeys = Object.keys(env || {});

  const diagnostics = {
    envExists: true,
    twitchClientId: {
      exists: !!twitchClientId,
      isEmpty: twitchClientId === '' || twitchClientId === null || twitchClientId === undefined,
      length: twitchClientId ? String(twitchClientId).length : 0,
      preview: twitchClientId ? String(twitchClientId).substring(0, 8) + '...' : null
    },
    twitchClientSecret: {
      exists: !!twitchClientSecret,
      isEmpty: twitchClientSecret === '' || twitchClientSecret === null || twitchClientSecret === undefined,
      length: twitchClientSecret ? String(twitchClientSecret).length : 0,
      preview: twitchClientSecret ? '***' + String(twitchClientSecret).substring(String(twitchClientSecret).length - 4) : null
    },
    totalEnvVars: allEnvKeys.length
  };

  diagnostics.allConfigured = diagnostics.twitchClientId.exists && 
                              !diagnostics.twitchClientId.isEmpty &&
                              diagnostics.twitchClientSecret.exists && 
                              !diagnostics.twitchClientSecret.isEmpty;

  if (diagnostics.allConfigured) {
    diagnostics.message = '所有必要的環境變數都已正確配置';
  } else {
    const missing = [];
    if (!diagnostics.twitchClientId.exists || diagnostics.twitchClientId.isEmpty) {
      missing.push('TWITCH_CLIENT_ID');
    }
    if (!diagnostics.twitchClientSecret.exists || diagnostics.twitchClientSecret.isEmpty) {
      missing.push('TWITCH_CLIENT_SECRET');
    }
    diagnostics.message = `缺少或未正確配置的環境變數：${missing.join(', ')}`;
  }

  return diagnostics;
}

/**
 * 處理環境變數診斷請求
 * 支持兩種 API 格式：
 * - 新格式：onRequestGet(context) 其中 context = { request, env }
 * - 舊格式：onRequestGet(request, env)
 * @param {Object|Request} contextOrRequest - 上下文對象或請求對象
 * @param {Object} env - Cloudflare Pages 環境變數（舊格式）
 * @returns {Promise<Response>} - JSON 回應
 */
export async function onRequestGet(contextOrRequest, env) {
  try {
    // 支持新舊兩種 API 格式
    let request, envObj;
    if (contextOrRequest && contextOrRequest.request) {
      // 新格式：context 對象包含 request 和 env
      request = contextOrRequest.request;
      envObj = contextOrRequest.env;
    } else {
      // 舊格式：第一個參數是 request，第二個是 env
      request = contextOrRequest;
      envObj = env;
    }
    
    // 驗證 request 對象
    if (!request) {
      throw new Error('Request 對象不存在');
    }
    
    // 獲取 URL（用於判斷返回格式）
    const url = request.url || '';
    
    // 檢查是否明確要求 JSON 格式（通過 URL 參數）
    const wantsJson = url.includes('?format=json') || url.includes('&format=json');
    
    // 默認返回 HTML（瀏覽器訪問），只有明確指定 ?format=json 才返回 JSON
    if (wantsJson) {
      return await handleEnvCheckRequest(request, envObj);
    } else {
      // 默認返回 HTML（瀏覽器訪問）
      return await handleEnvCheckHTMLRequest(request, envObj);
    }
  } catch (error) {
    // 頂層錯誤處理
    console.error('[env-check] 頂層錯誤:', error);
    console.error('[env-check] 錯誤類型:', error.constructor.name);
    console.error('[env-check] 錯誤訊息:', error.message);
    if (error.stack) {
      console.error('[env-check] 錯誤堆疊:', error.stack.split('\n').slice(0, 5).join('\n'));
    }
    
    return new Response(
      JSON.stringify({
        status: 'error',
        message: '處理請求時發生未預期的錯誤',
        error: error.message || '未知錯誤',
        errorType: error.constructor.name,
        stack: error.stack ? error.stack.split('\n').slice(0, 5).join('\n') : '無堆疊信息',
        suggestion: '請檢查 Cloudflare Pages Functions 日誌以獲取更多詳情。'
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type'
        }
      }
    );
  }
}

async function handleEnvCheckRequest(request, env) {
  try {
    // 使用統一的診斷函數
    const diagnostics = getDiagnostics(env);

    if (diagnostics.allConfigured) {
      return new Response(
        JSON.stringify({
          status: 'success',
          message: '所有必要的環境變數都已正確配置',
          diagnostics: diagnostics,
          nextSteps: [
            '環境變數配置正確',
            '可以嘗試訪問 /api/twitch-token 測試 Token 獲取',
            '如果仍有問題，請檢查 Twitch API 憑證是否有效'
          ]
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type'
          }
        }
      );
    } else {
      // 找出缺少的變數
      const missing = [];
      if (!diagnostics.twitchClientId.exists || diagnostics.twitchClientId.isEmpty) {
        missing.push('TWITCH_CLIENT_ID');
      }
      if (!diagnostics.twitchClientSecret.exists || diagnostics.twitchClientSecret.isEmpty) {
        missing.push('TWITCH_CLIENT_SECRET');
      }

      // 列出所有環境變數鍵（用於 JSON 回應）
      const allEnvKeys = env ? Object.keys(env) : [];
      const nonSensitiveKeys = allEnvKeys.filter(key => 
        !key.includes('SECRET') && !key.includes('TOKEN') && !key.includes('PASSWORD') && !key.includes('KEY')
      );

      return new Response(
        JSON.stringify({
          status: 'error',
          message: diagnostics.message,
          diagnostics: {
            ...diagnostics,
            allEnvKeys: allEnvKeys,
            nonSensitiveEnvKeys: nonSensitiveKeys
          },
          missingVariables: missing,
          setupInstructions: {
            step1: '進入 Cloudflare Pages 控制台',
            step2: '選擇您的 Pages 專案',
            step3: '前往 Settings → Variables & Secrets',
            step4: '在 Variables 標籤中添加 TWITCH_CLIENT_ID（選擇 Production 和 Preview 環境）',
            step5: '在 Secrets 標籤中添加 TWITCH_CLIENT_SECRET（選擇 Production 和 Preview 環境）',
            step6: '保存後，在 Deployments 頁面重新部署專案',
            step7: '重新訪問此端點確認配置'
          },
          commonIssues: [
            '⚠️ 只設定了 Production 環境，忘記設定 Preview 環境',
            '⚠️ 變數名稱拼寫錯誤（大小寫敏感）',
            '⚠️ 設定後忘記重新部署',
            '⚠️ Secrets 類型錯誤（應該使用 Secrets 而不是 Variables）'
          ]
        }),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type'
          }
        }
      );
    }
  } catch (error) {
    console.error('環境變數診斷錯誤:', error);
    
    return new Response(
      JSON.stringify({
        status: 'error',
        message: '診斷過程中發生錯誤',
        error: error.message || '未知錯誤',
        diagnostics: {
          errorType: error.constructor.name
        },
        suggestion: '請檢查 Cloudflare Pages Functions 日誌以獲取更多詳情。'
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type'
        }
      }
    );
  }
}

// 處理 HTML 版本的診斷請求
async function handleEnvCheckHTMLRequest(request, env) {
  try {
    // 先獲取診斷數據
    const diagnostics = getDiagnostics(env);
    
    const statusColor = diagnostics.allConfigured ? '#4caf50' : '#f44336';
    const statusIcon = diagnostics.allConfigured ? '✅' : '❌';
    const statusText = diagnostics.allConfigured ? '成功' : '錯誤';
    
    const html = `<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>環境變數診斷 - Cloudflare Pages</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      padding: 20px;
      color: #333;
    }
    .container {
      max-width: 900px;
      margin: 0 auto;
      background: white;
      border-radius: 12px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.2);
      overflow: hidden;
    }
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 30px;
      text-align: center;
    }
    .header h1 {
      font-size: 28px;
      margin-bottom: 10px;
    }
    .header p {
      opacity: 0.9;
      font-size: 14px;
    }
    .content {
      padding: 30px;
    }
    .status-card {
      background: rgba(102, 126, 234, 0.1);
      border-left: 4px solid ${statusColor};
      padding: 20px;
      margin-bottom: 30px;
      border-radius: 8px;
    }
    .status-card.success {
      background: rgba(76, 175, 80, 0.1);
    }
    .status-card.error {
      background: rgba(244, 67, 54, 0.1);
    }
    .status-card h2 {
      color: ${statusColor};
      font-size: 24px;
      margin-bottom: 10px;
    }
    .status-card p {
      color: #666;
      line-height: 1.6;
    }
    .info-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 20px;
      margin-bottom: 30px;
    }
    .info-card {
      background: #f5f5f5;
      padding: 20px;
      border-radius: 8px;
      border: 1px solid #ddd;
    }
    .info-card h3 {
      color: #333;
      font-size: 16px;
      margin-bottom: 10px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .info-card .value {
      font-size: 14px;
      color: #666;
      word-break: break-all;
    }
    .exists {
      color: #4caf50;
      font-weight: bold;
    }
    .missing {
      color: #f44336;
      font-weight: bold;
    }
    .instructions {
      background: #fff3cd;
      border: 1px solid #ffc107;
      border-radius: 8px;
      padding: 20px;
      margin-bottom: 30px;
    }
    .instructions h3 {
      color: #856404;
      margin-bottom: 15px;
    }
    .instructions ol {
      margin-left: 20px;
      line-height: 2;
      color: #856404;
    }
    .common-issues {
      background: #f8d7da;
      border: 1px solid #f5c6cb;
      border-radius: 8px;
      padding: 20px;
      margin-bottom: 30px;
    }
    .common-issues h3 {
      color: #721c24;
      margin-bottom: 15px;
    }
    .common-issues ul {
      margin-left: 20px;
      line-height: 2;
      color: #721c24;
    }
    .next-steps {
      background: #d1ecf1;
      border: 1px solid #bee5eb;
      border-radius: 8px;
      padding: 20px;
    }
    .next-steps h3 {
      color: #0c5460;
      margin-bottom: 15px;
    }
    .next-steps ul {
      margin-left: 20px;
      line-height: 2;
      color: #0c5460;
    }
    .btn {
      display: inline-block;
      padding: 12px 24px;
      background: #667eea;
      color: white;
      text-decoration: none;
      border-radius: 6px;
      margin-top: 20px;
      transition: background 0.3s;
    }
    .btn:hover {
      background: #5568d3;
    }
    .json-link {
      text-align: center;
      margin-top: 20px;
      padding-top: 20px;
      border-top: 1px solid #ddd;
    }
    .json-link a {
      color: #667eea;
      text-decoration: none;
    }
    .json-link a:hover {
      text-decoration: underline;
    }
    code {
      background: #f5f5f5;
      padding: 2px 6px;
      border-radius: 3px;
      font-family: 'Courier New', monospace;
      font-size: 13px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🔍 Cloudflare Pages 環境變數診斷</h1>
      <p>檢查您的 Twitch API 環境變數配置狀態</p>
    </div>
    <div class="content">
      <div class="status-card ${diagnostics.allConfigured ? 'success' : 'error'}">
        <h2>${statusIcon} 狀態：${escapeHtml(statusText)}</h2>
        <p>${escapeHtml(diagnostics.message)}</p>
      </div>

      <div class="info-grid">
        <div class="info-card">
          <h3>TWITCH_CLIENT_ID</h3>
          <div class="value">
            <span class="${diagnostics.twitchClientId.exists && !diagnostics.twitchClientId.isEmpty ? 'exists' : 'missing'}">
              ${diagnostics.twitchClientId.exists && !diagnostics.twitchClientId.isEmpty ? '✅ 已設定' : '❌ 未設定'}
            </span>
            ${diagnostics.twitchClientId.exists && !diagnostics.twitchClientId.isEmpty ? `<br><small>預覽：<code>${escapeHtml(diagnostics.twitchClientId.preview || 'N/A')}</code></small>` : ''}
          </div>
        </div>
        <div class="info-card">
          <h3>TWITCH_CLIENT_SECRET</h3>
          <div class="value">
            <span class="${diagnostics.twitchClientSecret.exists && !diagnostics.twitchClientSecret.isEmpty ? 'exists' : 'missing'}">
              ${diagnostics.twitchClientSecret.exists && !diagnostics.twitchClientSecret.isEmpty ? '✅ 已設定' : '❌ 未設定'}
            </span>
            ${diagnostics.twitchClientSecret.exists && !diagnostics.twitchClientSecret.isEmpty ? `<br><small>預覽：<code>${escapeHtml(diagnostics.twitchClientSecret.preview || 'N/A')}</code></small>` : ''}
          </div>
        </div>
        <div class="info-card">
          <h3>環境變數總數</h3>
          <div class="value">${escapeHtml(String(diagnostics.totalEnvVars))} 個</div>
        </div>
      </div>

      ${!diagnostics.allConfigured ? `
      <div class="instructions">
        <h3>📝 設定步驟</h3>
        <ol>
          <li>進入 Cloudflare Pages 控制台</li>
          <li>選擇您的 Pages 專案</li>
          <li>前往 Settings → Variables & Secrets</li>
          <li>在 Variables 標籤中添加 <code>TWITCH_CLIENT_ID</code>（選擇 Production 和 Preview 環境）</li>
          <li>在 Secrets 標籤中添加 <code>TWITCH_CLIENT_SECRET</code>（選擇 Production 和 Preview 環境）</li>
          <li>保存後，在 Deployments 頁面重新部署專案</li>
          <li>重新訪問此頁面確認配置</li>
        </ol>
      </div>

      <div class="common-issues">
        <h3>⚠️ 常見問題</h3>
        <ul>
          <li>只設定了 Production 環境，忘記設定 Preview 環境</li>
          <li>變數名稱拼寫錯誤（大小寫敏感）</li>
          <li>設定後忘記重新部署</li>
          <li>Secrets 類型錯誤（應該使用 Secrets 而不是 Variables）</li>
        </ul>
      </div>
      ` : ''}

      ${diagnostics.allConfigured ? `
      <div class="next-steps">
        <h3>✅ 下一步</h3>
        <ul>
          <li>環境變數配置正確</li>
          <li>可以嘗試訪問 <a href="/api/twitch-token" target="_blank"><code>/api/twitch-token</code></a> 測試 Token 獲取</li>
          <li>如果仍有問題，請檢查 Twitch API 憑證是否有效</li>
        </ul>
      </div>
      ` : ''}

      <div class="json-link">
        <a href="/api/env-check?format=json">查看 JSON 格式的診斷結果</a>
      </div>
    </div>
  </div>
</body>
</html>`;
    
    return new Response(html, {
      status: diagnostics.allConfigured ? 200 : 500,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-cache'
      }
    });
  } catch (error) {
    const errorHtml = `<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>診斷錯誤</title>
</head>
<body style="font-family: Arial, sans-serif; padding: 20px; background: #f5f5f5;">
  <h1>❌ 診斷過程中發生錯誤</h1>
  <p>${escapeHtml(error.message || '未知錯誤')}</p>
  <a href="/api/env-check?format=json">查看 JSON 格式</a>
</body>
</html>`;
    return new Response(errorHtml, {
      status: 500,
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
  }
}


// 處理 OPTIONS 請求（CORS 預檢請求）
export async function onRequestOptions(contextOrRequest, env) {
  // 支持新舊兩種 API 格式（但 OPTIONS 通常不需要 env）
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400' // 24 小時
    }
  });
}
