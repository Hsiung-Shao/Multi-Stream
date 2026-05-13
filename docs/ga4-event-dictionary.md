# GA4 事件字典

> 對應程式碼版本 `feat/ga4-fixes`。新增/移除事件時請同步更新本文件。

## 事件來源類型

- **GA4 內建**：GA4 SDK 自動送的事件（如 `session_start`、`first_visit`、`user_engagement`）
- **手動送**：本專案程式碼用 `track.*` 結構化 helper 或 `logEvent()` 向後相容 wrapper 送
- **強化評估**：GA4 後台啟用的自動評估（如 `scroll`、`click`、`form_start`、`video_start`）

## 結構化事件（spec 對齊，新事件首選）

定義在 [src/utils/analytics.ts](../src/utils/analytics.ts) 的 `track` 物件。

| 事件名稱 | 觸發時機 | 參數 | 是否標關鍵事件 | 程式碼位置 |
|---|---|---|---|---|
| `apply_preset` | 套用儲存的 preset 或預設 template 布局 | `preset_name`, `stream_count` | ✓ | [useStreamStore.ts applyLayout/applyTemplateLayout](../src/store/useStreamStore.ts) |
| `apply_custom` | 套用自訂布局 | `stream_count` | ✓ | [useStreamStore.ts applyCustomLayout](../src/store/useStreamStore.ts) — 待補 |
| `create_custom` | 新建自訂布局 | `stream_count` | — | [useStreamStore.ts createCustomLayout](../src/store/useStreamStore.ts) — 待補 |
| `change_layout` | 切換布局類型 | `layout_type`, `stream_count` | — | 待補 |
| `change_chat_layout` | 切換聊天室位置 | `chat_position` | — | 待補 |
| `add_favorite` | 收藏單一頻道 | `platform`, `channel_name` | — | 待 dev 合併後接 |
| `remove_favorite` | 移除收藏 | `platform`, `channel_name` | — | [FavoritesManagerMain.tsx remove](../src/features/favorites/components/FavoritesManagerMain.tsx) — 待從 logEvent 遷移 |
| `batch_import` | 批量匯入收藏 | `import_count`, `source` | ✓ | [BatchImportSection.tsx](../src/features/favorites/components/BatchImportSection.tsx) — 待從 logEvent 遷移 |
| `twitch_import` | Twitch 追隨頻道匯入 | `import_count` | — | **dev only** — main 沒此功能 |
| `export_json` | 匯出收藏 JSON | — | — | [BackupSection.tsx](../src/features/favorites/components/BackupSection.tsx) — 待從 logEvent 遷移 |
| `import_json` | 匯入收藏 JSON | — | — | 同上 |
| `toggle_mute_all` | 全體靜音切換 | `is_muted` | — | 待補 |
| `click_donation_cta` | 點擊贊助按鈕 | `location`, `payment_method` | ✓ | **待 dev 贊助 UI 上線後接** |
| `view_search_results` | 站內搜尋結果出現 | `search_term`, `result_count` | ✓ | [IslandSearch.tsx:78](../src/components/Navigation/IslandSearch.tsx#L78), [Navbar.tsx:115](../src/components/Navbar.tsx#L115) |
| `stream_start` | 加入新直播視窗 | `platform`, `is_first_stream` | — | [useStreamStore.ts addStream](../src/store/useStreamStore.ts) |
| `stream_milestone` | 觀看時間達到里程碑 | `milestone_minutes` (5/15/30/60) | — | [useStreamHeartbeat.ts](../src/hooks/useStreamHeartbeat.ts) |
| `login` | Twitch OAuth 登入成功 | `method` (固定 `Twitch`) | ✓ | **dev only** — 經 `setUserIdFromTwitchId` 自動觸發 |

## Heartbeat / Session（觀看時長系統）

[src/hooks/useStreamHeartbeat.ts](../src/hooks/useStreamHeartbeat.ts) 自動管理：

| 事件 | 頻率 / 時機 | 參數 |
|---|---|---|
| `stream_heartbeat` | 每 60 秒（前景時） | `stream_count`, `platforms` (`twitch`/`youtube`/`twitch,youtube`), `total_watch_seconds`, `is_active` |
| `session_pause` | 視窗切到背景 | `active_watch_seconds` |
| `session_resume` | 視窗回到前景 | — |
| `session_end` | `pagehide` 事件 | `total_watch_seconds`, `max_concurrent_streams` |

## Page View

| 事件 | 觸發 | 來源 |
|---|---|---|
| `page_view` | App 首載 + SPA 路由變更 | [App.tsx:51](../src/App.tsx#L51) `logPageView()` 首載；[useRouter.ts:60](../src/hooks/useRouter.ts#L60) 路由變更 |

> 已刪除的重複觸發點（不再使用）：
> - useRouter L61 額外的 `logEvent('Navigation', 'page_view', page)`
> - AboutPage / PrivacyPage 的 `useEffect → logEvent('AboutPage'/'PrivacyPage', 'page_view')`

## 向後相容（deprecated）

`logEvent(category, action, label?, value?)` 仍可用，內部對映為 `gtag('event', action, {event_category, event_label, value})`。**新事件請改用 `track.*`**，這個 wrapper 不會再加新功能。

仍透過 `logEvent` 送的事件（待逐步遷移）：

| 事件名稱 | 用法 |
|---|---|
| `tracking_disabled` | Privacy 拒絕追蹤 |
| `toggle_theme` | 主題切換（AboutPage / PrivacyPage） |
| `click_social` | 社群連結點擊 |
| `click_nav` | WelcomeCard 導覽連結 |
| `click_support` | Buy Me a Coffee 點擊 |
| `open_modal` | Tutorial / VersionHistory / Feedback modal 開啟 |
| `submit_success` / `submit_error` | Feedback 提交結果 |
| `switch_tab` | Tutorial 切頁 |
| `feature_used` | 功能首次使用（userSegmentation） |
| `segment_update` | 使用者分群更新 |
| `remove_favorite` / `batch_*` / `export_json` / `import_json` | 收藏管理（已有結構化 helper，待替換呼叫端） |

## User Properties

[src/utils/analytics.ts](../src/utils/analytics.ts) `setUserProperties()` 仍可用（react-ga4 兼容介面）。目前由 [src/utils/userSegmentation.ts](../src/utils/userSegmentation.ts) 設定：

- `visitor_type`：`new` / `returning` / `power_user`
- `visit_frequency`：訪問頻次分群
- `feature_depth`：使用功能深度
- `session_length`：本工作階段累積長度

> 這 4 個必須在 GA4 後台「自訂定義」登錄為自訂維度才能在報表用。見 [ga4-admin-todo.md #7](./ga4-admin-todo.md)。

## User-ID

`setUserIdFromTwitchId(twitchId)` 將 Twitch User ID 透過 SHA-256 + salt `multistream_hub_analytics` hash 後設為 GA4 user_id。`clearUserId()` 清除。

**安全規範**：
- 永遠不傳 email / username / 真實姓名
- Salt 在程式碼端固定，避免外部反查
- 登出時必須呼叫 clearUserId()

> 此 helper 已在 main 分支實作完成，但**等待 dev 合併後才有真的呼叫點**（Twitch OAuth 登入流程在 dev）。
