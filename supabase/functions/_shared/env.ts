// 環境變數讀取：Edge Function（Deno）與 Node 測試腳本都能用，所以不直接引用 Deno 型別。
//
// 本地 edge runtime 會自動注入 SUPABASE_URL（http://kong:8000）與 SUPABASE_SERVICE_ROLE_KEY；
// 第三方金鑰來自 supabase/functions/.env（scripts/local/write-functions-env.mjs 產生，已 gitignore）。

export interface ScheduleEnv {
  supabaseUrl: string;
  serviceRoleKey: string;
  youtubeApiKey: string;
  youtubeReferer: string;
  twitchClientId: string;
  twitchClientSecret: string;
  cronSecret: string | null;
}

type EnvReader = (name: string) => string | undefined;

function defaultReader(): EnvReader {
  const g = globalThis as unknown as {
    Deno?: { env: { get(name: string): string | undefined } };
    process?: { env: Record<string, string | undefined> };
  };
  if (g.Deno?.env) return (name) => g.Deno!.env.get(name);
  if (g.process?.env) return (name) => g.process!.env[name];
  return () => undefined;
}

export function readScheduleEnv(read: EnvReader = defaultReader()): ScheduleEnv {
  const need = (name: string): string => {
    const v = read(name);
    if (!v) throw new Error(`missing env ${name}`);
    return v;
  };
  return {
    supabaseUrl: need('SUPABASE_URL').replace(/\/$/, ''),
    serviceRoleKey: need('SUPABASE_SERVICE_ROLE_KEY'),
    youtubeApiKey: need('YOUTUBE_API_KEY'),
    // 金鑰有 HTTP referer 限制，伺服器端一定要手動帶（memory error_google_api_key_referer_restriction）
    youtubeReferer: read('YOUTUBE_API_REFERER') || 'https://multistreaming.org',
    twitchClientId: need('TWITCH_CLIENT_ID'),
    twitchClientSecret: need('TWITCH_CLIENT_SECRET'),
    cronSecret: read('SCHEDULE_CRON_SECRET') || null,
  };
}
