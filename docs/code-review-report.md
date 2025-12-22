# Anki Word Assistant 项目代码评审报告

## 评审范围与目标

- 范围：`manifest.json`、`background/`、`content/`、`popup/`、`options/`、`utils/`、`docs/`
- 目标：评估业务流完整性与衔接、识别风险/缺陷、提出优化方向

## 业务流概览

1. 配置与模板（`options/options.js`）
   - 管理 AI 提供商、API Key、模板库、字段配置、提示词生成与保存。
2. 弹窗流程（`popup/popup.js`）
   - 用户输入文本 -> 调用 AI 解析 -> 填充动态字段 -> 写入 Anki。
3. 悬浮助手流程（`content/content-main.js` + `content/floating-*`）
   - 页面选中文本 -> 显示悬浮按钮 -> 调用 AI 解析 -> 面板编辑 -> 写入 Anki（通过 background 代理）。
4. AI 服务与回退（`utils/ai-service.js`）
   - 统一调用各供应商接口、重试与健康检查、输出校验。
5. Anki 写入（`utils/ankiconnect*.js` + `background/background.js`）
   - 弹窗页直连 AnkiConnect；内容脚本通过 background 代理绕过 CORS。

## 关键问题（按严重度）

### 高

1. 配置更新时的 UI/数据源不一致，可能导致写入字段与面板字段不匹配

   - 现象：面板处于 loading/ready 时跳过重新渲染，但 `currentConfig` 已被替换，写入时使用的是新模板字段。
   - 风险：用户看到旧字段，实际写入新模板字段或新模型，导致写入失败或内容错位。
   - 证据：`content/content-main.js:188`、`content/content-main.js:586`、`content/content-main.js:731`。

2. 悬浮面板仍会渲染 legacy/旧模板字段，但解析逻辑已强制要求新模板
   - 现象：`buildFieldLayout` 在无新模板时回退到 legacy 或旧 `promptTemplates`，但解析入口直接抛出 “旧版模式已弃用/未选择模板”。
   - 风险：用户看得到字段却无法解析/写入，业务流断点明显，老配置用户受影响。
   - 证据：`content/floating-panel.js:123`、`content/content-main.js:491`、`utils/field-handler.js:14`。

### 中

3. AI 健康状态更新会整包覆盖配置，可能与用户保存配置产生写冲突

   - 现象：`updateProviderHealth` 每次 `loadConfig -> saveConfig`，无合并/版本校验；与 options 保存同时发生时可能丢失用户改动（如 API Key 或模板）。
   - 证据：`utils/ai-service.js:356`、`utils/storage.js:820`。

4. 测试脚本与实际测试文件不匹配，`npm test` 基本为空跑
   - 现象：测试脚本只执行 `tests/**/*.test.js`，但仓库只有 `utils/template-store.test.js`（非 `node:test` 结构）。
   - 风险：回归无法被 CI 捕获；“通过测试”缺乏可信度。
   - 证据：`package.json:7`、`utils/template-store.test.js:1`。

### 低

5. AI 输出校验对非字符串字段直接调用 `.trim()`

   - 现象：若 AI 返回数值/对象，校验会抛异常并被当作“JSON 解析失败”，造成误判。
   - 证据：`utils/prompt-engine.js:119`。

6. Host 权限包含 `<all_urls>`，权限范围超大
   - 现象：扩展拥有所有域名访问权限，即便实际只需少数 API 与本地端口。
   - 风险：商店审核风险提升、用户信任成本增加。
   - 证据：`manifest.json:7`。

## 业务流衔接评估

- 入口衔接：options -> popup 的模板链路完整；options -> 悬浮助手存在 legacy/旧模板残留导致解析断点。
- 配置一致性：storage 更新可触发刷新，但在面板活跃时跳过渲染导致 UI/数据源不一致。
- 迁移路径：旧 `promptTemplates` 配置未做显式迁移，用户可能需要手动重建模板。

## 可优化方向（非阻断）

- 统一解析与写入逻辑：抽出公共模块，减少 popup 与 floating 的重复代码与行为分叉。
- 引入配置版本锁或增量合并：避免 `updateProviderHealth` 写入覆盖用户配置。
- 明确 legacy 迁移策略：在加载配置时将旧模板迁移到 template library，或在 UI 给出一键迁移提示。
- 权限收敛：将 `<all_urls>` 改为按需动态申请或引导用户授权自定义 API host。
- 增补测试：至少覆盖 template store、prompt 构造、字段验证与配置迁移。

## 结论

项目功能链路已形成完整闭环（配置 -> 解析 -> 编辑 -> 写入），但悬浮助手与新模板体系衔接不完整，且配置更新与健康状态写入存在潜在一致性问题。建议优先处理高优问题，以避免用户在真实场景中遇到解析失败或写入错位。
