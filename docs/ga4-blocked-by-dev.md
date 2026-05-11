# GA4 修正 — 待 dev 合併後再做的項目

> 本 PR 基於 main 分支實作，但 GA4 修正清單裡有 3 項依賴 `dev` 分支才有的功能。
> 等 dev 合併進 main 後，開第二個 PR 補完。

## 1. p2_user_id：跨裝置 User-ID 串接

**已完成（在 main）**：
- [src/utils/analytics.ts](../src/utils/analytics.ts) 已實作 `setUserIdFromTwitchId(twitchId)` 與 `clearUserId()`
- 內含 SHA-256 + salt 邏輯
- 登入時會自動 trigger `login` event with method=`Twitch`

**待 dev 接**：
- dev 的 Twitch OAuth 流程（`useAuth.ts` / `AuthContext.tsx`）需在登入成功 callback 呼叫 `setUserIdFromTwitchId(twitchId)`
- dev 的登出流程需呼叫 `clearUserId()`

**接點建議**：

```ts
// dev 分支：src/contexts/AuthContext.tsx 的 onAuthStateChange 處理
import { setUserIdFromTwitchId, clearUserId } from '@/utils/analytics';

supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_IN' && session?.user) {
    // Twitch OAuth provider 的 user.id 是 Supabase auth.users.id
    // 但 GA4 跨裝置識別需要 Twitch 平台的 user id（穩定不變）
    const twitchId = session.user.user_metadata?.provider_id;
    if (twitchId) {
      setUserIdFromTwitchId(String(twitchId));
    }
  } else if (event === 'SIGNED_OUT') {
    clearUserId();
  }
});
```

## 2. p2_twitch_import_event：補 `twitch_import` 事件

**已完成（在 main）**：
- [src/utils/analytics.ts](../src/utils/analytics.ts) 已 export `track.twitchImport(importCount)`

**待 dev 接**：
- dev 的 [src/features/favorites/components/FavoritesManagerMain.tsx](../src/features/favorites/components/FavoritesManagerMain.tsx) `handleImportTwitchChannels()` 函式（commit `c7af775` 加的）在 import 完成後呼叫 `track.twitchImport(importedCount)`

**接點**：
```ts
// dev 分支：handleImportTwitchChannels 結束時
import { track } from '@/utils/analytics';

const successCount = await /* ... 既有 import 邏輯 ... */;
track.twitchImport(successCount);
```

## 3. p3_donation_tracking UI

**已完成（在 main）**：
- [src/utils/analytics.ts](../src/utils/analytics.ts) 已 export `track.clickDonationCta(location, paymentMethod)`

**待 dev 接**：
- dev 規劃的贊助元件（綠界 / BobaMe）UI 上線後，在贊助按鈕的 `onClick` 呼叫 `track.clickDonationCta('navbar', 'ecpay')` 之類

**還需要新增的事件 helper**（main 已預留結構但 spec 提到還需要）：
- `view_donation_cta`（看到按鈕）— 可加 `track.viewDonationCta(location)` 等贊助 UI 確定範圍後再加
- `donation_complete`（完成贊助）— 同上

## 處理流程

1. dev 分支進入「冷卻期」：連續 3 天沒有 fix(auth/account) commit
2. dev 合併到 main
3. 開第二個 PR `feat/ga4-fixes-phase2` 補完上述 3 項
4. 同步更新 [ga4-event-dictionary.md](./ga4-event-dictionary.md) 把標 `dev only` 的條目改為 `已實作`
