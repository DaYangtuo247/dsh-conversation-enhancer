/*!
 * Ambient surface of the bundle scope.
 *
 * build.mjs concatenates every src/lib/*.ts and then every src/parts/*.ts into one IIFE, so these
 * declarations describe what is already in scope at runtime: `part` comes from the bundle wrapper
 * (dsh-claude-shared/build.mjs), `makeKit`/`featureStore`/`gateFeature` from kit.js, and each part
 * receives the resulting `kit`. Nothing here is emitted; tsc uses it for checking only.
 */

/** Handle returned by kit.sheet(); ensure() is idempotent, remove() undoes it. */
interface Sheet {
  ensure(): void
  remove(): void
}

/** The settings rows every dsh-claude bundle shares (kit.settingsUI()). */
interface SettingsUI {
  /** the settings rows' own stylesheet (makeSettingsUI calls kit.sheet('settings-ui', …) once) */
  sheet: Sheet
  Row(props: { label: any; desc?: any; children?: any }): any
  Select(props: {
    value: any
    options: Array<{ v: any; label?: any; zh?: string; en?: string; font?: string }>
    onChange(v: any): void
    box?: boolean
    label?: string
  }): any
  Switch(props: { checked: boolean; onChange(v: boolean): void; label?: string }): any
  L(o: { zh: string; en: string }): string
  S(zh: string, en: string): string
}

/**
 * The frame-coalesced MutationObserver hub. The `dom-hub` part installs it into kit.dom before any
 * other part applies, so every later part can rely on it being there.
 */
interface DomHub {
  subscribe(fn: (records: MutationRecord[]) => void): () => void
  /** true when any record in the batch adds, removes or touches something matching the selector. */
  touches(records: MutationRecord[], sel: string): boolean
  /** calls fn whenever an attribute on <html> changes (data-dcd-view, lang, the theme flavour, …). */
  attr(fn: () => void): () => void
  /** ask for one more dispatch of the current subscribers on the next frame. */
  poke(): void
}

/** The React surface this bundle actually uses. */
interface ReactLike {
  /** class components: this bundle's render boundary is the only one */
  Component: new (props: any) => any
  createElement(type: any, props?: any, ...children: any[]): any
  Fragment: any
  memo<T>(component: T, compare?: (a: any, b: any) => boolean): T
  useState<S>(init: S | (() => S)): [S, (v: S | ((prev: S) => S)) => void]
  useRef<T = any>(init?: T | null): { current: T }
  useEffect(fn: () => void | (() => void), deps?: readonly unknown[]): void
  useLayoutEffect(fn: () => void | (() => void), deps?: readonly unknown[]): void
  useMemo<T>(fn: () => T, deps?: readonly unknown[]): T
  useCallback<T extends (...a: any[]) => any>(fn: T, deps?: readonly unknown[]): T
  useSyncExternalStore<T>(subscribe: (onChange: () => void) => () => void, get: () => T, getServer?: () => T): T
}

/** What makeKit() hands every part. `dom` and `vocab` are filled in by the parts that own them. */
interface Kit {
  React: ReactLike
  /** React.createElement, kept under its old name for readability at call sites. */
  h(type: any, props?: any, ...children: any[]): any
  /** Renders into <body> so no transformed ancestor can offset a position:fixed popover. */
  portal(el: any, target?: Element): any
  sheet(name: string, css: string): Sheet
  settingsUI(): SettingsUI
  /** installed by the `dom-hub` part (00) */
  dom: DomHub
  /** installed by the `display-shared` part (00-shared): the words and kinds every part reads. */
  vocab: Vocab
  /** installed by the `conversation-flow` part (08): a path printed by a row → that row's tile URL. */
  picUrl?: (raw: string) => string
  /** flow key of a rendered row → the file URL of the picture that row's own call named. */
  picForRow?: (flowKey: string) => string
  /** the same, by the call id dsh prints on the row (`data-chat-call-id`). */
  picForCall?: (callId: string) => string
  /** A PTC program by its row's call id: how many calls it made, and whether it only wraps one (conversation-flow). */
  programOf?: (callId: string) => { subCalls: number; thin: boolean } | null
  picForText?: (text: string) => string
}

/** Feature toggle metadata: one row in 设置 › 插件功能. */
interface FeatureMeta {
  id: string
  zh: string
  en: string
}

/** The cordis context a part's apply() receives (only the members used here are typed). */
interface PartContext {
  locale: any
  configForms: any
  slots: {
    inject(key: string, cb: (slots: any) => any): () => void
    register(...a: any[]): any
    subscribe(...a: any[]): any
    entries: any
    [k: string]: any
  }
  inject(name: string | string[], fn?: (scope: PartContext) => void): any
  effect(fn: () => void | (() => void), label?: string): void
  extend(o: any): PartContext
  plugin(o: { name: string; inject?: string[]; apply(ctx: PartContext): void }): { dispose(): any }
  [k: string]: any
}

/** What a part's factory returns; a part without `feature` runs on the plain synchronous path. */
interface PartModule {
  inject?: string[]
  apply(ctx: PartContext): void
}

/** A part definition, as consumed by the bundle wrapper. */
interface PartDefinition {
  id: string
  feature?: FeatureMeta
  factory(require: (id: string) => any, kit: Kit): PartModule
}

/** Registers one part with the bundle wrapper. */
declare function part(def: PartDefinition): void
