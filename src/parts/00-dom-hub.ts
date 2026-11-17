/*!
 * dom-hub — one shared, frame-coalesced MutationObserver for every DOM-scanning part.
 *
 * Before, five parts each watched document.body with their own observer and timer (16/40/50/50/80 ms),
 * so a single streamed token woke five full-document scans, several of which forced synchronous
 * layout. Here one observer collects mutations and dispatches them once per animation frame to every
 * subscriber. Subscribers stay cheap by testing the mutation records for relevance (kit.dom.touches)
 * instead of re-scanning the whole transcript: pure text streaming no longer wakes the tool-group,
 * plan-card or fork-button passes at all.
 */
part({
  id: 'dom-hub',
  factory(require, kit) {
    const subs = new Set<{ fn: (records: MutationRecord[]) => void }>()
    let mo = null
    let raf = 0
    let pending = []
    // the union of what any subscriber cares about; characterData is needed by bash-highlight only,
    // but coalescing it here costs one callback per frame instead of a fifth observer
    const CONFIG = {
      childList: true, subtree: true, characterData: true, attributes: true,
      // `data-dcd-group-hide` is written by tool-groups on every member row on every pass; waking every
      // subscriber for our own bookkeeping cost the plan card a sync() per grouping pass. Nothing
      // watches it, so it is out of the filter.
      attributeFilter: ['data-state', 'aria-expanded', 'src', 'data-status', 'data-turn-process-hidden', 'hidden'],
    }
    function flush() {
      raf = 0
      const recs = pending
      pending = []
      for (const s of [...subs]) { try { s.fn(recs) } catch (e) { console.error('[dsh-conversation-enhancer/dom-hub]', e) } }
    }
    function schedule() { if (!raf) raf = requestAnimationFrame(flush) }
    function ensure() {
      if (mo) return
      // loop, not spread: one huge batch must not hit the argument limit
      mo = new MutationObserver((recs) => { for (const r of recs) pending.push(r); schedule() })
      mo.observe(document.body, CONFIG)
    }

    // <html> attributes several parts read (data-dcd-view view, lang): one observer for them all,
    // instead of a private MutationObserver per part. Subscribers re-read the attributes
    // themselves — there are only these two, and a read is cheaper than dispatching records.
    const attrSubs = new Set<() => void>()
    let attrMo = null
    function ensureAttr() {
      if (attrMo) return
      attrMo = new MutationObserver(() => { for (const s of [...attrSubs]) { try { s() } catch (e) { console.error('[dsh-conversation-enhancer/dom-hub]', e) } } })
      attrMo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-dcd-view', 'lang'] })
    }
    /** Did any record add / remove / touch an element matching sel (or inside one)? O(records), not O(page). */
    function touches(records, sel) {
      for (const r of records) {
        if (r.type === 'childList') {
          for (const n of r.addedNodes) if (n.nodeType === 1 && (n.matches(sel) || n.querySelector(sel))) return true
          for (const n of r.removedNodes) if (n.nodeType === 1 && (n.matches(sel) || n.querySelector(sel))) return true
        } else {
          let t = r.target
          if (t && t.nodeType === 3) t = t.parentElement
          if (t && t.nodeType === 1 && (t.matches(sel) || t.closest(sel))) return true
        }
      }
      return false
    }
    kit.dom = {
      /** fn(records) runs once per frame while mutations occur; returns an unsubscribe. */
      subscribe(fn) {
        const s = { fn }
        subs.add(s)
        ensure()
        return () => {
          subs.delete(s)
          if (!subs.size) {
            if (mo) { mo.disconnect(); mo = null }
            if (raf) { cancelAnimationFrame(raf); raf = 0 }
            pending = []
          }
        }
      },
      touches,
      /** fn() runs whenever <html>'s data-dcd-view / lang changes; returns an unsubscribe. */
      attr(fn) {
        attrSubs.add(fn)
        ensureAttr()
        return () => {
          attrSubs.delete(fn)
          if (!attrSubs.size && attrMo) { attrMo.disconnect(); attrMo = null }
        }
      },
      /** ask for a dispatch next frame even without a mutation (manual toggles) */
      poke() { schedule() },
    }
    return { inject: [], apply() {} }
  },
})