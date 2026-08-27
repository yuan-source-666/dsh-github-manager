# Changelog

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 与语义化版本。

## [1.1.0] - 2026-08-28

### Added
- 新增「仓库话题 / Git 标签 / 发布」接口组，共 7 个工具：`github_get_topics`、`github_update_topics`（整组替换，按 GitHub 规则规范化去重）、`github_list_tags`、`github_list_releases`、`github_get_latest_release`、`github_create_release`（标签不存在时自动创建）、`github_update_release`。
- 全部写侧工具遵循主开关与 dry-run 防护；工具面由 20 个扩展到 27 个，冒烟测试与已安装探针同步更新。

## [1.0.1] - 2026-08-27

### Fixed
- npm `files` 白名单补入 `README_EN.md`：安装副本内的中英 README 互链不再是死链。

## [1.0.0] - 2026-08-27

### Added
- 按 DSH 社区插件规范正式作为社区发布件整理：补充 LICENSE（MIT）、CHANGELOG、SECURITY、CONTRIBUTING。
- `package.json` 补齐 `repository` / `bugs` / `homepage` / `author` 元数据与 `test` 脚本；`files` 收录 LICENSE。
- 发布版本 1.0.0。

### Changed
- 测试与探针不再依赖任何机器绝对路径：`tests/smoke-test.mjs` 改为相对本文件加载 `lib/index.js`；`tests/installed-probe.mjs` 改为从 `os.homedir()` 推导安装路径，并支持 `DSH_GITHUB_MANAGER_PROBE` 环境变量覆盖。
- `load.dev.patch.yml` 中的本机绝对路径改为 `<PATH-TO>` 占位符模板（有意不可直接使用，使用前替换为你自己的检出目录）。
- README：安装示例指向真实仓库地址，架构一节如实描述 `inject = ['tools']`。

## [0.2.2]
- 打包产物与安装验证迭代（含 `tests/installed-probe.mjs` 对已安装副本的运行时探针）。

## [0.2.1]
- Web 设置卡片修正与双语词表（`src/client/locales.ts`）。

## [0.2.0]
- 新增 Web 设置卡片（浏览器半 + 宿主半）：主开关热注销/重注册 20 个工具，token 以 secret 角色写入不回显。

## [0.1.0]
- 初始版本：20 个 GitHub REST 工具（仓库 / Issue / PR / 分支 / 文件 / 标签 / 搜索），统一 HTTP 客户端、dry-run 预览与分页归一化。
