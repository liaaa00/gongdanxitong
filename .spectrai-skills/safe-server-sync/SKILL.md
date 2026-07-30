---
name: safe-server-sync
description: Safe production/server synchronization workflow that binds the current project to one verified remote target before connecting, understands local feature changes, compares each feature and file with that target, deploys only reproducible commit-derived code, preserves server business data, and verifies every deployed feature. Also covers Git pull, dependencies/package-lock, approved configuration tables, Docker services, health checks, and rollback.
---

# Safe Server Sync

Use this skill for production-like server updates where business data must not be overwritten. The default policy is:

```txt
Server business data is authoritative and must never be overwritten from local data.
Local code becomes authoritative only after the local feature changes are understood, approved, and captured by a reproducible commit or immutable artifact.
Local dependency manifests are authoritative only when dependency changes are explicitly in scope.
Local configuration is authoritative only for explicitly approved configuration tables.
Never do a full database overwrite. Production business rows are read-only protection targets during ordinary synchronization.
```

## Mandatory behavior

1. State the intended scope before writes.
2. Use SpectrAI MCP tools first for remote work; select SSH or WinRM from the trusted project binding and search for that transport's tools before shell fallbacks.
3. Separate changes into code, dependency manifests, configuration data, and business data.
4. Build a local feature-change ledger before comparing or deploying: requirement/feature, changed files, migrations/seeds, dependencies, tests, config tables, and commit status.
5. Compare every ledger item with the server and classify it as same, local-only, server-only, or conflicting before any server write.
6. Never deploy production code from an unidentified dirty working tree. In-scope code must be isolated from unrelated user changes and captured by a commit/tag or an explicitly approved immutable emergency artifact.
7. Back up before any server write.
8. Never assume “config synced” means code is synced; verify both source/runtime code and config data.
9. Never copy local business database rows to production. Business tables may be queried only for protection counts/hashes unless the user explicitly requests a separate data migration.
10. Use transactional SQL with row-count/hash validation for approved configuration changes.
11. Rebuild only the services affected by synced code/dependencies.
12. Validate every in-scope feature on the real runtime, not just file timestamps, hashes, container health, or table counts.
13. Never report “sync complete” while an in-scope local feature is not deployed, the deployment has no reproducible source reference, or server validation is missing. Report rollback paths and all exclusions.
14. Treat every SSH or WinRM profile as a global, cross-project resource. Before any connection or read-only probe, require a trusted binding from the current project to exactly one transport, profile, host, port, and username; never infer these fields from other projects. Deployment root and runtime identity must be known before writes and may be bootstrapped only through read-only checks on a host explicitly bound by the user.

## Data classification

### Usually safe to sync from local, after backup

Configuration tables:

```txt
field_configs
field_permissions
import_template_fields
export_templates
module_configs
module_fields
dispatch_rules
role_action_permissions
action_configs
workflow_configs
detail_view_templates
```

Code/config files:

```txt
backend/src/**
frontend/src/**
backend/src/database/seeds/**
backend/src/database/migrations/**
backend/Dockerfile
backend/docker-entrypoint.sh
frontend/Dockerfile
nginx/*.conf only if explicitly in scope
backend/package.json and backend/package-lock.json only when backend dependency changes are intended
frontend/package.json and frontend/package-lock.json only when frontend dependency changes are intended
docker-compose*.yml only if deployment topology/env wiring changes are explicitly in scope
```

### Never sync local business data during ordinary deployment

Production business/identity/transaction data is server-authoritative and read-only for synchronization protection:

```txt
work_orders
dispatched_orders
order_attachments
attachments
uploads
import_jobs
field_supplement_logs
work_order_field_sync_batches
work_order_field_sync_items
work_order_field_dirty_marks
operation_logs
audit_logs
notifications
users
user_roles
customers
customer_assignees
sessions
tokens
```

Rules:

1. Never upload a local database dump or restore local rows into these tables.
2. Never include these tables in generated sync SQL, even when local data looks newer or cleaner.
3. Read server counts/hashes only to prove they stayed unchanged.
4. A separately requested business-data migration is a different high-risk task and requires explicit scope, mapping, backup, dry-run, and user confirmation; it is not part of code/config synchronization.

Also do not upload:

