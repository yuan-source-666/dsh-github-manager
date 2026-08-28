window.__ModuleLoader__.load({
	id: 'dsh-github-manager',
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
		const __modules = {
		'locales.ts': function (require, module, exports) {
			"use strict";
			/**
			 * Card copy for the GitHub manager settings card, in both shipped locales.
			 * The namespace is registered into the client locale service by the browser
			 * half; the slot entry declares it, so the renderer binds t for these keys.
			 */
			Object.defineProperty(exports, "__esModule", { value: true });
			exports.en = exports.zh = void 0;
			exports.zh = {
			    title: 'GitHub 仓库管理',
			    description: 'AI 自动管理通道：仓库、Issue、PR、文件、标签、话题/标签页、发布与搜索。开关即时增减工具。',
			    enabledLabel: '启用 GitHub 通道',
			    enabledHint: '关闭时，全部 GitHub 工具从智能体表面注销；开启即恢复，无需重启。',
			    tokenLabel: '访问令牌（Token）',
			    tokenHint: '细粒度或个人经典令牌，仅写入不回显；留空则读取环境变量 GH_TOKEN / GITHUB_TOKEN。',
			    tokenPlaceholder: '输入新令牌以保存（不显示已存值）',
			    tokenLink: '打开令牌页面 ↗',
			    tokenGuide: '创建流程：GitHub → Settings → Developer settings → Personal access tokens → Generate new token；fine-grained 按需勾选 Contents / Issues / Pull requests / Topics（建仓库另需 Administration）。',
			    baseUrlLabel: 'API 根地址',
			    baseUrlHint: 'GitHub Enterprise 部署时改写，例如 https://ghe.example.com/api/v3。',
			    webUrlLabel: '站点根地址',
			    webUrlHint: '用于拼接结果里人类可读链接的站点根。',
			    timeoutLabel: '请求超时（毫秒）',
			    timeoutHint: '每个 REST 请求的中断上限，至少 1000。',
			    dryRunLabel: '演练模式（dry-run）',
			    dryRunHint: '开启后，变更类工具只描述将执行的动作，不发出任何写请求。',
			    save: '保存',
			    expand: '展开',
			    collapse: '折叠',
			    saving: '保存中…',
			    discard: '放弃修改',
			    unsaved: '未保存',
			    overridden: '已覆盖',
			    reset: '还原',
			    invalidNumber: '请输入数字',
			    readOnly: '当前文档为只读，无法保存。',
			    saveFailed: '上次保存未被接受，请修正后重试。',
			};
			exports.en = {
			    title: 'GitHub Manager',
			    description: 'AI auto-management channel: repos, issues, PRs, files, labels, topics/tags, releases, search. The switch adds or drops the tools live.',
			    enabledLabel: 'Enable GitHub channel',
			    enabledHint: 'When off, every GitHub tool is unregistered from the agent surface; on restores them without a restart.',
			    tokenLabel: 'Access token',
			    tokenHint: 'Fine-grained or classic PAT. Write-only: the stored value is never echoed. When empty, GH_TOKEN / GITHUB_TOKEN is read from the environment.',
			    tokenPlaceholder: 'Type a new token to save (existing value is not shown)',
			    tokenLink: 'Open token page ↗',
			    tokenGuide: 'Create one: GitHub → Settings → Developer settings → Personal access tokens → Generate new token; for fine-grained grant Contents / Issues / Pull requests / Topics (plus Administration to create repos).',
			    baseUrlLabel: 'API root',
			    baseUrlHint: 'Point at GitHub Enterprise Server, e.g. https://ghe.example.com/api/v3.',
			    webUrlLabel: 'Web root',
			    webUrlHint: 'Site root used to build human-facing links in results.',
			    timeoutLabel: 'Request timeout (ms)',
			    timeoutHint: 'Abort bound per REST request; at least 1000.',
			    dryRunLabel: 'Dry-run mode',
			    dryRunHint: 'When on, mutating tools describe the action they would take and issue no write.',
			    save: 'Save',
			    expand: 'Expand',
			    collapse: 'Collapse',
			    saving: 'Saving…',
			    discard: 'Discard',
			    unsaved: 'Unsaved',
			    overridden: 'Overridden',
			    reset: 'Reset',
			    invalidNumber: 'Enter a number',
			    readOnly: 'This document is read-only; saving is disabled.',
			    saveFailed: 'The last save was not accepted. Correct and retry.',
			};
		},
		'card-model.ts': function (require, module, exports) {
			"use strict";
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
			Object.defineProperty(exports, "__esModule", { value: true });
			exports.GitHubCardController = exports.GITHUB_MANAGER_NS = void 0;
			const client_1 = require("@deepseek-ai/dsh-client-runtime/client");
			/** The paired host settings namespace, spelled exactly as the host brands it. */
			exports.GITHUB_MANAGER_NS = 'dsh-github-manager';
			/** One field's draft: a concrete value, or CLEAR to un-overwrite back to the layer below. */
			const CLEAR = Symbol('clear');
			/**
			 * Stages one card's drafts over the 'dsh-github-manager' namespace and writes
			 * them on save. Reads the effective value as user layer over composition over
			 * section; a field's presence in the raw user layer is what marks it
			 * overridden, not a value comparison.
			 */
			class GitHubCardController {
			    scope;
			    staged = new Map();
			    saving = false;
			    failed = false;
			    /** The card's snapshot store; passed to slots.register as the store seat. */
			    store;
			    /** @param scope - the bound settings scope for the GitHub manager namespace. */
			    constructor(scope) {
			        this.scope = scope;
			        this.store = (0, client_1.createSnapshotStore)(this.project());
			        scope.subscribe(() => this.publish());
			    }
			    /**
			     * Build the face the card's slot registration injects.
			     * @returns the card's snapshot source and its actions.
			     */
			    inject() {
			        return {
			            hooks: { githubCard: this.store },
			            toggle: (field, value) => this.stage(field, value),
			            edit: (field, text) => this.stage(field, text),
			            editToken: (text) => this.stage('token', text),
			            resetField: (field) => this.stage(field, CLEAR),
			            save: () => this.save(),
			            discard: () => {
			                if (this.staged.size === 0 && !this.failed)
			                    return;
			                this.staged.clear();
			                this.failed = false;
			                this.publish();
			            },
			        };
			    }
			    stage(field, draft) {
			        this.staged.set(field, draft);
			        this.failed = false;
			        this.publish();
			    }
			    /**
			     * Write every staged draft through the scope, in staging order. The token is
			     * special-cased: an empty token draft writes nothing at all (the stored
			     * credential survives), while a typed one goes out as a plain field write.
			     */
			    async save() {
			        if (this.saving || this.staged.size === 0)
			            return;
			        if (this.hasInvalidDraft()) {
			            this.failed = true;
			            this.publish();
			            return;
			        }
			        this.saving = true;
			        this.failed = false;
			        this.publish();
			        const writes = [];
			        for (const [field, draft] of this.staged) {
			            if (field === 'token') {
			                const text = typeof draft === 'string' ? draft.trim() : '';
			                if (text !== '')
			                    writes.push(this.scope.set('token', text));
			                continue;
			            }
			            if (draft === CLEAR) {
			                writes.push(this.scope.unset(field));
			                continue;
			            }
			            writes.push(this.scope.set(field, field === 'timeoutMs' ? Number(draft) : draft));
			        }
			        try {
			            await Promise.all(writes);
			            this.staged.clear();
			        }
			        catch {
			            // Keep the drafts: a save that did not land must not throw away what
			            // the user typed; the next edit or save retries from the same state.
			            this.failed = true;
			        }
			        finally {
			            this.saving = false;
			            this.publish();
			        }
			    }
			    /** Whether any staged draft is a value its field refuses. */
			    hasInvalidDraft() {
			        for (const [field, draft] of this.staged) {
			            if (field === 'timeoutMs' && draft !== CLEAR) {
			                const parsed = Number(String(draft).trim());
			                if (!Number.isFinite(parsed) || parsed < 1000)
			                    return true;
			            }
			        }
			        return false;
			    }
			    user() {
			        return this.scope.getSnapshot().user;
			    }
			    switchState(field) {
			        if (this.staged.has(field)) {
			            const draft = this.staged.get(field);
			            // A staged clear writes nothing back, so it previews as un-overridden.
			            if (draft === CLEAR)
			                return { value: this.inherited(field), overridden: false };
			            return { value: Boolean(draft), overridden: true };
			        }
			        return { value: this.inherited(field), overridden: Object.hasOwn(this.user() ?? {}, field) };
			    }
			    /**
			     * The value the switch shows when no draft pins it: the resolved section,
			     * or - for a staged clear - the layer a save would revert to (the entry
			     * base, falling back to the schema default the host resolves with).
			     */
			    inherited(field) {
			        const snapshot = this.scope.getSnapshot();
			        if (this.staged.get(field) === CLEAR) {
			            const base = snapshot.base;
			            return field === 'enabled' ? base?.enabled ?? true : base?.dryRun ?? false;
			        }
			        return field === 'enabled' ? snapshot.value?.enabled ?? true : snapshot.value?.dryRun ?? false;
			    }
			    fieldState(field) {
			        const snapshot = this.scope.getSnapshot();
			        const userHas = Object.hasOwn(this.user() ?? {}, field);
			        if (this.staged.has(field)) {
			            const draft = this.staged.get(field);
			            if (draft === CLEAR)
			                return { text: '', overridden: false, invalid: false };
			            const text = String(draft);
			            const invalid = field === 'timeoutMs' && (!Number.isFinite(Number(text.trim())) || Number(text.trim()) < 1000 || text.trim() === '');
			            return { text, overridden: true, invalid };
			        }
			        const stored = snapshot.value?.[field];
			        const text = stored === undefined ? '' : String(stored);
			        return { text, overridden: userHas, invalid: false };
			    }
			    project() {
			        const snapshot = this.scope.getSnapshot();
			        const timeoutMs = this.fieldState('timeoutMs');
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
			        };
			    }
			    publish() {
			        this.store.set(this.project());
			    }
			}
			exports.GitHubCardController = GitHubCardController;
		},
		'GitHubCard.ts': function (require, module, exports) {
			"use strict";
			/**
			 * The GitHub manager settings card: a header naming the plugin that discloses
			 * its controls in place - the channel switch, the write-only token, and the
			 * transport fields - with the save that writes them.
			 *
			 * The shape mirrors the official plugin cards (they own their card chrome; the
			 * shared form model is not importable across plugins): the list item is the
			 * card, the header is its own disclosure button, and disclosure is
			 * card-local state - which card is open is a reading gesture, not something
			 * the Host has any stake in. Staged edits outlive collapsing, so the header
			 * carries the unsaved badge while the body is hidden. The card renders
			 * nothing while its namespace is unavailable.
			 */
			Object.defineProperty(exports, "__esModule", { value: true });
			exports.GitHubCard = GitHubCard;
			const react_1 = require("react");
			const jsx_runtime_1 = require("react/jsx-runtime");
			// Styles mirror the official card sheet inline (CSS modules are build-pipeline
			// territory this dependency-free bundle deliberately stays out of).
			const cardStyle = {
			    listStyle: 'none',
			    border: '1px solid var(--dsw-alias-border-l2)',
			    borderRadius: '12px',
			    background: 'var(--dsw-alias-bg-layer-3)',
			    transition: 'border-color .16s, background .16s',
			};
			const cardOpenStyle = { ...cardStyle, background: 'var(--dsw-alias-bg-layer-2)', borderColor: 'var(--dsw-alias-label-dimmed)' };
			const headerStyle = {
			    width: '100%',
			    appearance: 'none',
			    border: '0',
			    background: 'none',
			    font: 'inherit',
			    color: 'inherit',
			    textAlign: 'left',
			    cursor: 'pointer',
			    display: 'flex',
			    alignItems: 'center',
			    gap: '12px',
			    padding: '14px 16px',
			    borderRadius: '12px',
			};
			const headTextStyle = { flex: '1', minWidth: '0', display: 'flex', flexDirection: 'column', gap: '4px' };
			const nameStyle = { fontSize: '15px', fontWeight: '600', lineHeight: '1.4', color: 'var(--dsw-alias-label-primary)' };
			const descStyle = { fontSize: '13px', lineHeight: '1.5', color: 'var(--dsw-alias-label-tertiary)' };
			const pendingStyle = {
			    flex: 'none',
			    borderRadius: '999px',
			    padding: '1px 8px',
			    fontSize: '11px',
			    lineHeight: '17px',
			    fontWeight: '500',
			    whiteSpace: 'nowrap',
			    background: 'var(--dsw-alias-bg-module-platform)',
			    color: 'var(--dsw-alias-label-secondary)',
			};
			const chevronStyle = { flex: 'none', color: 'var(--dsw-alias-label-tertiary)', transition: 'transform .16s' };
			const chevronOpenStyle = { ...chevronStyle, transform: 'rotate(180deg)' };
			const bodyStyle = { borderTop: '1px solid var(--dsw-alias-border-l2)', margin: '0 16px', paddingBottom: '8px', display: 'flex', flexDirection: 'column', gap: '10px' };
			const readOnlyStyle = { margin: '12px 0 0', fontSize: '12px', lineHeight: '1.5', color: 'var(--dsw-alias-label-tertiary)' };
			const rowStyle = { display: 'flex', flexDirection: 'column', gap: '2px' };
			const labelStyle = { color: 'var(--dsw-alias-label-primary)', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' };
			const inputStyle = {
			    border: '1px solid var(--dsw-alias-border-l2)',
			    borderRadius: '8px',
			    background: 'var(--dsw-alias-bg-base)',
			    color: 'var(--dsw-alias-label-primary)',
			    padding: '6px 8px',
			    font: 'inherit',
			    fontSize: '13px',
			};
			const inputInvalidStyle = { ...inputStyle, borderColor: 'var(--dsw-alias-state-error-primary)' };
			const hintStyle = { color: 'var(--dsw-alias-label-tertiary)', fontSize: '11px', margin: '0' };
			const hintInvalidStyle = { ...hintStyle, color: 'var(--dsw-alias-state-error-primary)' };
			const linkStyle = { fontSize: '11px', color: 'var(--dsw-alias-brand-primary)', textDecoration: 'none', alignSelf: 'flex-start' };
			const overrideStyle = { display: 'flex', gap: '6px', alignItems: 'center', marginLeft: 'auto' };
			const overriddenBadgeStyle = { ...pendingStyle, marginLeft: '0' };
			const resetStyle = { fontSize: '11px', color: 'var(--dsw-alias-brand-primary)', background: 'none', border: 'none', cursor: 'pointer', padding: '0' };
			const footerStyle = { display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px', padding: '12px 0 4px', borderTop: '1px solid var(--dsw-alias-border-l2)' };
			const failedStyle = { flex: '1', minWidth: '0', margin: '0', fontSize: '12px', lineHeight: '1.5', color: 'var(--dsw-alias-state-error-primary)' };
			const buttonStyle = { appearance: 'none', border: '1px solid var(--dsw-alias-border-l2)', borderRadius: '8px', padding: '5px 14px', font: 'inherit', fontSize: '13px', lineHeight: '1.5', cursor: 'pointer', background: 'none', color: 'var(--dsw-alias-label-primary)' };
			const saveStyle = { ...buttonStyle, background: 'var(--dsw-alias-brand-primary)', color: '#fff', borderColor: 'transparent' };
			/** The 14px down-chevron the official cards rotate on open (inline, dependency-free). */
			function chevron(open) {
			    return (0, jsx_runtime_1.jsx)('svg', {
			        width: '14', height: '14', viewBox: '0 0 16 16', fill: 'none',
			        stroke: 'currentColor', strokeWidth: '1.5', strokeLinecap: 'round', strokeLinejoin: 'round',
			        'aria-hidden': 'true',
			        style: open ? chevronOpenStyle : chevronStyle,
			        children: (0, jsx_runtime_1.jsx)('path', { d: 'M4 6l4 4 4-4' }),
			    });
			}
			/** One boolean switch row. */
			function switchRow(t, id, state, label, hint, disabled, onToggle, onReset) {
			    return (0, jsx_runtime_1.jsxs)('div', { style: rowStyle, children: [
			            (0, jsx_runtime_1.jsxs)('label', { style: labelStyle, htmlFor: id, children: [
			                    (0, jsx_runtime_1.jsx)('input', { id, type: 'checkbox', checked: state.value, disabled, onChange: (event) => onToggle(event.currentTarget.checked) }),
			                    label,
			                    state.overridden
			                        ? (0, jsx_runtime_1.jsxs)('span', { style: overrideStyle, children: [
			                                (0, jsx_runtime_1.jsx)('span', { style: overriddenBadgeStyle, children: t('overridden') }),
			                                (0, jsx_runtime_1.jsx)('button', { type: 'button', style: resetStyle, disabled, onClick: onReset, children: t('reset') }),
			                            ] })
			                        : null,
			                ] }),
			            (0, jsx_runtime_1.jsx)('p', { style: hintStyle, children: hint }),
			        ] });
			}
			/** One text/number row. */
			function fieldRow(t, id, state, label, hint, disabled, numeric, onEdit, onReset) {
			    return (0, jsx_runtime_1.jsxs)('div', { style: rowStyle, children: [
			            (0, jsx_runtime_1.jsxs)('div', { style: labelStyle, children: [
			                    (0, jsx_runtime_1.jsx)('label', { htmlFor: id, children: label }),
			                    state.overridden
			                        ? (0, jsx_runtime_1.jsxs)('span', { style: overrideStyle, children: [
			                                (0, jsx_runtime_1.jsx)('span', { style: overriddenBadgeStyle, children: t('overridden') }),
			                                (0, jsx_runtime_1.jsx)('button', { type: 'button', style: resetStyle, disabled, onClick: onReset, children: t('reset') }),
			                            ] })
			                        : null,
			                ] }),
			            (0, jsx_runtime_1.jsx)('input', {
			                id,
			                type: 'text',
			                inputMode: numeric ? 'numeric' : undefined,
			                value: state.text,
			                disabled,
			                style: state.invalid ? inputInvalidStyle : inputStyle,
			                onChange: (event) => onEdit(event.currentTarget.value),
			            }),
			            (0, jsx_runtime_1.jsx)('p', { style: state.invalid ? hintInvalidStyle : hintStyle, children: state.invalid ? t('invalidNumber') : hint }),
			        ] });
			}
			/**
			 * Render the GitHub manager card.
			 * @param props - locale copy, the card snapshot, and its form actions.
			 * @returns the collapsed-or-open card, or nothing while the namespace is unavailable.
			 */
			function GitHubCard(props) {
			    const s = props.useGithubCard(snapshot => snapshot);
			    const [open, setOpen] = (0, react_1.useState)(false);
			    if (!s.available)
			        return null;
			    const { t } = props;
			    const title = t('title');
			    const disabled = !s.writable;
			    // The guide link follows the effective web root (draft included), so a
			    // GitHub Enterprise deployment yields its own token page, not github.com.
			    const webBase = (s.webUrl.text.trim() || 'https://github.com').replace(/\/+$/, '');
			    const tokenHref = webBase + '/settings/tokens';
			    const blocked = !s.dirty || s.invalid || s.saving;
			    return (0, jsx_runtime_1.jsxs)('li', { style: open ? cardOpenStyle : cardStyle, children: [
			            (0, jsx_runtime_1.jsxs)('button', {
			                type: 'button',
			                style: headerStyle,
			                'aria-expanded': open,
			                'aria-label': t(open ? 'collapse' : 'expand') + ': ' + title,
			                onClick: () => { setOpen(!open); },
			                children: [
			                    (0, jsx_runtime_1.jsxs)('span', { style: headTextStyle, children: [
			                            (0, jsx_runtime_1.jsx)('span', { style: nameStyle, children: title }),
			                            (0, jsx_runtime_1.jsx)('span', { style: descStyle, children: t('description') }),
			                        ] }),
			                    s.dirty ? (0, jsx_runtime_1.jsx)('span', { style: pendingStyle, children: t('unsaved') }) : null,
			                    chevron(open),
			                ],
			            }),
			            open
			                ? (0, jsx_runtime_1.jsxs)('div', { style: bodyStyle, children: [
			                        !s.writable ? (0, jsx_runtime_1.jsx)('p', { style: readOnlyStyle, role: 'status', children: t('readOnly') }) : null,
			                        switchRow(t, 'github-manager-enabled', s.enabled, t('enabledLabel'), t('enabledHint'), disabled, (v) => props.toggle('enabled', v), () => props.resetField('enabled')),
			                        (0, jsx_runtime_1.jsxs)('div', { style: rowStyle, children: [
			                                (0, jsx_runtime_1.jsx)('label', { style: labelStyle, htmlFor: 'github-manager-token', children: t('tokenLabel') }),
			                                (0, jsx_runtime_1.jsx)('input', {
			                                    id: 'github-manager-token',
			                                    type: 'password',
			                                    autoComplete: 'off',
			                                    placeholder: t('tokenPlaceholder'),
			                                    value: s.token.text,
			                                    disabled,
			                                    style: inputStyle,
			                                    onChange: (event) => props.editToken(event.currentTarget.value),
			                                }),
			                                (0, jsx_runtime_1.jsx)('a', { href: tokenHref, target: '_blank', rel: 'noopener noreferrer', style: linkStyle, children: t('tokenLink') }),
			                                (0, jsx_runtime_1.jsx)('p', { style: hintStyle, children: t('tokenGuide') }),
			                                (0, jsx_runtime_1.jsx)('p', { style: hintStyle, children: t('tokenHint') }),
			                            ] }),
			                        fieldRow(t, 'github-manager-base-url', s.baseUrl, t('baseUrlLabel'), t('baseUrlHint'), disabled, false, (v) => props.edit('baseUrl', v), () => props.resetField('baseUrl')),
			                        fieldRow(t, 'github-manager-web-url', s.webUrl, t('webUrlLabel'), t('webUrlHint'), disabled, false, (v) => props.edit('webUrl', v), () => props.resetField('webUrl')),
			                        fieldRow(t, 'github-manager-timeout', s.timeoutMs, t('timeoutLabel'), t('timeoutHint'), disabled, true, (v) => props.edit('timeoutMs', v), () => props.resetField('timeoutMs')),
			                        switchRow(t, 'github-manager-dry-run', s.dryRun, t('dryRunLabel'), t('dryRunHint'), disabled, (v) => props.toggle('dryRun', v), () => props.resetField('dryRun')),
			                        (0, jsx_runtime_1.jsxs)('div', { style: footerStyle, children: [
			                                s.failed ? (0, jsx_runtime_1.jsx)('p', { role: 'status', style: failedStyle, children: t('saveFailed') }) : null,
			                                (0, jsx_runtime_1.jsx)('button', { type: 'button', style: buttonStyle, disabled: !s.dirty || s.saving, onClick: props.discard, children: t('discard') }),
			                                (0, jsx_runtime_1.jsx)('button', { type: 'button', style: saveStyle, disabled: blocked, onClick: props.save, children: t(s.saving ? 'saving' : 'save') }),
			                            ] }),
			                    ] })
			                : null,
			        ] });
			}
		},
		'index.ts': function (require, module, exports) {
			"use strict";
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
			Object.defineProperty(exports, "__esModule", { value: true });
			exports.inject = exports.LOCALE_NS = void 0;
			exports.apply = apply;
			const card_model_ts_1 = require("./card-model.ts");
			const GitHubCard_ts_1 = require("./GitHubCard.ts");
			const locales_ts_1 = require("./locales.ts");
			/** Namespace owning this card's copy. */
			exports.LOCALE_NS = 'settings.githubManager';
			/** Required client services. */
			exports.inject = ['slots', 'locale', 'connection', 'remote', 'settingsScope'];
			/**
			 * Register the GitHub manager card into the plugins section's item slot.
			 * @param ctx - the browser plugin context.
			 */
			function apply(ctx) {
			    ctx.effect(() => ctx.locale.register(exports.LOCALE_NS, { zh: locales_ts_1.zh, en: locales_ts_1.en }), 'dsh-github-manager: card dictionaries');
			    const card = new card_model_ts_1.GitHubCardController(ctx.settingsScope.bind({ namespace: card_model_ts_1.GITHUB_MANAGER_NS }));
			    ctx.slots.inject('settings.plugin.item', () => ctx.slots.register({
			        name: 'settings.plugin.item',
			        key: card_model_ts_1.GITHUB_MANAGER_NS,
			        locale: exports.LOCALE_NS,
			        inject: () => card.inject(),
			    }, GitHubCard_ts_1.GitHubCard));
			}
		}
		};
		const __cache = {};
		const __require = (spec) => {
			if (typeof spec === 'string' && spec.slice(0, 2) === './') {
				const id = spec.slice(2);
				const define = __modules[id];
				if (define === undefined) throw new Error('dsh-github-manager client: unknown module ' + id);
				if (!(id in __cache)) {
					const inner = { exports: {} };
					__cache[id] = inner.exports;
					define(__require, inner, inner.exports);
					__cache[id] = inner.exports;
				}
				return __cache[id];
			}
			return require(spec);
		};
		const entry = __require('./index.ts');
		Object.assign(exports, entry);
		return module.exports;
	},
});
