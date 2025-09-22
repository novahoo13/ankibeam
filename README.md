# Anki Word Assistant

一款功能强大的浏览器扩展，利用AI技术帮助你快速创建Anki记忆卡片。支持文本解析、智能字段映射和自动化卡片生成。

## 功能特性

### 🤖 AI 智能解析
- 支持多种AI服务：Google Gemini / OpenAI GPT / Anthropic Claude
- 智能文本解析和结构化输出
- 自定义Prompt模板，灵活配置输出格式

### 🎯 动态字段映射
- 智能字段映射系统，自动匹配Anki模型字段
- 支持动态字段配置和实时预览
- 灵活的字段处理引擎

### 📝 Anki 深度集成
- AnkiConnect 无缝集成
- 自动检测和选择牌组/模型
- 支持模型字段查看和验证
- 实时连接状态检测

### ⚙️ 用户体验优化
- 直观的界面设计和样式自定义
- 多语言支持（中英文）
- 实时预览和即时反馈

## 安装与加载扩展

1. 打包前先构建 CSS（见下方“构建与开发”）
2. 打开 Chrome 扩展管理页 `chrome://extensions`
3. 开启右上角“开发者模式”
4. 选择“加载已解压的扩展程序”，并选择本仓库目录

## 构建与开发

本项目采用现代化的前端工程配置，使用 Tailwind CSS 按需构建优化样式文件大小。

### 环境要求
- Node.js 16+ （推荐使用 LTS 版本）
- npm 或 yarn

### 快速开始

1. **克隆项目**
   ```bash
   git clone [repository-url]
   cd anki-word-assistant
   ```

2. **安装依赖**
   ```bash
   npm install
   ```

3. **构建样式文件**
   ```bash
   npm run css:build
   ```

4. **开发模式（自动监听文件变更）**
   ```bash
   npm run dev
   ```

### 构建说明

- **生产构建**: `npm run css:build` - 生成压缩后的 CSS 文件
- **开发模式**: `npm run dev` - 监听文件变更，自动重建样式
- **样式系统**: Tailwind CSS 按需构建，仅包含实际使用的样式类

### 何时需要重建样式

✅ **需要重建的情况：**
- 添加或删除 Tailwind 类名（包括响应式和状态变体）
- 修改 `tailwind.config.js` 配置
- 更新 `styles/input.css` 入口文件
- 新增页面或脚本文件

❌ **不需要重建的情况：**
- 修改自定义 CSS 样式（`styles/` 目录下的其他文件）
- 更改内联样式或文本内容
- 运行时动态切换已存在的类名

## 项目架构

```
anki-word-assistant/
├── manifest.json                 # 扩展配置清单
├── popup/                        # 弹窗界面
│   ├── popup.html               # 主界面HTML
│   └── popup.js                 # 主界面逻辑
├── options/                      # 设置页面
│   ├── options.html             # 设置页面HTML
│   └── options.js               # 设置页面逻辑
├── utils/                        # 核心功能模块
│   ├── ai-service.js            # AI服务集成
│   ├── ankiconnect.js           # AnkiConnect API
│   ├── field-handler.js         # 字段处理引擎
│   ├── prompt-engine.js         # Prompt模板引擎
│   ├── storage.js               # 数据存储管理
│   └── i18n.js                  # 国际化支持
├── styles/                       # 样式文件
│   ├── input.css                # Tailwind 构建入口
│   └── tailwind.min.css         # 构建后的样式文件
├── icons/                        # 扩展图标
├── _locales/                     # 多语言文件
├── docs/                         # 项目文档
├── tailwind.config.js           # Tailwind 配置
├── package.json                 # 项目依赖配置
└── README.md                    # 项目说明文档
```

### 核心模块说明

- **ai-service.js**: 统一的AI服务接口，支持多种AI提供商
- **field-handler.js**: 智能字段映射和处理系统
- **prompt-engine.js**: 灵活的Prompt模板管理引擎
- **ankiconnect.js**: AnkiConnect API封装，提供完整的Anki集成功能

## 使用指南

### 初次配置
1. 安装并启动 Anki
2. 安装 AnkiConnect 插件
3. 在扩展设置页面配置 AI 服务（选择提供商并输入 API 密钥）
4. 测试 AnkiConnect 连接
5. 选择目标牌组和模型

### 创建卡片
1. 在任意网页选中文本
2. 点击扩展图标打开弹窗
3. 查看 AI 解析结果和字段映射
4. 根据需要调整内容
5. 点击"添加到 Anki"创建卡片

## 常见问题

**Q: 为什么不使用 CDN 版本的 Tailwind CSS？**
A: 浏览器扩展需要避免外部依赖，本项目采用离线按需构建，既保证了安全性又优化了文件大小。

**Q: 修改了样式类名但不生效？**
A: 请运行 `npm run css:build` 重新构建样式文件，或在开发时使用 `npm run dev` 自动监听变更。

**Q: AnkiConnect 连接失败怎么办？**
A: 确保 Anki 正在运行且已安装 AnkiConnect 插件，检查端口 8765 是否被占用。

**Q: AI 解析结果不准确？**
A: 可以在设置页面自定义 Prompt 模板，调整 AI 的解析规则和输出格式。

## 技术栈

- **前端框架**: Vanilla JavaScript (ES6+)
- **样式系统**: Tailwind CSS v3.4+
- **构建工具**: Tailwind CLI
- **AI 集成**: Google Gemini / OpenAI GPT / Anthropic Claude
- **数据存储**: Chrome Extension Storage API
- **国际化**: Chrome Extension i18n API

## 贡献指南

欢迎提交 Issue 和 Pull Request！

### 开发流程
1. Fork 本仓库
2. 创建特性分支：`git checkout -b feature/your-feature`
3. 提交更改：`git commit -m 'Add some feature'`
4. 推送到分支：`git push origin feature/your-feature`
5. 提交 Pull Request

### 代码规范
- 使用 ES6+ 语法
- 遵循现有的代码风格和命名约定
- 添加必要的注释和文档
- 确保新功能有对应的错误处理

## 版本历史

- **v1.0**: 基础功能实现，支持基本的AI解析和Anki集成
- **当前开发版**: 优化字段映射系统，增强用户体验

## 许可证

本项目采用 [MIT 许可证](LICENSE)。
