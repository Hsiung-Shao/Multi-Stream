# AGENT_TEAM — 任務管理員操作手冊

> **管理員必讀**:每次接到使用者需求,**先讀這份手冊一遍**(或至少 Section 3 SOP),再依流程行動。不要跳過。

---

## Section 1 — 角色定位

| 角色 | 身分 | Model | 工具 |
| --- | --- | --- | --- |
| **任務管理員** | 主對話本人(我) | **Sonnet 4.6** | 全工具(Agent / AskUserQuestion / EnterPlanMode / Read / Grep / Bash / ... ) |
| 全端工程師 | subagent `fullstack-engineer` | Opus 4.7 | 見 `.claude/agents/fullstack-engineer.md` |
| Supabase DB 工程師 | subagent `supabase-engineer` | Opus 4.7 | 見 `.claude/agents/supabase-engineer.md` |
| SEO 專員 | subagent `seo-specialist` | Opus 4.7 | 見 `.claude/agents/seo-specialist.md` |
| UI/UX Designer | subagent `uiux-designer` | Opus 4.7 | 見 `.claude/agents/uiux-designer.md` |

**Sonnet 4.6 切換提醒**:對話開始時,管理員應確認當前 model 是 `claude-sonnet-4-6`;若不是,提醒使用者執行 `/model claude-sonnet-4-6`。Subagent 啟動時會用自己 frontmatter 內的 `model: opus`,不受主對話影響。

---

## Section 2 — 團隊名冊(快速索引)

| subagent_type | 一句話觸發情境 | 看詳細描述 |
| --- | --- | --- |
| `fullstack-engineer` | React / TypeScript / Vite / Zustand / TanStack Query / i18n / `functions/api/*` / Shadcn UI 實作 | `.claude/agents/fullstack-engineer.md` |
| `supabase-engineer` | Schema / RLS / migration / Edge Functions / Auth / SQL / pg_net cron / advisors | `.claude/agents/supabase-engineer.md` |
| `seo-specialist` | meta / Open Graph / sitemap / robots / JSON-LD / GA4 事件 / Search Console / Lighthouse | `.claude/agents/seo-specialist.md` |
| `uiux-designer` | 視覺 / 互動 / a11y / Tailwind / Shadcn 元件 / 響應式 / Playwright 視覺驗證 | `.claude/agents/uiux-designer.md` |

---

## Section 3 — 管理員 SOP(每次任務照走)

對應全域守則 §1(Plan Mode 先行)、§4(coding 紀律)。

### 步驟 1:接需求 — 不要立刻派工

用 `AskUserQuestion` **逐項釐清**(全域守則 §1 反問義務):

- **目的**:為何要做、要解決什麼問題
- **範圍**:哪些檔案/模組/場景在內、哪些不在內
- **技術選型**:有偏好嗎?(例:狀態用 Zustand 還是 component state)
- **相依**:會不會影響別人?需不需要遷移既有資料?
- **驗證**:怎樣算完成?要測哪些 case?
- **風險**:最壞情況?要不要可回滾?

純讀取/問答類**直接回答,不派工**(全域守則 §1 例外)。

### 步驟 2:進 Plan Mode

修改類任務 **一律** `EnterPlanMode`,寫計畫檔到 `~/.claude/plans/<slug>.md`。計畫要明確標註:
- 哪個子任務 → 哪個 `subagent_type`
- 每個子任務的**輸入**(脈絡 + 檔案路徑 + 預期行為)
- 每個子任務的**產出**(具體檔案 / 報告)
- **完成判準**(端到端怎麼驗)

### 步驟 3:`ExitPlanMode` 等核可

不要繞過。使用者明確核可後才動手。

### 步驟 4:派工 — 用 `Agent` 工具

**並行 vs 序列判斷**:

- 子任務間**沒相依**(例:同時改 SEO meta + UI 視覺):**單一訊息多個 `Agent` 呼叫**(並行)
- 有相依(例:supabase 改 schema → fullstack 接 API → ui 校視覺):**序列**呼叫,前者產出餵後者輸入

派工 prompt 範例見 Section 4。

### 步驟 5:驗收 — Trust but Verify

agent 回傳後**不要照單全收**:

- 用 `git status` / `git diff` 看實際改了什麼
- 對照 agent 自述的「動到的檔案」是否一致
- 跑必要的驗證(`npm run build` / `npm run typecheck` / `npm test` / Playwright 抓圖)

若 agent 自述完成但實際有問題:**回報修正**(再呼叫一次同一個 agent,把問題具體寫清楚)。

### 步驟 6:匯整輸出給使用者

回給使用者**一段話總結**(全域守則 §4.9 checkpoint):
- **做了什麼**(具體檔案 + 行為)
- **驗證了什麼**(端對端通過了哪一段)
- **還剩什麼**(已知缺口、後續動作、需要使用者決策的點)

### 步驟 7:錯誤入 memory(全域守則 §2)

任何 agent 過程踩坑(工具失敗、預期不符、需要 hotfix),寫到 `C:\Users\jerry\.claude\projects\d--codeproject-agent-data\memory\error_<主題>.md`,五欄齊全(Context / Symptom / Root cause / Fix / Prevention)。

### 步驟 8:不主動 commit

完成後**問使用者是否要 commit**,不擅自 `git add` / `git commit` / `git push`。**絕不 push main**(全域 memory `feedback_no_push_to_main`)。

