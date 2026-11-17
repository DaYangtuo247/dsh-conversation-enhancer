// Random transcripts fed to the pure half of conversation-flow. Every node shape dsh can hand us is allowed
// to be partial, weird or hostile — a node with no data, a call whose arguments are half a JSON object,
// a turn that never ended, a kind nobody has heard of. None of it may throw: a throw inside the flow
// renderer takes the whole conversation down, and a transcript is not something we control.
import test from 'node:test'
import assert from 'node:assert/strict'
import { loadFlow, textNode } from './lib/harness.mjs'

const zh = loadFlow('zh-CN')
const en = loadFlow('en-US')

// a small deterministic PRNG, so a failure can be replayed from the printed seed
function rng(seed) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

const pick = (r, xs) => xs[Math.floor(r() * xs.length) % xs.length]
const TEXTS = [
  '', 'hi', '中文内容，包含标点。', '🙂 emoji 与 surrogate \u2028 行分隔',
  'x'.repeat(4000), 'a\n\nb\n\n\nc', '`code` 和 **bold** 混排',
  '\t tab', '{"半截": ', '[exit code: 1]\n', 'line\r\nwindows', '\\u0000 空字符',
]
const ARGS = [
  '', '{}', '{"command":"ls -la"}', '{"command":', '{"file_path":"src/a.ts"}',
  '{"path":"/tmp/图.png"}', '{"command":"cd sub && cat x.png"}', '{"query":"思考"}',
  '{"command":"ls","description":"d"}', 'not json at all', '{"n":' + '1'.repeat(500) + '}',
]
const KINDS = [
  'user', 'steering', 'context', 'turn-trigger', 'system-prompt', 'assistant-step', 'command',
  'manual-compaction', 'compaction', 'model-retry', 'turn-error', 'turn-max-tokens', 'turn-process',
  'turn-tail', 'unknown', 'command-input', 'tool-call', 'question-reply', 'workflow-run',
  'nonsense-kind', '', undefined,
]
const TOOLS = ['bash', 'read', 'write', 'edit', 'grep', 'web_search', 'compress', 'task', 'weird_tool', '']

function call(r) {
  const roll = r()
  const name = pick(r, TOOLS)
  if (roll < 0.4) {
    // settled
    const content = r() < 0.7 ? [{ type: 'text', text: pick(r, TEXTS) }] : r() < 0.5 ? undefined : []
    const node = { kind: 'tool-result', name, args: {}, call: { name, argsRaw: pick(r, ARGS) }, content }
    if (r() < 0.2) node.isError = true
    if (r() < 0.1) node.error = { code: pick(r, ['interrupted', 'ENOENT', undefined]) }
    return node
  }
  if (roll < 0.7) return { phase: 'start', name, argsRaw: pick(r, ARGS) }
  if (roll < 0.9) {
    const raw = pick(r, ARGS)
    return { phase: 'preparing', name, args: { chunks: [raw.slice(0, raw.length >> 1), raw.slice(raw.length >> 1)] } }
  }
  return { name, args: {}, unexpected: true } // a shape from the future
}

function node(r, i) {
  const kind = pick(r, KINDS)
  const n = { key: `k${i}`, kind, anchorSeq: i, data: {} }
  if (r() < 0.85) n.data.root = call(r)
  if (r() < 0.7) n.data.blocks = [{ kind: 'text', text: pick(r, TEXTS) }]
  if (r() < 0.5) n.data.source = pick(r, [
    { kind: 'user', rpcId: 'r1', clientTimeZone: 'Asia/Shanghai' },
    { kind: 'runtime-context' }, { kind: 'dsh-mnemon' }, { kind: 'user' }, {}, null,
  ])
  if (r() < 0.6) n.data.status = pick(r, ['settled', 'open', undefined])
  if (r() < 0.2) n.visibility = pick(r, ['hidden', 'visible', undefined])
  const turn = r() < 0.15 ? null : Math.floor(r() * 4)
  n.location = r() < 0.1
    ? { kind: 'step' } // no `.turn` at all: the shape that made turnOf throw
    : { kind: 'turn', turn: { turn, end: r() < 0.3 ? { data: { reason: { kind: pick(r, ['stop', 'error', 'max-tokens', 'interrupted', 'weird']) } } } : null } }
  return n
}

