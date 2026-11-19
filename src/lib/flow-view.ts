/*!
 * conversation-flow's view half: the React components that draw a turn (Run, Thought, Steps, Turn, the
 * live line, thumbnails and the image viewer). Split out of parts/08-conversation-flow.ts so that file
 * stays the model (classification, layout, the structural signature, the caches) and this one is
 * purely how a turn reads on screen.
 *
 * makeFlowView(kit, require, M) closes over the model's helpers (M) and returns { useQuiet, Turn,
 * Tail } for makeFlow to compose. Nothing here re-derives data: every word, kind, duration and
 * picture lookup comes from M or kit.vocab, so the view and the native mode speak the same words.
 *
 * Folding is the .dcd-flow-fold grid-row transition (styles/08): a body that has been opened once stays
 * mounted and closes by collapsing to 0fr, so reopening is instant and nothing replays its entrance.
 */
function makeFlowView(kit: Kit, require: (name: string) => any, M: any) {
  const { React, h } = kit
  const V = kit.vocab
  const words = V.words
  const {
    toolKind, toolState, oneLine, describe, clip, base, rowText, summary, bodyRows, imagesOf,
    reasoningOf, hasText, thoughtLabel, icon, iconKind, mainKind, callIdOf, mediaUrl,
    firstSeen, OPENED, runPics, rowPics, rowPicsById, rowPicsByText,
  } = M

  /* ---------- the native flow, one row at a time ---------- */
  const EMPTY_NAV = { items: () => [] }
  function useQuiet(props) {
    // running masked and no latest-turn anchor: the native flow then adds no status line
    return React.useMemo(() => ({
      useSession: (sel, eq) => props.useSession((s) => sel(Object.assign(Object.create(s), { running: false })), eq),
      useChat: (sel, eq) => props.useChat((s) => sel(Object.assign(Object.create(s), { navigation: EMPTY_NAV })), eq),
    }), [props.useSession, props.useChat])
  }
  const entriesSig = (entries) => entries.map((e) => `${e.key}:${e.groupPart || ''}`).join('|')
  // memoized so a turn re-render does not redraw every native row: only the rows whose entries
  // actually changed call the native flow again (the streaming seat updates on its own regardless).
  // `lang` is a redraw signal: the seats read dsh's locale themselves, but a bailed memo would
  // keep their old strings on screen after a language switch.
  const NativeRows = React.memo(function NativeRows({ Native, props, quiet, entries, lang }) {
    return h(Native, { ...props, ...quiet, entries, pendingInputs: [] })
  }, (a, b) => a.Native === b.Native && a.quiet === b.quiet && a.props.cwd === b.props.cwd
    && a.lang === b.lang
    && a.props.useChat === b.props.useChat && a.props.useSession === b.props.useSession
    && entriesSig(a.entries) === entriesSig(b.entries))

  const CHEVRON = h('svg', { width: 12, height: 12, viewBox: '0 0 12 12', 'aria-hidden': true },
    h('path', { d: V.CHEV_D, fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round' }))

  function useNow(on) {
    const [now, setNow] = React.useState(() => Date.now())
    React.useEffect(() => {
      if (!on) return undefined
      const t = setInterval(() => setNow(Date.now()), 1000)
      return () => clearInterval(t)
    }, [on])
    return now
  }

  /**
   * The words the live line is still being given, as one line that keeps its end.
   *
   * A thought arrives as a stream, so nothing is retyped, nothing is cut into strips and no page
   * is turned. Every word that lands is drawn as it lands; what changes is only which part of a
   * long thought the row can hold — the line is pinned to its end, so the newest word stays
   * against the clock and the beginning falls off the row's left edge. A thought therefore reads
   * as text being written at the speed it is written, which is the whole point of the line.
   */
  const LivePreview = React.memo(function LivePreview({ text }: { text: string }) {
    const box = React.useRef<HTMLSpanElement | null>(null)
    // the words are pinned by their end in CSS, not by a transform here: the row is a flex box
    // that packs its tail to the right, and the tail is never narrower than the row. A short
    // thought therefore starts at the left edge; a long one keeps its newest word against the
    // clock and lets the beginning fall off the clipped left edge. That removes a layout read
    // and a style write from every streamed token — the old effect measured the range and wrote
    // `transform` on each render, which is exactly the kind of synchronous layout that makes
    // streaming feel like it stutters.
    //
    // JS is left with one job: mark a row that is actually cut, so only that row fades at its
    // left edge. A ResizeObserver does it after layout instead of during render; the observer
    // fires when the words grow or the row resizes, not once per token.
    React.useLayoutEffect(() => {
      const el = box.current
      const inner = el ? (el.firstElementChild as HTMLElement | null) : null
      if (!el || !inner) { if (el) el.removeAttribute('data-cut'); return undefined }
      const mark = () => {
        const cut = inner.getBoundingClientRect().width > el.clientWidth + 0.5
        if (cut) el.setAttribute('data-cut', ''); else el.removeAttribute('data-cut')
      }
      mark()
      if (typeof ResizeObserver === 'undefined') return undefined
      const ro = new ResizeObserver(mark)
      ro.observe(el)
      ro.observe(inner)
      return () => ro.disconnect()
    }, [!!text])
    // an empty line is still a line: the row keeps its height and its clock, so the first word
    // that lands does not move anything on the row it lands in
    return h('span', { className: 'dcd-flow-preview dcd-flow-preview-live', ref: box },
      text ? h('span', { className: 'dcd-flow-tail' }, text) : null)
  })

  /** One quiet line of a thought for the closed row: whitespace folded, marks left as plain text. */
  const previewOf = (text) => (text || '').replace(/`([^`\n]+)`/g, '$1').replace(/\*\*([^*\n]+)\*\*/g, '$1').replace(/\s+/g, ' ').trim()

  /**
   * The one line that says what is happening right now. It sits under the group its work belongs
   * to and is the only thing in a turn that changes before the turn ends: the call in flight, the
   * answer streaming, or the model thinking between two calls. When the work lands, the line does
   * not go anywhere — the count above changes, and with the group open the same words appear as a
   * row up there. That is the whole reading: down here what is happening, up there what happened.
   */
  const Live = React.memo(function Live({ call, streaming, thought, indent, turnKey, useChat, view }) {
    const now = useNow(true)
    // the last line this turn had words on, so the beats between steps are not blank
    const carry = React.useRef({ key: turnKey, text: '' })
    const w = words()
    // the thought this line is about is still being written, and the turn above it bails while
    // only text grows — so the words are read off the node here, the same way the thought row reads
    // its own. What is selected is the text, not the node: a streamed thought keeps one node object
    // and only grows its text, so a selector handing back the node would never fire and the line
    // would sit on the first word (or on nothing) until something else re-rendered the turn
    const cur = useChat ? useChat((s) => (thought ? reasoningOf(s.nodes.get(thought.key)) : '') || '') : ''
    const preview = thought ? previewOf(cur || reasoningOf(thought) || '') : ''
    // two clocks: a call counts itself, thinking and writing count the turn
    // turnKey already is `t:<n>`; the pruner below must be able to tell turn clocks from row clocks
    const tkey = `turn:${turnKey}`
    if (!firstSeen.has(tkey)) firstSeen.set(tkey, Date.now())
    const ckey = call ? call.entry.key : ''
    if (ckey && !firstSeen.has(ckey)) firstSeen.set(ckey, Date.now())
    const sec = Math.floor(Math.max(0, now - firstSeen.get(ckey || tkey)) / 1000)
    // Every state on this line says how long it has been going — a call counts itself from the
    // moment it started, thinking and writing count the turn they belong to. The whale row below
    // still carries the turn's own total, untouched: one line says what, the timing is here, and
    // the clock never reads differently for a command than for a thought.
    const time = sec >= 1 ? V.durSec(sec) : ''
    const kind = call ? toolKind(call.node) : 'think'
    // This line says WHAT is happening; the row below it (dsh's own, the whale) says 「深度求索中，
    // 用时 3秒」 and is left exactly as dsh draws it. 标准 view draws no thought card, and a turn
    // with no words at all reads as stuck, so the bare-thought case still names the state here.
    const text = call ? describe(call.node)
      : streaming ? w.writing
        : w.thinking
    // a thought that has not said its first word yet has nothing to put on the line, and a row
    // reading only 「思考中… · 3 秒」 is the one state the reader asked never to see: the row takes
    // its place in the turn but stays empty until there is a word to put in it, so what lands is
    // 「思考中… words · 3 秒」 from the first frame instead of a moment later
    // 思考/详尽 draw the thought's own words on this line, so an empty row would only be a
    // 「思考中… · 3 秒」 that turns into the same row with words a moment later — 标准 drew none of
    // that text, and there the words are the only cue the model is thinking at all, so the line
    // stays exactly as it always was: named, timed, and quiet until the work starts
    const quiet = view !== 'normal' && !preview && !call && !streaming
    // between two steps there is a beat where nothing has been said yet: the last thought is done
    // and the next one has not produced its first word. Leaving the line empty there reads as a
    // gap in the turn, so the last line this turn did show stays put — dimmed, still timed — and
    // the new words take it over the moment they land
    if (preview) carry.current = { key: turnKey, text: preview }
    else if (carry.current.key !== turnKey) carry.current = { key: turnKey, text: '' }
    const held = quiet ? carry.current.text : ''
    const stale = !preview && !!held
    return h('div', { className: 'dcd-flow-live', 'data-kind': kind, 'data-indent': indent ? '' : undefined,
      'data-quiet': quiet && !held ? '' : undefined,
      'data-stale': stale ? '' : undefined,
      'data-bare': !text && (preview || held) ? '' : undefined },
      icon(call ? iconKind(call.node) : 'think'),
      text ? h('span', { className: 'dcd-flow-label dcd-flow-shimmer' }, clip(text, 140)) : null,
      preview || held || thought ? h(LivePreview, { text: preview || held }) : null,
      // the clock's room is taken from the first frame: a row that gains its seconds a second
      // later would otherwise pull its words a few pixels narrower while nobody is typing
      h('span', { className: 'dcd-flow-time', 'data-empty': time ? undefined : '' }, time))
  })

  /* ---------- images: small previews at the right of a line, and the viewer they open ---------- */
  /** A small window over the page with the image at its natural size (up to the window); Esc or a click outside closes it. */
  function Peek({ pic, onClose }) {
    React.useEffect(() => {
      const key = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }
      document.addEventListener('keydown', key, true)
      return () => document.removeEventListener('keydown', key, true)
    }, [onClose])
    const url = mediaUrl(pic.path, pic.v)
    const w = words()
    const box = h('div', { className: 'dcd-flow-peek', role: 'dialog', 'aria-modal': true, 'aria-label': base(pic.path), onMouseDown: (e) => { if (e.target === e.currentTarget) onClose() } },
      h('div', { className: 'dcd-flow-peek-win' },
        h('div', { className: 'dcd-flow-peek-bar' },
          h('span', { className: 'dcd-flow-peek-name', title: pic.path }, base(pic.path)),
          h('a', { className: 'dcd-flow-peek-btn', href: url, target: '_blank', rel: 'noreferrer', title: w.openTab }, '↗'),
          h('button', { type: 'button', className: 'dcd-flow-peek-btn', onClick: onClose, 'aria-label': w.close }, '✕')),
        h('div', { className: 'dcd-flow-peek-body' }, h('img', { src: url, alt: base(pic.path) }))))
    return kit.portal(box)
  }
  // dsh's own image viewer (the one markdown images open in); our small window is only a fallback
  let Lightbox = null
  try { Lightbox = require('@deepseek-ai/dsh-client-ui-primitives').ImageLightbox || null } catch { Lightbox = null }

  /** The viewer over the page, for one of several images: ‹ › and the arrow keys step through them. */
  function Viewer({ pics, at, setAt }) {
    const pic = pics[at]
    const close = React.useCallback(() => setAt(-1), [setAt])
    const many = pics.length > 1
    const step = React.useCallback((d) => setAt((i) => (i + d + pics.length) % pics.length), [setAt, pics.length])
    React.useEffect(() => {
      if (!many) return undefined
      const key = (e) => { if (e.key === 'ArrowRight') { e.preventDefault(); step(1) } else if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1) } }
      window.addEventListener('keydown', key, true)
      return () => window.removeEventListener('keydown', key, true)
    }, [many, step])
    if (!pic) return null
    const w = words()
    const view = Lightbox
      ? h(Lightbox, { src: mediaUrl(pic.path, pic.v), alt: base(pic.path), labels: { dialog: base(pic.path), close: w.close }, onClose: close })
      : h(Peek, { pic, onClose: close })
    const nav = many ? kit.portal(h('div', { className: 'dcd-flow-nav' },
      h('button', { type: 'button', 'aria-label': w.prev, onClick: () => step(-1) }, '‹'),
      h('span', { className: 'dcd-flow-nav-text', title: pic.path }, `${base(pic.path)} · ${at + 1} / ${pics.length}`),
      h('button', { type: 'button', 'aria-label': w.next, onClick: () => step(1) }, '›'))) : null
    return h(React.Fragment, null, view, nav)
  }
  function Thumb({ pic, onOpen, onDead }) {
    const [state, setState] = React.useState('loading')
    const name = base(pic.path)
    return h('button', { type: 'button', className: 'dcd-flow-thumb', 'data-state': state, title: pic.path, 'aria-label': name, onClick: onOpen },
      h('img', { src: mediaUrl(pic.path, pic.v), alt: name, loading: 'eager', decoding: 'async',
        onLoad: () => setState('ok'), onError: () => { setState('failed'); onDead(`${pic.path}|${pic.v}`) } }))
  }
  /* A few previews at the right end of the line, 「+N」 for the rest — and always the same number
     of them. The count used to be measured from the room the text left over, but the text grows
     while a run folds more calls in (「命令 ×52 · 读取 · 编辑 ×4 …」): each growth shrank the room
     until the tiles fell off the line and came back on the next redraw. Now the tiles are fixed
     and the label is what truncates. */
  const MAX_SHOWN = 3
  function Thumbs({ pics }) {
    const [at, setAt] = React.useState(-1)
    // names that would not load: a name in a log is not a picture
    const [dead, setDead] = React.useState(null)
    const onDead = React.useCallback((id) => setDead((d) => { const n = new Set(d || []); n.add(id); return n }), [])
    const live = React.useMemo(() => (dead ? pics.filter((p) => !dead.has(`${p.path}|${p.v}`)) : pics), [pics, dead])
    // the list can shrink under an open viewer (a picture failed to load, or the run lost one):
    // leaving `at` pointing past the end keeps the viewer mounted on nothing
    React.useEffect(() => { if (at >= live.length) setAt(-1) }, [at, live.length])
    if (!live.length) return null
    const shown = live.slice(0, MAX_SHOWN)
    const more = live.length - shown.length
    return h('div', { className: 'dcd-flow-thumbs' },
      more > 0 ? h('button', { type: 'button', className: 'dcd-flow-more', onClick: () => setAt(shown.length),
        title: live.slice(shown.length).map((p) => base(p.path)).join('\n') }, `+${more}`) : null,
      shown.map((p, i) => h(Thumb, { key: `${p.path}|${p.v}`, pic: p, onOpen: () => setAt(i), onDead })),
      at >= 0 ? h(Viewer, { pics: live, at, setAt }) : null)
  }

  /* A card opened by hand must stay open while the turn keeps running: new calls arrive, layout
     hands back new item objects, and a remounted line would come back at its default state — the
     「I opened it and it closed itself」 report. The choice lives in OPENED (the model's map), keyed
     by the view and the line's own key, so it outlives any one render. */
  const useKeptOpen = (lineKey, view, fallback) => {
    const key = `${view}|${lineKey}`
    const [pick, setPick] = React.useState(null)
    const open = pick === null ? (OPENED.has(key) ? OPENED.get(key) : fallback) : pick
    const set = (v) => {
      if (OPENED.size > 200) OPENED.clear()
      OPENED.set(key, v)
      setPick(v)
    }
    return [open, set]
  }

  /** One process run: a line, and when open the tool rows in their card.
      `turnLive`: this run is the last one of a turn that is still running. Not the same as the
      tail item — a think row may follow it — so the running call is found from this flag and not
      from the tail position. */
  const Run = React.memo(function Run({ run, live, turnLive, defaultOpen, view, Native, props, quiet, lang }) {
    // a run opened or closed by hand keeps that until the view (标准/思考/详尽) changes
    const [picked, setUserOpen] = useKeptOpen(run.key, view, defaultOpen)
    // A group stays collapsed while it runs: the count is the history, the live line below says
    // what is in flight. A hand toggle still wins until the view changes.
    const multi = run.rows.length > 1
    const open = picked
    // A card that has been opened once stays mounted, and closing only folds it shut: rebuilding
    // its rows on every toggle made opening a run with dozens of calls hitch. The rows are already
    // there; the .dcd-flow-fold transition collapses them to zero height and back.
    const kept = React.useRef(false)
    if (open) kept.current = true
    const current = turnLive ? [...run.rows].reverse().find((r) => r.role === 'tool' && toolState(r.node) === 'running') : undefined
    // `busy`: a call of this run is running. The head then says only the kind — what it is, and
    // how long it has taken, is the live line's business below it.
    const busy = !!current
    const s = summary(run.rows)
    const w = words()
    // A picture belongs to the run, not to its current state: hiding the tiles while a call was in
    // flight was what made them blink out of the line every time the fold took in another call.
    const pics = run.pics || []
    // the card holds the calls that have said something; the one in flight is the live line's
    const rows = bodyRows(run.rows, current)
    const failText = s.failed ? (run.rows.length === 1 ? w.failedOne : w.failed(s.failed)) : ''
    // a call the user stopped never ran to an answer: say so instead of letting it read as done
    const stoppedText = !s.failed && run.rows.some((r) => toolState(r.node) === 'stopped') ? `· ${w.stopped}` : ''
    // one call: say what it did (「编辑 stats.py」), not the bare 「命令」
    let label = multi ? s.text : oneLine(run.rows[0].node) || s.text
    // while a single call is in flight the head says only its kind: the words that say what it is
    // running are on the live line, and when it lands those words become this head
    if (current && !multi) label = w[toolKind(current.node)](1)
    return h('div', { className: 'dcd-flow-run', 'data-open': open ? '' : undefined, 'data-busy': busy ? '' : undefined },
      h('div', { className: 'dcd-flow-line' },
        h('button', { type: 'button', className: 'dcd-flow-head', 'aria-expanded': open, onClick: () => setUserOpen(!open) },
          icon(mainKind(run.rows)),
          h('span', { className: multi ? 'dcd-flow-label dcd-flow-counts' : 'dcd-flow-label' }, label),
          failText ? h('span', { className: 'dcd-flow-err' }, `· ${failText}`) : null,
          stoppedText ? h('span', { className: 'dcd-flow-stop' }, stoppedText) : null,
          h('span', { className: 'dcd-flow-chev' }, CHEVRON)),
        pics.length ? h(Thumbs, { pics }) : null),
      kept.current && rows.length ? h('div', { className: 'dcd-flow-fold', 'data-shut': open ? undefined : '' },
        h('div', { className: 'dcd-flow-body' },
          // `dcf-card` is the class dsh-claude-theme's glass rules still name: drop it when that
          // bundle is renamed too
          h('div', { className: 'dcd-flow-card dcf-card' }, h(NativeRows, { Native, props, quiet, lang, entries: rows.map((r) => r.entry) })))) : null)
  }, (a, b) => a.run === b.run && a.live === b.live && a.turnLive === b.turnLive && a.defaultOpen === b.defaultOpen
    && a.view === b.view && a.lang === b.lang
    && a.Native === b.Native && a.quiet === b.quiet && a.props.cwd === b.props.cwd
    && a.props.useChat === b.props.useChat && a.props.useSession === b.props.useSession)

  /* ---------- thinking: a card that matches the tool card ---------- */
  /** Reasoning is prose with the odd `code` / **bold**: paragraphs, line breaks and those two marks. */
  function inline(text) {
    const out = []
    const re = /`([^`\n]+)`|\*\*([^*\n]+)\*\*/g
    let at = 0
    let m
    while ((m = re.exec(text))) {
      if (m.index > at) out.push(text.slice(at, m.index))
      out.push(m[1] !== undefined ? h('code', { key: m.index }, m[1]) : h('strong', { key: m.index }, m[2]))
      at = m.index + m[0].length
    }
    if (at < text.length) out.push(text.slice(at))
    return out
  }
  const Thought = React.memo(function Thought({ node, live, full, useChat, lang, plain }) {
    // subscribe to this node so a streaming thought redraws on its own, even while the turn above
    // bails (the turn list is reused for pure text growth). Other nodes' tokens never wake it.
    const key = node.key
    const cur = (useChat && useChat((s) => s.nodes.get(key))) || node
    const text = reasoningOf(cur)
    const [pick, setPick] = React.useState(null) // a hand toggle lasts until the view changes
    const open = pick && pick.view === full ? pick.open : full
    // opened once, the text stays mounted and folds shut like a run card (no rebuild on toggle)
    const kept = React.useRef(false)
    if (open) kept.current = true
    const isLive = live && cur.data && cur.data.status !== 'settled'
    const label = thoughtLabel(cur, isLive, plain)
    const preview = previewOf(text).slice(0, 200)
    // the capped block follows a thought that is still arriving: newest words in view unless the
    // reader scrolled up to read something (then it stays where they put it)
    const body = React.useRef(null)
    React.useEffect(() => {
      const el = body.current
      if (!el || !isLive || !open) return
      if (el.scrollHeight - el.scrollTop - el.clientHeight < 48) el.scrollTop = el.scrollHeight
    }, [text, isLive, open])
    return h('div', { className: 'dcd-flow-thought', 'data-open': open ? '' : undefined, 'data-busy': isLive ? '' : undefined },
      h('button', { type: 'button', className: 'dcd-flow-head', 'aria-expanded': open, onClick: () => setPick({ view: full, open: !open }) },
        icon('think'),
        h('span', { className: isLive ? 'dcd-flow-label dcd-flow-shimmer' : 'dcd-flow-label' }, label),
        !open && preview ? h('span', { className: 'dcd-flow-preview' }, preview) : null,
        h('span', { className: 'dcd-flow-chev' }, CHEVRON)),
      kept.current ? h('div', { className: 'dcd-flow-fold', 'data-shut': open ? undefined : '' },
        h('div', { className: 'dcd-flow-clip' },
          h('div', { className: 'dcd-flow-thought-text', ref: body },
            text.split(/\n{2,}/).map((p, k) => h('p', { key: k }, inline(p)))))) : null)
  }, (a, b) => a.node.key === b.node.key && a.live === b.live && a.full === b.full && a.plain === b.plain
    && a.useChat === b.useChat && a.lang === b.lang)

  /** Consecutive thinking and command lines of a turn make one stretch of steps. */
  function stretches(items) {
    const out = []
    let cur = null
    for (const it of items) {
      if (it.type === 'think' || (it.type === 'run' && !it.agent)) {
        if (!cur) { cur = { type: 'steps', key: `steps:${it.key}`, items: [] }; out.push(cur) }
        cur.items.push(it)
      } else { cur = null; out.push(it) }
    }
    return out
  }
  // How many lines a stretch of steps may keep before it folds into one. A running turn is left
  // flat a line longer than a finished one: there the rows are the only sign of what the model is
  // doing, and folding a two-line stretch mid-flight hides the step that is actually moving. Once
  // the turn is closed both thresholds pull the same way — a finished turn reads as its answer,
  // with one summary line standing in for the work — so the count alone decides, not the moment
  // the turn happened to close.
  const FOLD_OPEN = 3
  const FOLD_CLOSED = 2

  /** 「思考 ×2 · 命令 ×3 · 失败 ×1 ›」: a long stretch of steps, opened to its lines. */
  function Steps({ items, render, view }) {
    const [open, setOpen] = useKeptOpen(items[0] ? items[0].key : 'steps', view || 'normal', false)
    const kept = React.useRef(false)
    if (open) kept.current = true
    const thinks = items.filter((it) => it.type === 'think')
    const rows = items.flatMap((it) => (it.type === 'run' ? it.rows : []))
    const failed = rows.filter((r) => toolState(r.node) === 'error').length
    // short and countable, like the run lines: 「思考 ×3 · 工具 ×2 · 失败 ×1 ›」
    const w = words()
    const parts = []
    if (thinks.length) parts.push(h('span', { key: 't' }, w.thinks(thinks.length)))
    if (rows.length) parts.push(h('span', { key: 'r' }, w.other(rows.length)))
    // not inside `parts`: in a narrow column the counts truncate, but the line must never stop
    // saying that something failed
    const pics = items.flatMap((it) => (it.type === 'run' && it.pics) || [])
    return h('div', { className: 'dcd-flow-steps', 'data-open': open ? '' : undefined },
      h('div', { className: 'dcd-flow-line' }, h('button', { type: 'button', className: 'dcd-flow-head', 'aria-expanded': open, onClick: () => setOpen(!open) },
        // the same icon gutter as every other process line, so their text starts on one column
        icon('steps'),
        h('span', { className: 'dcd-flow-label dcd-flow-counts' }, parts.flatMap((p, i) => (i ? [h('span', { key: `d${i}`, className: 'dcd-flow-dot' }, '·'), p] : [p]))),
        failed ? h('span', { key: 'f', className: 'dcd-flow-err dcd-flow-errsep' }, w.failed(failed)) : null,
        h('span', { className: 'dcd-flow-chev' }, CHEVRON)),
      // folded, the images of its calls still show (open, each call's line shows its own)
      !open && pics.length ? h(Thumbs, { pics }) : null),
      kept.current ? h('div', { className: 'dcd-flow-fold', 'data-shut': open ? undefined : '' },
        h('div', { className: 'dcd-flow-clip' },
          h('div', { className: 'dcd-flow-steps-body' }, items.map((it) => render(it, false, true))))) : null)
  }

  /** turn key -> the row keys / call ids / row words that turn wrote into the shared picture maps */
  const ownedPics = new Map()
  const Turn = React.memo(function Turn({ turn, last, openRuns, view, Native, props, quiet, lang }) {
    // the group the live line must sit under: the last run of the turn, whatever comes after it
    const lastRunItem = (() => { for (let i = turn.items.length - 1; i >= 0; i--) if (turn.items[i].type === 'run') return turn.items[i]; return null })()
    // `nested`: drawn inside an opened group of steps, where the lines are a sequence and not a set
    // of timings
    const render = (it, live, nested = false) => {
      if (it.type === 'run') return h(Run, { key: it.key, run: it, live, turnLive: turn.open && it === lastRunItem, defaultOpen: openRuns, view, Native, props, quiet, lang })
      if (it.type === 'think') return h(Thought, { key: it.key, node: it.node, live: live && it.node.data && it.node.data.status !== 'settled', full: openRuns, plain: nested, useChat: props.useChat, lang })
      return h(NativeRows, { key: it.key, Native, props, quiet, lang, entries: [it.entry] })
    }
    // each image is previewed once per turn, on the first line that made or named it
    // (its URL carries the last call that touched it, so a redrawn image shows its latest version).
    // useMemo, not a render side effect: writing the items during render would run twice under
    // StrictMode and tie the pics to render order instead of the data.
    // the memo's value is not read: it exists for its side effect on `it.pics`
    React.useMemo(() => {
      const list = turn.items.filter((it) => it.type === 'run')
      const raw = new Map() // imagesOf once per run, not twice
      for (const it of list) raw.set(it, imagesOf(it.rows, props.cwd))
      // Once a run has shown a picture it keeps showing it: appending a call to the fold must not
      // take one away again. A path's version is the one it was first seen with — the query is only
      // a cache-buster, so a later call that names the same file must not change the tile's URL
      // and reload it (a reload shows up as a blank tile and then a picture, i.e. as a blink).
      for (const it of list) {
        const keep = runPics.get(it.key) || new Map()
        for (const p of raw.get(it)) if (!keep.has(p.path)) keep.set(p.path, p.v)
        runPics.set(it.key, keep)
      }
      const seen = new Set()
      for (const it of list) {
        it.pics = [...runPics.get(it.key)].filter(([path]) => (seen.has(path) ? false : (seen.add(path), true)))
          .map(([path, v]) => ({ path, v }))
      }
      // one picture per row: the first one its own call named (a row shows one tile, not a strip)
      const keys = new Set()
      const ids = new Set()
      for (const it of list) {
        for (const r of it.rows) {
          keys.add(r.entry.key)
          const id0 = callIdOf(r.node)
          if (id0) ids.add(id0)
          const seen = imagesOf([r], props.cwd)
          // the row's own call's picture; a PTC program's inner calls get theirs under their own id
          // (the inner row carries that id), so the program row does not repeat them
          const own = seen.filter((p) => p.own)
          for (const p of seen) {
            if (p.own || !p.call || ids.has(p.call)) continue
            ids.add(p.call)
            rowPicsById.set(p.call, p)
          }
          if (own.length) rowPics.set(r.entry.key, own[0])
          else rowPics.delete(r.entry.key)
          if (id0) {
            if (own.length) rowPicsById.set(id0, own[0])
            else rowPicsById.delete(id0)
          }
          const words0 = rowText(r.node)
          if (words0) {
            if (own.length) rowPicsByText.set(words0, own[0])
            else rowPicsByText.delete(words0)
          }
        }
      }
      // rows this turn no longer has take their tiles with them. Only THIS turn's: the maps are shared
      // by every turn, and pruning them against one turn's rows wiped every other turn's pictures —
      // the last turn drawn kept its tiles, an earlier turn's rows opened onto none
      const texts = new Set()
      for (const it of list) for (const r of it.rows) texts.add(rowText(r.node))
      const was = ownedPics.get(turn.key)
      if (was) {
        for (const k of was.keys) if (!keys.has(k)) rowPics.delete(k)
        for (const k of was.ids) if (!ids.has(k)) rowPicsById.delete(k)
        for (const k of was.texts) if (!texts.has(k)) rowPicsByText.delete(k)
      }
      ownedPics.set(turn.key, { keys, ids, texts })
      return list
    }, [turn, props.cwd])
    // a turn that leaves the list (a session switch, an older page dropped) clears what it wrote
    React.useEffect(() => () => {
      const was = ownedPics.get(turn.key)
      if (!was) return
      for (const k of was.keys) rowPics.delete(k)
      for (const k of was.ids) rowPicsById.delete(k)
      for (const k of was.texts) rowPicsByText.delete(k)
      ownedPics.delete(turn.key)
    }, [turn.key])
    const top = stretches(turn.items)
    const w = words()
    // A turn that was stopped or failed is never folded: dsh keeps its process open for exactly
    // this reason, and a folded summary of work that was cut off is what makes an interrupt read
    // as a glitch.
    // A turn the reader sent a message into while it ran is folded like any other. dsh keeps those
    // open (`hasInterleavedInput`), and copying that left the turns a reader actually typed during
    // — several messages in one turn — permanently flat, which is the reported 「多条消息不收起」:
    // the stretch a reader wants out of the way is exactly the one they interrupted. Only the
    // stretch folds; the messages they typed stay, because they are rows and not steps.
    const stopped = !turn.open && (turn.reason === 'interrupted' || turn.reason === 'aborted')
    const failed = !turn.open && turn.reason === 'error'
    const keepOpen = stopped || failed
    // an interrupted answer already ends with dsh's own 「已停止」 in its text
    const inlineStopped = turn.items.some((it) => it.node && it.node.data && it.node.data.status === 'interrupted')
    // dsh draws its own 「处理失败」/「超出 token」 row for those two endings (roleOf hands them over),
    // so our line must not say it a second time
    const dshEnded = turn.items.some((it) => it.node && (it.node.kind === 'turn-error' || it.node.kind === 'turn-max-tokens'))
    // what the live line says: the call in flight, else the answer streaming, else the model is
    // thinking. Read off the tail of the turn, never off the tail item alone — a thought row may
    // follow the group whose call is still running.
    const liveNow = (() => {
      for (let i = turn.items.length - 1; i >= 0; i--) {
        const it = turn.items[i]
        if (it.type === 'run') {
          const r = [...it.rows].reverse().find((x) => x.role === 'tool' && toolState(x.node) === 'running')
          return r ? { call: r } : {}
        }
        if (it.type === 'row' && it.node) {
          // only the assistant's own text row can be mid-answer: the user's message is the last row
          // for the first moments of every turn, and reading it as a streaming answer put
          // 「输出中…」 on the line before the model had written a word. roleOf names that row 'text'.
          const settled = it.node.data && it.node.data.status === 'settled'
          if (it.role !== 'text') return {}
          return !settled && hasText(it.node) ? { streaming: true } : {}
        }
        // a thought still being written is what the line under the group is about: the node, not a
        // string read out of it down here — Live subscribes to it itself, so the words keep arriving
        if (it.type === 'think') {
          const settled = it.node && it.node.data && it.node.data.status === 'settled'
          return settled ? {} : { thought: it.node }
        }
      }
      return {}
    })()
    // one live line, and only for the turn that is running: the newest one
    // never blank while a turn runs: a call in flight, the answer streaming, or the thought being
    // written (its first words ride along) — every view says something, none of them says nothing
    // the line sits in the column of the work above it — the card rows when that work is opened,
    // the run/steps lines when it is not — and takes that column in every view: 标准 and 思考 must
    // not move it. Folded is no exception: a 思考 stretch folds sooner than a 标准 one (its thought
    // rows count), and dropping the indent there left the line on a full-width row of its own.
    const lastTop = top[top.length - 1]
    const liveIndent = !!lastTop && lastTop.type === 'steps'
    // keyed: the work above it grows and shrinks, and an unkeyed line was matched by position, so
    // it was unmounted and built again at every step boundary — which is exactly when it has to
    // keep the line it was showing (its carry) instead of coming back blank
    const liveLine = turn.open && last
      ? h(Live, { key: 'live', call: liveNow.call, streaming: liveNow.streaming, thought: liveNow.thought, indent: liveIndent, turnKey: turn.key, useChat: props.useChat, view })
      : null
    const end = (failed && !dshEnded) || (stopped && !inlineStopped)
      ? h('div', { className: 'dcd-flow-end', 'data-failed': failed ? '' : undefined },
        icon('stop'), h('span', null, failed ? w.turnFailed : w.stopped))
      : null
    return h('section', { className: 'dcd-flow-turn', 'data-live': turn.open ? '' : undefined },
      top.map((it, i) => {
        const tail = turn.open && last && i === top.length - 1
        if (it.type !== 'steps') return render(it, false)
        const list = it.items
        const lastLive = (j) => tail && j === list.length - 1
        if (openRuns || keepOpen || list.length < (turn.open ? FOLD_OPEN : FOLD_CLOSED)) return list.map((x, j) => render(x, lastLive(j)))
        // the counts, the line in flight, the whale row below: no more than those. The stretch
        // folds whole — the live line already says what is happening, so a row lifted out of the
        // fold would only repeat it
        return [h(Steps, { key: it.key, items: list, render, view })]
      }),
      liveLine,
      end)
  // A turn re-renders only when something in it moved. `layout` rebuilds every turn object on every
  // pass, so identity could never answer that question: `turn.sig` is mixed from each row's own
  // contribution — exactly what the rows below read — and a turn whose rows all stood still bails,
  // instead of the whole transcript being reconciled once per tool call, which a long session felt
  // as a hitch whenever work advanced.
  }, (a, b) => a.turn.sig === b.turn.sig && a.turn.open === b.turn.open && a.turn.reason === b.turn.reason
    && a.last === b.last && a.openRuns === b.openRuns && a.view === b.view && a.lang === b.lang
    && a.Native === b.Native && a.quiet === b.quiet && a.props.cwd === b.props.cwd
    && a.props.useChat === b.props.useChat && a.props.useSession === b.props.useSession)

  // the tail (dsh's running line + pending inputs) is the native flow with no rows; memoized so a
  // streamed token does not redraw it — RunningStatus subscribes to the running state on its own.
  // pendingInputs is NOT self-subscribing: the panel retires a submission echo once its durable
  // node lands and hands us a new array. Bailing over that change would freeze the echo on screen
  // as a second copy of the message just sent, so its identity is part of the comparison.
  const Tail = React.memo(function Tail({ Native, props, lang }) {
    return h(Native, { ...props, entries: [] })
  }, (a, b) => a.Native === b.Native && a.props.cwd === b.props.cwd && a.lang === b.lang
    && a.props.pendingInputs === b.props.pendingInputs
    && a.props.useChat === b.props.useChat && a.props.useSession === b.props.useSession)

  return { useQuiet, Turn, Tail }
}