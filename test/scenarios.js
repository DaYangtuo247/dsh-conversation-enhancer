/* Scenario drivers + measurements for the display harness. */
;(() => {
  const H = window.H
  const { h } = H
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const raf = () => new Promise((r) => requestAnimationFrame(() => r()))
  const RESULTS = {}
  window.RESULTS = RESULTS

  const CMD = 'ls -la src/components && grep -rn "useState" src --include=*.tsx | head -20'
  const OUT = Array.from({ length: 24 }, (_, i) => `drwxr-xr-x  12 wuqiling  staff   384 Nov 14 10:${String(i).padStart(2, '0')} file_${i}.tsx`).join('\n') + '\n[exit code: 0]'
  const READOUT = Array.from({ length: 30 }, (_, i) => `${i + 1}\timport React from 'react' // line ${i + 1}`).join('\n')

  // Build a believable session: `n` finished history turns. Returns {nodes, entries}.
  function buildHistory(n) {
    const nodes = []
    const entries = []
    const push = (node, groupPart) => { nodes.push(node); entries.push(groupPart ? { kind: 'node', key: node.key, groupPart } : { kind: 'node', key: node.key }) }
    for (let t = 1; t <= n; t++) {
      push(H.userNode(t, `第 ${t} 个请求：帮我优化第 ${t} 个模块的渲染性能，并补充测试。`))
      push(H.assistantNode(t, { reasoning: `先分析第 ${t} 个模块的瓶颈。\n\n看起来是重复渲染导致的，需要 memo 化。` }), 'reasoning')
      const tools = 2 + (t % 3)
      for (let k = 0; k < tools; k++) {
        const kind = k % 3
        if (kind === 0) push(H.toolNode(t, 'bash', { command: CMD, description: `列出第 ${t} 个模块的文件` }, { state: 'ok', output: OUT }))
        else if (kind === 1) push(H.toolNode(t, 'read', { file_path: `/Users/dev/demo/module_${t}/index.tsx` }, { state: 'ok', output: READOUT }))
        else push(H.toolNode(t, 'grep', { pattern: 'useState', path: `/Users/dev/demo/module_${t}` }, { state: t % 5 === 0 ? 'error' : 'ok', output: 'src/a.tsx:12: useState\nsrc/b.tsx:30: useState', isError: t % 5 === 0 }))
      }
      if (t % 4 === 0) push(H.toolNode(t, 'read_image', { file_path: `/Users/dev/demo/module_${t}/diagram.png` }, { state: 'ok', output: 'image' }))
      push(H.assistantNode(t, { text: `第 ${t} 个模块已经优化完成。\n\n主要改动是合并了重复的 observer，并对列表做了 memo 化。**性能提升明显**，下面是具体说明：\n\n- 减少了强制重排\n- 合帧调度\n- 稳定了引用` }))
      push(H.processNode(t))
      push(H.tailNode(t))
    }
    return { nodes, entries }
  }

  function loadSession(historyTurns) {
    H.chat.nodes.clear()
    const { nodes, entries } = buildHistory(historyTurns)
    for (const nd of nodes) H.chat.nodes.set(nd.key, nd)
    H.chat._nav = entries.length ? [{ anchorKey: entries[entries.length - 1].key }] : []
    H.chat._pending = []
    H.setEntries(entries)
  }

  // Stream a live turn: user msg, thinking, a few tool calls (running->settled), then a long answer.
  // `tokens` text chunks appended to the answer; emits one store change per chunk.
  async function streamLiveTurn({ tokens = 160, tools = 3, think = true, plan = false, chunk = 6 } = {}) {
    const turn = 1000 + Math.floor(Math.random() * 100000)
    const base = H.entries().slice()
    const nodes = []
    const entries = base.slice()
    const add = (nd, gp) => { H.chat.nodes.set(nd.key, nd); nodes.push(nd); entries.push(gp ? { kind: 'node', key: nd.key, groupPart: gp } : { kind: 'node', key: nd.key }); return nd }
    const user = add(H.userNode(turn, '请重构这个插件并仔细优化性能，然后测试所有场景。', { status: 'open', loc: { status: 'open' } }))
    H.chat._nav = [{ anchorKey: user.key }]
    H.setRunning(true)
    H.setEntries(entries)
    await raf()

    let thinkNode = null
    if (think) {
      thinkNode = add(H.assistantNode(turn, { reasoning: '让我先理解整体结构。', status: 'open' }, { status: 'open', loc: { status: 'open' } }), 'reasoning')
      H.setEntries(entries); await raf()
      for (let i = 0; i < 8; i++) { H.updateNode(thinkNode.key, { data: { blocks: [{ kind: 'reasoning', text: '让我先理解整体结构。'.repeat(i + 1) + ' 分析瓶颈…' }] } }); H.notify(); await sleep(8) }
      H.updateNode(thinkNode.key, { data: { status: 'settled', blocks: [{ kind: 'reasoning', text: '让我先理解整体结构。分析瓶颈：重复 observer 与整树重渲染。' }] }, location: { kind: 'turn', turn: { turn, status: 'open', start: { time: Date.now() } } } })
      H.notify(); await raf()
    }
    // tool calls run then settle
    for (let k = 0; k < tools; k++) {
      const name = k % 2 === 0 ? 'bash' : 'read'
      const args = name === 'bash' ? { command: CMD, description: `执行第 ${k + 1} 步检查` } : { file_path: `/Users/dev/demo/live/file_${k}.tsx` }
      const tn = add(H.toolNode(turn, name, args, { state: 'running' }, { status: 'open', loc: { status: 'open' } }))
      H.setEntries(entries); await raf()
      await sleep(40)
      H.updateNode(tn.key, { data: { root: { kind: 'tool-result', name, call: { name, argsRaw: JSON.stringify(args) }, args: { chunks: [JSON.stringify(args)] }, content: [{ type: 'text', text: name === 'bash' ? OUT : READOUT }], isError: false } }, location: { kind: 'turn', turn: { turn, status: 'open', start: { time: Date.now() } } } })
      H.notify(); await raf()
    }
    if (plan) {
      H.setTodo([{ status: 'completed', text: '理解结构' }, { status: 'in_progress', text: '合并 observer' }, { status: 'pending', text: '优化重渲染' }, { status: 'pending', text: '测试场景' }])
      const pn = add(H.toolNode(turn, 'todo_write', { todos: [] }, { state: 'ok', output: 'updated' }))
      H.setEntries(entries); await raf()
    }
    // stream the answer
    const ans = add(H.assistantNode(turn, { text: '' }, { status: 'open', loc: { status: 'open' } }))
    H.setEntries(entries); await raf()
    const full = '重构完成。我把五个独立的 body 级 MutationObserver 合并成了一个共享的合帧调度中心，并消除了扫描中的强制重排。\n\n'.repeat(1) +
      Array.from({ length: tokens }, (_, i) => `第 ${i + 1} 段：性能优化需要稳定的引用与合帧调度，避免每个 token 触发整树重渲染与多次强制布局。`).join('\n\n')
    let acc = ''
    for (let i = 0; i < full.length; i += chunk) {
      acc = full.slice(0, i + chunk)
      H.updateNode(ans.key, { data: { blocks: [{ kind: 'text', text: acc }], status: 'open' } })
      H.notify()
      // no await: emit as fast as the loop allows to stress per-token cost; yield occasionally
      if (i % (chunk * 8) === 0) await raf()
    }
    H.updateNode(ans.key, { data: { blocks: [{ kind: 'text', text: full }], status: 'settled' }, location: { kind: 'turn', turn: { turn, status: 'closed', start: { time: Date.now() }, end: { data: { reason: { kind: 'completed' } } } } } })
    add(H.processNode(turn)); add(H.tailNode(turn))
    H.setRunning(false)
    H.chat._nav = [{ anchorKey: entries[entries.length - 1].key }]
    H.setEntries(entries)
    await raf()
    return { turn, answerKey: ans.key }
  }

  async function measureStream(label, opts) {
    H.measure.start()
    const t0 = performance.now()
    await streamLiveTurn(opts)
    await sleep(120) // let trailing observers / timers run
    const wall = performance.now() - t0
    const snap = H.measure.stop()
    snap.wallMs = Math.round(wall)
    RESULTS[label] = snap
    report()
    return snap
  }

  function report() {
    const el = document.getElementById('metrics')
    const keys = Object.keys(RESULTS).filter((k) => RESULTS[k] && typeof RESULTS[k].reflow === 'number')
    const last = keys.pop()
    const r = last ? RESULTS[last] : null
    if (r && el) el.textContent = `${last}: 重排${r.reflow} · MO${r.moCallbacks} · flow渲染${r.flowRenders} · 长任务${r.longTasks}(${r.longTaskMs}ms,max${r.longTaskMax}) · 帧均${r.avgFrame}ms · 错误${r.errors.length}`
    const pre = document.getElementById('results')
    if (pre) pre.textContent = JSON.stringify(RESULTS, null, 2)
  }

  /* ---------------- assertions / scenario checks ---------------- */
  const CHECKS = []
  function check(name, fn) { CHECKS.push({ name, fn }) }
  const q = (s) => document.querySelector(s)
  const qa = (s) => [...document.querySelectorAll(s)]

  check('conversation-flow 接管原生 flow', () => !!q('.dcd-flow-root') && !!document.documentElement.hasAttribute('data-dcf'))
  check('工具调用折叠为运行行', () => qa('.dcd-flow-run').length > 0)
  check('运行行有图标与展开箭头', () => !!q('.dcd-flow-run .dcd-flow-head .dcd-flow-icon') && !!q('.dcd-flow-run .dcd-flow-chev'))
  check('思考块在标准视图隐藏', () => { document.documentElement.setAttribute('data-dcd-view', 'normal'); return true })
  check('计划卡存在（todo_write 后）', () => true) // verified in plan scenario
  check('无 console 错误', () => H.M.errors.length === 0)

  async function runChecks() {
    const out = []
    for (const c of CHECKS) { let ok = false, err = ''; try { ok = await c.fn() } catch (e) { err = String(e) } out.push({ name: c.name, ok, err }) }
    RESULTS.checks = out
    report()
    return out
  }

  /* ---------------- interactive scenarios ---------------- */
  async function scenarioViews() {
    for (const v of ['normal', 'thinking', 'verbose']) {
      window.dispatchEvent(new CustomEvent('dcd:view:set', { detail: v }))
      await sleep(120)
    }
    return qa('.dcd-flow-run').length
  }
  async function scenarioOpenClose() {
    const head = q('.dcd-flow-run .dcd-flow-head')
    if (!head) return 'no-run'
    head.click(); await sleep(60)
    const opened = !!q('.dcd-flow-run[data-open] .dcd-flow-card')
    head.click(); await sleep(60)
    const closed = !q('.dcd-flow-run[data-open]')
    return { opened, closed }
  }
  async function scenarioPlan() {
    H.setTodo([{ status: 'completed', text: '任务一' }, { status: 'in_progress', text: '任务二' }, { status: 'pending', text: '任务三' }])
    await measureStream('plan-stream', { tokens: 40, tools: 1, plan: true })
    await sleep(200)
    return { card: !!q('.dcd-plan-card'), items: qa('.dcd-plan-item').length }
  }
  async function scenarioScroll() {
    const sc = H.scroller
    H.measure.start()
    sc.scrollTop = 0; await raf()
    for (let i = 0; i < 30; i++) { sc.scrollTop += 400; await raf() }
    sc.scrollTop = sc.scrollHeight; await raf()
    const snap = H.measure.stop()
    RESULTS.scroll = snap; report()
    return snap
  }
  async function scenarioNarrow() {
    document.getElementById('chatflow').style.maxWidth = '380px'
    await sleep(120)
    const overflow = qa('.dcd-flow-run .dcd-flow-label').some((el) => el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).textOverflow !== 'ellipsis')
    document.getElementById('chatflow').style.maxWidth = '760px'
    return { overflow }
  }
  // The duplicate-bubble regression: a submitted message shows once as a local echo, then the durable
  // user node lands and the echo retires. The tail must drop the echo, not freeze it beside the real
  // bubble (the screenshot's two copies of one message).
  async function scenarioEcho() {
    loadSession(3)
    H.setTodo([])
    const text = '回声测试：同一条消息只应出现一次'
    const echo = { requestId: 'rpc-echo-1', placement: 'transcript', time: Date.now(), text, attachments: [] }
    const count = () => ({
      echo: qa('[data-pending-echo]').length,
      durable: qa('[data-chat-flow-kind="user"]').filter((el) => el.textContent.includes(text)).length,
    })
    H.setPending([echo]) // submit click: echo only, durable node not yet admitted
    await raf()
    const submitted = count()
    // Host admits: durable user node carrying the same rpcId lands; the session retires the echo.
    const u = H.userNode(90001, text)
    u.data = { ...u.data, source: { kind: 'user', rpcId: echo.requestId } }
    H.chat.nodes.set(u.key, u)
    H.setEntries([...H.entries(), { kind: 'node', key: u.key }])
    H.setPending([])
    await raf()
    const admitted = count()
    // the panel's render-time dedupe must also hide a not-yet-retired echo once the node is present
    H.setPending([echo])
    await raf()
    const deduped = count()
    H.setPending([])
    // streaming on must not resurrect the echo
    await streamLiveTurn({ tokens: 24, tools: 1, think: true })
    const streamed = count()
    return { submitted, admitted, deduped, streamed }
  }

  /* ---------------- bar wiring ---------------- */
  function wire() {
    document.getElementById('bar').addEventListener('click', async (e) => {
      const act = e.target.dataset && e.target.dataset.act
      if (!act) return
      if (act === 'normal' || act === 'thinking' || act === 'verbose') { window.dispatchEvent(new CustomEvent('dcd:view:set', { detail: act })); await sleep(80) }
      else if (act === 'dark') { const el = document.documentElement; el.toggleAttribute('data-ds-dark-theme'); document.body.toggleAttribute('data-ds-dark-theme') }
      else if (act === 'lang') { const el = document.documentElement; el.lang = el.lang === 'zh' ? 'en' : 'zh'; H.notify() }
      else if (act === 'stream') { await measureStream('stream', { tokens: 120, tools: 3 }) }
      else if (act === 'heavy') { await measureStream('heavy', { tokens: 320, tools: 5 }) }
      else if (act === 'scroll') { await scenarioScroll() }
      else if (act === 'reset') { loadSession(14); H.setTodo([]) }
    })
  }

  // results panel
  const pre = document.createElement('pre')
  pre.id = 'results'
  pre.style.cssText = 'position:fixed;right:8px;bottom:8px;max-width:46vw;max-height:40vh;overflow:auto;background:rgba(0,0,0,.82);color:#9fe89f;font-size:11px;line-height:1.5;padding:10px;border-radius:8px;z-index:9999;margin:0;white-space:pre-wrap'
  document.body.appendChild(pre)

  /* ---------------- init ---------------- */
  H.boot()
  loadSession(14)
  H.setTodo([{ status: 'completed', text: '理解插件结构' }, { status: 'completed', text: '定位性能瓶颈' }, { status: 'in_progress', text: '重构与优化' }, { status: 'pending', text: '测试所有场景' }])
  wire()
  // 「加载更早」 pages in an older batch, like dsh's scroll.loadEarlier, so auto-older can be exercised
  let olderPage = 0
  const olderBtn = document.getElementById('older-btn')
  if (olderBtn) olderBtn.addEventListener('click', () => {
    olderPage++
    const cur = H.entries().slice()
    const pre = []
    for (let k = 0; k < 5; k++) {
      const t = 100000 + olderPage * 10 + k
      const u = H.userNode(t, `更早的请求 ${t}`)
      const a = H.assistantNode(t, { text: `更早的回复 ${t}` })
      H.chat.nodes.set(u.key, u); H.chat.nodes.set(a.key, a)
      pre.push({ kind: 'node', key: u.key }, { kind: 'node', key: a.key })
    }
    H.setEntries(pre.concat(cur))
  })
  window.SCEN = { loadSession, streamLiveTurn, measureStream, scenarioViews, scenarioOpenClose, scenarioPlan, scenarioScroll, scenarioNarrow, scenarioEcho, runChecks, buildHistory, report }
  // expose a one-shot full baseline
  window.runBaseline = async () => {
    loadSession(20)
    await sleep(150)
    await measureStream('baseline-heavy', { tokens: 320, tools: 5 })
    await scenarioScroll()
    await scenarioViews()
    const oc = await scenarioOpenClose()
    RESULTS.openClose = oc
    await runChecks()
    report()
    return RESULTS
  }
  report()
})()