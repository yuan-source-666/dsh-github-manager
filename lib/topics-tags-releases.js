/**
 * Repository metadata tools beyond repos/issues/PRs: topics, tags, and
 * releases. Registered against the DSH tool registry; each tool wraps one
 * REST endpoint and renders a compact summary for the model. Topics updates
 * and release writes honor the shared dry-run flag like every other mutating
 * tool in the channel.
 *
 * @module dsh-github-manager/topics-tags-releases
 */
import { defineTool } from '@deepseek-ai/dsh-tools';
import { githubListAll, githubRequest } from "./github-client.js";
function assertRepo(ref) {
    if (!ref.owner || !ref.repo)
        throw new Error('owner and repo are required');
    if (!/^[-a-zA-Z0-9_.]+$/.test(ref.owner) || !/^[-a-zA-Z0-9_.]+$/.test(ref.repo)) {
        throw new Error('owner and repo may only contain word characters, hyphens, and dots');
    }
}
/** Clamp an optional integer arg into [min,max] with a default. */
function clampInt(value, def, min, max) {
    const n = typeof value === 'number' ? value : def;
    if (!Number.isFinite(n))
        return def;
    return Math.max(min, Math.min(max, Math.trunc(n)));
}
function toReleaseSummary(r) {
    return {
        id: r.id,
        tagName: r.tag_name,
        name: r.name ?? '',
        draft: r.draft,
        prerelease: r.prerelease,
        publishedAt: r.published_at ?? r.created_at ?? '',
        url: r.html_url,
    };
}
/**
 * Normalize one topic name the way GitHub does before accepting it:
 * lowercased, trimmed, spaces/underscores folded to hyphens, non-allowed
 * characters stripped, capped at 50 characters. Returns null for names that
 * normalize to nothing so the caller can filter them out.
 */
