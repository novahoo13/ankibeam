# 悬浮球功能需求评估报告

**日期**: 2025-10-15
**项目**: Anki Word Assistant
**评估人**: Claude
**文档版本**: 1.0

---

## 📋 需求概述

### 功能描述
实现一个悬浮球功能，在网页中选中文字后：
1. 在选中文字附近显示悬浮球图标
2. 点击悬浮球后弹出解析窗口（类似popup页面的小窗口）
3. 自动使用选中的文本开始AI解析
4. 将解析结果回填到窗口的各个字段中
5. 支持点击"写入"按钮添加到Anki
6. 在设置页面提供开关选项控制悬浮球显示

### 交互流程
```
用户选中文字 → 显示悬浮球 → 点击悬浮球 → 弹出解析窗口 → 自动解析 → 显示结果 → 写入Anki
```

---

## 🔍 技术可行性分析

### 1. 成熟技术方案

#### ✅ Content Script 注入
- **实现方式**: 使用Chrome Extension的Content Scripts在网页中注入JavaScript
- **成熟度**: ⭐⭐⭐⭐⭐ 非常成熟，是Chrome扩展的标准功能
- **兼容性**: Manifest V3完全支持
- **参考**: [Chrome Content Scripts官方文档](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts)

#### ✅ 文本选择监听
- **实现方式**: 监听`mouseup`或`selectionchange`事件，使用`window.getSelection()`获取选中文本
- **成熟度**: ⭐⭐⭐⭐⭐ Web标准API，跨浏览器支持
- **代码示例**:
```javascript
document.addEventListener('mouseup', () => {
  const selection = window.getSelection();
  const selectedText = selection.toString().trim();
  if (selectedText) {
    showFloatingButton(selection.getRangeAt(0).getBoundingClientRect());
  }
});
```

