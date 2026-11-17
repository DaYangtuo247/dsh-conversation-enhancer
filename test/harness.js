/* Offline test harness for dsh-conversation-enhancer.
 * Real React 18.3.1 + a faithful mock of dsh's chat store, slot system and native flow renderer.
 * The plugin's own code (observers, scans, memoization, DOM edits) runs for real; only dsh's
 * renderer is approximated, with the exact DOM contract the plugin relies on. */
;(() => {
  const React = window.React
  const ReactDOM = window.ReactDOM
  const h = React.createElement
  const { useState, useEffect, useRef, useReducer, useCallback, useLayoutEffect } = React

  /* ---------------- instrumentation ---------------- */
  const M = {
    reflow: 0,            // forced-layout reads (offsetHeight / getClientRects / getBoundingClientRect / scroll*)
    moCallbacks: 0,       // MutationObserver callback invocations (all instances)
    moInstances: 0,
    seatRenders: 0,       // mock native node-seat renders (whole-tree re-render proxy)
    flowRenders: 0,       // native ChatFlow renders
    longTasks: [],        // {start, dur}
    frames: [],           // rAF deltas while measuring
    errors: [],
    measuring: false,
  }
  window.addEventListener('error', (e) => M.errors.push(String(e.message || e.error)))
  window.addEventListener('unhandledrejection', (e) => M.errors.push('rejection: ' + String(e.reason)))
  const origCE = console.error
  console.error = (...a) => { M.errors.push(a.map((x) => (x && x.message) || String(x)).join(' ')); origCE.apply(console, a) }

  // count forced-layout reads
  const patchGetter = (proto, name) => {
    const d = Object.getOwnPropertyDescriptor(proto, name)
    if (!d || !d.get) return
    Object.defineProperty(proto, name, { configurable: true, get() { if (M.measuring) M.reflow++; return d.get.call(this) } })
  }
  for (const n of ['offsetHeight', 'offsetWidth', 'clientHeight', 'clientWidth', 'scrollTop', 'scrollHeight']) patchGetter(HTMLElement.prototype, n)
  const wrapMethod = (proto, name) => {
    const orig = proto[name]
    proto[name] = function (...a) { if (M.measuring) M.reflow++; return orig.apply(this, a) }
  }
  wrapMethod(Element.prototype, 'getClientRects')
  wrapMethod(Element.prototype, 'getBoundingClientRect')

  // count MutationObserver callbacks
  const NativeMO = window.MutationObserver
  window.MutationObserver = class extends NativeMO {
    constructor(cb) { M.moInstances++; super((...a) => { if (M.measuring) M.moCallbacks++; return cb(...a) }) }
  }

  try {
    const po = new PerformanceObserver((list) => { for (const e of list.getEntries()) if (M.measuring) M.longTasks.push({ start: Math.round(e.startTime), dur: Math.round(e.duration) }) })
    po.observe({ entryTypes: ['longtask'] })
  } catch {}

  function resetMetrics() { M.reflow = 0; M.moCallbacks = 0; M.seatRenders = 0; M.flowRenders = 0; M.longTasks = []; M.frames = []; M.errors = [] }
  function snapshot() {
    const lt = M.longTasks
    const sum = lt.reduce((a, b) => a + b.dur, 0)
    const max = lt.reduce((a, b) => Math.max(a, b.dur), 0)
    const frames = M.frames
    const avgFrame = frames.length ? frames.reduce((a, b) => a + b, 0) / frames.length : 0
    const jank = frames.filter((d) => d > 32).length
    return { reflow: M.reflow, moCallbacks: M.moCallbacks, moInstances: M.moInstances, seatRenders: M.seatRenders, flowRenders: M.flowRenders, longTasks: lt.length, longTaskMs: sum, longTaskMax: max, avgFrame: +avgFrame.toFixed(1), jankFrames: jank, errors: M.errors.slice() }
  }

  /* ---------------- mock chat store ---------------- */
  function makeStore(initial) {
    const listeners = new Set()
    const store = Object.assign({
      nodes: new Map(),
      navigation: { items: () => store._nav },
      _nav: [],
      running: false,
      subscribe(l) { listeners.add(l); return () => listeners.delete(l) },
      emit() { for (const l of [...listeners]) l() },
    }, initial)
    return store
  }
  const chat = makeStore({})
  const session = makeStore({ running: false })

  function makeUseStore(store) {
    return function useStoreSel(sel, eq) {
      eq = eq || Object.is
      const selRef = useRef(sel); selRef.current = sel
      const eqRef = useRef(eq); eqRef.current = eq
      const valRef = useRef(undefined)
      const [, force] = useReducer((x) => x + 1, 0)
      if (valRef.current === undefined) valRef.current = sel(store)
      useEffect(() => {
        const check = () => {
          let next
          try { next = selRef.current(store) } catch { return }
          if (!eqRef.current(valRef.current, next)) { valRef.current = next; force() }
        }
        const un = store.subscribe(check)
        check()
        return un
      }, [store])
      const cur = sel(store)
      valRef.current = cur
      return cur
    }
  }
  const useChat = makeUseStore(chat)
  const useSession = makeUseStore(session)
  const useChatNode = (key, sel, eq) => useChat((s) => sel(s.nodes.get(key)), eq)
  const useConnectionState = (sel) => sel('connected')

  /* ---------------- node + entry builders ---------------- */
  let SEQ = 1
  const turnLoc = (turn, status, extra) => ({ kind: 'turn', turn: Object.assign({ turn, status, start: { time: Date.now() - 60000 }, end: status === 'closed' ? { data: { reason: { kind: (extra && extra.reason) || 'completed' } } } : undefined }, extra) })
  function mkNode(kind, turn, data, opts) {
    const key = (opts && opts.key) || `${kind}:${turn}:${SEQ++}`
    return { key, kind, anchorSeq: SEQ, visibility: 'visible', location: turnLoc(turn, (opts && opts.status) || 'closed', opts && opts.loc), data: data || {}, ...opts }
  }
  const textBlock = (text) => ({ kind: 'text', text })
  const reasonBlock = (text) => ({ kind: 'reasoning', text })
  function assistantNode(turn, { text, reasoning, status, groupPart }, opts) {
    const blocks = []
    if (reasoning) blocks.push(reasonBlock(reasoning))
    if (text) blocks.push(textBlock(text))
    return mkNode('assistant-step', turn, { blocks, status: status || 'settled', timing: { stepStartTime: Date.now() - 8000, completedTime: Date.now() - 4000 } }, opts)
  }
  function toolNode(turn, name, args, { state, output, isError, errorCode }, opts) {
    const argsRaw = JSON.stringify(args || {})
    const settled = state !== 'running'
    const root = settled
      ? { kind: 'tool-result', name, call: { name, argsRaw }, args: { chunks: [argsRaw] }, content: [{ type: 'text', text: output || '' }], isError: !!isError, error: errorCode ? { code: errorCode } : undefined }
      : { kind: 'tool-call', name, call: { name, argsRaw }, args: { chunks: [argsRaw] } }
    return mkNode('tool-call', turn, { root }, opts)
  }
  const userNode = (turn, text, opts) => mkNode('user', turn, { blocks: [textBlock(text)] }, opts)
  const processNode = (turn, opts) => mkNode('turn-process', turn, {}, opts)
  const tailNode = (turn, opts) => mkNode('turn-tail', turn, {}, opts)

  /* ---------------- faithful mock native renderer ---------------- */
  const kindTitle = (name) => ({ bash: '运行命令', pwsh: '运行命令', read: '读取', read_image: '读取图片', grep: '搜索', glob: '查找文件', write: '写入', edit: '编辑', web_search: '网页搜索', web_fetch: '网页获取', todo_write: '更新任务清单', subagent: '子智能体' }[name] || name)
  const summaryOf = (name, args) => args.description || args.command || args.file_path || args.pattern || args.query || args.url || ''

  function Terminal({ name, args, output, open }) {
    const lines = String(output || '').split('\n')
    return h('div', { className: '_terminal' },
      h('div', { className: '_header_' },
        h('span', { className: '_command_', 'data-command-text': '' }, args.command || ''),
        h('span', { className: '_copyButton' }, '复制')),
      h('div', { className: '_output_' }, lines.map((l, i) => h('div', { className: '_line_', key: i }, l))))
  }
  function ToolBody({ node, open }) {
    const c = node.data.root || {}
    const args = (() => { try { return JSON.parse((c.call && c.call.argsRaw) || '{}') } catch { return {} } })()
    if (!open) return null
    const isCmd = /bash|pwsh|terminal/.test(c.name)
    const isImg = /read_image|view_image/.test(c.name)
    return h('div', { className: '_bodyWrap' },
      isCmd ? h(Terminal, { name: c.name, args, output: (c.content || []).map((b) => b.text || '').join('\n'), open }) : null,
      isImg ? h('img', { src: args.file_path || args.path || '', alt: 'image', style: { maxWidth: 240, maxHeight: 160 } }) : null,
      !isCmd && !isImg ? h('pre', { className: '_output', style: { margin: 0, padding: '8px 12px', fontSize: 11.5, maxHeight: 220, overflow: 'auto' } }, (c.content || []).map((b) => b.text || '').join('\n')) : null,
      h('button', { className: '_inspectButton', type: 'button' }, '查看'))
  }
  function ToolCall({ node }) {
    const c = node.data.root || {}
    const [open, setOpen] = useState(false)
    const args = (() => { try { return JSON.parse((c.call && c.call.argsRaw) || '{}') } catch { return {} } })()
    const running = c.kind !== 'tool-result'
    const state = running ? 'running' : c.isError ? 'error' : 'ok'
    const isCmd = /bash|pwsh|terminal/.test(c.name)
    return h('div', { 'data-chat-call-id': node.key, 'data-tool': c.name, 'data-variant': isCmd ? 'bash' : undefined },
      h('button', { type: 'button', 'data-disclosure-row': '', 'data-expandable': 'true', role: 'button', 'aria-expanded': open, 'data-state': state, onClick: () => setOpen((v) => !v) },
        h('span', { className: '_leading' }),
        h('span', { className: '_title' }, kindTitle(c.name)),
        h('span', { className: '_summary' }, summaryOf(c.name, args)),
        state === 'error' ? h('span', { className: '_badge' }, '• 退出码 1') : null),
      h(ToolBody, { node, open }))
  }
  function ThinkBlock({ node }) {
    const [open, setOpen] = useState(false)
    const text = (node.data.blocks || []).filter((b) => b.kind === 'reasoning').map((b) => b.text).join('\n\n')
    return h('div', { 'data-variant': 'think' },
      h('div', { 'data-disclosure-header': '' },
        h('button', { type: 'button', 'data-disclosure-row': '', role: 'button', 'aria-expanded': open, onClick: () => setOpen((v) => !v) },
          h('span', { className: '_leading' }), h('span', { className: '_title' }, '思考'))),
      open ? h('div', { className: '_thinkBody' }, h('div', { className: '_markdown' }, text.split(/\n{2,}/).map((p, i) => h('p', { key: i }, p)))) : null)
  }
  function Markdown({ text }) {
    return h('div', { className: '_markdown' }, String(text || '').split(/\n{2,}/).map((p, i) => h('p', { key: i }, p)))
  }
  function UserMsg({ node }) {
    const text = (node.data.blocks || []).map((b) => b.text || '').join('\n')
    return h(React.Fragment, null,
      h('div', { className: '_bubble' }, text),
      h('div', { className: '_actions' }, h('button', { type: 'button' }, '复制'), h('button', { type: 'button' }, '重试')))
  }
  // memoized node seat: subscribes to its own node, re-renders only when that node changes (like dsh)
  const MockNodeSeat = React.memo(function MockNodeSeat({ nodeKey, groupPart, useChatNode, cwd }) {
    M.seatRenders++
    const node = useChatNode(nodeKey, (n) => n)
    if (!node) return null
    const turn = node.location && node.location.turn ? node.location.turn.turn : ''
    const hidden = node.visibility === 'hidden'
    const flowKey = groupPart === undefined || groupPart === 'response' ? node.key : JSON.stringify([node.key, groupPart])
    let inner
    switch (node.kind) {
      case 'user': case 'steering': inner = h(UserMsg, { node }); break
      case 'tool-call': inner = h(ToolCall, { node }); break
      case 'turn-process': inner = h('button', { type: 'button', 'data-turn-process': '' }, '已完成，用时 12 秒'); break
      case 'turn-tail': inner = h('div', { 'data-slot': 'conversation.chat.turnTail' }, h('button', { type: 'button' }, '编辑并重发'), h('button', { type: 'button' }, '复制')); break
      case 'assistant-step': {
        const blocks = node.data.blocks || []
        const hasText = blocks.some((b) => b.kind === 'text' && b.text && b.text.trim())
        const reasoning = blocks.filter((b) => b.kind === 'reasoning').map((b) => b.text).join('\n\n')
        if (groupPart === 'reasoning') inner = h(ThinkBlock, { node })
        else if (groupPart === 'response') inner = hasText ? h(Markdown, { text: blocks.filter((b) => b.kind === 'text').map((b) => b.text).join('\n') }) : h(ThinkBlock, { node })
        else inner = hasText ? h(Markdown, { text: blocks.filter((b) => b.kind === 'text').map((b) => b.text).join('\n') }) : (reasoning ? h(ThinkBlock, { node }) : h(Markdown, { text: '' }))
        break
      }
      default: inner = h('div', null, node.kind)
    }
    return h('div', {
      className: 'flowItem', 'data-chat-flow-key': flowKey, 'data-chat-node-key': node.key,
      'data-chat-flow-kind': node.kind, 'data-chat-turn': String(turn), 'data-chat-group-part': groupPart,
      'data-turn-process-hidden': hidden ? '' : undefined, hidden: hidden || undefined,
    }, h('div', { 'data-slot': 'conversation.chat.node' }, inner))
  })

  function RunningStatus({ startTime }) {
    const [now, setNow] = useState(Date.now())
    useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t) }, [])
    const s = Math.max(0, Math.floor((now - (startTime || now)) / 1000))
    const dur = s < 60 ? `${s}秒` : `${Math.floor(s / 60)}分${s % 60}秒`
    return h('div', { className: '_runningText', 'data-chat-running': '' }, h('div', { className: '_content_' }, h('span', { className: '_text_' }, `深度求索中，用时 ${dur} ···`)))
  }

  const NativeChatFlow = React.memo(function NativeChatFlow(props) {
    M.flowRenders++
    const { entries, pendingInputs, useSession, useChat, useChatNode, cwd } = props
    const running = useSession((s) => s.running)
    const nav = useChat((s) => s.navigation)
    const items = nav.items()
    const latestAnchor = items.length ? items[items.length - 1].anchorKey : undefined
    const latestNode = useChatNode(latestAnchor || '', (n) => n)
    const latestTurnOpen = !!(latestNode && latestNode.location && latestNode.location.turn && latestNode.location.turn.status === 'open')
    const holding = !running && latestTurnOpen
    const rows = (entries || []).map((entry) => entry.kind === 'node'
      ? h(MockNodeSeat, { key: JSON.stringify([entry.key, entry.groupPart ?? null]), nodeKey: entry.key, groupPart: entry.groupPart, useChatNode, cwd })
      : h('div', { key: entry.key, 'data-chat-group-key': entry.key }, '[group]'))
    // local submission echoes, as dsh's PendingSubmissionBubble: a user-style bubble with NO
    // data-chat-flow-kind wrapper (so the transcript's user-bubble tint does not reach it)
    const echoes = (pendingInputs || []).map((item) => h('div', {
      key: item.requestId || item.id, className: 'flowItem', 'data-pending-echo': item.requestId || item.id,
    }, h('div', { className: '_bubble' }, item.text !== undefined ? item.text : (item.content || []).map((b) => b.text || '').join('\n')),
    h('div', { className: '_actions' }, h('button', { type: 'button' }, '复制'))))
    const status = (running || holding) ? h(RunningStatus, { key: 'running', startTime: Date.now() - 30000 }) : null
    return h(React.Fragment, null, ...rows, ...echoes, status)
  })

  /* ---------------- mock todo dock ---------------- */
  let todoState = []
  function TodoPanel() {
    const [open, setOpen] = useState(true)
    const [tasks, setTasks] = useState(todoState)
    useEffect(() => { const t = setInterval(() => setTasks(todoState.slice()), 300); return () => clearInterval(t) }, [])
    return h('div', { 'data-testid': 'todo-panel' },
      h('button', { type: 'button', 'aria-expanded': open, onClick: () => setOpen((v) => !v) }, `任务 ${tasks.length}`),
      open ? h('ul', null, tasks.map((t, i) => h('li', { key: i, 'data-status': t.status }, h('span', { className: '_content' }, t.text)))) : null)
  }

  /* ---------------- mock Cordis ctx + slots ---------------- */
  function makeSlots() {
    const byName = new Map()
    const subs = new Map()
    return {
      entries(name) { return byName.get(name) || [] },
      register(opts, component) {
        const entry = { name: opts.name, options: opts, component, children: opts.children || true }
        const list = byName.get(opts.name) || []
        // same id replaces
        const i = list.findIndex((e) => e.options && e.options.id && e.options.id === opts.id)
        if (i >= 0) list[i] = entry; else list.push(entry)
        list.sort((a, b) => (b.options.priority || 0) - (a.options.priority || 0))
        byName.set(opts.name, list)
        for (const fn of subs.get(opts.name) || []) fn()
        return () => { const l = byName.get(opts.name) || []; const j = l.indexOf(entry); if (j >= 0) l.splice(j, 1); for (const fn of subs.get(opts.name) || []) fn() }
      },
      inject(name, fn) { try { fn() } catch (e) { console.error(e) } return () => {} },
      subscribe(name, fn) { const s = subs.get(name) || new Set(); s.add(fn); subs.set(name, s); return () => s.delete(fn) },
      renderSlot(name, props) { const e = (byName.get(name) || [])[0]; return e && e.component ? h(e.component, props) : null },
    }
  }
  function makeLocale() {
    const dicts = new Map(); const subs = new Set(); let lang = 'zh'
    return {
      register(ns, d) { dicts.set(ns, d); return () => dicts.delete(ns) },
      bind(ns) { return (k) => { const d = dicts.get(ns); return (d && d[lang] && d[lang][k] !== undefined) ? d[lang][k] : k } },
      resolveText(x) { return typeof x === 'string' ? x : (x && x[lang]) || '' },
      subscribe(fn) { subs.add(fn); return () => subs.delete(fn) },
      getSnapshot() { return lang },
      setLang(l) { lang = l; document.documentElement.lang = l; for (const fn of [...subs]) fn() },
    }
  }
  function makeCtx() {
    const slots = makeSlots()
    const cleanups = []
    const forms = new Map()
    forms.set('ui-chat', {
      _v: { transcriptView: 'verbose' }, _subs: new Set(),
      getSnapshot() { return { value: this._v } },
      set(k, v) { this._v = { ...this._v, [k]: v }; for (const f of this._subs) f(); return Promise.resolve() },
      subscribe(f) { this._subs.add(f); return () => this._subs.delete(f) },
    })
    return {
      slots,
      locale: makeLocale(),
      configForms: { get: (id) => forms.get(id) },
      effect(fn) { const c = fn(); if (typeof c === 'function') cleanups.push(c); return c },
      _cleanups: cleanups,
    }
  }

  /* ---------------- module loader + require ---------------- */
  const factories = new Map()
  window.__ModuleLoader__ = { load({ id, factory }) { factories.set(id, factory) } }
  const ImageLightbox = ({ src, alt, onClose }) => h('div', { role: 'dialog', className: '_backdrop', style: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', display: 'grid', placeItems: 'center', zIndex: 1200 }, onClick: onClose }, h('div', { className: '_stage' }, h('img', { src, alt, style: { maxWidth: '80vw', maxHeight: '80vh' } })))
  const modules = {
    react: React,
    'react-dom': ReactDOM,
    'react/jsx-runtime': { jsx: h, jsxs: h, Fragment: React.Fragment },
    '@deepseek-ai/dsh-client-ui-primitives': { ImageLightbox, JsonBlock: ({ payload }) => h('pre', null, JSON.stringify(payload)) },
  }
  const require = (id) => { if (id in modules) return modules[id]; throw new Error('harness: unknown require ' + id) }

  /* ---------------- boot ---------------- */
  const flowEl = document.getElementById('flow')
  const scroller = document.getElementById('scroller')
  const root = ReactDOM.createRoot(flowEl)
  const todoRoot = ReactDOM.createRoot(document.getElementById('todo-seat'))
  let ctx = null
  let flowEntry = null
  let currentProps = null

  function flowProps() {
    const observed = observedRpcIds()
    return {
      entries: chat._entries || [],
      pendingInputs: (chat._pending || []).filter((it) => !(it.requestId && observed.has(it.requestId))),
      lastInputTurn: chat._lastInputTurn,
      deferCollapse: false, useSession, useChat, useChatNode, useChatNodeBottom: useChatNode, useChatNodeProcess: useChatNode,
      useChatGroup: () => null, usePresentation: (s) => s({}), useConnectionState, useStore: useChat,
      actions: {}, renderSlot: (name, p) => ctx.slots.renderSlot(name, p), renderFactorySlot: () => null,
      t: (k) => k, useGroupAction: () => null, useGroupHeaderAction: () => null,
      cwd: '/Users/dev/Desktop/workspace/demo', openFile: () => {}, inspectCall: () => {}, forkAt: () => {}, loadImage: () => {},
    }
  }
  function renderFlow() {
    currentProps = flowProps()
    const Comp = flowEntry.component
    root.render(h(Comp, currentProps))
  }
  function setEntries(entries) { chat._entries = entries; chat.emit(); renderFlow() }
  function setPending(list) { chat._pending = list; renderFlow() }
  // the panel's render-time dedupe (native observedInputs): an echo whose durable user node is
  // already in the transcript never reaches the flow, even before the session retires it
  function observedRpcIds() {
    const ids = new Set()
    for (const e of chat._entries || []) {
      if (e.kind !== 'node') continue
      const src = chat.nodes.get(e.key)?.data?.source
      if (src && src.kind === 'user' && typeof src.rpcId === 'string') ids.add(src.rpcId)
    }
    return ids
  }

  function boot() {
    ctx = makeCtx()
    // register the native flow entry exactly as dsh does (children, no options.id)
    flowEntry = { name: 'conversation.chat.flow', options: { name: 'conversation.chat.flow' }, children: true, component: NativeChatFlow }
    ctx.slots.register({ name: 'conversation.chat.flow' }, NativeChatFlow)
    // the plugin captures the entry object via slots.entries(); ensure our registered entry is the one found
    // (makeSlots.register stores a fresh entry; grab it)
    flowEntry = ctx.slots.entries('conversation.chat.flow')[0]
    todoRoot.render(h(TodoPanel))
    const factory = factories.get('dsh-conversation-enhancer')
    if (!factory) throw new Error('plugin factory not registered')
    const mod = factory(require)
    mod.apply(ctx)
    renderFlow()
    return ctx
  }

  /* ---------------- public API ---------------- */
  window.H = {
    React, h, M, chat, session, resetMetrics, snapshot,
    boot, renderFlow, setEntries, setPending, flowProps,
    mkNode, assistantNode, toolNode, userNode, processNode, tailNode, textBlock, reasonBlock,
    setTodo(tasks) { todoState = tasks },
    get scroller() { return scroller },
    setRunning(v) { session.running = v; chat.running = v; session.emit(); chat.emit() },
    notify() { chat.emit(); session.emit() },
    entries: () => chat._entries || [],
    addNode(node) { chat.nodes.set(node.key, node); return node },
    updateNode(key, patch) { const old = chat.nodes.get(key); const next = { ...old, ...patch, data: patch.data ? { ...old.data, ...patch.data } : old.data }; chat.nodes.set(key, next); return next },
    measure: {
      start() { resetMetrics(); M.measuring = true; this._last = performance.now(); this._raf() },
      _raf() { if (!M.measuring) return; const now = performance.now(); M.frames.push(now - this._last); this._last = now; requestAnimationFrame(() => this._raf()) },
      stop() { M.measuring = false; return snapshot() },
    },
  }
})()