/*
 * Loads the built client.js the way dsh does — in a stub browser — and checks the things that only
 * break at load time: a part that never registers, a style sheet that does not balance, an `apply`
 * that throws against a half-built DOM. Not a render test: nothing here paints.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { root } from './lib/harness.mjs';

const noop = () => {};

function makeBrowser() {
  const css = [];
  const errors = [];
  const el = (tag = 'div') => {
    const node = {
      tagName: tag.toUpperCase(), dataset: {}, style: {}, children: [], className: '', textContent: '', innerHTML: '',
      attributes: {}, isConnected: true, nodeType: 1,
      setAttribute(k, v) { this.attributes[k] = String(v); },
      getAttribute(k) { return k in this.attributes ? this.attributes[k] : null; },
      hasAttribute(k) { return k in this.attributes; },
      removeAttribute(k) { delete this.attributes[k]; },
      appendChild(c) { this.children.push(c); return c; },
      removeChild(c) { return c; },
      insertBefore(c) { this.children.push(c); return c; },
      remove() {}, contains() { return false; }, matches() { return false; }, closest() { return null; },
      addEventListener() {}, removeEventListener() {}, focus() {}, click() {}, scrollIntoView() {},
      querySelector() { return null; }, querySelectorAll() { return []; },
      getBoundingClientRect() { return { top: 0, left: 0, width: 0, height: 0, bottom: 0, right: 0 }; },
      cloneNode() { return el(tag); },
      get firstChild() { return this.children[0] || null; },
      get lastChild() { return this.children[this.children.length - 1] || null; },
      get nextSibling() { return null; },
      get parentNode() { return null; },
      get childNodes() { return this.children; },
    };
    return node;
  };
  const head = el('head');
  head.appendChild = (c) => {
    if (c.tagName === 'STYLE') css.push(c.textContent);
    head.children.push(c);
    return c;
  };
  const document = {
    head, body: el('body'), documentElement: Object.assign(el('html'), { lang: 'zh-CN' }), baseURI: 'http://127.0.0.1/',
    createElement: (t) => el(t), createTextNode: (t) => ({ textContent: t, nodeType: 3 }),
    createTreeWalker: () => ({ nextNode: () => null }),
    addEventListener() {}, removeEventListener() {},
    querySelector: () => null, querySelectorAll: () => [],
    getElementById: () => null, contains: () => false, styleSheets: [],
  };
  document.documentElement.lang = 'zh-CN';

  const React = {
    Fragment: 'fragment',
    Component: class { constructor(p) { this.props = p; this.state = {}; } setState(s) { Object.assign(this.state, s); } },
    createElement: (type, props, ...kids) => ({ type, props: props || {}, kids }),
    memo: (c) => c,
    forwardRef: (c) => c,
    useState: (init) => [typeof init === 'function' ? init() : init, noop],
    useRef: (init) => ({ current: init ?? null }),
    useEffect() {}, useLayoutEffect() {},
    useMemo: (fn) => fn(), useCallback: (fn) => fn,
    useSyncExternalStore: (_s, get) => get(),
    useTransition: () => [false, (f) => f()],
    useId: () => 'id',
    useDeferredValue: (v) => v,
    startTransition: (f) => f(),
  };
  const requireStub = (id) => {
    if (id === 'react') return React;
    if (id === 'react-dom') return { createPortal: (x) => x };
    return new Proxy({}, { get: () => () => null });
  };
  const form = { getSnapshot: () => ({ value: {} }), subscribe: () => noop, set: noop, read: () => undefined, write: noop };
  const ctx = {
    locale: { register: noop, bind: () => (k) => k, current: () => 'zh-CN', getSnapshot: () => 'zh-CN', subscribe: () => noop },
    configForms: { register: noop, get: () => form, read: () => undefined, write: noop, update: noop },
    slots: { inject: (key, fn) => fn(ctx.slots), register: (o) => o, subscribe: () => noop, entries: () => [] },
    effect: (fn) => { try { return fn(); } catch (e) { errors.push(`effect: ${e.message}`); } },
    inject: (deps, fn) => { if (fn) fn(ctx); },
    extend: () => ctx,
    plugin: () => ({ dispose: noop }),
    on: noop, emit: noop,
    store: { getSnapshot: () => ({}), subscribe: () => noop, getState: () => ({}) },
    useSyncExternalStore: (get) => get(),
  };
  const win = {
    devicePixelRatio: 2,
    matchMedia: () => ({ matches: false, addEventListener: noop, removeEventListener: noop }),
    addEventListener: noop,
    removeEventListener: noop,
    requestAnimationFrame: (f) => setTimeout(f, 0),
    cancelAnimationFrame: noop,
    localStorage: { getItem: () => null, setItem: noop, removeItem: noop },
    navigator: { language: 'zh-CN', clipboard: { writeText: async () => {} } },
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
    MutationObserver: class { observe() {} disconnect() {} takeRecords() { return []; } },
    CSS: { highlights: { set: noop, delete: noop, has: () => false }, escape: (s) => s },
    Highlight: class { constructor(...a) { this.ranges = a; } },
  };
  win.window = win;
  win.document = document;

  const sandbox = {
    console: { log: noop, warn: noop, error: (m, e) => errors.push(String(m) + (e ? ` :: ${e.message}` : '')) },
    window: win, document, navigator: win.navigator, localStorage: win.localStorage,
    matchMedia: win.matchMedia, requestAnimationFrame: win.requestAnimationFrame, cancelAnimationFrame: noop,
    MutationObserver: win.MutationObserver, CSS: win.CSS, Highlight: win.Highlight,
    getComputedStyle: win.getComputedStyle, ResizeObserver: class { observe() {} disconnect() {} },
    setTimeout, clearTimeout, setInterval, clearInterval, queueMicrotask,
    Promise, Date, Math, JSON, Map, Set, WeakMap, WeakSet, URL, URLSearchParams, Intl,
    TextEncoder, TextDecoder, structuredClone,
    NodeFilter: { SHOW_TEXT: 4, SHOW_ELEMENT: 1 }, Node: { TEXT_NODE: 3, ELEMENT_NODE: 1 },
    performance: { now: () => 0 },
  };
  win.__ModuleLoader__ = { load({ id, factory }) { sandbox.__loaded = { id, factory }; } };
  sandbox.__ModuleLoader__ = win.__ModuleLoader__;
  sandbox.globalThis = sandbox;
  return { sandbox, css, errors, ctx, requireStub, document };
}

/** Load the bundle and register every part it declares. */
function loadBundle() {
  const browser = makeBrowser();
  const { sandbox } = browser;
  // The bundle keeps its part list in a closure; record every `part()` for the tests.
  const source = readFileSync(`${root}/client.js`, 'utf8').replace(
    'const part = (m) => { parts.push(m) }',
    'const part = (m) => { parts.push(m); (globalThis.__parts ||= []).push(m) }',
  );
  vm.createContext(sandbox);
  new vm.Script(source, { filename: 'client.js' }).runInContext(sandbox);
  const mod = sandbox.__loaded.factory(browser.requireStub);
  const parts = sandbox.__parts || [];
  return { ...browser, mod, parts };
}

