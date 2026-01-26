# AnkiBeam

一款 AI 驱动的 Chrome 扩展程序，帮助用户快速创建 Anki 单词卡片。支持多种 AI 服务商，可自定义解析模板，让单词学习更高效。

## 功能特性

### 核心功能

- **AI 智能解析**：输入单词或短语，AI 自动生成释义、例句、词根等丰富内容
- **浮动助手**：在任意网页选中文本，一键调用 AI 解析并写入 Anki
- **自定义模板**：灵活配置输出字段，适配不同的 Anki 卡片模板
- **多 AI 服务商支持**：
  - Google Gemini
  - OpenAI GPT
  - Anthropic Claude
- **自动故障转移**：主服务商不可用时，自动切换到备用服务商

### 使用方式

1. **Popup 弹窗模式**：点击扩展图标，输入文本进行解析
2. **浮动面板模式**：在网页中选中文本，点击浮动按钮快速解析

### 多语言支持

- English (en)
- 简体中文 (zh_CN)
- 繁體中文 (zh_TW)
- 日本語 (ja)

## 安装要求

### 前置条件

1. **Anki 桌面版**：[下载 Anki](https://apps.ankiweb.net/)
2. **AnkiConnect 插件**：在 Anki 中安装 AnkiConnect 插件
   - 打开 Anki → 工具 → 插件 → 获取插件
   - 输入插件代码：`2055492159`
   - 重启 Anki

### 安装扩展

1. 下载本项目代码
2. 打开 Chrome，访问 `chrome://extensions/`
3. 开启「开发者模式」
4. 点击「加载已解压的扩展程序」
5. 选择项目文件夹

## 配置指南

安装完成后，右键点击扩展图标 → 选项，进入设置页面。

### 1. AI 服务配置

选择一个或多个 AI 服务商并配置 API Key：

#### Google Gemini（推荐）

1. 访问 [Google AI Studio](https://makersuite.google.com/app/apikey)
2. 创建 API Key
3. 在扩展设置中填入 API Key
4. 默认模型：`gemini-2.5-flash`

#### OpenAI GPT

1. 访问 [OpenAI Platform](https://platform.openai.com/api-keys)
2. 创建 API Key
3. 在扩展设置中填入 API Key
4. 默认模型：`gpt-5.2`

#### Anthropic Claude

1. 访问 [Anthropic Console](https://console.anthropic.com/)
2. 创建 API Key
3. 在扩展设置中填入 API Key
4. 默认模型：`claude-sonnet-4-5`

> **提示**：可配置多个服务商作为备用，当主服务商请求失败时会自动切换。

### 2. Anki 连接配置

1. 确保 Anki 桌面版正在运行
2. 确保 AnkiConnect 插件已安装并启用
3. 在设置页面点击「测试连接」验证配置

**默认连接地址**：`http://127.0.0.1:8765`

### 3. 解析模板配置

模板定义了 AI 解析的输出字段和 Anki 卡片的映射关系。

#### 创建模板

1. 进入「模板管理」标签页
2. 点击「新建模板」
3. 配置以下内容：
   - **模板名称**：便于识别的名称
   - **目标牌组**：Anki 中的目标牌组
   - **笔记类型**：Anki 中的笔记模板
   - **字段映射**：配置需要填充的字段

#### 字段配置示例

对于一个典型的单词卡片模板，可以配置如下字段：

| 字段名    | 说明      | 示例输出                          |
| --------- | --------- | --------------------------------- |
| Word      | 单词本身  | vocabulary                        |
| Reading   | 音标/发音 | /vəˈkæbjəleri/                    |
| Meaning   | 释义      | 词汇，词汇表                      |
| Example   | 例句      | Build your vocabulary by reading. |
| Etymology | 词源      | 来自拉丁语 vocabulum              |

#### 自定义 Prompt

可以为每个模板配置自定义的 AI 提示词，控制输出内容和格式。

### 4. 样式配置（可选）

自定义写入 Anki 的内容样式：

- **字体大小**：默认 14px
- **文本对齐**：左对齐 / 居中 / 右对齐
- **行高**：默认 1.4

### 5. 界面配置

- **启用浮动助手**：开启/关闭网页内的浮动助手功能
- **界面语言**：选择扩展程序的显示语言

## 使用方法

### 方式一：Popup 弹窗

1. 点击 Chrome 工具栏中的扩展图标
2. 在输入框中输入要查询的单词或短语
3. 点击「解析」按钮
4. 查看并编辑 AI 生成的内容
5. 点击「写入 Anki」保存卡片

### 方式二：浮动助手

1. 在任意网页中选中一段文本
2. 点击弹出的浮动按钮
3. 在浮动面板中查看解析结果
4. 点击「写入」保存到 Anki

## 项目结构

```
ankibeam/
├── background/          # 后台服务脚本
├── content/             # 内容脚本（浮动助手）
├── popup/               # 弹窗界面
├── options/             # 设置页面
├── services/            # 业务服务层
│   ├── anki-service.js      # Anki 写入服务
│   └── config-service.js    # 配置管理服务
├── utils/               # 工具模块
│   ├── ai-service.js        # AI 服务调用
│   ├── providers.config.js  # AI 服务商配置
│   ├── storage.js           # 存储管理
│   ├── template-store.js    # 模板管理
│   └── ...
├── _locales/            # 多语言资源
└── manifest.json        # 扩展清单
```

## 常见问题

### Q: 无法连接到 Anki？

1. 确保 Anki 桌面版正在运行
2. 确保 AnkiConnect 插件已安装（插件代码：2055492159）
3. 重启 Anki 后重试

### Q: AI 解析失败？

1. 检查 API Key 是否正确配置
2. 确认 API Key 有足够的配额
3. 尝试切换到其他 AI 服务商

### Q: 浮动助手没有出现？

1. 检查设置中是否启用了「浮动助手」
2. 刷新网页后重试
3. 某些特殊页面（如 Chrome 内置页面）不支持内容脚本

## 隐私说明

- 所有 API Key 使用加密存储在本地
- 查询内容仅发送到您配置的 AI 服务商
- 扩展不收集任何用户数据

## 开发相关

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

## 许可证

MIT License

## 反馈与支持

如有问题或建议，请提交 [Issue](https://github.com/novahoo13/ankibeam/issues)。