```txt
.env
local database dumps
node_modules
dist/build caches
uploads
.git unless using an explicit Git workflow
```

## Standard workflow

### 1. Clarify scope

Confirm:

- Which server/environment is target.
- Whether code, dependencies, config tables, or all approved categories are in scope.
- Whether server code should come from a commit-derived local artifact or a specific remote Git branch/commit pull.
- Which feature must be verified, e.g. import template, export template, permissions, UI page, login, file upload.
- Which tables must never be touched.

If the user says “sync everything,” first inventory and explain all local feature changes, compare them with the server, and obtain a reproducible source reference. Then interpret the allowed scope as approved code, explicit dependency manifests, and approved configuration tables only. Preserve server business data.

#### Target identity binding gate

SpectrAI SSH and WinRM profiles are global resources. They are not scoped to the current working directory, repository, session, or project. Complete this gate before `ssh_connect`, `winrm_connect`, connection reuse, or any remote read-only probe.

Create one target identity record:

```txt
Local repository canonical path:
Project identifier:
Environment:
Approved transport: SSH or WinRM
Approved connection profile:
Expected host:
Expected port:
Expected username:
Credential storage: encrypted SpectrAI profile only
Expected deployment root: known or read-only bootstrap pending
Expected runtime markers (compose project, service/container names, image names): known or read-only bootstrap pending
Binding evidence source:
```

Rules:

1. The transport, profile, host, port, and username must come from a project-owned deployment target record or an explicit statement from the user for the current task. A prior verified record is acceptable only when those fields are stored together.
2. Deployment root and runtime markers may be discovered only through read-only commands on the single host explicitly bound by the user. Complete and verify them before backup, upload, Git operations, builds, service changes, or any other write.
3. Never infer project ownership from a profile name or description, `new`/`prod` wording, list order, creation/update time, host recency, a generic deployment path, another session's project, or elimination among candidate profiles.
4. Listing global profiles is discovery only. Before connecting, exact-match the approved transport profile's host, port, and username against the target identity record. A mismatch, ambiguity, or conflicting record is `blocked` before connection.
5. Never try candidate hosts to discover which project they contain. A read-only probe on an unbound host is still cross-project access.
6. After connecting to the single bound target, run read-only identity assertions before any other command: confirm the computer identity, deployment root, compose file/project, expected services or containers, expected image/repository markers, and Git remote or project marker when available. Any mismatch requires immediate disconnect and a `blocked` result.
7. Store no password, private key, token, or secret in the binding record, skill, project files, logs, memory, or report. Credentials belong only in the encrypted SpectrAI connection profile.

Project-specific binding learned from explicit user corrections:

- Local repository: `D:\ai\speceappdate\工单系统`
- Project: work-order system / 工单系统
- Environment: local intranet Linux server
- Approved transport: SSH
- Approved SpectrAI profile: `work-order-local-ssh`
- Expected host and port: `192.168.26.195:22`
- Expected username: `admin`
- Verified deployment root: `/data/apps/work-order-system`
- Verified runtime markers: Docker containers `ticket_backend`, `ticket_frontend`, `ticket_postgres`, and `ticket_nginx`; backend/frontend images use the `work-order-system-*` names.
- Binding evidence: explicit current user correction plus read-only SSH verification of Linux identity, compose working directory, and runtime containers.
- Forbidden targets: SSH profiles `xiangxin-new` and `xiangxin-prod`, their hosts, and deployment paths/runtime identities learned from those other projects. Never connect to, reuse, or probe either profile for this repository.
- The same deployment path may exist on different hosts; never treat `/data/apps/work-order-system` alone as server identity.

### 2. Discover tools and connect

- Search SpectrAI MCP tools for the bound transport: SSH tools for SSH targets, WinRM tools for Windows/WinRM targets.
- List only that transport's global profiles and exact-match the approved profile, host, port, and username from the target identity record.
- Connect to or reuse only that single bound target; never substitute an SSH target for a WinRM binding or vice versa.
- On Windows targets, use WinRM-safe PowerShell and Windows-native paths; do not issue Linux path or shell commands unless the bound host explicitly proves that runtime.
- Run the bound target's read-only identity assertions first, then the remaining read-only checks:

