/**
 * GitHub repository + issue management tools. Registered against the DSH
 * tool registry; each tool wraps one REST endpoint and renders a compact
 * summary for the model.
 *
 * @module dsh-github-manager/repo-issues
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { type GitHubIdentity, githubListAll, githubRequest } from './github-client.ts'

/** Common params that name the target repo. */
interface RepoRef {
  owner: string
  repo: string
}

function assertRepo(ref: RepoRef): void {
  if (!ref.owner || !ref.repo) throw new Error('owner and repo are required')
  if (!/^[-a-zA-Z0-9_.]+$/.test(ref.owner) || !/^[-a-zA-Z0-9_.]+$/.test(ref.repo)) {
    throw new Error('owner and repo may only contain word characters, hyphens, and dots')
  }
}

/** Register repository + issue management tools. */
export function registerRepoIssueTools(ctx: Context, identity: GitHubIdentity): void {
  const log = ctx.logger('github-manager:repo-issues')

  // ---------- github_list_repos ----------
  ctx.tools.register(defineTool({
    name: 'github_list_repos',
    description: 'List repositories for the authenticated user or a named owner. Returns name, visibility, default branch, and star count.',
    parameters: {
      owner: { type: 'string', description: 'A user/org login to list. Omit to list the authenticated user own repos.' },
      type: {
        type: 'string',
        enum: ['all', 'owner', 'public', 'private', 'member'],
        description: 'Filter the repo list. Defaults to all.',
      },
      perPage: { type: 'integer', description: 'Max items to return (1-100). Defaults to 30.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          repos: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                name: { type: 'string', required: true },
                fullName: { type: 'string', required: true },
                private: { type: 'boolean', required: true },
                defaultBranch: { type: 'string', required: true },
                stars: { type: 'integer', required: true },
                description: { type: 'string' },
                url: { type: 'string', required: true },
              },
            },
          },
          count: { type: 'integer', required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: 'Found ' + value.count + ' repositories:' + (value.repos ?? []).map((r) => '\n- ' + r.fullName + ' [' + (r.private ? 'private' : 'public') + '] ' + r.defaultBranch + ' star:' + r.stars).join('') }],
    },
    async execute(args) {
      const perPage = clampInt(args.perPage, 30, 1, 100)
      const path = args.owner
        ? '/users/' + args.owner + '/repos?per_page=' + perPage + (args.type ? '&type=' + args.type : '')
        : '/user/repos?per_page=' + perPage + (args.type ? '&type=' + args.type : '')
      const list = await githubListAll<RepoSummary>(identity, path, perPage)
      const repos = list.map(toRepoSummary)
      log.debug('listed repos', { count: repos.length })
      return { repos, count: repos.length }
    },
    presentCall: (args) => ({ card: 'generic', title: 'List repos' + (args.owner ? ' for ' + args.owner : ''), kind: 'other', rawInput: args }),
  }))

  // ---------- github_get_repo ----------
  ctx.tools.register(defineTool({
    name: 'github_get_repo',
    description: 'Fetch detailed metadata for a single repository: visibility, default branch, description, homepage, parent (for forks), and size.',
    parameters: {
      owner: { type: 'string', required: true, description: 'The repository owner (user or org login).' },
      repo: { type: 'string', required: true, description: 'The repository name.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { type: 'string', required: true },
          fullName: { type: 'string', required: true },
          private: { type: 'boolean', required: true },
          defaultBranch: { type: 'string', required: true },
          description: { type: 'string' },
          homepage: { type: 'string' },
          stars: { type: 'integer', required: true },
          forks: { type: 'integer', required: true },
          openIssues: { type: 'integer', required: true },
          size: { type: 'integer', required: true },
          parent: { type: 'string' },
          url: { type: 'string', required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: 'Repository ' + value.fullName + ': ' + (value.private ? 'private' : 'public') + ', default branch ' + value.defaultBranch + ', star:' + value.stars + ' forks ' + value.forks + ', open issues ' + value.openIssues + '.' + (value.parent ? ' Fork of ' + value.parent + '.' : '') + ' ' + value.url }],
    },
    async execute(args) {
      const ref = args as RepoRef
      assertRepo(ref)
      const res = await githubRequest<RepoDetail>(identity, 'GET', '/repos/' + ref.owner + '/' + ref.repo)
      return toRepoDetail(res.body)
    },
  }))

  // ---------- github_create_repo ----------
  ctx.tools.register(defineTool({
    name: 'github_create_repo',
    description: 'Create a new repository. If owner is an organization you belong to, create it there; otherwise it is created under the authenticated user. Requires the repo scope.',
    parameters: {
      name: { type: 'string', required: true, description: 'The repository name.' },
      owner: { type: 'string', description: 'An organization login to create the repo under. Omit for the authenticated user.' },
      description: { type: 'string', description: 'A short repository description.' },
      private: { type: 'boolean', description: 'true for a private repo, false for public. Defaults to false (public).' },
      autoInit: { type: 'boolean', description: 'true to initialize with an empty README. Defaults to false.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          fullName: { type: 'string', required: true },
          private: { type: 'boolean', required: true },
          url: { type: 'string', required: true },
          dryRun: { type: 'boolean', required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: value.dryRun ? 'Would create repository ' + value.fullName + ' (' + (value.private ? 'private' : 'public') + '). Dry-run.' : 'Created repository ' + value.fullName + ' (' + (value.private ? 'private' : 'public') + '). ' + value.url }],
    },
    async execute(args) {
      const body = {
        name: args.name,
        description: args.description ?? '',
        private: args.private ?? false,
        auto_init: args.autoInit ?? false,
      }
      if (identity.dryRun) {
        return { fullName: (args.owner ?? '(self)') + '/' + args.name, private: body.private, url: '(dry-run)', dryRun: true }
      }
      const path = args.owner ? '/orgs/' + args.owner + '/repos' : '/user/repos'
      const res = await githubRequest<{ full_name: string; private: boolean; html_url: string }>(identity, 'POST', path, { body })
      return { fullName: res.body.full_name, private: res.body.private, url: res.body.html_url, dryRun: false }
    },
  }))

  // ---------- github_list_issues ----------
  ctx.tools.register(defineTool({
    name: 'github_list_issues',
    description: 'List issues in a repository. Filter by state (open/closed/all), labels, and assignee. Returns number, title, state, author, labels, and assignees.',
    parameters: {
      owner: { type: 'string', required: true, description: 'The repository owner.' },
      repo: { type: 'string', required: true, description: 'The repository name.' },
      state: {
        type: 'string',
        enum: ['open', 'closed', 'all'],
        description: 'Filter by issue state. Defaults to open.',
      },
      labels: { type: 'string', description: 'Comma-separated list of label names to filter by (e.g. bug,ui).' },
      assignee: { type: 'string', description: 'Filter by assignee login, or * for assigned issues, or omit for any.' },
      perPage: { type: 'integer', description: 'Max items to return (1-100). Defaults to 30.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          issues: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                number: { type: 'integer', required: true },
                title: { type: 'string', required: true },
                state: { type: 'string', required: true },
                author: { type: 'string', required: true },
                labels: { type: 'array', items: { type: 'string' } },
                assignees: { type: 'array', items: { type: 'string' } },
                url: { type: 'string', required: true },
              },
            },
          },
          count: { type: 'integer', required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: 'Found ' + value.count + ' issues:' + (value.issues ?? []).map((i) => '\n- #' + i.number + ' [' + i.state + '] ' + i.title + ((i.labels ?? []).length ? ' (' + (i.labels as string[]).join(', ') + ')' : '')).join('') }],
    },
    async execute(args) {
      const ref = args as RepoRef
      assertRepo(ref)
      const perPage = clampInt(args.perPage, 30, 1, 100)
      let path = '/repos/' + ref.owner + '/' + ref.repo + '/issues?state=' + (args.state ?? 'open') + '&per_page=' + perPage
      if (args.labels) path += '&labels=' + encodeURIComponent(args.labels)
      if (args.assignee) path += '&assignee=' + encodeURIComponent(args.assignee)
      const list = await githubListAll<IssueSummary>(identity, path, perPage)
      const issues = list.filter((i) => i.pull_request === undefined).map(toIssueSummary)
      return { issues, count: issues.length }
    },
  }))

  // ---------- github_create_issue ----------
  ctx.tools.register(defineTool({
    name: 'github_create_issue',
    description: 'Open a new issue in a repository. Requires the issues scope. Title is required; body, labels, and assignees are optional.',
    parameters: {
      owner: { type: 'string', required: true, description: 'The repository owner.' },
      repo: { type: 'string', required: true, description: 'The repository name.' },
      title: { type: 'string', required: true, description: 'The issue title.' },
      body: { type: 'string', description: 'The issue body (Markdown).' },
      labels: { type: 'array', items: { type: 'string' }, description: 'Label names to apply.' },
      assignees: { type: 'array', items: { type: 'string' }, description: 'User logins to assign.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          number: { type: 'integer', required: true },
          title: { type: 'string', required: true },
          url: { type: 'string', required: true },
          dryRun: { type: 'boolean', required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: value.dryRun ? 'Would open issue #' + value.number + ': ' + value.title + '. Dry-run.' : 'Opened issue #' + value.number + ': ' + value.title + '. ' + value.url }],
    },
    async execute(args) {
      const ref = args as RepoRef
      assertRepo(ref)
      const body = { title: args.title, body: args.body ?? '', labels: args.labels ?? [], assignees: args.assignees ?? [] }
      if (identity.dryRun) {
        return { number: -1, title: args.title, url: '(dry-run)', dryRun: true }
      }
      const res = await githubRequest<{ number: number; title: string; html_url: string }>(identity, 'POST', '/repos/' + ref.owner + '/' + ref.repo + '/issues', { body })
      return { number: res.body.number, title: res.body.title, url: res.body.html_url, dryRun: false }
    },
    presentCall: (args) => ({ card: 'generic', title: 'Create issue in ' + args.owner + '/' + args.repo, kind: 'other', rawInput: args }),
  }))

  // ---------- github_update_issue ----------
  ctx.tools.register(defineTool({
    name: 'github_update_issue',
    description: 'Update an issue: change title/body/state/labels/assignees. Provide only the fields to change. Use state closed to close.',
    parameters: {
      owner: { type: 'string', required: true, description: 'The repository owner.' },
      repo: { type: 'string', required: true, description: 'The repository name.' },
      number: { type: 'integer', required: true, description: 'The issue number.' },
      title: { type: 'string', description: 'New title (omit to keep).' },
      body: { type: 'string', description: 'New body (omit to keep).' },
      state: { type: 'string', enum: ['open', 'closed'], description: 'New state (omit to keep).' },
      labels: { type: 'array', items: { type: 'string' }, description: 'Replace labels (omit to keep).' },
      assignees: { type: 'array', items: { type: 'string' }, description: 'Replace assignees (omit to keep).' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          number: { type: 'integer', required: true },
          state: { type: 'string', required: true },
          url: { type: 'string', required: true },
          dryRun: { type: 'boolean', required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: value.dryRun ? 'Would update issue #' + value.number + ' to ' + value.state + '. Dry-run.' : 'Updated issue #' + value.number + ' to ' + value.state + '. ' + value.url }],
    },
    async execute(args) {
      const ref = args as RepoRef
      assertRepo(ref)
      const body: Record<string, unknown> = {}
      if (args.title !== undefined) body.title = args.title
      if (args.body !== undefined) body.body = args.body
      if (args.state !== undefined) body.state = args.state
      if (args.labels !== undefined) body.labels = args.labels
      if (args.assignees !== undefined) body.assignees = args.assignees
      if (identity.dryRun) {
        return { number: args.number, state: args.state ?? '(unchanged)', url: '(dry-run)', dryRun: true }
      }
      const res = await githubRequest<{ number: number; state: string; html_url: string }>(identity, 'PATCH', '/repos/' + ref.owner + '/' + ref.repo + '/issues/' + args.number, { body })
      return { number: res.body.number, state: res.body.state, url: res.body.html_url, dryRun: false }
    },
    presentCall: (args) => ({ card: 'generic', title: 'Update issue #' + args.number, kind: 'other', rawInput: args }),
  }))

  // ---------- github_comment_issue ----------
  ctx.tools.register(defineTool({
    name: 'github_comment_issue',
    description: 'Add a comment to an issue or pull request. Requires the issues scope.',
    parameters: {
      owner: { type: 'string', required: true, description: 'The repository owner.' },
      repo: { type: 'string', required: true, description: 'The repository name.' },
      number: { type: 'integer', required: true, description: 'The issue or PR number.' },
      body: { type: 'string', required: true, description: 'The comment body (Markdown).' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'integer', required: true },
          url: { type: 'string', required: true },
          dryRun: { type: 'boolean', required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: value.dryRun ? 'Would post a comment. Dry-run.' : 'Posted comment #' + value.id + '. ' + value.url }],
    },
    async execute(args) {
      const ref = args as RepoRef
      assertRepo(ref)
      if (identity.dryRun) return { id: -1, url: '(dry-run)', dryRun: true }
      const res = await githubRequest<{ id: number; html_url: string }>(identity, 'POST', '/repos/' + ref.owner + '/' + ref.repo + '/issues/' + args.number + '/comments', { body: { body: args.body } })
      return { id: res.body.id, url: res.body.html_url, dryRun: false }
    },
    presentCall: (args) => ({ card: 'generic', title: 'Comment on #' + args.number, kind: 'other', rawInput: args }),
  }))
}

