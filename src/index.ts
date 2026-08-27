/**
 * dsh-github-manager - a GitHub repository AI auto-management channel plugin
 * for DeepSeek Harness.
 *
 * Registers a suite of tools against the DSH ctx.tools registry that let an
 * agent manage GitHub repositories, issues, pull requests, branches, files,
 * labels, and search - all through the GitHub REST API. All deployment-varying
 * parameters (enabled, token, base URLs, timeout, dry-run) live in one settings
 * namespace, so the Web settings card pairs with this half by namespace and
 * edits them at runtime: the master switch unregisters the tools immediately.
 *
 * @module dsh-github-manager
 */

import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'
import { GitHubHttpError, type GitHubIdentity, githubRequest } from './github-client.ts'
import { registerRepoIssueTools } from './repo-issues.ts'
import { registerPullTools } from './pulls.ts'
import { registerBranchFileTools } from './branch-file.ts'
import { registerLabelSearchTools } from './label-search.ts'

export const name = 'dsh-github-manager'

/** The harness waits for the tools registry to be ready before loading this plugin. */
export const inject = ['tools']

/**
 * Settings namespace shared with the browser card. The pairing key is the
 * plain string; both halves spell it identically (DSH cookbook: adding a
 * settings card - the Plugins section dispatches cards by namespace).
 */
export const GITHUB_MANAGER_SETTINGS_NAMESPACE = settingsNamespace('dsh-github-manager')

/** Configurable, deployment-varying parameters for the GitHub manager plugin. */
export interface Config {
  /**
   * Master switch. When false, the GitHub tools are unregistered from the
   * agent surface entirely; when true they are (re)registered live.
   */
  enabled: boolean
  /**
   * A GitHub personal access token (classic or fine-grained). A secret-role
   * field: its value is stripped from every read that crosses the wire and
   * only ever travels inbound on a write. Leave absent to read GH_TOKEN /
   * GITHUB_TOKEN from the environment instead.
   */
  token?: string
  /** REST API root. Defaults to the public GitHub API. */
  baseUrl: string
  /** Web root for human-facing links. Defaults to https://github.com. */
  webUrl: string
  /** Per-request timeout in milliseconds. Defaults to 30000. */
  timeoutMs: number
  /**
   * When true, mutating tools describe the action they would take instead of
   * executing it. Useful for review or a staging deployment. Defaults to false.
   */
  dryRun: boolean
}

/** Schemastery configuration schema; defaults live here, never hardcoded in code. */
export const Config: Schema<Config> = Schema.object({
  enabled: Schema.boolean().default(true).description('Master switch: when off, the GitHub tools are unregistered from the agent.'),
  token: Schema.string().role('secret').description('GitHub personal access token (write-only); when absent, GH_TOKEN/GITHUB_TOKEN is read from the environment.'),
  baseUrl: Schema.string().default('https://api.github.com').description('REST API root (override for GitHub Enterprise).'),
  webUrl: Schema.string().default('https://github.com').description('Web root for human-facing links.'),
  timeoutMs: Schema.number().step(1).min(1000).default(30000).description('Per-request timeout in milliseconds.'),
  dryRun: Schema.boolean().default(false).description('When true, mutating tools describe actions instead of executing them.'),
})

/**
 * Resolve the effective token: the settings value when present, else the
 * environment, else empty. Evaluated per sync so a saved key takes effect on
 * the next request without re-registering anything.
 */
function resolveToken(token: string | undefined): string {
  if (token !== undefined && token.length > 0) return token
  const env = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN ?? ''
  return env
}

/** The tool-definition shape the capturing shim forwards; structural, not an import. */
type ToolDefinitionLike = Parameters<Context['tools']['register']>[0]

/**
 * Register the GitHub manager tool suite behind a live settings surface.
 * @param ctx - the harness context carrying the tools registry.
 * @param config - the composition-layer entry configuration (fallback base).
 */
