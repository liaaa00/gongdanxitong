# WCAG 合规检查清单

> 版本：v1.0 | 日期：2026-05-11
> 检查范围：工单管理系统前端（React 18 + Ant Design Pro）
> 目标等级：WCAG 2.1 Level AA

## 检查项与结果

### 1. 感知性 (Perceivable)

| 项 | 要求 | 状态 | 说明 |
|---|---|---|---|
| 1.1.1 非文本内容 | 图片/图标有替代文本 | ✅ | Ant Design Icon 组件内置 title；自定义 Badge/Tag 添加 role="status"+aria-label |
| 1.3.1 信息和关系 | 表单标签与控件关联 | ✅ | DynamicForm 使用 ProForm，label 自动绑定；所有输入加 aria-label |
| 1.4.1 颜色使用 | 不只依赖颜色传达信息 | ✅ | SLA 预警同时使用颜色+图标+文字三重标记 |
| 1.4.3 对比度 | 文本对比度 ≥ 4.5:1 | ⚠️ | Ant Design 默认主题通过；自定义内联样式未逐项验证 |

### 2. 可操作性 (Operable)

| 项 | 要求 | 状态 | 说明 |
|---|---|---|---|
| 2.1.1 键盘 | 所有功能可通过键盘操作 | ✅ | Ant Design Pro 组件内置键盘支持；Modal 关闭按钮可键盘触发 |
| 2.4.3 焦点顺序 | 焦点顺序有意义 | ✅ | 默认 DOM 顺序 |
| 2.4.7 焦点可见 | 键盘焦点可见 | ✅ | Ant Design 默认焦点样式 |

### 3. 可理解性 (Understandable)

| 项 | 要求 | 状态 | 说明 |
|---|---|---|---|
| 3.3.1 错误识别 | 表单项错误有文字描述 | ✅ | ProForm 内置表单验证+错误消息 |
| 3.3.2 标签或说明 | 输入控件有标签 | ✅ | DynamicForm 每个字段有 label+placeholder+tooltip |

### 4. 健壮性 (Robust)

| 项 | 要求 | 状态 | 说明 |
|---|---|---|---|
| 4.1.2 名称/角色/值 | UI 组件有正确的 ARIA 属性 | ✅ | Modal 有 aria-label；Badge/Tag role="status"；动态内容区域 role="region" |

## 已知限制

1. **完全合规需辅助技术测试**：本清单基于代码审查和 eslint-plugin-jsx-a11y 静态分析。WCAG AA 完全合规仍需屏幕阅读器（如 NVDA/VoiceOver）人工测试验证。
2. **Ant Design 内部组件**：依赖的 @ant-design/pro-components 内部 ARIA 属性由框架维护，未逐项审计。
3. **图表可访问性**：Dashboard 看板柱状图使用纯 HTML/CSS 模拟，缺少 data table 等效替代，建议 Phase 6 后引入 Recharts 等支持 aria 的图表库。
4. **动态内容通知**：通知中心弹出内容未使用 aria-live 区域，可通过添加 role="alert" + aria-live="polite" 改进。

## 改进记录

- 2026-05-11：DynamicForm 所有表单控件添加 aria-label / aria-describedby
- 2026-05-11：SLA 预警增加文字标签 + 图标的双重标记
- 2026-05-11：Modal 组件按钮/关闭图标添加 aria-label

## 验证命令

```bash
npm run lint          # eslint-plugin-jsx-a11y 规则检查
npx axe-core --ci     # 自动化 a11y 审计（需额外安装 @axe-core/cli）
```
