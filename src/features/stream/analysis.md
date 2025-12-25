# Stream.js Analysis & Audit

## 1. Status Audit (現況盤點)

### Public API (Window Scope)
`js/stream.js` 直接定義或掛載於 `window` 的函式，供外部 (如 `main.js`, `control-panel.js`) 呼叫。

| Function Name | Parameters | Returns | Side Effects | Description |
|Data Type| | | | |
| `addStream` | `(url: string \| null)` | `Promise<void>` | DOM, Global State, Players, Chat | **核心入口**。解析 URL，建立 DOM 結構 (Box/Controls/PlayerContainer/ChatContainer)，初始化 Player 與 Chat，觸發 Layout 更新。 |
| `reloadStream` | `(id: number)` | `void` | DOM, Players | 重建指定 ID 的 Player (銷毀再重創)，保留音量與聊天室狀態。 |
| `removeBox` | `(id: number)` | `void` | DOM, Global State, Players, Chat | 銷毀指定 ID 的所有資源 (Player, Chat, StreamData, DOM)，觸發 Layout 更新。 |
| `clearAll` | `()` | `void` | DOM, Global State, Players, Chat | 銷毀**所有**串流資源，重置 global counters。 |
| `saveLayout` | `()` | `void` | localStorage | 將當前 `streamData` 與 DOM style (位置/大小) 序列化存入 `localStorage`。 |
| `loadLayout` | `()` | `void` | DOM, Global State | 從 `localStorage`讀取設定，清空當前畫面，依序呼叫 `addStream` 重建場景。 |

### Dependencies (外部依賴)

#### Global Variables (State)
依賴於 `js/main.js` 初始化這些全域變數：
- `window.streamCount`: (number) 遞增的 Stream ID 計數器。
- `window.players`: (object) 存放 Player 實體 (Youtube Player Object / Twitch Player Object)。
- `window.streamData`: (object) 存放串流與 UI 狀態 (volume, chatVisible, ids)。
- `window.container`: (HTMLElement) 主容器 `#container`。

#### External Modules (Function Calls)
`stream.js` 預期全域環境存在以下函式 (弱依賴，通常有 `typeof` 檢查)：
- **Chat**: `createChat`, `toggleChat`, `separateChat`, `destroyChat` (由 legacy chat system 提供)。
- **Layout**: `autoSelectLayout`, `setLayout`, `updateFixedLayoutFramework` (由 `layout.js` 提供)。
- **UI Control**: `updateStreamOrderList`, `checkAndAdjustControlPanel`, `applyMasterVolumeToStream`, `makeDraggableResizable`。
- **APIs**: `window.twitchApi.searchChannels`, `youtubeApiUtils.getChannelIdFromVideoId`。

### Side Effects Map
- **載入期 (Load Time)**:
  - 綁定 `window.addStream` (若無 React 版本則掛載自身，或掛載 `_legacyAddStream`)。
- **執行期 (Runtime)**:
  - **DOM Mutation**: 直接操作 `#container`，動態新增/移除 `.stream-box` 及其子元素。
  - **Global State Mutation**: 直接修改 `window.streamData`, `window.players`, `window.streamCount`。
  - **Event Listeners**: 為每個 Box 綁定 `click` (active class), `drag` 相關事件。
  - **Timers**: 使用 `setTimeout` 延遲觸發 Layout 更新、音量套用、廣告檢查。

---

## 2. Interaction Points (與 Chat 互動)
`stream.js` 是 Chat 的**發起者**與**容器管理者**。

| Action | Caller | Callee | Parameters | Context |
|---|---|---|---|---|
| **Create** | `addStream` | `createChat` | `(id, platform, channelId, videoId)` | 當 Stream Box DOM 建立完成後呼叫。 |
| **Toggle** | `click handler` | `toggleChat` | `(id)` | 點擊標題列聊天室按鈕時呼叫。 |
| **Separate** | `click handler` | `separateChat` | `(id)` | 點擊分離按鈕時呼叫。 |
| **Destroy** | `removeBox`, `clearAll` | `destroyChat` | `(id)` | 當 Stream 被移除時，必須清理 Chat 相關資源 (Watchdog, MutationObserver)。 |

**風險點**:
- **DOM 依賴**: Legacy Chat Code (`js/chat.js`) 高度依賴 `addStream` 產生的特定 DOM ID (`chat+id`, `chat-resizer+id`)。若 React 移轉改變了 ID 規則，Chat 將失效。
- **雙重初始化**: 若 React `StreamBox` 與 Legacy `addStream` 同時運作，可能導致同一個 ID 被重複 createChat。

---

## 3. Risk List & Migration Notes

### Critical Risks
1.  **Global State Conflict (雙重訊號源)**
    - 現況：`window.streamData` 是 source of truth。
    - 目標：React Store (Zustand/Context) 應為唯一 source of truth。
    - 風險：移轉期間，Legacy Code 仍會寫入 `window.streamData`，React 必須同步或攔截，否則 UI 狀態不一致。

2.  **DOM ID Collision**
    - `stream.js` 使用 `box + id` 命名。React 若產生相同 ID，會導致 Legacy 程式碼誤操作 React 的 DOM（例如 `removeBox` 硬刪 React 節點）。

3.  **Reload Loop**
    - `addStream` 內部有對 `window.addStream` 的自我檢查與轉發。若 React `useEffect` 再次呼叫 legacy `addStream` 且判斷邏輯有誤，可能造成無窮迴圈。

4.  **Timer Race Function**
    - `addStream` 內有大量 `setTimeout` (100ms, 300ms, 500ms, 1500ms, 2000ms) 用於處理 Layout 與 Volume。這些非同步操作極難與 React 生命週期對齊。

### Migration Strategy (PR B preview)
- **Adapter Mode**: 建立 `LegacyStreamAdapter` 實作 `StreamManagerContract`。
- **Hook Isolation**: 在 React 中使用 `useLegacyStream` hook 封裝所有 `window.*` 呼叫。
- **Event Bus**: 使用 CustomEvent 取代直接函式呼叫，解耦 `Layout` 與 `Stream` 的依賴。
