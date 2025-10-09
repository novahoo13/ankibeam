# AI 供应商重构开发大纲

## 当前现状评估
- 供应商定义分散在 `utils/ai-service.js`、`utils/storage.js`、`options/options.js` 与 `options/options.html`，新增供应商需要多处同步，极易遗漏（如 `PROVIDERS` 常量、`PROVIDER_SALTS`、DOM 节点 ID、事件绑定等）。
- `ai-service.js` 仅提供逐个供应商的手写实现，缺乏统一的 OpenAI 兼容层；`callProviderAPI` 使用 `switch` 判定，不易扩展，也无法重用输入输出规范。
- 存储层 `DEFAULT_CONFIG` 与密钥盐值硬编码，迁移逻辑 `migrateConfig` 只能识别既有三个供应商，且无法描述额外的运行时元数据（健康状态、fallback 顺序）。
- 选项页静态编排 DOM，表单、测试按钮、提示文本都基于具体 ID；`actualApiKeys`、`fallbackOrder` 及事件处理均假定只有 Google/OpenAI/Anthropic。
- 缺失自动化测试与构建脚本，尚未覆盖配置迁移、加密/解密、UI 渲染、API 调用等关键路径；`package.json` 无 `test` 脚本。
- `manifest.json` 的 `host_permissions` 与供应商列表耦合，缺少一致性校验流程；未来新增域名可能导致生产安装失败。

## 总体策略
- 按阶段增量交付，确保每步都有可运行的中间状态，且现有三家供应商功能无回归。
- 建立单一“供应商配置中心”，通过数据驱动的方式生成默认模型、API 端点、UI 元素、密钥盐值、健康检查等信息。
- 引入最小可行的测试基线（优先选用 Node 原生 `node:test` + `assert` + `jsdom`），覆盖配置生成、存储迁移、API 请求构造、UI 渲染与交互。
- 在实施阶段同步维护 `IMPLEMENTATION_PLAN.md`，并持续更新文档/手册，保障对外行为与权限声明透明。

## 开发阶段

### Stage 0（新增）: 基线准备与测试骨架
**目标**：补齐基础工具链，确保后续阶段可以编写并运行自动化测试。  
**主要任务**：
- 新增 `npm test` 脚本，使用 `node --test` 运行测试；引入 `jsdom` 作为 devDependency 以支撑 DOM 相关测试，必要时追加 `whatwg-fetch`/`undici` 模拟 `fetch`。
- 建立 `tests/` 目录结构（`tests/providers.config.test.js`、`tests/storage.test.js` 等），并提供 `helpers`（如全局 fetch mock、storage mock、临时 `chrome` stub）。
- 编写冒烟测试（如加载默认配置、确保 `ai-service` 可被 `import`）验证脚手架生效。
**测试**：执行 `npm test`，确保脚手架运行通过且测试环境能模拟 `chrome`、`fetch`。  
**完成条件**：测试脚手架合入主干、README/开发文档更新测试指引。

### Stage 1: 供应商配置建模
**Goal**：在 `utils` 目录新增 `providers.config.js`（或 `.mjs`），集中描述所有供应商的元数据。  
**主要任务**：
- 定义统一的数据结构：`id`、`label`、`compatMode`（如 `openai-compatible`、`google-generative`、`anthropic-messages`）、`defaultModel`、`testModel`、`api`（包含 `baseUrl`、`pathBuilder`、`headers`、`payloadBuilder`）、`encryptionSalt`、`hostPermissions`、`ui`（表单字段、placeholder、说明文案）。
- 将 `utils/ai-service.js` 中的 `PROVIDERS`、默认模型名称、API URL 等信息迁移到配置文件；为特殊供应商提供扩展点（如 `buildRequest` 钩子）。
- 提供访问函数：`getAllProviders()`、`getProviderById(id)`、`getDefaultProviderId()`、`getFallbackOrder()` 等，并为缺失字段提供守卫。
- 在 `ai-service.js` 中仅保留行为逻辑，改为引用配置获取元数据；整理注释确保全局一致。
**测试**：
- `tests/providers.config.test.js`：校验配置结构、必填字段、盐值长度、host 列表。
- `tests/ai-service.config.test.js`：验证 `getProviderById` 与默认模型读取结果。
**完成条件**：原 `PROVIDERS` 常量被移除/转调，运行时仍能读取原三家供应商信息；新配置模块通过测试并在 Stage 2/3 中可重用。
**注意事项**：保持配置为纯数据 + 小型帮助函数，避免在配置文件中访问 `chrome` 或 `fetch`。