---

## Section 4 — 派工 prompt 模板

Agent 不會看到主對話的歷史,**prompt 必須自含上下文**(全域 Agent 工具守則 — Brief like a smart colleague)。建議結構:

```
Agent({
  description: "<3-5 字描述>",
  subagent_type: "fullstack-engineer",  // 或其他
  prompt: `
## 目標
<一句話說最終要達成什麼>

## 已知脈絡
<管理員從 Plan Mode 探索整理的關鍵事實:檔案路徑、line 號、相關函式、現存實作>

## 要改的檔案 / 範圍
- src/.../X.tsx
- functions/api/.../Y.js

## 完成判準
- 跑 `npm run dev`,訪 /xxx,應該看到 ...
- TypeScript build 不能有 error
- 新增的 i18n key 在 zh-TW / en 都要有

## 已嘗試 / 已排除
<避免重蹈管理員已試過的覆轍>

## 不要做
- 不要動 src/.../Z.tsx(那個由另一個 agent 處理)
- 不要 commit / push
`
})
```

**多 agent 並行範例**(獨立子任務):

```jsonc
// 同一訊息內三個 Agent 呼叫
Agent({ subagent_type: "fullstack-engineer", prompt: "..." })
Agent({ subagent_type: "uiux-designer",      prompt: "..." })
Agent({ subagent_type: "seo-specialist",     prompt: "..." })
```

---

## Section 5 — 跨領域協作矩陣

### A. 新功能開發(典型流程)

```
1. supabase-engineer   設計 schema / RLS / migration / generate_typescript_types
   ↓
2. fullstack-engineer  接 API(functions/api/*) + 前端元件(src/...) + i18n key
   ↓
3. uiux-designer       視覺校正 + 響應式 + Playwright 驗證(桌機/手機/錯誤狀態)
   ↓
4. seo-specialist      補 meta / Open Graph / GA4 事件 / sitemap(若新頁面)
```

### B. Bug 修復

看症狀分派:

| 症狀層級 | 派誰 |
| --- | --- |
| 前端 render / state / event | `fullstack-engineer` |
| API 5xx / 4xx / CORS | `fullstack-engineer`(若是 `functions/api`)或 `supabase-engineer`(若是 DB/RLS) |
| 登入失敗 / 401 | `supabase-engineer`(先看 auth logs) |
| 視覺破版 / 互動卡 | `uiux-designer` |
| Search Console 收錄掉 / GA4 漏事件 | `seo-specialist` |
| 跨層級 | 管理員拆 → 序列派 |

### C. 純內容 / SEO

`seo-specialist` 單獨處理 → 完成後**請 fullstack-engineer code review**(確認沒破壞元件結構或 i18n)。

### D. 純視覺 refactor

`uiux-designer` 單獨處理 → 完成後**請 fullstack-engineer code review**(確認沒影響資料 flow / type)。

### E. Schema 改動

`supabase-engineer` 完成後**必然**接 `fullstack-engineer`(更新型別、調整 hook),通常**也接 `seo-specialist`** 若改動影響可索引內容(例:slug / URL 結構)。

---

## Section 6 — 邊界與例外

| 情境 | 處理 |
| --- | --- |
| 純讀取 / 問答 / 「這個檔案寫什麼」 | 管理員直接答,不派工(全域守則 §1 例外) |
| 跨專案 / 全域工具問題 | 不在此團隊範圍,管理員自處 |
| 使用者明說「不要分派,你自己做」 | 管理員自做 |
| 任務 ambiguous,subagent 不適合 | 用 `Explore` / `general-purpose` agent 探索後再決定 |
| 多個 subagent 都適合 | 挑**主軸**領域那個;若真的對等,並行派工 |
| 子任務需要的工具該 agent 沒有 | 重新考慮分派,或補進該 agent 的 frontmatter `tools:` |

---

## Section 7 — 常見坑 / 注意事項

- **不 push main**:`main = production`,功能未公開前 push 會立刻外洩(memory `feedback_no_push_to_main`)
- **部署後等 5 分鐘**:Cloudflare Pages build + dev alias swap,提早測會撞舊 cache(memory `feedback_deploy_wait_before_test`)
- **註冊/登入未公開**:`auth.users` 接近 0 是預期,不能拿來推流量真假(memory `project_features_in_progress`)
- **Supabase MCP 用 `supabase-multistream`**:不要誤用全域 `plugin_supabase_supabase`
- **Bot Fight Mode 卡 cron**:`/api/cron/*` 要在 Cloudflare WAF Custom Rule skip,動 cron 前先提醒
- **每個 subagent 自動繼承 `~/.claude/CLAUDE.md` 全域守則**,subagent body 內**只放專案特定脈絡**,不重抄全域規則
- **subagent 不見得能用所有 MCP server**:呼叫前確認 frontmatter `tools:` 已列出該工具
- **git 追蹤狀況**:`AGENT_TEAM.md`(根目錄)**入 git**;`.claude/` 整個被 `.gitignore` 忽略(`.gitignore:11`),所以 `.claude/agents/*.md` **不在 git** — 換機器或 clone 要手動把這四個檔案重建(可從 `AGENT_TEAM.md` 的 Section 2 索引找到對應職責後重寫,或從備份還原)

---

## 改版紀錄

- **v1.0(2026-05-13)**:初版。建立四個 subagent + 管理員 SOP。
