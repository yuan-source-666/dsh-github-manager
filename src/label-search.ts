/**
 * Label + search tools. Wraps the GitHub label management and search endpoints.
 *
 * @module dsh-github-manager/label-search
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { type GitHubIdentity, githubListAll, githubRequest } from './github-client.ts'

/** Owner/repo pair. */
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

/** Register label + search tools. */
export function registerLabelSearchTools(ctx: Context, identity: GitHubIdentity): void {
  const log = ctx.logger('github-manager:label-search')

  // ---------- github_list_labels ----------
  ctx.tools.register(defineTool({
    name: 'github_list_labels',
    description: 'List labels defined in a repository. Returns name, color, and description for each.',
    parameters: {
      owner: { type: 'string', required: true, description: 'The repository owner.' },
      repo: { type: 'string', required: true, description: 'The repository name.' },
      perPage: { type: 'integer', description: 'Max items to return (1-100). Defaults to 30.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          labels: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                name: { type: 'string', required: true },
                color: { type: 'string', required: true },
                description: { type: 'string', required: true },
              },
            },
          },
          count: { type: 'integer', required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: `Found ${value.count} labels:${(value.labels ?? []).map((l) => `\n- ${l.name} (#${l.color})${l.description ? ' — ' + l.description : ''}`).join('')}` }],
    },
    async execute(args) {
      const ref = args as RepoRef
      assertRepo(ref)
      const perPage = clampInt(args.perPage, 30, 1, 100)
      const path = `/repos/${ref.owner}/${ref.repo}/labels?per_page=${perPage}`
      const list = await githubListAll<{ name: string; color: string; description: string | null }>(identity, path, perPage)
      const labels = list.map((l) => ({ name: l.name, color: l.color, description: l.description ?? '' }))
      log.debug('listed labels', { count: labels.length })
      return { labels, count: labels.length }
    },
    presentCall: args => ({ card: 'generic', title: `List labels in ${args.owner}/${args.repo}`, kind: 'other', rawInput: args }),
  }))

  // ---------- github_create_label ----------
  ctx.tools.register(defineTool({
    name: 'github_create_label',
    description: 'Create a label in a repository. Name is required; color is a 6-char hex (no #), defaults to ffffff.',
    parameters: {
      owner: { type: 'string', required: true, description: 'The repository owner.' },
      repo: { type: 'string', required: true, description: 'The repository name.' },
      name: { type: 'string', required: true, description: 'The label name.' },
      color: { type: 'string', description: 'A 6-char hex color without #, e.g. "5319e7". Defaults to "ffffff".' },
      description: { type: 'string', description: 'A short description.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { type: 'string', required: true },
          color: { type: 'string', required: true },
          url: { type: 'string', required: true },
          dryRun: { type: 'boolean', required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: value.dryRun ? `Would create label ${value.name}. Dry-run.` : `Created label ${value.name} (#${value.color}). ${value.url}` }],
    },
    async execute(args) {
      const ref = args as RepoRef
      assertRepo(ref)
      if (identity.dryRun) return { name: args.name, color: args.color ?? 'ffffff', url: '(dry-run)', dryRun: true }
      const body = { name: args.name, color: args.color ?? 'ffffff', description: args.description ?? '' }
      const res = await githubRequest<{ name: string; color: string; url: string }>(identity, 'POST', `/repos/${ref.owner}/${ref.repo}/labels`, { body })
      return { name: res.body.name, color: res.body.color, url: res.body.url, dryRun: false }
    },
    presentCall: args => ({ card: 'generic', title: `Create label ${args.name}`, kind: 'other', rawInput: args }),
  }))

  // ---------- github_search_code ----------
  ctx.tools.register(defineTool({
    name: 'github_search_code',
    description: 'Search code across GitHub. Use qualifiers like "repo:owner/name", "language:ts", "path:src". Returns file path, repo, and the matching text snippet.',
    parameters: {
      query: { type: 'string', required: true, description: 'The search query (e.g. "defineTool repo:owner/name").' },
      perPage: { type: 'integer', description: 'Max items to return (1-100). Defaults to 20.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          total: { type: 'integer', required: true },
          matches: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                repo: { type: 'string', required: true },
                path: { type: 'string', required: true },
                url: { type: 'string', required: true },
              },
            },
          },
          count: { type: 'integer', required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: `Search found ${value.total} total matches (showing ${value.count}):${(value.matches ?? []).map((m) => `\n- ${m.repo} / ${m.path}`).join('')}` }],
    },
    async execute(args) {
      const perPage = clampInt(args.perPage, 20, 1, 100)
      const res = await githubRequest<SearchResult<CodeMatch>>(identity, 'GET', `/search/code?q=${encodeURIComponent(args.query)}&per_page=${perPage}`)
      const matches = res.body.items.map((m) => ({ repo: m.repository.full_name, path: m.path, url: m.html_url }))
      log.debug('searched code', { query: args.query, count: matches.length })
      return { total: res.body.total_count, matches, count: matches.length }
    },
    presentCall: args => ({ card: 'generic', title: `Search code: ${args.query}`, kind: 'other', rawInput: args }),
  }))

  // ---------- github_search_issues ----------
  ctx.tools.register(defineTool({
    name: 'github_search_issues',
    description: 'Search issues and pull requests. Use qualifiers like "repo:owner/name", "state:open", "label:bug", "author:user", "type:pr". Returns number, title, state, and URL.',
    parameters: {
      query: { type: 'string', required: true, description: 'The search query (e.g. "repo:owner/name is:issue is:open label:bug").' },
      perPage: { type: 'integer', description: 'Max items to return (1-100). Defaults to 20.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          total: { type: 'integer', required: true },
          items: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                number: { type: 'integer', required: true },
                title: { type: 'string', required: true },
                state: { type: 'string', required: true },
                isPr: { type: 'boolean', required: true },
                url: { type: 'string', required: true },
              },
            },
          },
          count: { type: 'integer', required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: `Search found ${value.total} total (showing ${value.count}):${(value.items ?? []).map((i) => `\n- #${i.number} [${i.state}] ${i.title}${i.isPr ? ' (PR)' : ''}`).join('')}` }],
    },
    async execute(args) {
      const perPage = clampInt(args.perPage, 20, 1, 100)
      const res = await githubRequest<SearchResult<IssueSearchItem>>(identity, 'GET', `/search/issues?q=${encodeURIComponent(args.query)}&per_page=${perPage}`)
      const items = res.body.items.map((i) => ({ number: i.number, title: i.title, state: i.state, isPr: i.pull_request !== undefined, url: i.html_url }))
      log.debug('searched issues', { query: args.query, count: items.length })
      return { total: res.body.total_count, items, count: items.length }
    },
    presentCall: args => ({ card: 'generic', title: `Search issues: ${args.query}`, kind: 'other', rawInput: args }),
  }))
}

function clampInt(value: unknown, def: number, min: number, max: number): number {
  const n = typeof value === 'number' ? value : def
  if (!Number.isFinite(n)) return def
  return Math.max(min, Math.min(max, Math.trunc(n)))
}

interface SearchResult<T> {
  total_count: number
  items: T[]
}
interface CodeMatch {
  name: string
  path: string
  html_url: string
  repository: { full_name: string }
}
interface IssueSearchItem {
  number: number
  title: string
  state: string
  pull_request?: unknown
  html_url: string
}
