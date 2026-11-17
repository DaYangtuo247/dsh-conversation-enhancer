/*!
 * dsh-plan-checklist — browser half.
 *
 * dsh already keeps a plan: the agent's todo_write tool feeds the 「任务 /
 * To-dos」 dock above the composer (dsh-client-ui-conversation TodoPanel).
 * The quiet style shows its task list inside the conversation instead, right under the
 * newest reply, as a plain bordered card. This plugin does the same:
 *
 * - The native dock is kept open but moved off screen; its list is the data
 *   source (status + text per task), so nothing is re-derived here.
 * - While the newest turn runs, the card sits just above the current activity
 *   (live tool group, thinking, the reply being written), so "what now" reads
 *   under the plan. When the turn ends with every task done, it folds into one
 *   line 「✓ 已完成全部 N 项任务 ›」 (click to reopen); with tasks left, it stays.
 *     completed   → filled check circle, muted text
 *     in_progress → spinning ring, primary text
 *     pending     → dashed circle, primary text
 *
 * Session data is untouched.
 */
part({
  id: 'dsh-plan-checklist',
  factory(require, kit) {
    const P = '[data-testid="todo-panel"]'
    /** Read the plan from the native dock: [{status, text}], in model order. */
    function readPlan() {
      const panel = document.querySelector(P)
      if (!panel) return []
      const btn = q<HTMLElement>('button[aria-expanded]', panel)
      // the list is only rendered while the dock is open; click once per panel element, not on every
      // pass — a rejected click must not become a 50 ms click loop that fights the user's own toggle
      if (btn && btn.getAttribute('aria-expanded') !== 'true' && !clickedPanels.has(btn)) { clickedPanels.add(btn); btn.click() }
      return qa('li[data-status]', panel).map((li) => {
        const c = li.querySelector('[class$="_content"],[class*="_content "]')
        return { status: li.dataset.status, text: (c || li).textContent.trim() }
      })
    }

    const items = (turn): HTMLElement[] => qa(`[data-chat-flow-kind][data-chat-turn="${CSS.escape(String(turn))}"]`)
    // attribute-based visibility (no forced layout): mirrors the CSS that hides grouped / folded /
    // reasoning rows, so anchoring the card never reads geometry mid-stream
    const visible = (el) => {
      if (el.querySelector('.dcd-plan-card')) return true
      if (el.hasAttribute('hidden') || el.hasAttribute('data-turn-process-hidden')) return false
      if (el.closest('[data-turn-process-hidden],[hidden]')) return false
      if (el.hasAttribute('data-dcd-group-done') || el.hasAttribute('data-dcd-group-plan')) return false
      if (el.hasAttribute('data-dcd-group-hide') && el.hasAttribute('data-dcd-group-member') && !el.hasAttribute('data-dcd-group-head')) return false
      if (el.dataset.chatGroupPart === 'reasoning' && document.documentElement.getAttribute('data-dcd-view') === 'normal') return false
      return true
    }
    /**
     * Where the card goes: always after the turn's last item, running or not — the plan is the last
     * thing in the turn, right above dsh's own running row while the turn runs and above the action
     * bar once it is over. It used to stand *above* the current activity, which cut the live line
     * away from the group whose work it describes and then moved the card again when the turn ended.
     * Returns [node, 'before' | 'after', turnDone].
     */
    function anchor(): [HTMLElement, 'before' | 'after', boolean] | null {
      // conversation-flow folds the live tool group into a .dcd-flow-run line (not a data-chat-flow-kind row),
      // so anchor inside the newest .dcd-flow-turn: above its current activity while live, after the last
      // reply once done. Without this the card has no anchor during the tool-running phase.
      if (document.documentElement.hasAttribute('data-dcf')) {
        // scope to the main conversation: the right sidebar mounts a second flow instance, and a
        // document-wide `.dcd-flow-turn` would anchor the card into that transcript instead
        const turns = qa('.dcd-flow-turn', document.querySelector('[data-slot="main.conversation"]') || document)
        if (!turns.length) return null
        const sec = turns[turns.length - 1]
        const done = !sec.hasAttribute('data-live')
        const kids = (Array.from(sec.children) as HTMLElement[]).filter((el) => el !== card && !el.classList.contains('dcd-plan-card')
          && !el.classList.contains('dcd-flow-end') && el.getAttribute('data-chat-flow-kind') !== 'turn-tail')
        const act = kids.filter((el) => el.getAttribute('data-chat-flow-kind') !== 'user')
        if (act.length) return [act[act.length - 1], 'after', done]
        const u = kids.find((el) => el.getAttribute('data-chat-flow-kind') === 'user')
        return u ? [u, 'after', false] : null
      }
      const all = qa('[data-chat-flow-kind]')
      if (!all.length) return null
      const turn = all[all.length - 1].dataset.chatTurn
      const list = items(turn).filter((it) => it.dataset.chatFlowKind !== 'user')
      const done = list.some((it) => it.dataset.chatFlowKind === 'turn-tail')
      const body = list.filter((it) => it.dataset.chatFlowKind !== 'turn-tail' && visible(it) && !it.contains(card))
      if (!body.length) return null
      let last = body[body.length - 1]
      if (done) return [last, 'after', true]
      // a tool group (dsh-tool-groups) is one block: stand before its first row
      if (last.hasAttribute('data-dcd-group-member') && !last.hasAttribute('data-dcd-group-first')) {
        let i = list.indexOf(last)
        while (i > 0 && !list[i].hasAttribute('data-dcd-group-first')) i--
        last = list[i]
      }
      return [last, 'before', false]
    }

    let card = null
    let lastJson = ''
    let userOpen = false
    /** Panels whose dock toggle we already clicked, so a refused click cannot become a click loop. */
    const clickedPanels = new WeakSet<HTMLElement>()
    /** The one-shot `data-pop` timers, kept so teardown can cancel them. */
    const pops = new Set<ReturnType<typeof setTimeout>>()
    const V = kit.vocab
    const zh = V.zh
    const setFlag = V.setFlag
    const CHEV = V.CHEV_SVG
    function render(plan) {
      if (!card) {
        card = document.createElement('section')
        // `dpc-card` / `dpc-list` are the names dsh-claude-theme's glass rules still use
        card.className = 'dcd-plan-card dpc-card'
        card.setAttribute('aria-label', zh() ? '任务计划' : 'Plan')
        card.innerHTML = '<button type="button" class="dcd-plan-sum"><span class="dcd-plan-glyph" aria-hidden="true"></span><span class="dcd-plan-sum-text"></span>' + CHEV + '</button><ul class="dcd-plan-list dpc-list"></ul>'
        card.firstChild.addEventListener('click', (e) => { e.preventDefault(); userOpen = !userOpen; schedule() })
      }
      const json = JSON.stringify(plan)
      if (json === lastJson) return
      lastJson = json
      userOpen = false
      const n = plan.length
      card.querySelector('.dcd-plan-sum-text').textContent = zh() ? `已完成全部 ${n} 项任务` : `All ${n} tasks done`
      const ul = card.querySelector('.dcd-plan-list')
      // diff per item, keyed by its text: a todo_write update reuses the <li> whose task still
      // stands, so the card never rebuilds (which would replay the entrance) and a freshly
      // completed task pops its check in place
      const pool = new Map()
      for (const li of [...ul.children]) {
        const k = li.dataset.text || ''
        if (!pool.has(k)) pool.set(k, [])
        pool.get(k).push(li)
      }
      const take = (k) => {
        const l = pool.get(k)
        if (!l || !l.length) return null
        return l.shift()
      }
      for (const t of plan) {
        let li = take(t.text)
        if (!li) {
          li = document.createElement('li')
          li.className = 'dcd-plan-item'
          li.dataset.text = t.text
          li.innerHTML = '<span class="dcd-plan-glyph" aria-hidden="true"></span><span class="dcd-plan-text"></span>'
          li.lastChild.textContent = t.text
        }
        if (li.dataset.status !== t.status) {
          const was = li.dataset.status
          li.dataset.status = t.status
          // the pop marker is one-shot: dropped once the animation has had its moment
          if (t.status === 'completed' && was) {
            setFlag(li, 'data-pop', true)
            const id = setTimeout(() => { pops.delete(id); setFlag(li, 'data-pop', false) }, 260)
            pops.add(id)
          }
        }
        ul.appendChild(li)
      }
      for (const l of pool.values()) for (const li of l) li.remove()
    }

    function sync() {
      const plan = readPlan()
      const at = plan.length ? anchor() : null
      if (!at) { if (card) card.remove(); return }
      render(plan)
      const [node, where, turnDone] = at
      const allDone = plan.every((t) => t.status === 'completed')
      setFlag(card, 'data-done', turnDone && allDone)
      setFlag(card, 'data-folded', turnDone && allDone && !userOpen)
      if (where === 'before') { if (node.previousElementSibling !== card) node.before(card) }
      else if (node.nextElementSibling !== card) node.after(card)
    }

    let timer = 0
    const schedule = () => { if (!timer) timer = setTimeout(() => { timer = 0; try { sync() } catch (e) { console.error('[dsh-plan-checklist]', e) } }, 50) }

    const sheet = kit.sheet('plan-checklist', stylePlanChecklist({ P }))
    function start() {
      sheet.ensure()
      // shared watcher; only the native dock or new flow rows can move the card. Our own .dcd-plan-item
      // edits match none of these selectors, so rendering the card never re-triggers this pass.
      const un = kit.dom.subscribe((recs) => {
        if (!kit.dom.touches(recs, '[data-testid="todo-panel"],[data-chat-flow-kind],[data-testid="todo-panel"] [data-status],.dcd-flow-turn,.dcd-flow-run,.dcd-flow-thought,.dcd-flow-steps')) return
        schedule()
      })
      schedule()
      return () => {
        un(); if (timer) clearTimeout(timer)
        for (const id of pops) clearTimeout(id)
        pops.clear()
        sheet.remove()
        if (card) card.remove(); card = null; lastJson = ''
      }
    }

    return {
      inject: [],
      apply(ctx) {
        ctx.effect(() => start(), 'plan-checklist: quiet plan card in the transcript')
      },
    }
  },
})
