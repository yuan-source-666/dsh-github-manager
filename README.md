# dsh-github-manager

**中文** | [English](README_EN.md)

一个 [DeepSeek Harness](https://github.com/deepseek-harness/deepseek-harness) 插件，为 AI agent 提供 **GitHub 仓库自动管理通道**。它注册一组工具，让 agent 通过 GitHub REST API 自动管理仓库、Issue、Pull Request、分支、文件、标签和搜索。

> 本插件按 **DSH 社区插件规范** 分发：bundle（`dsh.bundle.patch`）+ Web 设置卡片（`dsh.client`），仓库已打上 `dsh-plugin` topic 供社区发现。

## 工具清单

| 工具 | 作用域 | 说明 |
| --- | --- | --- |
| `github_ping` | 连接性 | 验证通道与令牌是否有效，报告当前用户与剩余配额 |
| `github_list_repos` | 仓库 | 列出认证用户或指定 owner 的仓库 |
| `github_get_repo` | 仓库 | 获取单个仓库的详细元数据 |
| `github_create_repo` | 仓库 | 创建新仓库（个人或组织） |
| `github_list_issues` | Issue | 列出仓库的 issue，按状态/标签/指派过滤 |
| `github_create_issue` | Issue | 在仓库中开启新 issue |
| `github_update_issue` | Issue | 更新 issue（标题/正文/状态/标签/指派） |
| `github_comment_issue` | Issue | 给 issue 或 PR 添加评论 |
| `github_list_pulls` | PR | 列出仓库的 PR |
| `github_get_pull` | PR | 获取单个 PR 的完整元数据 |
| `github_create_pull` | PR | 创建 PR |
| `github_merge_pull` | PR | 合并 PR（merge/squash/rebase） |
| `github_list_branches` | 分支 | 列出仓库的分支 |
| `github_read_file` | 文件 | 读取仓库中的文本文件 |
| `github_write_file` | 文件 | 创建或更新文件（通过 commits API 版本化） |
| `github_delete_file` | 文件 | 删除文件 |
| `github_list_labels` | 标签 | 列出仓库的标签 |
| `github_create_label` | 标签 | 创建标签 |
| `github_search_code` | 搜索 | 跨 GitHub 搜索代码 |
| `github_search_issues` | 搜索 | 搜索 issue 与 PR |

所有变更型工具在 `dryRun: true` 时描述将要执行的操作而不真正执行——适合在评审或预发环境中安全验证流程。

## 安装

插件以 **bundle** 形式分发。在 DSH 中安装到一个 profile：

```sh
# 从本地目录安装
dsh plugin --profile demo add ./dsh-github-manager

# 从 GitHub 仓库安装（锁定 commit 更安全）
dsh plugin --profile demo add github:yuan-source-666/dsh-github-manager#<sha>
```

> 从 git 安装会拉取源码，`prepare` 脚本会编译 `lib/`。pnpm ≥10 需要在 profile 的 `pnpm-workspace.yaml` 中显式允许构建：
>
> ```yaml
> allowBuilds:
>   dsh-github-manager: true
> ```
>
> 只对源码可信的包授权。详见 [DSH 打包与安装文档](https://deepseek-harness.github.io/deepseek-harness/develop/basic/publish/)。

验证安装：

```sh
dsh --profile demo --dump-config   # 看到 "# == dsh-github-manager" 层
dsh --profile demo
```

## 设置界面（Web）

安装后打开 http://127.0.0.1:3080 → **设置 → Plugins → 可配置**，会看到「GitHub 仓库管理」卡片，可以像其他插件一样直接操控：

- **启用开关**：关闭时，20 个 GitHub 工具从模型工具面**即时注销**；打开即时恢复——**无需重启**。
- **访问令牌**：写-only 密码框，输入即保存；存储值永不经网络回显，也从不显示在读取结果里。留空则回退到 `GH_TOKEN` / `GITHUB_TOKEN` 环境变量。
- API / 站点根地址、请求超时、dry-run 开关：逐项修改、逐项保存；「已覆盖」标记显示哪些字段写进了用户层，「还原」让该项重新继承组合层。

保存走 DSH 设置命名空间 `dsh-github-manager`（revision 围栏写入），token 以 secret 角色注册、读取时脱敏。改完立即生效：下一次工具调用就用新令牌 / 新超时 / 新 dry-run 状态。

### 获取 GitHub 令牌（简版引导）

1. 打开令牌页面：https://github.com/settings/tokens （Enterprise 换成你的站点根路径，卡片里的「打开令牌页面」链接会自动跟随你在卡片中设置的 Web 根地址）。
2. **Generate new token** → 推荐 **fine-grained**（可把权限锁到具体仓库），或 classic。
3. 按需授予目标仓库的权限：`Contents`（文件读写）、`Issues`（issue 管理）、`Pull requests`（PR 管理）；建仓库另需 `Administration`；只读搜索/元数据 `Metadata` 即够。
4. 生成后复制令牌，粘贴进卡片「访问令牌」框并保存——令牌只写一次、永不回显；不想存的话删掉该项，插件会回退到 `GH_TOKEN` / `GITHUB_TOKEN` 环境变量。

## 配置（无头部署）

CLI/无 Web 部署也可以在 profile 的 `cordis.patch.yml` 中直接覆盖默认值（无需改动插件包）：

```yaml
- id: dsh-github-manager
  name: dsh-github-manager
  config:
    enabled: true          # 主开关：false 时不注册任何工具
    # token 不要写进文件——用设置卡片或环境变量
    baseUrl: 'https://api.github.com'
    webUrl: 'https://github.com'
    timeoutMs: 30000
    dryRun: false
```

| 字段 | 默认值 | 说明 |
| --- | --- | --- |
| `enabled` | `true` | 主开关；关闭即从模型工具面注销全部 20 个工具 |
| `token` | （无） | 个人访问令牌；设置界面写入为持久首选，留空则读 `GH_TOKEN` / `GITHUB_TOKEN` |
| `baseUrl` | `https://api.github.com` | REST API 根（GitHub Enterprise 改这里） |
| `webUrl` | `https://github.com` | 面向人类的链接根 |
| `timeoutMs` | `30000` | 单次请求超时（毫秒） |
| `dryRun` | `false` | 为 true 时，变更型工具只描述动作而不执行 |

### 所需 GitHub 权限

如果是 fine-grained token，按需授权下列权限：

- 仓库元数据：`Contents: read`（所有读取工具）
- 仓库：`Administration: write`（`github_create_repo`）
- Issue：`Issues: write`（`github_create_issue`、`github_update_issue`、`github_comment_issue`）
- PR：`Pull requests: write`（`github_create_pull`、`github_merge_pull`）
- 文件：`Contents: write`（`github_write_file`、`github_delete_file`）
- 标签：`Issues: write` 或 `Metadata: read` + 仓库管理员（`github_create_label`）

## 开发

```sh
# 1) 类型检查 + 构建（生成 lib/*.js 与 lib/types/*.d.ts）
pnpm install
pnpm run build

# 2) 运行时冒烟测试（stub ctx + mock fetch，无需网络与密钥；两个用例都相对定位，任意目录可跑）
node tests/smoke-test.mjs
node tests/client-smoke.mjs
# 或：pnpm run test

# 3) 在 DeepSeek Harness 里从源码加载（绝对路径 patch，免构建）
cd /path/to/deepseek-harness
pnpm dsh web --patch <本目录>/load.dev.patch.yml
```

打开 http://127.0.0.1:3080 后可以对模型说：
用 github_ping 检查 GitHub 通道是否连通；或者
列出 deepseek-harness/deepseek-harness 仓库的 open issues，把标记为 bug 且未指派的逐条添加 Triage 评论。

## 架构

插件遵循 DSH 约定：

- **函数形式插件**，`inject = ['tools']` 声明对工具注册表的依赖；设置命名空间通过 `installSettingsSection` 绑定，与浏览器卡片半按同一命名空间配对。
- **设置卡片对（Web）**：宿主半用 `installSettingsSection` 注册命名空间 `dsh-github-manager`；浏览器半把卡片注册进 `settings.plugin.item` 键控槽（key = 同一命名空间字符串），设置界面自动配对。开关是**活**的：enabled 变化触发注销/重注册，不重启进程。
- **Config 通过 Schemastery schema 定义**，所有可调参数都是配置字段，默认值写在 schema 里，不硬编码；token 以 secret 角色注册，读取脱敏、写入不回显。
- **每个工具用 `defineTool` 注册**：`parameters` 由 DSL 推导并校验 `args`；`execute` 返回 `output.schema` 声明的规范值；`output.render` 把规范值转成面向模型的文本。
- **通过 `ctx` 注册的内容在插件卸载时自动清理**（HMR 友好）。
- 底层是单一 GitHub REST 客户端，统一认证、分页、错误归一化，所有工具共享；设置提交时**就地更新**其身份对象，令牌轮换下一个请求即生效。

## License

MIT
