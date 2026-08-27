/**
 * Ambient declarations for the react modules the web shell seeds into the
 * client module registry. The card builds elements with plain jsx()/jsxs()
 * calls (no JSX syntax, no tsconfig jsx flag) and takes one hook, useState,
 * from bare react at runtime. This package deliberately ships zero build-time
 * react dependency: these declarations describe exactly the runtime surface
 * used, and the loader's module registry provides the real implementations.
 */

declare module 'react' {
  /** Stateful value hook - the only hook this package's card uses. */
  export function useState<S>(initial: S | (() => S)): [S, (next: S | ((prev: S) => S)) => void]
}

declare module 'react/jsx-runtime' {
  /** Element shape is opaque to this package; the renderer consumes it. */
  export type Element = { readonly type: unknown; readonly props: Record<string, unknown> }
  /** Create one element. */
  export function jsx(type: unknown, props: Record<string, unknown>, key?: unknown): Element
  /** Create one element with multiple children. */
  export function jsxs(type: unknown, props: Record<string, unknown>, key?: unknown): Element
  /** Fragment marker. */
  export const Fragment: unknown
}