### Stage 2: 存储层与迁移机制升级
**Goal**：让 `utils/storage.js` 基于供应商配置生成默认数据，并支持灵活加解密与迁移。  
**主要任务**：
- 重写 `DEFAULT_CONFIG` 构造逻辑：根据 `getAllProviders()` 动态生成 `aiConfig.models`、`fallbackOrder`，并在配置中存储 `apiUrl`、`healthStatus`、`lastCheck` 等字段。
- 将 `PROVIDER_SALTS` 内联到供应商配置，`getDerivedKey` / `encryptApiKey` / `decryptApiKey` 改为从配置读取盐值；引入错误处理，防止缺失盐值时崩溃。
- 扩展 `migrateConfig`：支持从旧版（2.1 及之前）迁移到新结构，含以下分支：
  1. 旧版缺失 `aiConfig.models` 字段时补齐默认值；
  2. 旧版 `apiUrl` 留空时使用配置默认值；
  3. 迁移完成后写入新的 `config.version`（计划提升至 2.2 或 3.0，视最终方案确定）。
- 更新 `saveConfig`/`loadConfig`，使其迭代全部供应商，而非硬编码键名；处理新加入供应商时的回退逻辑（例如缺失 `apiKey` 时仍能保存）。
- 为导入/导出增加版本校验与结构修正（如自动补齐新增字段、重置未知供应商状态）。
**测试**：
- `tests/storage.test.js`：覆盖默认配置生成、API Key 加解密、迁移逻辑（构造旧版快照，验证迁移后结构及密钥清洗）。
- `tests/import-export.test.js`：验证导入缺字段时的修复行为。
**完成条件**：旧配置可平滑迁移，新配置能支持可扩展供应商；所有相关测试通过。
**注意事项**：升级 `config.version` 时需同步文档说明；确保加密密钥 material 不泄露到配置文件之外。

### Stage 3: AI 服务访问层抽象
**Goal**：实现 OpenAI 兼容调用路径，将 API 请求逻辑与供应商配置解耦。  
**主要任务**：
- 新增 `callOpenAICompatible`，接收 `providerConfig`、`apiKey`、`model`、`prompt`、`options`，根据配置构建 URL、headers、payload；支持覆盖 `pathBuilder`、`bodyBuilder`。
- 为 Google/Anthropic 保留专有执行器，但仍通过配置读取 `baseUrl`、`modelPath`、请求参数；提炼公共错误处理函数（解析返回 JSON，抛出附加上下文）。
- 重写 `callProviderAPI`：根据 `providerConfig.compatMode` 动态选择执行函数；允许新增供应商通过配置注册执行器或沿用 OpenAI 兼容实现。
- 整理 `testConnection`、`parseText`、`parseTextWithFallback` 等函数，确保它们读取 `providerConfig.testModel`、`retryPolicy`、`healthCheck`。
- 引入 fetch mock（Stage 0 已准备），为成功、错误、超时、非 JSON 返回等场景编写单元测试；检查健康状态更新逻辑。
- 重新评估日志与错误信息，确保信息涵盖 provider id、model、request id（如需）。
**测试**：
- `tests/ai-service.openai.test.js`：模拟 OpenAI 兼容供应商，验证 URL/headers/payload。
- `tests/ai-service.google.test.js`、`tests/ai-service.anthropic.test.js`：覆盖特殊供应商路径。
- `tests/ai-service.fallback.test.js`：验证健康状态与重试逻辑。
**完成条件**：`ai-service` 对现有三家供应商保持功能等价，并能在配置中添加新的 OpenAI 兼容供应商而无需改动核心代码。
**注意事项**：在 Chrome 环境下测试时需关注 `fetch` 的 header 限制；确保错误信息不会泄露 API Key。