#### ✅ 悬浮元素定位
**推荐方案**: Floating UI (Popper.js v3)
- **库**: [@floating-ui/dom](https://floating-ui.com/)
- **大小**: 仅600字节（核心），远小于Popper.js v2的3KB
- **优势**:
  - 🎯 自动避免碰撞，智能调整位置
  - 📦 模块化设计，支持tree-shaking
  - 🚀 跨平台支持（Web、React Native、Canvas等）
  - 🔧 低级API，灵活性高
- **成熟度**: ⭐⭐⭐⭐⭐ Popper.js的官方继承者
- **集成难度**: 低

**备选方案**: 手动计算CSS `position: absolute`
- **优势**: 零依赖，代码体积小
- **劣势**: 需要手动处理边界检测、滚动、窗口调整等复杂情况
- **适用场景**: 简单定位需求

#### ✅ Shadow DOM隔离
- **实现方式**: 使用Shadow DOM创建样式隔离的浮动窗口
- **优势**:
  - 🛡️ 完全隔离网页CSS，避免样式冲突
  - 🎨 保证悬浮窗样式的一致性
  - 🔒 防止网页JS干扰扩展功能
- **成熟度**: ⭐⭐⭐⭐⭐ Web标准，Chrome完美支持
- **代码示例**:
```javascript
const container = document.createElement('div');
const shadowRoot = container.attachShadow({ mode: 'closed' });
shadowRoot.innerHTML = `
  <style>
    /* 样式完全隔离 */
    .floating-button { ... }
  </style>
  <div class="floating-button">📝</div>
`;
document.body.appendChild(container);
```

#### ✅ iframe浮动窗口
- **实现方式**: 使用iframe承载解析窗口UI
- **优势**:
  - 🖼️ 可以复用现有的popup.html页面结构
  - 🔐 天然的样式和脚本隔离
  - 🎭 完整的DOM环境
- **劣势**:
  - ⚠️ 通信复杂度较高（需要使用postMessage）
  - 📏 尺寸和定位需要额外处理
  - 🏋️ 相对较重
- **成熟度**: ⭐⭐⭐⭐ 成熟但传统

**推荐组合**: Shadow DOM悬浮球 + Shadow DOM小窗口（无需iframe）

---

### 2. 架构设计建议

#### 文件结构
```
anki-word-assistant/
├── manifest.json                    # 添加content_scripts配置
├── content/
│   ├── content.js                   # 主入口：文本选择监听
│   ├── floating-button.js           # 悬浮球组件
│   ├── floating-panel.js            # 解析窗口组件
│   ├── content-bridge.js            # 与background/popup通信桥接
│   └── content.css                  # Shadow DOM内部样式
├── popup/                           # 现有popup逻辑可复用
│   └── ...
└── utils/                           # 现有工具库可复用
    ├── ai-service.js
    ├── ankiconnect.js
    ├── field-handler.js
    └── i18n.js
```

#### manifest.json配置
```json
{
  "manifest_version": 3,
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": [
        "content/content.js",
        "content/floating-button.js",
        "content/floating-panel.js"
      ],
      "css": ["content/content.css"],
      "run_at": "document_idle"
    }
  ],
  "permissions": [
    "storage",
    "activeTab"  // 用于获取当前标签页信息
  ]
}
```

#### 关键功能模块

##### 1. 文本选择检测 (content.js)
```javascript
class SelectionMonitor {
  constructor() {
    this.isEnabled = true; // 从storage读取开关状态
    this.lastSelection = '';
    this.floatingButton = new FloatingButton();
    this.floatingPanel = new FloatingPanel();
  }

  init() {
    // 监听选择事件
    document.addEventListener('mouseup', this.handleSelection.bind(this));
    document.addEventListener('selectionchange', this.handleSelectionChange.bind(this));

    // 监听存储变化（实时响应设置页面的开关）
    chrome.storage.onChanged.addListener(this.handleStorageChange.bind(this));
  }

  handleSelection(event) {
    if (!this.isEnabled) return;

    const selection = window.getSelection();
    const text = selection.toString().trim();

    if (text && text.length > 0) {
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      this.floatingButton.show(rect, text);
    } else {
      this.floatingButton.hide();
    }
  }
}
```

##### 2. 悬浮球组件 (floating-button.js)
```javascript
class FloatingButton {
  constructor() {
    this.container = null;
    this.shadowRoot = null;
    this.selectedText = '';
    this.createButton();
  }

  createButton() {
    // 创建Shadow DOM容器
    this.container = document.createElement('div');
    this.container.id = 'anki-assistant-floating-btn';
    this.shadowRoot = this.container.attachShadow({ mode: 'closed' });

    // 注入样式和HTML
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          all: initial; /* 重置所有样式 */
          position: fixed;
          z-index: 2147483647; /* 最大z-index */
        }
        .button {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          background: #334155;
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          box-shadow: 0 2px 8px rgba(0,0,0,0.3);
          transition: all 0.2s;
        }
        .button:hover {
          transform: scale(1.1);
          background: #1e293b;
        }
      </style>
      <div class="button" title="${i18n.get('floating_button_tooltip')}">
        📝
      </div>
    `;

    // 绑定点击事件
    this.shadowRoot.querySelector('.button').addEventListener('click',
      this.handleClick.bind(this)
    );
  }

  show(rect, text) {
    this.selectedText = text;

    // 使用Floating UI计算位置
    const { x, y } = computePosition(
      { getBoundingClientRect: () => rect },
      this.container,
      {
        placement: 'top-end',
        middleware: [
          offset(8),
          flip(),
          shift({ padding: 5 })
        ]
      }
    );

    Object.assign(this.container.style, {
      left: `${x}px`,
      top: `${y}px`,
    });

    if (!this.container.parentNode) {
      document.body.appendChild(this.container);
    }
  }

  hide() {
    this.container?.remove();
  }

  handleClick() {
    // 显示解析窗口
    FloatingPanel.instance.show(this.selectedText, this.container);
    this.hide();
  }
}
```

##### 3. 解析窗口组件 (floating-panel.js)
```javascript
class FloatingPanel {
  static instance = null;

  constructor() {
    if (FloatingPanel.instance) {
      return FloatingPanel.instance;
    }

    this.container = null;
    this.shadowRoot = null;
    this.isVisible = false;
    this.createPanel();

    FloatingPanel.instance = this;
  }

