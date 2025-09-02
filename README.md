# Anki Word Assistant

这是一个Chrome浏览器插件，旨在帮助用户将在线词典的查询结果快速、方便地制作为Anki卡片。

## 功能
- **AI 解析**: 利用 AI (当前为 Gemini) 将非结构化的文本解析为"单词"和"释义"两部分。
- **Anki 集成**: 通过 AnkiConnect 插件，一键将解析结果创建为 Anki 卡片。
- **高度可配置**: 支持自定义 AI 配置和 Prompt。

## 开发

本项目遵循 `anki-word-assistanthrome浏览器插件开发项目文档.md` 中的规划进行开发。

### 环境准备
- Node.js
- 一个支持 Manifest V3 的现代浏览器 (如 Chrome)
- Anki 桌面版
- AnkiConnect 插件 (安装在 Anki 中)

### 启动
1. 在 Chrome/Edge 等浏览器的扩展管理页面开启“开发者模式”。
2. 点击“加载已解压的扩展程序”。
3. 选择本项目的根目录。
