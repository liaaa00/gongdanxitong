# 社保已接单修改审批态测试口径对齐报告

## 任务
- 任务 ID：a14c468e-224e-4afc-9289-fae012d09987
- 口径：已接单社保子工单业务员字段变更进入 `modify_pending`，属于需求 6 的正确新预期；若旧测试期望直接修改，应更新测试/夹具，不改业务实现。

## 检查结论
- 已检查 `backend/test/social-insurance-state-flow.spec.ts`。
- 当前测试已对齐新口径：`routes salesperson field edit after social insurance acceptance into modify approval and keeps withdraw/void approval-bound` 用例断言已接单社保子单字段修改后状态为 `DispatchedOrderStatus.MODIFY_PENDING`，并断言父工单 `extraData.social_base` 未被直接改写、`workOrderRepo.save` 未被调用。
- 减员社保子单同类锁定规则已有覆盖。
- 未修改业务实现；未发现仍需改动的旧测试断言。

## 改动文件 -> 需求编号 -> 必要性 -> 验证证据
| 改动文件 | 需求编号 | 必要性 | 验证证据 |
|---|---|---|---|
| reports/a14c468e-224e-4afc-9289-fae012d09987-social-state-test-alignment.md | 需求 6 | 输出本任务检查与验证清单；代码/测试口径已对齐，无需修改业务实现或测试断言 | `npx jest --config ./test/jest-unit.json --runInBand --detectOpenHandles --verbose test/social-insurance-state-flow.spec.ts` 通过：1 个 test suite、4 个 tests 全部 passed |

## 相关测试验证
```text
PASS test/social-insurance-state-flow.spec.ts (10.267 s)
  social insurance state flow guards (0603)
    √ allows salesperson to directly edit, withdraw and void social insurance before acceptance (14 ms)
    √ routes salesperson field edit after social insurance acceptance into modify approval and keeps withdraw/void approval-bound (5 ms)
    √ applies the same lock rules to resignation social insurance reduction orders (2 ms)
    √ keeps retry/waiting batch feedback in processing instead of adding extra failure states (4 ms)

Test Suites: 1 passed, 1 total
Tests:       4 passed, 4 total
```

## 范围控制
- 仅新增任务报告文件。
- 未修改业务实现。
- 未修改与该口径无关的测试、夹具、权限、菜单、模板字段。