  createPanel() {
    this.container = document.createElement('div');
    this.container.id = 'anki-assistant-panel';
    this.shadowRoot = this.container.attachShadow({ mode: 'closed' });

    // 引入完整的样式（可以复用popup的样式）
    const style = document.createElement('link');
    style.rel = 'stylesheet';
    style.href = chrome.runtime.getURL('styles/tailwind.min.css');
    this.shadowRoot.appendChild(style);

    // 创建面板HTML（类似popup.html）
    const panelHTML = `
      <div class="panel-container">
        <div class="panel-header">
          <h3>${i18n.get('floating_panel_title')}</h3>
          <button class="close-btn">✕</button>
        </div>
        <div class="panel-body">
          <div id="status-message"></div>
          <div id="fields-container"></div>
        </div>
        <div class="panel-footer">
          <button id="parse-btn">${i18n.get('popup_parse_button')}</button>
          <button id="write-btn" disabled>${i18n.get('popup_write_button')}</button>
        </div>
      </div>
    `;

    const wrapper = document.createElement('div');
    wrapper.innerHTML = panelHTML;
    this.shadowRoot.appendChild(wrapper);

    // 绑定事件
    this.bindEvents();
  }

  async show(selectedText, anchorElement) {
    this.isVisible = true;

    // 使用Floating UI定位
    const { x, y } = await computePosition(anchorElement, this.container, {
      placement: 'bottom-start',
      middleware: [
        offset(10),
        flip(),
        shift({ padding: 10 }),
        size({
          apply({ availableHeight, elements }) {
            Object.assign(elements.floating.style, {
              maxHeight: `${availableHeight}px`,
            });
          },
        })
      ]
    });

    Object.assign(this.container.style, {
      left: `${x}px`,
      top: `${y}px`,
    });

    document.body.appendChild(this.container);

    // 自动开始解析
    await this.startParsing(selectedText);
  }

  hide() {
    this.isVisible = false;
    this.container?.remove();
  }

  async startParsing(text) {
    // 复用popup.js中的解析逻辑
    // 通过chrome.runtime.sendMessage与background通信
    // 或者直接引入ai-service.js
  }
}
```

---

### 3. 多语言支持方案

#### 现有i18n系统集成
当前项目使用Chrome Extension的`chrome.i18n` API，已经实现了完整的多语言体系。

#### 在Content Script中使用i18n
```javascript
// content/i18n-helper.js
class ContentI18n {
  static get(key, fallback = '', substitutions = []) {
    return chrome.i18n.getMessage(key, substitutions) || fallback;
  }

  static getCurrentLocale() {
    return chrome.i18n.getUILanguage();
  }
}

// 使用示例
const buttonTooltip = ContentI18n.get('floating_button_tooltip', '解析选中文本');
const panelTitle = ContentI18n.get('floating_panel_title', 'Anki单词助手');
```

#### 需要添加的i18n键值

在`_locales/zh_CN/messages.json`中添加：
```json
{
  "floating_button_tooltip": {
    "message": "点击解析选中文本",
    "description": "悬浮球提示文本"
  },
  "floating_panel_title": {
    "message": "快速解析",
    "description": "悬浮窗标题"
  },
  "floating_panel_parsing": {
    "message": "正在解析选中内容...",
    "description": "解析进行中提示"
  },
  "floating_panel_close": {
    "message": "关闭",
    "description": "关闭按钮"
  },
  "options_floating_button_enable": {
    "message": "启用悬浮球功能",
    "description": "设置页面开关标签"
  },
  "options_floating_button_hint": {
    "message": "在网页中选中文字时显示悬浮球图标",
    "description": "设置页面说明文本"
  }
}
```

同样在`_locales/en/messages.json`、`_locales/ja/messages.json`中添加对应翻译。

---

### 4. 设置页面集成

#### options.html添加开关
```html
<!-- 在现有的options.html的"系统设置"标签页中添加 -->
<div class="setting-group">
  <label class="flex items-center justify-between">
    <span>
      <span class="font-medium" data-i18n="options_floating_button_enable"></span>
      <span class="block text-xs text-gray-500" data-i18n="options_floating_button_hint"></span>
    </span>
    <input type="checkbox" id="floating-button-enabled" class="toggle-switch">
  </label>
