/*!
 * dsh-tool-groups — browser half.
 *
 * Quiet tool-call groups. dsh shows every tool call as its own row; a
 * run of consecutive calls in one turn is folded here into one line such as
 * 「命令 ×3 · 读取 ×2 ›」. Clicking it opens a bordered card,
 * one call per row with dividers and a › on the right — the way a quiet list does
 * them. Each row still opens dsh's own input / output view.
 *
 * - Commands show only their description (no 「运行命令 ·」 prefix); other
 *   tools keep 「读取 · 文件名」 so the row still says what happened.
 * - While a call runs, the counts line stays put and the current call previews
 *   below it with a pulsing marker and how long it has been running, e.g.
 *   「⁘ 列出当前目录文件 12s」; a single-call group keeps it on the line itself.
 * - Hidden thinking (zero height) does not split a run; visible text does.
 * - A group you open or close by hand stays that way until reload.
 *   With dsh-transcript-view in 详尽 (verbose) view, groups start open.
 *
 * - Images a call looked at (read_image) show as small thumbnails at the
 *   right end of the line; a click opens dsh's own image viewer.
 *
 * Only the browser DOM is touched: a header element inside the first row of
 * each run, and data-dcd-group-* attributes on the rows. Session data is untouched.
 * The stylesheet lives in styles/03-tool-groups.scss (styleToolGroups).
 */