```txt
computer name, OS, and bound host address
deployment root and project marker files
service/process/container names for the actual runtime
docker compose ps and image IDs only when Docker/compose is present
server file hashes for in-scope files
server git status/HEAD if the server is a Git checkout
server table schemas/counts for in-scope tables
```

### 3. Understand and inventory local feature changes

Do not start with “which files should be uploaded.” First determine what the local system actually changed and why.

Run/read:

```txt
git status --short
git diff --name-status
git diff --cached --name-status
git diff for every in-scope modified file
git diff --cached for every staged file
git log --oneline --decorate -10
git ls-files for files that might be ignored, especially package-lock.json
rg --files for relevant source folders when untracked/generated files may matter
recent change records, migrations, seeds, and feature tests
```

Build a feature-change ledger before any server comparison:

```txt
Feature/requirement:
Local behavior expected:
Changed tracked files:
Required untracked files:
Migrations/seeds/config tables:
Dependency/lock-file changes:
Tests proving the behavior:
Git state: committed / staged / unstaged / untracked
Target commit or artifact:
```

Rules:

1. Read the implementation and tests; never infer a feature only from filenames or `git status`.
2. Include staged, unstaged, untracked, and ignored-but-required files. A missing untracked migration, entity, DTO, or lock file means the feature is incomplete.
3. Separate unrelated user changes from the deployment feature. Do not stage, revert, or deploy unrelated work.
4. If no Git state is reliable, reconstruct the ledger from file hashes, code references, tests, and change records before proceeding.
5. Always include feature-related code, not just database configuration. Examples:
   - Import template: `backend/src/modules/imports/*`, `import_template_fields`, `field_configs`.
   - Export template: export service, asset/template files, seeds/migrations, frontend calls, and `export_templates`.
   - Field/permission UI: frontend page/service files plus `field_configs`, `field_permissions`.
   - Dependency feature: manifest, lock file, Docker build behavior, imports, tests, and runtime package check.

For each ledger feature, compare local content with the server and record:

```txt
same: local and server content/behavior match; no content deployment needed
local-only: the approved local content is absent from the server
server-only: preserve unless explicitly replaced
conflicting: both sides differ and ownership is unresolved; stop and resolve ownership
```

These content classifications are independent from Git status. The comparison must cover every file and runtime/config dependency in the feature ledger. A whole-tree archive hash or a successful build does not prove that every intended local feature was identified.

#### Separate Git provenance from server deployment state

For every feature, record four independent axes:

```txt
Local Git state: committed / staged / unstaged / untracked
Server deployment state: deployed / absent / unknown
Reproducibility: commit-derived / immutable emergency artifact / Git-unreproducible / unknown
Server validation: verified / unverified / failed
```

Rules:

1. `uncommitted` describes only the local Git state. Never use it as a synonym for `not deployed`.
2. Determine server deployment state from server source hashes, runtime code, configuration data, migrations, and actual feature behavior. Never infer it from local Git status alone.
3. A server may contain code copied from a dirty working tree that never entered any commit. Report this exactly as `deployed but Git-unreproducible`; do not report it as absent or not deployed.
4. Use precise combinations:
   - `committed + deployed + verified`: deployed and reproducible.
   - `uncommitted + deployed`: deployed but Git-unreproducible; reconciliation is still required.
   - `uncommitted + server unknown`: local Git is dirty and deployment status is unknown.
   - `committed + absent`: committed locally but not deployed.
5. If server inspection has not occurred, say `server deployment state unknown`. Do not turn a local inventory result into a deployment claim.
6. A previously deployed Git-unreproducible feature is not normal completion. Preserve its actual server behavior, capture the difference, and reconcile it into a focused commit before any later production write.

### 4. Reproducible code deployment gate

When code must be synchronized, choose one explicit source-of-truth path. Production code must be reproducible from a recorded commit or immutable artifact.

#### Commit in-scope local features before production writes

Before uploading, building, pulling, or restarting:

1. Complete the feature-change ledger and server comparison.
2. Isolate in-scope changes from unrelated user work. Never use `git add -A` in a mixed working tree.
3. Include every required migration, seed, entity, DTO, test, asset, manifest, and lock file for the feature.
4. Run the feature tests and required regression checks.
5. Create a focused local commit for the approved deployment scope. If the repository policy requires a remote branch, push it before deployment.
6. Record the commit hash and verify the committed file list matches the feature ledger.
7. If the same file contains inseparable unrelated changes, or required ownership is unclear, stop instead of silently deploying the mixed file.

