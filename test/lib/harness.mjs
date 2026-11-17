/*
 * Test harness: load one compiled part (`.build/parts/NN-*.js`) far enough to reach the functions
 * inside its factory closure, without a browser and without dsh.
 *
 * A part is `part({ id, factory(require, kit) { ...many consts...; return {...} } })`. Everything
 * worth unit-testing is a `const` inside that closure, so the harness rewrites the source in
 * memory — one assignment just before the factory's `return {` — runs it in a `vm` context with a
 * stubbed `part`, then calls the factory with a stubbed `kit`. Nothing on disk is touched.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

export const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const buildDir = join(root, '.build', 'parts');

/** The bundle-scope prelude (lib helpers + style constants) a part is concatenated after. */
function prelude() {
  const out = [];
  for (const dir of ['lib', 'styles']) {
    const at = join(root, '.build', dir);
    if (!existsSync(at)) continue;
    for (const f of readdirSync(at).filter((x) => x.endsWith('.js')).sort()) out.push(readFileSync(join(at, f), 'utf8'));
  }
  return out.join('\n');
}

/** A `document` good enough for the parts' module-level code and their pure helpers. */
export function fakeDocument(lang = 'zh-CN') {
  const el = () => ({
    lang: '',
    setAttribute() {},
    removeAttribute() {},
    getAttribute: () => null,
    hasAttribute: () => false,
    appendChild() {},
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    style: {},
    dataset: {},
    querySelector: () => null,
    querySelectorAll: () => [],
  });
  const doc = {
    documentElement: el(),
    head: el(),
    body: el(),
    baseURI: 'http://localhost/',
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: el,
    addEventListener() {},
    removeEventListener() {},
  };
  doc.documentElement.lang = lang;
  return doc;
}

/** A React stub: parts only *define* components at load time; nothing renders in these tests. */
const React = {
  memo: (c) => c,
  forwardRef: (c) => c,
  createElement: () => null,
  useMemo: (f) => f(),
  useCallback: (f) => f,
  useState: (v) => [v, () => {}],
  useRef: (v) => ({ current: v }),
  useEffect() {},
  useLayoutEffect() {},
  useSyncExternalStore: (_s, get) => get(),
  Component: class {},
  Fragment: 'fragment',
};

const noop = () => {};
const sheet = () => ({ ensure: noop, remove: noop });

/** Load display-shared first: it owns the vocabulary the other parts read from `kit.vocab`. */
export function loadVocab(lang = 'zh-CN') {
  const kit = { React, h: () => null, sheet, dom: {}, portal: noop, locale: () => 'zh-CN' };
  runPart('00-shared.js', kit, lang, []);
  if (!kit.vocab) throw new Error('display-shared did not publish kit.vocab');
  return kit.vocab;
}

/**
 * Run `part` in one file and return the names asked for.
 * @param {string} file  file name inside `.build/parts`
 * @param {object} kit   the kit handed to the factory
 * @param {string} lang  document language
 * @param {string[]} names  closure names to expose
 */
export function runPart(file, kit, lang, names, extra = {}) {
  let src = prelude() + '\n' + readFileSync(join(buildDir, file), 'utf8');
  const anchor = '        return {';
  const at = src.lastIndexOf(anchor);
  if (at < 0) throw new Error(`no factory return in ${file}`);
  const exposed = names.length
    ? `        globalThis.__exposed = { ${names
        .map((n) => `${n}: typeof ${n} === 'undefined' ? undefined : ${n}`)
        .join(', ')} };\n`
    : '';
  src = src.slice(0, at) + exposed + src.slice(at);

  let def = null;
  const sandbox = {
    part: (d) => { def = d; },
    document: fakeDocument(lang),
    navigator: { language: lang },
    window: { addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {} }) },
    URL,
    URLSearchParams,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    queueMicrotask,
    console,
    Intl,
    Date,
    Math,
    JSON,
    Map,
    Set,
    WeakMap,
    WeakSet,
    Promise,
    RegExp,
    String,
    Number,
    Array,
    Object,
    Error,
    Symbol,
    globalThis: null,
    requestAnimationFrame: (f) => setTimeout(f, 0),
    cancelAnimationFrame: clearTimeout,
    ResizeObserver: class { observe() {} unobserve() {} disconnect() {} },
    MutationObserver: class { observe() {} disconnect() {} takeRecords() { return []; } },
  };
  Object.assign(sandbox, extra);
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(`${src}\n`, sandbox, { filename: file });
  if (!def) throw new Error(`${file} did not call part()`);

  const requireStub = (name) => (name === '@deepseek-ai/dsh-client-ui-primitives' ? {} : {});
  def.factory(requireStub, kit);
  return sandbox.__exposed || {};
}

