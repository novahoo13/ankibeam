# Anki Word Assistant

一款浏览器扩展，帮助你将选中的文本快速解析为卡片的正反面，并通过 AnkiConnect 写入 Anki。

## 功能特性

- AI 解析：支持 Google Gemini / OpenAI GPT / Anthropic Claude
- 自定义 Prompt：可配置输出 JSON 结构（front/back）
- Anki 集成：测试连接、选择默认牌组/模型、查看模型字段
- 样式设置：字体大小、对齐方式、行高预览

## 安装与加载扩展

1. 打包前先构建 CSS（见下方“构建与开发”）
2. 打开 Chrome 扩展管理页 `chrome://extensions`
3. 开启右上角“开发者模式”
4. 选择“加载已解压的扩展程序”，并选择本仓库目录

## 构建与开发

本项目使用 Tailwind CSS 按需构建，仅收集在 `popup/`、`options/`、`utils/` 中实际使用到的类。

准备环境：

- 需要 Node.js（含 npm）

首次安装依赖：

```
npm install
```

构建一次（生成 `css/tailwind.min.css`）：

```
npm run css:build
```

开发自动构建（监听文件变更）：

```
npm run dev
```

何时需要重建：

- 在 HTML/JS 中新增或删除 Tailwind 类名（含 `hover:`、`focus:`、`md:` 等变体）
- 修改 `tailwind.config.js`、`styles/input.css` 或新增页面/脚本影响到扫描路径
- 更新 `safelist`（如果后续添加）

以下变更不需要重建：

- 仅修改 `css/custom-classes.css`（业务样式）
- 仅修改内联样式或文本文案
- 仅在运行时切换“已存在”的类名

## 目录结构

```
anki-word-assistant/
├── manifest.json
├── popup/
│   ├── popup.html
│   └── popup.js
├── options/
│   ├── options.html
│   └── options.js
├── utils/
│   ├── ai-service.js
│   ├── ankiconnect.js
│   ├── storage.js
│   └── i18n.js
├── css/
│   ├── tailwind.min.css     # 按需构建产物（建议提交到仓库）
│   └── custom-classes.css   # 业务样式（非 Tailwind 工具类）
├── styles/
│   └── input.css            # Tailwind 构建入口
├── tailwind.config.js
├── package.json
└── .gitignore
```

## 常见问题

- 为什么不引入 CDN 的 Tailwind？
  - 浏览器扩展建议避免外部 CDN 依赖；本项目采用离线按需构建，体积小，合规且可控。
- 我修改了类名但样式不生效？
  - 请执行 `npm run css:build`（或在开发期使用 `npm run dev` 持续监听）。

## 许可证

本项目使用 MIT 许可证，详见 `LICENSE`。

**建议忽略项（基于当前目录）**

- `.claude/`（本地 AI 配置，非项目源）
- 备份文件：`**/*.backup`、`**/__backup_*`、`**/*.bak`、`**/*.old`
- CSS SourceMap（如开启）：`css/*.map`
- Windows 系统文件补充：`desktop.ini`
- 扩展打包产物（如使用 web-ext/手动打包）：`web-ext-artifacts/`、`*.zip`
- 可选日志目录：`logs/`、`*.log`（npm/yarn/pnpm 调试日志已单独忽略）

说明：上述条目仅为基于当前仓库结构的补充建议，不会覆盖现有 `.gitignore` 中“保留已构建 CSS 以便打包”的策略。如需我直接写入 `.gitignore`，请确认是否需要一并更新。
