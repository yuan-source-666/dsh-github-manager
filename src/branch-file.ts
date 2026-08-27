/**
 * Branch + file management tools. Wraps the GitHub branches and contents
 * endpoints: list branches, read a file, write/create/replace a file, and
 * delete a file — each through the commits API so changes are versioned.
 *
 * @module dsh-github-manager/branch-file
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { type GitHubIdentity, githubListAll, githubRequest, webLink } from './github-client.ts'

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

/** UTF-8 safe base64 encode/decode for the contents API. */
function encodeBase64(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary)
}
function decodeBase64(b64: string): string {
  const binary = atob(b64)
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

/** Register branch + file tools. */
export function registerBranchFileTools(ctx: Context, identity: GitHubIdentity): void {
  const log = ctx.logger('github-manager:branch-file')

  // ---------- github_list_branches ----------
  ctx.tools.register(defineTool({
    name: 'github_list_branches',
    description: 'List branches in a repository. Returns name and last commit SHA for each.',
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
          branches: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                name: { type: 'string', required: true },
                sha: { type: 'string', required: true },
                protected: { type: 'boolean', required: true },
              },
            },
          },
          count: { type: 'integer', required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: `Found ${value.count} branches:${(value.branches ?? []).map((b) => `\n- ${b.name} @ ${b.sha.slice(0, 7)}${b.protected ? ' (protected)' : ''}`).join('')}` }],
    },
    async execute(args) {
      const ref = args as RepoRef
      assertRepo(ref)
      const perPage = clampInt(args.perPage, 30, 1, 100)
      const path = `/repos/${ref.owner}/${ref.repo}/branches?per_page=${perPage}`
      const list = await githubListAll<{ name: string; commit: { sha: string }; protected: boolean }>(identity, path, perPage)
      const branches = list.map((b) => ({ name: b.name, sha: b.commit.sha, protected: b.protected }))
      log.debug('listed branches', { count: branches.length })
      return { branches, count: branches.length }
    },
    presentCall: args => ({ card: 'generic', title: `List branches in ${args.owner}/${args.repo}`, kind: 'other', rawInput: args }),
  }))

  // ---------- github_read_file ----------
  ctx.tools.register(defineTool({
    name: 'github_read_file',
    description: 'Read a text file from a repository at a given branch or commit SHA. Returns the file content (truncated to 8000 chars) and its blob SHA.',
    parameters: {
      owner: { type: 'string', required: true, description: 'The repository owner.' },
      repo: { type: 'string', required: true, description: 'The repository name.' },
      path: { type: 'string', required: true, description: 'The file path (e.g. "src/index.ts").' },
      ref: { type: 'string', description: 'The branch or commit SHA. Defaults to the repo default branch.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          path: { type: 'string', required: true },
          sha: { type: 'string', required: true },
          size: { type: 'integer', required: true },
          content: { type: 'string', required: true },
          truncated: { type: 'boolean', required: true },
          url: { type: 'string', required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: value.truncated ? `File ${value.path} (truncated, ${value.size} bytes):\n${value.content}` : `File ${value.path} (${value.size} bytes):\n${value.content}` }],
    },
    async execute(args) {
      const ref = args as RepoRef
      assertRepo(ref)
      const path = `/repos/${ref.owner}/${ref.repo}/contents/${encodeURIComponent(args.path).replace(/%2F/g, '/')}${args.ref ? `?ref=${encodeURIComponent(args.ref)}` : ''}`
      const res = await githubRequest<FileContent>(identity, 'GET', path)
      const content = res.body.encoding === 'base64' ? decodeBase64(res.body.content.replace(/\n/g, '')) : res.body.content
      const truncated = content.length > 8000
      return {
        path: res.body.path,
        sha: res.body.sha,
        size: res.body.size,
        content: truncated ? content.slice(0, 8000) + '\n... [truncated]' : content,
        truncated,
        url: res.body.html_url,
      }
    },
    presentCall: args => ({ card: 'generic', title: `Read ${args.path}`, kind: 'other', rawInput: args }),
  }))

  // ---------- github_write_file ----------
  ctx.tools.register(defineTool({
    name: 'github_write_file',
    description: 'Create or update a text file on a branch. To UPDATE an existing file you must provide its current blob SHA (get it from github_read_file first); to CREATE a new file, omit sha. Requires the contents:write scope.',
    parameters: {
      owner: { type: 'string', required: true, description: 'The repository owner.' },
      repo: { type: 'string', required: true, description: 'The repository name.' },
      path: { type: 'string', required: true, description: 'The file path.' },
      content: { type: 'string', required: true, description: 'The full new file content (UTF-8 text).' },
      message: { type: 'string', required: true, description: 'The commit message.' },
      branch: { type: 'string', description: 'The target branch. Defaults to the repo default branch.' },
      sha: { type: 'string', description: 'The current blob SHA, required to update an existing file; omit when creating.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          path: { type: 'string', required: true },
          sha: { type: 'string', required: true },
          commitSha: { type: 'string', required: true },
          dryRun: { type: 'boolean', required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: value.dryRun ? `Would write ${value.path}. Dry-run.` : `Wrote ${value.path} (commit ${value.commitSha.slice(0, 7)}). Blob ${value.sha.slice(0, 7)}.` }],
    },
    async execute(args) {
      const ref = args as RepoRef
      assertRepo(ref)
      if (identity.dryRun) return { path: args.path, sha: '(dry-run)', commitSha: '(dry-run)', dryRun: true }
      const body: Record<string, unknown> = {
        message: args.message,
        content: encodeBase64(args.content),
      }
      if (args.branch) body.branch = args.branch
      if (args.sha) body.sha = args.sha
      const res = await githubRequest<{ content: { sha: string; path: string }; commit: { sha: string } }>(identity, 'PUT', `/repos/${ref.owner}/${ref.repo}/contents/${encodeURIComponent(args.path).replace(/%2F/g, '/')}`, { body })
      return { path: res.body.content.path, sha: res.body.content.sha, commitSha: res.body.commit.sha, dryRun: false }
    },
    presentCall: args => ({ card: 'generic', title: `Write ${args.path}`, kind: 'other', rawInput: args }),
  }))

  // ---------- github_delete_file ----------
  ctx.tools.register(defineTool({
    name: 'github_delete_file',
    description: 'Delete a file from a branch. You must provide the file\'s current blob SHA (get it from github_read_file). Requires the contents:write scope.',
    parameters: {
      owner: { type: 'string', required: true, description: 'The repository owner.' },
      repo: { type: 'string', required: true, description: 'The repository name.' },
      path: { type: 'string', required: true, description: 'The file path.' },
      message: { type: 'string', required: true, description: 'The commit message.' },
      sha: { type: 'string', required: true, description: 'The current blob SHA of the file.' },
      branch: { type: 'string', description: 'The target branch. Defaults to the repo default branch.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          path: { type: 'string', required: true },
          commitSha: { type: 'string', required: true },
          dryRun: { type: 'boolean', required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: value.dryRun ? `Would delete ${value.path}. Dry-run.` : `Deleted ${value.path} (commit ${value.commitSha.slice(0, 7)}).` }],
    },
    async execute(args) {
      const ref = args as RepoRef
      assertRepo(ref)
      if (identity.dryRun) return { path: args.path, commitSha: '(dry-run)', dryRun: true }
      const body: Record<string, unknown> = { message: args.message, sha: args.sha }
      if (args.branch) body.branch = args.branch
      const res = await githubRequest<{ commit: { sha: string } }>(identity, 'DELETE', `/repos/${ref.owner}/${ref.repo}/contents/${encodeURIComponent(args.path).replace(/%2F/g, '/')}`, { body })
      return { path: args.path, commitSha: res.body.commit.sha, dryRun: false }
    },
    presentCall: args => ({ card: 'generic', title: `Delete ${args.path}`, kind: 'other', rawInput: args }),
  }))
}

function clampInt(value: unknown, def: number, min: number, max: number): number {
  const n = typeof value === 'number' ? value : def
  if (!Number.isFinite(n)) return def
  return Math.max(min, Math.min(max, Math.trunc(n)))
}

interface FileContent {
  type: string
  encoding: string
  size: number
  name: string
  path: string
  sha: string
  content: string
  html_url: string
}

// Suppress unused-import warning when webLink is not used in this module.
export { webLink }
