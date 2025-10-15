# 阶段 6 验证指引

## 自动化回归

- 运行 `node --test "tests/**/*.test.js"`，覆盖 `utils/i18n.js` 的 locale 判定、`localizePage` DOM 适配、`translate`/`createI18nError` 回退逻辑，以及 Prompt 引擎的默认模板快照。
- 如需仅重跑 i18n 场景，可执行 `node --test tests/i18n.test.js`。

## 手动检查流程

1. 在 `chrome://extensions` 启用开发者模式并重新加载扩展。
2. 依次在 Chrome 的语言设置中将界面语言切换为 `zh-CN`、`zh-TW`、`ja`、`en`，每次切换后重载 popup/options 页面。
3. 验证以下界面：弹窗主流程、设置页（包含错误提示、API 测试结果）、字段映射弹层、AI 报错提示。
4. 通过设置为非支持语言（例如法语）确认所有界面回退到英语，并在控制台检查未捕获的键名。

## 翻译维护基线

- 新增界面字符串时，按照 `页面_区域_用途` 命名规则创建键名，例如 `popup_status_ready`。
- 同步更新四个 `messages.json` 并补充 `description` 与 `placeholders` 描述，确保翻译上下文一致。
- 录入翻译后执行自动化回归，若输出内容含 `{0}` 样式插值，需在测试或文档示例中补充对应样例。
- 保留此次验证中收集的人工检查记录，并在未来版本复用该流程作为冒烟清单。
