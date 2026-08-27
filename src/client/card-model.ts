/**
 * The GitHub manager card's staged form over the 'dsh-github-manager'
 * settings namespace.
 *
 * This is the card's own model, deliberately not imported from the section's
 * package: the client bundle purity gate forbids cross-plugin value imports,
 * so each feature-owned card stages its drafts and fences its writes itself.
 * A control reports what the user typed; only Save turns drafts into
 * revision-fenced settings writes. The token is write-only: its stored value
 * never crosses the wire, so its control starts blank on every load and a
 * blank draft writes nothing (an existing key survives untouched saves).
 */

import { createSnapshotStore, type SettingsScope, type SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'

/** The paired host settings namespace, spelled exactly as the host brands it. */
export const GITHUB_MANAGER_NS = 'dsh-github-manager'

/** One field's draft: a concrete value, or CLEAR to un-overwrite back to the layer below. */
const CLEAR = Symbol('clear')

/** The section shape the namespace resolves. All optional: an absent field inherits. */
export interface GitHubSection {
  enabled?: boolean
  token?: string
  baseUrl?: string
  webUrl?: string
  timeoutMs?: number
  dryRun?: boolean
}

/** Boolean switch fields the card exposes. */
export type SwitchField = 'enabled' | 'dryRun'

/** Free-text fields the card exposes. */
export type TextFileField = 'baseUrl' | 'webUrl'

/** A boolean control's rendered state. */
export interface SwitchState {
  /** The value the control shows (staged draft or resolved section). */
  value: boolean
  /** Whether saving would leave a user-layer entry for this field. */
  overridden: boolean
}

/** A text/number control's rendered state. */
export interface FieldState {
  /** Draft text the control renders. */
  text: string
  /** Whether saving would leave a user-layer entry for this field. */
  overridden: boolean
  /** Whether the draft is not a value the field accepts; blocks the save. */
  invalid: boolean
}

/** The write-only credential control's rendered state. */
export interface SecretState {
  /** Draft text; blank until the user types. */
  text: string
}

/** Card-level state shared by every plugin settings card shape. */
export interface CardShell {
  /** False while the namespace is not served to this client; the card renders nothing. */
  available: boolean
  /** Whether the host document accepts writes. */
  writable: boolean
  /** Whether the form holds drafts that a save would write. */
  dirty: boolean
  /** Whether the save is crossing the wire. */
  saving: boolean
  /** Whether the last save did not land as staged; cleared by the next edit or save. */
  failed: boolean
}

/** Everything the card renders. */
export interface GitHubCardState extends CardShell {
  /** Whether any staged draft is a value its field refuses; blocks the save. */
  invalid: boolean
  enabled: SwitchState
  dryRun: SwitchState
  baseUrl: FieldState
  webUrl: FieldState
  timeoutMs: FieldState
  token: SecretState
}

/** Actions the card's slot entry injects onto its controls. */
export interface GitHubCardActions {
  /** Stage a boolean switch value. */
  toggle: (field: SwitchField, value: boolean) => void
  /** Stage draft text for one field. */
  edit: (field: TextFileField | 'timeoutMs', text: string) => void
  /** Stage a credential draft. */
  editToken: (text: string) => void
  /** Stage a clear, so saving lets the field re-inherit the composition layer. */
  resetField: (field: SwitchField | TextFileField | 'timeoutMs') => void
  /** Write every staged draft, then re-seed from what the host accepted. */
  save: () => void
  /** Drop every staged draft. */
  discard: () => void
}

/** The registration-side face the card's slot entry injects. */
export interface GitHubCardFace extends GitHubCardActions {
  hooks: {
    /** Card snapshot bound by the renderer as useGithubCard. */
    githubCard: SnapshotStore<GitHubCardState>
  }
}

type Draft = unknown | typeof CLEAR

/**
 * Stages one card's drafts over the 'dsh-github-manager' namespace and writes
 * them on save. Reads the effective value as user layer over composition over
 * section; a field's presence in the raw user layer is what marks it
 * overridden, not a value comparison.
 */
export class GitHubCardController {
  private readonly staged = new Map<string, Draft>()
  private saving = false
  private failed = false
  /** The card's snapshot store; passed to slots.register as the store seat. */
  readonly store: SnapshotStore<GitHubCardState>

  /** @param scope - the bound settings scope for the GitHub manager namespace. */
  constructor(private readonly scope: SettingsScope<GitHubSection>) {
    this.store = createSnapshotStore(this.project())
    scope.subscribe(() => this.publish())
  }

  /**
   * Build the face the card's slot registration injects.
   * @returns the card's snapshot source and its actions.
   */
  inject(): GitHubCardFace {
    return {
      hooks: { githubCard: this.store },
      toggle: (field, value) => this.stage(field, value),
      edit: (field, text) => this.stage(field, text),
      editToken: (text) => this.stage('token', text),
      resetField: (field) => this.stage(field, CLEAR),
      save: () => this.save(),
      discard: () => {
        if (this.staged.size === 0 && !this.failed) return
        this.staged.clear()
        this.failed = false
        this.publish()
      },
    }
  }

  private stage(field: string, draft: Draft): void {
    this.staged.set(field, draft)
    this.failed = false
    this.publish()
  }

  /**
   * Write every staged draft through the scope, in staging order. The token is
   * special-cased: an empty token draft writes nothing at all (the stored
   * credential survives), while a typed one goes out as a plain field write.
   */
  private async save(): Promise<void> {
    if (this.saving || this.staged.size === 0) return
    if (this.hasInvalidDraft()) {
      this.failed = true
      this.publish()
      return
    }
    this.saving = true
    this.failed = false
    this.publish()
    const writes: Promise<void>[] = []
    for (const [field, draft] of this.staged) {
      if (field === 'token') {
        const text = typeof draft === 'string' ? draft.trim() : ''
        if (text !== '') writes.push(this.scope.set('token', text))
        continue
      }
      if (draft === CLEAR) {
        writes.push(this.scope.unset(field))
        continue
      }
      writes.push(this.scope.set(field, field === 'timeoutMs' ? Number(draft) : draft))
    }
    try {
      await Promise.all(writes)
      this.staged.clear()
    } catch {
      // Keep the drafts: a save that did not land must not throw away what
      // the user typed; the next edit or save retries from the same state.
      this.failed = true
    } finally {
      this.saving = false
      this.publish()
    }
  }

  /** Whether any staged draft is a value its field refuses. */
  private hasInvalidDraft(): boolean {
    for (const [field, draft] of this.staged) {
      if (field === 'timeoutMs' && draft !== CLEAR) {
        const parsed = Number(String(draft).trim())
        if (!Number.isFinite(parsed) || parsed < 1000) return true
      }
    }
    return false
  }

  private user(): Record<string, unknown> | undefined {
    return this.scope.getSnapshot().user as Record<string, unknown> | undefined
  }

  private switchState(field: SwitchField): SwitchState {
    if (this.staged.has(field)) {
      const draft = this.staged.get(field)
      // A staged clear writes nothing back, so it previews as un-overridden.
      if (draft === CLEAR) return { value: this.inherited(field), overridden: false }
      return { value: Boolean(draft), overridden: true }
    }
    return { value: this.inherited(field), overridden: Object.hasOwn(this.user() ?? {}, field) }
  }

  /**
   * The value the switch shows when no draft pins it: the resolved section,
   * or - for a staged clear - the layer a save would revert to (the entry
   * base, falling back to the schema default the host resolves with).
   */
  private inherited(field: SwitchField): boolean {
    const snapshot = this.scope.getSnapshot()
    if (this.staged.get(field) === CLEAR) {
      const base = snapshot.base as GitHubSection | undefined
      return field === 'enabled' ? base?.enabled ?? true : base?.dryRun ?? false
    }
    return field === 'enabled' ? snapshot.value?.enabled ?? true : snapshot.value?.dryRun ?? false
  }

  private fieldState(field: TextFileField | 'timeoutMs'): FieldState {
    const snapshot = this.scope.getSnapshot()
    const userHas = Object.hasOwn(this.user() ?? {}, field)
    if (this.staged.has(field)) {
      const draft = this.staged.get(field)
      if (draft === CLEAR) return { text: '', overridden: false, invalid: false }
      const text = String(draft)
      const invalid = field === 'timeoutMs' && (!Number.isFinite(Number(text.trim())) || Number(text.trim()) < 1000 || text.trim() === '')
      return { text, overridden: true, invalid }
    }
    const stored = snapshot.value?.[field]
    const text = stored === undefined ? '' : String(stored)
    return { text, overridden: userHas, invalid: false }
  }

  private project(): GitHubCardState {
    const snapshot = this.scope.getSnapshot()
    const timeoutMs = this.fieldState('timeoutMs')
    return {
      available: snapshot.status === 'ready',
      writable: snapshot.writable,
      dirty: this.staged.size > 0,
      saving: this.saving,
      failed: this.failed,
      invalid: timeoutMs.invalid,
      enabled: this.switchState('enabled'),
      dryRun: this.switchState('dryRun'),
      baseUrl: this.fieldState('baseUrl'),
      webUrl: this.fieldState('webUrl'),
      timeoutMs,
      token: { text: typeof this.staged.get('token') === 'string' ? String(this.staged.get('token')) : '' },
    }
  }

  private publish(): void {
    this.store.set(this.project())
  }
}
