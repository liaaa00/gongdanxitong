# 阶段3+4 QA 回归报告

- 验证分支：`team/aac039a0-47e8-42ab-b763-f718eb86c924/integration`
- 验证提交基线：`282013b`
- 报告状态：阶段3实现尚未全部合入，当前为条件性 NO-GO
- 更新时间：2026-07-27

## 阶段3 单测

| 检查项 | 结果 | 证据 |
|---|---|---|
| Sheet5 增员/减员枚举与省份映射 | PASS | `backend/test/out-of-province-qa.spec.ts` |
| 福建双人省份：排前默认接单人 | PASS | Sheet5 主办 `isBackup=false` 优先 |
| 福建双人省份：排后转派备选不首派 | PASS | 主办停用时返回空，不提升备选 |
| Sheet4/Sheet5 同省数据隔离 | PASS | 命名键 `<module>__<province>` |
| 省外/北仑业务数据 `businessScope` 隔离 | BLOCKED | 阶段3后端 Entity/DTO/Service 尚未合入 integration |

## 阶段3 E2E（省外表单暂缓）

`backend/test/e2e/out-of-province-dispatch.e2e.spec.ts` 已建立跳过骨架，待以下实现合入后执行：

1. 北仑/省外切换器 localStorage 持久化；
2. 省外增减员导入路由与后端接口；
3. 导入后 `businessScope=out_of_province`，且列表不显示北仑数据；
4. 增员、减员均通过 Sheet5 映射派单；
5. `OutOfProvinceForm` 保留 TODO，不能用入职/离职模板替代。

## 阶段4 全局回归

| 检查项 | 结果 |
|---|---|
| 根目录 `回归测试.ps1 -SkipBuild` | PASS：10 files / 109 tests |
| 前端 production build | PASS |
| 后端 production build | PASS |
| 后端工单/派单/在职/权限/通知/看板/导入定向回归 | PASS：10 suites / 121 tests |
| 前端角色菜单/通知/路由/在职定向回归 | PASS：4 files / 49 tests |
| 阶段3合入后的完整 `回归测试.ps1` | BLOCKED：等待阶段3合入 |
| 北仑工单不受影响 | 基线通过；需阶段3合入后复测 |

## 通过项计数

- 已执行通过：6 个 Sheet5 QA 测试、121 个后端阶段4定向测试、158 个前端回归测试、双端 build
- 跳过：3 个 E2E 骨架
- 阻断：businessScope 隔离和阶段3 E2E，归属阶段3后端/前端合入链路

## 遗留问题与归属

- **backend**：省外增减员 Entity/DTO/Service/Controller、businessScope 持久化与查询过滤、Sheet5 种子尚未进入当前 integration HEAD。
- **frontend**：BusinessScopeSwitcher、省外列表/导入路由尚未进入当前 integration HEAD。
- **业务侧**：需提供菜鸟模板和浙江自签字段清单后才能实现 `OutOfProvinceForm`；Sheet4/Sheet5 真实名册仍待提供。

## 结论

**NO-GO（条件性）**：派单底座与阶段4基线回归通过，但阶段3功能尚未合入，无法完成 businessScope 与 E2E 最终验收。待 backend/frontend 阶段3提交合入后重跑阻断项并更新结论。
