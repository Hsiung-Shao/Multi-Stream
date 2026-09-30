// 字串工具。
//
// V8 對 13 字元以上的 slice／regex 擷取結果會建立 sliced string：只記住「原字串＋起訖位置」，
// 所以留著一個標題就會把整份來源（/live 頁約 1.5MB，含中文時是 two-byte 約 3MB）一起留在記憶體。
// 2026-09-30 實測：live-og 60 頁留著 og:title → GC 後仍佔 171.7MB（Edge 上限 256MB，81 頁就撞到 memory limit）。

/** 複製成獨立的字串，不再參照來源（只給短字串用：標題、ID） */
export function detachString<T extends string | null | undefined>(s: T): T {
  if (s == null || s.length < 13) return s;
  return JSON.parse(JSON.stringify(s)) as T;
}
