> 【归档横幅】本目录只作历史留痕，不是规则来源；当前规则与口径见根目录 AGENTS.md 与 docs/AI修改前必读.md，端口以 config/env.ps1 为唯一事实源。
# Work Order API Query Workflow

This package is for another AI agent to answer work-order questions from the live API. It is a read-only query workflow, not a browser automation and not a data sync job.

## 1. Package contents

- `tmp_work_order_api.ps1`: login, credential access, pagination, filters, and detail lookup.
- `tmp_work_order_api_WORKFLOW.md`: this handoff and operating procedure.

Default API target:

```text
http://192.168.26.195:8080
```

Health endpoint:

```text
GET /api/health
```

Authentication:

```text
POST /api/auth/login
Authorization: Bearer <accessToken>
```

The script never prints the password or access token.

## 2. Safety boundary

Allowed API operations:

- `POST /api/auth/login` only for authentication.
- `GET /api/auth/me`.
- `GET /api/work-orders`.
- `GET /api/work-orders/:id`.

Do not call create, update, submit, delete, approve, accept, complete, return, reassign, import, or other write endpoints.

Do not put a password or token in chat, source code, command arguments, logs, Git, Markdown, JSON, or environment files.

The saved credential is stored by Windows Credential Manager under:

```text
SpectrAI.WorkOrderApi:192.168.26.195:8080
```

It is available only to processes running under the same Windows account. A different computer or Windows account must run the one-time Save action again.

## 3. One-time setup

From the project root:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\tmp_work_order_api.ps1" -Action Status
```

If `saved` is `false`, run:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\tmp_work_order_api.ps1" -Action Save
```

A local credential dialog appears. The user enters the API username and password there, never in chat. The script validates login and a read-only work-order query before saving the credential.

Do not run Save on every request. Run it only when there is no saved credential or the administrator password has changed.

## 4. Query decision flow

For every user question:

1. Identify whether the user wants a count, a list, or one work-order detail.
2. Extract explicit filters only. Do not invent names, dates, statuses, or order types.
3. Query the live API. Do not answer from an old result when current data was requested.
4. For counts, use Summary output.
5. For candidate lists, use Items output with the narrowest supported filters.
6. For one exact work order, first find its list item and UUID, then call the detail lookup.
7. If multiple candidates match, present the minimal disambiguating fields and ask which one.
8. Answer only the requested fields and include the query time.
9. Distinguish an empty field from a failed query. Never turn null or missing values into assumptions.
10. Mask ID cards, mobile numbers, and other personal data unless the user explicitly requests the full authorized value.

## 5. Supported list filters

Pass filters through `-QueryString`. URL-encode values when necessary.

| User intent | Query parameter | Accepted value |
|---|---|---|
| Entry/onboarding orders | `orderType` | `onboarding` |
| Exit/resignation orders | `orderType` | `resignation` |
| Main work-order status | `status` | See status codes below |
| General search | `keyword` | Employee name, ID card, or order number |
| Exact/partial order number | `orderNo` | Text |
| Customer code | `customerCode` | Text |
| Customer name | `customerName` | Text |
| Employee name | `employeeName` | Text |
| ID card | `idCardNo` | Text |
| Initiator | `createdByName` | Text |
| Created from | `createdAfter` | ISO 8601 date/time |
| Created through | `createdBefore` | ISO 8601 date/time |
| Customer UUID | `customerId` | UUID |
| Creator UUID | `createdBy` | UUID |

Main work-order status codes:

- `draft`
- `pending`
- `processing`
- `completed`
- `returned`
- `withdraw_pending`
- `withdrawn`
- `void_pending`
- `void`

The script controls `page` and `pageSize`. Never include either in QueryString.

## 6. Commands

Current summary:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\tmp_work_order_api.ps1" -Action Fetch -Output Summary
```

All current list items:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\tmp_work_order_api.ps1" -Action Fetch -Output Items
```

Filter by order type and status:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\tmp_work_order_api.ps1" -Action Fetch -Output Items -QueryString "orderType=onboarding&status=processing"
```

Filter by order number:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\tmp_work_order_api.ps1" -Action Fetch -Output Items -QueryString "orderNo=ON202607"
```

Filter by employee name:

```powershell
$name = [Uri]::EscapeDataString("employee name")
$query = "employeeName=$name"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\tmp_work_order_api.ps1" -Action Fetch -Output Items -QueryString $query
```

Filter by creation range:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\tmp_work_order_api.ps1" -Action Fetch -Output Items -QueryString "createdAfter=2026-07-01T00%3A00%3A00%2B08%3A00&createdBefore=2026-07-31T23%3A59%3A59%2B08%3A00"
```

Read one complete work-order detail after obtaining its UUID:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\tmp_work_order_api.ps1" -Action Fetch -WorkOrderId "<UUID>"
```

Detail output includes the full `extraData` and dispatched/sub-order summaries.

Remove the locally saved credential:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\tmp_work_order_api.ps1" -Action Remove
```

## 7. Response handling

The script unwraps the API envelope and returns compact JSON.

Summary output contains:

- `authenticatedUser`
- `expectedTotal`
- `fetchedCount`
- `orderTypes`
- `statuses`

Items output contains all matched list records after automatic pagination.

Detail output contains the selected main work order, full business data in `extraData`, and its dispatched/sub-order summaries.

Always compare `expectedTotal` and `fetchedCount` for a complete list query. If they differ, report an incomplete query instead of presenting the result as complete.

## 8. Error recovery

### 401 Unauthorized

Likely causes:

- The saved password changed.
- The account was disabled.
- The API rejected the new login.
- A token became invalid during the request.

Action:

1. Do not retry with guessed passwords.
2. Run `-Action Save` once so the user can update the credential in the local dialog.
3. Retry the original read-only query.

### 403 Forbidden

Likely causes:

- The authenticated account lacks permission.
- The account must change its password first.
- The requested record is outside the account's scope.

Action:

- Report the permission error.
- Do not bypass authorization and do not switch accounts automatically.

### 400 Validation error

The filter name or value is invalid. Correct the query from the supported filter table. Do not silently remove user-requested filters.

### 404 Not found

The UUID does not exist or is not visible to the current account. Report that exact distinction only when the API response provides it; otherwise say it was not found or not accessible.

### Network/5xx

Report that the live API query failed. Do not answer from stale data unless the user explicitly accepts cached information.

## 9. Answer format

A useful answer should state:

- What was queried.
- The live query time.
- The number of matches.
- The requested fields.
- Any ambiguity, missing value, permission limitation, or incomplete pagination.

Do not expose raw tokens, passwords, full response dumps, or unrelated personal data.

## 10. Handoff prompt for another AI

Use the following instruction with the package:

```text
You are a read-only work-order information assistant. Work in the directory that contains tmp_work_order_api.ps1 and follow tmp_work_order_api_WORKFLOW.md exactly.

When I ask for work-order information:
1. Translate only my explicit conditions into supported API filters.
2. Run the PowerShell helper to query the live API.
3. Use Summary for counts, Items for candidate matching, and WorkOrderId for full detail.
4. If one exact order is requested, query the list first, obtain its UUID, and then query detail.
5. Never call any API write endpoint.
6. Never request or print a password/token in chat. If the stored credential is missing or invalid, run -Action Save so I enter it in the local dialog once.
7. Mask unrelated personal information and answer only the fields I requested.
8. State the live query time and do not guess when data is missing.
```
