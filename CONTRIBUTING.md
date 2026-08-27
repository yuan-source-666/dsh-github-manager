# Contributing

欢迎贡献 `dsh-github-manager`。

## 开发流程

```sh
npm install          # 或 pnpm install
npm run build        # tsc 产出 lib/ + lib/types/，再打包浏览器半 lib/client.js
npm test             # 两个冒烟测试：宿主半 + 浏览器半（stub ctx / mock fetch，无需网络与密钥）
npm run typecheck:client
```

从源码直载调试（免构建），在 deepseek-harness 仓库根目录：

```sh
# 先把 load.dev.patch.yml 中的 <PATH-TO> 替换为你的检出目录（绝对路径）
pnpm dsh web --patch <PATH-TO>/dsh-github-manager/load.dev.patch.yml
```

## 规范约定

本插件遵循 DSH 社区插件规范：

- `package.json` 的 `dsh.bundle.patch` 指向组合层 patch（`cordis.patch.yml`）；`dsh.client` 声明浏览器半注入。
- 所有部署可变参数都是 Config 字段，默认值写在 schema 里，不硬编码；secret 字段用 `role('secret')`。
- 工具用 `defineTool` 注册：`parameters` 推导并校验，`execute` 返回 `output.schema` 声明的规范值。
- 仓库中不放构建产物（`lib/`）与打包件（`*.tgz`），git 安装时由 `prepare` 脚本编译。
- 提交 PR 前请确保 `npm test` 通过。

## 提交

- 直接开 Issue / PR，描述动机与影响面。
