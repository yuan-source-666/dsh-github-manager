/**
 * Pull request management tools. Wraps the GitHub pull request endpoints:
 * list, get, create, merge, and comment.
 *
 * @module dsh-github-manager/pulls
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { type GitHubIdentity, githubListAll, githubRequest } from './github-client.ts'

/** Owner/repo pair shared by every PR tool. */
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

/** Register pull request management tools. */
export function registerPullTools(ctx: Context, identity: GitHubIdentity): void {
  const log = ctx.logger('github-manager:pulls')

  // ---------- github_list_pulls ----------
  ctx.tools.register(defineTool({
    name: 'github_list_pulls',
    description: 'List pull requests in a repository. Filter by state (open/closed/all) and head branch. Returns number, title, state, draft flag, author, and head/base branches.',
    parameters: {
      owner: { type: 'string', required: true, description: 'The repository owner.' },
      repo: { type: 'string', required: true, description: 'The repository name.' },
      state: { type: 'string', enum: ['open', 'closed', 'all'], description: 'Filter by PR state. Defaults to "open".' },
      head: { type: 'string', description: 'Filter by head branch, e.g. "feature:topic" (org:branch for forks).' },
      base: { type: 'string', description: 'Filter by base branch, e.g. "main".' },
      perPage: { type: 'integer', description: 'Max items to return (1-100). Defaults to 30.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          pulls: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                number: { type: 'integer', required: true },
                title: { type: 'string', required: true },
                state: { type: 'string', required: true },
                draft: { type: 'boolean', required: true },
                author: { type: 'string', required: true },
                head: { type: 'string', required: true },
                base: { type: 'string', required: true },
                url: { type: 'string', required: true },
              },
            },
          },
          count: { type: 'integer', required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: `Found ${value.count} pull requests:${(value.pulls ?? []).map((p) => `\n- #${p.number} [${p.state}${p.draft ? ', draft' : ''}] ${p.title} (${p.head} → ${p.base})`).join('')}` }],
    },
    async execute(args) {
      const ref = args as RepoRef
      assertRepo(ref)
      const perPage = clampInt(args.perPage, 30, 1, 100)
      let path = `/repos/${ref.owner}/${ref.repo}/pulls?state=${args.state ?? 'open'}&per_page=${perPage}`
      if (args.head) path += `&head=${encodeURIComponent(args.head)}`
      if (args.base) path += `&base=${encodeURIComponent(args.base)}`
      const list = await githubListAll<PullSummary>(identity, path, perPage)
      const pulls = list.map(toPullSummary)
      log.debug('listed pulls', { count: pulls.length })
      return { pulls, count: pulls.length }
    },
    presentCall: args => ({ card: 'generic', title: `List PRs in ${args.owner}/${args.repo}`, kind: 'other', rawInput: args }),
  }))

  // ---------- github_get_pull ----------
  ctx.tools.register(defineTool({
    name: 'github_get_pull',
    description: 'Fetch full metadata for one pull request: number, title, state, mergeable flag, changed-files count, and head/base SHAs.',
    parameters: {
      owner: { type: 'string', required: true, description: 'The repository owner.' },
      repo: { type: 'string', required: true, description: 'The repository name.' },
      number: { type: 'integer', required: true, description: 'The PR number.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          number: { type: 'integer', required: true },
          title: { type: 'string', required: true },
          state: { type: 'string', required: true },
          draft: { type: 'boolean', required: true },
          mergeable: { type: 'boolean' },
          changedFiles: { type: 'integer', required: true },
          additions: { type: 'integer', required: true },
          deletions: { type: 'integer', required: true },
          head: { type: 'string', required: true },
          base: { type: 'string', required: true },
          url: { type: 'string', required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: `PR #${value.number} [${value.state}${value.draft ? ', draft' : ''}] ${value.title}: ${value.changedFiles} files (+${value.additions} -${value.deletions}), ${value.head} → ${value.base}${value.mergeable === false ? ', conflicts' : ', mergeable'}. ${value.url}` }],
    },
    async execute(args) {
      const ref = args as RepoRef
      assertRepo(ref)
      const res = await githubRequest<PullDetail>(identity, 'GET', `/repos/${ref.owner}/${ref.repo}/pulls/${args.number}`)
      return toPullDetail(res.body)
    },
    presentCall: args => ({ card: 'generic', title: `Get PR #${args.number}`, kind: 'other', rawInput: args }),
  }))

  // ---------- github_create_pull ----------
  ctx.tools.register(defineTool({
    name: 'github_create_pull',
    description: 'Open a pull request. Requires the head and base branch names; title is required and body optional.',
    parameters: {
      owner: { type: 'string', required: true, description: 'The repository owner.' },
      repo: { type: 'string', required: true, description: 'The repository name.' },
      title: { type: 'string', required: true, description: 'The PR title.' },
      head: { type: 'string', required: true, description: 'The branch to merge FROM (e.g. "feature-x").' },
      base: { type: 'string', required: true, description: 'The branch to merge INTO (e.g. "main").' },
      body: { type: 'string', description: 'The PR description (Markdown).' },
      draft: { type: 'boolean', description: 'true to open as a draft. Defaults to false.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          number: { type: 'integer', required: true },
          url: { type: 'string', required: true },
          dryRun: { type: 'boolean', required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: value.dryRun ? `Would open PR "${value.dryRun}" Dry-run.` : `Opened PR #${value.number}: ${value.url}` }],
    },
    async execute(args) {
      const ref = args as RepoRef
      assertRepo(ref)
      if (identity.dryRun) return { number: -1, url: '(dry-run)', dryRun: true }
      const body = { title: args.title, body: args.body ?? '', head: args.head, base: args.base, draft: args.draft ?? false }
      const res = await githubRequest<{ number: number; html_url: string }>(identity, 'POST', `/repos/${ref.owner}/${ref.repo}/pulls`, { body })
      return { number: res.body.number, url: res.body.html_url, dryRun: false }
    },
    presentCall: args => ({ card: 'generic', title: `Create PR in ${args.owner}/${args.repo}`, kind: 'other', rawInput: args }),
  }))

  // ---------- github_merge_pull ----------
  ctx.tools.register(defineTool({
    name: 'github_merge_pull',
    description: 'Merge a pull request. Choose merge method: merge (merge commit), squash, or rebase. The PR must be mergeable.',
    parameters: {
      owner: { type: 'string', required: true, description: 'The repository owner.' },
      repo: { type: 'string', required: true, description: 'The repository name.' },
      number: { type: 'integer', required: true, description: 'The PR number.' },
      method: { type: 'string', enum: ['merge', 'squash', 'rebase'], description: 'The merge method. Defaults to "merge".' },
      commitTitle: { type: 'string', description: 'Title for the merge commit.' },
      commitMessage: { type: 'string', description: 'Body for the merge commit.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          merged: { type: 'boolean', required: true },
          method: { type: 'string', required: true },
          sha: { type: 'string', required: true },
          dryRun: { type: 'boolean', required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: value.dryRun ? `Would merge PR via ${value.method}. Dry-run.` : `Merged PR via ${value.method}: ${value.sha}` }],
    },
    async execute(args) {
      const ref = args as RepoRef
      assertRepo(ref)
      const method = args.method ?? 'merge'
      if (identity.dryRun) return { merged: false, method, sha: '(dry-run)', dryRun: true }
      const body: Record<string, unknown> = { merge_method: method }
      if (args.commitTitle) body.commit_title = args.commitTitle
      if (args.commitMessage) body.commit_message = args.commitMessage
      const res = await githubRequest<{ merged: boolean; sha: string }>(identity, 'PUT', `/repos/${ref.owner}/${ref.repo}/pulls/${args.number}/merge`, { body })
      return { merged: res.body.merged, method, sha: res.body.sha, dryRun: false }
    },
    presentCall: args => ({ card: 'generic', title: `Merge PR #${args.number}`, kind: 'other', rawInput: args }),
  }))
}

