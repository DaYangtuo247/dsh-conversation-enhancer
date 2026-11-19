/*!
 * conversation-flow — the conversation list, drawn one quiet column (model half).
 *
 * Replaces dsh's `conversation.chat.flow` (the message list inside the 对话 tab). Each turn reads
 * in source order, the way a quiet transcript reads:
 *   - the user message, narration and the answer, always visible;
 *   - thinking inline as dsh's quoted 「思考」 block, in 思考 / 详尽 only (标准 leaves it out);
 *   - consecutive tool calls fold into one quiet line, 「命令 ×3 · 失败 ×1 ›」, that opens
 *     to one bordered card with a row per call (open by default in 详尽). In 标准 the hidden
 *     thinking does not split a run.
 *   - consecutive tool calls fold into one quiet line, 「命令 ×3 · 失败 ×1 ›」, that opens
 *     to one bordered card with a row per call (open by default in 详尽).
 * A running turn reads as three stacked lines, and each answers one question:
 *   - the counts (「思考 ×6 · 工具 ×8 ›」) — what has happened so far;
 *   - the live line under the group it belongs to — what is happening now: the call in flight with
 *     its own seconds (「命令 · sleep 3 · 2 秒」), the answer streaming (「输出中…」), or the words the
 *     model is thinking. It says WHAT; it never repeats the state the line below it already names;
 *   - dsh's own running row (the whale, 「深度求索中，用时 12 秒」) — how long the turn has been
 *     going. It is untouched: same words, same blue, same shimmer.
 *
 * This file is the model: how a row is classified, how entries expand and lay out into turns, the
 * structural signature that decides when the list re-renders, and the caches (timers, pictures).
 * The components that draw a turn live in lib/flow-view.ts (makeFlowView); the styles live in
 * styles/08-conversation-flow.scss. Every node is still drawn by dsh's own renderer — the native flow
 * component is called once per row — so tool details, markdown, approvals and other plugins' rows
 * keep working. Only the structure around them is ours.
 */
