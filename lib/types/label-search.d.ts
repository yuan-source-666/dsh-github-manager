/**
 * Label + search tools. Wraps the GitHub label management and search endpoints.
 *
 * @module dsh-github-manager/label-search
 */
import type { Context } from '@deepseek-ai/cordis';
import { type GitHubIdentity } from './github-client.ts';
/** Register label + search tools. */
export declare function registerLabelSearchTools(ctx: Context, identity: GitHubIdentity): void;
