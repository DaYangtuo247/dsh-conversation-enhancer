/*!
 * dsh-bash-highlight — browser half.
 *
 * Syntax colours for shell commands in the transcript (the 「$ …」 line of every command
 * row, `[data-command-text]`): command names, flags, strings, variables, operators,
 * numbers and comments. Painted with the CSS Custom Highlight API over dsh's own text, so
 * no DOM is changed and copying still gives the plain command. Colours come from the
 * code theme's shiki tokens (--shiki-token-*), so they follow 外观 › 代码主题 in light and
 * dark. A small hand-written lexer: good for one-liners, not a full shell parser.
 *
 * Command output (the band under the command, and other tools' plain-text results) gets a
 * lighter pass: error / warning / success words, numbers, quoted strings, paths, `#` comments,
 * `ls -l` permission columns, and diff +/- lines. Very long outputs are only coloured in
 * their first 20 000 characters.
 */
part({
  id: 'dsh-bash-highlight',
  factory(require, kit) {
    const KINDS = ['cmd', 'kw', 'flag', 'str', 'var', 'op', 'num', 'cmt']
    const OUT_KINDS = ['err', 'warn', 'ok', 'num', 'str', 'path', 'cmt', 'add', 'del']
    // the second half also has to match conversation-flow's cards: `data-dcd-group-member` is written only by the
    // native grouping pass, which the flow mode never runs
    const OUTPUT = '[class*="_terminal"] [class*="_output_"], [data-dcd-group-member] [class*="_root"] > pre[class*="_output"], .dcd-flow-card [class*="_root"] > pre[class*="_output"]'
    const OUT_CAP = 20000
    const ERR = /\b(error|errors|failed|failure|fatal|exception|traceback|panic|denied|refused|not found|no such file or directory|cannot|can't|unable)\b|错误|失败/gi
    const WARN = /\b(warn|warning|warnings|deprecated)\b|警告/gi
    const OK = /\b(ok|done|success|successful|succeeded|passed|pass|stopped|started|ready|created|✓|✔)\b|成功|完成/gi

    /** [start, end, kind][] for a block of output text. */
    function lexOut(s) {
      const out = []
      s = s.slice(0, OUT_CAP)
      let lineStart = 0
      for (const line of s.split('\n')) {
        const L = lineStart
        lineStart += line.length + 1
        if (!line.trim()) continue
        if (/^\s*#/.test(line)) { out.push([L, L + line.length, 'cmt']); continue }
        if (/^\+(?!\+\+ )/.test(line)) { out.push([L, L + line.length, 'add']); continue }
        if (/^-(?!-- )/.test(line) && !/^-[rwx-]{9}/.test(line)) { out.push([L, L + line.length, 'del']); continue }
        const marks = []
        const add = (re, kind, group = 0) => { re.lastIndex = 0; for (let m; (m = re.exec(line));) { if (!m[0]) { re.lastIndex++; continue } const a = m.index + (group ? m[0].indexOf(m[group]) : 0); marks.push([L + a, L + a + (group ? m[group] : m[0]).length, kind]) } }
        add(/^[dlcbps-][rwxsStT-]{9}[@+.]?/g, 'cmt')
        add(/"[^"\n]*"|'[^'\n]*'/g, 'str')
        add(/(?:^|[\s(=:])((?:~|\.{1,2})?\/[\w.@%+~\/-]+)/g, 'path', 1)
        add(ERR, 'err'); add(WARN, 'warn'); add(OK, 'ok')
        add(/(?<![\w.\/-])-?\d+(?:[.:]\d+)*(?:[KMGT]i?B?|%|ms|s)?(?![\w\/])/g, 'num')
        // earlier kinds win where they overlap (a number inside a path stays a path)
        marks.sort((x, y) => x[0] - y[0] || (y[1] - y[0]) - (x[1] - x[0]))
        let end = -1
        for (const m of marks) if (m[0] >= end) { out.push(m); end = m[1] }
      }
      return out
    }
    // Rules are scoped to the elements that carry highlights (inner spans inherit them): a bare
    // ::highlight() makes the browser work out highlight styles for every element on the page on
    // every style pass, which on a long conversation cost ~80 ms per DOM change. (styles/06)
    const sheet = kit.sheet('bash-highlight', CSS_BASH_HIGHLIGHT)

    // words that keep the next word in "command" position
    const PREFIX = new Set(['sudo', 'env', 'time', 'nohup', 'exec', 'command', 'builtin', 'xargs', 'nice', 'timeout'])
    const KEYWORDS = new Set(['if', 'then', 'else', 'elif', 'fi', 'for', 'while', 'until', 'do', 'done', 'case', 'esac', 'in', 'function', 'export', 'local', 'return', 'set', 'unset', 'source', '.', 'cd', 'echo', 'exit', 'true', 'false'])
    const CMD_AFTER = new Set(['|', '||', '&&', ';', '&', '(', '$(', '`', 'then', 'else', 'do', '{'])

    /** [start, end, kind][] for one command string. */
    function lex(s) {
      const out = []
      let i = 0
      let expectCmd = true
      const n = s.length
      while (i < n) {
        const c = s[i]
        if (c === ' ' || c === '\t' || c === '\n') { if (c === '\n') expectCmd = true; i++; continue }
        if (c === '#' && (i === 0 || /\s/.test(s[i - 1]))) { const e = s.indexOf('\n', i); const end = e < 0 ? n : e; out.push([i, end, 'cmt']); i = end; continue }
        if (c === "'" || c === '"') {
          let j = i + 1
          while (j < n && s[j] !== c) { if (c === '"' && s[j] === '\\') j++; j++ }
          j = Math.min(n, j + 1)
          out.push([i, j, 'str']); i = j; expectCmd = false; continue
        }
        if (c === '$') {
          let j = i + 1
          if (s[j] === '(') { out.push([i, i + 2, 'op']); i += 2; expectCmd = true; continue }
          if (s[j] === '{') { const e = s.indexOf('}', j); j = e < 0 ? n : e + 1 } else { while (j < n && /[\w?#@*!$-]/.test(s[j]) && (j === i + 1 || /\w/.test(s[j]))) j++ }
          out.push([i, j, 'var']); i = j; expectCmd = false; continue
        }
        const op = /^(\d?>>?&?\d?|<<?|\|\||\||&&|;;?|&|\(|\)|\{|\}|`)/.exec(s.slice(i, i + 4))
        if (op && !(op[0][0] >= '0' && op[0][0] <= '9' && !/[<>]/.test(op[0]))) {
          out.push([i, i + op[0].length, 'op']); i += op[0].length
          expectCmd = CMD_AFTER.has(op[0]); continue
        }
        // a word
        let j = i
        while (j < n && !/[\s'"|&;()<>`$]/.test(s[j])) j++
        if (j === i) { i++; continue }
        const w = s.slice(i, j)
        if (expectCmd && /^[A-Za-z_]\w*=/.test(w)) {
          const eq = w.indexOf('=')
          out.push([i, i + eq, 'var'])
          // the value: plain text up to the next space or operator, quoted parts still strings;
          // the word after the assignment is still in command position
          i += eq + 1
          while (i < n && !/[\s|&;()<>`]/.test(s[i])) {
            if (s[i] === "'" || s[i] === '"') {
              const q = s[i]; let k = i + 1
              while (k < n && s[k] !== q) k++
              out.push([i, Math.min(n, k + 1), 'str']); i = k + 1
            } else i++
          }
          continue
        }
        if (expectCmd) {
          out.push([i, j, KEYWORDS.has(w) ? 'kw' : 'cmd'])
          expectCmd = PREFIX.has(w) || CMD_AFTER.has(w) || w === 'export'
        } else if (/^--?[\w-]/.test(w)) out.push([i, j, 'flag'])
        else if (/^\d+(\.\d+)?$/.test(w)) out.push([i, j, 'num'])
        else if (KEYWORDS.has(w) && CMD_AFTER.has(w)) { out.push([i, j, 'kw']); expectCmd = true }
        i = j
      }
      return out
    }

    /** Map string offsets onto the element's text nodes. */
    function ranges(el, spans) {
      const nodes = []
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
      let off = 0
      for (let t = walker.nextNode() as Text | null; t; t = walker.nextNode() as Text | null) { nodes.push([t, off]); off += t.data.length }
      const at = (pos) => {
        for (let k = nodes.length - 1; k >= 0; k--) if (pos >= nodes[k][1]) return [nodes[k][0], Math.min(pos - nodes[k][1], nodes[k][0].data.length)]
        return null
      }
      const res = []
      for (const [a, b, kind] of spans) {
        const s = at(a), e = at(b)
        if (!s || !e) continue
        // StaticRange: a live Range is updated by the browser on every DOM change anywhere in the
        // page, and there are thousands of these. The cache below re-lexes when the text changes.
        let r
        try {
          if (typeof StaticRange === 'function') r = new StaticRange({ startContainer: s[0], startOffset: s[1], endContainer: e[0], endOffset: e[1] })
          else { r = new Range(); r.setStart(s[0], s[1]); r.setEnd(e[0], e[1]) }
        } catch { continue }
        res.push([kind, r])
      }
      return res
    }

    function start() {
      if (!(window.CSS && CSS.highlights && window.Highlight)) return () => {}
      sheet.ensure()
      const cache = new WeakMap() // element → text it was lexed for
      let timer = 0
      let last = [] // the cache entries painted last time, in order
      const marked = new Set<HTMLElement>()
      function paint() {
        timer = 0
        const used = []
        const groups = Object.fromEntries(KINDS.map((k) => [k, []]))
        for (const el of document.querySelectorAll('[data-command-text]')) {
          const text = el.textContent || ''
          let hit = cache.get(el)
          if (!hit || hit.text !== text || !hit.ranges.every(([, r]) => el.contains(r.startContainer))) {
            hit = { text, ranges: ranges(el, lex(text)) }
            cache.set(el, hit)
          }
          used.push(hit)
          for (const [kind, r] of hit.ranges) groups[kind].push(r)
        }
        const outs = Object.fromEntries(OUT_KINDS.map((k) => [k, []]))
        // dsh renders terminal output one element per line; lex each line on its own
        const units = []
        for (const box of qa(OUTPUT)) {
          // the scope for the dbo-* rules goes on the box, not each line: lines inherit it, and every
          // element the rules match costs a highlight style on each style pass
          if (!box.hasAttribute('data-dbh-out')) { box.setAttribute('data-dbh-out', ''); marked.add(box) }
          const lines = qa('[class*="_line_"]', box)
          if (lines.length) { let budget = OUT_CAP; for (const l of lines) { if ((budget -= l.textContent.length) < 0) break; units.push(l) } }
          else units.push(box)
        }
        for (const el of units) {
          const text = el.textContent || ''
          let hit = cache.get(el)
          if (!hit || hit.text !== text || !hit.ranges.every(([, r]) => el.contains(r.startContainer))) {
            hit = { text, ranges: ranges(el, lexOut(text)) }
            cache.set(el, hit)
          }
          used.push(hit)
          for (const [kind, r] of hit.ranges) outs[kind].push(r)
        }
        for (const el of marked) if (!el.isConnected) marked.delete(el)
        // nothing new or changed (the usual case while a reply streams elsewhere): keep the highlights,
        // re-setting them makes the browser repaint every one
        if (used.length === last.length && used.every((h, i) => h === last[i])) return
        last = used
        // add() in a loop, not a spread: one range per token across the whole document easily reaches
        // tens of thousands, and a spread that large throws RangeError and kills the paint
        const setHL = (name: string, ranges: StaticRange[]) => { const hl = new Highlight(); for (const r of ranges) hl.add(r); CSS.highlights.set(name, hl) }
        for (const k of KINDS) setHL('dbh-' + k, groups[k])
        for (const k of OUT_KINDS) setHL('dbo-' + k, outs[k])
      }
      const schedule = () => { if (!timer) timer = setTimeout(paint, 80) }
      // shared watcher; only command / output text can change the highlights, so a reply streaming
      // elsewhere never wakes the lexer. data-dbh-out (set by paint) is outside the hub's attribute
      // filter, so marking a box does not re-trigger this pass.
      const un = kit.dom.subscribe((recs) => {
        if (!kit.dom.touches(recs, '[data-command-text],[class*="_output_"],[class*="_line_"],[data-dbh-out]')) return
        schedule()
      })
      paint()
      return () => {
        un()
        if (timer) clearTimeout(timer)
        for (const k of KINDS) CSS.highlights.delete('dbh-' + k)
        for (const k of OUT_KINDS) CSS.highlights.delete('dbo-' + k)
        for (const el of marked) el.removeAttribute('data-dbh-out')
        marked.clear(); last = []
        sheet.remove()
      }
    }

    return {
      inject: [],
      apply(ctx) {
        ctx.effect(() => start(), 'bash-highlight: shell command colours')
      },
    }
  },
})