/** Clamp an optional integer arg into [min,max] with a default. */
function clampInt(value: unknown, def: number, min: number, max: number): number {
  const n = typeof value === 'number' ? value : def
  if (!Number.isFinite(n)) return def
  return Math.max(min, Math.min(max, Math.trunc(n)))
}

/** Normalized repo summary used by the list tool. */
interface RepoSummary {
  name: string
  full_name: string
  private: boolean
  default_branch: string
  stargazers_count: number
  description: string | null
  html_url: string
}

function toRepoSummary(r: RepoSummary): { name: string; fullName: string; private: boolean; defaultBranch: string; stars: number; description: string; url: string } {
  return {
    name: r.name,
    fullName: r.full_name,
    private: r.private,
    defaultBranch: r.default_branch,
    stars: r.stargazers_count,
    description: r.description ?? '',
    url: r.html_url,
  }
}

/** Normalized repo detail returned by the get tool. */
interface RepoDetail {
  name: string
  full_name: string
  private: boolean
  default_branch: string
  description: string | null
  homepage: string | null
  stargazers_count: number
  forks_count: number
  open_issues_count: number
  size: number
  parent: { full_name: string } | null
  html_url: string
}

function toRepoDetail(r: RepoDetail): { name: string; fullName: string; private: boolean; defaultBranch: string; description: string; homepage: string; stars: number; forks: number; openIssues: number; size: number; parent: string; url: string } {
  return {
    name: r.name,
    fullName: r.full_name,
    private: r.private,
    defaultBranch: r.default_branch,
    description: r.description ?? '',
    homepage: r.homepage ?? '',
    stars: r.stargazers_count,
    forks: r.forks_count,
    openIssues: r.open_issues_count,
    size: r.size,
    parent: r.parent?.full_name ?? '',
    url: r.html_url,
  }
}

/** Normalized issue summary returned by GitHub. */
interface IssueSummary {
  number: number
  title: string
  state: string
  user: { login: string } | null
  labels: { name: string }[]
  assignees: { login: string }[]
  pull_request?: unknown
  html_url: string
}

function toIssueSummary(i: IssueSummary): { number: number; title: string; state: string; author: string; labels: string[]; assignees: string[]; url: string } {
  return {
    number: i.number,
    title: i.title,
    state: i.state,
    author: i.user?.login ?? '',
    labels: i.labels.map((l) => l.name),
    assignees: i.assignees.map((a) => a.login),
    url: i.html_url,
  }
}
