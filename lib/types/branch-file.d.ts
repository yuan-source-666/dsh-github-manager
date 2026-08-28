/**
 * Branch + file management tools. Wraps the GitHub branches and contents
 * endpoints: list branches, read a file, write/create/replace a file, and
 * delete a file — each through the commits API so changes are versioned.
 *
 * @module dsh-github-manager/branch-file
 */
import type { Context } from '@deepseek-ai/cordis';
import { type GitHubIdentity, webLink } from './github-client.ts';
/** Register branch + file tools. */
export declare function registerBranchFileTools(ctx: Context, identity: GitHubIdentity): void;
export { webLink };