A dirty working tree is allowed to contain unrelated user work, but every in-scope deployed byte must come from the recorded commit/artifact, not from unidentified unstaged content.

#### Use a commit-derived local artifact when the server is not pulling Git

Use local tar/package upload when the approved code is committed locally but the server is not a Git checkout or should not pull a branch.

Rules:

1. Generate the upload manifest from the target commit and feature ledger, not from the current dirty working tree.
2. Build/archive from a clean checkout, temporary worktree, or `git archive <commit>` so unrelated local edits cannot leak into production.
3. Required ignored runtime assets must have an explicit immutable manifest and SHA256; otherwise stop.
4. Embed or record `SOURCE_COMMIT=<hash>` with the deployment/backup record.
5. Exclude unsafe/runtime paths:

```txt
.env
node_modules
dist
build
uploads
local database dumps
*.sql unless it is a reviewed config-only SQL script
.git
.tmp*
.spectrai-worktrees
```

6. Preserve executable scripts and Linux line endings. If a shell entrypoint was edited on Windows, verify/convert CRLF to LF before container startup.
7. After upload, compare SHA256 for every manifest file and confirm no unlisted file was used by the build context.
8. Do not rebuild until all hashes and the source commit match.

#### Use server git pull only when remote Git is the source of truth

Use `git pull` on the server only when:

- The desired changes are committed and pushed.
- The target branch/commit is known and matches the feature ledger.
- The server working tree is clean or server local changes are backed up intentionally.
- The user agrees that remote Git is authoritative.

Before pulling:

```txt
git status --short
git rev-parse --abbrev-ref HEAD
git rev-parse HEAD
git remote -v
git fetch --all --prune
git log --oneline -5 --decorate
git diff --name-status HEAD..origin/<branch>
```

Pull safely:

```txt
git pull --ff-only origin <branch>
```

If fast-forward fails, stop; do not merge/rebase production code silently.

After pulling:

```txt
git rev-parse HEAD
git status --short
hash changed files
```

Then rebuild only affected services.

#### Emergency uncommitted deployment is not normal completion

Only when the user explicitly approves an urgent exception may an uncommitted artifact be deployed. It must have a frozen manifest, full patch, SHA256 list, backup, and a named follow-up commit task. Report the deployment as an emergency exception and incomplete until a reproducible commit exists. Never describe it as fully synchronized or finished.

### 5. Dependency/package-lock guardrails

When `package.json`, `package-lock.json`, npm install behavior, or Docker dependency layers are involved:

1. Treat manifest and lock file as a pair. Do not sync `package.json` without the matching lock file.
2. Check whether lock files are ignored by Git. If backend lock file is required for reproducible deployment, allow/track `backend/package-lock.json` explicitly.
3. Keep dependencies that are imported by runtime code. Example: keep `jszip` if code imports `jszip`.
4. Remove deprecated stub type packages when the runtime package ships its own types. Example: remove `@types/jszip` for `jszip`.
5. Remove unused alternative packages only after searching code/tests. Example: remove `bcryptjs` only if no code imports it.
6. Do not remove native packages that code imports. Example: keep `bcrypt` if auth/users/seeds/tests import `bcrypt`.
7. Regenerate the lock file locally with a safe command such as:

```txt
npm install --package-lock-only --ignore-scripts
```

8. Validate the lock in a clean temporary directory if local `node_modules` is locked or dirty:

```txt
npm ci --ignore-scripts --no-audit --no-fund
```

9. Run project validation after dependency changes:

```txt
npm run build
npm test -- --silent
```

10. If local tests fail because a native binary is missing after `--ignore-scripts`, rebuild only that package, e.g.:

```txt
npm rebuild bcrypt --foreground-scripts
```

### 6. Classify and propose the deployment set

Create a concise feature-level deployment contract before writes:

```txt
Source reference:
- commit/tag/artifact ID

Code sync method:
- commit-derived local artifact OR server git pull --ff-only

In-scope features:
- feature -> local files/config/dependencies -> server difference -> verification

Will upload/pull files:
- exact manifest

Will update configuration tables:
- explicit approved tables and expected rows

Local features intentionally not deployed:
- feature and reason, or none

Server-only behavior/files to preserve:
- feature/file and reason, or none

Will rebuild services:
- exact services

Business data protection baseline:
- read-only counts/hashes for work_orders, dispatched_orders, attachments/uploads, users/customers/logs as applicable
- no local business rows or database dumps will be written
```

