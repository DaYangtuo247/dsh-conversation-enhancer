/*!
 * dsh-transcript-polish — browser half.
 *
 * Small quiet touches in the transcript: action tooltips (copy, like,
 * dislike, branch…) open above their button instead of over the input box,
 * the turn header drops its rule, and the assistant action row's display is
 * configurable: each known button can be shown, collapsed behind a single ⋯
 * overflow, or hidden, and reordered — managed on the bundle's own plugin page
 * (侧边栏 › 插件 › 已安装 › 对话显示), which also explains that this
 * plugin's 工作步骤展示 takes over the system setting.
 *
 * Display-only: buttons keep whatever registration / DOM the plugins gave them.
 * We add marker attributes + a stylesheet (visibility and flex order); we never
 * reparent, restyle inline, or discover buttons at runtime.
 */
part({
  id: 'dsh-transcript-polish',
  factory(require, kit) {
    const { React, h } = kit
    const ui = kit.settingsUI()
    const V = kit.vocab
    const { ensure: ensureStyle, remove: removeStyle } = kit.sheet('transcript-polish', CSS_TRANSCRIPT_POLISH)

    // ---- fork-and-edit from the user message (bridges message-edit's turn-tail trigger)
    const TRIGGER_TEXT = /^(编辑并重发|Edit and resend)$/i
    const BRANCH = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="4.5" cy="3.5" r="1.6" stroke="currentColor" stroke-width="1.3"/><circle cx="4.5" cy="12.5" r="1.6" stroke="currentColor" stroke-width="1.3"/><circle cx="11.5" cy="5.5" r="1.6" stroke="currentColor" stroke-width="1.3"/><path d="M4.5 5.1v5.8M11.5 7.1c0 2.4-2.2 2.9-4.6 3.4-.9.2-1.6.6-2 1" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>'
    function tailTrigger(turn): HTMLButtonElement | null {
      for (const b of qa<HTMLButtonElement>(`[data-chat-flow-kind="turn-tail"][data-chat-turn="${CSS.escape(String(turn))}"] [data-slot="conversation.chat.turnTail"] button`)) {
        if (b.hasAttribute('data-dcd-act-fork-src') || TRIGGER_TEXT.test(b.textContent.trim())) return b
      }
      return null
    }
    function sync() {
      // mark every message-edit trigger so CSS can hide it
      for (const b of document.querySelectorAll('[data-slot="conversation.chat.turnTail"] button')) {
        if (!b.hasAttribute('data-dcd-act-fork-src') && TRIGGER_TEXT.test(b.textContent.trim())) b.setAttribute('data-dcd-act-fork-src', '')
      }
      for (const item of qa('[data-chat-flow-kind="user"][data-chat-turn]')) {
        const turn = item.dataset.chatTurn
        const actions = item.querySelector('[class*="_actions"]')
        if (!actions) continue
        const have = actions.querySelector('.dcd-act-fork')
        const src = tailTrigger(turn)
        if (!src) { if (have) have.remove(); continue }
        if (have) continue
        const copy = actions.querySelector('button')
        const zh = /编辑/.test(src.textContent)
        const btn = document.createElement('button')
        btn.type = 'button'
        btn.className = ((copy && copy.className) || '') + ' dcd-act-fork'
        btn.setAttribute('aria-label', zh ? '从这里分叉并编辑' : 'Fork here and edit')
        btn.title = zh ? '从这里分叉到新对话并编辑（原对话不变）' : 'Fork into a new conversation and edit (original stays)'
        btn.innerHTML = BRANCH
        btn.addEventListener('click', (e) => {
          e.stopPropagation()
          const t = tailTrigger(turn)
          if (!t) return
          t.click()
          requestAnimationFrame(() => requestAnimationFrame(() => {
            const area = t.closest('[data-chat-flow-kind="turn-tail"]')
            const ta = area && area.querySelector('textarea')
            if (ta) { ta.scrollIntoView({ block: 'center', behavior: 'smooth' }); ta.focus() }
          }))
        })
        actions.appendChild(btn)
      }
      applyActions()
    }

    // ---- configurable reply-action display (show / fold / hide + order), persisted.
    // Fixed list of the buttons dsh and the known plugins register; no runtime discovery.
    const LS_KEY = 'dsh-conversation-enhancer.actions.v1'
    /** the key this page wrote before the bundle was renamed: a reader's own button order survives */
    const LS_KEY_OLD = 'dsh-conversation-display.actions.v1'
    const LS_KEY_OLDEST = 'dsh-transcript-actions.v1'
    const BAR = '[data-chat-flow-kind="turn-tail"] [class*="_actions"] '
    const KNOWN = [
      { key: 'copy', zh: '复制', en: 'Copy', sel: '[data-icon="dsw-icon-copy-outline-regular"],[aria-label="复制"],[aria-label="Copy"]' },
      { key: 'branch', zh: '在新对话中分支', en: 'Branch in new chat', sel: '[data-icon="dsw-icon-branch-outline-regular"],[aria-label="在新对话中分支"],[aria-label="Branch in new conversation"]' },
      { key: 'like', zh: '好的回答', en: 'Good response', sel: '[data-icon="dsw-icon-like-outline-regular"],[aria-label="好的回答"],[aria-label="Good response"]' },
      { key: 'dislike', zh: '有问题的回答', en: 'Bad response', sel: '[data-icon="dsw-icon-dislike-outline-regular"],[aria-label="有问题的回答"],[aria-label="Bad response"]' },
      { key: 'jump', zh: '在上下文视图中查看此轮', en: 'View turn in context', sel: '.lc-jump,[aria-label="在上下文视图中查看此轮"],[aria-label="View this turn in context view"]' },
      { key: 'memory', zh: '存入记忆', en: 'Save to memory', sel: '[aria-label="存入记忆"],[aria-label="Save to memory"]' },
    ]
    const MODES = [
      { v: 'show', zh: '显示', en: 'Show' },
      { v: 'fold', zh: '收起', en: 'Collapse' },
      { v: 'hide', zh: '隐藏', en: 'Hide' },
    ]
    const NEXT_MODE = { show: 'fold', fold: 'hide', hide: 'show' }
    const MODE_ICON = {
      show: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1.7 8S4.1 3.9 8 3.9 14.3 8 14.3 8 11.9 12.1 8 12.1 1.7 8 1.7 8Z"/><circle cx="8" cy="8" r="1.9"/></svg>',
      fold: '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><circle cx="3.5" cy="8" r="1.1"/><circle cx="8" cy="8" r="1.1"/><circle cx="12.5" cy="8" r="1.1"/></svg>',
      hide: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6.3 4.2A6.7 6.7 0 0 1 8 4c3.9 0 6.3 4 6.3 4a12 12 0 0 1-1.8 2.3M4.2 5.4A11.6 11.6 0 0 0 1.7 8s2.4 4 6.3 4c.8 0 1.5-.1 2.2-.4"/><path d="m2.6 2.6 10.8 10.8"/></svg>',
    }
    /** the grip dsh's own 调整模型顺序 dialog uses (IconDragHandleOutlineRegular, size 14) */
    const GRIP = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><use href="#dsw-icon-drag-handle-outline-regular"/></svg>'
    const ICON_FALLBACK = { copy: 'copy', branch: 'branch', like: 'like', dislike: 'dislike', jump: 'flat-list', memory: 'think' }
    /** the row's own icon, taken from the live button so third-party icons match too */
    function rowIcon(key) {
      const k = KNOWN.find((x) => x.key === key)
      const sel = k.sel.split(',').map((s) => BAR + s.trim()).join(',')
      const svg = document.querySelector(sel)?.querySelector('svg')
      if (svg) return svg.outerHTML
      return `<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><use href="#dsw-icon-${ICON_FALLBACK[key]}-outline-regular"/></svg>`
    }
    const DEFAULT_ORDER = ['copy', 'branch', 'like', 'dislike', 'jump', 'memory']
    const defaultMode = (key) => (key === 'copy' || key === 'branch' ? 'show' : 'fold')
    let cfg = { order: DEFAULT_ORDER.slice(), mode: {} }
    try {
      const raw = localStorage.getItem(LS_KEY) ?? localStorage.getItem(LS_KEY_OLD) ?? localStorage.getItem(LS_KEY_OLDEST)
      if (raw) {
        const p = JSON.parse(raw)
        const order = (p.order || []).filter((k) => DEFAULT_ORDER.includes(k))
        for (const k of DEFAULT_ORDER) if (!order.includes(k)) order.push(k)
        cfg = { order, mode: p.mode || {} }
      }
    } catch {}
    const subs = new Set<() => void>()
    let snap = { cfg }
    const save = () => { try { localStorage.setItem(LS_KEY, JSON.stringify(cfg)) } catch {} }
    const notify = () => { snap = { cfg }; for (const f of subs) f() }
    const modeOf = (key) => cfg.mode[key] || defaultMode(key)
    const store = {
      subscribe(fn) { subs.add(fn); return () => subs.delete(fn) },
      get: () => snap,
      setMode(k, v) { cfg.mode[k] = v; save(); notify(); applyActions() },
      move(k, d) {
        const i = cfg.order.indexOf(k), j = i + d
        if (i < 0 || j < 0 || j >= cfg.order.length) return
        const o = cfg.order.slice(); const [x] = o.splice(i, 1); o.splice(j, 0, x)
        cfg.order = o; save(); notify(); applyActions()
      },
    }

    // order is pure CSS (flex `order`), so plugin DOM / registration stays untouched
    let layoutTag = null
    function layoutCSS() {
      const rules = []
      cfg.order.forEach((key, i) => {
        const k = KNOWN.find((x) => x.key === key)
        if (!k) return
        rules.push(`${BAR}button:is(${k.sel}){order:${i}}`)
        // a plugin wrapper that owns a flex box moves with its button
        rules.push(`${BAR}div:has(> button:is(${k.sel})){order:${i}}`)
      })
      return rules.join('\n')
    }
    function ensureLayout() {
      if (!layoutTag) {
        layoutTag = document.createElement('style')
        layoutTag.dataset.plugin = 'display/transcript-actions-layout'
        document.head.appendChild(layoutTag)
      }
      layoutTag.textContent = layoutCSS()
    }
    function removeLayout() { if (layoutTag) { layoutTag.remove(); layoutTag = null } }

    // ---- the ⋯ overflow menu (re-dispatches to the hidden originals)
    const MORE = '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><circle cx="3.5" cy="8" r="1.1"/><circle cx="8" cy="8" r="1.1"/><circle cx="12.5" cy="8" r="1.1"/></svg>'
    let menuEl = null
    let menuOwner = null // the ⋯ button the open menu belongs to (a dataset/expando-free handle)
    let closingMenu = null // a menu mid exit-fade
    function closeMenu() {
      if (!menuEl) return
      const el = menuEl
      const owner = menuOwner
      menuEl = null
      menuOwner = null
      if (owner) owner.setAttribute('aria-expanded', 'false')
      // keyboard readers were inside the menu: hand focus back to the ⋯ button that opened it
      if (owner && el.contains(document.activeElement)) owner.focus()
      // fade out one beat, then leave the page; a newer menu or a faster close replaces it
      const still = matchMedia('(prefers-reduced-motion: reduce)').matches
        || document.documentElement.getAttribute('data-dcd-anim') === 'off'
      if (still) { el.remove(); return }
      if (closingMenu) closingMenu.remove()
      el.setAttribute('data-closing', '')
      closingMenu = el
      setTimeout(() => { if (closingMenu === el) { el.remove(); closingMenu = null } }, 130)
    }
    function openMenu(more, bar) {
      closeMenu()
      const zh = V.zh()
      const folded = cfg.order
        .map((key) => KNOWN.find((x) => x.key === key))
        .filter((k) => k && modeOf(k.key) === 'fold' && bar.querySelector(k.sel))
      if (!folded.length) return
      menuEl = document.createElement('div')
      menuEl.className = 'dcd-act-menu'
      menuEl.setAttribute('role', 'menu')
      menuOwner = more
      for (const k of folded) {
        const src = bar.querySelector(k.sel)
        const item = document.createElement('button')
        item.type = 'button'
        item.setAttribute('role', 'menuitem')
        const svg = src.querySelector('svg')
        if (svg) item.appendChild(svg.cloneNode(true))
        const lab = document.createElement('span')
        lab.textContent = zh ? k.zh : k.en
        item.appendChild(lab)
        item.addEventListener('click', (e) => { e.stopPropagation(); closeMenu(); src.click() })
        menuEl.appendChild(item)
      }
      // arrow keys walk the items (Home / End jump), so the menu is usable without a pointer
      menuEl.addEventListener('keydown', (e) => {
        const list = qa<HTMLButtonElement>('button', e.currentTarget as HTMLElement)
        if (!list.length) return
        const i = list.indexOf(document.activeElement as HTMLButtonElement)
        let j = -1
        if (e.key === 'ArrowDown') j = i < 0 ? 0 : (i + 1) % list.length
        else if (e.key === 'ArrowUp') j = i < 0 ? list.length - 1 : (i - 1 + list.length) % list.length
        else if (e.key === 'Home') j = 0
        else if (e.key === 'End') j = list.length - 1
        else return
        e.preventDefault()
        list[j].focus()
      })
      document.body.appendChild(menuEl)
      const r = more.getBoundingClientRect()
      const mh = menuEl.offsetHeight, mw = menuEl.offsetWidth
      const left = Math.min(Math.max(8, r.left), window.innerWidth - mw - 8)
      let top = r.top - mh - 6
      if (top < 8) top = r.bottom + 6
      menuEl.style.left = left + 'px'
      menuEl.style.top = top + 'px'
      more.setAttribute('aria-expanded', 'true')
      const first = qa<HTMLButtonElement>('button', menuEl)[0]
      if (first) first.focus()
    }
    function applyActions() {
      ensureLayout()
      const zh = V.zh()
      for (const bar of document.querySelectorAll('[data-chat-flow-kind="turn-tail"] [class*="_actions"]')) {
        let folded = 0
        for (const k of KNOWN) {
          const b = bar.querySelector(k.sel)
          if (!b) continue
          const mode = modeOf(k.key)
          if (mode === 'hide') { b.setAttribute('data-dcd-act-hide', ''); b.removeAttribute('data-dcd-act-fold') }
          else if (mode === 'fold') { b.setAttribute('data-dcd-act-fold', ''); b.removeAttribute('data-dcd-act-hide'); folded++ }
          else { b.removeAttribute('data-dcd-act-fold'); b.removeAttribute('data-dcd-act-hide') }
        }
        let more = bar.querySelector<HTMLButtonElement>('.dcd-act-more')
        if (folded === 0) { if (more) more.remove(); continue }
        if (!more) {
          more = document.createElement('button')
          more.type = 'button'
          const sib = bar.querySelector('button:not(.dcd-act-more)')
          more.className = ((sib && sib.className) || '') + ' dcd-act-more'
          more.setAttribute('aria-label', zh ? '更多操作' : 'More actions')
          more.setAttribute('aria-haspopup', 'menu')
          more.setAttribute('aria-expanded', 'false')
          more.title = zh ? '更多操作' : 'More actions'
          more.innerHTML = MORE
          more.addEventListener('click', (e) => { e.stopPropagation(); if (menuEl && menuOwner === more) closeMenu(); else openMenu(more, bar) })
          bar.appendChild(more)
        }
      }
    }

    // ---- the bundle's plugin page: 回复操作按钮, plus a note on the 工作步骤展示 takeover
    function ActionsList() {
      const { cfg: c } = React.useSyncExternalStore(store.subscribe, store.get)
      const keys = c.order
      const listRef = React.useRef(null)
      const dragRef = React.useRef(null)
      const [drag, setDrag] = React.useState(null)
      const icons = React.useMemo(() => Object.fromEntries(KNOWN.map((k) => [k.key, rowIcon(k.key)])), [])
      // one step per crossed midpoint, so the row follows the pointer and the order stays live.
      // offsetTop ignores the FLIP transforms, so animating rows cannot feed back into the hit-test
      const drop = (key, y) => {
        const list = listRef.current
        const items = list ? qa('.dta-item', list) : []
        if (!list || !items.length) return
        const top = y - list.getBoundingClientRect().top
        let target = items.length - 1
        for (let i = 0; i < items.length; i++) {
          const off = items[i].offsetTop - list.offsetTop
          if (top < off + items[i].offsetHeight / 2) { target = i; break }
        }
        const cur = store.get().cfg.order.indexOf(key)
        if (cur >= 0 && target !== cur) store.move(key, target > cur ? 1 : -1)
      }
      const endDrag = () => { dragRef.current = null; setDrag(null) }
      // FLIP: slide rows between their old and new slots whenever the order changes
      const posRef = React.useRef(null)
      React.useLayoutEffect(() => {
        const list = listRef.current
        if (!list) return
        const items = qa('.dta-item', list)
        // relative to the list: layout shifts above it (async README, fonts) must not read as moves
        const now = new Map(items.map((el) => [el.getAttribute('data-key'), el.offsetTop - list.offsetTop]))
        const prev = posRef.current
        posRef.current = now
        if (!prev || matchMedia('(prefers-reduced-motion: reduce)').matches) return
        for (const el of items) {
          const from = prev.get(el.getAttribute('data-key'))
          const to = now.get(el.getAttribute('data-key'))
          if (from == null || from === to) continue
          el.style.transition = 'none'
          el.style.transform = `translateY(${from - to}px)`
          requestAnimationFrame(() => requestAnimationFrame(() => {
            el.style.transition = 'transform .16s cubic-bezier(.2,.8,.2,1)'
            el.style.transform = ''
            el.addEventListener('transitionend', () => { el.style.transition = '' }, { once: true })
          }))
        }
      })
      return h('div', { className: 'dta-list', ref: listRef },
        keys.map((key) => {
          const k = KNOWN.find((x) => x.key === key)
          const mode = modeOf(key)
          const m = MODES.find((x) => x.v === mode)
          const label = ui.S(k.zh, k.en)
          const modeLabel = ui.S(m.zh, m.en)
          return h('div', { className: 'dta-item', key, 'data-key': key, 'data-dragging': drag === key ? '' : undefined },
            h('span', { className: 'dta-ico', dangerouslySetInnerHTML: { __html: icons[key] } }),
            h('span', { className: 'dta-lbl' }, label),
            h('button', {
              type: 'button', className: 'dta-mode', 'aria-label': `${label}：${modeLabel}`,
              title: `${modeLabel} · ${ui.S('点击切换', 'Click to cycle')}`,
              onClick: () => store.setMode(key, NEXT_MODE[mode]),
              dangerouslySetInnerHTML: { __html: MODE_ICON[mode] },
            }),
            h('button', {
              type: 'button', className: 'dta-grip', 'aria-label': `${ui.S('调整顺序', 'Reorder')} ${label}`,
              'aria-keyshortcuts': 'ArrowUp ArrowDown', title: ui.S('拖动排序，或用上下方向键', 'Drag to reorder, or use the arrow keys'),
              dangerouslySetInnerHTML: { __html: GRIP },
              onPointerDown: (e) => { dragRef.current = key; setDrag(key); try { e.currentTarget.setPointerCapture(e.pointerId) } catch {} },
              onPointerMove: (e) => { if (dragRef.current === key) drop(key, e.clientY) },
              onPointerUp: endDrag,
              onPointerCancel: endDrag,
              onLostPointerCapture: endDrag,
              onKeyDown: (e) => {
                if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
                e.preventDefault()
                store.move(key, e.key === 'ArrowUp' ? -1 : 1)
              },
            }))
        }))
    }
    const INFO = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" aria-hidden="true"><circle cx="8" cy="8" r="6.2"/><path d="M8 7.4v3.4"/><path d="M8 5.2v.2"/></svg>'
    // the bundle's one motion switch (display-shared): decorative transitions on or off at once
    function MotionRow() {
      const on = React.useSyncExternalStore(V.motion.subscribe, V.motion.get)
      return h(ui.Row, { label: ui.S('动效', 'Motion'), desc: ui.S('展开、收起与弹出的小动画；运行中的指示（脉冲、旋转、流光）不受影响', 'Small transitions for opens, closes and pop-ups; liveness markers (pulse, spin, shimmer) keep going') },
        h(ui.Switch, { checked: on, onChange: (v) => V.motion.set(v), label: ui.S('动效', 'Motion') }))
    }
    function PluginPage() {
      React.useEffect(() => { ui.sheet.ensure() }, [])
      return h('div', { className: 'dcd-act-page' },
        h('div', { className: 'dcd-act-note' },
          h('span', { dangerouslySetInnerHTML: { __html: INFO } }),
          h('span', null, ui.S(
            '「工作步骤展示」由本插件覆盖系统默认：系统「通用设置 › 工作步骤展示」被固定为「完全展开」，其自身的折叠与分组不再生效，实际按插件的 标准 / 思考 / 详尽 显示。可在 通用设置 或标题菜单中切换。',
            'Work details is taken over by this plugin: the system setting (Settings › General) is pinned to Fully expanded so its own folding and grouping stay off, and the plugin’s Normal / Thinking / Verbose decides what shows. Switch it in General settings or the title menu.'))),
        h(MotionRow),
        h('div', { className: 'dcd-act-head' }, ui.S('回复操作按钮', 'Reply actions')),
        h('div', { className: 'dcd-act-desc' }, ui.S('选择每个按钮显示、收起或隐藏，并调整顺序', 'Show, collapse or hide each button, and reorder them')),
        h(ActionsList),
        h('div', { className: 'dta-foot' }, ui.S('点图标切换 显示 → 收起 → 隐藏；拖动右侧手柄调整顺序', 'Click the icon to cycle show → collapse → hide; drag the handle to reorder')))
    }

    function startForkBridge() {
      // only a new / removed user message or turn-tail can change the fork / fold buttons; pure text
      // streaming must not wake this pass (it used to run every 16 ms over the whole document)
      const SEL = '[data-chat-flow-kind="user"],[data-chat-flow-kind="turn-tail"],[data-slot="conversation.chat.turnTail"]'
      const un = kit.dom.subscribe((recs) => { if (kit.dom.touches(recs, SEL)) sync() })
      const onDown = (e) => { if (menuEl && !menuEl.contains(e.target) && !(e.target.closest && e.target.closest('.dcd-act-more'))) closeMenu() }
      const onKey = (e) => { if (e.key === 'Escape') closeMenu() }
      const onScroll = (e) => { if (menuEl && !menuEl.contains(e.target)) closeMenu() }
      document.addEventListener('pointerdown', onDown, true)
      document.addEventListener('keydown', onKey, true)
      document.addEventListener('scroll', onScroll, true)
      window.addEventListener('resize', closeMenu)
      sync()
      return () => {
        un()
        document.removeEventListener('pointerdown', onDown, true)
        document.removeEventListener('keydown', onKey, true)
        document.removeEventListener('scroll', onScroll, true)
        window.removeEventListener('resize', closeMenu)
        // teardown removes at once; no exit fade on the way out
        if (menuEl) menuEl.remove()
        if (closingMenu) closingMenu.remove()
        menuEl = null; menuOwner = null; closingMenu = null
        removeLayout()
        document.querySelectorAll('.dcd-act-fork').forEach((b) => b.remove())
        document.querySelectorAll('[data-dcd-act-fork-src]').forEach((b) => b.removeAttribute('data-dcd-act-fork-src'))
        document.querySelectorAll('.dcd-act-more').forEach((b) => b.remove())
        document.querySelectorAll('[data-dcd-act-fold]').forEach((b) => b.removeAttribute('data-dcd-act-fold'))
        document.querySelectorAll('[data-dcd-act-hide]').forEach((b) => b.removeAttribute('data-dcd-act-hide'))
      }
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        ensureStyle()
        ctx.effect(() => () => removeStyle(), 'transcript-polish: styles')
        ctx.effect(() => startForkBridge(), 'transcript-polish: fork-and-edit button')
        // the bundle's own page (侧边栏 › 插件 › 已安装 › this bundle), like dsh-context's card
        ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register({
          name: 'plugins.bundle.config', key: 'dsh-conversation-enhancer',
        }, () => h(PluginPage)))
      },
    }
  },
})