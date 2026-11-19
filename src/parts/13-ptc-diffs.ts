/*!
 * dsh-ptc-diffs — browser half.
 *
 * An edit a PTC program (run_code) made is drawn by dsh's own edit row, but without its diff: the
 * diff model leaves out any call that has a parent (`parentCallId`), so the row says 「1KB」 with no
 * +N -M, and opened it shows only 「The file … has been updated successfully.」. The reason is the
 * path: a program may run in another directory, so a relative path in its arguments is not one dsh
 * can trust. A settled edit's result records where it wrote, though — an absolute `meta.path` and
 * the applied hunks in `meta.diffs` (none for a write that created its file), each with an absolute path.
 *
 * So for exactly those calls (settled, not failed, every recorded path absolute), the row is handed
 * the call without its parent link, and dsh draws what it draws for any other edit: its diff when
 * opened and its own +N -M after the size. Like error-notes, this wraps the component of dsh's own
 * keyed entries (`tool.call.toolview` · edit / write / apply_patch) in place and puts it back on
 * dispose; nothing of dsh's is redrawn.
 */
part({
  id: 'dsh-ptc-diffs',
  factory(require, kit) {
    const { h } = kit
    const SLOT = 'tool.call.toolview'
    const KEYS = new Set(['edit', 'write', 'apply_patch'])
    const OURS = Symbol.for('dsh-conversation-enhancer/ptc-diffs')
    const absolute = (p) => typeof p === 'string' && (p.startsWith('/') || /^[A-Za-z]:[\\/]/.test(p))

    /** A program's settled edit whose result says where it wrote, absolutely: safe to draw as any edit. */
    function trusted(block) {
      if (!block || block.parentCallId === undefined || !('kind' in block) || block.isError) return false
      const meta = block.meta
      if (!meta || typeof meta !== 'object' || Array.isArray(meta) || !absolute(meta.path)) return false
      // empty for a write that created its file: dsh then shows the whole content as added
      const diffs = meta.diffs
      return Array.isArray(diffs) && diffs.every((d) => d && absolute(d.path) && typeof d.newText === 'string')
    }
    // one copy per block, so dsh's own per-block caches (parsed arguments, the diff) keep working
    const copies = new WeakMap()
    function standalone(block) {
      let c = copies.get(block)
      if (!c) {
        c = { ...block }
        delete c.parentCallId
        copies.set(block, c)
      }
      return c
    }

    function wrap(Native) {
      return function PtcEditRow(props) {
        return trusted(props.block) ? h(Native, { ...props, block: standalone(props.block) }) : h(Native, props)
      }
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        const patched = new Map() // entry -> original component
        const restore = () => {
          for (const [entry, original] of patched) if (entry.component && entry.component[OURS]) entry.component = original
          patched.clear()
        }
        const sync = () => {
          const live = new Set()
          for (const entry of ctx.slots.entries(SLOT)) {
            const key = entry.options && entry.options.key
            // dsh's own entries only (ours carry an id)
            if (!KEYS.has(key) || (entry.options && entry.options.id) || !entry.component) continue
            live.add(entry)
            if (entry.component[OURS]) continue
            const original = entry.component
            const Wrapped = wrap(original)
            Wrapped[OURS] = true
            entry.component = Wrapped
            patched.set(entry, original)
          }
          for (const entry of [...patched.keys()]) if (!live.has(entry)) patched.delete(entry)
        }
        let timer
        ctx.effect(() => {
          const unsub = ctx.slots.subscribe(SLOT, () => { clearTimeout(timer); timer = setTimeout(sync, 0) })
          sync()
          return () => { clearTimeout(timer); unsub(); restore() }
        }, 'ptc-diffs: draw a program\'s edits with their diff')
      },
    }
  },
})