Do not proceed if any in-scope feature lacks a source file/config mapping, reproducible source reference, server comparison, or verification method. Do not proceed with writes if the user asked to only discuss.

### 7. Back up server before writes

Create a timestamped backup directory inside the verified deployment root:

```txt
Windows: <verified-deployment-root>\backups\<purpose>_YYYYMMDD_HHMMSS
Linux: <verified-deployment-root>/backups/<purpose>_YYYYMMDD_HHMMSS
```

Do not reuse `/data/apps/work-order-system` on a Windows or unrelated target merely because an earlier deployment used it.

Back up at minimum:

```txt
in-scope source files before overwrite or before git pull
server git status/HEAD before git pull, if applicable
package.json/package-lock.json before overwrite if dependency files are in scope
full database dump when practical
in-scope configuration table dump
current docker-compose files when deployment may be affected
current backend/frontend image tags
hash summaries before change
```

Tag old images:

```txt
work-order-system-backend:<purpose>-backup-YYYYMMDD_HHMMSS
work-order-system-frontend:<purpose>-backup-YYYYMMDD_HHMMSS
```

### 8. Generate configuration SQL safely

Generate targeted SQL from local approved configuration data only.

SQL requirements:

```txt
BEGIN/COMMIT
ON_ERROR_STOP=1
row-count/hash checks
no business table names
no DELETE/TRUNCATE/DROP except temporary ON COMMIT DROP tables
update/insert only approved config tables
rollback on validation failure
```

Before upload/execution, grep the SQL for forbidden names:

```txt
work_orders|dispatched_orders|import_jobs|attachments|operation_logs|audit_logs|users|customers|uploads|DELETE|TRUNCATE
```

If `DROP` appears only as `ON COMMIT DROP` for a temp table, it is acceptable.

### 9. Upload/pull and verify file hashes

If using a commit-derived local artifact, upload only files in its approved manifest. Then compare local and server hashes for every manifest file and verify the recorded source commit.

If using server git pull, verify server `HEAD`, changed files, and file hashes against the expected commit.

For dependency changes, explicitly verify both files:

```txt
backend/package.json
backend/package-lock.json
```

If hashes do not match, stop and fix before rebuilding.

### 10. Execute config SQL

Pipe/copy the SQL to `psql` with `ON_ERROR_STOP=1`.

After execution, verify:

```txt
row counts
hashes of JSON config columns
key fields/templates exist
business table counts and hashes remain unchanged
```

### 11. Rebuild affected services only

Examples:

```txt
docker compose build backend
docker compose up -d backend
```

```txt
docker compose build frontend
docker compose up -d frontend
```

If dependency manifests changed, expect Docker to rerun the dependency install layer. Use a longer timeout for build commands. If the MCP call times out, do not assume failure; check:

```txt
ps -ef | grep -E 'docker compose build|docker build|buildkit|npm ci'
docker images --format '{{.Repository}}:{{.Tag}} {{.ID}} {{.CreatedSince}}'
docker compose ps
```

If a new image exists, continue with `docker compose up -d <service>`.

Avoid unnecessary database or nginx restarts.

### 12. Health checks

Verify:

```txt
docker compose ps
backend health endpoint from inside container or nginx route
nginx/front-end availability
recent backend logs for errors
```

Expected:

```txt
ticket_backend healthy
ticket_frontend running
ticket_postgres healthy
ticket_nginx healthy
```

For dependency changes, also verify runtime manifests inside the container, e.g.:

```txt
docker exec ticket_backend sh -lc "node -e \"const p=require('./package.json'); console.log(p.dependencies)\""
```

Confirm removed packages are absent and required packages remain.

For code changes, also verify runtime code when possible, e.g. grep for a new function/string in the built container or compare a runtime file/hash.

### 13. Result-level validation

Do not rely only on table counts.

Validate the actual feature output:

