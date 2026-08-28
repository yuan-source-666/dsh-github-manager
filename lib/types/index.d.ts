/**
 * dsh-github-manager - a GitHub repository AI auto-management channel plugin
 * for DeepSeek Harness.
 *
 * Registers a suite of tools against the DSH ctx.tools registry that let an
 * agent manage GitHub repositories, issues, pull requests, branches, files,
 * labels, topics, tags, releases, and search - all through the GitHub REST API. All deployment-varying
 * parameters (enabled, token, base URLs, timeout, dry-run) live in one settings
 * namespace, so the Web settings card pairs with this half by namespace and
 * edits them at runtime: the master switch unregisters the tools immediately.
 *
 * @module dsh-github-manager
 */
import type { Context } from '@deepseek-ai/cordis';
import Schema from '@deepseek-ai/schemastery';
export declare const name = "dsh-github-manager";
/** The harness waits for the tools registry to be ready before loading this plugin. */
export declare const inject: string[];
/**
 * Settings namespace shared with the browser card. The pairing key is the
 * plain string; both halves spell it identically (DSH cookbook: adding a
 * settings card - the Plugins section dispatches cards by namespace).
 */
export declare const GITHUB_MANAGER_SETTINGS_NAMESPACE: import("@deepseek-ai/dsh-settings").SettingsNamespace;
/** Configurable, deployment-varying parameters for the GitHub manager plugin. */
export interface Config {
    /**
     * Master switch. When false, the GitHub tools are unregistered from the
     * agent surface entirely; when true they are (re)registered live.
     */
    enabled: boolean;
    /**
     * A GitHub personal access token (classic or fine-grained). A secret-role
     * field: its value is stripped from every read that crosses the wire and
     * only ever travels inbound on a write. Leave absent to read GH_TOKEN /
     * GITHUB_TOKEN from the environment instead.
     */
    token?: string;
    /** REST API root. Defaults to the public GitHub API. */
    baseUrl: string;
    /** Web root for human-facing links. Defaults to https://github.com. */
    webUrl: string;
    /** Per-request timeout in milliseconds. Defaults to 30000. */
    timeoutMs: number;
    /**
     * When true, mutating tools describe the action they would take instead of
     * executing it. Useful for review or a staging deployment. Defaults to false.
     */
    dryRun: boolean;
}
/** Schemastery configuration schema; defaults live here, never hardcoded in code. */
export declare const Config: Schema<Config>;
/**
 * Register the GitHub manager tool suite behind a live settings surface.
 * @param ctx - the harness context carrying the tools registry.
 * @param config - the composition-layer entry configuration (fallback base).
 */
export declare function apply(ctx: Context, config: Config): void;
