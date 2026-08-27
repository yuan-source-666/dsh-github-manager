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

import { useState } from 'react'
import { jsx as h, jsxs as hh } from 'react/jsx-runtime'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { FieldState, GitHubCardFace, SwitchState } from './card-model.ts'
import type { GitHubManagerLocaleKey } from './locales.ts'

/** Props the renderer binds for the card. */
export type GitHubCardProps =
  PropsRuntime<'settings.plugin.item'>
  & PropsLocale<'settings.githubManager'>
  & InjectFace<GitHubCardFace>

// Styles mirror the official card sheet inline (CSS modules are build-pipeline
// territory this dependency-free bundle deliberately stays out of).
const cardStyle: Record<string, string> = {
  listStyle: 'none',
  border: '1px solid var(--dsw-alias-border-l2)',
  borderRadius: '12px',
  background: 'var(--dsw-alias-bg-layer-3)',
  transition: 'border-color .16s, background .16s',
}
const cardOpenStyle: Record<string, string> = { ...cardStyle, background: 'var(--dsw-alias-bg-layer-2)', borderColor: 'var(--dsw-alias-label-dimmed)' }
const headerStyle: Record<string, string> = {
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
}
const headTextStyle: Record<string, string> = { flex: '1', minWidth: '0', display: 'flex', flexDirection: 'column', gap: '4px' }
const nameStyle: Record<string, string> = { fontSize: '15px', fontWeight: '600', lineHeight: '1.4', color: 'var(--dsw-alias-label-primary)' }
const descStyle: Record<string, string> = { fontSize: '13px', lineHeight: '1.5', color: 'var(--dsw-alias-label-tertiary)' }
const pendingStyle: Record<string, string> = {
  flex: 'none',
  borderRadius: '999px',
  padding: '1px 8px',
  fontSize: '11px',
  lineHeight: '17px',
  fontWeight: '500',
  whiteSpace: 'nowrap',
  background: 'var(--dsw-alias-bg-module-platform)',
  color: 'var(--dsw-alias-label-secondary)',
}
const chevronStyle: Record<string, string> = { flex: 'none', color: 'var(--dsw-alias-label-tertiary)', transition: 'transform .16s' }
const chevronOpenStyle: Record<string, string> = { ...chevronStyle, transform: 'rotate(180deg)' }
const bodyStyle: Record<string, string> = { borderTop: '1px solid var(--dsw-alias-border-l2)', margin: '0 16px', paddingBottom: '8px', display: 'flex', flexDirection: 'column', gap: '10px' }
const readOnlyStyle: Record<string, string> = { margin: '12px 0 0', fontSize: '12px', lineHeight: '1.5', color: 'var(--dsw-alias-label-tertiary)' }
const rowStyle: Record<string, string> = { display: 'flex', flexDirection: 'column', gap: '2px' }
const labelStyle: Record<string, string> = { color: 'var(--dsw-alias-label-primary)', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }
const inputStyle: Record<string, string> = {
  border: '1px solid var(--dsw-alias-border-l2)',
  borderRadius: '8px',
  background: 'var(--dsw-alias-bg-base)',
  color: 'var(--dsw-alias-label-primary)',
  padding: '6px 8px',
  font: 'inherit',
  fontSize: '13px',
}
const inputInvalidStyle: Record<string, string> = { ...inputStyle, borderColor: 'var(--dsw-alias-state-error-primary)' }
const hintStyle: Record<string, string> = { color: 'var(--dsw-alias-label-tertiary)', fontSize: '11px', margin: '0' }
const hintInvalidStyle: Record<string, string> = { ...hintStyle, color: 'var(--dsw-alias-state-error-primary)' }
const linkStyle: Record<string, string> = { fontSize: '11px', color: 'var(--dsw-alias-brand-primary)', textDecoration: 'none', alignSelf: 'flex-start' }
const overrideStyle: Record<string, string> = { display: 'flex', gap: '6px', alignItems: 'center', marginLeft: 'auto' }
const overriddenBadgeStyle: Record<string, string> = { ...pendingStyle, marginLeft: '0' }
const resetStyle: Record<string, string> = { fontSize: '11px', color: 'var(--dsw-alias-brand-primary)', background: 'none', border: 'none', cursor: 'pointer', padding: '0' }
const footerStyle: Record<string, string> = { display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px', padding: '12px 0 4px', borderTop: '1px solid var(--dsw-alias-border-l2)' }
const failedStyle: Record<string, string> = { flex: '1', minWidth: '0', margin: '0', fontSize: '12px', lineHeight: '1.5', color: 'var(--dsw-alias-state-error-primary)' }
const buttonStyle: Record<string, string> = { appearance: 'none', border: '1px solid var(--dsw-alias-border-l2)', borderRadius: '8px', padding: '5px 14px', font: 'inherit', fontSize: '13px', lineHeight: '1.5', cursor: 'pointer', background: 'none', color: 'var(--dsw-alias-label-primary)' }
const saveStyle: Record<string, string> = { ...buttonStyle, background: 'var(--dsw-alias-brand-primary)', color: '#fff', borderColor: 'transparent' }

/** The 14px down-chevron the official cards rotate on open (inline, dependency-free). */
function chevron(open: boolean) {
  return h('svg', {
    width: '14', height: '14', viewBox: '0 0 16 16', fill: 'none',
    stroke: 'currentColor', strokeWidth: '1.5', strokeLinecap: 'round', strokeLinejoin: 'round',
    'aria-hidden': 'true',
    style: open ? chevronOpenStyle : chevronStyle,
    children: h('path', { d: 'M4 6l4 4 4-4' }),
  })
}

/** One boolean switch row. */
function switchRow(
  t: (key: GitHubManagerLocaleKey) => string,
  id: string,
  state: SwitchState,
  label: string,
  hint: string,
  disabled: boolean,
  onToggle: (value: boolean) => void,
  onReset: () => void,
) {
  return hh('div', { style: rowStyle, children: [
    hh('label', { style: labelStyle, htmlFor: id, children: [
      h('input', { id, type: 'checkbox', checked: state.value, disabled, onChange: (event: { currentTarget: { checked: boolean } }) => onToggle(event.currentTarget.checked) }),
      label,
      state.overridden
        ? hh('span', { style: overrideStyle, children: [
            h('span', { style: overriddenBadgeStyle, children: t('overridden') }),
            h('button', { type: 'button', style: resetStyle, disabled, onClick: onReset, children: t('reset') }),
          ] })
        : null,
    ] }),
    h('p', { style: hintStyle, children: hint }),
  ] })
}

/** One text/number row. */
function fieldRow(
  t: (key: GitHubManagerLocaleKey) => string,
  id: string,
  state: FieldState,
  label: string,
  hint: string,
  disabled: boolean,
  numeric: boolean,
  onEdit: (text: string) => void,
  onReset: () => void,
) {
  return hh('div', { style: rowStyle, children: [
    hh('div', { style: labelStyle, children: [
      h('label', { htmlFor: id, children: label }),
      state.overridden
        ? hh('span', { style: overrideStyle, children: [
            h('span', { style: overriddenBadgeStyle, children: t('overridden') }),
            h('button', { type: 'button', style: resetStyle, disabled, onClick: onReset, children: t('reset') }),
          ] })
        : null,
    ] }),
    h('input', {
      id,
      type: 'text',
      inputMode: numeric ? 'numeric' : undefined,
      value: state.text,
      disabled,
      style: state.invalid ? inputInvalidStyle : inputStyle,
      onChange: (event: { currentTarget: { value: string } }) => onEdit(event.currentTarget.value),
    }),
    h('p', { style: state.invalid ? hintInvalidStyle : hintStyle, children: state.invalid ? t('invalidNumber') : hint }),
  ] })
}

/**
 * Render the GitHub manager card.
 * @param props - locale copy, the card snapshot, and its form actions.
 * @returns the collapsed-or-open card, or nothing while the namespace is unavailable.
 */
export function GitHubCard(props: GitHubCardProps) {
  const s = props.useGithubCard(snapshot => snapshot)
  const [open, setOpen] = useState(false)
  if (!s.available) return null
  const { t } = props
  const title = t('title')
  const disabled = !s.writable
  // The guide link follows the effective web root (draft included), so a
  // GitHub Enterprise deployment yields its own token page, not github.com.
  const webBase = (s.webUrl.text.trim() || 'https://github.com').replace(/\/+$/, '')
  const tokenHref = webBase + '/settings/tokens'
  const blocked = !s.dirty || s.invalid || s.saving
  return hh('li', { style: open ? cardOpenStyle : cardStyle, children: [
    hh('button', {
      type: 'button',
      style: headerStyle,
      'aria-expanded': open,
      'aria-label': t(open ? 'collapse' : 'expand') + ': ' + title,
      onClick: () => { setOpen(!open) },
      children: [
        hh('span', { style: headTextStyle, children: [
          h('span', { style: nameStyle, children: title }),
          h('span', { style: descStyle, children: t('description') }),
        ] }),
        s.dirty ? h('span', { style: pendingStyle, children: t('unsaved') }) : null,
        chevron(open),
      ],
    }),
    open
      ? hh('div', { style: bodyStyle, children: [
          !s.writable ? h('p', { style: readOnlyStyle, role: 'status', children: t('readOnly') }) : null,
          switchRow(t, 'github-manager-enabled', s.enabled, t('enabledLabel'), t('enabledHint'), disabled, (v) => props.toggle('enabled', v), () => props.resetField('enabled')),
          hh('div', { style: rowStyle, children: [
            h('label', { style: labelStyle, htmlFor: 'github-manager-token', children: t('tokenLabel') }),
            h('input', {
              id: 'github-manager-token',
              type: 'password',
              autoComplete: 'off',
              placeholder: t('tokenPlaceholder'),
              value: s.token.text,
              disabled,
              style: inputStyle,
              onChange: (event: { currentTarget: { value: string } }) => props.editToken(event.currentTarget.value),
            }),
            h('a', { href: tokenHref, target: '_blank', rel: 'noopener noreferrer', style: linkStyle, children: t('tokenLink') }),
            h('p', { style: hintStyle, children: t('tokenGuide') }),
            h('p', { style: hintStyle, children: t('tokenHint') }),
          ] }),
          fieldRow(t, 'github-manager-base-url', s.baseUrl, t('baseUrlLabel'), t('baseUrlHint'), disabled, false, (v) => props.edit('baseUrl', v), () => props.resetField('baseUrl')),
          fieldRow(t, 'github-manager-web-url', s.webUrl, t('webUrlLabel'), t('webUrlHint'), disabled, false, (v) => props.edit('webUrl', v), () => props.resetField('webUrl')),
          fieldRow(t, 'github-manager-timeout', s.timeoutMs, t('timeoutLabel'), t('timeoutHint'), disabled, true, (v) => props.edit('timeoutMs', v), () => props.resetField('timeoutMs')),
          switchRow(t, 'github-manager-dry-run', s.dryRun, t('dryRunLabel'), t('dryRunHint'), disabled, (v) => props.toggle('dryRun', v), () => props.resetField('dryRun')),
          hh('div', { style: footerStyle, children: [
            s.failed ? h('p', { role: 'status', style: failedStyle, children: t('saveFailed') }) : null,
            h('button', { type: 'button', style: buttonStyle, disabled: !s.dirty || s.saving, onClick: props.discard, children: t('discard') }),
            h('button', { type: 'button', style: saveStyle, disabled: blocked, onClick: props.save, children: t(s.saving ? 'saving' : 'save') }),
          ] }),
        ] })
      : null,
  ] })
}
