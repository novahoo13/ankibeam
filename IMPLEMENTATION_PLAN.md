## Stage 1: 定位占位符未替换原因
**Goal**: 弄清选项页面在多语言环境下未替换 `$VARIABLE$` 占位符的根本原因
**Success Criteria**: 能复现问题并明确具体文件与函数的缺陷
**Tests**: `npm test -- options`（若无对应测试，则记录需要补充的验证步骤）
**Status**: Complete

## Stage 2: 修复国际化占位符替换逻辑
**Goal**: 让所有语言的选项页面正确显示变量值
**Success Criteria**: 相关模板渲染逻辑或文案资源替换正确，手动验证通过
**Tests**: 待补充的集成测试或现有端到端检查
**Status**: Complete

## Stage 3: 验证与文档更新
**Goal**: 确认修复在所有语言下生效并更新必要文档
**Success Criteria**: 实际页面显示正常，计划文件状态更新，必要时补充 README/CHANGELOG
**Tests**: 手动验证 `options/index.html` 在多语言切换下表现
**Status**: Complete