</div>
```

#### options.js保存逻辑
```javascript
// 在现有的saveSettings()函数中添加
async function saveSettings() {
  const floatingButtonEnabled = document.getElementById('floating-button-enabled').checked;

  await chrome.storage.sync.set({
    floatingButtonEnabled: floatingButtonEnabled,
    // ... 其他设置
  });
}

// 在loadSettings()中添加
async function loadSettings() {
  const config = await chrome.storage.sync.get([
    'floatingButtonEnabled',
    // ... 其他设置
  ]);

  document.getElementById('floating-button-enabled').checked =
    config.floatingButtonEnabled !== false; // 默认开启
}
```

---

## 🚧 潜在挑战与解决方案

### 挑战1: 跨域iframe内容无法访问
**问题**: Gmail、Google Docs等使用iframe的网站，Content Script无法访问iframe内的选择内容
**解决方案**:
- ⚠️ 这是Chrome安全限制，无法完全解决
- ✅ 在主文档中正常工作
- 📝 在文档中说明限制范围

### 挑战2: 页面滚动时位置跟随
**问题**: 用户滚动页面时，悬浮球和窗口的位置需要更新
**解决方案**:
```javascript
// 监听滚动事件
window.addEventListener('scroll', () => {
  if (floatingButton.isVisible) {
    floatingButton.updatePosition();
  }
}, { passive: true });

// 或使用Intersection Observer
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (!entry.isIntersecting) {
      floatingButton.hide();
    }
  });
});
```

### 挑战3: 与网页快捷键冲突
**问题**: 可能与某些网站的快捷键产生冲突
**解决方案**:
- 悬浮球采用点击触发，不使用快捷键
- 允许用户在设置中禁用悬浮球
- 提供域名黑名单功能

### 挑战4: 性能开销
**问题**: 在所有网页注入脚本可能影响性能
**解决方案**:
- 使用`run_at: "document_idle"`延迟加载
- 事件监听使用防抖(debounce)
- Shadow DOM减少样式计算
- 按需加载AI服务和UI组件

### 挑战5: 现有popup逻辑复用
**问题**: popup.js中的逻辑如何在Content Script中复用
**解决方案**:
**方案A: 共享工具库**
```javascript
// utils模块已经是独立的，可以直接在content script中引入
import { parseTextWithDynamicFieldsFallback } from '../utils/ai-service.js';
import { addNote } from '../utils/ankiconnect.js';
import { collectFieldsForWrite, validateFields } from '../utils/field-handler.js';
```

**方案B: 通过Background Script中转**
```javascript
// content script
chrome.runtime.sendMessage({
  action: 'parseText',
  text: selectedText,
  config: config
}, (response) => {
  if (response.success) {
    fillFields(response.result);
  }
});