function clampInt(value: unknown, def: number, min: number, max: number): number {
  const n = typeof value === 'number' ? value : def
  if (!Number.isFinite(n)) return def
  return Math.max(min, Math.min(max, Math.trunc(n)))
}

interface PullSummary {
  number: number
  title: string
  state: string
  draft: boolean
  user: { login: string } | null
  head: { ref: string }
  base: { ref: string }
  html_url: string
}

function toPullSummary(p: PullSummary): { number: number; title: string; state: string; draft: boolean; author: string; head: string; base: string; url: string } {
  return {
    number: p.number,
    title: p.title,
    state: p.state,
    draft: p.draft,
    author: p.user?.login ?? '',
    head: p.head.ref,
    base: p.base.ref,
    url: p.html_url,
  }
}

interface PullDetail {
  number: number
  title: string
  state: string
  draft: boolean
  mergeable: boolean | null
  changed_files: number
  additions: number
  deletions: number
  head: { ref: string; sha: string }
  base: { ref: string; sha: string }
  html_url: string
}

function toPullDetail(p: PullDetail): { number: number; title: string; state: string; draft: boolean; mergeable: boolean; changedFiles: number; additions: number; deletions: number; head: string; base: string; url: string } {
  return {
    number: p.number,
    title: p.title,
    state: p.state,
    draft: p.draft,
    mergeable: p.mergeable ?? false,
    changedFiles: p.changed_files,
    additions: p.additions,
    deletions: p.deletions,
    head: p.head.ref,
    base: p.base.ref,
    url: p.html_url,
  }
}