part({
  id: 'dsh-tool-groups',
  factory(require, kit) {
    const V = kit.vocab // words, chevron, attribute helpers (display-shared)
    const NODE = '> [data-slot="conversation.chat.node"]'
    // the node slot is display:contents (no box), so the card is drawn on the call row inside it
    const CALL = '> [data-slot="conversation.chat.node"] > [data-chat-call-id]'
    const ROW = ':is([data-disclosure-row],[data-expandable][role="button"])'
    // a member of an open group here, or a tool row in a conversation-flow (08) card: the same card look
    const OPEN = ':is([data-dcd-group-member]:not([data-dcd-group-hide]),.dcd-flow-card > [data-chat-flow-key])'
    const CHEV_MASK = V.CHEV_MASK
    const CHEVRON = V.CHEV_SVG
    const setAttr = V.setAttr
    const setFlag = V.setFlag
    const zh = V.zh
    const setText = (el, s) => { if (el.textContent !== s) el.textContent = s }
    /** Keep `attr` on exactly the elements in `want`. */
    const syncMarks = (attr: string, want: Set<Element>) => {
      for (const el of document.querySelectorAll(`[${attr}]`)) if (!want.has(el)) el.removeAttribute(attr)
      for (const el of want) if (!el.hasAttribute(attr)) el.setAttribute(attr, '')
    }
    /** Take each attribute off every element that carries it. */
    const unmark = (...attrs: string[]) => {
      for (const a of attrs) document.querySelectorAll(`[${a}]`).forEach((m) => m.removeAttribute(a))
    }
    /** What a group writes on each of its member rows. */
    const MEMBER_ATTRS = ['data-dcd-group-member', 'data-dcd-group-head', 'data-dcd-group-first', 'data-dcd-group-last', 'data-dcd-group-hide', 'data-dcd-group-closing']
    const clearMember = (m: Element) => {
      for (const a of MEMBER_ATTRS) m.removeAttribute(a)
      const n0 = m.querySelector(NODE); if (n0) n0.removeAttribute('data-dcd-group-closing')
    }

    /* Kind of a call: dsh's data-tool / data-variant first, the row title (any locale) as fallback.
       The kind table itself is display-shared's (kit.vocab.TOOL_KIND), so both modes agree. */
    const KINDS: Array<[string, RegExp]> = [
      ['command', /^(运行命令|bash|pwsh|run command|コマンドを実行)$/i],
      ['read', /^(读取|读取图片|读取文件|read|read image|read file|読み取り|画像を読み取り)$/i],
      ['search', /^(搜索|搜索文件内容|查找文件|查找定义|查找引用|查找实现|查询代码符号|search|grep|glob|find definition|find references|find implementation|query code symbols|検索)$/i],
      ['edit', /^(写入|编辑|应用补丁|write|edit|apply patch|書き込み|編集|パッチを適用)$/i],
      ['web', /^(网页搜索|网页获取|fetch|取得)$/i],
      ['plan', /^(更新任务清单|更新任务|更新计划|update to-do list|update todo list|update plan|ToDoリストを更新)$/i],
    ]
    // conversation-flow (08) renders and groups the transcript itself when present; this part then only
    // keeps dsh's running line in sync and lets its CSS style conversation-flow's cards
    const flowActive = () => document.documentElement.hasAttribute('data-dcf')

    const TITLE_SEL = '[class$="_title"],[class*="_title "]'
    const titleOf = (item) => {
      const t = item.querySelector(TITLE_SEL)
      return (t ? t.textContent : '').trim()
    }
    function kindOf(item) {
      const tagged = item.querySelector('[data-tool]')
      const tool = tagged ? tagged.dataset.tool : ''
      if (tool && V.TOOL_KIND[tool]) return V.TOOL_KIND[tool]
      const v = item.querySelector('[data-variant="bash"],[data-sample="bash"]')
      if (v) return 'command'
      const title = titleOf(item)
      for (const [k, re] of KINDS) if (re.test(title)) return k
      return 'other'
    }
    /** What the call is doing, for the live line: a command's description, else 「标题 · 摘要」. */
    function actionOf(item) {
      const sum = item.querySelector('[class*="_summary"],[class*="_fileLink"]')
      const s = (sum ? sum.textContent : '').trim()
      if (kindOf(item) === 'command' && s) return s
      const named = item.querySelector('[data-dcd-group-title]')
      if (named) return named.getAttribute('data-dcd-group-title')
      const t = titleOf(item)
      return t && s ? `${t} · ${s}` : (t || s || item.textContent.trim().slice(0, 60))
    }
    const failed = (item) => !!item.querySelector('[data-state="error"],[data-state="failed"],[data-state="rejected"]')
    const running = (item) => !!item.querySelector('[data-state="running"],[data-state="preparing"],[data-state="pending"],[aria-busy="true"]')

    /* ---- failed / never-ran call presentation ----
       A call dsh could not even start (bad arguments) has the raw error as its title and, for bash, no
       terminal — dsh dumps its args as escaped JSON in the generic viewer. Both are restated here in the
       plugin's own voice: a tool-name title, and a real terminal built from the command + error. */
    const TOOL_NAME = {
      zh: { command: '运行命令', read: '读取', search: '搜索', edit: '编辑', web: '网页', plan: '更新计划' },
      en: { command: 'Run command', read: 'Read', search: 'Search', edit: 'Edit', web: 'Web', plan: 'Update plan' },
    }
    /** A row's own title element, with its text (the two label passes shared this lookup). */
    const titleCell = (item) => {
      const el = item.querySelector(TITLE_SEL)
      return el ? { el, text: (el.textContent || '').trim() } : null
    }
    /** The word to show when a row's own title is unusable: its tool, else a bare 「工具调用」. */
    const toolWordOf = (item) => {
      const lang = V.zh() ? 'zh' : 'en'
      const tagged = item.querySelector('[data-tool]')
      return TOOL_NAME[lang][kindOf(item)] || (tagged && tagged.dataset.tool) || (lang === 'zh' ? '工具调用' : 'Tool call')
    }
    // A call that has only just started has no arguments yet: dsh draws the row with nothing but the
    // terminal's prompt glyph, so the card ends in a bare 「>_」 until the command arrives.
    const PROMPT_ONLY = /^[>›❯$>_|·\s-]*$/
    /** One row, one label: an error restated in our voice, or a call that has not said what it runs yet. */
    function labelRow(item) {
      const t = titleCell(item)
      if (!t) return
      if (/^(error|错误)\s*[:：]/i.test(t.text)) {
        const lang = V.zh() ? 'zh' : 'en'
        const why = /invalid arguments|INVALID_ARGS|参数/i.test(t.text) ? (lang === 'zh' ? '参数无效' : 'invalid arguments') : (lang === 'zh' ? '未能执行' : 'could not run')
        setAttr(t.el, 'data-dcd-group-title', `${toolWordOf(item)} · ${why}`)
        setAttr(t.el, 'title', t.text)
        return
      }
      setAttr(t.el, 'data-dcd-group-title', null)
      // a normal row keeps the title dsh gave it; only a prompt-only one gets a word of ours
      if (!PROMPT_ONLY.test(t.text) || item.querySelector('[class*="_summary"]')) return
      setAttr(t.el, 'data-dcd-group-title', toolWordOf(item))
    }
    /* One picture, one row. The flow part owns the nodes and this part the DOM, so a row asks the
       flow (kit.picForCall / picForRow / picForText, by its call id, its key, its words) for the
       picture its own call looked at; only a row that read an image falls back to the path it prints,
       which kit.picUrl turns into a file URL (`~` expanded, a relative path against the run's cwd). */
    const IMGP = /(?:~\/|\/|[A-Za-z]:\\)[^\s"'`<>|$*?%{}\u2026]*?\.(?:png|jpe?g|gif|webp|svg|bmp|avif)(?![A-Za-z0-9])/i
    /** One of the flow's lookups, as a URL or ''; a lookup that is missing or throws says nothing. */
    const ask = (fn, arg) => {
      if (typeof fn !== 'function' || !arg) return ''
      try { return fn(arg) || '' } catch (e) { return '' }
    }
    /** A file URL without its version: the same file, whichever call it was shown for. */
    const fileOf = (u: string | null) => String(u || '').replace(/[?&]v=[^&]*/g, '')
    const rowPicUrl = (row) => {
      // the picture its own call named, by the key dsh puts on the row: a bash row's text is the
      // description it was given (「Upscale screenshot regions」), not the file it read or wrote
      // the call id is printed on the row itself; the flow key lives on an item above it and moves
      // when dsh re-nests the line, so ask by the id first
      const byCall = kit.picForCall
      const byId = ask(byCall, row.getAttribute('data-chat-call-id'))
      if (byId) return byId
      // a call a PTC program made sits inside the program's row: the node / flow key above it is the
      // PROGRAM's, so asking by it handed every inner call the program's picture. Such a row is
      // matched only by what is its own (its id, its words, a path it prints).
      const nested = !!row.closest('[data-subcalls]')
      // dsh marks the node it rendered with `data-chat-node-key` (its own key) and the *position* it
      // occupies with `data-chat-flow-key` (a group key when the line sits inside a collapsed group,
      // or a JSON pair when it belongs to a group part). The picture map is keyed by the node key, so
      // read that one — nearest first, and a group wrapper above it has none.
      const pick = (sel) => {
        const held = (row.hasAttribute(sel) ? row : row.closest(`[${sel}]`))
        return held ? held.getAttribute(sel) : ''
      }
      const byRow = nested ? null : kit.picForRow
      const byKey = ask(byRow, pick('data-chat-node-key') || pick('data-chat-flow-key'))
      if (byKey) return byKey
      // last resort: the row says what it did ("Simplify the call-id test", "读取 dsh-claude-shared/build.mjs"),
      // and conversation-flow indexed its pictures by exactly that line — the one key that does not move
      // the words index is built from the PROGRAM's rows too: an inner call that reads like its
      // program (「Screenshot regenerated repro」 twice) would inherit its picture through it
      const byText = nested ? null : kit.picForText
      if (typeof byText === 'function') {
        const summary = (row.querySelector('[class*="_summary"]') || {}).textContent || ''
        for (const t of [titleOf(row), summary]) {
          const url = String(t || '').trim() ? ask(byText, String(t)) : ''
          if (url) return url
        }
      }
      // fallback: a path printed on the row itself (「读取图片 · /tmp/z5.png」) — on a row that READ an
      // image only. A command or a listing that merely prints a file name has not looked at a picture.
      const readsImage = !!row.querySelector('[data-tool="read_image"],[data-tool="view_image"]')
        || /^(读取图片|read image|画像を読み取り)$/i.test(titleOf(row))
      if (!readsImage) return ''
      const m = String(row.textContent || '').match(IMGP)
      // a glob or a fragment is not a picture: `ls src/parts/*.png` is a command, not a file
      if (!m || /[*?%]/.test(m[0]) || m[0].split('/').length < 3) return ''
      const found = ask(kit.picUrl, m[0])
      // an inner call that names a file its program also produced: show the program's copy of it, which
      // is versioned by that call (the path alone shows whatever the file holds now, i.e. the last run's)
      if (found && nested) {
        const prog = row.parentElement && row.parentElement.closest('[data-chat-call-id]')
        const own = ask(byCall, prog && prog.getAttribute('data-chat-call-id'))
        if (own && fileOf(own) === fileOf(found)) return own
      }
      return found
    }
    // a name that did not load is not a picture (`a.png` in a test command, `/tmp/p${i}.png` in a
    // glob): remember the verdict, or every pass probes it again
    const picState = new Map<string, 'ok' | 'dead'>()
    const clearRowPic = (host: HTMLElement) => {
      const tile = tileOf(host)
      if (tile) tile.remove()
      if (!host.hasAttribute('data-dcd-group-pic')) return
      host.removeAttribute('data-dcd-group-pic')
      host.removeAttribute('data-dcd-group-pic-src')
    }
    /* ---- the lightbox a row thumb opens ---- */
    let peekEl: HTMLElement | null = null
    const onPeekKey = (e) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopPropagation()
      closePeek()
    }
    function closePeek() {
      if (!peekEl) return
      peekEl.remove()
      peekEl = null
      document.removeEventListener('keydown', onPeekKey, true)
    }
    const openPeek = (src: string) => {
      if (!src) return
      closePeek()
      const box = document.createElement('div')
      box.className = 'dcd-group-peek'
      const img = document.createElement('img')
      img.src = src
      img.alt = ''
      box.appendChild(img)
      box.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); closePeek() }, true)
      document.body.appendChild(box)
      peekEl = box
      document.addEventListener('keydown', onPeekKey, true)
    }
    /* one tile per row line, right before the chevron; the src only ever moves forward (a row keeps
       showing the first picture its own call named) so a re-render does not re-request the file */
    const tileOf = (host: HTMLElement) => {
      for (const c of Array.from(host.childNodes) as HTMLElement[]) {
        if (c && String(c.className || '').split(/\s+/).includes('dcd-group-rowthumb')) return c as HTMLImageElement
      }
      return null
    }
    const setRowPic = (host: HTMLElement, want: string) => {
      host.setAttribute('data-dcd-group-pic', '')
      host.setAttribute('data-dcd-group-pic-src', want)
      let tile = tileOf(host)
      if (!tile) {
        tile = document.createElement('img') as HTMLImageElement
        tile.className = 'dcd-group-rowthumb'
        tile.setAttribute('data-state', 'loading')
        tile.setAttribute('loading', 'eager')
        tile.setAttribute('decoding', 'async')
        tile.setAttribute('alt', '')
        // shown once its own copy has decoded (the probe proved the file is a picture; this is the
        // tile's own load): without this the tile stayed at data-state=loading, i.e. invisible
        tile.addEventListener('load', () => tile!.setAttribute('data-state', 'ok'))
        tile.addEventListener('error', () => tile!.setAttribute('data-state', 'failed'))
        // click opens it full size, and must not toggle the row open (dsh listens on the line)
        tile.addEventListener('click', (e) => {
          e.preventDefault()
          e.stopPropagation()
          openPeek(tile!.src)
        }, true)
        host.appendChild(tile)
      }
      if (tile.getAttribute('src') !== want) {
        tile.setAttribute('data-state', 'loading')
        tile.setAttribute('src', want)
      }
      // a cached picture can be complete before the listener above ever runs
      if (tile.complete && tile.naturalWidth > 0) tile.setAttribute('data-state', 'ok')
    }
    const markRowThumb = (row) => {
      const want = rowPicUrl(row)
      // the row's own line — the flex box the chevron is drawn on (see ROW) — so the picture can be
      // pushed to the right edge with it. A node appended here would be a child React does not know
      // about: any re-render of the row (opening it, a status change) reconciles the children list
      // and drops it, which is why the tile used to survive only while the row was open. An attribute
      // and a pseudo-element are ours alone and outlive React.
      const line = row.querySelector('[data-disclosure-row],[data-expandable][role="button"]')
      const title = row.querySelector(TITLE_SEL)
      const host = (line || (title && title.parentElement) || row) as HTMLElement
      // a leftover node from the previous build — this row's own only: a PTC program holds its inner
      // calls' rows, and their tiles (set just before, flowTitles does inner rows first) are not stale
      for (const stale of Array.from(row.querySelectorAll('.dcd-group-rowthumb')) as HTMLElement[]) {
        if (stale.parentElement !== host && stale.closest('[data-chat-call-id]') === row) stale.remove()
      }
      if (!want) { clearRowPic(host); return }
      // a PTC program whose inner call shows this picture: the picture belongs on that call's row
      // (the one that made or read it), not twice, once on the program as well
      // (compared by file: the program's URL carries its own call as the version, the inner row's not)
      const inner = row.closest('[data-subcalls]') ? [] : (Array.from(row.querySelectorAll('[data-subcalls] [data-dcd-group-pic-src]')) as HTMLElement[])
      if (inner.some((e) => fileOf(e.getAttribute('data-dcd-group-pic-src')) === fileOf(want))) { clearRowPic(host); return }
      if (host.getAttribute('data-dcd-group-pic-src') === want && host.hasAttribute('data-dcd-group-pic')) {
        // React reconciles the row's children on a re-render and drops a node it did not create, so
        // the marker can outlive the tile; putting it back is idempotent and costs one lookup
        if (!tileOf(host)) setRowPic(host, want)
        return
      }
      const known = picState.get(want)
      if (known === 'dead') { clearRowPic(host); return }
      if (known === 'ok') { setRowPic(host, want); return }
      // first sight of this path: show it only once it has decoded. A path scraped from a command's
      // text may name nothing, and a broken frame in the middle of a row is worse than no picture.
      clearRowPic(host)
      const tag = want
      const probe = new Image()
      probe.onload = () => {
        picState.set(tag, 'ok')
        if (rowPicUrl(row) === tag) setRowPic(host, tag)
      }
      probe.onerror = () => {
        picState.set(tag, 'dead')
        if (picState.size > 300) picState.clear()
        if (host.getAttribute('data-dcd-group-pic-src') === tag) clearRowPic(host)
      }
      probe.src = want
    }
    /* One pass over the rows the flow part draws: they are outside the grouping pass below, so their
       labels, their rewritten viewer and their picture tile are all fixed up here. */
    const flowTitles = () => {
      // inner calls (a PTC program's) before the program: the program's row checks what they show
      const all = Array.from(document.querySelectorAll('.dcd-flow-card [data-chat-call-id]'))
      const rows = all.filter((r) => r.closest('[data-subcalls]')).concat(all.filter((r) => !r.closest('[data-subcalls]')))
      for (const row of rows) {
        labelRow(row)
        fixCommandInput(row)
        markRowThumb(row)
      }
    }

    /* A bash call that failed argument validation never runs, so dsh has no terminal for it and falls
       back to the generic viewer (ioCard > ioSection[输入] + ioSection[输出]) dumping the args as escaped
       JSON. Replace that viewer with a terminal built the way normal mode builds one: sample the class
       contract off a live native terminal (block / header / promptLine / command / output / line) and reuse
       those exact classes, so dsh's own terminal CSS — output scrolling, fonts, line heights, $ gutter —
       applies unchanged. Falls back to our own dcd-group-fb_* hooks when no native terminal is mounted yet.
       Idempotent without a marker: the block matches [class*="_terminal"], so later passes skip it; if
       React restores the ioCard the block is gone and the next pass rebuilds it. */
    const el = (tag, cls) => { const e = document.createElement(tag); e.className = cls; return e }
    let TERM_CLS = null
    function terminalClasses() {
      if (TERM_CLS) return TERM_CLS
      const prompt = [...document.querySelectorAll('[class*="_promptLine_"]')].find((p) => !p.className.startsWith('dcd-group-fb_'))
      const term = prompt && prompt.closest('[class*="_terminal"]')
      const head = term && term.querySelector(':scope > [class*="_header_"]')
      const out = term && term.querySelector(':scope > [class*="_output_"]')
      if (!term || !head || !out) return null
      TERM_CLS = {
        term: term.className,
        head: head.className,
        promptLine: prompt.className,
        command: (prompt.querySelector('[class*="_command_"]') || {}).className || 'dcd-group-fb_command_',
        output: out.className,
        line: (out.querySelector('[class*="_line_"]') || {}).className || 'dcd-group-fb_line_',
      }
      return TERM_CLS
    }
    function terminalView(command, output) {
      const c = terminalClasses() || {
        term: 'dcd-group-fb_terminal', head: 'dcd-group-fb_header_', promptLine: 'dcd-group-fb_promptLine_',
        command: 'dcd-group-fb_command_', output: 'dcd-group-fb_output_', line: 'dcd-group-fb_line_',
      }
      const term = el('div', c.term)
      term.setAttribute('data-dcd-group-fb', '')
      const head = el('div', c.head)
      const pl = el('div', c.promptLine)
      const cmd = el('span', c.command)
      cmd.setAttribute('data-command-text', '')
      cmd.textContent = command
      pl.appendChild(cmd)
      head.appendChild(pl)
      term.appendChild(head)
      if (output) {
        const out = el('div', c.output)
        for (const t of output.split('\n')) { const l = el('div', c.line); l.textContent = t; out.appendChild(l) }
        term.appendChild(out)
      }
      return term
    }
    function fixCommandInput(item) {
      if (!failed(item) || item.querySelector('[class*="_terminal"]')) return
      const card = item.querySelector('[class*="_bodyWrap"] > [class*="_ioCard"]')
      if (!card) return
      const input = card.querySelector('[class*="_ioSection"] [class*="_ioText"]:not([data-error])')
      let args = null
      try { args = JSON.parse((input ? input.textContent : '').trim()) } catch { return }
      if (!args || typeof args.command !== 'string') return
      const err = card.querySelector('[class*="_ioText"][data-error]')
      setAttr(card, 'data-dcd-group-fb-src', '')
      card.after(terminalView(args.command, (err ? err.textContent : '').trim()))
    }

    /** 「命令 ×3 · 读取 ×2」 for a run of calls, in display-shared's words. */
    function label(members) {
      const counts = {}
      for (const m of members) { const k = kindOf(m); counts[k] = (counts[k] || 0) + 1 }
      return V.labelOf(counts)
    }

    /** Per-group state the user set by hand, keyed by the first call's flow key. */
    const manual = new Map()
    /** When each call was first seen while its turn was running (for the live timer). */
    const firstSeen = new Map()
    /** Groups mid close-fade: head button → the timer that lands data-dcd-group-hide after the fade. */
    const pendingClose = new Map()
    function cancelClose(btn) {
      const t = pendingClose.get(btn)
      if (t !== undefined) { clearTimeout(t); pendingClose.delete(btn) }
    }

    function makeHead(key) {
      const b = document.createElement('button')
      b.type = 'button'
      b.className = 'dcd-group-head'
      b.dataset.dcgKey = key
      b.innerHTML = '<span class="dcd-group-live" aria-hidden="true"><i></i><i></i><i></i><i></i></span><span class="dcd-group-label"></span><span class="dcd-group-time"></span><span class="dcd-group-err"></span><span class="dcd-group-chev">' + CHEVRON + '</span><span class="dcd-group-thumbs"></span>'
      b.addEventListener('click', (e) => {
        e.preventDefault(); e.stopPropagation()
        manual.set(b.dataset.dcgKey, b.getAttribute('aria-expanded') !== 'true')
        schedule()
      })
      return b
    }
    /* ---- images (read_image) ---- */
    const isImageCall = (item) => !!item.querySelector('[data-tool="read_image"],[data-tool="view_image"]')
    // per read_image call: how many times we opened it so its image mounts, or 'user' once the user took over.
    // dsh re-mounts the row when the result settles (closed again), so keep reopening until the image is in.
    const autoOpened = new Map()
    /** Make sure a read_image row's body is mounted (dsh renders it only when open). */
    function mountImage(item) {
      const key = item.dataset.chatFlowKey || ''
      const row = item.querySelector(ROW)
      const n = autoOpened.get(key) || 0
      if (!row || n === 'user' || failed(item) || running(item)) return
      if (item.querySelector('[class*="_bodyWrap"] img')) { setAttr(item, 'data-dcd-group-imgauto', row.getAttribute('aria-expanded') === 'true' && n > 0 ? '' : null); return }
      if (n >= 20) return
      if (row.getAttribute('aria-expanded') !== 'true') { autoOpened.set(key, n + 1); setAttr(item, 'data-dcd-group-imgauto', ''); row.click() }
    }
    const imagesOf = (item) => [...item.querySelectorAll('[class*="_bodyWrap"] img')].filter((im) => im.currentSrc || im.src)
    const MAX_THUMBS = 3
    function syncThumbs(btn, members) {
      const box = btn.querySelector('.dcd-group-thumbs')
      const imgs = members.flatMap(imagesOf)
      const sig = imgs.map((im) => im.currentSrc || im.src).join('|')
      if (box.dataset.sig === sig) return
      box.dataset.sig = sig
      box.textContent = ''
      imgs.slice(0, MAX_THUMBS).forEach((im, i) => {
        const t = document.createElement('button')
        t.type = 'button'
        t.className = 'dcd-group-thumb'
        t.title = im.alt || (zh() ? `查看图片 ${i + 1}` : `View image ${i + 1}`)
        const copy = document.createElement('img')
        copy.src = im.currentSrc || im.src
        copy.alt = ''
        copy.draggable = false
        // the tile fades its image in once it decodes; a cached image is complete already
        if (copy.complete) t.dataset.ok = ''
        else {
          const ok = () => { t.dataset.ok = '' }
          copy.addEventListener('load', ok, { once: true })
          copy.addEventListener('error', ok, { once: true })
        }
        t.appendChild(copy)
        t.addEventListener('click', (e) => {
          e.preventDefault(); e.stopPropagation()
          // dsh's gallery opens its viewer from the image (or its button wrapper)
          const target = im.closest('button,[role="button"]') || im
          target.click()
        })
        box.appendChild(t)
      })
      if (imgs.length > MAX_THUMBS) {
        const more = document.createElement('span')
        more.className = 'dcd-group-more'
        more.textContent = `+${imgs.length - MAX_THUMBS}`
        box.appendChild(more)
      }
    }
    // the user opening a row we opened silently: show its body instead of closing it
    function onRowClick(e) {
      const row = e.target.closest && e.target.closest(ROW)
      const item = row && row.closest('[data-dcd-group-imgauto]')
      if (!item || !e.isTrusted) return
      e.preventDefault(); e.stopPropagation()
      item.removeAttribute('data-dcd-group-imgauto')
      autoOpened.set(item.dataset.chatFlowKey || '', 'user')
    }

    function collectRuns() {
      const runs = []
      let run = []
      let turn = null
      const flush = () => { if (run.length) runs.push(run); run = [] }
      const planShown = !!document.querySelector('[data-testid="todo-panel"],.dcd-plan-card')
      for (const item of qa('[data-chat-flow-kind]')) {
        // rows inside conversation-flow (08) are already grouped into its runs and cards
        if (item.closest('.dcd-flow-root')) continue
        const kind = item.dataset.chatFlowKind
        if (item.dataset.chatTurn !== turn) { flush(); turn = item.dataset.chatTurn }
        if (kind === 'tool-call') {
          // plan updates live in the plan card (dsh-plan-checklist / the To-dos dock), as in the quiet style
          if (planShown && kindOf(item) === 'plan') { setAttr(item, 'data-dcd-group-plan', ''); continue }
          // rows dsh itself hides (folded turn process) are not ours to group. Read the hiding
          // attributes, not getClientRects(): measuring here forced a synchronous layout of the
          // whole transcript on every mutation batch.
          if (item.hasAttribute('hidden') || item.hasAttribute('data-turn-process-hidden') || item.closest('[data-turn-process-hidden],[hidden]')) continue
          run.push(item)
          continue
        }
        // hidden thinking (dsh-transcript-view 标准) takes no space and does not split a run;
        // detected from the view + group part, not offsetHeight (another forced layout)
        if (kind === 'assistant-step' && item.getAttribute('data-chat-group-part') === 'reasoning' && document.documentElement.getAttribute('data-dcd-view') === 'normal') continue
        flush()
      }
      flush()
      return runs
    }

    /* dsh's running line keeps its own words (「深度求索中，用时 1分11秒」, shimmer and all): it is the
       status half of the live block and conversation-flow's line above it says what, not how long. Two lines
       both naming the state was the thing that read as a glitch. */
    let anyLive = false
    /** One run of consecutive calls: its head line, live preview, thumbs and member markers. */
    function syncRun(members, verbose, keep) {
      const w = V.words()
      const head = members[0]
      const key = head.dataset.chatFlowKey || head.dataset.chatNodeKey || ''
      // live only while a call in the group is actually running. Once every call has returned the
      // line is the summary again, even though the turn goes on (the model is writing its next step;
      // dsh's own line at the bottom of the turn shows that)
      for (const m of members) { labelRow(m); fixCommandInput(m) }
      const current = members.filter(running).pop()
      const live = !!current
      if (live) anyLive = true
      const open = manual.has(key) ? manual.get(key) : verbose
      let btn = head.querySelector(':scope > .dcd-group-head')
      const wasOpen = btn ? btn.getAttribute('aria-expanded') === 'true' : false
      if (!btn || btn.dataset.dcgKey !== key) {
        if (btn) { cancelClose(btn); btn.remove() }
        btn = makeHead(key)
        head.insertBefore(btn, head.firstChild)
      }
      // a close fades the rows out first: data-dcd-group-closing holds them one beat (the summary line
      // stays put — only the rows it stands for fade), then a later pass lands data-dcd-group-hide.
      // Reopening inside the beat drops the marker, which cancels the fade mid-flight.
      if (wasOpen && !open && !pendingClose.has(btn)) {
        pendingClose.set(btn, setTimeout(() => { pendingClose.delete(btn); schedule() }, 150))
      } else if (open) cancelClose(btn)
      const closing = !open && pendingClose.has(btn)
      const curKey = current ? (current.dataset.chatFlowKey || '') : ''
      if (live && !firstSeen.has(curKey)) firstSeen.set(curKey, Date.now())
      // several calls: the line keeps the counts and the running call previews below it;
      // a single call keeps the live label on the line itself
      const multi = members.length > 1
      const summaryText = label(members)
      const dur = V.durSec((Date.now() - (firstSeen.get(curKey) || Date.now())) / 1000)
      setText(btn.querySelector('.dcd-group-label'), live && !multi ? actionOf(current) : summaryText)
      setText(btn.querySelector('.dcd-group-time'), live && !multi ? dur : '')
      let now = head.querySelector(':scope > .dcd-group-now')
      if (live && multi && !open) {
        if (!now) {
          now = document.createElement('button')
          now.type = 'button'
          now.className = 'dcd-group-now'
          now.innerHTML = '<span class="dcd-group-live" aria-hidden="true"><i></i><i></i><i></i><i></i></span><span class="dcd-group-label"></span><span class="dcd-group-time"></span>'
          now.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); manual.set(key, true); schedule() })
          head.insertBefore(now, btn.nextSibling)
        }
        setText(now.querySelector('.dcd-group-label'), actionOf(current))
        setText(now.querySelector('.dcd-group-time'), dur)
      } else if (now) now.remove()
      // failures show as soon as they happen, not only when the turn ends
      const nFail = members.filter(failed).length
      setText(btn.querySelector('.dcd-group-err'), nFail ? `· ${w.failed(nFail)}` : '')
      setAttr(btn, 'aria-expanded', open ? 'true' : 'false')
      setAttr(btn, 'title', live ? summaryText : (open ? w.hide : w.show))
      setAttr(btn, 'data-live', live ? '' : null)
      for (const m of members) if (isImageCall(m)) mountImage(m)
      syncThumbs(btn, members)
      members.forEach((m, i) => {
        keep.add(m)
        // a row that headed a group before a regroup (思考 → 标准 merges runs across hidden thinking) drops its old head
        if (i > 0) { const old = m.querySelector(':scope > .dcd-group-head'); if (old) old.remove(); const nw = m.querySelector(':scope > .dcd-group-now'); if (nw) nw.remove() }
        setAttr(m, 'data-dcd-group-member', '')
        // the attribute name dsh-claude-theme's glass still queries: drop it when that bundle is renamed
        setAttr(m, 'data-dcg-member', '')
        setAttr(m, 'data-dcd-group-head', i === 0 ? '' : null)
        setAttr(m, 'data-dcd-group-first', i === 0 ? '' : null)
        setAttr(m, 'data-dcd-group-last', i === members.length - 1 ? '' : null)
        setAttr(m, 'data-dcd-group-hide', closing ? null : (open ? null : ''))
        // the first member's call content lives beside the summary button, so it fades on its own
        // (the button must stay); every later member fades as a whole row
        if (i === 0) { const n0 = m.querySelector(NODE); if (n0) setFlag(n0, 'data-dcd-group-closing', closing) }
        else setFlag(m, 'data-dcd-group-closing', closing)
      })
    }

    function sync() {
      // conversation-flow owns grouping in its mode; skip the whole DOM pass (and its layout reads)
      if (flowActive()) { anyLive = false; flowTitles(); hideContextRows(); return }
      const verbose = document.documentElement.getAttribute('data-dcd-view') === 'verbose'
      const keep = new Set()
      anyLive = false
      for (const members of collectRuns()) syncRun(members, verbose, keep)
      // finished turns drop their 「已完成，用时」 line; running ones keep it as the progress cue
      const doneTurns = new Set(qa('[data-chat-flow-kind="turn-tail"]').map((t) => t.dataset.chatTurn || ''))
      for (const tp of qa('[data-chat-flow-kind="turn-process"]')) {
        setAttr(tp, 'data-dcd-group-done', doneTurns.has(tp.dataset.chatTurn || '') ? '' : null)
      }
      // undo rows that are no longer in a group
      for (const m of document.querySelectorAll('[data-dcd-group-member]')) {
        if (keep.has(m)) continue
        clearMember(m)
        const b = m.querySelector(':scope > .dcd-group-head'); if (b) { cancelClose(b); b.remove() }
        const nw = m.querySelector(':scope > .dcd-group-now'); if (nw) nw.remove()
      }
      for (const b of document.querySelectorAll('.dcd-group-head')) {
        if (!b.parentElement || !keep.has(b.parentElement)) { cancelClose(b); b.remove() }
      }
      // these two are keyed by rows that stay in the transcript for the whole session: drop the keys
      // of rows this pass no longer sees instead of growing for as long as the conversation lives
      if (firstSeen.size > 256 || autoOpened.size > 512) {
        const keepKeys = new Set(([...keep] as HTMLElement[]).map((m) => m.dataset.chatFlowKey || ''))
        for (const k of [...firstSeen.keys()]) if (!keepKeys.has(k)) firstSeen.delete(k)
        for (const k of [...autoOpened.keys()]) if (!keepKeys.has(k)) autoOpened.delete(k)
      }
    }

    /* dsh draws injected context as its own row (`ContextInjectionRow`, the 「上下文注入 · dsh-mnemon」
       line) and hides it once the turn is prepared — the row that flashed on every new turn. The flow
       no longer hands those entries over, so normally nothing is drawn; if one is drawn anyway, the
       row is dropped here as well as in the stylesheet, so it can never show for a frame. */
    function hideContextRows() {
      for (const b of qa('[data-context-injection-body],[data-context-source]')) {
        if (b.hasAttribute('data-dcd-group-gone')) continue
        b.setAttribute('data-dcd-group-gone', '')
        const row = b.closest<HTMLElement>('[class$="_root"]') || b.parentElement
        if (row) row.style.display = 'none'
      }
    }

    /* a program's source (run_code) opening with a newline: mark its block so the stylesheet folds that
       empty first line in the plain first paint and the highlighted one alike (styles: data-dcd-lead) */
    function markLead() {
      for (const cb of document.querySelectorAll('[class*="_codeBody"]')) {
        const code = cb.querySelector('pre > code')
        const lead = !!code && (code.textContent || '').startsWith('\n')
        if (lead !== cb.hasAttribute('data-dcd-lead')) cb.toggleAttribute('data-dcd-lead', lead)
      }
    }

    /* a program (run_code) that only prints what its call returned shows that text twice: as the program's
       输出, and again in the opened call under it. Mark the call's copy (data-dcd-echo) when it is the same
       text, and the stylesheet folds it to one 「同上」 line; the command stays (it has the program's
       variables filled in) and dsh's 查看 still opens the whole output. Only a call whose program row is
       open is compared — with the program closed there is no copy above it to point at. */
    const OUT_LABEL = /^(输出|Output)$/i
    // whitespace is left out of the comparison: the terminal form draws each output line as its own
    // element, so its text has no newlines where the 输出 text has them
    const norm = (t) => String(t || '').replace(/\s+/g, '')
    const ELIDED = '[...]'
    /** The same output? Word for word, or — when dsh cut the middle of a long one in both places, each
        copy with its own limit — the same text up to the cut and nearly the same length. A call that
        returned more than the program printed (a `.slice(0, n)`) is not a copy: it is left as it is. */
    function sameOutput(a, b) {
      if (!a || !b) return false
      if (a === b) return true
      if (!a.includes(ELIDED) || !b.includes(ELIDED)) return false
      return a.split(ELIDED)[0] === b.split(ELIDED)[0] && Math.abs(a.length - b.length) <= 0.05 * Math.max(a.length, b.length)
    }
    function outputOf(body) {
      if (!body) return null
      const term = body.querySelector('[class*="_terminal"] > [class*="_output_"]')
      if (term) return { el: body.querySelector('[class*="_terminal"]'), text: term.textContent }
      const sec = [...body.querySelectorAll('[class*="_ioSection"]')].find((x) => OUT_LABEL.test((x.querySelector('[class*="_ioLabel"]')?.textContent || '').trim()))
      const text = sec && sec.querySelector('[class*="_ioText"]')
      return text ? { el: sec, text: text.textContent } : null
    }
    /* a program that only wraps one call (kit.programOf, from the flow model: one call in the source and
       nothing else) is drawn as that call: its row opens the call instead of the source, the source,
       the program's 输出 and the call's own row are left out (styles: data-dcd-wrap). Only once the
       program has finished well — while it runs, or after it failed, its own body is what says why. */
    function markWrap() {
      const want = new Set<Element>()
      if (typeof kit.programOf === 'function') {
        for (const tree of document.querySelectorAll('[data-subcalls]')) {
          const program = tree.parentElement as HTMLElement | null
          if (!program || !program.matches('[data-chat-call-id]')) continue
          const own = program.querySelector(':scope > [data-slot] [data-tool="run_code"]')
          if (!own || own.getAttribute('data-state') !== 'ok') continue
          if (tree.querySelectorAll(':scope > [data-chat-call-id]').length !== 1) continue
          const info = kit.programOf(program.dataset.chatCallId)
          if (info && info.thin) want.add(program)
        }
      }
      syncMarks('data-dcd-wrap', want)
    }
    function markEcho() {
      const marked = new Set<Element>()
      for (const tree of document.querySelectorAll('[data-subcalls]')) {
        const program = tree.parentElement
        // a wrapper shows no 输出 of its own: there is nothing above for the call to repeat
        if (program && program.hasAttribute('data-dcd-wrap')) continue
        const mine = program && program.querySelector(':scope > [data-slot] [class*="_bodyWrap"]')
        const above = outputOf(mine)
        const want = above ? norm(above.text) : ''
        if (!want) continue
        for (const call of tree.querySelectorAll(':scope > [data-chat-call-id]')) {
          const out = outputOf(call.querySelector('[class*="_bodyWrap"]'))
          if (out && sameOutput(norm(out.text), want)) marked.add(out.el)
        }
      }
      syncMarks('data-dcd-echo', marked)
    }

    /* the caption under an opened picture: dsh prints the file's absolute path as plain text there. It
       becomes a link that does what the row's own file link does (opens dsh's file preview). */
    const ABS_PATH = /^(?:\/|~\/|[A-Za-z]:[\\/])/
    function markPicPaths() {
      for (const meta of Array.from(document.querySelectorAll('[class*="_imageBody"] > [class*="_imageMeta"]'))) {
        const line = meta.firstElementChild as HTMLElement | null
        if (!line || line.hasAttribute('data-dcd-pic-path')) continue
        const text = (line.textContent || '').trim()
        if (!ABS_PATH.test(text) || !meta.closest('[data-chat-call-id]')?.querySelector('[class*="_fileLink"]')) continue
        line.setAttribute('data-dcd-pic-path', '')
        line.setAttribute('role', 'link')
        line.setAttribute('tabindex', '0')
        line.title = text
      }
    }
    function openPicPath(e) {
      const line = e.target && e.target.closest && e.target.closest('[data-dcd-pic-path]')
      if (!line) return
      if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return
      const link = line.closest('[data-chat-call-id]')?.querySelector('[class*="_fileLink"]') as HTMLElement | null
      if (!link) return
      e.preventDefault(); e.stopPropagation()
      link.click()
    }

    let timer = 0
    function schedule() {
      if (timer) return
      timer = setTimeout(() => { timer = 0; try { sync() } catch (e) { console.error('[dsh-tool-groups]', e) } }, 50)
    }

    const sheet = kit.sheet('tool-groups', styleToolGroups({ ROW, OPEN, CALL, NODE, CHEV_MASK }))
    function start() {
      sheet.ensure()
      document.addEventListener('click', onRowClick, true)
      document.addEventListener('click', openPicPath, true)
      document.addEventListener('keydown', openPicPath, true)
      // one shared, frame-coalesced observer; in conversation-flow mode only the running line is kept in
      // sync, otherwise the grouping pass runs only when a tool row / state actually changed
      const un = kit.dom.subscribe((recs) => {
        // a block mounts with its row's body; the later swap to the highlighted copy keeps the same text
        if (kit.dom.touches(recs, '[class*="_codeBody"]')) markLead()
        // a program's calls: one opened or closed, or an output landing in one
        if (kit.dom.touches(recs, '[data-subcalls]')) { markWrap(); markEcho() }
        if (kit.dom.touches(recs, '[class*="_imageMeta"]')) markPicPaths()
        if (flowActive()) {
          // context rows are already dropped by the flow's roleOf; this is the DOM safety net, so only
          // look when a record could be one (a full-document scan on every frame while a reply streams
          // is what this pass used to cost)
          if (kit.dom.touches(recs, '[data-context-injection-body],[data-context-source],[data-chat-flow-kind="context"]')) hideContextRows()
          if (kit.dom.touches(recs, '[data-state],[class*="_title"],[data-chat-call-id],[aria-expanded]')) flowTitles()
          return
        }
        if (!kit.dom.touches(recs, '[data-chat-flow-kind],[data-state],[aria-expanded],[src]')) return
        schedule()
      })
      // a new transcript view (标准 / 思考 / 详尽) wins over groups opened or closed by hand
      let lastView = document.documentElement.getAttribute('data-dcd-view')
      const unAttr = kit.dom.attr(() => {
        const v = document.documentElement.getAttribute('data-dcd-view')
        if (v !== lastView) { lastView = v; manual.clear() }
        schedule()
      })
      // the live timer ticks once a second, only while a group is running
      const tick = setInterval(() => { if (anyLive) schedule() }, 1000)
      // a row's picture is an attribute on an element dsh re-creates whenever it re-renders that row
      // (opening or closing it, a status change): the mutation pass usually catches the new element,
      // but not always — and a card that is closed is exactly where nothing else nudges us. This
      // sweep only re-applies pictures, and markRowThumb returns at once when one is already right.
      const sweep = setInterval(() => {
        if (!flowActive()) return
        for (const row of document.querySelectorAll('.dcd-flow-card [data-chat-call-id]')) markRowThumb(row)
      }, 600)
      schedule()
      markLead()
      markWrap()
      markEcho()
      markPicPaths()
      return () => {
        un(); unAttr(); clearInterval(tick); clearInterval(sweep)
        document.removeEventListener('click', onRowClick, true)
        document.removeEventListener('click', openPicPath, true)
        document.removeEventListener('keydown', openPicPath, true)
        document.querySelectorAll('[data-dcd-pic-path]').forEach((m) => { for (const a of ['role', 'tabindex', 'title']) m.removeAttribute(a) })
        for (const t of pendingClose.values()) clearTimeout(t)
        pendingClose.clear()
        manual.clear(); firstSeen.clear(); autoOpened.clear()
        if (timer) clearTimeout(timer)
        sheet.remove()
        document.querySelectorAll('[data-dcd-group-member]').forEach(clearMember)
        unmark('data-dcd-pic-path', 'data-dcd-group-imgauto', 'data-dcd-group-plan', 'data-dcd-group-done',
          'data-dcd-lead', 'data-dcd-echo', 'data-dcd-wrap', 'data-dcd-group-title')
        document.querySelectorAll('.dcd-group-head').forEach((b) => b.remove())
        document.querySelectorAll('.dcd-group-now').forEach((b) => b.remove())
        // undo what hideContextRows / fixCommandInput did with inline styles and foreign nodes
        document.querySelectorAll('[data-dcd-group-gone]').forEach((b) => {
          b.removeAttribute('data-dcd-group-gone')
          const row = b.closest<HTMLElement>('[class$="_root"]') || b.parentElement
          if (row) row.style.display = ''
        })
        unmark('data-dcd-group-fb-src')
        document.querySelectorAll('[data-dcd-group-fb]').forEach((m) => m.remove())
        closePeek()
        document.querySelectorAll('.dcd-group-rowthumb').forEach((m) => m.remove())
        unmark('data-dcd-group-pic', 'data-dcd-group-pic-src')
        picState.clear()
      }
    }

    return {
      inject: [],
      apply(ctx) {
        ctx.effect(() => start(), 'tool-groups: fold consecutive tool calls')
      },
    }
  },
})