function normalizeTopic(name) {
    const cleaned = name
        .toLowerCase()
        .trim()
        .replace(/[ _]+/g, '-')
        .replace(/[^a-z0-9\-.]/g, '')
        .slice(0, 50);
    return cleaned.length > 0 ? cleaned : null;
}
/** Register topics, tags, and release management tools. */
export function registerTopicTagReleaseTools(ctx, identity) {
    const log = ctx.logger('github-manager:topics-tags-releases');
    // ---------- github_get_topics ----------
    ctx.tools.register(defineTool({
        name: 'github_get_topics',
        description: 'Get the topic tags of a repository. Anyone with read access can list topics. Use github_update_topics to change them (the update replaces the whole set).',
        parameters: {
            owner: { type: 'string', required: true, description: 'The repository owner.' },
            repo: { type: 'string', required: true, description: 'The repository name.' },
        },
        output: {
            schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    topics: { type: 'array', items: { type: 'string' } },
                    count: { type: 'integer', required: true },
                },
            },
            render: (_args, value) => [{ type: 'text', text: (value.topics ?? []).length > 0 ? value.count + ' topics: ' + value.topics.join(', ') : 'This repository has no topics.' }],
        },
        async execute(args) {
            const ref = args;
            assertRepo(ref);
            const res = await githubRequest(identity, 'GET', `/repos/${ref.owner}/${ref.repo}/topics`);
            const topics = res.body.names ?? [];
            log.debug('listed topics', { count: topics.length });
            return { topics, count: topics.length };
        },
        presentCall: (args) => ({ card: 'generic', title: 'Get topics of ' + args.owner + '/' + args.repo, kind: 'other', rawInput: args }),
    }));
    // ---------- github_update_topics ----------
    ctx.tools.register(defineTool({
        name: 'github_update_topics',
        description: 'Replace ALL topic tags of a repository in one write (GitHub exposes no add/remove endpoint). Names are normalized to lowercase with hyphens. Requires write access. With dryRun on, the resulting set is described without any request.',
        parameters: {
            owner: { type: 'string', required: true, description: 'The repository owner.' },
            repo: { type: 'string', required: true, description: 'The repository name.' },
            topics: {
                type: 'array',
                items: { type: 'string' },
                required: true,
                description: 'The complete replacement topic list (e.g. ["dsh-plugin", "github-automation"]). An empty array clears all topics.',
            },
        },
        output: {
            schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    topics: { type: 'array', items: { type: 'string' } },
                    count: { type: 'integer', required: true },
                    dryRun: { type: 'boolean', required: true },
                },
            },
            render: (_args, value) => [{ type: 'text', text: (value.dryRun ? 'Would set ' : 'Topics set to ') + value.count + ' topics: ' + value.topics.join(', ') + (value.dryRun ? '. Dry-run.' : '') }],
        },
        async execute(args) {
            const ref = args;
            assertRepo(ref);
            const names = [...new Set((args.topics ?? []).map(normalizeTopic).filter((n) => n !== null))];
            if (names.length > 20)
                throw new Error('GitHub accepts at most 20 topics per repository');
            if (identity.dryRun) {
                return { topics: names, count: names.length, dryRun: true };
            }
            const res = await githubRequest(identity, 'PUT', `/repos/${ref.owner}/${ref.repo}/topics`, { body: { names } });
            const topics = res.body.names ?? names;
            return { topics, count: topics.length, dryRun: false };
        },
        presentCall: (args) => ({ card: 'generic', title: 'Update topics of ' + args.owner + '/' + args.repo, kind: 'other', rawInput: args }),
    }));
    // ---------- github_list_tags ----------
    ctx.tools.register(defineTool({
        name: 'github_list_tags',
        description: 'List the git tags of a repository with their commit SHAs, in reverse chronological order. Tags are the anchors releases point at (see github_list_releases).',
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
                    tags: {
                        type: 'array',
                        items: {
                            type: 'object',
                            additionalProperties: false,
                            properties: {
                                name: { type: 'string', required: true },
                                sha: { type: 'string', required: true },
                            },
                        },
                    },
                    count: { type: 'integer', required: true },
                },
            },
            render: (_args, value) => [{ type: 'text', text: 'Found ' + value.count + ' tags:' + (value.tags ?? []).map((t) => '\n- ' + t.name + ' @ ' + t.sha.slice(0, 7)).join('') }],
        },
        async execute(args) {
            const ref = args;
            assertRepo(ref);
            const perPage = clampInt(args.perPage, 30, 1, 100);
            const path = `/repos/${ref.owner}/${ref.repo}/tags?per_page=${perPage}`;
            const list = await githubListAll(identity, path, perPage);
            const tags = list.map((t) => ({ name: t.name, sha: t.commit.sha }));
            log.debug('listed tags', { count: tags.length });
            return { tags, count: tags.length };
        },
        presentCall: (args) => ({ card: 'generic', title: 'List tags of ' + args.owner + '/' + args.repo, kind: 'other', rawInput: args }),
    }));
    // ---------- github_list_releases ----------
    ctx.tools.register(defineTool({
        name: 'github_list_releases',
        description: 'List the releases of a repository, newest first. Draft releases are only visible to callers with push access.',
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
                    releases: {
                        type: 'array',
                        items: {
                            type: 'object',
                            additionalProperties: false,
                            properties: {
                                id: { type: 'integer', required: true },
                                tagName: { type: 'string', required: true },
                                name: { type: 'string', required: true },
                                draft: { type: 'boolean', required: true },
                                prerelease: { type: 'boolean', required: true },
                                publishedAt: { type: 'string', required: true },
                                url: { type: 'string', required: true },
                            },
                        },
                    },
                    count: { type: 'integer', required: true },
                },
            },
            render: (_args, value) => [{ type: 'text', text: 'Found ' + value.count + ' releases:' + (value.releases ?? []).map((r) => '\n- ' + r.tagName + (r.name && r.name !== r.tagName ? ' "' + r.name + '"' : '') + (r.draft ? ' [draft]' : r.prerelease ? ' [prerelease]' : '') + ' ' + r.publishedAt).join('') }],
        },
        async execute(args) {
            const ref = args;
            assertRepo(ref);
            const perPage = clampInt(args.perPage, 30, 1, 100);
            const path = `/repos/${ref.owner}/${ref.repo}/releases?per_page=${perPage}`;
            const list = await githubListAll(identity, path, perPage);
            const releases = list.map(toReleaseSummary);
            return { releases, count: releases.length };
        },
        presentCall: (args) => ({ card: 'generic', title: 'List releases of ' + args.owner + '/' + args.repo, kind: 'other', rawInput: args }),
    }));
    // ---------- github_get_latest_release ----------
    ctx.tools.register(defineTool({
        name: 'github_get_latest_release',
        description: 'Get the latest published (non-draft, non-prerelease) release of a repository. Fails with 404 when the repository has no published release.',
        parameters: {
            owner: { type: 'string', required: true, description: 'The repository owner.' },
            repo: { type: 'string', required: true, description: 'The repository name.' },
        },
        output: {
            schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    id: { type: 'integer', required: true },
                    tagName: { type: 'string', required: true },
                    name: { type: 'string', required: true },
                    draft: { type: 'boolean', required: true },
                    prerelease: { type: 'boolean', required: true },
                    publishedAt: { type: 'string', required: true },
                    url: { type: 'string', required: true },
                    body: { type: 'string' },
                },
            },
            render: (_args, value) => [{ type: 'text', text: 'Latest release ' + value.tagName + (value.name && value.name !== value.tagName ? ' "' + value.name + '"' : '') + ' (id ' + value.id + ', published ' + value.publishedAt + '). ' + value.url }],
        },
        async execute(args) {
            const ref = args;
            assertRepo(ref);
            const res = await githubRequest(identity, 'GET', `/repos/${ref.owner}/${ref.repo}/releases/latest`);
            const release = toReleaseSummary(res.body);
            return { ...release, body: res.body.body ?? '' };
        },
        presentCall: (args) => ({ card: 'generic', title: 'Get latest release of ' + args.owner + '/' + args.repo, kind: 'other', rawInput: args }),
    }));
    // ---------- github_create_release ----------
    ctx.tools.register(defineTool({
        name: 'github_create_release',
        description: 'Create a release. tagName is required and GitHub creates the tag if it does not exist yet. Optional: name, body (Markdown), draft, prerelease, and commitish (branch/sha the tag points at when the tag must be created). Requires Contents write. Dry-run describes the release without executing.',
        parameters: {
            owner: { type: 'string', required: true, description: 'The repository owner.' },
            repo: { type: 'string', required: true, description: 'The repository name.' },
            tagName: { type: 'string', required: true, description: 'The tag name to publish, e.g. v1.1.0 (created if missing).' },
            name: { type: 'string', description: 'Display title of the release. Defaults to the tag name.' },
            body: { type: 'string', description: 'Release notes (Markdown).' },
            draft: { type: 'boolean', description: 'true to save as an unpublished draft. Defaults to false.' },
            prerelease: { type: 'boolean', description: 'true to mark as a pre-release. Defaults to false.' },
            commitish: { type: 'string', description: 'Branch name or commit SHA to tag when the tag does not exist yet. Defaults to the default branch.' },
        },
        output: {
            schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    id: { type: 'integer', required: true },
                    tagName: { type: 'string', required: true },
                    url: { type: 'string', required: true },
                    dryRun: { type: 'boolean', required: true },
                },
            },
            render: (_args, value) => [{ type: 'text', text: value.dryRun ? 'Would create release ' + value.tagName + '. Dry-run.' : 'Created release ' + value.tagName + ' (id ' + value.id + '). ' + value.url }],
        },
        async execute(args) {
            const ref = args;
            assertRepo(ref);
            if (!args.tagName)
                throw new Error('tagName is required');
            const body = {
                tag_name: args.tagName,
                name: args.name ?? args.tagName,
                body: args.body ?? '',
                draft: args.draft ?? false,
                prerelease: args.prerelease ?? false,
                ...(args.commitish ? { target_commitish: args.commitish } : {}),
            };
            if (identity.dryRun) {
                return { id: -1, tagName: body.tag_name, url: '(dry-run)', dryRun: true };
            }
            const res = await githubRequest(identity, 'POST', `/repos/${ref.owner}/${ref.repo}/releases`, { body });
            return { id: res.body.id, tagName: res.body.tag_name, url: res.body.html_url, dryRun: false };
        },
        presentCall: (args) => ({ card: 'generic', title: 'Create release ' + args.tagName + ' in ' + args.owner + '/' + args.repo, kind: 'other', rawInput: args }),
    }));
    // ---------- github_update_release ----------
    ctx.tools.register(defineTool({
        name: 'github_update_release',
        description: 'Update an existing release by its numeric id: change tag/name/body/draft/prerelease/commitish. Provide only the fields to change. Publishes a draft by setting draft=false. Requires Contents write. Dry-run describes the patch without executing.',
        parameters: {
            owner: { type: 'string', required: true, description: 'The repository owner.' },
            repo: { type: 'string', required: true, description: 'The repository name.' },
            releaseId: { type: 'integer', required: true, description: 'The numeric release id (from github_list_releases).' },
            tagName: { type: 'string', description: 'New tag name (omit to keep).' },
            name: { type: 'string', description: 'New display title (omit to keep).' },
            body: { type: 'string', description: 'New release notes (omit to keep).' },
            draft: { type: 'boolean', description: 'New draft flag (omit to keep).' },
            prerelease: { type: 'boolean', description: 'New prerelease flag (omit to keep).' },
            commitish: { type: 'string', description: 'Branch/SHA the tag points at, when it must be recreated (omit to keep).' },
        },
        output: {
            schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    id: { type: 'integer', required: true },
                    tagName: { type: 'string', required: true },
                    url: { type: 'string', required: true },
                    dryRun: { type: 'boolean', required: true },
                },
            },
            render: (_args, value) => [{ type: 'text', text: value.dryRun ? 'Would update release ' + value.tagName + ' (id ' + value.id + '). Dry-run.' : 'Updated release ' + value.tagName + ' (id ' + value.id + '). ' + value.url }],
        },
        async execute(args) {
            const ref = args;
            assertRepo(ref);
            if (!Number.isFinite(args.releaseId) || args.releaseId <= 0)
                throw new Error('releaseId must be a positive integer');
            const body = {};
            if (args.tagName !== undefined)
                body.tag_name = args.tagName;
            if (args.name !== undefined)
                body.name = args.name;
            if (args.body !== undefined)
                body.body = args.body;
            if (args.draft !== undefined)
                body.draft = args.draft;
            if (args.prerelease !== undefined)
                body.prerelease = args.prerelease;
            if (args.commitish !== undefined)
                body.target_commitish = args.commitish;
            if (Object.keys(body).length === 0)
                throw new Error('nothing to update: provide at least one field');
            if (identity.dryRun) {
                return { id: args.releaseId, tagName: args.tagName ?? '(unchanged)', url: '(dry-run)', dryRun: true };
            }
            const res = await githubRequest(identity, 'PATCH', `/repos/${ref.owner}/${ref.repo}/releases/${args.releaseId}`, { body });
            return { id: res.body.id, tagName: res.body.tag_name, url: res.body.html_url, dryRun: false };
        },
        presentCall: (args) => ({ card: 'generic', title: 'Update release #' + args.releaseId, kind: 'other', rawInput: args }),
    }));
}
