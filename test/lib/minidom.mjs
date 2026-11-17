/**
 * A very small DOM: just enough element, attribute and selector behaviour to run the parts that
 * patch dsh's rendered rows. It exists so the row fixes can be tested headlessly — the real bug
 * (a picture that shows while a row is open and vanishes when it is folded) lives in exactly this
 * kind of DOM surgery, and there is no browser here.
 *
 * Supported selectors: descendant chains, comma lists, `.class`, `[attr]`, `[attr="v"]`,
 * `[attr*="v"]`, `[attr$="v"]`, `[attr^="v"]`, and compound forms of those (`[a][b="c"]`).
 */

const ATTR = /^\[([\w-]+)(?:([$*^]?)=["']?([^"'\]]*)["']?)?\]$/

function attrValue(el, name) {
  if (name === 'class') return el.className || ''
  const v = el._attrs.get(name)
  return v === undefined ? null : v
}

function matchToken(el, tok) {
  if (tok.startsWith('[')) {
    const m = ATTR.exec(tok)
    if (!m) return false
    const [, name, op, want = ''] = m
    const got = attrValue(el, name)
    if (got === null) return false
    if (!op) return true
    if (op === '*') return got.includes(want)
    if (op === '$') return got.endsWith(want)
    if (op === '^') return got.startsWith(want)
    return got === want
  }
  if (tok.startsWith('.')) return (el.className || '').split(/\s+/).includes(tok.slice(1))
  return (el.tagName || '').toLowerCase() === tok.toLowerCase()
}

function matchCompound(el, compound) {
  const tokens = compound.match(/\[[^\]]*\]|\.[^.[\]]+|[a-zA-Z][\w-]*/g) || []
  if (!tokens.length) return false
  return tokens.every((t) => matchToken(el, t))
}

function matches(el, selector) {
  return String(selector)
    .split(',')
    .some((one) => {
      const chain = one.trim().split(/\s+/).filter(Boolean)
      if (!chain.length) return false
      if (!matchCompound(el, chain[chain.length - 1])) return false
      let i = chain.length - 2
      let at = el.parentNode
      while (i >= 0) {
        if (!at) return false
        if (matchCompound(at, chain[i])) i -= 1
        at = at.parentNode
      }
      return true
    })
}

function descendants(root) {
  const out = []
  const walk = (n) => {
    for (const c of n.childNodes) {
      out.push(c)
      walk(c)
    }
  }
  walk(root)
  return out
}

class Style {
  constructor() { this._p = new Map() }
  setProperty(k, v) { this._p.set(k, String(v)) }
  getPropertyValue(k) { return this._p.get(k) || '' }
  removeProperty(k) { this._p.delete(k) }
  get cssText() { return [...this._p].map(([k, v]) => `${k}:${v}`).join(';') }
  set cssText(v) { this._p.clear() }
}

export class El {
  constructor(tagName = 'div') {
    this.tagName = tagName
    this.className = ''
    this.childNodes = []
    this.parentNode = null
    this._attrs = new Map()
    this.style = new Style()
    this._text = ''
  }
  get children() { return this.childNodes }
  get dataset() {
    const self = this
    return new Proxy({}, {
      get: (_, k) => self._attrs.get('data-' + String(k).replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())) || undefined,
      set: (_, k, v) => { self.setAttribute('data-' + String(k).replace(/[A-Z]/g, (c) => '-' + c.toLowerCase()), String(v)); return true },
    })
  }
  get textContent() { return this._text + this.childNodes.map((c) => c.textContent).join('') }
  set textContent(v) { this.childNodes = []; this._text = String(v) }
  addEventListener(type, fn, capture) {
    if (!this._on) this._on = []
    this._on.push({ type, fn, capture })
  }
  removeEventListener(type, fn) {
    if (!this._on) return
    this._on = this._on.filter((l) => !(l.type === type && l.fn === fn))
  }
  /** fire a listener in the capture phase, the way dsh's row line sees a thumb click */
  fire(type, event = {}) {
    for (const l of this._on || []) if (l.type === type) l.fn({ type, ...event })
  }
  setAttribute(k, v) { this._attrs.set(k, String(v)) }
  getAttribute(k) { const v = this._attrs.get(k); return v === undefined ? null : v }
  hasAttribute(k) { return this._attrs.has(k) }
  removeAttribute(k) { this._attrs.delete(k) }
  appendChild(c) { c.parentNode = this; this.childNodes.push(c); return c }
  insertBefore(c, ref) {
    const i = ref ? this.childNodes.indexOf(ref) : -1
    c.parentNode = this
    if (i < 0) this.childNodes.push(c)
    else this.childNodes.splice(i, 0, c)
    return c
  }
  remove() {
    if (!this.parentNode) return
    const i = this.parentNode.childNodes.indexOf(this)
    if (i >= 0) this.parentNode.childNodes.splice(i, 1)
    this.parentNode = null
  }
  matches(sel) { return matches(this, sel) }
  closest(sel) {
    let at = this
    while (at) {
      if (matches(at, sel)) return at
      at = at.parentNode
    }
    return null
  }
  querySelectorAll(sel) { return descendants(this).filter((n) => matches(n, sel)) }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null }
}

/** h('div', { 'data-x': '1', class: 'a b' }, child, 'text') */
export function h(tagName, attrs = {}, ...kids) {
  const el = new El(tagName)
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue
    if (k === 'class' || k === 'className') el.className = v
    else el.setAttribute(k, v === true ? '' : String(v))
  }
  for (const kid of kids.flat()) {
    if (kid === null || kid === undefined || kid === false) continue
    if (typeof kid === 'string') el._text += kid
    else el.appendChild(kid)
  }
  return el
}

export function makeDocument(lang = 'zh-CN') {
  const root = new El('html')
  const doc = {
    documentElement: root,
    head: h('head'),
    body: h('body'),
    baseURI: 'http://localhost/',
    lang,
    createElement: (t) => new El(t),
    createTextNode: (t) => { const e = new El('#text'); e._text = String(t); return e },
    querySelector: (sel) => root.querySelector(sel),
    querySelectorAll: (sel) => root.querySelectorAll(sel),
    addEventListener() {},
    removeEventListener() {},
  }
  root.appendChild(doc.head)
  root.appendChild(doc.body)
  return doc
}
