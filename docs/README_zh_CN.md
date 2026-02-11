# AnkiBeam

[English](../README.md) | 简体中文 | [繁體中文](README_zh_TW.md) | [日本語](README_ja.md)

从词典查询结果生成 Anki 卡片的 AI 助手。

## ✨ 功能特性

- **AI 智能解析** — 输入单词或短语，AI 自动生成释义、例句、词根等丰富内容
- **浮动助手** — 在任意网页选中文本，一键调用 AI 解析并写入 Anki
- **自定义模板** — 灵活配置输出字段，适配不同的 Anki 笔记类型
- **多 AI 服务商支持** —
  - Google Gemini（默认：`gemini-2.5-flash`）
  - OpenAI GPT（默认：`gpt-5.2`）
  - Anthropic Claude（默认：`claude-sonnet-4-5`）
- **自动故障转移** — 主服务商不可用时，自动切换到备用服务商
- **多语言界面** — English、简体中文、繁體中文、日本語

## 📦 安装

### 前置条件

1. **Anki 桌面版** — [下载 Anki](https://apps.ankiweb.net/)
2. **AnkiConnect 插件** — 在 Anki 中安装 AnkiConnect 插件
   - 打开 Anki → 工具 → 插件 → 获取插件
   - 输入插件代码：`2055492159`
   - 重启 Anki

### 安装扩展

1. 下载或克隆本项目代码
2. 打开 Chrome，访问 `chrome://extensions/`
3. 开启「开发者模式」
4. 点击「加载已解压的扩展程序」
5. 选择项目文件夹

## 🚀 使用方法

### Popup 弹窗模式

1. 点击 Chrome 工具栏中的 AnkiBeam 图标
2. 在输入框中输入要查询的单词或短语
3. 点击「解析」按钮，AI 自动生成内容
4. 查看并编辑解析结果
5. 点击「写入 Anki」保存卡片

### 浮动助手模式

1. 在任意网页中选中一段文本
2. 点击弹出的浮动按钮
3. 在浮动面板中查看解析结果
4. 点击「写入」保存到 Anki

### 配置设置

安装完成后，右键点击扩展图标 →「选项」，进入设置页面，可以配置：

- **AI 服务商** — 选择提供商并填入 API Key
- **Anki 连接** — 设置默认牌组和笔记类型
- **模板管理** — 创建和管理自定义解析模板，配置字段映射和自定义 Prompt
- **样式设置** — 自定义写入 Anki 的内容样式（字体大小、文本对齐、行高）

> 📖 详细配置说明请参阅[用户手册](USER_MANUAL.md)。

## ❓ 常见问题

### 无法连接到 Anki？

1. 确保 Anki 桌面版正在运行
2. 确保 AnkiConnect 插件已安装（插件代码：`2055492159`）
3. 重启 Anki 后重试

### AI 解析失败？

1. 检查 API Key 是否正确配置
2. 确认 API Key 有足够的配额
3. 尝试切换到其他 AI 服务商

### 浮动助手没有出现？

1. 检查设置中是否启用了「浮动助手」
2. 刷新网页后重试
3. 某些特殊页面（如 Chrome 内置页面）不支持内容脚本

## 🔒 隐私说明

- 所有 API Key 使用加密存储在本地
- 查询内容仅发送到您配置的 AI 服务商
- 扩展不收集任何用户数据
- 查看完整[隐私政策](../PRIVACY.md)

## 🛠 开发相关

### 技术栈

- Chrome Extension Manifest V3
- ES6 Modules
- Tailwind CSS

### 本地开发

```bash
# 安装依赖
npm install

# 监听 CSS 变更
npm run css:watch

# 运行测试
npm test
```

## 📄 许可证

[MIT License](../LICENSE)

## 💬 反馈与支持

如有问题或建议，请提交 [Issue](https://github.com/novahoo13/ankibeam/issues)。
