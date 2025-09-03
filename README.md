# Anki Word Assistant 🎯

> **智能AI驱动的Chrome扩展**，将网页文本和词典查询结果快速转化为结构化Anki记忆卡片

[![MIT License](https://img.shields.io/badge/License-MIT-green.svg)](https://choosealicense.com/licenses/mit/)
[![Chrome Extension](https://img.shields.io/badge/Platform-Chrome%20Extension-blue.svg)](https://developer.chrome.com/docs/extensions/)
[![Version](https://img.shields.io/badge/Version-1.0.0-brightgreen.svg)](https://github.com/your-repo/anki-word-assistant)

## ✨ 核心特性

### 🤖 多AI供应商支持
- **Google Gemini**: 默认推荐，响应快速，准确率高
- **OpenAI GPT**: 支持GPT-4o、GPT-4o-mini等最新模型
- **Anthropic Claude**: 支持Claude 3.5 Sonnet、Claude 3.5 Haiku等模型
- **智能降级**: 自动切换可用的AI供应商，确保服务稳定性
- **自定义配置**: 支持手动配置模型名称和API端点

### 🧠 智能文本解析
- **AI驱动解析**: 自动将非结构化文本转换为"正面"和"背面"字段
- **自定义提示**: 支持个性化Prompt模板，满足不同使用场景
- **多语言支持**: 优化处理中英文词典查询结果

### 🔗 无缝Anki集成
- **直接连接**: 通过AnkiConnect插件直接与Anki桌面应用通信
- **动态字段映射**: 自动适配不同的Anki卡片模板和字段结构
- **即时创建**: 一键将解析结果添加到指定牌组

### ⚙️ 高度可配置
- **AI供应商管理**: 灵活切换和配置多个AI服务
- **连接状态监控**: 实时显示各供应商的健康状态
- **样式自定义**: 可调节字体大小、对齐方式、行高等显示参数
- **安全存储**: 本地加密存储API密钥，确保数据安全

### 🎨 现代化界面
- **直观操作**: 清晰的用户界面，操作简单高效
- **实时反馈**: 提供详细的状态信息和错误提示
- **响应式设计**: 适配不同屏幕尺寸和分辨率

## 🚀 安装与配置

### 第一步：准备工作

1. **安装Anki**: 确保已安装 [Anki桌面应用](https://apps.ankiweb.net/)
2. **安装AnkiConnect**: 在Anki中安装 [AnkiConnect插件](https://ankiweb.net/shared/info/2055492159)（插件代码：2055492159）

### 第二步：加载扩展

1. 打开Chrome浏览器，访问扩展管理页面 (`chrome://extensions`)
2. 启用右上角的**"开发者模式"**
3. 点击**"加载已解压的扩展程序"**按钮
4. 选择本项目的根目录文件夹

### 第三步：配置扩展

#### AI服务配置
1. 右键点击浏览器工具栏中的Anki Word Assistant图标
2. 选择**"选项"**打开配置页面
3. 在"AI服务配置"部分：
   - **选择主要AI供应商**（Google Gemini/OpenAI/Anthropic Claude）
   - **输入API密钥**：获取对应服务的API Key
     - Google Gemini: [Google AI Studio](https://makersuite.google.com/app/apikey)
     - OpenAI: [OpenAI Platform](https://platform.openai.com/api-keys)
     - Anthropic: [Anthropic Console](https://console.anthropic.com/account/keys)
   - **配置模型名称**：可使用默认值或自定义模型
   - **设置API端点**：可使用默认URL或自定义代理地址
   - **启用所需供应商**：选择要使用的AI服务

#### AnkiConnect配置
1. 在"AnkiConnect配置"部分点击**"测试Anki连接"**
2. 连接成功后选择**默认牌组**和**卡片模板**
3. 查看字段映射信息，确认正面/背面字段配置

#### 其他配置（可选）
- **自定义Prompt**: 根据需要调整AI解析行为
- **显示样式**: 个性化界面外观设置
- **语言设置**: 选择界面语言

4. 点击**"保存配置"**完成设置

## 💡 使用方法

### 基本使用流程
1. **点击扩展图标**: 在浏览器工具栏点击Anki Word Assistant图标打开弹窗
2. **输入文本**: 将词典查询结果或任意文本粘贴到主输入框
3. **AI解析**: 点击**"解析"**按钮，AI将自动处理文本并填充正面/背面字段
4. **检查编辑**: 审查AI生成的内容，根据需要进行调整
5. **创建卡片**: 点击**"写入Anki"**按钮将卡片添加到指定牌组

### 高级功能
- **批量处理**: 支持一次性处理多个词条
- **模板自定义**: 通过自定义Prompt优化解析效果
- **错误恢复**: 利用多供应商降级机制确保服务可用性
- **状态监控**: 实时查看AI供应商连接状态

## 🔧 技术架构

### 核心组件
- **popup/**: 用户界面和交互逻辑
- **options/**: 配置页面和设置管理
- **utils/**: 核心工具模块
  - `ai-service.js`: 多AI供应商服务管理
  - `ankiconnect.js`: Anki集成接口
  - `storage.js`: 配置存储和管理
  - `i18n.js`: 国际化支持

### 支持的AI模型
- **Google Gemini**: gemini-1.5-flash, gemini-1.5-pro, gemini-1.0-pro
- **OpenAI GPT**: gpt-4o, gpt-4o-mini, gpt-4-turbo, gpt-3.5-turbo
- **Anthropic Claude**: claude-3-5-sonnet-20241022, claude-3-5-haiku-20241022, claude-3-opus-20240229

### 数据安全
- 所有API密钥均本地加密存储
- 不收集或上传任何用户数据
- 遵循最小权限原则

## 🛠️ 开发指南

### 项目结构
```
anki-word-assistant/
├── manifest.json          # 扩展清单文件
├── popup/                 # 弹窗界面
│   ├── popup.html
│   ├── popup.css
│   └── popup.js
├── options/               # 配置页面
│   ├── options.html
│   ├── options.css
│   └── options.js
├── utils/                 # 核心工具
│   ├── ai-service.js      # AI服务管理
│   ├── ankiconnect.js     # Anki连接
│   ├── storage.js         # 存储管理
│   └── i18n.js           # 国际化
├── icons/                 # 图标资源
├── _locales/             # 语言包
└── README.md
```

### 本地开发
1. 克隆项目到本地
2. 在Chrome中加载未打包的扩展
3. 修改代码后刷新扩展即可测试

### 贡献指南
欢迎提交Issue和Pull Request来改进这个项目！

## 🐛 故障排除

### 常见问题

**Q: AI解析失败怎么办？**
A: 检查API密钥是否正确，网络连接是否正常，或尝试切换其他AI供应商。

**Q: 无法连接到Anki？**
A: 确保Anki桌面应用正在运行，且已安装AnkiConnect插件。

**Q: 卡片创建失败？**
A: 检查选择的牌组和模板是否存在，确认字段映射正确。

**Q: 扩展无法加载？**
A: 确认已启用开发者模式，检查manifest.json文件格式是否正确。

### 获取帮助
- 查看项目Issues页面寻找解决方案
- 提交新的Issue描述问题
- 参考开发文档中的技术说明

## 📄 许可证

本项目采用 **MIT许可证**。详见 [LICENSE](LICENSE) 文件。

---

**Made with ❤️ for Language Learners**

> 如果这个项目对您有帮助，请考虑给个⭐Star支持一下！