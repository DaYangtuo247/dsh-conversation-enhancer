/*!
 * auto-older — load earlier history as you scroll up, instead of pressing 「加载更早」.
 *
 * dsh pages a long transcript: the top of the list has a 「加载更早」 button whose handler
 * (scroll.loadEarlier) fetches one older page and keeps the reader's position while it lands.
 * We press that same button for the reader once they have actually reached the top, so history
 * streams in ahead of them, the way the quiet list does.
 *
 * Deliberately one page per reader gesture, and only at the top:
 *   - the 「加载更早」 line has to be within AHEAD viewport heights of the top edge;
 *   - after a page lands nothing else loads: the reader has to move again (and the shift the page
 *     itself caused does not count), so a small scroll up can never pull in half the history and
 *     leave a long way back down;
 *   - a disabled button or a page already in flight is left alone.
 * Cheap by design: no observers on the list itself (it mutates on every streamed token), at most
 * one look per frame, and nothing at all unless the reader moves.
 */
part({
  id: 'auto-older',
  factory(require, kit) {
    const SCROLL = '[data-conversation-scroll]'
    const BUTTON = '[data-chat-flow] > [class*="_older"] > button'
    const AHEAD = 0.6 // how close (in viewport heights) the 加载更早 line must be to the top edge
    const SETTLE = 600 // ms after a page lands in which scroll movement is dsh keeping the position
    const sheet = kit.sheet('auto-older', CSS_AUTO_OLDER)

    return {
      inject: [],
      apply(ctx) {
        sheet.ensure()
        let frame = 0
        let armed = true // a page may load: reset by a reader gesture, cleared by loading one
        let landedAt = 0

        function check(scroller) {
          if (!armed) return
          const button = scroller.querySelector(BUTTON)
          if (!button || button.disabled) return
          const box = scroller.getBoundingClientRect()
          const at = button.getBoundingClientRect()
          if (at.bottom < box.top - box.height * AHEAD) return
          armed = false
          landedAt = performance.now()
          button.click()
        }

        // only the reader's own movement arms a page; the shift dsh makes to keep the position
        // while a page lands changes scrollTop too, and must not count as "scrolled up again"
        function onReaderMove(e) {
          if (e.type === 'wheel' && e.deltaY >= 0) return
          // a wheel event targets the innermost element under the pointer, never the scroll container
          // itself, so the identity test only makes sense for scroll events
          const scroller = e.target instanceof Element ? e.target.closest(SCROLL) : null
          if (!scroller || (e.type !== 'wheel' && e.target !== scroller)) return
          if (performance.now() - landedAt < SETTLE) return
          armed = true
          if (frame) return
          frame = requestAnimationFrame(() => { frame = 0; check(scroller) })
        }

        ctx.effect(() => {
          document.addEventListener('scroll', onReaderMove, { capture: true, passive: true })
          document.addEventListener('wheel', onReaderMove, { capture: true, passive: true })
          return () => {
            document.removeEventListener('scroll', onReaderMove, { capture: true })
            document.removeEventListener('wheel', onReaderMove, { capture: true })
            cancelAnimationFrame(frame); sheet.remove()
          }
        }, 'auto-older: page in history at the top, one page per gesture')
      },
    }
  },
})
