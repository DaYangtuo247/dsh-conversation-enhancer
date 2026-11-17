/*!
 * display-shared — the words and styles every display part reads.
 *
 * tool-groups (03) and conversation-flow (08) both classify tool calls into kinds and word their
 * 「命令 ×3」-style summary lines; their tables, word lists and label builders used to live in
 * both files, drifting slightly apart. They live here once, so the native mode and the
 * conversation-flow mode speak exactly the same words.
 *
 * This part also owns:
 * - the words above, published as kit.vocab for every other part;
 * - the shared stylesheet (styles/00-shared.scss): the head-button base block the quiet summary
 *   lines share, the bundle's motion keyframes (dcd-in / dcd-out / dcd-pop / dcd-turn-in) and the
 *   动效 switch (the bundle's plugin page): one attribute, html[data-dcd-anim="off"], turns the
 *   decorative transitions off everywhere at once; prefers-reduced-motion does the same without
 *   asking. The liveness markers (the running dots, the spinner, the shimmer) keep going either way.
 */
part({
  id: 'display-shared',
  factory(require, kit) {
    /* ---------- locale ---------- */
    const zh = () => /^zh/i.test(document.documentElement.lang || navigator.language || 'zh')

    /* ---------- tool vocabulary (03 classifies from the DOM, 08 from the node data) ---------- */
    const TOOL_KIND = {
      bash: 'command', pwsh: 'command', bash_persistent: 'command', terminal: 'command', pwsh_persistent: 'command',
      read: 'read', read_image: 'read', view_image: 'read', read_file: 'read',
      grep: 'search', glob: 'search', search: 'search', lsp: 'search', find_definition: 'search', find_references: 'search', find_implementation: 'search',
      write: 'edit', edit: 'edit', str_replace: 'edit', str_replace_editor: 'edit', apply_patch: 'edit', multi_edit: 'edit',
      web_search: 'web', web_fetch: 'web', fetch: 'web',
      todo_write: 'plan', run_code: 'code',
      subagent: 'agent', send_message: 'agent', interrupt_agent: 'agent', list_agents: 'agent',
    }
    const ORDER = ['agent', 'command', 'read', 'search', 'edit', 'web', 'code', 'plan', 'other']
    // Concise, countable labels in the 「名词 ×N」 style (「命令 ×2」), short enough to read at a
    // glance on a narrow column. A single call keeps the bare noun (the run line then shows the
    // call's own description instead). `failed` is bare (「失败 ×2」); callers add their separator.
    const WORDS = {
      zh: {
        command: (n) => n > 1 ? `命令 ×${n}` : '命令', read: (n) => n > 1 ? `读取 ×${n}` : '读取', search: (n) => n > 1 ? `搜索 ×${n}` : '搜索',
        edit: (n) => n > 1 ? `编辑 ×${n}` : '编辑', web: (n) => n > 1 ? `网页 ×${n}` : '网页', code: (n) => n > 1 ? `代码 ×${n}` : '代码',
        agent: (n) => n > 1 ? `智能体 ×${n}` : '智能体', plan: () => '计划', other: (n) => n > 1 ? `工具 ×${n}` : '工具', join: ' · ',
        failed: (n) => `失败 ×${n}`, thinking: '思考中…', working: '处理中…',
        thought: '思考', thoughtFor: (t) => `思考 ${t}`, thinks: (n) => `思考 ×${n}`,
        stopped: '已停止', turnFailed: '处理失败', show: '展开工具调用', hide: '收起工具调用',
        writing: '输出中…', failedOne: '失败',
        openTab: '在新标签页打开', close: '关闭', prev: '上一张', next: '下一张',
      },
      en: {
        command: (n) => n > 1 ? `commands ×${n}` : 'command', read: (n) => n > 1 ? `reads ×${n}` : 'read',
        search: (n) => n > 1 ? `searches ×${n}` : 'search', edit: (n) => n > 1 ? `edits ×${n}` : 'edit',
        web: (n) => n > 1 ? `web ×${n}` : 'web', code: (n) => n > 1 ? `code ×${n}` : 'code',
        agent: (n) => n > 1 ? `agents ×${n}` : 'agent', plan: () => 'plan', other: (n) => n > 1 ? `tools ×${n}` : 'tool', join: ' · ',
        failed: (n) => `failed ×${n}`, thinking: 'Thinking…', working: 'Working…',
        thought: 'Thought', thoughtFor: (t) => `Thought ${t}`, thinks: (n) => n > 1 ? `thoughts ×${n}` : 'thought',
        stopped: 'Stopped', turnFailed: 'Failed', show: 'Show tool calls', hide: 'Hide tool calls',
        writing: 'Writing…', failedOne: 'failed',
        openTab: 'Open in new tab', close: 'Close', prev: 'Previous', next: 'Next',
      },
    }
    const words = () => (zh() ? WORDS.zh : WORDS.en)
    /** 「命令 ×3 · 读取 ×2」 from a {kind: count} map, in ORDER order (capitalised in English). */
    const labelOf = (counts) => {
      let s = ORDER.filter((k) => counts[k]).map((k) => words()[k](counts[k])).join(words().join)
      if (!zh()) s = s.charAt(0).toUpperCase() + s.slice(1)
      return s
    }
    /** 「13 秒」 / 「1 分 11 秒」 — the unit the rest of the transcript uses. */
    const durSec = (s) => {
      s = Math.max(0, Math.floor(s))
      if (zh()) return s < 60 ? `${s} 秒` : `${Math.floor(s / 60)} 分 ${s % 60} 秒`
      return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`
    }

    /* ---------- the chevron every fold line shares ---------- */
    const CHEV_D = 'M4.5 2.5 8 6l-3.5 3.5'
    const CHEV_SVG = `<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="${CHEV_D}" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`
    const CHEV_MASK = `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'><path d='${CHEV_D}' fill='none' stroke='black' stroke-width='1.4' stroke-linecap='round' stroke-linejoin='round'/></svg>`)}")`

    /* ---------- attribute helpers (diffed, so repeated passes stay cheap) ---------- */
    /** String attribute: null / false removes, anything else sets. */
    const setAttr = (el, k, v) => {
      if (v === null || v === false) { if (el.hasAttribute(k)) el.removeAttribute(k) }
      else if (el.getAttribute(k) !== String(v)) el.setAttribute(k, String(v))
    }
    /** Boolean marker attribute. */
    const setFlag = (el, k, on) => { if (on) { if (!el.hasAttribute(k)) el.setAttribute(k, '') } else if (el.hasAttribute(k)) el.removeAttribute(k) }

    /* ---------- 动效 / Motion: the bundle's one switch for decorative transitions ---------- */
    const MOTION_KEY = 'dsh-conversation-enhancer.motion'
    /** the key this bundle wrote before it was renamed: read once, so a saved switch survives */
    const MOTION_KEY_OLD = 'dsh-conversation-display.motion'
    const MOTION_KEY_OLDEST = 'dsh-claude-display.motion'
    let motionOn = true
    try { motionOn = (localStorage.getItem(MOTION_KEY) ?? localStorage.getItem(MOTION_KEY_OLD) ?? localStorage.getItem(MOTION_KEY_OLDEST)) !== 'off' } catch {}
    const motionSubs = new Set<() => void>()
    const reflectMotion = () => {
      if (motionOn) document.documentElement.removeAttribute('data-dcd-anim')
      else document.documentElement.setAttribute('data-dcd-anim', 'off')
    }
    const motion = {
      get: () => motionOn,
      subscribe(fn) { motionSubs.add(fn); return () => motionSubs.delete(fn) },
      set(v) {
        motionOn = !!v
        try { localStorage.setItem(MOTION_KEY, motionOn ? 'on' : 'off') } catch {}
        reflectMotion()
        for (const f of motionSubs) f()
      },
    }

    /* ---------- styles the summary lines share (styles/00-shared.scss) ---------- */
    const sheet = kit.sheet('display-shared', CSS_SHARED)

    kit.vocab = {
      zh, TOOL_KIND, ORDER, WORDS, words, labelOf, durSec,
      CHEV_D, CHEV_SVG, CHEV_MASK, setAttr, setFlag, motion,
    }

    return {
      inject: [],
      apply() { sheet.ensure(); reflectMotion() },
    }
  },
})