const bundle = loadBundle();

test('the client registers the loader module dsh expects', () => {
  assert.ok(bundle.sandbox.__loaded, 'the module loader was never called');
  assert.equal(typeof bundle.mod.inject, 'object');
  assert.equal(typeof bundle.mod.apply, 'function');
});

test('all 15 parts are registered, once each', () => {
  const ids = bundle.parts.map((p) => p.id);
  assert.equal(ids.length, 15, `registered ${ids.length} parts: ${ids.join(', ')}`);
  assert.equal(new Set(ids).size, ids.length, 'a part id is registered twice');
  for (const id of ['dom-hub', 'display-shared', 'dsh-transcript-view', 'dsh-tool-groups', 'conversation-flow', 'dsh-plan-checklist', 'native-probe', 'dsh-error-notes', 'dsh-ptc-diffs']) {
    assert.ok(ids.includes(id), `missing part '${id}'`);
  }
  for (const p of bundle.parts) assert.equal(typeof p.factory, 'function', `part '${p.id}' has no factory`);
});

test('every part builds its closure at load without complaining', () => {
  assert.deepEqual(bundle.errors, []);
});

test('apply runs against a stub DOM without throwing', () => {
  assert.doesNotThrow(() => bundle.mod.apply(bundle.ctx));
  assert.deepEqual(bundle.errors, []);
});

test('the style sheets it injects are balanced', () => {
  assert.ok(bundle.css.length >= 5, `only ${bundle.css.length} style sheets`);
  assert.ok(bundle.css.filter((s) => s.trim().length > 200).length >= 5, 'fewer than 5 substantial sheets');
  for (const [i, sheet] of bundle.css.entries()) {
    const open = (sheet.match(/{/g) || []).length;
    const close = (sheet.match(/}/g) || []).length;
    assert.equal(open, close, `sheet ${i} has ${open} { and ${close} }`);
  }
});

test('the sheets are not duplicated across parts', () => {
  const seen = new Map();
  for (const [i, sheet] of bundle.css.entries()) {
    const key = sheet.replace(/\s+/g, ' ').trim();
    assert.equal(seen.has(key), false, `sheets ${seen.get(key)} and ${i} are identical`);
    seen.set(key, i);
  }
});