part({
  id: 'conversation-flow',
  factory(require, kit) {
    const { React, h } = kit
    const V = kit.vocab // words, kinds, duration (display-shared)
    const SLOT = 'conversation.chat.flow'
    const zh = V.zh

    /* ---------- classification ----------
       The kind table, the 「名词 ×N」 word lists and the duration wording are display-shared's
       (kit.vocab), so this mode and the native mode (dsh-tool-groups) speak exactly the same words. */
    const ORDER = V.ORDER
    const words = V.words

    const turnAt = (node) => {
      const loc = node && node.location
      if (!loc || (loc.kind !== 'turn' && loc.kind !== 'step')) return null
      return loc.turn || null
    }
    const turnOf = (node) => {
      const t = turnAt(node)
      return t ? t.turn ?? null : null
    }
    const turnOpen = (node) => {
      const t = turnAt(node)
      return !!t && t.status === 'open'
    }
    /** The call of a tool-call node: `data.root`, a `tool-result` once settled. */
    const callOf = (node) => (node && node.data && node.data.root) || {}
    const toolName = (node) => { const c = callOf(node); return c.name || (c.call && c.call.name) || '' }
    const toolKind = (node) => V.TOOL_KIND[toolName(node)] || 'other'
    // settled calls keep one root object, so its state is computed once (the structural signature
    // reads this for every node on every store tick; re-scanning a large output each time would cost)
    const stateCache = new WeakMap()
    const toolState = (node) => {
      const c = callOf(node)
      if (c.kind !== 'tool-result') return 'running'
      const hit = stateCache.get(c)
      if (hit !== undefined) return hit
      let state = 'ok'
      if (c.error && c.error.code === 'interrupted') state = 'stopped' // stopped by the user, not a failure
      else if (c.isError) state = 'error'
      else {
        // shells report a failing command in the output, as dsh's own tool row reads it
        const out = Array.isArray(c.content) ? c.content.map((b) => (b && b.type === 'text' ? b.text : '')).join('') : ''
        const exit = /\n\[exit code: (-?\d+|null)\]\s*$/.exec(out)
        if ((exit && exit[1] !== '0') || /\n\[killed by signal: [^\]\n]+\]\s*$/.test(out)) state = 'error'
      }
      stateCache.set(c, state)
      return state
    }
    /**
     * The arguments a streaming call has written so far. Its fields arrive as JSON text, so while
     * the body is still incomplete JSON.parse throws and the line would know nothing (and fall back
     * to the bare tool name — 「bash」 tells nobody what is running). Read the strings a line names
     * straight out of the partial body instead.
     */
    const PEEK = /"(command|description|file_path|path|filePath|pattern|query|url|prompt|symbol)"\s*:\s*"((?:[^"\\]|\\.)*)/g
    const unjson = (s) => { try { return JSON.parse(`"${s}"`) } catch { return s.replace(/\\(.)/g, '$1') } }
    function partialArgs(raw) {
      const out = {}
      if (!raw) return out
      PEEK.lastIndex = 0
      let m
      while ((m = PEEK.exec(raw))) if (out[m[1]] === undefined) out[m[1]] = unjson(m[2])
      return out
    }
    // parsed once per call: the raw string is the key, so a streaming call re-parses only when its
    // arguments actually grew. Keyed by the (mutable) call object, so it dies with the node.
    const argsCache = new WeakMap()
    /** The arguments as dsh keeps them, still JSON text: settled calls on `call.argsRaw`, a call
        that is still running at the root, a streaming one as its chunk list. */
    const rawArgsOf = (node) => {
      const c = callOf(node)
      return (c.call && c.call.argsRaw) || (typeof c.argsRaw === 'string' ? c.argsRaw : '')
        || (c.args && Array.isArray(c.args.chunks) ? c.args.chunks.join('') : '')
        || ''
    }
    const argsOf = (node) => {
      const c = callOf(node)
      const raw = rawArgsOf(node)
      const hit = argsCache.get(c)
      if (hit && hit.raw === raw) return hit.args
      let args
      try { args = JSON.parse(raw) || {} } catch { args = partialArgs(raw) }
      argsCache.set(c, { raw, args })
      return args
    }
    const blocksOf = (node) => (node && node.data && Array.isArray(node.data.blocks) ? node.data.blocks : [])
    const hasText = (node) => blocksOf(node).some((b) => (b.kind === 'text' && b.text && b.text.trim()) || b.kind === 'image' || b.kind === 'other')
    const firstText = (node) => { for (const b of blocksOf(node)) if (b.kind === 'text' && b.text && b.text.trim()) return b.text.trim(); return '' }
    /**
     * Injected context — a memory snapshot, a system reminder, this step's time sample, a skill
     * catalog — is neither half of the conversation, so it is never drawn: dsh keeps it out of view
     * once the turn is prepared, and drawing it (even as a folded 「上下文 ×N」 line) only added a row
     * nobody asked for.
     *
     * Its provenance says so before its text does, and that matters: while a row is still arriving
     * its blocks are empty, so a test that reads the text says 「not injected」 for a frame and the
     * row flashes in and back out — the 「上下文注入一闪而过」 every new turn showed. `data.source`
     * (dsh's `MessageSourceMap`) is there from the first frame: everything that is not a submission
     * from the user's own client — `runtime-context`, `time-context`, `skill-catalog`, `dsh-mnemon`,
     * `plugin:*`, `retry` — is context, and so is a user-shaped row the harness wrote itself, which
     * is the one kind of user message that carries no `rpcId` (the RPC the user's own send created).
     * The text pattern stays as a fallback for rows that carry no source at all.
     */
    const INJECTED = /^(\[dsh-|<system-reminder>|<post-edit-diagnostics>|MNEMON RUNTIME MEMORY|MNEMON VIEW TOOLS|Time sampled while preparing|This is a new user request|dsh-task-ledger:|A skill is a reusable set of task-specific instructions|任务台账工具\[)/
    const sourceOf = (node) => {
      const src = node && node.data && node.data.source
      return src && typeof src === 'object' ? src : null
    }
    const isInjected = (node) => {
      const src = sourceOf(node)
      if (src && typeof src.kind === 'string') {
        if (src.kind !== 'user') return true
        if (src.rpcId) return false
        // user-shaped but not created by a send in this window: the harness writes those, and so do
        // replayed/attached messages. Let the text decide, never hide a row for a missing field.
      }
      const text = firstText(node)
      // No provenance and nothing to show yet: hold the row back instead of drawing it. Drawing on
      // one frame and removing it on the next is the flash itself; a row that never gains text or a
      // source was never a message the user wrote.
      if (!text) return true
      return INJECTED.test(text)
    }
    const reasoningOf = (node) => blocksOf(node).filter((b) => b.kind === 'reasoning' && b.text).map((b) => b.text).join('\n\n').trim()
    const hasReasoning = (node) => blocksOf(node).some((b) => b.kind === 'reasoning' && b.text && b.text.trim())

    /**
     * Row role of a flow entry: user | think | tool | text | other.
     * An assistant step that carries both thinking and text is split by dsh (groupPart) only in its
     * grouped modes; in 完全展开 it is one row, so it counts as text (its thinking stays inside it).
     */
    function roleOf(entry, node) {
      if (!entry || entry.kind !== 'node' || !node) return 'other' // a seat may hand us neither
      switch (node.kind) {
        case 'turn-process': return 'skip' // dsh's per-turn "已完成，用时" header: our run lines replace it
        // dsh's own `ContextMessageNodeView`: the injected-context row. Its visibility flips to
        // hidden once the turn is prepared, and until then it is the row that flashed.
        case 'context': return 'skip'
        case 'user': case 'steering': return 'user'
        case 'tool-call': return 'tool'
        case 'assistant-step':
          if (entry.groupPart === 'reasoning') return 'think'
          if (entry.groupPart === 'response') return hasText(node) ? 'text' : 'think'
          // a step with neither text nor reasoning yet says nothing: it is drawn when it does
          return hasText(node) ? 'text' : hasReasoning(node) ? 'think' : 'skip'
        // dsh's own node views that are part of the conversation and keep their place: the bar at the
        // end of a turn (copy / fork / retry — that whole row is dsh's), a turn that failed or hit its
        // token limit, a model retry, the compaction dividers, a question the user answered, a
        // workflow run, an approval command.
        case 'turn-tail': case 'turn-error': case 'turn-max-tokens': case 'model-retry':
        case 'manual-compaction': case 'compaction':
        case 'question-reply': case 'workflow-run': case 'command': case 'command-input':
          return 'other'
        // dsh's chrome around the conversation — the injected-context rows (`context`), the turn
        // trigger, the system-prompt rows. Drawn by hand they showed as rows nobody asked for, and
        // the ones dsh hides later flashed in and out.
        case 'turn-trigger':
        case 'system-prompt':
        // a node view dsh itself does not know how to draw: nothing here knows better
        case 'unknown':
        // Kinds dsh adds in a future version are not guessed at either: a row appears here when it
        // is named, not because it fell through.
        default: return 'skip'
      }
    }

    const isGroup = (entry) => entry.kind === 'group' && /^\["process"/.test(entry.key)
    const seqOf = (node) => (node && typeof node.anchorSeq === 'number' ? node.anchorSeq : 0)

    /**
     * dsh folds each process span (thinking + tool calls) into one `group` entry. Put the member
     * nodes back: the thinking and tool-call nodes of that turn whose sequence falls between the
     * row before the group and the row after it, plus the thinking half of the row after it.
     */
    function expand(entries, nodes, all) {
      if (!entries.some(isGroup)) return entries
      const shown = new Set(entries.filter((e) => e.kind === 'node').map((e) => e.key))
      const byTurn = new Map()
      for (const node of all) {
        if (node.visibility === 'hidden') continue
        const t = turnOf(node)
        if (t === null) continue
        const isTool = node.kind === 'tool-call'
        const isThink = node.kind === 'assistant-step' && hasReasoning(node)
        if (!isTool && !isThink) continue
        if (isThink && hasText(node) && !shown.has(node.key)) continue // its own text row carries it
        if (!byTurn.has(t)) byTurn.set(t, [])
        byTurn.get(t).push(node)
      }
      for (const list of byTurn.values()) list.sort((a, b) => seqOf(a) - seqOf(b))
      const used = new Set()
      // nodes this pass already emitted as members of a group: their own entry must not be pushed
      // again (that drew one call twice and counted it twice in 「命令 ×N」)
      const absorbed = new Set()
      const out = []
      for (let i = 0; i < entries.length; i += 1) {
        const entry = entries[i]
        if (!isGroup(entry)) {
          if (entry.kind === 'node' && !entry.groupPart && absorbed.has(entry.key)) continue
          out.push(entry)
          continue
        }
        let prev, next
        for (let j = i - 1; j >= 0 && !prev; j -= 1) if (entries[j].kind === 'node') prev = nodes.get(entries[j].key)
        for (let j = i + 1; j < entries.length && !next; j += 1) if (entries[j].kind === 'node') next = nodes.get(entries[j].key)
        const t = (next && turnOf(next)) ?? (prev && turnOf(prev))
        const lo = prev && turnOf(prev) === t ? seqOf(prev) : -Infinity
        const hi = next && turnOf(next) === t ? seqOf(next) : Infinity
        // `next` is pulled in only when it is a tool call, i.e. when it has no entry of its own to be
        // drawn by (its entry is dropped by `absorbed` below). Pulling an assistant-step in as well
        // emitted that node twice — once as the group's reasoning part, once as its own row.
        const members = (byTurn.get(t) || []).filter((n) => !used.has(n.key) && (
          (seqOf(n) > lo && seqOf(n) < hi) || (next && n.key === next.key && n.kind === 'tool-call')))
        if (!members.length) { out.push(entry); continue } // unknown shape: let dsh draw it
        for (const n of members) {
          used.add(n.key)
          absorbed.add(n.key)
          out.push(n.kind === 'assistant-step' && shown.has(n.key)
            ? { kind: 'node', key: n.key, groupPart: 'reasoning' }
            : { kind: 'node', key: n.key })
        }
      }
      return out
    }

    /**
     * One row's share of its turn's signature: what it is, the entry dsh draws it from (an entry can
     * be re-cut into a process group without its node changing) and everything `nodeContrib` tracks.
     */
    const inTurn = (entry, node, tag: string) => mix(mix(mix(sigId(tag), sigId(entry.key)), sigId(entry.groupPart || '')), node ? nodeContrib(node) : 0)
    /** Cut the entries into turns, and each turn into user rows, process runs and text rows. */
    function layout(entries, nodes, all, view) {
      const turns = []
      let cur = null
      for (const entry of expand(entries, nodes, all)) {
        const node = entry.kind === 'node' ? nodes.get(entry.key) : undefined
        const t = node ? turnOf(node) : cur ? cur.turn : null
        if (!cur || (t !== null && t !== cur.turn)) {
          // Keyed on the turn number alone. Carrying the first entry's key meant that every row dsh
          // spliced in or took away (the injected context) remounted the whole turn: its timers went
          // back to zero and the fade-in replayed. A turn is the same turn whatever row leads it.
          // `sig` is what lets an untouched turn skip its re-render: layout builds new turn and
          // item objects on every pass, so object identity can never answer that question.
          cur = { turn: t, key: t !== null ? `t:${t}` : `t:none:${turns.length}`, items: [], open: false, sig: 2166136261 }
          turns.push(cur)
        }
        if (node && turnOpen(node)) cur.open = true
        // How the turn ended, and whether a message was delivered into it while it ran. dsh never
        // folds those two (its 「已停止」/「处理失败」 header takes the place of 「已完成，用时」), so
        // neither do we: folding hides the work that was cut off.
        const loc = node && node.location
        const reasonLoc = loc && (loc.kind === 'turn' || loc.kind === 'step') ? loc.turn && loc.turn.end : null
        const reason = reasonLoc && reasonLoc.data && reasonLoc.data.reason && reasonLoc.data.reason.kind
        if (reason) cur.reason = reason
        if (node && node.kind === 'steering') cur.interleaved = true
        const role = roleOf(entry, node)
        if (role === 'skip') continue
        if (node && node.visibility === 'hidden') continue
        // injected context (mnemon reviews, reminders, the task-ledger rules) is not the user
        // talking and is not the assistant either: it is left out of the transcript entirely.
        // A steering row is the user interrupting a running turn, so it is never judged by source.
        if (role === 'user' && node && node.kind !== 'steering' && isInjected(node)) continue
        if (role === 'think') {
          if (view === 'normal') continue // 标准: no thinking at all
          if (!reasoningOf(node)) continue
          cur.items.push({ type: 'think', key: `think:${entry.key}`, entry, node, role })
          cur.sig = mix(cur.sig, inTurn(entry, node, 'think'))
        } else if (role === 'tool') {
          const last = cur.items[cur.items.length - 1]
          // a subagent launch is its own line, always in view: it is work handed off, not a detail
          const spawn = toolName(node) === 'subagent'
          if (spawn) cur.items.push({ type: 'run', key: `run:${entry.key}`, agent: true, rows: [{ entry, node, role }] })
          else if (last && last.type === 'run' && !last.agent) last.rows.push({ entry, node, role })
          else cur.items.push({ type: 'run', key: `run:${entry.key}`, rows: [{ entry, node, role }] })
          cur.sig = mix(cur.sig, inTurn(entry, node, spawn ? 'agent' : 'run'))
        } else {
          cur.items.push({ type: 'row', key: entry.key, entry, node, role })
          cur.sig = mix(cur.sig, inTurn(entry, node, 'row'))
        }
      }
      return turns
    }

    /**
     * A structural fingerprint of the transcript: everything `layout` and the turn labels read,
     * minus the streamed prose. While only a reply's (or a thought's) text grows, this number is
     * unchanged, so the turn list is reused and every memoized Turn bails — the streaming row still
     * updates through dsh's own per-node seat, and Thought through its own subscription. A new row,
     * a tool settling, a turn opening or closing, the view or cwd changing: all change the number.
     *
     * It is a mixed integer, not a string: this runs inside a store selector, i.e. once per streamed
     * token, over every node in the session. Building a string per node (or hashing one character at
     * a time) cost ~56 ms per pass on a 17k-node transcript — a dropped frame per token, the
     * stutter the flow showed while it worked. Strings are therefore interned once into numbers and
     * only numbers are mixed; a pass is now a few reads and multiplies per node, no garbage.
     *
     * Interning is keyed by the string itself, so a node key, a tool name and a status are each
     * hashed once in the lifetime of the transcript rather than per notification.
     */
    const SIG_IDS = new Map<string, number>()
    let sigNext = 1
    function sigId(v: any) {
      if (typeof v !== 'string') return typeof v === 'number' ? (v | 0) : 0
      let id = SIG_IDS.get(v)
      if (id === undefined) {
        id = sigNext++
        // a session switch builds a new transcript: thousands of new keys, and the old ones are dead
        if (SIG_IDS.size > 60000) { SIG_IDS.clear(); sigNext = 1; id = sigNext++ }
        SIG_IDS.set(v, id)
      }
      return id
    }
    /** FNV-1a's multiplier over a mixed number (avalanche enough for one equality test). */
    const mix = (h: number, v: number) => Math.imul(h ^ (v | 0), 16777619)
    /**
     * What one row contributes, kept per node object together with the handful of objects and
     * numbers it was computed from. A settled row keeps its `data`, its turn and its end object
     * across notifications (dsh hands out a new node only when something in it changed), so the
     * whole scan collapses to a few identity compares plus one mix: that is what made a pass over a
     * 17k-node transcript cheap enough to run on every token.
     *
     * `b0` is the length of the row's first text block: the one field that can change inside an
     * otherwise identical `data` while a thought is being written, and the only reason the fast path
     * is safe.
     */
    const SIG_ENTRY = new WeakMap<object, { kind: string, key: string, part: string, id: number }>()
    const SIG_NODE = new WeakMap<object, {
      key: number, kind: number, vis: string, visId: number
      data: any, loc: any, turn: any, end: any, seq: number, b0: number
      contrib: number
    }>()
    /** The length of a call's text output, without building the string `outText` would. */
    function outLen(node) {
      const list = callOf(node).content
      if (!Array.isArray(list)) return 0
      let n = 0
      for (let i = 0; i < list.length; i += 1) {
        const b = list[i]
        if (b && b.type === 'text' && b.text) n += b.text.length + 1
      }
      return n
    }
    const b0Len = (blocks) => (blocks && blocks.length && blocks[0] && typeof blocks[0].text === 'string' ? blocks[0].text.length : -1)
    /**
     * What one row contributes to the transcript's shape, cached per node object together with the
     * handful of objects and numbers it was computed from (`SIG_NODE` above). A settled row keeps its
     * `data`, its turn and its end object across notifications — dsh hands out a new node only when
     * something in it changed — so the whole scan collapses to a few identity compares plus one mix.
     *
     * The same number feeds a turn's own signature (see `layout`), which is what lets a turn the
     * reader is not looking at skip its re-render.
     */
    function nodeContrib(n) {
      const data = n.data
      const blocks = data && Array.isArray(data.blocks) ? data.blocks : null
      const loc = n.location
      const turn = loc && (loc.kind === 'turn' || loc.kind === 'step') ? loc.turn : null
      const end = turn ? turn.end : null
      const seq = n.anchorSeq | 0
      const b0 = b0Len(blocks)
      let c = SIG_NODE.get(n)
      // fast path: nothing this row's contribution is made of has been replaced
      if (c !== undefined && c.data === data && c.loc === loc && c.turn === turn && c.end === end
        && c.seq === seq && c.b0 === b0) return c.contrib
      if (c === undefined) {
        c = { key: sigId(n.key), kind: sigId(n.kind), vis: '\u0000', visId: 0, data: undefined, loc: undefined,
          turn: undefined, end: undefined, seq: 0, b0: 0, contrib: 0 }
        SIG_NODE.set(n, c)
      }
      const vis = n.visibility || ''
      if (c.vis !== vis) { c.vis = vis; c.visId = sigId(vis) }
      let x = 2166136261
      x = mix(x, c.key); x = mix(x, c.kind); x = mix(x, c.visId); x = mix(x, seq)
      // the turn this row belongs to: which one, whether it is still open, and how it ended
      x = mix(x, turn ? (turn.turn ?? -1) : 0)
      x = mix(x, turn && turn.status === 'open' ? 1 : 0)
      x = mix(x, end && end.data && end.data.reason ? sigId(end.data.reason.kind) : 0)
      // the two bits layout reads off the row's blocks: a text to draw, a thought to fold. A text
      // that is only whitespace counts as drawn here — over-sensitive is safe, the layout above
      // still decides with trim(); under-sensitive would leave a row out.
      let bits = 0
      if (blocks) {
        for (let i = 0; i < blocks.length; i += 1) {
          const b = blocks[i]
          if (!b) continue
          if (b.kind === 'text') { if (b.text && b.text.length) bits |= 1 }
          else if (b.kind === 'image' || b.kind === 'other') bits |= 1
          else if (b.kind === 'reasoning' && b.text && b.text.length) bits |= 2
        }
      }
      x = mix(x, bits)
      x = mix(x, sigId(toolName(n)))
      const state = toolState(n)
      x = mix(x, sigId(state))
      x = mix(x, sigId((data && data.status) || ''))
      // a call in flight fills up without any structural change, and its args and its output are
      // what decide whether it can be drawn (blankCall) and which pictures its run shows (imagesOf)
      if (state === 'running') { x = mix(x, rawArgsOf(n).length); x = mix(x, outLen(n)) }
      c.data = data; c.loc = loc; c.turn = turn; c.end = end; c.seq = seq; c.b0 = b0; c.contrib = x
      return x
    }

    function structSig(nodes, entries, view, cwd, lang) {
      if (!nodes || !entries) return ''
      let h = 2166136261
      h = mix(h, sigId(view)); h = mix(h, sigId(lang || '')); h = mix(h, sigId(cwd || ''))
      h = mix(h, entries.length); h = mix(h, nodes.size)
      for (let i = 0; i < entries.length; i += 1) {
        const e = entries[i]
        // the entry objects dsh hands out repeat across notifications too: three interned ids per
        // entry were over half of this pass, one cached mix does the same job
        let c = SIG_ENTRY.get(e)
        if (c === undefined) { c = { kind: '\u0000', key: '\u0000', part: '\u0000', id: 0 }; SIG_ENTRY.set(e, c) }
        const part = e.groupPart || ''
        if (c.kind !== e.kind || c.key !== e.key || c.part !== part) {
          c.kind = e.kind; c.key = e.key; c.part = part
          c.id = mix(mix(sigId(e.kind), sigId(e.key)), sigId(part))
        }
        h = mix(h, c.id)
      }
      for (const n of nodes.values()) h = mix(h, nodeContrib(n))
      return `${h >>> 0}`
    }

    function summary(rows) {
      const counts = {}
      let failed = 0
      for (const r of rows) {
        const k = toolKind(r.node)
        counts[k] = (counts[k] || 0) + 1
        if (toolState(r.node) === 'error') failed += 1
      }
      // the same 「命令 ×3 · 读取 ×2」 builder the native mode uses, order and capitalisation included
      return { text: V.labelOf(counts), failed }
    }

    /* ---------- line icons ---------- */
    /** Tools whose on-screen name differs from the raw tool name. */
    const ALIAS = { compress: 'compact' }
    const svg = (...kids) => h('svg', { width: 16, height: 16, viewBox: '0 0 16 16', 'aria-hidden': true, fill: 'none', stroke: 'currentColor',
      strokeWidth: 1.3, strokeLinecap: 'round', strokeLinejoin: 'round' }, ...kids)
    const P = (d) => h('path', { d })
    /* Every mark is drawn on the same 16-unit grid and then fitted into one 10.6-unit ink box
       centred on (8,8). The shapes differ a lot in extent — `read` is tall, `code` is wide,
       `command` is nearly square — and left as drawn they read as different sizes sitting at
       different heights; the fit makes a row of them look like one set. The stroke is divided
       by the fit so the weight stays the same whatever scale a shape needed. */
    const MARKS = {
      // a brain: the line is the model thinking, and a sparkle reads as 「new idea」
      think: [P('M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z'), P('M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z'), P('M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4'), P('M17.599 6.5a3 3 0 0 0 .399-1.375'), P('M6.003 5.125A3 3 0 0 0 6.401 6.5'), P('M3.477 10.896a4 4 0 0 1 .585-.396'), P('M19.938 10.5a4 4 0 0 1 .585.396'), P('M6 18a4 4 0 0 1-1.967-.516'), P('M19.967 17.484A4 4 0 0 1 18 18')],
      command: [h('rect', { x: 1.9, y: 2.9, width: 12.2, height: 10.2, rx: 2 }), P('M4.8 6.3 6.9 8l-2.1 1.7'), P('M8.6 10h2.8')],
      code: [P('M5.5 4.5 2 8l3.5 3.5'), P('M10.5 4.5 14 8l-3.5 3.5')],
      read: [P('M4 1.9h5l3 3v9.2H4z'), P('M9 1.9v3h3'), P('M6 8.5h4M6 11h4')],
      search: [h('circle', { cx: 7, cy: 7, r: 4.3 }), P('m10.2 10.2 3.6 3.6')],
      edit: [P('M10.4 2.6 13.4 5.6 6 13H3v-3z'), P('m9 4 3 3')],
      web: [h('circle', { cx: 8, cy: 8, r: 6 }), P('M2 8h12'), P('M8 2c1.7 1.7 2.5 3.7 2.5 6S9.7 12.3 8 14C6.3 12.3 5.5 10.3 5.5 8S6.3 3.7 8 2Z')],
      agent: [h('circle', { cx: 8, cy: 5.3, r: 2.6 }), P('M3 13.8c.6-2.5 2.6-4 5-4s4.4 1.5 5 4'), P('M12.2 2.4l.5 1 1 .5-1 .5-.5 1-.5-1-1-.5 1-.5z')],
      plan: [P('M3 4.5 4 5.5 6 3.5'), P('M3 10.5 4 11.5 6 9.5'), P('M8.5 4.5H13M8.5 10.5H13')],
      compact: [P('M3.3 3.5h9.4'), P('M3.3 12.5h9.4'), P('M6.9 6.2 8 7.3l1.1-1.1'), P('M6.9 9.8 8 8.7l1.1 1.1'), P('M8 5.6v1.6M8 10.4V8.8')],
      other: [P('M9.8 2.3a3.3 3.3 0 0 0-3.9 4.4L2.3 10.3a1.2 1.2 0 0 0 0 1.7l1.7 1.7a1.2 1.2 0 0 0 1.7 0l3.6-3.6a3.3 3.3 0 0 0 4.4-3.9l-2 2-2.1-.5-.5-2.1z')],
      steps: [P('M6 4h7.5M6 8h7.5M6 12h7.5'), h('circle', { cx: 3, cy: 4, r: .6 }), h('circle', { cx: 3, cy: 8, r: .6 }), h('circle', { cx: 3, cy: 12, r: .6 })],
      stop: [h('circle', { cx: 8, cy: 8, r: 6 }), h('rect', { x: 5.7, y: 5.7, width: 4.6, height: 4.6, rx: 1, fill: 'currentColor', stroke: 'none' })],
    }
    const FIT = {
      think: { t: 'translate(2.42 2.42) scale(0.465)', w: 2.80 }, // drawn on a 24-unit grid
      command: { t: 'translate(1.72 1.72) scale(0.785)', w: 1.66 },
      code: { t: 'translate(1.62 1.62) scale(0.797)', w: 1.63 },
      read: { t: 'translate(1.72 1.72) scale(0.785)', w: 1.66 },
      search: { t: 'translate(0.95 0.95) scale(0.855)', w: 1.52 },
      edit: { t: 'translate(0.57 0.93) scale(0.906)', w: 1.43 },
      web: { t: 'translate(1.62 1.62) scale(0.797)', w: 1.63 },
      agent: { t: 'translate(1.03 1.24) scale(0.835)', w: 1.56 },
      plan: { t: 'translate(0.5 0.97) scale(0.938)', w: 1.39 },
      compact: { t: 'translate(0.07 0.07) scale(0.991)', w: 1.31 },
      other: { t: 'translate(1.32 1.32) scale(0.835)', w: 1.56 },
      steps: { t: 'translate(1.2 1.16) scale(0.855)', w: 1.52 },
      stop: { t: 'translate(1.62 1.62) scale(0.797)', w: 1.63 },
    }
    const icon = (k) => {
      const f = FIT[k] || FIT.other
      const mark = MARKS[k] || MARKS.other
      return h('span', { className: 'dcd-flow-icon' }, svg(h('g', { transform: f.t, strokeWidth: f.w }, ...mark)))
    }
    /** The glyph's kind: a renamed tool (`compress` reads as compact) keeps its own mark. */
    const iconKind = (node) => ALIAS[toolName(node)] || toolKind(node)
    const mainKind = (rows) => { const ks = new Set(rows.map((r) => iconKind(r.node))); return ORDER.find((k) => ks.has(k)) || (ks.size === 1 ? [...ks][0] : 'other') }

    /** A tool's name, as the transcript should read it. Only the word on screen changes. */
    const toolLabel = (node) => ALIAS[toolName(node)] || toolName(node)
    const base = (p) => String(p).replace(/\/+$/, '').split('/').pop()
    const clip = (t, n = 72) => { t = String(t).replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t }
    /** The line for a single settled call, in the words of its kind. */
    function oneLine(node) {
      const a = argsOf(node)
      const z = zh()
      const path = a.file_path || a.path || a.filePath
      switch (toolKind(node)) {
        case 'command': case 'code': return a.description ? clip(a.description) : a.command ? clip(a.command, 60) : ''
        case 'read': return path ? `${z ? '读取' : 'Read'} ${base(path)}` : ''
        case 'edit': return path ? `${z ? '编辑' : 'Edited'} ${base(path)}` : ''
        case 'agent': { const q = a.description || (typeof a.prompt === 'string' ? a.prompt.split('\n')[0] : ''); return q ? `${z ? '子智能体' : 'Subagent'} · ${clip(q, 60)}` : '' }
        case 'search': { const q = a.pattern || a.query || a.symbol; return q ? `${z ? '搜索' : 'Searched'} ${clip(q, 48)}` : '' }
        case 'web': { const q = a.query || a.url; return q ? `${z ? '查询' : 'Fetched'} ${clip(q, 56)}` : '' }
        default: return ''
      }
    }
    /**
     * What a call is doing, for the live line. A call whose arguments are still empty says the kind
     * of thing it is (「命令」/「command」), never the bare tool name — 「bash」 is a name, not a
     * description. An unknown tool has no kind to fall back on, so there the name is the only word
     * that says anything.
     */
    const describe = (node) => {
      const one = oneLine(node)
      if (one) return one
      const kind = toolKind(node)
      return kind === 'other' ? toolLabel(node) : words()[kind](1)
    }

    /* ---------- images a call made or read: small previews at the right of its line ---------- */
    /* What a row says about itself, in the form both dsh's row and our own head use for it: the one
       line a person reads. Rows are looked up by this when their keys have moved. */
    const rowText = (node) => clip(oneLine(node), 120).replace(/\s+/g, ' ').trim()
    const outText = (node) => { const c = callOf(node); return Array.isArray(c.content) ? c.content.map((b) => (b && b.type === 'text' ? b.text : '')).join('\n') : '' }
    /**
     * A call that has started but has not said a byte yet: no arguments, no output. dsh draws such a
     * row as a lone prompt glyph at the bottom of the card — an empty row, and one that makes the card
     * taller than what is in it. Nothing is known about it to draw, and the live line under the group
     * already says what is running, so the card leaves it out until it has something to show.
     */
    const blankCall = (node) => toolState(node) === 'running' && !rawArgsOf(node).trim() && !outText(node)
    /**
     * The calls an open card may list. Two kinds are left out because something else already speaks
     * for them:
     *  - the call in flight, which the live line under the card is reporting right now. dsh draws a
     *    running call as its icon and no words, so drawing it here too leaves a bare 「>_」 stub at
     *    the bottom of the card, directly above the live line saying the same command.
     *  - a call that has neither arguments nor output yet (blankCall), the first frame of every call.
     * Counts still come from the full row list: the card's header may promise more than it lists.
     */
    const bodyRows = (rows, current) =>
      rows.filter((r) => !(current && current.node && r.node === current.node) && !blankCall(r.node))
    const joinPath = (dir, p) => {
      if (p.startsWith('/')) return p
      const parts = `${dir.replace(/\/+$/, '')}/${p}`.split('/')
      const out = []
      for (const x of parts) { if (x === '..') out.pop(); else if (x !== '.' && x !== '') out.push(x) }
      return `/${out.join('/')}`
    }
    /** Image files named by the calls of a run (paths in args, the command, or its output), in order. */
    const picCache = new Map() // node key -> { sig, list }: a call is scanned again only when what it says changes
    // run key -> Map(path -> v): every picture the run has ever named. A run that is still growing
    // appends calls to its own fold, and the fold is redrawn from its rows; without this the tiles
    // would be rebuilt from scratch on each append and blink out of the line and back.
    const runPics = new Map()
    /* A picture belongs to a call that LOOKED at it, the way Claude Code previews an item: an image
       tool (read_image / view_image), a read of an image file, or any call whose result came back with
       an image in it. The path is the one the call was given. Paths that only appear in a command or
       in printed output are not pictures that were looked at: scraping them gave `ls` (a bare
       「icon.svg」 in a listing, resolved against the wrong folder) a thumbnail, and a broken one.
       A PTC program's own calls (block.subCalls) are walked too: each picture keeps the id of the call
       that looked at it (`call`), and `own` says whether that is the row's own call or one inside it. */
    const IMAGE_TOOLS = new Set(['read_image', 'view_image'])
    const IMG_FILE = /\.(?:png|jpe?g|gif|webp|bmp|svg|avif)$/i
    const blockArgs = (b) => {
      if (b.args && typeof b.args === 'object' && !Array.isArray(b.args) && typeof b.args.settle !== 'function') return b.args
      const raw = typeof b.argsRaw === 'string' ? b.argsRaw
        : b.call && typeof b.call.argsRaw === 'string' ? b.call.argsRaw
          : b.call && typeof b.call.arguments === 'string' ? b.call.arguments : ''
      if (!raw) return {}
      try { return JSON.parse(raw) || {} } catch { return partialArgs(raw) || {} }
    }
    const lookedAt = (b, args) => {
      const name = b.name || (b.call && b.call.name) || ''
      const content = Array.isArray(b.content) ? b.content : []
      const returned = content.some((x) => x && x.type === 'image')
      const given = [args.file_path, args.path, args.filePath, args.image_path].filter((t) => typeof t === 'string' && t)
      const images = given.filter((t) => IMG_FILE.test(t))
      if (IMAGE_TOOLS.has(name) || returned) return images.length ? images : given
      if (V.TOOL_KIND[name] === 'read') return images
      return []
    }
    function imagesOf(rows, cwd) {
      const found = []
      const home = homeOf(cwd || cwdNow)
      const place = (q) => {
        if (q.startsWith('~/')) return home ? home + q.slice(1) : ''
        if (q.startsWith('/')) return q
        return cwd && cwd.startsWith('/') ? joinPath(cwd, q) : ''
      }
      for (const r of rows) {
        const root = callOf(r.node)
        const sig = `${cwd || ''}|${rawArgsOf(r.node)}|${Array.isArray(root.content) ? root.content.length : 0}|${Array.isArray(root.subCalls) ? root.subCalls.length : 0}`
        const hit = picCache.get(r.node.key)
        let list
        if (hit && hit.sig === sig) list = hit.list
        else {
          list = []
          const walk = (b, args, own, depth) => {
            const id = String(b.callId || (b.call && b.call.callId) || '')
            for (const q of lookedAt(b, args)) {
              const at = place(q)
              if (at) list.push({ path: at, v: own ? r.node.key : `${r.node.key}|${id}`, call: id, own })
            }
            if (depth < 3 && Array.isArray(b.subCalls)) for (const c of b.subCalls) if (c) walk(c, blockArgs(c), false, depth + 1)
          }
          walk(root, argsOf(r.node), true, 0)
          picCache.set(r.node.key, { sig, list })
          // long sessions: drop the oldest rather than rescanning everything at a stroke
          while (picCache.size > 300) { const oldest = picCache.keys().next(); if (oldest.done) break; picCache.delete(oldest.value) }
        }
        found.push(...list)
      }
      const seen = new Set()
      return found.filter((f) => { const k = `${f.call}|${f.path}`; return seen.has(k) ? false : (seen.add(k), true) }).slice(0, 24)
    }
    /* The newest cwd, for the tile a card ROW shows for the file it names: the tool-groups part has
       the DOM but not the node, so it hands its path back here and gets a URL. */
    let cwdNow = ''
    /* flow key of a row -> the picture that row's OWN call named. The run's thumbnails answer “what did
       this group touch”; a row that printed or read one picture needs to say which — and its own text
       does not always name it (`python plot.py` writes out/fig.png without saying so). The key is the
       same one dsh puts on the rendered row (`data-chat-flow-key`), which is what the DOM side reads. */
    const rowPics = new Map()
    // the same picture, keyed by the call id dsh writes on the row (`data-chat-call-id`). The flow key
    // lives on an item *above* the row and moves when dsh re-nests the line (closed groups, sub-calls),
    // so the row asks by the id first and only falls back to the flow key.
    const rowPicsById = new Map()
    /* dsh keeps `data-chat-call-id` on the row, but the id inside the phase object has moved shape
       between releases; a row also always says what it did. Both are used to find a row's picture. */
    const rowPicsByText = new Map()
    /* dsh prints `data-chat-call-id` (the id of the tool-call block) on the row, and that line keeps
       it in every state — folded, open, re-nested. Where the id sits inside the phase object differs
       between the streaming and the settled shape (a normalised block carries `callId`, a live one
       `block.id`), so look for it instead of guessing one path. */
    const callIdOf = (node) => {
      const seen = new Set()
      const walk = (v, depth) => {
        if (!v || typeof v !== 'object' || depth > 3 || seen.has(v)) return ''
        seen.add(v)
        for (const k of ['callId', 'callID']) {
          const raw = v[k]
          if (typeof raw === 'string' && raw) return raw
          if (typeof raw === 'number') return String(raw)
        }
        for (const k of ['call', 'block', 'root']) {
          const found = walk(v[k], depth + 1)
          if (found) return found
        }
        for (const k of ['id', 'index', 'key']) {
          const raw = v[k]
          if (typeof raw === 'number') return String(raw)
          if (typeof raw === 'string' && raw) return raw
        }
        return ''
      }
      return walk(callOf(node), 0)
    }
    const mediaUrl = (path, v) => {
      try { return new URL(`api/file?path=${encodeURIComponent(path)}&v=${encodeURIComponent(v)}`, document.baseURI).href } catch { return '' }
    }

    /* ---------- thinking: the words a thought row says ---------- */
    const thinkMs = (node) => {
      const d = (node && node.data) || {}
      const t = d.timing || (d.finalNode && d.finalNode.timing) // settled steps keep it on finalNode
      return t && t.stepStartTime && t.completedTime ? t.completedTime - t.stepStartTime : 0
    }
    /**
     * What a thought row says. Live it says 「思考中…」 (with a shimmer); on its own it may say how
     * long it took (「思考 4 秒」); inside an opened group of steps it says only 「思考」 — the rail
     * there is the sequence of work, and a duration next to every line turns it into a report nobody
     * reads. Opened by default in 详尽 only.
     */
    const thoughtLabel = (node, isLive, plain) => {
      const w = words()
      if (isLive) return w.thinking
      const ms = thinkMs(node)
      return !plain && ms >= 1000 ? w.thoughtFor(V.durSec(Math.round(ms / 1000))) : w.thought
    }

    /* ---------- the caches the view reads, and the clocks it keeps ---------- */
    // first sight of a row / turn, for the live line's seconds; OPENED is the hand-toggle memory
    const firstSeen = new Map()
    const OPENED = new Map()

    /** Stand-in for a store that is momentarily empty (a session switch); must be one stable object. */
    const EMPTY_NODES = new Map()
    const readView = () => document.documentElement.getAttribute('data-dcd-view') || 'normal'
    const readLang = () => document.documentElement.lang || ''
    // the view and the language both live on <html>; the bundle's shared watcher (dom-hub) observes
    // them once for every part, so a language switch re-renders the run / thought labels (they are
    // memoized, so the store alone would not wake them)
    const subscribeHtml = (fn) => kit.dom.attr(fn)

    /** path shown in a row's text → the file URL for its row tile.
       joinPath takes (dir, path) — the other way round silently returned the cwd, which is why every
       tile pointed at the project folder. `~` is expanded from the cwd's own prefix: the browser has
       no HOME, but a session that runs in /Users/me/proj is running as /Users/me. */
    const homeOf = (cwd) => {
      const m = /^(\/Users\/[^/]+|\/home\/[^/]+)/.exec(String(cwd || ''))
      return m ? m[1] : ''
    }
    /** The tile for one rendered row: its own call's first picture, as a file URL. */
    kit.picForRow = (flowKey) => {
      const p = rowPics.get(flowKey)
      return p ? mediaUrl(p.path, p.v) : ''
    }
    kit.picForCall = (callId) => {
      const p = callId ? rowPicsById.get(String(callId)) : undefined
      return p ? mediaUrl(p.path, p.v) : ''
    }
    /* A PTC program (run_code) that is only a wrapper round one call: the source makes that one call and
       prints what came back, nothing else — no branch, no loop, no second call. Its card would say the
       same thing three times (the source with the command in it, the program's 输出, then the call with
       the command as it ran and the same output), so tool-groups draws it as that one call. It asks by
       the call id dsh writes on the row; the nodes are the flow's own, the newest it rendered. */
    let liveNodes = EMPTY_NODES
    const programs = new Map() // call id -> run_code node
    const LOGIC = /\b(?:if|else|for|while|do|switch|try|catch|function|return|await\s+Promise)\b|=>|\.(?:map|filter|forEach|reduce|some|every|find|then|join|split|replace|match)\s*\(/
    const TOOL_CALL = /\btools\.\w+\s*\(/g
    /** The source without what its words could be mistaken for: string literals (a description that says
        「… for …」) and comments, each string left as an empty one. */
    const bareCode = (code) => code
      .replace(/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/g, '""')
      .replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '')
    /** …and without its console.log(…) statements: what a wrapper prints is the call's result put into
        lines (`a.lines.map(l => …).join(…)`), which the call's own view already shows. */
    const stripPrints = (code) => {
      let out = ''
      let at = 0
      const re = /\bconsole\.(?:log|info|error|warn)\s*\(/g
      let m
      while ((m = re.exec(code))) {
        let i = m.index + m[0].length
        let depth = 1
        while (i < code.length && depth) { if (code[i] === '(') depth++; else if (code[i] === ')') depth--; i++ }
        out += code.slice(at, m.index)
        at = i
        re.lastIndex = i
      }
      return out + code.slice(at)
    }
    kit.programOf = (callId) => {
      const id = String(callId || '')
      if (!id) return null
      let node = programs.get(id)
      if (!node || liveNodes.get(node.key) !== node) {
        programs.clear()
        for (const n of liveNodes.values()) if (n && toolName(n) === 'run_code') { const k = callIdOf(n); if (k) programs.set(k, n) }
        node = programs.get(id)
      }
      if (!node) return null
      const root = callOf(node)
      const subs = Array.isArray(root.subCalls) ? root.subCalls.filter(Boolean) : []
      const code = bareCode(String(argsOf(node).code || ''))
      const calls = (code.match(TOOL_CALL) || []).length
      return { subCalls: subs.length, thin: subs.length === 1 && calls === 1 && !LOGIC.test(stripPrints(code)) }
    }
    kit.picForText = (text) => {
      const key = String(text || '').replace(/\s+/g, ' ').trim()
      if (!key) return ''
      const p = rowPicsByText.get(key)
      return p ? mediaUrl(p.path, p.v) : ''
    }
    kit.picUrl = (raw) => {
      let path = String(raw || '').trim()
      if (path.startsWith('~/')) {
        const home = homeOf(cwdNow)
        if (!home) return ''
        path = home + path.slice(1)
      } else if (!path.startsWith('/')) {
        path = joinPath(cwdNow, path)
      }
      return path ? mediaUrl(path, 'row') : ''
    }

    /* ---------- compose the view ---------- */
    const { useQuiet, Turn, Tail } = makeFlowView(kit, require, {
      toolKind, toolState, oneLine, describe, clip, base, rowText, summary, bodyRows, imagesOf,
      reasoningOf, hasText, thoughtLabel, icon, iconKind, mainKind, callIdOf, mediaUrl,
      firstSeen, OPENED, runPics, rowPics, rowPicsById, rowPicsByText,
    })

    function makeFlow(Native) {
      return React.memo(function ConversationFlow(props) {
        // the row tiles below resolve a relative path against this turn's cwd
        cwdNow = props.cwd || cwdNow
        // the mutable Map, one stable reference; the fallback keeps a session switch (the store is
        // momentarily empty) from throwing inside the selector, which would blank the transcript
        const nodes = props.useChat((s) => s.nodes) || EMPTY_NODES
        liveNodes = nodes
        // the live-timer and image caches die with the flow
        React.useEffect(() => () => { firstSeen.clear(); picCache.clear(); runPics.clear(); rowPics.clear(); rowPicsById.clear(); rowPicsByText.clear(); OPENED.clear() }, [])
        const quiet = useQuiet(props)
        // tool runs start folded, except in 详尽 (transcript-view then also opens each call's output)
        const view = React.useSyncExternalStore(subscribeHtml, readView)
        const lang = React.useSyncExternalStore(subscribeHtml, readLang)
        const openRuns = view === 'verbose'
        // Re-render the list only when the transcript's shape changes, not on every streamed token:
        // the signature ignores prose, so a growing reply (or thought) leaves it — and the turn list —
        // unchanged. The streaming row still redraws through dsh's own per-node seat, and Thought
        // through its own subscription. Off-screen turns skip layout via content-visibility (below),
        // whose `auto` intrinsic size remembers each turn after its first paint — no forced measuring.
        const sig = props.useChat((s) => structSig(s.nodes, props.entries || [], view, props.cwd, lang))
        // a turn that only carried injected context has nothing to draw: no empty section, no gap
        const turns = React.useMemo(() => layout(props.entries || [], nodes, nodes.values(), view).filter((t) => t.items.length), [sig])
        // The caches are keyed by transcript rows and only ever grew: a long session kept a timer
        // start and an image list per row it had ever drawn. Drop the keys whose
        // row is gone, once there are enough of them for it to matter.
        React.useEffect(() => {
          if (firstSeen.size > 256) {
            for (const k of [...firstSeen.keys()]) {
              // `turn:` clocks belong to turns, not to rows: pruning them restarted a running turn's
              // timer from zero the moment the map passed its cap
              if (!k.startsWith('turn:') && !nodes.has(k)) firstSeen.delete(k)
            }
          }
          if (picCache.size > 300) for (const k of [...picCache.keys()]) if (!nodes.has(k)) picCache.delete(k)
          if (runPics.size > 256) {
            const live = new Set(turns.flatMap((t) => t.items).filter((it) => it.type === 'run').map((it) => it.key))
            for (const k of [...runPics.keys()]) if (!live.has(k)) runPics.delete(k)
          }
        }, [turns])
        return h('div', { className: 'dcd-flow-root', 'data-dcf': '' },
          turns.map((t, i) => h(Turn, { key: t.key, turn: t, last: i === turns.length - 1, openRuns, view, Native, props, quiet, lang })),
          h(Tail, { Native, props, lang }))
      })
    }

    const sheet = kit.sheet('conversation-flow', CSS_CONVERSATION_FLOW)

    return {
      inject: ['slots'],
      apply(ctx) {
        // dsh hands renderSlot (how nodes get drawn) only to the entry that declared the node slot,
        // and that slot cannot be declared twice. So instead of registering a rival entry, wrap the
        // component of dsh's own entry in place, and put it back on dispose. dsh's entry registers
        // after us and is re-registered on reload, so follow it.
        const OURS = Symbol.for('dsh-conversation-enhancer/conversation-flow')
        let patched // { entry, original }
        const restore = () => {
          if (patched && patched.entry.component && patched.entry.component[OURS]) patched.entry.component = patched.original
          patched = undefined
          document.documentElement.removeAttribute('data-dcf'); sheet.remove()
        }
        const sync = () => {
          const native = ctx.slots.entries(SLOT).find((e) => !(e.options && e.options.id) && e.children)
          if (!native) { restore(); return }
          if (patched && patched.entry === native && native.component && native.component[OURS]) return
          restore()
          const original = native.component
          const Flow = makeFlow(original)
          Flow[OURS] = true
          native.component = Flow
          patched = { entry: native, original }
          sheet.ensure()
          document.documentElement.setAttribute('data-dcf', '')
        }
        let timer
        ctx.effect(() => {
          const unsub = ctx.slots.subscribe(SLOT, () => { clearTimeout(timer); timer = setTimeout(sync, 0) })
          sync()
          return () => { clearTimeout(timer); unsub(); restore() }
        }, 'conversation-flow: wrap the native flow')
      },
    }
  },
})