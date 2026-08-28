/**
 * Repository metadata tools beyond repos/issues/PRs: topics, tags, and
 * releases. Registered against the DSH tool registry; each tool wraps one
 * REST endpoint and renders a compact summary for the model. Topics updates
 * and release writes honor the shared dry-run flag like every other mutating
 * tool in the channel.
 *
 * @module dsh-github-manager/topics-tags-releases
 */
import type { Context } from '@deepseek-ai/cordis';
import { type GitHubIdentity } from './github-client.ts';
/** Register topics, tags, and release management tools. */
export declare function registerTopicTagReleaseTools(ctx: Context, identity: GitHubIdentity): void;