### Stage 4: 选项页与交互层改造
**Goal**：让选项页基于供应商配置动态渲染，并保持与存储结构一致。  
**主要任务**：
- 将 `options/options.js` 中关于供应商的常量（`actualApiKeys`、`loadProviderConfig`、`handleTestProvider` 等）改为遍历 `getAllProviders()`；通过配置生成表单字段、placeholder、说明文案。
- 为 DOM 渲染新增小型模板渲染层（可使用字符串模板或 `document.createElement`）；确保每个供应商按钮、输入框、测试按钮、状态区域都按 `provider.id` 命名（如 `data-provider="deepseek"`）。
- 重构 `setupApiKeyInputs`、`handleSave`、`handleProviderChange` 等函数，使其不依赖固定键名；在 `handleSave` 中自动过滤未知输入字段，并根据配置应用校验（必填 API Key、model 选项列表、URL 格式等）。
- 更新导出/导入逻辑，确保 UI 能正确展示迁移后的新字段（如健康状态、上次检查时间）。
- 重写 `options/options.html` 中供应商相关的静态块，引入挂载容器，并保留 Tailwind 样式；在满足项目“清晰易懂”原则的前提下尽量保持结构稳定。
- 增加 `tests/options.render.test.js`（使用 jsdom）验证渲染结果；通过事件测试保存、切换供应商、测试连接按钮行为。
**测试**：
- jsdom 单元测试覆盖渲染与事件；在浏览器中进行手动回归（文末附检查清单）。
**完成条件**：选项页可通过配置自动呈现供应商列表；新增供应商无需修改 JS/HTML，只需更新配置和文案。
**注意事项**：保留现有 CSS/样式类；兼容 API Key 隐藏/显示逻辑；确保语言切换与 i18n 文案不受影响。

### Stage 5: Manifest 权限与迁移验收
**Goal**：对接供应商配置与扩展权限，完成数据迁移、自测与文档更新。  
**主要任务**：
- 在配置中维护 `hostPermissions` 列表，新增脚本或单元测试校验 `manifest.json` 中的域名全集是否覆盖所有供应商需求；对 OpenAI 兼容供应商支持 `*.example.com` 等模式。
- 评估是否需要在运行时调用 `chrome.permissions.request` 获取额外域名；若需要，制定 UI 提示与错误处理策略。
- 编写迁移后验证脚本（可与 Stage 2 测试共享），确保旧版存储数据在安装新版本后自动转换；对缺失字段/无效 API Key 的场景提供提示。
- 更新文档：用户指南、隐私政策、权限说明、更新日志；在 README / docs 中加入新增“如何添加自定义 OpenAI 兼容供应商”的步骤。
- 安排最终自测：使用真实 API Key（或受控 mock 服务）完成“配置-测试连接-生成卡片”闭环；在 Chrome 扩展开发模式下验证权限提示。
**测试**：
- `tests/manifest-permissions.test.js`：读取 `manifest.json` 并比对配置中的 `hostPermissions`。
- 手动在 Chrome 中导入扩展，覆盖以下场景：全新安装、旧配置迁移、手动导入 JSON、权限不足的错误提示。
**完成条件**：所有测试通过，文档更新完毕，老用户数据无损迁移；对外说明清晰。
**注意事项**：如需修改 `manifest_version` 或引入可选权限，应提前评估 Chrome 审核要求。

## 横切工作流
- 每个 Stage 启动前在 `IMPLEMENTATION_PLAN.md` 记录目标/状态，完成后更新为 “Complete” 并删除文件。
- 引入 `CHANGELOG.md` 或在 `docs/` 中维护更新记录，确保团队可追踪变更。
- 边做边整理开发笔记，捕捉潜在的技术债（例如：`chrome` API mock、日志体系、多语言支持）。
- 约定测试命名规范与运行方式，在 CI/本地一致执行 `npm test`。

## 验收检查清单
- [ ] 测试脚手架可运行，`npm test` 默认通过。
- [ ] 新供应商（示例：DeepSeek）只修改 `providers.config.js` + 文案即可完成全流程配置与调用。
- [ ] `chrome.storage` 中的历史数据迁移成功，密钥自动清洗为密文，未丢失业务字段。
- [ ] 选项页可正确渲染供应商、切换、保存、导入导出、测试连接。
- [ ] Manifest 权限与配置同步，无多余域名，必要的域名全部包含。
- [ ] 文档（用户指南、开发指南、权限说明）已更新，明确说明新增扩展方式与回退方案。

## 后续观察指标
- 新增供应商上线后的失败率（通过日志或手动收集）。
- 配置迁移失败与回退的发生频次。
- 用户反馈中关于权限提示/UI 复杂度的意见，为二次迭代提供依据。

