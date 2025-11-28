# MultiStream Hub

一個免費的多平台直播串流觀看工具，支援同時觀看多個 Twitch 和 YouTube 直播，提供多種布局模式、聊天室整合、音量控制和收藏功能。

🌐 **線上版本**: [https://mutli-stream.pages.dev/](https://mutli-stream.pages.dev/)

## ✨ 主要功能

### 🎥 多平台串流支援
- **Twitch** 直播串流嵌入
- **YouTube** 直播串流嵌入
- 支援同時觀看多個串流

### 🎨 布局模式
- **基本布局**：
  - 單一畫面
  - 左右分割
  - 上下分割
  - 四宮格
  - 上大下三
  - 2×3 網格
  - 3×3 網格
- **側邊聊天布局**：
  - **雙欄聊天布局**：左側視頻區域（可調整布局）+ 右側固定兩個聊天室（左右排列）
  - **四格聊天布局**：左側視頻區域（可調整布局）+ 右側固定四個聊天室（2×2 網格排列）
- 自動布局切換（根據串流數量）

### 💬 聊天室整合
- **Twitch** 聊天室嵌入
- **YouTube** 聊天室嵌入（使用 `embed_domain` 參數）
- 聊天室顯示/隱藏控制
- 一鍵顯示所有聊天室

### 🔊 音量控制
- 獨立音量控制（每個串流）
- 總音量控制（統一調整所有串流）
- 全部靜音功能

### ⭐ 收藏系統
- 收藏串流功能
- 分類管理（自訂分類）
- 一鍵載入收藏串流
- 一鍵載入分類內所有串流
- 本地文件備份（使用 File System Access API）
- 自動載入備份數據

### 🎛️ 控制面板
- 固定側邊欄設計
- 可收起/展開
- 滑鼠懸停自動展開
- 串流順序管理（拖曳排序）
- 版本紀錄查看

### 🔒 安全性
- XSS 防護（HTML 轉義）
- 安全的 JSON 解析
- URL 和 ID 驗證
- Content Security Policy (CSP)
- 輸入驗證

### 📊 其他功能
- SEO 優化（Meta 標籤、結構化數據）
- Google Analytics 整合
- 響應式設計
- 拖曳調整串流視窗大小
- 意見回饋功能

## 🚀 快速開始

### 本地開發

1. **Clone 專案**
   ```bash
   git clone https://github.com/Hsiung-Shao/multi-stream.git
   cd multi-stream
   ```

2. **開啟專案**
   - 使用本地伺服器開啟（推薦）：
     ```bash
     # 使用 Python
     python -m http.server 8000
     
     # 或使用 Node.js
     npx http-server
     ```
   - 然後在瀏覽器中訪問 `http://localhost:8000`
   - ⚠️ **注意**：不建議直接開啟 `index.html` 檔案（`file://` 協議），因為 Twitch 和 YouTube 的嵌入功能需要 HTTP/HTTPS 協議

### 部署

#### Cloudflare Pages（推薦）

1. 將專案推送到 GitHub
2. 在 Cloudflare Pages 中連接 GitHub 倉庫
3. 選擇專案目錄
4. 構建命令留空（純靜態網站）
5. 部署！

#### 其他平台

- **Vercel**: 連接 GitHub 倉庫，自動部署
- **Netlify**: 拖放 `index.html` 或連接 Git 倉庫
- **GitHub Pages**: 在倉庫設定中啟用 Pages

## 📁 專案結構

```
multi-stream/
├── index.html          # 主頁面
├── privacy.html        # 隱私權政策
├── styles.css          # 樣式文件
├── robots.txt          # 搜尋引擎爬蟲規則
├── sitemap.xml         # 網站地圖
├── ads.txt             # 廣告驗證文件
├── icon.png            # 網站圖標
├── js/
│   ├── main.js         # 主程式入口
│   ├── stream.js       # 串流管理
│   ├── chat.js         # 聊天室功能
│   ├── volume.js       # 音量控制
│   ├── layout.js       # 布局管理
│   ├── control-panel.js # 控制面板
│   ├── settings.js     # 設定和收藏管理
│   ├── promotion.js    # 廣告管理
│   ├── drag-resize.js  # 拖曳調整
│   ├── security.js     # 安全工具函數
│   └── utils.js        # 工具函數
└── README.md           # 本文件
```

## 🛠️ 技術棧

- **前端**: 純 HTML/CSS/JavaScript（無需構建工具）
- **串流 API**:
  - Twitch Embed API
  - YouTube IFrame API
- **存儲**: 
  - localStorage（設定和收藏）
  - File System Access API（本地文件備份）
  - IndexedDB（文件句柄持久化）
- **部署**: Cloudflare Pages

## 📝 使用說明

### 添加串流

1. 在控制面板的輸入框中貼上 Twitch 或 YouTube 直播網址
2. 點擊「加入畫面」按鈕
3. 串流會自動載入並顯示

### 調整布局

- **基本布局**：點擊控制面板中的布局預覽按鈕切換布局
- **側邊聊天布局（雙欄版/四格版）**：
  - 點擊「雙欄聊天布局」或「四格聊天布局」按鈕啟用側邊聊天布局
  - 左側視頻區域可以使用布局按鈕（1-6、9）調整顯示方式
  - 右側聊天室區域固定，不會隨視頻布局改變
  - 每個聊天室面板都有選擇器，可以選擇要顯示的串流聊天室
  - 雙欄聊天布局：右側顯示兩個聊天室（左右排列）
  - 四格聊天布局：右側顯示四個聊天室（2×2 網格排列）
- 系統會根據串流數量自動選擇最適合的布局

### 管理收藏

1. 點擊「管理收藏」按鈕
2. 在彈出視窗中可以：
   - 添加收藏串流
   - 創建分類
   - 編輯或刪除收藏
   - 一鍵載入收藏串流

### 音量控制

- 使用總音量滑桿調整所有串流的音量
- 在串流順序列表中調整單個串流的音量
- 點擊「全部靜音」快速靜音/取消靜音

### 聊天室

- **基本模式**：
  - 點擊串流視窗中的聊天室按鈕顯示/隱藏聊天室
  - 使用「顯示所有聊天室」按鈕一次性顯示所有聊天室
- **側邊聊天布局模式（雙欄版/四格版）**：
  - 右側聊天室區域固定顯示，不會隨視頻布局改變
  - 每個聊天室面板都有下拉選擇器，可以選擇要顯示的串流聊天室
  - 無需調整串流順序，直接從選擇器中選擇即可
  - 支援 Twitch 和 YouTube 聊天室嵌入

## 🔧 配置

### Google AdSense

如需啟用廣告功能，請在 `js/promotion.js` 中修改配置：

```javascript
const defaultConfig = {
  enabled: true,  // 啟用廣告
  showControlButtons: true,
  // ...
};
```

### Google Analytics

Google Analytics 追蹤 ID 已配置在 `index.html` 中（`G-6M97WLJG2Z`）。

## 📄 授權

© 2025 Hsiung-Shao. All rights reserved.

本工具完全免費開放給所有人使用，歡迎分享連結給朋友！

只要保留本專案連結即可，其餘隨意改、隨意用，不需要特別告知我。

## 🤝 貢獻

歡迎提交 Issue 和 Pull Request！

## 📞 意見回饋

如有任何問題或建議，請透過[意見回饋表單](https://forms.gle/AjG922YrXFbyAdBa6)聯繫。

## 📚 版本紀錄

### v1.3.0 (2025-01-XX)
- 新增側邊聊天布局功能（雙欄版和四格版）
- 雙欄聊天布局：左側視頻區域可自由調整布局，右側固定顯示兩個聊天室（左右排列）
- 四格聊天布局：左側視頻區域可自由調整布局，右側固定顯示四個聊天室（2×2 網格排列）
- 聊天室選擇器功能，無需調整串流順序即可快速切換要顯示的聊天室
- 優化布局切換流暢度，一次點擊即可完成切換
- 改進選擇器響應速度，減少延遲

### v1.2.0 (2025-11-28)
- 新增本地文件備份功能
- 改進收藏管理界面
- 新增設定標籤頁
- 優化安全性（XSS 防護）
- 改進 YouTube 聊天室嵌入支援
- 新增版本紀錄功能
- 新增滑鼠懸停自動展開控制面板
- 更新著作權資訊

### v1.1.0 (2025-11-27)
- 新增分類管理功能
- 改進控制面板 UI
- 優化布局自動切換
- 修復多個已知問題

### v1.0.0 (2025-11-26)
- 初始版本發布
- 支援 Twitch 和 YouTube 直播串流
- 多種布局模式
- 聊天室整合
- 音量控制功能
- 收藏功能

## 🔗 相關連結

- [線上版本](https://mutli-stream.pages.dev/)
- [GitHub 倉庫](https://github.com/Hsiung-Shao/multi-stream)
- [隱私權政策](/privacy.html)

---

Made with ❤️ by Hsiung-Shao