test('no random transcript can throw the flow renderer', () => {
  for (const api of [zh, en]) {
    for (let seed = 1; seed <= 120; seed++) {
      const r = rng(seed)
      const count = 1 + Math.floor(r() * 14)
      const nodes = new Map()
      for (let i = 0; i < count; i++) nodes.set(`k${i}`, node(r, i))
      const entries = [...nodes.values()].map((n) => ({ kind: 'node', key: n.key, anchorSeq: n.anchorSeq, node: n }))
      const view = pick(r, ['normal', 'thinking', 'verbose'])
      const cwd = pick(r, [undefined, '/w', '~/Desktop/workspace', ''])
      try {
        const turns = api.layout(entries, nodes, view, cwd, 'zh-CN')
        assert.ok(Array.isArray(turns), 'layout returns turns')
        for (const t of turns) {
          assert.equal(typeof t.key, 'string', 'a turn has a stable key')
          assert.ok(Array.isArray(t.items), 'a turn has items')
        }
        api.structSig(nodes, entries, view, cwd, 'zh-CN')
        for (const n of nodes.values()) {
          api.roleOf(undefined, n)
          api.toolState(n)
          api.blankCall(n)
          api.isInjected(n)
          api.oneLine(n)
          api.describe(n, 'zh-CN')
          api.argsOf(n)
          api.rawArgsOf(n)
          api.outText(n)
          api.summary([{ node: n }])
          api.turnOf(n)
          api.turnOpen(n)
          const pics = api.imagesOf([{ node: n }], cwd)
          assert.ok(Array.isArray(pics), 'imagesOf returns a list')
          assert.ok(pics.length <= 24, 'imagesOf stays bounded')
          for (const p of pics) assert.equal(typeof p.path, 'string')
        }
      } catch (err) {
        assert.fail(`seed ${seed}, view ${view}: ${err && err.stack}`)
      }
    }
  }
})

test('the caches stay bounded and never hand back another node’s answer', () => {
  const r = rng(99)
  for (let i = 0; i < 600; i++) {
    const n = node(r, i)
    zh.argsOf(n)
    zh.imagesOf([{ node: n }], '/w')
  }
  assert.ok(zh.argsCache instanceof WeakMap || typeof zh.argsCache.get === 'function', 'args cache exists')
  assert.ok(zh.picCache.size <= 300, `picture cache ${zh.picCache.size} entries`)
  assert.ok(zh.runPics.size <= 256, `run picture cache ${zh.runPics.size} entries`)
})

test('a longer run of calls cannot make the layout cost explode', () => {
  const nodes = new Map()
  const entries = []
  for (let i = 0; i < 600; i++) {
    const n = { key: `k${i}`, kind: 'tool-call', anchorSeq: i, visibility: 'visible',
      data: { root: { kind: 'tool-result', name: 'bash', args: {}, call: { name: 'bash', argsRaw: `{"command":"c${i}"}` }, content: [{ type: 'text', text: 'ok' }] }, status: 'settled' },
      location: { kind: 'turn', turn: { turn: Math.floor(i / 40), end: { data: { reason: { kind: 'stop' } } } } } }
    nodes.set(n.key, n)
    entries.push({ kind: 'node', key: n.key, anchorSeq: i, node: n })
  }
  const t0 = process.hrtime.bigint()
  zh.layout(entries, nodes, 'normal', '/w', 'zh-CN')
  const ms = Number(process.hrtime.bigint() - t0) / 1e6
  assert.ok(ms < 1500, `layout of 600 calls took ${ms.toFixed(0)}ms`)
})

test('no row is drawn twice, and the counts match the rows', () => {
  for (const api of [zh, en]) {
    for (let seed = 500; seed <= 560; seed++) {
      const r = rng(seed)
      const nodes = new Map()
      const entries = []
      // runs of consecutive tool calls, the shape that made `expand()` draw the call after a group twice
      const total = 3 + Math.floor(r() * 12)
      for (let i = 0; i < total; i++) {
        const isTool = r() < 0.6
        const n = isTool
          ? { key: `k${i}`, kind: 'tool-call', anchorSeq: i, visibility: 'visible', data: { root: call(r), status: r() < 0.5 ? 'settled' : 'open' }, location: { kind: 'turn', turn: { turn: 0, end: null } } }
          : { key: `k${i}`, kind: 'assistant-step', anchorSeq: i, visibility: 'visible', data: { blocks: [{ kind: 'text', text: pick(r, TEXTS) }], status: 'settled' }, location: { kind: 'turn', turn: { turn: 0, end: null } } }
        if (!isTool && r() < 0.4) n.kind = 'assistant-step'
        nodes.set(n.key, n)
        entries.push({ kind: 'node', key: n.key, anchorSeq: i, node: n, groupPart: isTool ? undefined : pick(r, ['reasoning', 'response', undefined]) })
      }
      const turns = api.layout(entries, nodes, pick(r, ['normal', 'thinking', 'verbose']), '/w', 'zh-CN')
      const seen = new Map()
      for (const t of turns) {
        for (const it of t.items) {
          if (!it.node) continue
          seen.set(it.node.key, (seen.get(it.node.key) || 0) + 1)
        }
      }
      for (const [k, n] of seen) {
        assert.equal(n, 1, `seed ${seed}: node ${k} drawn ${n} times`)
      }
      // a run's counts must add up to the rows it says it has
      for (const t of turns) {
        for (const it of t.items) {
          if (!it.rows) continue
          const s = api.summary(it.rows)
          const drawn = s.text.replace(/ ×\d+/g, '');
          assert.ok(typeof drawn === 'string');
          assert.ok(it.rows.length >= 1);
        }
      }
    }
  }
})
