# Changelog

本專案的版本紀錄依照 [Keep a Changelog](https://keepachangelog.com/zh-TW/1.0.0/) 格式撰寫。

## [Unreleased]

### 修正

- Legend 中的故事線先前只能新增節點與刪除，缺少編輯入口；新增「編輯故事線」按鈕，可修改名稱、位置（上/下、左/右）、排列順序與代表色
- 修正 `index.html` 引用的 tabler-icons CDN 網址路徑錯誤（誤加了 `iconfont/` 這一層目錄），導致全站圖示字型從未載入成功，不只是編輯按鈕，所有按鈕圖示（新增、刪除等）實際上都是空的，只是尺寸夠大不容易察覺。正確路徑不含該層目錄。（前一版 commit 曾誤判為 `ti-pencil` 這個 class 不存在而改用 `ti-edit`，事後確認 `ti-pencil` 本身是合法的圖示 class，真正原因是 CDN 網址本身有誤。）

## [0.1.0] - 2026-07-10

### 新增

- 專案骨架：Vite + React + TypeScript + Zustand + Tailwind CSS v4
- 主時間軸：水平／垂直方向切換，時間範圍依節點資料自動計算
- 故事線：可建立多條故事線，指定上方/下方（垂直模式對應左/右），同側依 order 堆疊，lane 排版避免節點重疊
- 節點：支援單一時間點與時間範圍、說明文字、圖片、連結（YouTube oEmbed、Wikipedia 摘要預覽）、tag
- 全域 tag 篩選（符合任一／符合全部），未命中節點淡化而非直接隱藏
- 縮放（滾輪）與拖曳平移
- 網站內建表單：新增故事線、新增節點
- 資料持久化：匯出／匯入 JSON（純前端靜態網站方案）
- URL 參數同步：`tags`、`tagMode`、`range`、`orientation`、`focus`，可分享連結還原檢視
- HistoricalDate 曆法工具：支援西元前年份與粗粒度日期（年/年月）的排序與格式化
- 範例資料：三國、羅馬、托勒密王朝

### 已知限制

- 尚未實作 File System Access API 直接寫回本機檔案，僅提供匯出下載
- Generic 連結（非 YouTube/Wiki）因 CORS 限制，暫不支援自動 Open Graph 預覽
- 節點密集重疊時僅以 lane 分層顯示，尚未實作進一步的群集/合併呈現
