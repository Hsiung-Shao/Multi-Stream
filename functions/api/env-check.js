// Cloudflare Pages Function: 環境變數診斷端點
// 此函數用於檢查 Cloudflare Pages 環境變數配置狀態
// 訪問：/api/env-check

/**
 * 處理環境變數診斷請求
 * @param {Request} request - 請求對象
 * @param {Object} env - Cloudflare Pages 環境變數
 * @returns {Promise<Response>} - JSON 回應
 */
export async function onRequestGet(request, env) {
  return handleEnvCheckRequest(request, env);
}

async function handleEnvCheckRequest(request, env) {
  try {
    // 檢查 env 對象是否存在
    if (!env) {
      return new Response(
        JSON.stringify({
          status: 'error',
          message: '環境變數對象不存在',
          diagnostics: {
            envExists: false,
            twitchClientId: { exists: false, value: null },
            twitchClientSecret: { exists: false, value: null },
            suggestion: 'Cloudflare Pages Functions 可能未正確配置環境變數。請檢查部署配置。'
          }
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

    // 檢查必要的環境變數
    const twitchClientId = env.TWITCH_CLIENT_ID;
    const twitchClientSecret = env.TWITCH_CLIENT_SECRET;

    // 列出所有環境變數鍵（不顯示敏感值）
    const allEnvKeys = Object.keys(env || {});
    const nonSensitiveKeys = allEnvKeys.filter(key => 
      !key.includes('SECRET') && !key.includes('TOKEN') && !key.includes('PASSWORD') && !key.includes('KEY')
    );

    // 診斷結果
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
      allEnvKeys: allEnvKeys,
      nonSensitiveEnvKeys: nonSensitiveKeys,
      totalEnvVars: allEnvKeys.length
    };

    // 檢查狀態
    const allConfigured = diagnostics.twitchClientId.exists && 
                         !diagnostics.twitchClientId.isEmpty &&
                         diagnostics.twitchClientSecret.exists && 
                         !diagnostics.twitchClientSecret.isEmpty;

    if (allConfigured) {
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

      return new Response(
        JSON.stringify({
          status: 'error',
          message: `缺少或未正確配置的環境變數：${missing.join(', ')}`,
          diagnostics: diagnostics,
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

// 處理 OPTIONS 請求（CORS 預檢請求）
export async function onRequestOptions(request, env) {
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
