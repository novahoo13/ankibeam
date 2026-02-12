# AnkiBeam

[English](../README.md) | [简体中文](README_zh_CN.md) | 繁體中文 | [日本語](README_ja.md)

協助從字典查詢結果建立 Anki 卡片的 AI 助手。

## ✨ 功能特性

- **AI 智慧解析** — 輸入單字或短語，AI 自動產生釋義、例句、詞根等豐富內容
- **浮動助手** — 在任意網頁選取文字，一鍵呼叫 AI 解析並寫入 Anki
- **自訂範本** — 彈性設定輸出欄位，適配不同的 Anki 筆記類型
- **多 AI 供應商支援** —
  - Google Gemini（預設：`gemini-3-flash-preview`）
  - OpenAI GPT（預設：`gpt-5.2`）
  - Anthropic Claude（預設：`claude-opus-4-6`）
  - Groq（預設：`llama-3.3-70b-versatile`）
  - DeepSeek（預設：`deepseek-chat`）
  - Zhipu AI 智譜（預設：`glm-4`）
  - Alibaba Qwen 通義千問（預設：`qwen-max`）
  - Moonshot AI 月之暗面（預設：`kimi-k2.5`）
- **自動故障轉移** — 主供應商無法使用時，自動切換至備用供應商
- **多語言介面** — English、简体中文、繁體中文、日本語

## 📦 安裝

### 前置條件

1. **Anki 桌面版** — [下載 Anki](https://apps.ankiweb.net/)
2. **AnkiConnect 外掛** — 在 Anki 中安裝 AnkiConnect 外掛
   - 開啟 Anki → 工具 → 附加元件 → 取得附加元件
   - 輸入外掛代碼：`2055492159`
   - 重新啟動 Anki

### 安裝擴充功能

1. 下載或複製本專案程式碼
2. 開啟 Chrome，前往 `chrome://extensions/`
3. 啟用「開發人員模式」
4. 點選「載入未封裝項目」
5. 選擇專案資料夾

## 🚀 使用方法

### Popup 彈窗模式

1. 點選 Chrome 工具列中的 AnkiBeam 圖示
2. 在輸入框中輸入要查詢的單字或短語
3. 點選「解析」按鈕，AI 自動產生內容
4. 檢視並編輯解析結果
5. 點選「寫入 Anki」儲存卡片

### 浮動助手模式

1. 在任意網頁中選取一段文字
2. 點選彈出的浮動按鈕
3. 在浮動面板中檢視解析結果
4. 點選「寫入」儲存至 Anki

### 設定配置

安裝完成後，右鍵點選擴充功能圖示 →「選項」，進入設定頁面，可以配置：

- **AI 供應商** — 選擇供應商並填入 API Key
- **Anki 連線** — 設定預設牌組和筆記類型
- **範本管理** — 建立和管理自訂解析範本，設定欄位對應和自訂 Prompt
- **樣式設定** — 自訂寫入 Anki 的內容樣式（字體大小、文字對齊、行高）

> 📖 詳細設定說明請參閱[使用手冊](USER_MANUAL_zh_TW.md)。

## ❓ 常見問題

### 無法連線至 Anki？

1. 確認 Anki 桌面版正在執行
2. 確認 AnkiConnect 外掛已安裝（外掛代碼：`2055492159`）
3. 重新啟動 Anki 後重試

### AI 解析失敗？

1. 檢查 API Key 是否已正確設定
2. 確認 API Key 有足夠的配額
3. 嘗試切換至其他 AI 供應商

### 浮動助手沒有出現？

1. 檢查設定中是否已啟用「浮動助手」
2. 重新整理網頁後重試
3. 某些特殊頁面（如 Chrome 內建頁面）不支援內容指令碼

## 🔒 隱私說明

- 所有 API Key 皆以加密方式儲存於本機
- 查詢內容僅傳送至您所設定的 AI 供應商
- 擴充功能不會收集任何使用者資料
- 檢視完整[隱私政策](../PRIVACY.md)

## 🛠 開發相關

### 技術堆疊

- Chrome Extension Manifest V3
- ES6 Modules
- Tailwind CSS

### 本機開發

```bash
# 安裝相依套件
npm install

# 監測 CSS 變更
npm run css:watch

# 執行測試
npm test
```

## 📄 授權條款

[MIT License](../LICENSE)

## 💬 回饋與支援

如有問題或建議，請提交 [Issue](https://github.com/novahoo13/ankibeam/issues)。
