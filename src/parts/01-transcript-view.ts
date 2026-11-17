/*!
 * dsh-transcript-view — browser half.
 *
 * A quiet transcript view, replacing dsh's own 工作步骤展示 (Settings › 通用设置):
 *   标准 / Normal     replies and one-line command rows, thinking hidden
 *   思考 / Thinking   thinking expanded
 *   详尽 / Verbose    thinking plus every command's input and output
 * dsh's own modes fold finished turns and group steps themselves, which fought this view and
 * dsh-tool-groups. So this part takes the setting over: dsh's value (ui-chat.transcriptView) is held
 * at 完全展开, the only mode where dsh folds nothing, and this part's own row is registered under the
 * same slot id at a lower priority, so it renders in place of dsh's row (and its two collapse rows,
 * which do nothing without folding). Display only: it hides reasoning rows with CSS and opens dsh's
 * own disclosures. `html[data-dcd-view]` carries the view for other parts; `dcd:view:set` (detail = a view)
 * switches it, e.g. from the title menu.
 */
part({
  id: 'dsh-transcript-view',
  factory(require, kit) {
    const TV_MODES = ['normal', 'thinking', 'verbose']
    const TV_KEY = 'dsh-conversation-enhancer.view'
    /** the key this part wrote before the bundle was renamed */
    const TV_KEY_OLD = 'dsh-conversation-display.view'
    const TV_KEY_OLDEST = 'dsh-transcript-view.mode'
    /** dsh's saved mode → this view, for the first run (before this part owned the setting) */
    const FROM_DSH = { compact: 'normal', standard: 'normal', detailed: 'thinking', verbose: 'verbose', normal: 'thinking', expanded: 'thinking' }
    /** the one native mode with no folding or grouping of its own */
    const NATIVE = 'verbose'
    const ui = kit.settingsUI()
    const { React, h } = kit
    const OPTIONS = [
      { v: 'normal', zh: '标准', en: 'Normal' },
      { v: 'thinking', zh: '思考', en: 'Thinking' },
      { v: 'verbose', zh: '详尽', en: 'Verbose' },
    ]
    const DESC = {
      normal: ['只显示回复和命令，隐藏思考过程', 'Replies and commands; thinking hidden'],
      thinking: ['同时展开模型的思考过程', 'Also expand the model\'s thinking'],
      verbose: ['展开所有思考，以及每条命令的输入和输出', 'Expand all thinking and every command\'s input and output'],
    }
    const tvSheet = kit.sheet('transcript-view', CSS_TRANSCRIPT_VIEW)
    const ensureTvStyle = tvSheet.ensure

    /**
     * Process-wide transcript view. The choice is dsh's own 工作步骤展示 setting (ui-chat.transcriptView,
     * Settings › 通用设置), mapped to how this view shows thinking and tool rows (see FROM_DSH);
     * `data-dcd-view` on <html> drives the CSS, and an observer
     * opens dsh's own disclosures (reasoning rows, tool cards) for Thinking / Verbose.
     * Rows it opened are closed again when the view steps back down; rows the user
     * opened or closed by hand are left alone (each row is considered once per view).
     */
    function createTranscriptView() {
      let mode = 'normal'
      const subs = new Set<() => void>()
      let seen = new WeakSet()
      /** Controls this view opened, by flow key — survives dsh re-mounting the row, so stepping down can close it again. */
      const opened = new Set<string>()
      let un = null
      let timer = 0
      const CTRL = '[data-expandable="true"],button[data-turn-process]'
      const itemOf = (el) => el.closest('[data-chat-flow-kind]')
      const keyOf = (el) => {
        const item = itemOf(el)
        const k = item && (item.getAttribute('data-chat-flow-key') || item.getAttribute('data-chat-node-key'))
        return k ? `${k}|${el.hasAttribute('data-turn-process') ? 'tp' : 'row'}` : null
      }
      const wants = (el, m) => {
        const item = itemOf(el)
        if (!item) return false
        const kind = item.getAttribute('data-chat-flow-kind')
        if (kind === 'turn-process') return m !== 'normal'
        const reasoning = item.getAttribute('data-chat-group-part') === 'reasoning'
        if (m === 'verbose') return reasoning || kind === 'tool-call'
        if (m === 'thinking') return reasoning
        return false
      }
      const pass = () => {
        timer = 0
        for (const sc of qa('[data-conversation-scroll]')) {
          for (const el of qa(CTRL, sc)) {
            const k = keyOf(el)
            if (!k) continue
            const isOpen = el.getAttribute('aria-expanded') === 'true'
            if (wants(el, mode)) {
              // open once per view: a row the user closes by hand stays closed
              if (isOpen || seen.has(el)) continue
              seen.add(el)
              opened.add(k)
              try { el.click() } catch {}
            } else if (opened.has(k)) {
              opened.delete(k)
              if (isOpen) { try { el.click() } catch {} }
            }
          }
        }
      }
      // setTimeout, not rAF: rAF stops in a hidden pane or background window
      const schedule = () => { if (!timer) timer = setTimeout(pass, 40) }
      const observe = () => {
        // one shared, rAF-coalesced watcher for the whole bundle; only structural rows can change
        // what we expand, so pure text streaming never wakes this pass
        if (!un) un = kit.dom.subscribe((recs) => {
          if (mode === 'normal' && !opened.size) return
          if (!kit.dom.touches(recs, '[data-expandable],button[data-turn-process],[data-chat-group-part="reasoning"],[data-chat-flow-kind]')) return
          schedule()
        })
        schedule()
      }

      /** Keep the reading position while rows open / close: pin the first item in view (or the bottom) for a moment. */
      function holdScroll() {
        const holds = []
        for (const sc of document.querySelectorAll('[data-conversation-scroll]')) {
          if (!sc.clientHeight) continue
          const atBottom = sc.scrollHeight - sc.scrollTop - sc.clientHeight < 48
          const top = sc.getBoundingClientRect().top
          let anchor = null
          if (!atBottom) {
            for (const it of qa('[data-chat-flow-kind]', sc)) {
              if (it.getAttribute('data-chat-group-part') === 'reasoning' || it.getAttribute('data-chat-flow-kind') === 'turn-process') continue
              const r = it.getBoundingClientRect()
              if (r.height && r.bottom > top + 8) { anchor = { key: it.getAttribute('data-chat-flow-key'), el: it, off: r.top - top }; break }
            }
          }
          holds.push({ sc, atBottom, anchor })
        }
        if (!holds.length) return
        let stop = false
        const cancel = () => { stop = true }
        const until = Date.now() + 900
        const step = () => {
          if (stop) return
          for (const { sc, atBottom, anchor } of holds) {
            if (!sc.isConnected) continue
            if (atBottom) { sc.scrollTop = sc.scrollHeight; continue }
            if (!anchor) continue
            let el = anchor.el
            if (!el.isConnected && anchor.key) el = sc.querySelector(`[data-chat-flow-key="${CSS.escape(anchor.key)}"]`) || el
            if (!el.isConnected) continue
            const d = el.getBoundingClientRect().top - sc.getBoundingClientRect().top - anchor.off
            if (Math.abs(d) > 1) sc.scrollTop += d
          }
          if (Date.now() < until) setTimeout(step, 16)
          else for (const { sc } of holds) { sc.removeEventListener('wheel', cancel); sc.removeEventListener('touchstart', cancel) }
        }
        for (const { sc } of holds) { sc.addEventListener('wheel', cancel, { passive: true, once: true }); sc.addEventListener('touchstart', cancel, { passive: true, once: true }) }
        step()
      }

      const applyMode = () => {
        document.documentElement.setAttribute('data-dcd-view', mode)
        // dsh-claude-shell's title menu still reads html[data-dtv]: keep the mirror until it is renamed
        document.documentElement.setAttribute('data-dtv', mode)
        seen = new WeakSet()
        observe()
        pass()
      }
      return {
        get: () => mode,
        subscribe(fn) { subs.add(fn); return () => subs.delete(fn) },
        set(next) {
          if (!TV_MODES.includes(next) || next === mode) return
          mode = next
          try { localStorage.setItem(TV_KEY, next) } catch {}
          holdScroll()
          applyMode()
          for (const fn of subs) fn()
        },
        /** First value from the setting: no scroll hold, nothing to notify yet. */
        init(next) { if (TV_MODES.includes(next)) mode = next },
        start() { ensureTvStyle(); applyMode() },
        dispose() {
          if (un) { un(); un = null }
          if (timer) clearTimeout(timer)
          document.documentElement.removeAttribute('data-dcd-view')
          document.documentElement.removeAttribute('data-dtv')
          tvSheet.remove()
        },
      }
    }


    // ------------------------------------------------------------------ registration
    /** 工作步骤展示, in place of dsh's row */
    function ViewRow({ tv }) {
      const mode = React.useSyncExternalStore(tv.subscribe, tv.get) as string
      React.useEffect(() => { ui.sheet.ensure() }, [])
      const [zh, en] = DESC[mode]
      return h(ui.Row, { label: ui.S('工作步骤展示', 'Work details'), desc: ui.S(zh, en) },
        h(ui.Select, { label: ui.S('工作步骤展示', 'Work details'), value: mode, options: OPTIONS, onChange: (v) => tv.set(v) }))
    }

    return {
      inject: ['configForms', 'slots'],
      apply(ctx) {
        const form = ctx.configForms.get('ui-chat')
        const saved = () => form.getSnapshot().value?.transcriptView
        const tv = createTranscriptView()
        // own choice; on the first run, carry over what dsh's setting showed
        let first = null
        try { first = localStorage.getItem(TV_KEY) ?? localStorage.getItem(TV_KEY_OLD) ?? localStorage.getItem(TV_KEY_OLDEST) } catch {}
        tv.init(TV_MODES.includes(first) ? first : FROM_DSH[saved()] || 'normal')
        ctx.effect(() => { tv.start(); return () => tv.dispose() }, 'transcript-view: mode, styles and observer')
        // hold dsh's own mode at 完全展开 so it never folds or groups underneath this view
        const pin = () => {
          const v = saved()
          if (v === undefined) return
          // first run: dsh's setting may arrive after start; carry its value over once
          if (!TV_MODES.includes(first) && FROM_DSH[v]) { first = FROM_DSH[v]; tv.set(first) }
          if (v !== NATIVE) Promise.resolve(form.set('transcriptView', NATIVE)).catch(() => {})
        }
        ctx.effect(() => { pin(); return form.subscribe(pin) }, 'transcript-view: hold dsh\'s work details at 完全展开')
        // dsh's 工作步骤展示 row is id transcript-view at priority 0: same id, lower priority renders instead
        ctx.slots.inject('settings.general.item', () => ctx.slots.register({
          name: 'settings.general.item', id: 'transcript-view', order: 12, priority: -10,
        }, () => h(ViewRow, { tv })))
        // other parts (the title menu) switch the view with `dcd:view:set`
        ctx.effect(() => {
          const onSet = (e) => tv.set(e.detail)
          window.addEventListener('dcd:view:set', onSet)
          // the old event name, still dispatched by dsh-claude-shell's title menu
          window.addEventListener('dtv:set', onSet)
          return () => { window.removeEventListener('dcd:view:set', onSet); window.removeEventListener('dtv:set', onSet) }
        }, 'transcript-view: dcd:view:set bridge')
      },
    }
  },
})
