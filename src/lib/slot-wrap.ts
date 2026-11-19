/*!
 * Wrapping dsh's own slot entries in place.
 *
 * Several parts change how one of dsh's own rows renders without drawing a rival: the conversation
 * list (conversation-flow), a failed turn and a retry (error-notes), a program's edits (ptc-diffs).
 * A rival entry cannot do that — dsh hands its render context (renderSlot, the node) only to the entry
 * that declared the slot, and a keyed slot is declared once. So the component of dsh's entry is
 * swapped for a wrapper that calls the original, and swapped back on dispose. dsh re-registers its
 * entries (a reload, a locale change), so the slot is watched and every new entry is wrapped too.
 *
 * Only dsh's entries are touched: an entry another plugin registered carries an `id`.
 */
function wrapNativeEntries(ctx: PartContext, o: {
  slot: string
  /** names the marker (Symbol.for) that tells our wrapper from dsh's component */
  tag: string
  /** the effect's label in the plugin inspector */
  label: string
  /** the wrapper maker for one of dsh's entries, or null to leave that entry alone */
  wrap(entry: any): ((original: any) => any) | null
  /** after every pass, with how many entries are wrapped now (0 once disposed) */
  onSync?(count: number): void
}) {
  const OURS = Symbol.for(`dsh-conversation-enhancer/${o.tag}`)
  const patched = new Map() // entry -> its original component
  const restore = () => {
    for (const [entry, original] of patched) if (entry.component && entry.component[OURS]) entry.component = original
    patched.clear()
    if (o.onSync) o.onSync(0)
  }
  const sync = () => {
    const live = new Set()
    for (const entry of ctx.slots.entries(o.slot)) {
      if ((entry.options && entry.options.id) || !entry.component) continue
      const make = o.wrap(entry)
      if (!make) continue
      live.add(entry)
      if (entry.component[OURS]) continue
      const original = entry.component
      const wrapped = make(original)
      wrapped[OURS] = true
      entry.component = wrapped
      patched.set(entry, original)
    }
    // an entry dsh dropped is gone with its component: nothing to put back
    for (const entry of [...patched.keys()]) if (!live.has(entry)) patched.delete(entry)
    if (o.onSync) o.onSync(patched.size)
  }
  let timer
  ctx.effect(() => {
    const unsub = ctx.slots.subscribe(o.slot, () => { clearTimeout(timer); timer = setTimeout(sync, 0) })
    sync()
    return () => { clearTimeout(timer); unsub(); restore() }
  }, o.label)
}
