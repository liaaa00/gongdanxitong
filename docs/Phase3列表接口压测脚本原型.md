# Phase 3 列表接口压测脚本原型

目标：在 Phase 3 工单创建、提交、派发、权限过滤链路完成后，为主工单列表和子工单列表建立性能基线。

## 1. k6 脚本：主工单 + 子工单列表

保存为 `perf/phase3-list.k6.js` 后执行：

```bash
k6 run -e BASE_URL=http://localhost:8080 -e ACCESS_TOKEN=<token> perf/phase3-list.k6.js
```

```js
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  scenarios: {
    work_orders_list: {
      executor: 'constant-vus',
      vus: 30,
      duration: '1m',
      exec: 'workOrdersList',
    },
    dispatched_orders_list: {
      executor: 'constant-vus',
      vus: 30,
      duration: '1m',
      exec: 'dispatchedOrdersList',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.001'],
    'http_req_duration{api:work-orders}': ['p(95)<500'],
    'http_req_duration{api:dispatched-orders}': ['p(95)<600'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';
const TOKEN = __ENV.ACCESS_TOKEN;

function headers() {
  return {
    Authorization: `Bearer ${TOKEN}`,
    'Content-Type': 'application/json',
  };
}

export function workOrdersList() {
  const res = http.get(
    `${BASE_URL}/api/work-orders?page=1&pageSize=20&keyword=张`,
    { headers: headers(), tags: { api: 'work-orders' } },
  );
  check(res, {
    'work orders status 200': (r) => r.status === 200,
    'work orders has traceId': (r) => Boolean(r.json('traceId')),
    'work orders has list': (r) => Array.isArray(r.json('data.list')),
  });
  sleep(1);
}

export function dispatchedOrdersList() {
  const res = http.get(
    `${BASE_URL}/api/dispatched-orders?page=1&pageSize=20&moduleCode=contract`,
    { headers: headers(), tags: { api: 'dispatched-orders' } },
  );
  check(res, {
    'dispatched status 200': (r) => r.status === 200,
    'dispatched has traceId': (r) => Boolean(r.json('traceId')),
    'dispatched has list': (r) => Array.isArray(r.json('data.list')),
    'no raw id card': (r) => !/\d{17}[0-9Xx]/.test(r.body),
  });
  sleep(1);
}
```

## 2. autocannon 快速回归

### 2.1 主工单列表
```bash
autocannon -c 50 -d 60 \
  -H "Authorization: Bearer %ACCESS_TOKEN%" \
  "http://localhost:8080/api/work-orders?page=1&pageSize=20"
```

### 2.2 子工单列表
```bash
autocannon -c 50 -d 60 \
  -H "Authorization: Bearer %ACCESS_TOKEN%" \
  "http://localhost:8080/api/dispatched-orders?page=1&pageSize=20&moduleCode=contract"
```

## 3. 数据准备要求

| 数据 | 建议规模 | 说明 |
|---|---:|---|
| 主工单 | 100,000 | 覆盖 draft/processing/completed/returned |
| 子工单 | 300,000 | 每主单 2~4 条 |
| 用户/角色 | 50+ | 包含 admin、salesperson、各后道角色 |
| module_handlers | 每模块 3+ | 覆盖 fixed/RR/LB/pool |
| 字段权限 | 5 场景完整矩阵 | 确认过滤成本 |

## 4. 验收阈值

- `/api/work-orders?page=1&pageSize=20`：p95 < 500ms，错误率 < 0.1%。
- `/api/dispatched-orders?page=1&pageSize=20`：p95 < 600ms，错误率 < 0.1%。
- 响应必须有 `traceId`。
- 列表中不得出现 hidden 字段；masked 字段不得出现明文身份证/银行卡/薪资。
