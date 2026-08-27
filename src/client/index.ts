/**
 * dsh-github-manager browser half: one card in the Plugins section's
 * configurable tab, keyed by the settings namespace it edits. The host half
 * registers the same namespace; the tab pairs them automatically (DSH
 * cookbook: adding a settings card).
 *
 * The card holds its own staged form (client-bundle purity forbids importing
 * another package's form model) and reads/writes through the bound settings
 * scope, which fences every write with the current namespace revision. While
 * the host does not serve the namespace - a deployment without the plugin -
 * the card renders nothing.
 */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: the ctx.settingsScope Context merge.
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: the 'settings.plugin.item' keyed-slot declaration owned by the
// plugins section. Cross-plugin collaboration goes through cordis services;
// a value import fails the client bundle-purity gate.
import type {} from '@deepseek-ai/dsh-client-ui-settings-plugins/client'
import { GitHubCardController, GITHUB_MANAGER_NS } from './card-model.ts'
import { GitHubCard } from './GitHubCard.ts'
import { en, zh, type GitHubManagerLocaleKey } from './locales.ts'

/** Namespace owning this card's copy. */
export const LOCALE_NS = 'settings.githubManager'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The GitHub manager card's copy. */
    'settings.githubManager': GitHubManagerLocaleKey
  }
}

/** Required client services. */
export const inject = ['slots', 'locale', 'connection', 'remote', 'settingsScope']

/**
 * Register the GitHub manager card into the plugins section's item slot.
 * @param ctx - the browser plugin context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(LOCALE_NS, { zh, en }), 'dsh-github-manager: card dictionaries')
  const card = new GitHubCardController(ctx.settingsScope.bind({ namespace: GITHUB_MANAGER_NS }))
  ctx.slots.inject('settings.plugin.item', () => ctx.slots.register({
    name: 'settings.plugin.item',
    key: GITHUB_MANAGER_NS,
    locale: LOCALE_NS,
    inject: () => card.inject(),
  }, GitHubCard))
}
