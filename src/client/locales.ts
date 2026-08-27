/**
 * Card copy for the GitHub manager settings card, in both shipped locales.
 * The namespace is registered into the client locale service by the browser
 * half; the slot entry declares it, so the renderer binds t for these keys.
 */

export const zh = {
  title: 'GitHub 仓库管理',
  description: 'AI 自动管理通道：仓库、Issue、PR、文件、标签、话题/标签页、发布与搜索。开关即时增减工具。',
  enabledLabel: '启用 GitHub 通道',
  enabledHint: '关闭时，全部 GitHub 工具从智能体表面注销；开启即恢复，无需重启。',
  tokenLabel: '访问令牌（Token）',
  tokenHint: '细粒度或个人经典令牌，仅写入不回显；留空则读取环境变量 GH_TOKEN / GITHUB_TOKEN。',
  tokenPlaceholder: '输入新令牌以保存（不显示已存值）',
  tokenLink: '打开令牌页面 ↗',
  tokenGuide: '创建流程：GitHub → Settings → Developer settings → Personal access tokens → Generate new token；fine-grained 按需勾选 Contents / Issues / Pull requests / Topics（建仓库另需 Administration）。',
  baseUrlLabel: 'API 根地址',
  baseUrlHint: 'GitHub Enterprise 部署时改写，例如 https://ghe.example.com/api/v3。',
  webUrlLabel: '站点根地址',
  webUrlHint: '用于拼接结果里人类可读链接的站点根。',
  timeoutLabel: '请求超时（毫秒）',
  timeoutHint: '每个 REST 请求的中断上限，至少 1000。',
  dryRunLabel: '演练模式（dry-run）',
  dryRunHint: '开启后，变更类工具只描述将执行的动作，不发出任何写请求。',
  save: '保存',
  expand: '展开',
  collapse: '折叠',
  saving: '保存中…',
  discard: '放弃修改',
  unsaved: '未保存',
  overridden: '已覆盖',
  reset: '还原',
  invalidNumber: '请输入数字',
  readOnly: '当前文档为只读，无法保存。',
  saveFailed: '上次保存未被接受，请修正后重试。',
} as const

export const en = {
  title: 'GitHub Manager',
  description: 'AI auto-management channel: repos, issues, PRs, files, labels, topics/tags, releases, search. The switch adds or drops the tools live.',
  enabledLabel: 'Enable GitHub channel',
  enabledHint: 'When off, every GitHub tool is unregistered from the agent surface; on restores them without a restart.',
  tokenLabel: 'Access token',
  tokenHint: 'Fine-grained or classic PAT. Write-only: the stored value is never echoed. When empty, GH_TOKEN / GITHUB_TOKEN is read from the environment.',
  tokenPlaceholder: 'Type a new token to save (existing value is not shown)',
  tokenLink: 'Open token page ↗',
  tokenGuide: 'Create one: GitHub → Settings → Developer settings → Personal access tokens → Generate new token; for fine-grained grant Contents / Issues / Pull requests / Topics (plus Administration to create repos).',
  baseUrlLabel: 'API root',
  baseUrlHint: 'Point at GitHub Enterprise Server, e.g. https://ghe.example.com/api/v3.',
  webUrlLabel: 'Web root',
  webUrlHint: 'Site root used to build human-facing links in results.',
  timeoutLabel: 'Request timeout (ms)',
  timeoutHint: 'Abort bound per REST request; at least 1000.',
  dryRunLabel: 'Dry-run mode',
  dryRunHint: 'When on, mutating tools describe the action they would take and issue no write.',
  save: 'Save',
  expand: 'Expand',
  collapse: 'Collapse',
  saving: 'Saving…',
  discard: 'Discard',
  unsaved: 'Unsaved',
  overridden: 'Overridden',
  reset: 'Reset',
  invalidNumber: 'Enter a number',
  readOnly: 'This document is read-only; saving is disabled.',
  saveFailed: 'The last save was not accepted. Correct and retry.',
} as const

/** Every copy key the card renders. */
export type GitHubManagerLocaleKey = keyof typeof zh
