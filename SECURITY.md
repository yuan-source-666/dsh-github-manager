# Security Policy

## 凭据处理

- **令牌只进不出**：GitHub 令牌通过设置卡片写入，字段以 Schemastery `secret` 角色注册——任何跨越网络边界的读取都会将其脱敏，值永不回显；留空时回退读取 `GH_TOKEN` / `GITHUB_TOKEN` 环境变量。
- **不要提交令牌**：不要把令牌写进 `cordis.patch.yml` 或任何会被提交的文件；需要文件级配置时，写入私有的用户 patch 层。
- **无遥测**：插件只向你配置的 `baseUrl`（默认 `https://api.github.com`）发起请求，不存在任何第三方上报。
- **最小权限**：建议使用 fine-grained token，并把权限锁定到需要管理的仓库集合。

## Dry-run 防护

变更型工具在 `dryRun: true` 时只描述将执行的动作，不做任何写入。评审敏感仓库的自动化流程时建议先开启。

## 报告漏洞

请通过 [GitHub Security Advisories](https://github.com/yuan-source-666/dsh-github-manager/security/advisories/new) 私报，避免公开披露未修复的问题。