// background.js
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'parseText') {
    parseTextWithDynamicFieldsFallback(request.text, ...)
      .then(result => sendResponse({ success: true, result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // 异步响应
  }
});
```

**推荐方案A**: 直接复用工具库更简洁高效

---

## 📊 工作量评估

### 开发阶段

| 阶段 | 任务 | 预计工时 | 复杂度 |
|------|------|----------|--------|
| 阶段1 | Content Script基础框架搭建 | 4h | 中 |
| | - 文本选择监听 | 2h | 低 |
| | - Shadow DOM容器创建 | 2h | 中 |
| 阶段2 | 悬浮球组件开发 | 6h | 中 |
| | - UI设计与实现 | 3h | 低 |
| | - Floating UI集成 | 2h | 中 |
| | - 动画与交互 | 1h | 低 |
| 阶段3 | 解析窗口组件开发 | 10h | 高 |
| | - UI布局（复用popup样式） | 3h | 中 |
| | - 字段动态渲染 | 3h | 中 |
| | - 解析逻辑集成 | 4h | 高 |
| 阶段4 | 设置页面集成 | 3h | 低 |
| | - 开关UI | 1h | 低 |
| | - 存储逻辑 | 1h | 低 |
| | - 实时生效 | 1h | 中 |
| 阶段5 | 多语言支持 | 4h | 中 |
| | - 添加i18n键值 | 2h | 低 |
| | - 所有语言翻译 | 2h | 低 |
| 阶段6 | 边界情况处理 | 6h | 中 |
| | - 滚动位置更新 | 2h | 中 |
| | - 窗口调整适配 | 2h | 中 |
| | - 特殊网站兼容 | 2h | 中 |
| 阶段7 | 测试与优化 | 8h | 中 |
| | - 功能测试 | 3h | 中 |
| | - 性能优化 | 3h | 中 |
| | - Bug修复 | 2h | 不定 |

**总计**: 约41小时（约5-6个工作日）

### 风险系数
- **技术风险**: 低（方案成熟）
- **兼容风险**: 中（不同网站样式差异）
- **维护风险**: 低（代码结构清晰）

---

## ✅ 最终建议

### 推荐技术栈
1. **定位库**: Floating UI (600B, 现代化)
2. **样式隔离**: Shadow DOM (原生, 零依赖)
3. **通信方式**: 直接引入utils模块（方案A）
4. **触发方式**: mouseup事件监听

### 实施优先级
**P0 (核心功能)**:
- [x] 文本选择检测
- [x] 悬浮球显示与定位
- [x] 点击触发解析窗口
- [x] AI解析与字段填充
- [x] 写入Anki功能

**P1 (用户体验)**:
- [x] 设置页面开关
- [x] 多语言支持
- [x] 平滑动画

**P2 (增强功能)**:
- [ ] 滚动自动隐藏
- [ ] 域名黑名单
- [ ] 快捷键支持
- [ ] 悬浮球位置记忆

### 开发路线图

```
Week 1:
├─ Day 1-2: 阶段1 + 阶段2（基础框架 + 悬浮球）
├─ Day 3-4: 阶段3（解析窗口）
└─ Day 5: 阶段4 + 阶段5（设置集成 + i18n）

Week 2:
├─ Day 1: 阶段6（边界处理）
└─ Day 2-3: 阶段7（测试优化）
```

### 后续扩展方向
1. **智能识别**: 根据选中内容类型自动选择解析模式（单词/句子/段落）
2. **历史记录**: 在悬浮窗中显示最近解析的内容
3. **批量操作**: 支持连续选择多个词汇后一次性添加
4. **自定义样式**: 允许用户自定义悬浮球图标和颜色

---

## 📚 参考资源

### 官方文档
- [Chrome Extension Content Scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts)
- [Chrome Extension Manifest V3](https://developer.chrome.com/docs/extensions/mv3/intro/)
- [Floating UI Documentation](https://floating-ui.com/)
- [Shadow DOM MDN](https://developer.mozilla.org/en-US/docs/Web/Web_Components/Using_shadow_DOM)

### 开源示例
- [Floatly Extension](https://github.com/d3ward/floatly) - 悬浮按钮参考
- [Google Dictionary Extension](https://github.com/GoogleChrome/chrome-extensions-samples) - 文本选择参考

### 社区讨论
- [Text selection and bubble overlay](https://stackoverflow.com/questions/4409378/text-selection-and-bubble-overlay-as-chrome-extension)
- [Floating UI in Chrome Extension](https://stackoverflow.com/questions/76785511/how-can-i-use-floating-ui-as-a-chrome-extension-content-script)

---

## 🎯 结论

**可行性评级**: ⭐⭐⭐⭐⭐ (5/5)

悬浮球功能完全可行，技术方案成熟，有大量成功案例可供参考。建议使用**Shadow DOM + Floating UI**的组合方案，这是当前最佳实践。

现有项目架构良好，utils模块可以直接复用，多语言系统已经完善，集成难度低。预计5-6个工作日可完成核心功能，是一个高性价比的用户体验提升。

**建议立即开始实施，按照上述技术方案分阶段推进。**

---

**评估完成日期**: 2025-10-15
**下一步行动**: 等待项目负责人审批，准备创建`IMPLEMENTATION_PLAN.md`
