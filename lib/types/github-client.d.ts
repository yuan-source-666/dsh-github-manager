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
    token: string;
    /** REST API root, e.g. https://api.github.com (or a GitHub Enterprise base). */
    baseUrl: string;
    /** Web root, e.g. https://github.com - used to build human-facing links. */
    webUrl: string;
    /** Per-request timeout in milliseconds. */
    timeoutMs: number;
    /** When true, mutating endpoints refuse to execute and describe their action instead. */
    dryRun: boolean;
}
/** Normalized GitHub API error surfaced to the model. */
export interface GitHubApiError {
    readonly status: number;
    readonly message: string;
    readonly documentationUrl?: string;
}
/** A page header link relation parsed from the Link header. */
export interface ParsedLink {
    next?: string;
    last?: string;
    prev?: string;
    first?: string;
}
/** One normalized REST call result. */
export interface GitHubResponse<T> {
    /** The parsed JSON body (or null for 204 No Content). */
    readonly body: T;
    /** HTTP status code. */
    readonly status: number;
    /** Remaining rate-limit budget reported by the server. */
    readonly rateLimitRemaining: number;
    /** Unix epoch (ms) at which the rate-limit resets. */
    readonly rateLimitReset: number;
    /** Link-header relations, when the endpoint paginates. */
    readonly links: ParsedLink;
}
/** A 4xx/5xx response from GitHub. */
export declare class GitHubHttpError extends Error implements GitHubApiError {
    readonly status: number;
    readonly documentationUrl?: string;
    constructor(error: GitHubApiError);
}
/**
 * Issue one GitHub REST request and return a normalized response.
 * @param identity - the connection identity.
 * @param method - HTTP verb.
 * @param path - path beginning with / (appended to baseUrl) OR an absolute URL (pagination).
 * @param init - optional body/headers.
 * @returns the parsed response with rate-limit + link metadata.
 */
export declare function githubRequest<T>(identity: GitHubIdentity, method: string, path: string, init?: {
    body?: unknown;
    headers?: Record<string, string>;
}): Promise<GitHubResponse<T>>;
/**
 * Walk all pages of a list endpoint and return the concatenated array.
 * Respects GitHub's Link header pagination; stops when no next page exists.
 * @param identity - the connection identity.
 * @param path - the first page path (per_page appended if absent).
 * @param perPage - items per page (max 100).
 * @returns all accumulated items.
 */
export declare function githubListAll<T>(identity: GitHubIdentity, path: string, perPage?: number): Promise<T[]>;
/** Build a web link to an issue/PR/file, given owner, repo, and a path segment. */
export declare function webLink(identity: GitHubIdentity, owner: string, repo: string, tail: string): string;
