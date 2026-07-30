# 阶段1派单引擎 integration 最终验收报告

- 任务：`3ab220a7-677d-4529-bb22-659bddde5e18`
- 日期：2026-07-27
- integration HEAD：`a699585`
- 后端返工来源：`4408cdf`
- 结论：**GO**

## 契约硬点

1. 第二套人员表已移除：`backend/src` 无 `province-handler.entity.ts`、`province_handlers`、`pickByProvinceAndBusinessType` 残留；`province-handler.seed.ts` 将 `<moduleCode>__<province>` 写入现有 `module_handlers`。
2. `HandlerPickerService.pick()` 第四参数为 `{ province?, mappingSource?: 'sheet4' | 'sheet5' }`，Sheet4/Sheet5 入口独立。
3. 稳定模块码为 `in_service_single_business` 与 `out_of_province_dispatch`；省外增员、减员共享后者。

## 测试证据

| 范围 | 结果 | 说明 |
|---|---:|---|
| Sheet4/Sheet5 正式契约套件 | 15/15 通过 | 普通省份、湖北/江苏/山西/山东/福建双人主备顺序、跨表隔离、停用主办、在职与省外增减员集成、续签/离职兼容 |
| 旧派单回归 | 3 suites 通过；31 passed，1 historical skipped | `dispatch-engine.spec.ts`、`dispatch-engine-p7.spec.ts`、`onboarding-dispatch.helper.spec.ts` |
| 根回归 `回归测试.ps1 -SkipBuild` | 通过 | 前端关键业务 10 files / 109 tests passed；按参数跳过前后端 build |
| Git 状态 | clean | 临时 Jest 配置与依赖联接均已清理 |

测试中的 HandlerPicker 空主办 warn 为预期负向用例；Vite/jsdom 警告为既存非阻断输出。

## 放行结论

后端 P0 返工已对齐正式架构契约，Sheet4/Sheet5 派单、双人省份默认接单、数据隔离及旧派单回归均通过。阶段1从 NO-GO 转为 **GO**，可以进入阶段2。
