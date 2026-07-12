# 歷史時間軸

多故事線的互動式歷史時間軸，可並列比較不同文明／主題在同一時間刻度下的發展脈絡。

---

## 功能

- **多故事線並列**：建立多條故事線（如「東方文明」「西方文明」），分別置於時間軸上方／下方，共用同一條時間刻度
- **節點類型**：支援單一時間點（`time`）與時間範圍（`timeRange`），節點可附上說明、圖片、標籤與外部連結
- **水平／垂直方向切換**：可即時切換時間軸走向（水平 ↔ 垂直）
- **縮放與平移**：滾輪縮放、拖曳平移，並設有合理的縮放／平移上下限，避免捲出資料範圍
- **智慧版面**：像素級碰撞偵測，文字擁擠時以垂直錯開 + 引線方式迴避；只有 marker 真正重疊才合併為 `+N` 收合徽章，點擊自動縮放展開；相同時間的節點改以數量 superscript 標示，點擊後同時展開所有詳情卡片
- **tag 篩選**：全域 tag 過濾（符合任一／全部），未命中節點淡化而非直接隱藏
- **節點詳情卡片**：顯示完整說明、圖片、tag（可點擊快速篩選）、YouTube / Wikipedia 預覽連結
- **編輯功能**：新增／編輯故事線與節點，支援修改名稱、時間、說明、標籤與連結
- **資料持久化**：匯出 / 匯入 JSON（純前端，無需後端）
- **URL 狀態同步**：tag、縮放範圍、方向、focus 節點均寫入 URL 參數，可直接分享連結重現檢視狀態

---

## 技術棧

| 層級 | 工具 |
|------|------|
| 框架 | React 19 + TypeScript |
| 建置 | Vite |
| 狀態管理 | Zustand |
| 樣式 | Tailwind CSS v4 |
| Linter | Oxlint |

---

## 快速開始

```bash
# 安裝依賴
npm install

# 啟動開發伺服器
npm run dev

# 型別檢查 + 打包
npm run build

# 預覽打包結果
npm run preview
```

---

## 資料格式

時間軸資料儲存於 `src/data/timeline-data.json`，頂層結構如下：

```jsonc
{
  "storylines": [
    {
      "id": "east",
      "name": "東方文明",
      "color": "#e07b39",
      "position": "above",   // "above" | "below"
      "order": 1,
      "nodes": [
        // 單一時間點
        { "id": "qin-unification", "title": "秦滅六國", "time": "-0220", ... },
        // 時間範圍
        { "id": "han-dynasty", "title": "漢朝", "timeRange": { "start": "-0205", "end": "0220" }, ... }
      ]
    }
  ]
}
```

時間格式採 `YYYY`、`YYYY-MM` 或 `YYYY-MM-DD`，西元前年份以負號表示（天文紀年：西元前 1 年 = `-0000`，西元前 221 年 = `-0220`）。

---

## 專案結構

```
src/
├── components/
│   ├── Timeline/       主時間軸 SVG 渲染
│   ├── Toolbar/        工具列（方向切換、tag 篩選、匯出入）
│   ├── Editor/         故事線 Legend 與節點編輯器
│   ├── Node/           節點詳情卡片
│   └── LinkPreview/    YouTube / Wikipedia 連結預覽
├── lib/
│   ├── layout/         版面演算法（車道分配、標籤錯開、marker cluster）
│   ├── date/           歷史日期工具（西元前支援、格式化）
│   ├── filter/         tag 過濾邏輯
│   └── urlSync/        URL 參數同步
├── store/              Zustand 全域狀態
├── types/              TypeScript 型別定義
└── data/               預設示範資料
```

---

## 授權

[MIT](LICENSE) © 2026 Ray