export function apply(ctx: Context, config: Config): void {
  const identity: GitHubIdentity = {
    token: resolveToken(config.token),
    baseUrl: config.baseUrl,
    webUrl: config.webUrl,
    timeoutMs: config.timeoutMs,
    dryRun: config.dryRun,
  }

  const log = ctx.logger('dsh-github-manager')
  log.info('GitHub manager channel starting', { baseUrl: identity.baseUrl, dryRun: identity.dryRun, hasToken: Boolean(identity.token), enabled: config.enabled })

  // The tool groups register through a capturing shim so every tool's exact
  // disposer lands in this list. The settings 'enabled' switch is then a live
  // unregister/register cycle: the agent surface loses or gains all twenty
  // tools without a restart, and the registrations stay scoped to this
  // plugin's fiber for ordinary unload cleanup.
  const disposers: Array<() => void> = []
  const sink = {
    tools: {
      register: (definition: ToolDefinitionLike): void => {
        disposers.push(ctx.tools.register(definition))
      },
    },
    // The groups log through their context too; forward the real logger so a
    // sink-restricted registration keeps its diagnostics.
    logger: (name: string) => ctx.logger(name),
  } as unknown as Context

  // The currently authoritative config source; the settings scope replaces it
  // while a settings service is attached.
  let source: () => Config = () => config

  // Copy one resolved section into the shared identity the tools read per
  // request; the client never re-imports this file, so the object it holds is
  // updated field by field instead of replaced.
  function fillIdentity(cfg: Config): void {
    identity.token = resolveToken(cfg.token)
    identity.baseUrl = cfg.baseUrl
    identity.webUrl = cfg.webUrl
    identity.timeoutMs = cfg.timeoutMs
    identity.dryRun = cfg.dryRun
  }

  let syncing = false
  // Re-judge registration state and identity from the authoritative source.
  function sync(): void {
    if (syncing) return
    syncing = true
    try {
      const cfg = source()
      fillIdentity(cfg)
      const shouldBeOn = cfg.enabled
      const isOn = disposers.length > 0
      if (shouldBeOn === isOn) return
      if (shouldBeOn) {
        registerRepoIssueTools(sink, identity)
        registerPullTools(sink, identity)
        registerBranchFileTools(sink, identity)
        registerLabelSearchTools(sink, identity)
        registerPingTool(sink, identity)
        log.info('GitHub manager tools registered', { count: disposers.length })
      } else {
        for (const dispose of disposers.splice(0).reverse()) dispose()
        log.info('GitHub manager tools unregistered (channel disabled)')
      }
    } finally {
      syncing = false
    }
  }

  // Canonical optional-settings wiring: while a settings service exists the
  // namespace resolves over this entry as its base layer; when none is
  // mounted (or it detaches) the plugin keeps working exactly as composed.
  installSettingsSection(ctx, GITHUB_MANAGER_SETTINGS_NAMESPACE, Config, config, {
    setSource: (current) => {
      source = current
    },
    onChange: sync,
  })
  sync()
}

/**
 * A lightweight connectivity probe tool. Useful for the model to confirm the
 * channel is wired and the token is valid before issuing other calls.
 */
function registerPingTool(ctx: Context, identity: GitHubIdentity): void {
  ctx.tools.register(defineTool({
    name: 'github_ping',
    description: 'Verify the GitHub manager channel is wired and the token is valid. Calls /user and reports the authenticated user login and remaining rate limit.',
    parameters: {},
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          login: { type: 'string', required: true },
          rateLimitRemaining: { type: 'integer', required: true },
          ok: { type: 'boolean', required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: value.ok ? 'GitHub channel OK: authenticated as ' + value.login + ' (' + value.rateLimitRemaining + ' requests remaining).' : 'GitHub channel reachable but token returned no login.' }],
    },
    async execute() {
      try {
        const res = await githubRequest<{ login: string }>(identity, 'GET', '/user')
        return { login: res.body.login ?? '', rateLimitRemaining: res.rateLimitRemaining, ok: res.body.login !== undefined }
      } catch (error) {
        if (error instanceof GitHubHttpError) {
          throw new Error('github_ping failed (' + error.status + '): ' + error.message)
        }
        throw error
      }
    },
    presentCall: () => ({ card: 'generic', title: 'Ping GitHub', kind: 'other', rawInput: {} }),
  }))
}
