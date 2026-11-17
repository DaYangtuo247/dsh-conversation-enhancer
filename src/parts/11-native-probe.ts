/*!
 * native-probe — say it in the console when a dsh upgrade moves something we style.
 *
 * dsh sets no contract for its own DOM: `data-chat-flow-kind`, `data-disclosure-row` and the
 * CSS-Modules fragments (`_bubble`, `_actions`, …) are internal. When one is renamed, nothing
 * throws — our selectors just stop matching and the page quietly falls back to dsh's look, which
 * reads as "the plugin stopped working" weeks later. This part checks the list in
 * src/lib/native.ts a couple of times per page load (the transcript fills in after mount) and
 * reports a missing row once, naming what the reader would notice.
 *
 * Quiet on purpose:
 *   - only in a chat page (no `[data-chat-flow]`, nothing to judge);
 *   - a row whose `signal` is absent is simply not on screen yet, not broken;
 *   - one report per page load, and only after the flow has had time to render;
 *   - nothing runs while the page sits idle after that.
 */
part({
  id: 'native-probe',
  factory(require, kit) {
    const FIRST = 5000 // ms after mount: the transcript has painted
    const SECOND = 20000 // ms: a session that was still loading its first page now has rows
    return {
      inject: [],
      apply(ctx) {
        const timers: ReturnType<typeof setTimeout>[] = []
        let reported = false
        const look = () => {
          if (reported) return
          const missing = probeNative(document)
          document.documentElement.dataset.dchrMissing = String(missing.length)
          if (!missing.length) return
          reported = true
          console.warn(
            `[dsh-conversation-enhancer] dsh moved ${missing.length} thing(s) this bundle styles — ` +
              'these rows have fallen back to dsh’s own look:',
            missing.map((row) => `${row.what} — ${row.sel}`),
          )
        }
        timers.push(setTimeout(look, FIRST), setTimeout(look, SECOND))
        ctx.effect(() => () => {
          for (const t of timers) clearTimeout(t)
        }, 'native-probe: timers')
      },
    }
  },
})
