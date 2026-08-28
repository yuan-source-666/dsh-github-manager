/**
 * Pull request management tools. Wraps the GitHub pull request endpoints:
 * list, get, create, merge, and comment.
 *
 * @module dsh-github-manager/pulls
 */
import type { Context } from '@deepseek-ai/cordis';
import { type GitHubIdentity } from './github-client.ts';
/** Register pull request management tools. */
export declare function registerPullTools(ctx: Context, identity: GitHubIdentity): void;