/** The conversation-flow closure with the vocabulary wired in. */
export function loadFlow(lang = 'zh-CN') {
  const vocab = loadVocab(lang);
  const kit = {
    React,
    h: () => null,
    vocab,
    sheet,
    dom: { subscribe: noop, attr: noop, touches: () => [], poke: noop },
    portal: noop,
    locale: () => lang,
  };
  const names = [
    'roleOf', 'layout', 'summary', 'structSig', 'argsOf', 'partialArgs', 'rawArgsOf',
    'oneLine', 'describe', 'toolLabel', 'toolKind', 'toolState', 'toolName', 'callOf',
    'clip', 'isInjected', 'blankCall', 'bodyRows', 'imagesOf', 'joinPath', 'outText', 'turnOf', 'turnOpen',
    'expand', 'seqOf', 'isGroup', 'hasText', 'firstText', 'reasoningOf', 'hasReasoning',
    'picCache', 'callIdOf', 'rowPicsById', 'runPics', 'firstSeen', 'argsCache', 'iconKind', 'mainKind', 'MARKS', 'FIT', 'thoughtLabel', 'thinkMs', 'homeOf',
  ];
  const fns = runPart('08-conversation-flow.js', kit, lang, names);
  const missing = names.filter((n) => fns[n] === undefined);
  if (missing.length) throw new Error(`conversation-flow: missing ${missing.join(', ')}`);
  return { ...fns, vocab, kit };
}

/* ---------- node builders (shapes taken from dsh's own client objects) ---------- */

/** A settled tool call: `{ kind: 'tool-result', name, args, call: { name, argsRaw }, content, isError }`. */
export function settled(name, args, { content = [], isError = false } = {}) {
  return {
    kind: 'tool-result',
    name,
    args,
    call: { name, argsRaw: JSON.stringify(args) },
    content,
    isError,
  };
}

/** A call still running: the root object carries the arguments, there is no `call`. */
export function running(name, args) {
  return { phase: 'start', name, argsRaw: typeof args === 'string' ? args : JSON.stringify(args) };
}

/** A streaming call: the arguments arrive as chunks. */
export function streaming(name, chunks) {
  return { phase: 'preparing', name, args: { chunks } };
}

/** dsh's `location.turn`: the number the turn carries, and whether it is still open. */
function turnLoc(turn, status = 'closed', reason = null) {
  return { kind: 'turn', turn: { turn, status, end: reason ? { data: { reason: { kind: reason } } } : null } };
}

/** A transcript node around a tool call. */
export function callNode(call, { key = 'n', seq = 1, turn = 1, visibility = 'visible', status = 'closed' } = {}) {
  return { key, kind: 'tool-call', anchorSeq: seq, visibility, data: { root: call, status: call.kind === 'tool-result' ? 'settled' : 'running' }, location: turnLoc(turn, status) };
}

/** A user/assistant node with text blocks (and optionally a reasoning block). */
export function textNode(kind, text, { key = 'u', seq = 0, source, turn = 1, visibility = 'visible', status = 'closed', reasoning, groupPart } = {}) {
  const blocks = [];
  if (reasoning) blocks.push({ kind: 'reasoning', text: reasoning });
  if (text) blocks.push({ kind: 'text', text });
  const node = { key, kind, anchorSeq: seq, visibility, data: { blocks, source }, location: turnLoc(turn, status) };
  const entry = { kind: 'node', key };
  if (groupPart) entry.groupPart = groupPart;
  return { node, entry };
}

/** The `entries` + `nodes` pair `layout` takes, from a list of nodes. */
export function transcript(list) {
  const nodes = new Map();
  const entries = [];
  for (const n of list) {
    nodes.set(n.key, n);
    entries.push({ kind: 'node', key: n.key });
  }
  return { nodes, entries, all: [...nodes.values()] };
}