- Import template: download/parse Excel; compare field count, order, headers, required/conditional-required text, requirements, examples, dropdown options, hidden `__options` sheet.
- Export template: compare selected template, platform route, column count, headers, `order`, `const`, `formula`, `sameAs`, `fieldCode/field_code`, and a real exported Excel if possible.
- Dependency change: confirm build, tests, service health, container package state, and affected feature still works.
- Code sync: confirm server source/runtime code matches local or expected Git commit, then verify the affected feature output.
- Frontend: confirm UI page uses fresh API data and no 401/404/500 occurs.

### 14. Final reconciliation and report

Re-run the feature-change ledger against the deployed server. The final report must state:

```txt
backup directory
rollback image tags
source commit/tag/artifact ID
code sync method: commit-derived artifact or git pull
exact files uploaded/pulled and hash result
per-feature state matrix: local Git state / server deployment state / reproducibility / server validation
in-scope local features deployed: each feature with server verification evidence
local features not deployed: each feature and reason, or none
features already deployed but Git-unreproducible: each feature and reconciliation status, or none
server-only differences preserved: each item and reason, or none
configuration tables changed and expected/actual rows
business table protection counts/hashes before and after
service health
runtime dependency validation, if applicable
rollback instructions
```

Use these completion words precisely:

- `complete`: every approved feature is deployed, tied to a reproducible source reference, and verified on the server.
- `partial`: at least one approved/local feature was not deployed, not verified, or is already deployed but Git-unreproducible; list it explicitly.
- `emergency exception`: a newly deployed artifact has no commit yet under explicit urgent approval; never call this complete.
- `blocked`: no server write occurred because a gate failed.

Never use a general statement such as “server sync succeeded” to imply that all local modifications were deployed. Never use `uncommitted` to imply `not deployed`; always report local Git state and server deployment state separately.

## Rollback patterns

Code/dependency file rollback:

```txt
restore source/package files from backup directory
rebuild affected service
```

Git pull rollback:

```txt
git reset --hard <previous_HEAD>
# only after confirming no server-only changes must be preserved
rebuild affected service
```

Image rollback:

```txt
docker tag work-order-system-backend:<backup-tag> work-order-system-backend:latest
docker compose up -d backend
```

Configuration rollback:

```txt
psql -v ON_ERROR_STOP=1 < config_tables_before.sql
```

Full database rollback is last resort only and requires explicit confirmation because it can revert real production work.

## Stop conditions

Stop before any connection, connection reuse, or remote probe if:

- The target identity record lacks a trusted evidence source or does not bind the current repository to exactly one transport, profile, host, port, and username.
- The selected transport/profile/host is inferred from global profile metadata, recency, naming, list order, another project/session, or elimination rather than exact trusted binding evidence.
- The selected profile or host is explicitly excluded for the current repository.

After connecting to the bound target, disconnect and stop if any computer, deployment-root, compose, container/service, process, image/repository, Git remote, or project marker identity assertion conflicts with the binding.

Stop before any server write if:

- The deployment root or runtime identity is still unknown or unverified after the read-only identity bootstrap.

- The local feature-change ledger is incomplete or a modified file's business purpose is unknown.
- An approved local feature has not been compared with the server file/config/runtime behavior.
- Required in-scope code is staged, unstaged, untracked, or ignored but is not captured by the target commit/artifact.
- The deployment manifest does not exactly match the target commit plus explicitly approved immutable assets.
- Unrelated user changes cannot be safely separated from the deployment feature.
- The sync would copy, replace, delete, or overwrite production business rows from local data.
- The server schema differs unexpectedly.
- A SQL validation fails or would update an unexpected row count.
- Backups cannot be created.
- A file hash mismatch remains after upload/pull.
- Server git pull is requested but the server working tree is dirty or fast-forward is impossible.
- A dependency lock file is missing, ignored, or inconsistent with package.json.
- A package is about to be removed but code/tests still import it.
- Health or feature-level validation fails after rebuild.
- The deployed runtime cannot be tied back to the recorded commit/artifact.
- A feature's server deployment state was inferred only from local Git status instead of server source/runtime/config/behavior evidence.
- Existing Git-unreproducible server code has not been inventoried and reconciled before a new production write.
- The user requested discussion only, not execution.

If a gate fails after a write, roll back and report `partial` or `emergency exception`; never hide the failure behind a successful file transfer or healthy container.
