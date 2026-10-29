# Prism Extensions 市场（官方索引 tap）

Prism Studio 的扩展/行业工作流市场索引。**本仓库就是市场本身**：`extensions/` 放扩展包，
`index.json` 是目录索引（CI 校验并同步），Prism 客户端在 设置·扩展 →「市场」里浏览安装。

- 扩展作者指南：[Prism Studio · docs/extensions-authoring.md](https://github.com/yaChen920213/prism-studio/blob/main/docs/extensions-authoring.md)
- 机制与安全模型（声明式权限 / 沙箱 / 安装审批）：[phase193 任务书](https://github.com/yaChen920213/prism-studio/blob/main/docs/plans/phase193-extension-sandbox.md)

## 信任模型（重要）

本索引是**发现层，不是信任根**：安装仍走 Prism 的三层信任锚——manifest 权限清单人工批准 +
内容白名单扫描 + Chromium 沙箱运行。`manifestSha256` 由 CI 钉住内容（索引与包体不一致即拒装）。

## 投稿（PR）

1. Fork 本仓库，在 `extensions/<你的扩展名>/` 放入 `prism-extension.json` + 代码（遵循作者指南）。
2. 本地自检：`node scripts/validate-extension.mjs extensions/<你的扩展名>`。
3. 提 PR。CI 会校验 manifest/权限词表/文件白名单，并要求 `index.json` 同步（可直接运行
   `node scripts/validate-extension.mjs --write-index` 生成）。
4. 合并后所有 Prism 用户的「市场」可见（客户端刷新索引）。

升级 = 改版本号 + 更新 `index.json` 对应条目（含新 `manifestSha256`）；**新增权限**会在用户端
触发再审批（旧版继续可用，Chrome MV3 同款语义）。
