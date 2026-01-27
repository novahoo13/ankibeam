# Options 页面性能/稳定性改进方案

## 背景
- 打开 options 页后 CPU 飙升并拖慢整个浏览器。
- 现象与多次 storage 写入、全量解密、DOM 重建和全页 reload 叠加有关。

## 目标
- 在不改功能的前提下，显著降低 options 页的 CPU/内存占用，避免影响其他标签页。
- 让其他开发者可直接按步骤落地修复。

## 优先级与负责人
- P0：Storage 变更解密风暴、全页 reload、模板列表重渲染。
- P1：模板卡大块 innerHTML、无缓存翻译、深比较。
- P2：tab 动画引发的重排、小型监听管理。
- 推荐顺序：P0 → P1 → P2。

---
## 具体改动方案

### 1) 节流 / 拆解 storage 变更解密 (P0)
- 位置：`options/options.js:995-1036`, `utils/storage.js:598-855`。
- 问题：每次 `chrome.storage.onChanged` 都 `loadConfig()`，对每个 provider 做 PBKDF2(100k)+AES 解密，AI 健康检查/写入会高频触发，造成 CPU 飙升。
- 方案：
  1. 在 options 页维护一个「解密缓存」：启动时 `loadConfig()` 一次，后续 onChanged 仅增量更新变更字段；对 apiKey 字段保持密文，不在 UI 回填时解密。
  2. onChanged 回调增加 500ms debounce，并在执行前判断 `changes.ankiWordAssistantConfig` 是否与当前 `currentConfig` 有实质差异（浅比较顶层标志 + 版本号）。
  3. 若仍需解密，限制为「按需」：仅在需要显示的 provider 上解密其 apiKey，其他 provider 跳过。
- 验收：打开 options 页，触发 5 次 `updateProviderHealth` 后，主线程 CPU 峰值下降 >50%，没有卡顿；功能保持一致。

### 2) 移除全页 reload，改局部刷新 (P0)
- 位置：`options/options.js:1234,1284,1560,2687` 等。
- 问题：setTimeout + `window.location.reload()` 重载整页，重复解析 3k+ 行 JS + 全量解密/渲染。
- 方案：
  1. 抽一个 `refreshUI({ sections })`：按场景重绘必要区域（如模板列表、语言、样式预览、状态 Toast）。
  2. 导入/重置/语言切换成功后，改为：更新 `currentConfig`，调用对应局部渲染函数，滚动到顶部并弹 toast，移除 reload。
  3. 对语言切换：调用 `resetLocaleCache()` + `whenI18nReady()` 后重新跑 `localizePage()` 和 `loadAndDisplayConfig()`，不 reload。
- 验收：执行导入/重置/语言切换，页面不再刷新且状态正确；操作间隔 <1s 时也无排队刷新。

### 3) 模板列表渲染增量化 (P0)
- 位置：`options/options.js:2277-2315`, `renderTemplateCard:2324-2438`。
- 问题：`cardsGrid.innerHTML=""` + 全量重建，卡片多时解析 75 行字符串/卡，含 3 个内联 SVG。
- 方案：
  1. 维护 `currentTemplateIds`，diff 新旧列表：新增 -> createCard；删除 -> remove；更新 -> patch DOM（文本与按钮态）。
  2. 将内联 SVG 抽到 `<template>` 或外部 sprite，用 `<use>` 引用，减少字符串体积。
  3. 对卡片事件改为事件委托：在 `cardsGrid` 挂一次 `click` 处理 set-default/edit/delete，避免重复绑定。
- 验收：100 张模板下切换/保存时无明显掉帧；Chrome Performance 中 DOM 节点创建数较当前下降 >60%。

### 4) 翻译结果缓存 (P1)
- 位置：`options/options.js:61-62` 调用 `translate()`。
- 问题：同 key 多次调用无缓存，init 时数百次。
- 方案：在 options 页内包一层 LRU 或简单 Map cache (`getTextCached`)；language 改变时清空 cache。
- 验收：首次进入与切 tab 的 `translate` 调用次数减少显著（可在 DevTools Performance 中对函数计数对比）。

### 5) 避免深比较/大 JSON stringify (P1)
- 位置：`options/options.js:1022-1035`。
- 问题：模板库变化检测用 `JSON.stringify` 全量比较。
- 方案：比较 `version`、`defaultTemplateId`、`templates` 的 `updatedAt` 最大值 + 数量哈希（如 `templates.length` + `checksum` of ids）；无变更则跳过刷新。
- 验收：频繁 saveTemplate 时不再每次重绘列表；深拷贝/字符串化次数下降。

### 6) 动画触发的重排 (P2)
- 位置：`options/options.html:32-44`。
- 问题：`display:none → block` + `transform` 触发 reflow。
- 方案：改为 `visibility:hidden; position:absolute; pointer-events:none; opacity` 切换，或用 `hidden` + `transition` on opacity only；统一高度容器避免 layout thrash。
- 验收：切换 tab 时 Layout/Style 开销下降，FPS 稳定。

### 7) 事件清理与安全网 (P2)
- 位置：field selection 渲染 `options/options.js:2931-2981` 等。
- 方案：
  - 改为父级委托或复用节点；若保留重渲染，确保渲染前移除旧 `templateEditorState.selectedFields` 引用中已不存在的监听。
  - 在 `DOMContentLoaded` 里注册的按钮监听可加 idempotent guard（布尔标记）避免重复绑定。
- 验收：多次打开/关闭表单后，`getEventListeners` 中监听数不增长。

---
## 验证与度量
- 在 Chrome Performance 录制 20s：
  - 重点看 Main thread CPU、JS Heap、Node count、Layout/Style 时间。
  - 对比修复前后（相同操作：进入页面→切换 3 个 tab→导入配置→保存模板）。
- 加一个轻量自测脚本（可放 `tests/options-perf.md`，描述手动步骤和期望指标）。

## 交付物
- 完成后提交 PR，附：
  - 变更点简述（对应上面编号）。
  - 性能录屏或 Performance trace 截图。
  - 手动验证清单结果。
