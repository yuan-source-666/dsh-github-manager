/**
 * Minimal GitHub REST API client. Encapsulates authentication, request/response,
 * pagination, and error normalization so every tool shares one transport.
 * Uses the global fetch (Node >= 18); no external HTTP dependency.
 *
 * @module dsh-github-manager/github-client
 */

/**
 * GitHub API base + identity used by every call. The owning plugin mutates
 * this object in place when the settings namespace commits a change, and the
 * tools read its fields per request - so a saved token, base URL, timeout or
 * dry-run flag takes effect on the next call without re-registering anything.
 */
export interface GitHubIdentity {
  /** Personal access token (classic or fine-grained). Empty for unauthenticated read-only calls. */
  token: string
  /** REST API root, e.g. https://api.github.com (or a GitHub Enterprise base). */
  baseUrl: string
  /** Web root, e.g. https://github.com - used to build human-facing links. */
  webUrl: string
  /** Per-request timeout in milliseconds. */
  timeoutMs: number
  /** When true, mutating endpoints refuse to execute and describe their action instead. */
  dryRun: boolean
}

/** Normalized GitHub API error surfaced to the model. */
export interface GitHubApiError {
  readonly status: number
  readonly message: string
  readonly documentationUrl?: string
}

/** A page header link relation parsed from the Link header. */
export interface ParsedLink {
  next?: string
  last?: string
  prev?: string
  first?: string
}

/** One normalized REST call result. */
export interface GitHubResponse<T> {
  /** The parsed JSON body (or null for 204 No Content). */
  readonly body: T
  /** HTTP status code. */
  readonly status: number
  /** Remaining rate-limit budget reported by the server. */
  readonly rateLimitRemaining: number
  /** Unix epoch (ms) at which the rate-limit resets. */
  readonly rateLimitReset: number
  /** Link-header relations, when the endpoint paginates. */
  readonly links: ParsedLink
}

/** A 4xx/5xx response from GitHub. */
export class GitHubHttpError extends Error implements GitHubApiError {
  readonly status: number
  readonly documentationUrl?: string
  constructor(error: GitHubApiError) {
    super(error.message)
    this.name = 'GitHubHttpError'
    this.status = error.status
    this.documentationUrl = error.documentationUrl
  }
}

/** Parse a Link header into named relations. */
function parseLinkHeader(header: string | null): ParsedLink {
  if (!header) return {}
  const result: ParsedLink = {}
  const parts = header.split(',')
  for (const part of parts) {
    const match = /<([^>]+)>;\s*rel="([^"]+)"/.exec(part.trim())
    if (match) {
      const url = match[1]
      const rel = match[2]
      if (rel === 'next') result.next = url
      else if (rel === 'last') result.last = url
      else if (rel === 'prev') result.prev = url
      else if (rel === 'first') result.first = url
    }
  }
  return result
}

/** Parse the GitHub error body into a stable shape. */
function parseErrorBody(status: number, text: string): GitHubApiError {
  let message = `HTTP ${status}`
  let documentationUrl: string | undefined
  try {
    const parsed = JSON.parse(text) as { message?: string; documentation_url?: string }
    if (typeof parsed.message === 'string') message = parsed.message
    if (typeof parsed.documentation_url === 'string') documentationUrl = parsed.documentation_url
  } catch {
    if (text.length > 0 && text.length < 500) message = text
  }
  return { status, message, documentationUrl }
}

/**
 * Issue one GitHub REST request and return a normalized response.
 * @param identity - the connection identity.
 * @param method - HTTP verb.
 * @param path - path beginning with / (appended to baseUrl) OR an absolute URL (pagination).
 * @param init - optional body/headers.
 * @returns the parsed response with rate-limit + link metadata.
 */
export async function githubRequest<T>(
  identity: GitHubIdentity,
  method: string,
  path: string,
  init?: { body?: unknown; headers?: Record<string, string> },
): Promise<GitHubResponse<T>> {
  const url = path.startsWith('http') ? path : identity.baseUrl.replace(/\/+$/, '') + path
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'dsh-github-manager',
    ...init?.headers,
  }
  if (identity.token) headers.Authorization = `Bearer ${identity.token}`
  if (init?.body !== undefined) headers['Content-Type'] = 'application/json'

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), identity.timeoutMs)
  let response: Response
  try {
    response = await fetch(url, {
      method,
      headers,
      body: init?.body === undefined ? undefined : JSON.stringify(init.body),
      signal: controller.signal,
    })
  } catch (error) {
    clearTimeout(timer)
    const reason = error instanceof Error ? error.message : String(error)
    if (reason === 'AbortError' || /abort/i.test(reason)) {
      throw new GitHubHttpError({ status: 0, message: `GitHub API request timed out after ${identity.timeoutMs}ms` })
    }
    throw new GitHubHttpError({ status: 0, message: `GitHub API network error: ${reason}` })
  }
  clearTimeout(timer)

  const rateRemaining = Number(response.headers.get('x-ratelimit-remaining') ?? NaN)
  const rateReset = Number(response.headers.get('x-ratelimit-reset') ?? NaN) * 1000
  const links = parseLinkHeader(response.headers.get('link'))
  const text = await response.text()
  const body = text.length === 0 ? null : JSON.parse(text) as T

  if (!response.ok) {
    throw new GitHubHttpError(parseErrorBody(response.status, text))
  }
  return {
    body: body as T,
    status: response.status,
    rateLimitRemaining: Number.isFinite(rateRemaining) ? rateRemaining : -1,
    rateLimitReset: Number.isFinite(rateReset) ? rateReset : 0,
    links,
  }
}

/**
 * Walk all pages of a list endpoint and return the concatenated array.
 * Respects GitHub's Link header pagination; stops when no next page exists.
 * @param identity - the connection identity.
 * @param path - the first page path (per_page appended if absent).
 * @param perPage - items per page (max 100).
 * @returns all accumulated items.
 */
export async function githubListAll<T>(
  identity: GitHubIdentity,
  path: string,
  perPage = 100,
): Promise<T[]> {
  const items: T[] = []
  const first = buildListUrl(identity, path, perPage)
  let nextUrl: string | undefined = first
  let pages = 0
  while (nextUrl) {
    if (++pages > 50) {
      // Guard against pathological pagination loops; 50 pages × 100 = 5000 items.
      break
    }
    const response: GitHubResponse<T[]> = await githubRequest<T[]>(identity, 'GET', nextUrl)
    if (Array.isArray(response.body)) items.push(...response.body)
    nextUrl = response.links.next
  }
  return items
}

/** Build a list URL with per_page appended if not present. */
function buildListUrl(identity: GitHubIdentity, path: string, perPage: number): string {
  const base = path.startsWith('http') ? path : identity.baseUrl.replace(/\/+$/, '') + path
  const sep = base.includes('?') ? '&' : '?'
  if (/[?&]per_page=/.test(base)) return base
  return `${base}${sep}per_page=${Math.min(perPage, 100)}`
}

/** Build a web link to an issue/PR/file, given owner, repo, and a path segment. */
export function webLink(identity: GitHubIdentity, owner: string, repo: string, tail: string): string {
  const root = identity.webUrl.replace(/\/+$/, '')
  return `${root}/${owner}/${repo}/${tail.replace(/^\/+/, '')}`
}
