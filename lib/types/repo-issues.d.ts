/**
 * GitHub repository + issue management tools. Registered against the DSH
 * tool registry; each tool wraps one REST endpoint and renders a compact
 * summary for the model.
 *
 * @module dsh-github-manager/repo-issues
 */
import type { Context } from '@deepseek-ai/cordis';
import { type GitHubIdentity } from './github-client.ts';
/** Register repository + issue management tools. */
export declare function registerRepoIssueTools(ctx: Context, identity: GitHubIdentity): void;
