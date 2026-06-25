# 合同导出临时恢复目录处置确认

任务 ID：f3c52075-bcf4-4c6c-994a-91347457634c

## 核对范围

只读核对目录：`reports/tmp-bundle-restore-contract-export`

本次未删除、未移动、未修改该目录内任何文件。

## 核对结论

该目录是此前为尝试从 `.spectrai-worktrees-archive-20260602.bundle` 恢复合同导出 Excel 模板而创建的临时 Git clone 目录。由于 bundle 的 remote HEAD 不存在，目录没有检出工作树文件。

当前目录内容特征：

- 顶层仅发现 `.git/` 与 `.spectrai-worktrees/`。
- `.spectrai-worktrees/` 下仅发现空的 `integrations/` 目录。
- 未发现普通工作区文件。
- 未发现 `.xlsx` 文件。
- `git status --short --untracked-files=all` 无输出。
- `git ls-files` 无输出。
- 仅保留 12 个 remote refs 的 Git 元数据。

因此，该目录不包含本轮交付必要文件，也不包含已实际用于交付的标准 Excel 资产。最终交付使用的是工作区内 `backend/src/assets/export-templates/` 下的模板文件，而不是该临时目录。

## 目录/文件 -> 是否交付 -> 理由

| 目录/文件 | 是否交付 | 理由 |
| --- | --- | --- |
| `reports/tmp-bundle-restore-contract-export/` | 否 | 临时恢复工作目录，非业务代码、非报告产物、非交付资产。 |
| `reports/tmp-bundle-restore-contract-export/.git/` | 否 | bundle clone 产生的 Git 元数据，仅含 remote refs；不应作为交付内容。 |
| `reports/tmp-bundle-restore-contract-export/.spectrai-worktrees/` | 否 | 临时 clone 中的 SpectrAI 元数据目录，当前无普通交付文件。 |
| `reports/tmp-bundle-restore-contract-export/.spectrai-worktrees/integrations/` | 否 | 空目录，无交付内容。 |
| `reports/tmp-bundle-restore-contract-export/**/*.xlsx` | 否/不存在 | 只读搜索未发现 xlsx 文件；不包含合同导出模板资产。 |

## 处置建议

建议：**保留并列入未交付排除项**，不要纳入本轮交付清单、验收报告或发布包。

后续如需清理：仅在 Leader 或用户明确授权后，再删除 `reports/tmp-bundle-restore-contract-export/` 整个临时目录。删除前应再次确认路径解析仍位于当前工作区 `reports/` 下，避免误删其他目录。

## 风险说明

- 当前保留该目录不会影响业务代码运行或导出模板读取，因为系统读取路径为 `backend/src/assets/export-templates/`。
- 该目录内含 Git 元数据，占用空间和交付噪音是主要影响。
- 若打包规则会包含 `reports/tmp-*`，应在交付时显式排除该目录。
