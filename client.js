/*! dsh-conversation-enhancer v1.0.0 — built by build.mjs from src/lib/dom.js, src/lib/flow-view.js, src/lib/native.js, src/styles/00-shared.scss, src/styles/01-transcript-view.scss, src/styles/02-transcript-polish.scss, src/styles/03-tool-groups.scss, src/styles/04-plan-checklist.scss, src/styles/05-typography.scss, src/styles/06-bash-highlight.scss, src/styles/07-render-offscreen.scss, src/styles/08-conversation-flow.scss, src/styles/09-auto-older.scss, src/styles/10-user-markdown.scss, src/parts/00-dom-hub.js, src/parts/00-shared.js, src/parts/01-transcript-view.js, src/parts/02-transcript-polish.js, src/parts/03-tool-groups.js, src/parts/04-plan-checklist.js, src/parts/05-typography.js, src/parts/06-bash-highlight.js, src/parts/07-render-offscreen.js, src/parts/08-conversation-flow.js, src/parts/09-auto-older.js, src/parts/10-user-markdown.js, src/parts/11-native-probe.js. Edit src/, not this file. */
;(() => {
const BUNDLE = "dsh-conversation-enhancer"
const parts = []
const part = (m) => { parts.push(m) }
/**
 * Shared helpers for the dsh-claude-* bundles (copied into each built client.js).
 * Every part gets one kit: React and createElement, a body portal, named style sheets, and the
 * settings controls used by every 设置 row of ours (settingsUI: Row, Select, Switch matching dsh's own rows).
 */
function makeKit(require, bundle) {
  const React = require('react')
  let ReactDOM = null
  try { ReactDOM = require('react-dom') } catch {}
  return {
    React,
    h: React.createElement,
    /** Popovers render into <body> so no transformed / contained ancestor can offset position:fixed. */
    portal: (el, target = document.body) => (ReactDOM && typeof ReactDOM.createPortal === 'function' ? ReactDOM.createPortal(el, target) : el),
    /** A lazily inserted <style data-plugin="bundle/name">; ensure() is idempotent, remove() undoes it. */
    sheet(name, css) {
      let tag = null
      return {
        ensure() {
          if (tag && document.head.contains(tag)) return
          tag = document.createElement('style')
          tag.dataset.plugin = `${bundle}/${name}`
          tag.textContent = css
          document.head.appendChild(tag)
        },
        remove() { if (tag) { tag.remove(); tag = null } },
      }
    },
    /** Settings rows and controls (made once per bundle on first use). */
    settingsUI() {
      if (!this._settingsUI) this._settingsUI = makeSettingsUI(this)
      return this._settingsUI
    },
  }
}

/** Row / Select / Switch for 设置 pages, styled like dsh's own preference rows. */
function makeSettingsUI(kit) {
    const { React, h, portal } = kit
    const { useState, useEffect, useRef, useLayoutEffect } = React
    const sheet = kit.sheet('settings-ui', `
  .dcf-row{display:flex;align-items:center;gap:8px;padding:16px 0;border-bottom:.5px solid var(--dsw-alias-border-l2)}
  .dcf-row .txt{flex:1 1 auto;min-width:0}
  .dcf-row .lbl{font-size:14px;line-height:22px;color:var(--dsw-alias-label-primary)}
  .dcf-row .desc{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}
  .dap-sel{display:inline-flex;align-items:center;gap:12px;flex:none;height:36px;max-width:260px;padding:0 14px;border:0;border-radius:var(--dsw-radius-md,12px);
    background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-primary);font:inherit;font-size:14px;cursor:pointer;white-space:nowrap}
  .dap-sel:hover,.dap-sel[aria-expanded=true]{background:color-mix(in srgb,var(--dsw-alias-label-primary) 7%,var(--dsw-alias-bg-module-platform))}
  .dap-sel .v{overflow:hidden;text-overflow:ellipsis}
  .dap-sel svg{flex:none;width:14px;height:14px;color:var(--dsw-alias-label-secondary)}
  .dap-menu{box-sizing:border-box;position:fixed;z-index:1100;min-width:180px;max-height:min(360px,calc(100vh - 24px));overflow:auto;padding:6px;border-radius:var(--dsw-radius-lg,14px);background:var(--dsw-specific-menu,var(--dsw-alias-bg-layer-2));backdrop-filter:var(--dsw-menu-backdrop-filter);-webkit-backdrop-filter:var(--dsw-menu-backdrop-filter);box-shadow:var(--dsw-elevation-prominent,0 8px 28px rgba(0,0,0,.18));color:var(--dsw-alias-label-primary);font-size:13.5px;line-height:20px;animation:dap-in .14s cubic-bezier(.2,.8,.2,1) both}
  @keyframes dap-in{from{opacity:0;transform:translateY(-3px)}}
  .dap-menu button{display:flex;align-items:center;gap:10px;width:100%;min-height:32px;padding:6px 10px;border:0;border-radius:9px;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer;white-space:nowrap}
  .dap-menu button:hover,.dap-menu button.kbd{background:var(--dsw-alias-interactive-bg-hover)}
  .dap-menu button .l{flex:1 1 auto}
  .dap-menu button svg{flex:none;width:15px;height:15px}
  .dsu-switch{position:relative;flex:none;width:36px;height:22px;padding:0;border:0;border-radius:11px;background:var(--dsw-alias-bg-module-platform);cursor:pointer;transition:background-color .18s ease}
  .dsu-switch::after{content:"";position:absolute;top:2px;left:2px;width:18px;height:18px;border-radius:50%;corner-shape:round;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.25);transition:transform .18s cubic-bezier(.2,.8,.2,1)}
  .dsu-switch[aria-checked=true]{background:var(--dsw-alias-state-business-primary,#4d6bfe)}
  .dsu-switch[aria-checked=true]::after{transform:translateX(14px)}
  @media (prefers-reduced-motion: reduce){.dsu-switch,.dsu-switch::after{transition:none}}
  `)
    const zhUI = () => !/^en/i.test(document.documentElement.lang || '')
    const L = (o) => (zhUI() ? o.zh : o.en)
    const S = (z, e) => (zhUI() ? z : e)
    const sw = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' }
    const chev = () => h('svg', { viewBox: '0 0 16 16', 'aria-hidden': true }, h('path', { d: 'M4.5 6.5 8 10l3.5-3.5', ...sw }))
    const check = () => h('svg', { viewBox: '0 0 16 16', 'aria-hidden': true }, h('path', { d: 'M3.5 8.4 6.6 11.4 12.5 4.8', ...sw, strokeWidth: 1.7 }))

    // ------------------------------------------------------------------ controls
    function Select({ value, options, onChange, box, label }) {
      const [open, setOpen] = useState(false)
      const [pos, setPos] = useState(null)
      const btn = useRef(null)
      const menu = useRef(null)
      const cur = options.find((o) => o.v === value) || options[0]
      useLayoutEffect(() => {
        if (!open) return
        const r = btn.current.getBoundingClientRect()
        const w = Math.max(r.width, 200)
        const left = Math.max(8, Math.min(r.right - w, window.innerWidth - w - 8))
        const below = window.innerHeight - r.bottom
        setPos(below > 220 ? { left, top: r.bottom + 4, width: w } : { left, bottom: window.innerHeight - r.top + 4, width: w })
      }, [open])
      useEffect(() => {
        if (!open) return undefined
        const down = (e) => { if (!menu.current?.contains(e.target) && !btn.current?.contains(e.target)) setOpen(false) }
        const key = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setOpen(false); btn.current?.focus() } }
        const scroll = (e) => { if (!menu.current?.contains(e.target)) setOpen(false) }
        document.addEventListener('mousedown', down, true)
        document.addEventListener('keydown', key, true)
        document.addEventListener('scroll', scroll, true)
        return () => { document.removeEventListener('mousedown', down, true); document.removeEventListener('keydown', key, true); document.removeEventListener('scroll', scroll, true) }
      }, [open])
      return h(React.Fragment, null,
        h('button', { ref: btn, type: 'button', className: `dap-sel${box ? ' box' : ''}`, 'aria-haspopup': 'listbox', 'aria-expanded': open, 'aria-label': label, onClick: () => setOpen((v) => !v) },
          h('span', { className: 'v' }, cur.label || L(cur)), chev()),
        open && pos ? portal(h('div', { ref: menu, className: 'dap-menu', role: 'listbox', style: { left: pos.left, top: pos.top, bottom: pos.bottom, width: pos.width } },
          options.map((o) => h('button', {
            key: String(o.v), type: 'button', role: 'option', 'aria-selected': o.v === value,
            onClick: () => { setOpen(false); onChange(o.v); btn.current?.focus() },
          }, h('span', { className: 'l', style: o.font ? { fontFamily: o.font } : undefined }, o.label || L(o)), o.v === value ? check() : null)))) : null)
    }

    function Row({ label, desc, children }) {
      return h('div', { className: 'dcf-row' },
        h('div', { className: 'txt' }, h('div', { className: 'lbl' }, label), desc ? h('div', { className: 'desc' }, desc) : null),
        children)
    }
    function Switch({ checked, onChange, label }) {
      return h('button', { type: 'button', role: 'switch', className: 'dsu-switch', 'aria-checked': !!checked, 'aria-label': label, onClick: () => onChange(!checked) })
    }
    return { sheet, Row, Select, Switch, L, S }
}

/**
 * One feature registry per bundle (kit.js is copied into each client.js, so this singleton is
 * bundle-local): a bundle's settings surfaces list and flip only its own features, never another
 * plugin's. Each part declares itself with `feature:` metadata; gateFeature() below starts/stops
 * the part live. Choices persist in one localStorage key (feature ids are unique across bundles);
 * absent means on.
 */
let featureStoreInstance
function featureStore() {
  if (featureStoreInstance) return featureStoreInstance
  const KEY = 'dsh-claude-features.enabled'
  let enabled = {}
  try { enabled = JSON.parse(localStorage.getItem(KEY) || '{}') || {} } catch {}
  let rev = 0
  const meta = []
  const subs = new Set()
  const store = {
    declare(bundle, id, f) { if (f && !meta.some((m) => m.id === id)) meta.push({ bundle, id, ...f }) },
    list: () => meta.slice(),
    enabled: (id) => enabled[id] !== false,
    revision: () => rev,
    set(id, on) {
      enabled = { ...enabled, [id]: !!on }
      try { localStorage.setItem(KEY, JSON.stringify(enabled)) } catch {}
      rev++
      for (const fn of subs) fn(id)
    },
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn) },
  }
  featureStoreInstance = store
  return store
}

/**
 * Run one feature part in its own cordis fiber so the settings tab can dispose and restart it.
 * Infrastructure parts (no `feature:`) stay on the plain synchronous path: dom-hub must be up
 * before anything subscribes to kit.dom. Fibers activate in declaration order (microtasks), so
 * parts that read each other's setup still see it.
 */
function gateFeature(ctx, store, mod) {
  let fiber = null
  let slotDisposers = []
  // slots.inject ties its effect to the slots service's own fiber, not ours, so a disposed feature
  // would leave its contribution mounted; collect the returned disposers and run them on stop.
  const slots = new Proxy({}, {
    get(_t, prop) {
      if (prop === 'inject') return (key, cb) => { const d = ctx.slots.inject(key, cb); slotDisposers.push(d); return d }
      const v = ctx.slots[prop]
      return typeof v === 'function' ? v.bind(ctx.slots) : v
    },
  })
  const scope = ctx.extend({ slots })
  const start = () => {
    if (fiber || !store.enabled(mod.id)) return
    fiber = scope.plugin({ name: mod.id, inject: mod.inject, apply: (s) => mod.apply(s) })
  }
  const stop = () => {
    const f = fiber
    fiber = null
    for (const d of slotDisposers.splice(0)) { try { d() } catch {} }
    if (f) Promise.resolve(f.dispose()).catch(() => {})
  }
  start()
  const off = store.subscribe((id) => { if (id === mod.id) (store.enabled(mod.id) ? start() : stop()) })
  ctx.effect(() => () => { off(); stop() }, `feature: ${mod.id}`)
}

// ===== src/lib/dom.js
"use strict";
/*!
 * DOM helpers the parts share.
 *
 * `document.querySelector` answers an `Element`, but every row these parts touch is an HTMLElement
 * (they read `dataset`, set attributes, click buttons). These two wrappers keep the element type
 * instead of casting at every call site, and they are the one place that decides the default root.
 */
/** The first match, typed. */
const q = (sel, root = document) => root.querySelector(sel);
/** Every match, as a real array (the parts map/filter it). */
const qa = (sel, root = document) => Array.from(root.querySelectorAll(sel));

// ===== src/lib/flow-view.js
"use strict";
/*!
 * conversation-flow's view half: the React components that draw a turn (Run, Thought, Steps, Turn, the
 * live line, thumbnails and the image viewer). Split out of parts/08-conversation-flow.ts so that file
 * stays the model (classification, layout, the structural signature, the caches) and this one is
 * purely how a turn reads on screen.
 *
 * makeFlowView(kit, require, M) closes over the model's helpers (M) and returns { useQuiet, Turn,
 * Tail } for makeFlow to compose. Nothing here re-derives data: every word, kind, duration and
 * picture lookup comes from M or kit.vocab, so the view and the native mode speak the same words.
 *
 * Folding is the .dcd-flow-fold grid-row transition (styles/08): a body that has been opened once stays
 * mounted and closes by collapsing to 0fr, so reopening is instant and nothing replays its entrance.
 */
function makeFlowView(kit, require, M) {
    const { React, h } = kit;
    const V = kit.vocab;
    const words = V.words;
    const { toolKind, toolState, oneLine, describe, clip, base, rowText, summary, bodyRows, imagesOf, reasoningOf, hasText, thoughtLabel, icon, iconKind, mainKind, callIdOf, mediaUrl, firstSeen, OPENED, runPics, rowPics, rowPicsById, rowPicsByText, } = M;
    /* ---------- the native flow, one row at a time ---------- */
    const EMPTY_NAV = { items: () => [] };
    function useQuiet(props) {
        // running masked and no latest-turn anchor: the native flow then adds no status line
        return React.useMemo(() => ({
            useSession: (sel, eq) => props.useSession((s) => sel(Object.assign(Object.create(s), { running: false })), eq),
            useChat: (sel, eq) => props.useChat((s) => sel(Object.assign(Object.create(s), { navigation: EMPTY_NAV })), eq),
        }), [props.useSession, props.useChat]);
    }
    const entriesSig = (entries) => entries.map((e) => `${e.key}:${e.groupPart || ''}`).join('|');
    // memoized so a turn re-render does not redraw every native row: only the rows whose entries
    // actually changed call the native flow again (the streaming seat updates on its own regardless).
    // `lang` is a redraw signal: the seats read dsh's locale themselves, but a bailed memo would
    // keep their old strings on screen after a language switch.
    const NativeRows = React.memo(function NativeRows({ Native, props, quiet, entries, lang }) {
        return h(Native, { ...props, ...quiet, entries, pendingInputs: [] });
    }, (a, b) => a.Native === b.Native && a.quiet === b.quiet && a.props.cwd === b.props.cwd
        && a.lang === b.lang
        && a.props.useChat === b.props.useChat && a.props.useSession === b.props.useSession
        && entriesSig(a.entries) === entriesSig(b.entries));
    const CHEVRON = h('svg', { width: 12, height: 12, viewBox: '0 0 12 12', 'aria-hidden': true }, h('path', { d: V.CHEV_D, fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round' }));
    function useNow(on) {
        const [now, setNow] = React.useState(() => Date.now());
        React.useEffect(() => {
            if (!on)
                return undefined;
            const t = setInterval(() => setNow(Date.now()), 1000);
            return () => clearInterval(t);
        }, [on]);
        return now;
    }
    /**
     * The words the live line is still being given, as one line that keeps its end.
     *
     * A thought arrives as a stream, so nothing is retyped, nothing is cut into strips and no page
     * is turned. Every word that lands is drawn as it lands; what changes is only which part of a
     * long thought the row can hold — the line is pinned to its end, so the newest word stays
     * against the clock and the beginning falls off the row's left edge. A thought therefore reads
     * as text being written at the speed it is written, which is the whole point of the line.
     */
    const LivePreview = React.memo(function LivePreview({ text }) {
        const box = React.useRef(null);
        // the words are pinned by their end in CSS, not by a transform here: the row is a flex box
        // that packs its tail to the right, and the tail is never narrower than the row. A short
        // thought therefore starts at the left edge; a long one keeps its newest word against the
        // clock and lets the beginning fall off the clipped left edge. That removes a layout read
        // and a style write from every streamed token — the old effect measured the range and wrote
        // `transform` on each render, which is exactly the kind of synchronous layout that makes
        // streaming feel like it stutters.
        //
        // JS is left with one job: mark a row that is actually cut, so only that row fades at its
        // left edge. A ResizeObserver does it after layout instead of during render; the observer
        // fires when the words grow or the row resizes, not once per token.
        React.useLayoutEffect(() => {
            const el = box.current;
            const inner = el ? el.firstElementChild : null;
            if (!el || !inner) {
                if (el)
                    el.removeAttribute('data-cut');
                return undefined;
            }
            const mark = () => {
                const cut = inner.getBoundingClientRect().width > el.clientWidth + 0.5;
                if (cut)
                    el.setAttribute('data-cut', '');
                else
                    el.removeAttribute('data-cut');
            };
            mark();
            if (typeof ResizeObserver === 'undefined')
                return undefined;
            const ro = new ResizeObserver(mark);
            ro.observe(el);
            ro.observe(inner);
            return () => ro.disconnect();
        }, [!!text]);
        // an empty line is still a line: the row keeps its height and its clock, so the first word
        // that lands does not move anything on the row it lands in
        return h('span', { className: 'dcd-flow-preview dcd-flow-preview-live', ref: box }, text ? h('span', { className: 'dcd-flow-tail' }, text) : null);
    });
    /** One quiet line of a thought for the closed row: whitespace folded, marks left as plain text. */
    const previewOf = (text) => (text || '').replace(/`([^`\n]+)`/g, '$1').replace(/\*\*([^*\n]+)\*\*/g, '$1').replace(/\s+/g, ' ').trim();
    /**
     * The one line that says what is happening right now. It sits under the group its work belongs
     * to and is the only thing in a turn that changes before the turn ends: the call in flight, the
     * answer streaming, or the model thinking between two calls. When the work lands, the line does
     * not go anywhere — the count above changes, and with the group open the same words appear as a
     * row up there. That is the whole reading: down here what is happening, up there what happened.
     */
    const Live = React.memo(function Live({ call, streaming, thought, indent, turnKey, useChat, view }) {
        const now = useNow(true);
        // the last line this turn had words on, so the beats between steps are not blank
        const carry = React.useRef({ key: turnKey, text: '' });
        const w = words();
        // the thought this line is about is still being written, and the turn above it bails while
        // only text grows — so the words are read off the node here, the same way the thought row reads
        // its own. What is selected is the text, not the node: a streamed thought keeps one node object
        // and only grows its text, so a selector handing back the node would never fire and the line
        // would sit on the first word (or on nothing) until something else re-rendered the turn
        const cur = useChat ? useChat((s) => (thought ? reasoningOf(s.nodes.get(thought.key)) : '') || '') : '';
        const preview = thought ? previewOf(cur || reasoningOf(thought) || '') : '';
        // two clocks: a call counts itself, thinking and writing count the turn
        // turnKey already is `t:<n>`; the pruner below must be able to tell turn clocks from row clocks
        const tkey = `turn:${turnKey}`;
        if (!firstSeen.has(tkey))
            firstSeen.set(tkey, Date.now());
        const ckey = call ? call.entry.key : '';
        if (ckey && !firstSeen.has(ckey))
            firstSeen.set(ckey, Date.now());
        const sec = Math.floor(Math.max(0, now - firstSeen.get(ckey || tkey)) / 1000);
        // Every state on this line says how long it has been going — a call counts itself from the
        // moment it started, thinking and writing count the turn they belong to. The whale row below
        // still carries the turn's own total, untouched: one line says what, the timing is here, and
        // the clock never reads differently for a command than for a thought.
        const time = sec >= 1 ? V.durSec(sec) : '';
        const kind = call ? toolKind(call.node) : 'think';
        // This line says WHAT is happening; the row below it (dsh's own, the whale) says 「深度求索中，
        // 用时 3秒」 and is left exactly as dsh draws it. 标准 view draws no thought card, and a turn
        // with no words at all reads as stuck, so the bare-thought case still names the state here.
        const text = call ? describe(call.node)
            : streaming ? w.writing
                : w.thinking;
        // a thought that has not said its first word yet has nothing to put on the line, and a row
        // reading only 「思考中… · 3 秒」 is the one state the reader asked never to see: the row takes
        // its place in the turn but stays empty until there is a word to put in it, so what lands is
        // 「思考中… words · 3 秒」 from the first frame instead of a moment later
        // 思考/详尽 draw the thought's own words on this line, so an empty row would only be a
        // 「思考中… · 3 秒」 that turns into the same row with words a moment later — 标准 drew none of
        // that text, and there the words are the only cue the model is thinking at all, so the line
        // stays exactly as it always was: named, timed, and quiet until the work starts
        const quiet = view !== 'normal' && !preview && !call && !streaming;
        // between two steps there is a beat where nothing has been said yet: the last thought is done
        // and the next one has not produced its first word. Leaving the line empty there reads as a
        // gap in the turn, so the last line this turn did show stays put — dimmed, still timed — and
        // the new words take it over the moment they land
        if (preview)
            carry.current = { key: turnKey, text: preview };
        else if (carry.current.key !== turnKey)
            carry.current = { key: turnKey, text: '' };
        const held = quiet ? carry.current.text : '';
        const stale = !preview && !!held;
        return h('div', { className: 'dcd-flow-live', 'data-kind': kind, 'data-indent': indent ? '' : undefined,
            'data-quiet': quiet && !held ? '' : undefined,
            'data-stale': stale ? '' : undefined,
            'data-bare': !text && (preview || held) ? '' : undefined }, icon(call ? iconKind(call.node) : 'think'), text ? h('span', { className: 'dcd-flow-label dcd-flow-shimmer' }, clip(text, 140)) : null, preview || held || thought ? h(LivePreview, { text: preview || held }) : null, 
        // the clock's room is taken from the first frame: a row that gains its seconds a second
        // later would otherwise pull its words a few pixels narrower while nobody is typing
        h('span', { className: 'dcd-flow-time', 'data-empty': time ? undefined : '' }, time));
    });
    /* ---------- images: small previews at the right of a line, and the viewer they open ---------- */
    /** A small window over the page with the image at its natural size (up to the window); Esc or a click outside closes it. */
    function Peek({ pic, onClose }) {
        React.useEffect(() => {
            const key = (e) => { if (e.key === 'Escape') {
                e.stopPropagation();
                onClose();
            } };
            document.addEventListener('keydown', key, true);
            return () => document.removeEventListener('keydown', key, true);
        }, [onClose]);
        const url = mediaUrl(pic.path, pic.v);
        const w = words();
        const box = h('div', { className: 'dcd-flow-peek', role: 'dialog', 'aria-modal': true, 'aria-label': base(pic.path), onMouseDown: (e) => { if (e.target === e.currentTarget)
                onClose(); } }, h('div', { className: 'dcd-flow-peek-win' }, h('div', { className: 'dcd-flow-peek-bar' }, h('span', { className: 'dcd-flow-peek-name', title: pic.path }, base(pic.path)), h('a', { className: 'dcd-flow-peek-btn', href: url, target: '_blank', rel: 'noreferrer', title: w.openTab }, '↗'), h('button', { type: 'button', className: 'dcd-flow-peek-btn', onClick: onClose, 'aria-label': w.close }, '✕')), h('div', { className: 'dcd-flow-peek-body' }, h('img', { src: url, alt: base(pic.path) }))));
        return kit.portal(box);
    }
    // dsh's own image viewer (the one markdown images open in); our small window is only a fallback
    let Lightbox = null;
    try {
        Lightbox = require('@deepseek-ai/dsh-client-ui-primitives').ImageLightbox || null;
    }
    catch {
        Lightbox = null;
    }
    /** The viewer over the page, for one of several images: ‹ › and the arrow keys step through them. */
    function Viewer({ pics, at, setAt }) {
        const pic = pics[at];
        const close = React.useCallback(() => setAt(-1), [setAt]);
        const many = pics.length > 1;
        const step = React.useCallback((d) => setAt((i) => (i + d + pics.length) % pics.length), [setAt, pics.length]);
        React.useEffect(() => {
            if (!many)
                return undefined;
            const key = (e) => { if (e.key === 'ArrowRight') {
                e.preventDefault();
                step(1);
            }
            else if (e.key === 'ArrowLeft') {
                e.preventDefault();
                step(-1);
            } };
            window.addEventListener('keydown', key, true);
            return () => window.removeEventListener('keydown', key, true);
        }, [many, step]);
        if (!pic)
            return null;
        const w = words();
        const view = Lightbox
            ? h(Lightbox, { src: mediaUrl(pic.path, pic.v), alt: base(pic.path), labels: { dialog: base(pic.path), close: w.close }, onClose: close })
            : h(Peek, { pic, onClose: close });
        const nav = many ? kit.portal(h('div', { className: 'dcd-flow-nav' }, h('button', { type: 'button', 'aria-label': w.prev, onClick: () => step(-1) }, '‹'), h('span', { className: 'dcd-flow-nav-text', title: pic.path }, `${base(pic.path)} · ${at + 1} / ${pics.length}`), h('button', { type: 'button', 'aria-label': w.next, onClick: () => step(1) }, '›'))) : null;
        return h(React.Fragment, null, view, nav);
    }
    function Thumb({ pic, onOpen, onDead }) {
        const [state, setState] = React.useState('loading');
        const name = base(pic.path);
        return h('button', { type: 'button', className: 'dcd-flow-thumb', 'data-state': state, title: pic.path, 'aria-label': name, onClick: onOpen }, h('img', { src: mediaUrl(pic.path, pic.v), alt: name, loading: 'eager', decoding: 'async',
            onLoad: () => setState('ok'), onError: () => { setState('failed'); onDead(`${pic.path}|${pic.v}`); } }));
    }
    /* A few previews at the right end of the line, 「+N」 for the rest — and always the same number
       of them. The count used to be measured from the room the text left over, but the text grows
       while a run folds more calls in (「命令 ×52 · 读取 · 编辑 ×4 …」): each growth shrank the room
       until the tiles fell off the line and came back on the next redraw. Now the tiles are fixed
       and the label is what truncates. */
    const MAX_SHOWN = 3;
    function Thumbs({ pics }) {
        const [at, setAt] = React.useState(-1);
        // names that would not load: a name in a log is not a picture
        const [dead, setDead] = React.useState(null);
        const onDead = React.useCallback((id) => setDead((d) => { const n = new Set(d || []); n.add(id); return n; }), []);
        const live = React.useMemo(() => (dead ? pics.filter((p) => !dead.has(`${p.path}|${p.v}`)) : pics), [pics, dead]);
        // the list can shrink under an open viewer (a picture failed to load, or the run lost one):
        // leaving `at` pointing past the end keeps the viewer mounted on nothing
        React.useEffect(() => { if (at >= live.length)
            setAt(-1); }, [at, live.length]);
        if (!live.length)
            return null;
        const shown = live.slice(0, MAX_SHOWN);
        const more = live.length - shown.length;
        return h('div', { className: 'dcd-flow-thumbs' }, more > 0 ? h('button', { type: 'button', className: 'dcd-flow-more', onClick: () => setAt(shown.length),
            title: live.slice(shown.length).map((p) => base(p.path)).join('\n') }, `+${more}`) : null, shown.map((p, i) => h(Thumb, { key: `${p.path}|${p.v}`, pic: p, onOpen: () => setAt(i), onDead })), at >= 0 ? h(Viewer, { pics: live, at, setAt }) : null);
    }
    /* A card opened by hand must stay open while the turn keeps running: new calls arrive, layout
       hands back new item objects, and a remounted line would come back at its default state — the
       「I opened it and it closed itself」 report. The choice lives in OPENED (the model's map), keyed
       by the view and the line's own key, so it outlives any one render. */
    const useKeptOpen = (lineKey, view, fallback) => {
        const key = `${view}|${lineKey}`;
        const [pick, setPick] = React.useState(null);
        const open = pick === null ? (OPENED.has(key) ? OPENED.get(key) : fallback) : pick;
        const set = (v) => {
            if (OPENED.size > 200)
                OPENED.clear();
            OPENED.set(key, v);
            setPick(v);
        };
        return [open, set];
    };
    /** One process run: a line, and when open the tool rows in their card.
        `turnLive`: this run is the last one of a turn that is still running. Not the same as the
        tail item — a think row may follow it — so the running call is found from this flag and not
        from the tail position. */
    const Run = React.memo(function Run({ run, live, turnLive, defaultOpen, view, Native, props, quiet, lang }) {
        // a run opened or closed by hand keeps that until the view (标准/思考/详尽) changes
        const [picked, setUserOpen] = useKeptOpen(run.key, view, defaultOpen);
        // A group stays collapsed while it runs: the count is the history, the live line below says
        // what is in flight. A hand toggle still wins until the view changes.
        const multi = run.rows.length > 1;
        const open = picked;
        // A card that has been opened once stays mounted, and closing only folds it shut: rebuilding
        // its rows on every toggle made opening a run with dozens of calls hitch. The rows are already
        // there; the .dcd-flow-fold transition collapses them to zero height and back.
        const kept = React.useRef(false);
        if (open)
            kept.current = true;
        const current = turnLive ? [...run.rows].reverse().find((r) => r.role === 'tool' && toolState(r.node) === 'running') : undefined;
        // `busy`: a call of this run is running. The head then says only the kind — what it is, and
        // how long it has taken, is the live line's business below it.
        const busy = !!current;
        const s = summary(run.rows);
        const w = words();
        // A picture belongs to the run, not to its current state: hiding the tiles while a call was in
        // flight was what made them blink out of the line every time the fold took in another call.
        const pics = run.pics || [];
        // the card holds the calls that have said something; the one in flight is the live line's
        const rows = bodyRows(run.rows, current);
        const failText = s.failed ? (run.rows.length === 1 ? w.failedOne : w.failed(s.failed)) : '';
        // a call the user stopped never ran to an answer: say so instead of letting it read as done
        const stoppedText = !s.failed && run.rows.some((r) => toolState(r.node) === 'stopped') ? `· ${w.stopped}` : '';
        // one call: say what it did (「编辑 stats.py」), not the bare 「命令」
        let label = multi ? s.text : oneLine(run.rows[0].node) || s.text;
        // while a single call is in flight the head says only its kind: the words that say what it is
        // running are on the live line, and when it lands those words become this head
        if (current && !multi)
            label = w[toolKind(current.node)](1);
        return h('div', { className: 'dcd-flow-run', 'data-open': open ? '' : undefined, 'data-busy': busy ? '' : undefined }, h('div', { className: 'dcd-flow-line' }, h('button', { type: 'button', className: 'dcd-flow-head', 'aria-expanded': open, onClick: () => setUserOpen(!open) }, icon(mainKind(run.rows)), h('span', { className: multi ? 'dcd-flow-label dcd-flow-counts' : 'dcd-flow-label' }, label), failText ? h('span', { className: 'dcd-flow-err' }, `· ${failText}`) : null, stoppedText ? h('span', { className: 'dcd-flow-stop' }, stoppedText) : null, h('span', { className: 'dcd-flow-chev' }, CHEVRON)), pics.length ? h(Thumbs, { pics }) : null), kept.current && rows.length ? h('div', { className: 'dcd-flow-fold', 'data-shut': open ? undefined : '' }, h('div', { className: 'dcd-flow-body' }, 
        // `dcf-card` is the class dsh-claude-theme's glass rules still name: drop it when that
        // bundle is renamed too
        h('div', { className: 'dcd-flow-card dcf-card' }, h(NativeRows, { Native, props, quiet, lang, entries: rows.map((r) => r.entry) })))) : null);
    }, (a, b) => a.run === b.run && a.live === b.live && a.turnLive === b.turnLive && a.defaultOpen === b.defaultOpen
        && a.view === b.view && a.lang === b.lang
        && a.Native === b.Native && a.quiet === b.quiet && a.props.cwd === b.props.cwd
        && a.props.useChat === b.props.useChat && a.props.useSession === b.props.useSession);
    /* ---------- thinking: a card that matches the tool card ---------- */
    /** Reasoning is prose with the odd `code` / **bold**: paragraphs, line breaks and those two marks. */
    function inline(text) {
        const out = [];
        const re = /`([^`\n]+)`|\*\*([^*\n]+)\*\*/g;
        let at = 0;
        let m;
        while ((m = re.exec(text))) {
            if (m.index > at)
                out.push(text.slice(at, m.index));
            out.push(m[1] !== undefined ? h('code', { key: m.index }, m[1]) : h('strong', { key: m.index }, m[2]));
            at = m.index + m[0].length;
        }
        if (at < text.length)
            out.push(text.slice(at));
        return out;
    }
    const Thought = React.memo(function Thought({ node, live, full, useChat, lang, plain }) {
        // subscribe to this node so a streaming thought redraws on its own, even while the turn above
        // bails (the turn list is reused for pure text growth). Other nodes' tokens never wake it.
        const key = node.key;
        const cur = (useChat && useChat((s) => s.nodes.get(key))) || node;
        const text = reasoningOf(cur);
        const [pick, setPick] = React.useState(null); // a hand toggle lasts until the view changes
        const open = pick && pick.view === full ? pick.open : full;
        // opened once, the text stays mounted and folds shut like a run card (no rebuild on toggle)
        const kept = React.useRef(false);
        if (open)
            kept.current = true;
        const isLive = live && cur.data && cur.data.status !== 'settled';
        const label = thoughtLabel(cur, isLive, plain);
        const preview = previewOf(text).slice(0, 200);
        // the capped block follows a thought that is still arriving: newest words in view unless the
        // reader scrolled up to read something (then it stays where they put it)
        const body = React.useRef(null);
        React.useEffect(() => {
            const el = body.current;
            if (!el || !isLive || !open)
                return;
            if (el.scrollHeight - el.scrollTop - el.clientHeight < 48)
                el.scrollTop = el.scrollHeight;
        }, [text, isLive, open]);
        return h('div', { className: 'dcd-flow-thought', 'data-open': open ? '' : undefined, 'data-busy': isLive ? '' : undefined }, h('button', { type: 'button', className: 'dcd-flow-head', 'aria-expanded': open, onClick: () => setPick({ view: full, open: !open }) }, icon('think'), h('span', { className: isLive ? 'dcd-flow-label dcd-flow-shimmer' : 'dcd-flow-label' }, label), !open && preview ? h('span', { className: 'dcd-flow-preview' }, preview) : null, h('span', { className: 'dcd-flow-chev' }, CHEVRON)), kept.current ? h('div', { className: 'dcd-flow-fold', 'data-shut': open ? undefined : '' }, h('div', { className: 'dcd-flow-clip' }, h('div', { className: 'dcd-flow-thought-text', ref: body }, text.split(/\n{2,}/).map((p, k) => h('p', { key: k }, inline(p)))))) : null);
    }, (a, b) => a.node.key === b.node.key && a.live === b.live && a.full === b.full && a.plain === b.plain
        && a.useChat === b.useChat && a.lang === b.lang);
    /** Consecutive thinking and command lines of a turn make one stretch of steps. */
    function stretches(items) {
        const out = [];
        let cur = null;
        for (const it of items) {
            if (it.type === 'think' || (it.type === 'run' && !it.agent)) {
                if (!cur) {
                    cur = { type: 'steps', key: `steps:${it.key}`, items: [] };
                    out.push(cur);
                }
                cur.items.push(it);
            }
            else {
                cur = null;
                out.push(it);
            }
        }
        return out;
    }
    // How many lines a stretch of steps may keep before it folds into one. A running turn is left
    // flat a line longer than a finished one: there the rows are the only sign of what the model is
    // doing, and folding a two-line stretch mid-flight hides the step that is actually moving. Once
    // the turn is closed both thresholds pull the same way — a finished turn reads as its answer,
    // with one summary line standing in for the work — so the count alone decides, not the moment
    // the turn happened to close.
    const FOLD_OPEN = 3;
    const FOLD_CLOSED = 2;
    /** 「思考 ×2 · 命令 ×3 · 失败 ×1 ›」: a long stretch of steps, opened to its lines. */
    function Steps({ items, render, view }) {
        const [open, setOpen] = useKeptOpen(items[0] ? items[0].key : 'steps', view || 'normal', false);
        const kept = React.useRef(false);
        if (open)
            kept.current = true;
        const thinks = items.filter((it) => it.type === 'think');
        const rows = items.flatMap((it) => (it.type === 'run' ? it.rows : []));
        const failed = rows.filter((r) => toolState(r.node) === 'error').length;
        // short and countable, like the run lines: 「思考 ×3 · 工具 ×2 · 失败 ×1 ›」
        const w = words();
        const parts = [];
        if (thinks.length)
            parts.push(h('span', { key: 't' }, w.thinks(thinks.length)));
        if (rows.length)
            parts.push(h('span', { key: 'r' }, w.other(rows.length)));
        // not inside `parts`: in a narrow column the counts truncate, but the line must never stop
        // saying that something failed
        const pics = items.flatMap((it) => (it.type === 'run' && it.pics) || []);
        return h('div', { className: 'dcd-flow-steps', 'data-open': open ? '' : undefined }, h('div', { className: 'dcd-flow-line' }, h('button', { type: 'button', className: 'dcd-flow-head', 'aria-expanded': open, onClick: () => setOpen(!open) }, 
        // the same icon gutter as every other process line, so their text starts on one column
        icon('steps'), h('span', { className: 'dcd-flow-label dcd-flow-counts' }, parts.flatMap((p, i) => (i ? [h('span', { key: `d${i}`, className: 'dcd-flow-dot' }, '·'), p] : [p]))), failed ? h('span', { key: 'f', className: 'dcd-flow-err dcd-flow-errsep' }, w.failed(failed)) : null, h('span', { className: 'dcd-flow-chev' }, CHEVRON)), 
        // folded, the images of its calls still show (open, each call's line shows its own)
        !open && pics.length ? h(Thumbs, { pics }) : null), kept.current ? h('div', { className: 'dcd-flow-fold', 'data-shut': open ? undefined : '' }, h('div', { className: 'dcd-flow-clip' }, h('div', { className: 'dcd-flow-steps-body' }, items.map((it) => render(it, false, true))))) : null);
    }
    const Turn = React.memo(function Turn({ turn, last, openRuns, view, Native, props, quiet, lang }) {
        // the group the live line must sit under: the last run of the turn, whatever comes after it
        const lastRunItem = (() => { for (let i = turn.items.length - 1; i >= 0; i--)
            if (turn.items[i].type === 'run')
                return turn.items[i]; return null; })();
        // `nested`: drawn inside an opened group of steps, where the lines are a sequence and not a set
        // of timings
        const render = (it, live, nested = false) => {
            if (it.type === 'run')
                return h(Run, { key: it.key, run: it, live, turnLive: turn.open && it === lastRunItem, defaultOpen: openRuns, view, Native, props, quiet, lang });
            if (it.type === 'think')
                return h(Thought, { key: it.key, node: it.node, live: live && it.node.data && it.node.data.status !== 'settled', full: openRuns, plain: nested, useChat: props.useChat, lang });
            return h(NativeRows, { key: it.key, Native, props, quiet, lang, entries: [it.entry] });
        };
        // each image is previewed once per turn, on the first line that made or named it
        // (its URL carries the last call that touched it, so a redrawn image shows its latest version).
        // useMemo, not a render side effect: writing the items during render would run twice under
        // StrictMode and tie the pics to render order instead of the data.
        // the memo's value is not read: it exists for its side effect on `it.pics`
        React.useMemo(() => {
            const list = turn.items.filter((it) => it.type === 'run');
            const raw = new Map(); // imagesOf once per run, not twice
            for (const it of list)
                raw.set(it, imagesOf(it.rows, props.cwd));
            // Once a run has shown a picture it keeps showing it: appending a call to the fold must not
            // take one away again. A path's version is the one it was first seen with — the query is only
            // a cache-buster, so a later call that names the same file must not change the tile's URL
            // and reload it (a reload shows up as a blank tile and then a picture, i.e. as a blink).
            for (const it of list) {
                const keep = runPics.get(it.key) || new Map();
                for (const p of raw.get(it))
                    if (!keep.has(p.path))
                        keep.set(p.path, p.v);
                runPics.set(it.key, keep);
            }
            const seen = new Set();
            for (const it of list) {
                it.pics = [...runPics.get(it.key)].filter(([path]) => (seen.has(path) ? false : (seen.add(path), true)))
                    .map(([path, v]) => ({ path, v }));
            }
            // one picture per row: the first one its own call named (a row shows one tile, not a strip)
            const keys = new Set();
            const ids = new Set();
            for (const it of list) {
                for (const r of it.rows) {
                    keys.add(r.entry.key);
                    const id0 = callIdOf(r.node);
                    if (id0)
                        ids.add(id0);
                    const own = imagesOf([r], props.cwd);
                    if (own.length)
                        rowPics.set(r.entry.key, own[0]);
                    else
                        rowPics.delete(r.entry.key);
                    if (id0) {
                        if (own.length)
                            rowPicsById.set(id0, own[0]);
                        else
                            rowPicsById.delete(id0);
                    }
                    const words0 = rowText(r.node);
                    if (words0) {
                        if (own.length)
                            rowPicsByText.set(words0, own[0]);
                        else
                            rowPicsByText.delete(words0);
                    }
                }
            }
            // rows that scrolled out of the transcript take their tiles with them
            for (const k of [...rowPics.keys()])
                if (!keys.has(k))
                    rowPics.delete(k);
            for (const k of [...rowPicsById.keys()])
                if (!ids.has(k))
                    rowPicsById.delete(k);
            const texts = new Set();
            for (const it of list)
                for (const r of it.rows)
                    texts.add(rowText(r.node));
            for (const k of [...rowPicsByText.keys()])
                if (!texts.has(k))
                    rowPicsByText.delete(k);
            return list;
        }, [turn, props.cwd]);
        const top = stretches(turn.items);
        const w = words();
        // A turn that was stopped or failed is never folded: dsh keeps its process open for exactly
        // this reason, and a folded summary of work that was cut off is what makes an interrupt read
        // as a glitch.
        // A turn the reader sent a message into while it ran is folded like any other. dsh keeps those
        // open (`hasInterleavedInput`), and copying that left the turns a reader actually typed during
        // — several messages in one turn — permanently flat, which is the reported 「多条消息不收起」:
        // the stretch a reader wants out of the way is exactly the one they interrupted. Only the
        // stretch folds; the messages they typed stay, because they are rows and not steps.
        const stopped = !turn.open && (turn.reason === 'interrupted' || turn.reason === 'aborted');
        const failed = !turn.open && turn.reason === 'error';
        const keepOpen = stopped || failed;
        // an interrupted answer already ends with dsh's own 「已停止」 in its text
        const inlineStopped = turn.items.some((it) => it.node && it.node.data && it.node.data.status === 'interrupted');
        // dsh draws its own 「处理失败」/「超出 token」 row for those two endings (roleOf hands them over),
        // so our line must not say it a second time
        const dshEnded = turn.items.some((it) => it.node && (it.node.kind === 'turn-error' || it.node.kind === 'turn-max-tokens'));
        // what the live line says: the call in flight, else the answer streaming, else the model is
        // thinking. Read off the tail of the turn, never off the tail item alone — a thought row may
        // follow the group whose call is still running.
        const liveNow = (() => {
            for (let i = turn.items.length - 1; i >= 0; i--) {
                const it = turn.items[i];
                if (it.type === 'run') {
                    const r = [...it.rows].reverse().find((x) => x.role === 'tool' && toolState(x.node) === 'running');
                    return r ? { call: r } : {};
                }
                if (it.type === 'row' && it.node) {
                    // only the assistant's own text row can be mid-answer: the user's message is the last row
                    // for the first moments of every turn, and reading it as a streaming answer put
                    // 「输出中…」 on the line before the model had written a word. roleOf names that row 'text'.
                    const settled = it.node.data && it.node.data.status === 'settled';
                    if (it.role !== 'text')
                        return {};
                    return !settled && hasText(it.node) ? { streaming: true } : {};
                }
                // a thought still being written is what the line under the group is about: the node, not a
                // string read out of it down here — Live subscribes to it itself, so the words keep arriving
                if (it.type === 'think') {
                    const settled = it.node && it.node.data && it.node.data.status === 'settled';
                    return settled ? {} : { thought: it.node };
                }
            }
            return {};
        })();
        // one live line, and only for the turn that is running: the newest one
        // never blank while a turn runs: a call in flight, the answer streaming, or the thought being
        // written (its first words ride along) — every view says something, none of them says nothing
        // the line sits in the column of the work above it — the card rows when that work is opened,
        // the run/steps lines when it is not — and takes that column in every view: 标准 and 思考 must
        // not move it. Folded is no exception: a 思考 stretch folds sooner than a 标准 one (its thought
        // rows count), and dropping the indent there left the line on a full-width row of its own.
        const lastTop = top[top.length - 1];
        const liveIndent = !!lastTop && lastTop.type === 'steps';
        // keyed: the work above it grows and shrinks, and an unkeyed line was matched by position, so
        // it was unmounted and built again at every step boundary — which is exactly when it has to
        // keep the line it was showing (its carry) instead of coming back blank
        const liveLine = turn.open && last
            ? h(Live, { key: 'live', call: liveNow.call, streaming: liveNow.streaming, thought: liveNow.thought, indent: liveIndent, turnKey: turn.key, useChat: props.useChat, view })
            : null;
        const end = (failed && !dshEnded) || (stopped && !inlineStopped)
            ? h('div', { className: 'dcd-flow-end', 'data-failed': failed ? '' : undefined }, icon('stop'), h('span', null, failed ? w.turnFailed : w.stopped))
            : null;
        return h('section', { className: 'dcd-flow-turn', 'data-live': turn.open ? '' : undefined }, top.map((it, i) => {
            const tail = turn.open && last && i === top.length - 1;
            if (it.type !== 'steps')
                return render(it, false);
            const list = it.items;
            const lastLive = (j) => tail && j === list.length - 1;
            if (openRuns || keepOpen || list.length < (turn.open ? FOLD_OPEN : FOLD_CLOSED))
                return list.map((x, j) => render(x, lastLive(j)));
            // the counts, the line in flight, the whale row below: no more than those. The stretch
            // folds whole — the live line already says what is happening, so a row lifted out of the
            // fold would only repeat it
            return [h(Steps, { key: it.key, items: list, render, view })];
        }), liveLine, end);
        // A turn re-renders only when something in it moved. `layout` rebuilds every turn object on every
        // pass, so identity could never answer that question: `turn.sig` is mixed from each row's own
        // contribution — exactly what the rows below read — and a turn whose rows all stood still bails,
        // instead of the whole transcript being reconciled once per tool call, which a long session felt
        // as a hitch whenever work advanced.
    }, (a, b) => a.turn.sig === b.turn.sig && a.turn.open === b.turn.open && a.turn.reason === b.turn.reason
        && a.last === b.last && a.openRuns === b.openRuns && a.view === b.view && a.lang === b.lang
        && a.Native === b.Native && a.quiet === b.quiet && a.props.cwd === b.props.cwd
        && a.props.useChat === b.props.useChat && a.props.useSession === b.props.useSession);
    // the tail (dsh's running line + pending inputs) is the native flow with no rows; memoized so a
    // streamed token does not redraw it — RunningStatus subscribes to the running state on its own.
    // pendingInputs is NOT self-subscribing: the panel retires a submission echo once its durable
    // node lands and hands us a new array. Bailing over that change would freeze the echo on screen
    // as a second copy of the message just sent, so its identity is part of the comparison.
    const Tail = React.memo(function Tail({ Native, props, lang }) {
        return h(Native, { ...props, entries: [] });
    }, (a, b) => a.Native === b.Native && a.props.cwd === b.props.cwd && a.lang === b.lang
        && a.props.pendingInputs === b.props.pendingInputs
        && a.props.useChat === b.props.useChat && a.props.useSession === b.props.useSession);
    return { useQuiet, Turn, Tail };
}

// ===== src/lib/native.js
"use strict";
const NATIVE_CONTRACT = [
    { what: 'the chat column (turn list, rows, live line)', sel: '[data-chat-flow]' },
    { what: 'the scroll box (auto-load older, scroll anchors)', sel: '[data-conversation-scroll]' },
    { what: 'row kinds (user / thinking / command / tail)', sel: '[data-chat-flow-kind]' },
    {
        what: 'the user bubble (grey user bubble)',
        sel: '[class*="_bubble"]',
        signal: '[data-chat-flow-kind="user"]',
    },
    {
        what: 'the reply-action bar (copy / branch / ⋯)',
        sel: '[data-chat-flow-kind="turn-tail"] [class*="_actions"]',
        signal: '[data-chat-flow-kind="turn-tail"]',
    },
    {
        what: 'disclosure rows (thinking, tool and command cards)',
        sel: '[data-disclosure-row]',
        signal: '[data-chat-flow-kind="assistant-step"]',
    },
    {
        what: 'the plan dock (todo_write)',
        sel: '[data-testid="todo-panel"]',
        // only when a plan exists; the dock is not in the page otherwise, so it carries no signal
    },
];
/**
 * Check the list against the document and report what is missing. `document` is a parameter so a
 * test can hand in a stand-in. Returns the rows that are missing without any excuse for it.
 */
function probeNative(doc) {
    const missing = [];
    // not a chat page (settings, an empty session): nothing to judge
    if (!doc.querySelector('[data-chat-flow]'))
        return missing;
    for (const row of NATIVE_CONTRACT) {
        if (doc.querySelector(row.sel))
            continue;
        if (row.signal && !doc.querySelector(row.signal))
            continue;
        missing.push(row);
    }
    return missing;
}

// ===== src/styles/00-shared.scss
/* compiled from src/styles/00-shared.scss by build.mjs — edit the .scss, not this file */
const CSS_SHARED = "/*!\n * Styles for display-shared (parts/00-shared.ts): the base block every quiet summary line\n * shares (「命令 ×3 ›」, 「思考 4 秒 ›」, the plan card's 「已完成全部 N 项任务 ›」), the bundle's\n * motion keyframes, and the two motion switches (html[data-dcd-anim=\"off\"], reduced-motion).\n * $summary-heads is also used by styles/08-conversation-flow.scss, so both head shapes stay one button.\n */\n/* the quiet summary lines: one base block instead of five near-copies. padding-inline sits on\n   negative margin-inline, so the hover wash has room to breathe around the text without shifting\n   anything it sits behind (the line's visual edges stay where they were). */\n:is(.dcd-group-head, .dcd-group-now, .dcd-flow-head, .dcd-plan-sum) {\n  all: unset;\n  box-sizing: border-box;\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  max-width: 100%;\n  padding: 2px 6px;\n  margin-inline: -6px;\n  border-radius: 6px;\n  cursor: pointer;\n  font-size: var(--dsh-content-font-size, 14px);\n  line-height: calc(22px + var(--dsh-content-font-delta, 0px));\n  color: var(--dsw-alias-label-tertiary);\n  user-select: none;\n  -webkit-user-select: none;\n  transition: color 0.12s ease, background-color 0.12s ease;\n}\n\n:is(.dcd-group-head, .dcd-group-now, .dcd-flow-head, .dcd-plan-sum):hover {\n  color: var(--dsw-alias-label-secondary);\n  background: color-mix(in srgb, var(--dsw-alias-label-primary) 5%, transparent);\n}\n\n/* the press: a deeper wash for the moment the finger is down, so a click is felt before the fold moves */\n:is(.dcd-group-head, .dcd-group-now, .dcd-flow-head, .dcd-plan-sum):active {\n  background: color-mix(in srgb, var(--dsw-alias-label-primary) 9%, transparent);\n}\n\n:is(.dcd-group-head, .dcd-group-now, .dcd-flow-head, .dcd-plan-sum):focus-visible {\n  outline: 2px solid var(--dsw-alias-border-focus, #4d8cff);\n  outline-offset: 2px;\n}\n\n/* the bundle's motion keyframes: enters rise 4px, exits sink 2px, checks pop, turns just fade\n   (opacity only — anything taller fights the scroll anchoring that keeps the reading position) */\n@keyframes dcd-in {\n  from {\n    opacity: 0;\n    transform: translateY(4px);\n  }\n}\n@keyframes dcd-out {\n  to {\n    opacity: 0;\n    transform: translateY(2px);\n  }\n}\n@keyframes dcd-pop {\n  from {\n    opacity: 0;\n    transform: scale(0.55);\n  }\n}\n@keyframes dcd-turn-in {\n  from {\n    opacity: 0;\n  }\n}\n@media (prefers-reduced-motion: reduce) {\n  :is(.dcd-group-head, .dcd-group-now, .dcd-flow-head, .dcd-plan-sum) {\n    transition: none;\n  }\n}\nhtml[data-dcd-anim=off] :is(.dcd-group-head, .dcd-group-now, .dcd-flow-head, .dcd-plan-sum) {\n  transition: none;\n}"

// ===== src/styles/01-transcript-view.scss
/* compiled from src/styles/01-transcript-view.scss by build.mjs — edit the .scss, not this file */
const CSS_TRANSCRIPT_VIEW = "/*!\n * Styles for transcript-view (parts/01-transcript-view.ts): dsh's own thinking disclosure\n * restyled as a quiet 「思考 ›」 line with a muted body on a thin rule, and the 标准 view's\n * hiding of reasoning rows (driven by html[data-dcd-view], which the part sets).\n */\n/* thinking blocks read like the tool-group lines (「运行了 1 条命令 ›」): a quiet 「思考 ›」 header and a muted body\n   on a thin rule, instead of dsh's ^ chevron and full-size primary text */\n/* dsh pins the thinking header (sticky, opaque page colour): on a translucent background that reads as a white band */\n[data-variant=think] [data-disclosure-header] {\n  position: static !important;\n  background: transparent !important;\n  box-shadow: none !important;\n}\n\n[data-variant=think] [data-disclosure-row] {\n  display: inline-flex !important;\n  align-items: center;\n  gap: 8px !important;\n  width: auto !important;\n  min-height: 0 !important;\n  margin: 4px 0 2px;\n  padding: 2px 0 !important;\n  background: transparent !important;\n  font-size: var(--dsh-content-font-size, 14px) !important;\n  line-height: calc(22px + var(--dsh-content-font-delta, 0px)) !important;\n  color: var(--dsw-alias-label-tertiary) !important;\n  cursor: pointer;\n}\n\n[data-variant=think] [data-disclosure-row]:hover {\n  color: var(--dsw-alias-label-secondary) !important;\n}\n\n[data-variant=think] [data-disclosure-row] > [class*=_leading] {\n  display: none !important;\n}\n\n[data-variant=think] [data-disclosure-row] [class*=_title] {\n  color: inherit !important;\n  font-size: var(--dsh-content-font-size, 14px) !important;\n  font-weight: 400 !important;\n}\n\n[data-variant=think] [data-disclosure-row]::after {\n  content: \"\";\n  flex: none;\n  width: 12px;\n  height: 12px;\n  background: currentColor;\n  transition: transform 0.15s ease;\n  -webkit-mask: url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'%3E%3Cpath d='M4.5 2.5 8 6l-3.5 3.5' fill='none' stroke='black' stroke-width='1.4' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\") center/12px no-repeat;\n  mask: url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'%3E%3Cpath d='M4.5 2.5 8 6l-3.5 3.5' fill='none' stroke='black' stroke-width='1.4' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\") center/12px no-repeat;\n}\n\n[data-variant=think] [data-disclosure-row][aria-expanded=true]::after {\n  transform: rotate(90deg);\n}\n\n[data-variant=think] [class*=_thinkBody] {\n  margin: 2px 0 8px 1px !important;\n  padding: 2px 0 2px 14px !important;\n  border-left: 2px solid var(--dsw-alias-border-l2, rgba(127, 127, 127, 0.22));\n}\n\n[data-variant=think] [class*=_thinkBody] :is([class*=_markdown], p, li) {\n  font-size: calc(var(--dsh-content-font-size, 14px) - 0.5px) !important;\n  line-height: 1.7 !important;\n  color: var(--dsw-alias-label-secondary) !important;\n}\n\n[data-variant=think] [class*=_thinkBody] p {\n  margin: 0 0 0.5em !important;\n}\n\n/* Normal: hide the reasoning rows (the bottom running status still shows the agent is working) */\nhtml[data-dcd-view=normal] [data-conversation-scroll] [data-chat-flow-kind=assistant-step][data-chat-group-part=reasoning] {\n  display: none !important;\n}\n\n/* a process group left with nothing but hidden reasoning keeps no margin either */\nhtml[data-dcd-view=normal] [data-conversation-scroll] [data-step-process]:not(:has([data-chat-flow-kind]:not([data-chat-group-part=reasoning]))) {\n  display: none !important;\n}"

// ===== src/styles/02-transcript-polish.scss
/* compiled from src/styles/02-transcript-polish.scss by build.mjs — edit the .scss, not this file */
const CSS_TRANSCRIPT_POLISH = "/*!\n * Styles for transcript-polish (parts/02-transcript-polish.ts): the calmer turn header, the\n * reply-action row (per-button show/fold/hide markers, the ⋯ overflow and its menu), and the\n * bundle's own plugin page (motion row + the draggable 回复操作按钮 list).\n */\n/* calmer turn header: no rule under 已完成 · 用时 */\n[data-conversation-scroll] [data-chat-flow-kind=turn-process] button[data-turn-process] {\n  border-bottom-color: transparent !important;\n  box-shadow: none !important;\n}\n\n/* message-edit (@linxin666/dsh-client-ui-message-edit): its 编辑并重发 row sits at the end of the turn, far from\n   the message it forks; hide that row and offer the same action from the user message's own action bar */\n[data-dcd-act-fork-src] {\n  display: none !important;\n}\n\n.dcd-act-fork svg {\n  display: block;\n}\n\n/* reply-action row: tighter than dsh's 8px so the icons read as one cluster, like Codex */\n[data-chat-flow-kind=turn-tail] [class*=_actions] {\n  gap: 2px;\n}\n\n/* metadata reads last, split around the ⋯ overflow: usage chip, then ⋯, then time.\n   endInfo becomes display:contents so its children join the bar's flex order */\n[data-chat-flow-kind=turn-tail] [class*=_endInfo] {\n  display: contents !important;\n}\n\n[data-chat-flow-kind=turn-tail] [class*=_endInfo] > * {\n  order: 998;\n}\n\n[data-chat-flow-kind=turn-tail] [class*=_endInfo] > :first-child {\n  margin-left: 4px;\n}\n\n[data-chat-flow-kind=turn-tail] [class*=_endInfo] > [class*=_timeEnd] {\n  order: 1000;\n  margin-left: 2px;\n}\n\n[data-chat-flow-kind=turn-tail] [class*=_visuallyHidden] {\n  order: 900;\n}\n\n/* per-button display chosen in Settings: fold into the ⋯ menu, or hide outright */\n[data-dcd-act-fold] {\n  display: none !important;\n}\n\n[data-dcd-act-hide] {\n  display: none !important;\n}\n\n/* the ⋯ overflow: three fine dots, quieter than the action icons (Codex-style), between usage and time */\n.dcd-act-more {\n  color: var(--dsw-alias-label-tertiary);\n  order: 999;\n}\n\n.dcd-act-more:hover {\n  color: var(--dsw-alias-label-secondary);\n}\n\n.dcd-act-more svg {\n  display: block;\n}\n\n.dcd-act-menu {\n  box-sizing: border-box;\n  position: fixed;\n  z-index: 1100;\n  min-width: 180px;\n  padding: 6px;\n  border-radius: var(--dsw-radius-lg, 14px);\n  background: var(--dsw-specific-menu, var(--dsw-alias-bg-layer-2));\n  backdrop-filter: var(--dsw-menu-backdrop-filter);\n  -webkit-backdrop-filter: var(--dsw-menu-backdrop-filter);\n  box-shadow: var(--dsw-elevation-prominent, 0 8px 28px rgba(0, 0, 0, 0.18));\n  color: var(--dsw-alias-label-primary);\n  font-size: 13.5px;\n  line-height: 20px;\n  animation: dcd-act-in 0.14s cubic-bezier(0.2, 0.8, 0.2, 1) both;\n}\n\n@keyframes dcd-act-in {\n  from {\n    opacity: 0;\n    transform: translateY(4px);\n  }\n}\n/* the exit: closeMenu() holds the menu one beat under data-closing, then removes it */\n.dcd-act-menu[data-closing] {\n  animation: dcd-act-out 0.12s ease-in forwards;\n}\n\n@keyframes dcd-act-out {\n  to {\n    opacity: 0;\n    transform: translateY(4px);\n  }\n}\n@media (prefers-reduced-motion: reduce) {\n  .dcd-act-menu {\n    animation: none;\n  }\n}\nhtml[data-dcd-anim=off] .dcd-act-menu {\n  animation: none;\n}\n\n.dcd-act-menu button {\n  display: flex;\n  align-items: center;\n  gap: 10px;\n  width: 100%;\n  min-height: 32px;\n  padding: 6px 10px;\n  border: 0;\n  border-radius: 9px;\n  background: transparent;\n  color: inherit;\n  font: inherit;\n  text-align: left;\n  cursor: pointer;\n  white-space: nowrap;\n}\n\n.dcd-act-menu button:hover, .dcd-act-menu button:focus-visible {\n  background: var(--dsw-alias-interactive-bg-hover);\n}\n\n.dcd-act-menu button:focus-visible {\n  outline: none;\n}\n\n.dcd-act-menu button svg {\n  flex: none;\n  width: 15px;\n  height: 15px;\n}\n\n/* the bundle's own plugin page (侧边栏 › 插件 › 已安装 › 对话显示) */\n.dcd-act-page {\n  display: flex;\n  flex-direction: column;\n  color: var(--dsw-alias-label-primary);\n  font-size: 13.5px;\n  line-height: 20px;\n}\n\n.dcd-act-note {\n  display: flex;\n  gap: 8px;\n  align-items: flex-start;\n  padding: 10px 12px;\n  border-radius: 10px;\n  background: color-mix(in srgb, var(--dsw-alias-label-primary) 5%, transparent);\n  color: var(--dsw-alias-label-secondary);\n  font-size: 12.5px;\n  line-height: 19px;\n}\n\n.dcd-act-note svg {\n  flex: none;\n  width: 14px;\n  height: 14px;\n  margin-top: 2px;\n  color: var(--dsw-alias-label-tertiary);\n}\n\n.dcd-act-head {\n  margin: 16px 0 2px;\n  font-size: 14px;\n  font-weight: 600;\n}\n\n.dcd-act-desc {\n  margin: 0 0 6px;\n  color: var(--dsw-alias-label-tertiary);\n  font-size: 12px;\n  line-height: 18px;\n}\n\n.dta-list {\n  padding: 0;\n}\n\n.dta-item {\n  display: flex;\n  align-items: center;\n  gap: 10px;\n  padding: 8px 10px;\n  border-radius: 10px;\n}\n\n.dta-item:hover {\n  background: var(--dsw-alias-interactive-bg-hover);\n}\n\n.dta-item[data-dragging] {\n  background: var(--dsw-alias-interactive-bg-hover);\n  box-shadow: var(--dsw-elevation-prominent, 0 4px 14px rgba(0, 0, 0, 0.12));\n}\n\n.dta-ico {\n  flex: none;\n  width: 16px;\n  height: 16px;\n  color: var(--dsw-alias-label-secondary);\n  display: flex;\n  align-items: center;\n  justify-content: center;\n}\n\n.dta-ico svg {\n  width: 15px;\n  height: 15px;\n}\n\n.dta-lbl {\n  flex: 1 1 auto;\n  min-width: 0;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.dta-mode, .dta-grip {\n  flex: none;\n  width: 28px;\n  height: 28px;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  border: 0;\n  border-radius: 8px;\n  background: transparent;\n  color: var(--dsw-alias-label-tertiary);\n  cursor: pointer;\n}\n\n.dta-mode:hover, .dta-grip:hover {\n  background: var(--dsw-alias-interactive-bg-hover);\n  color: var(--dsw-alias-label-primary);\n}\n\n.dta-mode svg {\n  width: 15px;\n  height: 15px;\n}\n\n.dta-grip svg {\n  width: 14px;\n  height: 14px;\n}\n\n.dta-grip {\n  cursor: grab;\n  touch-action: none;\n  user-select: none;\n  -webkit-user-select: none;\n}\n\n.dta-item[data-dragging] {\n  user-select: none;\n  -webkit-user-select: none;\n}\n\n.dta-item[data-dragging] .dta-grip {\n  cursor: grabbing;\n}\n\n.dta-foot {\n  padding: 8px 10px 0;\n  color: var(--dsw-alias-label-tertiary);\n  font-size: 12px;\n}"

// ===== src/styles/03-tool-groups.scss
/* compiled from src/styles/03-tool-groups.scss by build.mjs — edit the .scss, not this file */
const CSS_TOOL_GROUPS = "/*!\n * Styles for tool-groups (parts/03-tool-groups.ts): the group summary line's own pieces, the\n * bordered card a run opens into (one row per call, dividers, › chevron), the terminal / file /\n * output bands inside an opened row, the per-row picture tile and its lightbox, and the\n * conversation-flow card rules (08 draws the rows, these dress them). The selectors the part queries\n * the DOM with are passed in at runtime as placeholders, so CSS and queries can never drift.\n */\n/* 查看 icon: open-in-panel arrow */\n/* the one-line summary, e.g. 命令 ×3 › (base look + hover wash: display-shared) */\n.dcd-group-head {\n  margin-block: 4px 6px;\n}\n\n.dcd-group-label {\n  min-width: 0;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.dcd-group-time {\n  flex: none;\n  font-variant-numeric: tabular-nums;\n}\n\n.dcd-group-time:empty, .dcd-group-err:empty {\n  display: none;\n}\n\n.dcd-group-err {\n  flex: none;\n  color: var(--dsw-alias-label-danger, #e5484d);\n}\n\n.dcd-group-chev {\n  flex: none;\n  display: grid;\n  place-items: center;\n  transition: transform 0.15s ease;\n}\n\n.dcd-group-chev svg {\n  display: block;\n}\n\n.dcd-group-head[aria-expanded=true] .dcd-group-chev {\n  transform: rotate(90deg);\n}\n\n.dcd-group-live {\n  flex: none;\n  display: none;\n  width: 12px;\n  height: 12px;\n  position: relative;\n}\n\n.dcd-group-head[data-live] .dcd-group-live {\n  display: inline-block;\n}\n\n.dcd-group-head[data-live] {\n  color: var(--dsw-alias-label-secondary);\n}\n\n/* the running call previews below the counts line while the fold stays closed\n   (8px + display-shared's 6px padding = the 14px indent the line always had) */\n.dcd-group-now {\n  margin-block: 2px 4px;\n  margin-left: 8px;\n  color: var(--dsw-alias-label-secondary);\n  animation: dcd-in 0.16s cubic-bezier(0.2, 0.8, 0.2, 1);\n}\n\n.dcd-group-now:hover {\n  color: var(--dsw-alias-label-primary);\n}\n\n.dcd-group-now .dcd-group-live {\n  display: inline-block;\n}\n\n.dcd-group-live i {\n  position: absolute;\n  width: 4px;\n  height: 4px;\n  border-radius: 50%;\n  corner-shape: round;\n  background: var(--dsw-alias-state-business-primary, #4d6bfe);\n  animation: dcd-group-pulse 1.2s ease-in-out infinite;\n}\n\n.dcd-group-live i:nth-child(1) {\n  left: 0;\n  top: 0;\n}\n\n.dcd-group-live i:nth-child(2) {\n  right: 0;\n  top: 0;\n  animation-delay: 0.3s;\n}\n\n.dcd-group-live i:nth-child(3) {\n  right: 0;\n  bottom: 0;\n  animation-delay: 0.6s;\n}\n\n.dcd-group-live i:nth-child(4) {\n  left: 0;\n  bottom: 0;\n  animation-delay: 0.9s;\n}\n\n@keyframes dcd-group-pulse {\n  0%, 100% {\n    opacity: 0.25;\n  }\n  50% {\n    opacity: 1;\n  }\n}\n@media (prefers-reduced-motion: reduce) {\n  .dcd-group-live i {\n    animation: none;\n    opacity: 0.8;\n  }\n}\n/* images the calls looked at (read_image): small thumbnails at the right end of the line, as in the quiet style;\n   a click opens dsh's own viewer */\n.dcd-group-thumbs {\n  flex: none;\n  display: none;\n  align-items: center;\n  gap: 4px;\n  margin-left: auto;\n  padding-left: 12px;\n}\n\n.dcd-group-thumbs:not(:empty) {\n  display: inline-flex;\n}\n\n.dcd-group-thumb {\n  all: unset;\n  box-sizing: border-box;\n  display: block;\n  width: 44px;\n  height: 30px;\n  border-radius: 6px;\n  overflow: hidden;\n  cursor: zoom-in;\n  border: 0.5px solid var(--dsw-alias-border-l2);\n  background: var(--dsw-alias-bg-base);\n  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);\n  transition: transform 0.12s ease, box-shadow 0.12s ease;\n}\n\n.dcd-group-thumb:hover {\n  transform: translateY(-1px);\n  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.12);\n}\n\n.dcd-group-thumb:focus-visible {\n  outline: 2px solid var(--dsw-alias-border-focus, #4d8cff);\n  outline-offset: 1px;\n}\n\n.dcd-group-thumb img {\n  display: block;\n  width: 100%;\n  height: 100%;\n  object-fit: cover;\n  opacity: 0;\n  transition: opacity 0.18s ease;\n}\n\n.dcd-group-thumb[data-ok] img {\n  opacity: 1;\n}\n\n.dcd-group-more {\n  flex: none;\n  font-size: 12px;\n  color: var(--dsw-alias-label-tertiary);\n  padding-left: 2px;\n}\n\n/* +12px pays back the head's negative margin-inline, so a full-width head still spans the column */\n.dcd-group-head:has(.dcd-group-thumbs:not(:empty)) {\n  width: calc(100% + 12px);\n}\n\n.dcd-group-head:has(.dcd-group-thumbs:not(:empty)) .dcd-group-label {\n  flex: 0 1 auto;\n}\n\n/* dsh's image viewer has no backdrop: dim and blur the page behind it, as the quiet style does */\n[role=dialog][class*=_backdrop]:has(> [class*=_stage] img) {\n  background: rgba(20, 20, 19, 0.62) !important;\n  -webkit-backdrop-filter: blur(6px);\n  backdrop-filter: blur(6px);\n  animation: dcd-group-fade 0.15s ease-out;\n}\n\n[role=dialog][class*=_backdrop] > [class*=_stage] img {\n  border-radius: 10px;\n  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.35);\n}\n\n@keyframes dcd-group-fade {\n  from {\n    opacity: 0;\n  }\n  to {\n    opacity: 1;\n  }\n}\n/* that dim is decoration too, so it follows the same two switches as everything else\n   (animation is only ever set on the :has() variant above, so the shorter selector is enough) */\n@media (prefers-reduced-motion: reduce) {\n  [role=dialog][class*=_backdrop] {\n    animation: none;\n  }\n}\nhtml[data-dcd-anim=off] [role=dialog][class*=_backdrop] {\n  animation: none;\n}\n\n/* a read_image row opened only so its image loads: keep its body out of sight until the user opens it */\n[data-dcd-group-imgauto] [class*=_bodyWrap] {\n  display: none !important;\n}\n\n[data-dcd-group-imgauto] __DCG_ROW__[aria-expanded=true]::after {\n  transform: none !important;\n}\n\n/* a finished turn's 「已完成，用时 X 秒」 line: the quiet style has none (it stays while the turn runs) */\n[data-dcd-group-done] {\n  display: none !important;\n}\n\n/* plan updates: shown by the plan card instead */\n[data-dcd-group-plan] {\n  display: none !important;\n}\n\n/* folded */\n[data-dcd-group-member][data-dcd-group-hide]:not([data-dcd-group-head]) {\n  display: none !important;\n}\n\n[data-dcd-group-head][data-dcd-group-hide] __DCG_NODE__ {\n  display: none !important;\n}\n\n/* opening: the card's rows settle in — a short cascade inside a conversation-flow card, where the rows\n   are direct children (in the native mode they are interleaved with the rest of the flow, so all\n   rise together). Closing: rows fade before display:none lands — sync() holds them one beat under\n   data-dcd-group-closing, and reopening cancels the fade by dropping the attribute again.\n   backwards, not both: the staggered rows need their first keyframe held across the delay, but\n   filling forwards would keep a finished Animation pinned to every row for the life of the page. */\n__DCG_OPEN__ {\n  animation: dcd-in 0.16s cubic-bezier(0.2, 0.8, 0.2, 1) backwards;\n}\n\n.dcd-flow-card > :nth-child(2) {\n  animation-delay: 0.02s;\n}\n\n.dcd-flow-card > :nth-child(3) {\n  animation-delay: 0.045s;\n}\n\n.dcd-flow-card > :nth-child(4) {\n  animation-delay: 0.07s;\n}\n\n[data-dcd-group-closing] {\n  animation: dcd-out 0.13s ease-in forwards !important;\n}\n\n@media (prefers-reduced-motion: reduce) {\n  __DCG_OPEN__, .dcd-group-now, [data-dcd-group-closing] {\n    animation: none;\n  }\n  .dcd-group-thumb img {\n    transition: none;\n    opacity: 1;\n  }\n}\nhtml[data-dcd-anim=off] :is(__DCG_OPEN__, .dcd-group-now, [data-dcd-group-closing]) {\n  animation: none;\n}\n\nhtml[data-dcd-anim=off] .dcd-group-thumb img {\n  transition: none;\n  opacity: 1;\n}\n\n/* open: one bordered card, a row per call, dividers between rows */\n__DCG_OPEN__:not([data-dcd-group-first], .dcd-flow-card > :first-child) {\n  margin-top: 0 !important;\n}\n\n__DCG_OPEN__ __DCG_CALL__ {\n  border: 1px solid var(--dsw-alias-border-l2);\n  border-top-width: 0;\n  border-radius: 0 !important;\n  overflow: hidden;\n}\n\n__DCG_OPEN__:is([data-dcd-group-first], .dcd-flow-card > :first-child) __DCG_CALL__ {\n  border-top-width: 1px;\n  border-top-left-radius: 12px !important;\n  border-top-right-radius: 12px !important;\n}\n\n__DCG_OPEN__:is([data-dcd-group-last], .dcd-flow-card > :last-child) __DCG_CALL__ {\n  border-bottom-left-radius: 12px !important;\n  border-bottom-right-radius: 12px !important;\n}\n\n__DCG_OPEN__ __DCG_ROW__ {\n  box-sizing: border-box;\n  min-height: 44px !important;\n  padding: 10px 24px !important;\n  gap: 8px !important;\n  border-radius: 0 !important;\n  font-size: var(--dsh-content-font-size, 14px) !important;\n  line-height: calc(22px + var(--dsh-content-font-delta, 0px)) !important;\n  color: var(--dsw-alias-label-secondary) !important;\n  background: transparent;\n}\n\n__DCG_OPEN__ __DCG_ROW__:hover {\n  background: color-mix(in srgb, var(--dsw-alias-label-primary) 4%, transparent) !important;\n}\n\n__DCG_OPEN__ __DCG_ROW__ [class*=_leading] {\n  display: none !important;\n}\n\n__DCG_OPEN__ __DCG_ROW__ [class*=_text_] {\n  font-size: var(--dsh-content-font-size, 14px) !important;\n  line-height: calc(22px + var(--dsh-content-font-delta, 0px)) !important;\n}\n\n__DCG_OPEN__ __DCG_ROW__::after {\n  content: \"\";\n  flex: none;\n  width: 12px;\n  height: 12px;\n  margin-left: auto;\n  background: var(--dsw-alias-label-tertiary);\n  -webkit-mask: __DCG_CHEV_MASK__ center/12px no-repeat;\n  mask: __DCG_CHEV_MASK__ center/12px no-repeat;\n  transition: transform 0.15s ease;\n}\n\n__DCG_OPEN__ __DCG_ROW__[aria-expanded=true]::after {\n  transform: rotate(90deg);\n}\n\n/* commands: the description alone, like the quiet style — but only once there IS a description. While the\n   call is still preparing, dsh has no arguments yet, so the row has no summary to fall back on and\n   hiding the title as well left the card ending in a bare 「>_」 prompt. The command shows until the\n   description lands, then swaps to it. */\n__DCG_OPEN__ :is([data-variant=bash], [data-sample=bash], [data-tool=bash], [data-tool=pwsh]):has([class*=_summary]:not(:empty)) :is([class$=_title], [class*=\"_title \"], [class$=_sep], [class*=\"_sep \"]) {\n  display: none !important;\n}\n\n__DCG_OPEN__ :is([data-variant=bash], [data-sample=bash], [data-tool=bash], [data-tool=pwsh]) [class*=_summary] {\n  color: var(--dsw-alias-label-secondary) !important;\n}\n\n/* the +N / −N of an edit row: dsh colours them only while the row is hovered (or open), so a\n   closed card reads as one flat grey line. Green and red always — the counts are the one thing\n   that says how big the edit was, and a colour that appears only under the cursor is a colour\n   nobody sees. (dsh's own rule resets them to inherit under a file-link hover; !important wins.) */\n__DCG_OPEN__ [class*=_diffAdded] {\n  color: var(--dsw-alias-state-success-primary, #1a7f37) !important;\n}\n\n__DCG_OPEN__ [class*=_diffRemoved] {\n  color: var(--dsw-alias-state-error-primary, #cf222e) !important;\n}\n\n/* the opened input / output view: a full-width grey band under the row, split off by a hairline\n   (no second rounded box inside the card), text aligned with the row text */\n__DCG_OPEN__ [class*=_bodyWrap] {\n  box-sizing: border-box;\n  padding: 0 !important;\n  gap: 0 !important;\n  position: relative;\n}\n\n/* the band is a darker well than the card so command and output stand apart; a theme sets --dcd-band */\n/* dsh-claude-theme still overrides --dtg-band: read it first, so glass and band stay one colour */\nbody {\n  --dcd-band:var(--dtg-band,rgba(15,23,42,.045));\n}\n\nbody[data-ds-dark-theme] {\n  --dcd-band:var(--dtg-band,rgba(0,0,0,.28));\n}\n\n__DCG_OPEN__ [class*=_bodyWrap] > :not([class*=_inspectButton]) {\n  margin: 0 !important;\n  max-width: 100%;\n  box-sizing: border-box;\n  border: 0 !important;\n  border-top: 1px solid var(--dsw-alias-border-l1) !important;\n  border-radius: 0 !important;\n  box-shadow: none !important;\n  background: var(--dcd-band) !important;\n}\n\n/* dsh's 查看 button: one floating chip in the band's bottom-right corner for every kind of detail\n   (command output, file preview…). Frosted, hairline border, icon + label; fades in on hover. */\n__DCG_OPEN__ [class*=_bodyWrap] > [class*=_inspectButton] {\n  position: absolute !important;\n  z-index: 2;\n  margin: 0 !important;\n  right: 12px;\n  bottom: 10px;\n  display: inline-flex !important;\n  align-items: center;\n  gap: 5px;\n  height: 24px;\n  padding: 0 9px 0 7px !important;\n  font-size: 12px !important;\n  line-height: 24px !important;\n  font-weight: 500;\n  color: var(--dsw-alias-label-secondary) !important;\n  border: 0.5px solid var(--dsw-alias-border-l2) !important;\n  border-radius: 7px !important;\n  background: color-mix(in srgb, var(--dsw-alias-bg-base, #fff) 82%, transparent) !important;\n  -webkit-backdrop-filter: blur(8px) saturate(1.4);\n  backdrop-filter: blur(8px) saturate(1.4);\n  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06), 0 2px 8px rgba(0, 0, 0, 0.06) !important;\n  opacity: 0;\n  transform: translateY(2px);\n  transition: opacity 0.15s ease, transform 0.15s ease, color 0.12s, background-color 0.12s;\n}\n\n__DCG_OPEN__ [class*=_bodyWrap] > [class*=_inspectButton] > svg {\n  display: none !important;\n}\n\n__DCG_OPEN__ [class*=_bodyWrap] > [class*=_inspectButton]::before {\n  content: \"\";\n  flex: none;\n  width: 13px;\n  height: 13px;\n  background: currentColor;\n  -webkit-mask: url(\"data:image/svg+xml,%3Csvg%20xmlns%3D'http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg'%20viewBox%3D'0%200%2016%2016'%20fill%3D'none'%20stroke%3D'black'%20stroke-width%3D'1.5'%20stroke-linecap%3D'round'%20stroke-linejoin%3D'round'%3E%3Cpath%20d%3D'M9.5%202.75h3.75V6.5M13.25%202.75%208%208M6.5%203.25H4.25a1.5%201.5%200%200%200-1.5%201.5v7a1.5%201.5%200%200%200%201.5%201.5h7a1.5%201.5%200%200%200%201.5-1.5V9.5'%2F%3E%3C%2Fsvg%3E\") center/13px 13px no-repeat;\n  mask: url(\"data:image/svg+xml,%3Csvg%20xmlns%3D'http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg'%20viewBox%3D'0%200%2016%2016'%20fill%3D'none'%20stroke%3D'black'%20stroke-width%3D'1.5'%20stroke-linecap%3D'round'%20stroke-linejoin%3D'round'%3E%3Cpath%20d%3D'M9.5%202.75h3.75V6.5M13.25%202.75%208%208M6.5%203.25H4.25a1.5%201.5%200%200%200-1.5%201.5v7a1.5%201.5%200%200%200%201.5%201.5h7a1.5%201.5%200%200%200%201.5-1.5V9.5'%2F%3E%3C%2Fsvg%3E\") center/13px 13px no-repeat;\n}\n\n__DCG_OPEN__ [class*=_bodyWrap]:hover > [class*=_inspectButton], __DCG_OPEN__ [class*=_bodyWrap] > [class*=_inspectButton]:focus-visible {\n  opacity: 1;\n  transform: none;\n}\n\n__DCG_OPEN__ [class*=_bodyWrap] > [class*=_inspectButton]:hover {\n  color: var(--dsw-alias-label-primary) !important;\n  background: var(--dsw-alias-bg-base, #fff) !important;\n}\n\n/* ---- terminal: 「$ command」 + output well. Shared by real runs and by the terminal a never-ran\n   call gets (fixCommandInput), so both look and behave identically. ---- */\n/* the vars dsh's terminalBody sets; a never-ran call's terminal has no terminalBody ancestor */\n__DCG_OPEN__ [class*=_terminal] {\n  padding: 0 !important;\n  overflow: hidden !important;\n  --dsl-terminal-font:var(--dsw-font-markdown-code-block-small);\n  --dsl-terminal-line-height:18px;\n  --dsl-terminal-output-max-height:224px;\n  --dsl-terminal-command-whitespace:pre-wrap;\n}\n\n__DCG_OPEN__ [class*=_terminal] > [class*=_header_] {\n  margin: 0 !important;\n  padding: 8px 16px !important;\n  min-height: 0 !important;\n  border-bottom: 1px solid var(--dsw-alias-border-l1) !important;\n  border-radius: 0 !important;\n  background: transparent !important;\n}\n\n__DCG_OPEN__ [class*=_terminal] [class*=_cwd_], __DCG_OPEN__ [class*=_terminal] [class*=_runState] {\n  display: none !important;\n}\n\n/* a never-ran block built on the fallback classes (no native terminal was mounted to sample) has no\n   native header cap; give it the same 150px cap + inner scroll a real terminal's command area has */\n__DCG_OPEN__ [class*=_terminal][data-dcd-group-fb] > [class*=_header_] {\n  max-height: 150px;\n  overflow-y: auto;\n  scrollbar-width: thin;\n  scrollbar-color: var(--dsw-alias-border-l2) transparent;\n}\n\n/* one 「$」 per command: dsh splits a multi-line command into prompt lines (continuation lines get no\n   prompt); a never-ran command is one wrapping span, so it also gets exactly one */\n__DCG_OPEN__ [class*=_terminal] [class*=_command_] {\n  display: block;\n  white-space: pre-wrap;\n  word-break: break-word;\n  font-size: calc(var(--dsh-code-font-size, 11px) + 1px) !important;\n  line-height: calc(18px + var(--dsh-code-font-delta, 0px)) !important;\n  color: var(--dsw-alias-label-primary) !important;\n}\n\n__DCG_OPEN__ [class*=_terminal] [class*=_command_]::before {\n  content: \"$ \";\n  color: var(--dsw-alias-label-tertiary);\n}\n\n__DCG_OPEN__ [class*=_terminal] [class*=_promptLine_] ~ [class*=_promptLine_] [class*=_command_]::before {\n  content: none;\n}\n\n/* output: capped height, scrolls inside */\n__DCG_OPEN__ [class*=_terminal] > [class*=_output_] {\n  margin: 0 !important;\n  padding: 8px 16px 12px !important;\n  max-height: clamp(180px, 34vh, 420px) !important;\n  overscroll-behavior: contain;\n  overflow-y: auto !important;\n  overflow-x: hidden !important;\n  color: var(--dsw-alias-label-primary) !important;\n  scrollbar-width: thin;\n  scrollbar-color: var(--dsw-alias-border-l2) transparent;\n}\n\n__DCG_OPEN__ [class*=_terminal] > [class*=_output_] [class*=_line_] {\n  font-size: calc(var(--dsh-code-font-size, 11px) + 0.5px) !important;\n  line-height: calc(17px + var(--dsh-code-font-delta, 0px)) !important;\n  color: inherit !important;\n}\n\n/* copy: plain text, no dsh fill behind it */\n__DCG_OPEN__ [class*=_terminal] [class*=_copyButton] {\n  font-size: 12px !important;\n  line-height: 18px !important;\n  color: var(--dsw-alias-label-tertiary) !important;\n  min-width: 28px;\n  text-align: right;\n  background: transparent !important;\n  border: 0 !important;\n  box-shadow: none !important;\n}\n\n__DCG_OPEN__ [class*=_terminal] [class*=_copyButton]:hover {\n  color: var(--dsw-alias-label-secondary) !important;\n}\n\n/* The whale row is the third line of the live block conversation-flow draws (counts / the call in flight /\n   this row): give it no flow gap and no hairline of its own, so the three lines read as one block\n   instead of a status row parked under the transcript */\n[data-chat-running] {\n  --dsh-chat-flow-gap:0px!important;\n}\n\n[data-chat-running] > [class*=_runningDivider] {\n  display: none !important;\n}\n\n[data-chat-running] [class*=_runningContent] {\n  margin-top: 0 !important;\n  height: auto !important;\n  min-height: calc(26px + var(--dsh-content-font-delta, 0px));\n}\n\n/* a call that never started: tool name instead of the raw error text (the error stays in the body / tooltip) */\n[data-dcd-group-title] {\n  font-size: 0 !important;\n  letter-spacing: 0 !important;\n}\n\n[data-dcd-group-title]::before {\n  content: attr(data-dcd-group-title);\n  font-size: var(--dsh-content-font-size, 14px);\n}\n\n/* a failed call says so once, quietly: plain red 失败 / Failed before the › (dsh keeps its own word\n   visually hidden). dsh's 「• 退出码 1」 chip on the row goes; the exit code stays, as plain text, in\n   the command's own header once the row is opened */\n__DCG_OPEN__ __DCG_ROW__[data-state=error]::before {\n  content: \"失败\";\n  order: 2;\n  flex: none;\n  margin-left: auto;\n  font-size: var(--dsh-content-font-size, 14px);\n  line-height: calc(22px + var(--dsh-content-font-delta, 0px));\n  color: var(--dsw-alias-label-danger, #e5484d);\n}\n\n__DCG_OPEN__ __DCG_ROW__[data-state=error] [class*=_badge] {\n  display: none !important;\n}\n\n__DCG_OPEN__ [class*=_terminal] [class*=_header_] [class*=_status_] {\n  padding: 0 !important;\n  background: transparent !important;\n  box-shadow: none !important;\n  font-size: calc(var(--dsh-code-font-size, 11px) + 0.5px) !important;\n  color: var(--dsw-alias-label-danger, #e5484d) !important;\n  opacity: 0.85;\n}\n\nhtml[lang^=en] __DCG_OPEN__ __DCG_ROW__[data-state=error]::before {\n  content: \"Failed\";\n}\n\n__DCG_OPEN__ __DCG_ROW__[data-state=error]::after {\n  order: 3;\n  margin-left: 8px;\n}\n\n/* any other tool's result (交付文件 · Presented …): the same band, not dsh's rounded #232324 slab */\n__DCG_OPEN__ [class*=_root]:has(> pre[class*=_output]) {\n  padding: 0 !important;\n  border-top: 1px solid var(--dsw-alias-border-l1) !important;\n  background: var(--dcd-band) !important;\n}\n\n__DCG_OPEN__ [class*=_root] > pre[class*=_output] {\n  margin: 0 !important;\n  padding: 8px 16px 10px !important;\n  border: 0 !important;\n  border-radius: 0 !important;\n  background: transparent !important;\n  box-shadow: none !important;\n  font-size: calc(var(--dsh-code-font-size, 11px) + 0.5px) !important;\n  line-height: calc(17px + var(--dsh-code-font-delta, 0px)) !important;\n  color: var(--dsw-alias-label-secondary) !important;\n  max-height: clamp(160px, 30vh, 360px);\n  overflow: auto;\n  overscroll-behavior: contain;\n  scrollbar-width: thin;\n  scrollbar-color: var(--dsw-alias-border-l2) transparent;\n}\n\n__DCG_OPEN__ [class*=_root]:has(> pre[class*=_output]) > button[class*=_inspect] {\n  margin: 0 16px 10px !important;\n  padding: 2px 0 !important;\n}\n\n/* file preview (读取 etc.): same band, header and body on the row's 16px inset */\n__DCG_OPEN__ [class*=_bodyWrap] > [class*=_card_] > [class*=_header_] {\n  padding: 8px 16px 6px !important;\n  background: transparent !important;\n}\n\n/* every opened body is a reading pane, not a page: capped against the viewport so a long file or a\n   long thought cannot own the screen, scrolls inside itself, and hands the wheel back at its end */\n__DCG_OPEN__ [class*=_bodyWrap] > [class*=_card_] > [class*=_body_] {\n  padding: 4px 16px 12px !important;\n  max-height: clamp(200px, 40vh, 520px);\n  overflow: auto;\n  overscroll-behavior: contain;\n  scrollbar-width: thin;\n  scrollbar-color: var(--dsw-alias-border-l2) transparent;\n}\n\n/* a failed-argument call keeps its React-owned ioCard in the DOM (removing a child React still\n   references makes its next render throw) and hides it while our terminal stands beside it */\n[data-dcd-group-fb-src] {\n  display: none !important;\n}\n\n/* the picture a row's own call named, at the right end of the row: a real thumb you can click to see\n   the file full size. It is appended only after the file has decoded, so a bogus path leaves an\n   ordinary row behind instead of a broken frame. React may reconcile the row's children and drop our\n   node; the sweep in start() puts it back, and it is idempotent. */\n.dcd-group-rowthumb {\n  flex: none;\n  order: 8;\n  width: 30px;\n  height: 30px;\n  margin-left: auto;\n  margin-right: 6px;\n  border-radius: 5px;\n  border: 1px solid var(--dsw-alias-border-l2);\n  object-fit: cover;\n  cursor: zoom-in;\n  background: var(--dsw-alias-bg-layer-2, var(--dsw-alias-bg-base, transparent));\n}\n\n.dcd-group-rowthumb[data-state=loading] {\n  opacity: 0;\n  pointer-events: none;\n}\n\n.dcd-group-rowthumb:hover {\n  filter: brightness(1.06);\n}\n\n/* the lightbox a row thumb opens: ours, so it works without reaching into dsh's primitives */\n.dcd-group-peek {\n  position: fixed;\n  inset: 0;\n  z-index: 2147483000;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  padding: 4vh 4vw;\n  background: color-mix(in srgb, #000 62%, transparent);\n  cursor: zoom-out;\n}\n\n.dcd-group-peek img {\n  max-width: 92vw;\n  max-height: 92vh;\n  border-radius: 8px;\n  box-shadow: 0 18px 60px rgba(0, 0, 0, 0.45);\n}\n\n/* the tile takes the chevron's job (the auto margin) while it is there, and both are ordered after\n   the words, so the picture sits at the right edge with the chevron 6px behind it.\n   IMPORTANT is load-bearing: the chevron rule is OPEN ROW::after, four attribute selectors deep, so an\n   unscoped margin-left:0 here loses and BOTH auto margins then split the free space — the picture parks\n   in the middle of the row with a gap before the chevron. */\n[data-dcd-group-pic]::after {\n  order: 9;\n  margin-left: 0 !important;\n}\n\n/* a picture's body has dsh's own margin of 4px around it and nothing else, because in native mode the\n   row above it is a card of its own; inside our card the body is flush with the border, so it gets the\n   same 24px the row's words have, and a little air above and below the preview and its caption.\n   the caption is a child of the body (body > [preview slot, meta]), so the padding belongs to the\n   body alone — padding both put the file name a second indentation step to the right of its picture */\n.dcd-flow-card [data-chat-call-id] [class*=_imageBody] {\n  padding-inline: 24px !important;\n  margin-block: 8px 12px !important;\n}\n\n.dcd-flow-card [data-chat-call-id] [class*=_imageBody] :is([class*=_imageMeta], [class*=_imageExtra]) {\n  padding-inline: 0 !important;\n  margin-block: 4px 0 !important;\n}\n\n.dcd-flow-card [data-chat-call-id] > :is([class*=_imageMeta], [class*=_imageExtra]) {\n  padding-inline: 24px !important;\n  margin-block: 8px 12px !important;\n}\n\n.dcd-flow-card [data-chat-call-id] [class*=_imageBody] > * {\n  border-radius: 10px;\n}"
const styleToolGroups = (s) => {
  if (!s) throw new Error("CSS_TOOL_GROUPS: no selector map")
  for (const k of ["ROW","NODE","OPEN","CALL","CHEV_MASK"]) if (s[k] == null) throw new Error("CSS_TOOL_GROUPS: missing selector " + k)
  return CSS_TOOL_GROUPS.replace(/__DCG_([A-Z0-9_]+)__/g, (_, k) => s[k])
}

// ===== src/styles/04-plan-checklist.scss
/* compiled from src/styles/04-plan-checklist.scss by build.mjs — edit the .scss, not this file */
const CSS_PLAN_CHECKLIST = "/*!\n * Styles for plan-checklist (parts/04-plan-checklist.ts): the native To-dos dock clipped out of\n * sight (it stays mounted as the data source), and the in-conversation plan card — status glyphs\n * (check / spinner / dashed ring), the done-and-folded summary line, the check pop on completion.\n * $p is the dock selector the part also queries, passed in so the two never drift apart.\n */\n/* the native dock stays mounted (it is the data source) but out of sight */\n/* (the composer seat has will-change:transform, so position:fixed would be relative to it and the\n   panel's height would stretch the scroll area — the composer then drifts. Clip it to 1px instead.) */\n__DCG_P__ {\n  position: absolute !important;\n  left: 0 !important;\n  top: 0 !important;\n  width: 1px !important;\n  height: 1px !important;\n  overflow: hidden !important;\n  clip-path: inset(50%) !important;\n  opacity: 0 !important;\n  pointer-events: none !important;\n  margin: 0 !important;\n  padding: 0 !important;\n  border: 0 !important;\n}\n\n/* The card reads like a dsh-tool-groups card: when the turn is done, a quiet header line outside\n   (「已完成全部 3 项任务 ›」, like 「命令 ×3 ›」) and the list in a bordered box under it,\n   same 12px radius and 16px inset as the command rows. While the turn runs: the box alone. */\n.dcd-plan-card {\n  box-sizing: border-box;\n  margin: 10px 0 6px;\n  background: transparent;\n  color: var(--dsw-alias-label-primary);\n}\n\n.dcd-plan-list {\n  margin: 0;\n  padding: 12px 16px;\n  list-style: none;\n  display: flex;\n  flex-direction: column;\n  gap: 6px;\n  border: 1px solid var(--dsw-alias-border-l2);\n  border-radius: 12px;\n}\n\n.dcd-plan-item {\n  display: flex;\n  align-items: flex-start;\n  gap: 10px;\n  font-size: 14px;\n  line-height: 22px;\n  min-width: 0;\n  color: var(--dsw-alias-label-secondary);\n}\n\n.dcd-plan-text {\n  min-width: 0;\n  overflow-wrap: anywhere;\n}\n\n.dcd-plan-glyph {\n  flex: none;\n  position: relative;\n  width: 16px;\n  height: 22px;\n}\n\n.dcd-plan-glyph::before {\n  content: \"\";\n  position: absolute;\n  left: 0;\n  top: 3.5px;\n  width: 15px;\n  height: 15px;\n  box-sizing: border-box;\n  border-radius: 50%;\n  corner-shape: round;\n}\n\n.dcd-plan-item[data-status=completed] {\n  color: var(--dsw-alias-label-tertiary);\n}\n\n.dcd-plan-item[data-status=completed] .dcd-plan-glyph::before {\n  border-radius: 0;\n  background: var(--dsw-alias-label-tertiary);\n  -webkit-mask: url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cmask id='m'%3E%3Crect width='16' height='16' fill='white'/%3E%3Cpath d='M4.8 8.3l2.1 2.1 4.3-4.6' fill='none' stroke='black' stroke-width='1.7' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/mask%3E%3Ccircle cx='8' cy='8' r='7' fill='black' mask='url(%23m)'/%3E%3C/svg%3E\") center/15px 15px no-repeat;\n  mask: url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cmask id='m'%3E%3Crect width='16' height='16' fill='white'/%3E%3Cpath d='M4.8 8.3l2.1 2.1 4.3-4.6' fill='none' stroke='black' stroke-width='1.7' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/mask%3E%3Ccircle cx='8' cy='8' r='7' fill='black' mask='url(%23m)'/%3E%3C/svg%3E\") center/15px 15px no-repeat;\n}\n\n.dcd-plan-item[data-status=in_progress] {\n  color: var(--dsw-alias-label-primary);\n}\n\n.dcd-plan-item[data-status=in_progress] .dcd-plan-glyph::before {\n  border: 1.6px solid color-mix(in srgb, var(--dsw-alias-label-tertiary) 40%, transparent);\n  border-top-color: var(--dsw-alias-label-primary);\n  animation: dcd-plan-spin 0.9s linear infinite;\n}\n\n.dcd-plan-item[data-status=pending] .dcd-plan-glyph::before {\n  border: 1.4px dashed var(--dsw-alias-label-secondary);\n}\n\n/* a task finishing pops its check (data-pop is set for the moment of the flip, then dropped) */\n.dcd-plan-item[data-pop] .dcd-plan-glyph::before {\n  animation: dcd-pop 0.22s cubic-bezier(0.2, 0.8, 0.2, 1);\n}\n\n@keyframes dcd-plan-spin {\n  to {\n    transform: rotate(360deg);\n  }\n}\n@keyframes dcd-plan-in {\n  from {\n    opacity: 0;\n    transform: translateY(3px);\n  }\n  to {\n    opacity: 1;\n    transform: none;\n  }\n}\n.dcd-plan-list {\n  animation: dcd-plan-in 0.18s ease-out;\n}\n\n@media (prefers-reduced-motion: reduce) {\n  .dcd-plan-glyph::before {\n    animation: none !important;\n  }\n  .dcd-plan-list {\n    animation: none;\n  }\n}\nhtml[data-dcd-anim=off] .dcd-plan-list {\n  animation: none;\n}\n\nhtml[data-dcd-anim=off] .dcd-plan-item[data-pop] .dcd-plan-glyph::before {\n  animation: none;\n}\n\n/* header line, outside the box (only once the turn is over and every task is done). The reset,\n   flex, gap, hover wash and focus ring come from display-shared; what stays here is what makes the\n   plan card its own thing: hidden until it is done, and a fixed 14px that ignores the content\n   font size (the list below is fixed too, so the two never disagree). */\n.dcd-plan-sum {\n  display: none;\n  margin-block: 4px 6px;\n  font-size: 14px;\n  line-height: 22px;\n}\n\n.dcd-plan-sum .dcd-plan-glyph {\n  display: none;\n}\n\n.dcd-plan-card[data-done] .dcd-plan-sum {\n  display: inline-flex;\n}\n\n.dcd-plan-card[data-folded] {\n  margin: 0 0 2px;\n}\n\n.dcd-plan-card[data-folded] .dcd-plan-list {\n  display: none;\n}\n\n.dcd-plan-sum svg {\n  display: block;\n  transition: transform 0.15s ease;\n}\n\n.dcd-plan-card:not([data-folded]) .dcd-plan-sum svg {\n  transform: rotate(90deg);\n}"
const stylePlanChecklist = (s) => {
  if (!s) throw new Error("CSS_PLAN_CHECKLIST: no selector map")
  for (const k of ["P"]) if (s[k] == null) throw new Error("CSS_PLAN_CHECKLIST: missing selector " + k)
  return CSS_PLAN_CHECKLIST.replace(/__DCG_([A-Z0-9_]+)__/g, (_, k) => s[k])
}

// ===== src/styles/05-typography.scss
/* compiled from src/styles/05-typography.scss by build.mjs — edit the .scss, not this file */
const CSS_TYPOGRAPHY = "/*!\n * Styles for typography (parts/05-typography.ts): the quiet reading voice — one sans\n * stack, replies and bubbles at the reading size, quiet Markdown, warm per-theme text colours.\n * $md-reply scopes replies only (reasoning keeps its own look); $bubble-user covers user / steering /\n * question-reply / command-input bubbles, the inbox echoes of a message still waiting to be sent, and\n * excludes dsh's tooltip chip, which shares the _bubble class word.\n */\n:root {\n  --dcd-type-sans:ui-sans-serif,-apple-system,BlinkMacSystemFont,\"SF Pro Text\",\"PingFang SC\",\"Hiragino Sans GB\",\"Segoe UI\",\"Microsoft YaHei\",sans-serif;\n  --dcd-type-mono:ui-monospace,\"SF Mono\",Menlo,\"JetBrains Mono\",Consolas,\"PingFang SC\",monospace;\n  --dcd-type-leading:1.78;\n}\n\nbody {\n  --dcd-type-size:calc(var(--dsh-content-font-size,14px) + 1.5px);\n  --dcd-type-code-size:calc(var(--dsh-code-font-size,11px) + 1.5px);\n}\n\n/* the user's 界面字体 / 代码字体 (dsh sets --dsh-font-family-text / -code on <body>) go first, this stack is the fallback */\nbody {\n  font-family: var(--dsh-font-family-text, var(--dcd-type-sans)), var(--dcd-type-sans) !important;\n  -webkit-font-smoothing: antialiased;\n  -moz-osx-font-smoothing: grayscale;\n  text-rendering: optimizeLegibility;\n  font-feature-settings: \"kern\", \"liga\", \"calt\";\n  font-optical-sizing: auto;\n}\n\n:where(code, pre, kbd, samp, [class*=_terminal], [class*=_mono]) {\n  font-family: var(--dsh-font-family-code, var(--dcd-type-mono)), var(--dcd-type-mono) !important;\n}\n\n/* replies */\n[data-chat-flow-kind=assistant-step]:not([data-chat-group-part=reasoning]) [class*=_markdown] {\n  font-size: var(--dcd-type-size) !important;\n  line-height: var(--dcd-type-leading) !important;\n  letter-spacing: 0.003em;\n}\n\n[data-chat-flow-kind=assistant-step]:not([data-chat-group-part=reasoning]) [class*=_markdown] :is(p, li, blockquote, td, th) {\n  font-size: inherit !important;\n  line-height: inherit !important;\n  color: inherit;\n}\n\n[data-chat-flow-kind=assistant-step]:not([data-chat-group-part=reasoning]) [class*=_markdown] p {\n  margin: 0 0 0.9em !important;\n}\n\n[data-chat-flow-kind=assistant-step]:not([data-chat-group-part=reasoning]) [class*=_markdown] > :last-child {\n  margin-bottom: 0 !important;\n}\n\n[data-chat-flow-kind=assistant-step]:not([data-chat-group-part=reasoning]) [class*=_markdown] :is(ul, ol) {\n  margin: 0.25em 0 0.85em !important;\n  padding-left: 1.4em !important;\n}\n\n[data-chat-flow-kind=assistant-step]:not([data-chat-group-part=reasoning]) [class*=_markdown] li {\n  margin: 0.2em 0 !important;\n}\n\n[data-chat-flow-kind=assistant-step]:not([data-chat-group-part=reasoning]) [class*=_markdown] li::marker {\n  color: var(--dsw-alias-label-tertiary);\n}\n\n/* nested lists sit tight under their item; only the outer list gets air after it */\n[data-chat-flow-kind=assistant-step]:not([data-chat-group-part=reasoning]) [class*=_markdown] li > :is(ul, ol) {\n  margin: 0.15em 0 0.1em !important;\n}\n\n[data-chat-flow-kind=assistant-step]:not([data-chat-group-part=reasoning]) [class*=_markdown] li > p {\n  margin: 0 0 0.3em !important;\n}\n\n[data-chat-flow-kind=assistant-step]:not([data-chat-group-part=reasoning]) [class*=_markdown] li > p:last-child {\n  margin-bottom: 0 !important;\n}\n\n/* task lists: the checkbox is the marker, no bullet beside it */\n[data-chat-flow-kind=assistant-step]:not([data-chat-group-part=reasoning]) [class*=_markdown] :is(ul, ol).contains-task-list, [data-chat-flow-kind=assistant-step]:not([data-chat-group-part=reasoning]) [class*=_markdown] ul:has(> li.task-list-item) {\n  list-style: none !important;\n  padding-left: 0.15em !important;\n}\n\n[data-chat-flow-kind=assistant-step]:not([data-chat-group-part=reasoning]) [class*=_markdown] li.task-list-item {\n  list-style: none !important;\n}\n\n[data-chat-flow-kind=assistant-step]:not([data-chat-group-part=reasoning]) [class*=_markdown] li.task-list-item::marker {\n  content: none;\n}\n\n[data-chat-flow-kind=assistant-step]:not([data-chat-group-part=reasoning]) [class*=_markdown] li.task-list-item > input[type=checkbox] {\n  margin: 0 0.5em 0 0 !important;\n  vertical-align: -0.12em;\n  accent-color: var(--dsw-alias-label-secondary);\n}\n\n/* tables: a clear header, compact rows, air around.\n   Vertical rhythm only: dsh bleeds wide tables (md-table-wide) into the side gutters with a\n   matched trio — negative margin-left, padding-left and a wider width — so clobbering the whole\n   margin here would drop the shift while keeping its compensation, sliding the table one gutter\n   into the page and off its right edge. */\n[data-chat-flow-kind=assistant-step]:not([data-chat-group-part=reasoning]) [class*=_markdown] [class*=_tableScroll] {\n  margin-block: 0.4em 0.9em !important;\n}\n\n[data-chat-flow-kind=assistant-step]:not([data-chat-group-part=reasoning]) [class*=_markdown] table {\n  margin: 0 !important;\n  font-size: 0.95em !important;\n  border-collapse: collapse;\n}\n\n[data-chat-flow-kind=assistant-step]:not([data-chat-group-part=reasoning]) [class*=_markdown] :is(th, td) {\n  padding: 6px 18px 6px 0 !important;\n}\n\n[data-chat-flow-kind=assistant-step]:not([data-chat-group-part=reasoning]) [class*=_markdown] th {\n  font-weight: 600 !important;\n  color: var(--dcd-type-text) !important;\n  border-bottom: 1px solid var(--dsw-alias-border-l1) !important;\n}\n\n[data-chat-flow-kind=assistant-step]:not([data-chat-group-part=reasoning]) [class*=_markdown] td {\n  border-bottom: 1px solid var(--dsw-alias-border-l2) !important;\n}\n\n[data-chat-flow-kind=assistant-step]:not([data-chat-group-part=reasoning]) [class*=_markdown] tr:last-child > td {\n  border-bottom: 0 !important;\n}\n\n[data-chat-flow-kind=assistant-step]:not([data-chat-group-part=reasoning]) [class*=_markdown] pre {\n  margin: 0.4em 0 1em !important;\n}\n\n[data-chat-flow-kind=assistant-step]:not([data-chat-group-part=reasoning]) [class*=_markdown] :is(h1, h2, h3, h4) {\n  font-weight: 600 !important;\n  letter-spacing: -0.005em;\n  line-height: 1.4 !important;\n  margin: 1.6em 0 0.5em !important;\n}\n\n[data-chat-flow-kind=assistant-step]:not([data-chat-group-part=reasoning]) [class*=_markdown] h3, [data-chat-flow-kind=assistant-step]:not([data-chat-group-part=reasoning]) [class*=_markdown] h4 {\n  margin-top: 1.3em !important;\n}\n\n[data-chat-flow-kind=assistant-step]:not([data-chat-group-part=reasoning]) [class*=_markdown] h1 {\n  font-size: 1.4em !important;\n}\n\n[data-chat-flow-kind=assistant-step]:not([data-chat-group-part=reasoning]) [class*=_markdown] h2 {\n  font-size: 1.22em !important;\n}\n\n[data-chat-flow-kind=assistant-step]:not([data-chat-group-part=reasoning]) [class*=_markdown] h3 {\n  font-size: 1.08em !important;\n}\n\n[data-chat-flow-kind=assistant-step]:not([data-chat-group-part=reasoning]) [class*=_markdown] h4 {\n  font-size: 1em !important;\n}\n\n[data-chat-flow-kind=assistant-step]:not([data-chat-group-part=reasoning]) [class*=_markdown] > :first-child {\n  margin-top: 0 !important;\n}\n\n[data-chat-flow-kind=assistant-step]:not([data-chat-group-part=reasoning]) [class*=_markdown] strong {\n  font-weight: 600;\n}\n\n[data-chat-flow-kind=assistant-step]:not([data-chat-group-part=reasoning]) [class*=_markdown] blockquote {\n  border-left: 2px solid var(--dsw-alias-border-l2) !important;\n  padding-left: 1em !important;\n  margin: 0.5em 0 0.85em !important;\n}\n\n[data-chat-flow-kind=assistant-step]:not([data-chat-group-part=reasoning]) [class*=_markdown] a {\n  text-underline-offset: 2px;\n  text-decoration-thickness: 1px;\n}\n\n[data-chat-flow-kind=assistant-step]:not([data-chat-group-part=reasoning]) [class*=_markdown] :not(pre) > code {\n  font-size: 0.88em !important;\n  padding: 0.12em 0.36em !important;\n  border-radius: 5px !important;\n}\n\n[data-chat-flow-kind=assistant-step]:not([data-chat-group-part=reasoning]) [class*=_markdown] pre, [data-chat-flow-kind=assistant-step]:not([data-chat-group-part=reasoning]) [class*=_markdown] pre code {\n  font-size: var(--dcd-type-code-size) !important;\n  line-height: 1.6 !important;\n}\n\n[data-chat-flow-kind=assistant-step]:not([data-chat-group-part=reasoning]) [class*=_markdown] hr {\n  border: 0 !important;\n  border-top: 1px solid var(--dsw-alias-border-l1) !important;\n  margin: 1.25em 0 !important;\n}\n\n/* user / steering / question-reply: the quiet bubble — a neutral warm tint of the text colour (not dsh's blue), rounder, roomier */\n:is([data-chat-flow-kind=user], [data-chat-flow-kind=steering], [data-chat-flow-kind=question-reply], [data-chat-flow-kind=command-input], [data-pending-steering], [data-submission-echo]) [class*=_bubble]:not([class*=_bubbleWidth], [role=tooltip]) {\n  font-size: var(--dcd-type-size) !important;\n  line-height: 1.65 !important;\n  padding: 10px 16px !important;\n  border-radius: 18px !important;\n  background: color-mix(in srgb, var(--dcd-type-text, currentColor) 6%, transparent) !important;\n  color: var(--dcd-type-text) !important;\n  border: 0 !important;\n  box-shadow: none !important;\n}\n\n:is([data-chat-flow-kind=user], [data-chat-flow-kind=steering], [data-chat-flow-kind=question-reply], [data-chat-flow-kind=command-input], [data-pending-steering], [data-submission-echo]) [class*=_bubble]:not([class*=_bubbleWidth], [role=tooltip]) * {\n  font-size: inherit !important;\n  line-height: inherit !important;\n}\n\n:is([data-chat-flow-kind=user], [data-chat-flow-kind=steering], [data-chat-flow-kind=question-reply], [data-chat-flow-kind=command-input], [data-pending-steering], [data-submission-echo]) [class*=_bubble]:not([class*=_bubbleWidth], [role=tooltip]) [class*=_question] {\n  color: var(--dcd-type-text-2) !important;\n}\n\n:is([data-chat-flow-kind=user], [data-chat-flow-kind=steering], [data-chat-flow-kind=question-reply], [data-chat-flow-kind=command-input], [data-pending-steering], [data-submission-echo]) [class*=_bubble]:not([class*=_bubbleWidth], [role=tooltip]) [class*=_answer] {\n  color: var(--dcd-type-text) !important;\n}\n\n/* composer input at reading size */\n[data-composer-input] {\n  font-size: var(--dcd-type-size) !important;\n}\n\n/* text colours: a warm near-black instead of dsh's cool blue-black, softer quotes, light terracotta inline code */\nbody:not([data-ds-dark-theme]) {\n  --dcd-type-text:#1f1e1d;\n  --dcd-type-text-2:#3d3d3a;\n  --dcd-type-code-bg:rgba(31,30,29,.055);\n  --dcd-type-code-fg:#8a3b22;\n}\n\nbody[data-ds-dark-theme] {\n  --dcd-type-text:#ecebe6;\n  --dcd-type-text-2:#c9c7bf;\n  --dcd-type-code-bg:rgba(236,235,230,.08);\n  --dcd-type-code-fg:#f0a586;\n}\n\n[data-chat-flow-kind=assistant-step]:not([data-chat-group-part=reasoning]) [class*=_markdown] {\n  color: var(--dcd-type-text) !important;\n}\n\n[data-chat-flow-kind=assistant-step]:not([data-chat-group-part=reasoning]) [class*=_markdown] :is(h1, h2, h3, h4), [data-chat-flow-kind=assistant-step]:not([data-chat-group-part=reasoning]) [class*=_markdown] strong {\n  color: var(--dcd-type-text) !important;\n}\n\n[data-chat-flow-kind=assistant-step]:not([data-chat-group-part=reasoning]) [class*=_markdown] blockquote {\n  color: var(--dcd-type-text-2) !important;\n}\n\n[data-chat-flow-kind=assistant-step]:not([data-chat-group-part=reasoning]) [class*=_markdown] :not(pre) > code {\n  background: var(--dcd-type-code-bg) !important;\n  color: var(--dcd-type-code-fg) !important;\n  border: 0 !important;\n}\n\n[data-composer-input] {\n  color: var(--dcd-type-text) !important;\n}"

// ===== src/styles/06-bash-highlight.scss
/* compiled from src/styles/06-bash-highlight.scss by build.mjs — edit the .scss, not this file */
const CSS_BASH_HIGHLIGHT = "/*!\n * Styles for bash-highlight (parts/06-bash-highlight.ts): the CSS Custom Highlight API colours.\n * Command tokens (dbh-*) borrow the code theme's shiki tokens so they follow 外观 › 代码主题;\n * output marks (dbo-*) are the lighter pass over terminal text. Rules are scoped to the elements\n * that carry highlights — a bare ::highlight() makes the browser cost a style pass per element.\n */\n[data-command-text]::highlight(dbh-cmd) {\n  color: var(--shiki-token-function, #6f42c1);\n}\n\n[data-command-text]::highlight(dbh-kw) {\n  color: var(--shiki-token-keyword, #d73a49);\n}\n\n[data-command-text]::highlight(dbh-flag) {\n  color: var(--shiki-token-constant, #005cc5);\n}\n\n[data-command-text]::highlight(dbh-str) {\n  color: var(--shiki-token-string, #032f62);\n}\n\n[data-command-text]::highlight(dbh-var) {\n  color: var(--shiki-token-parameter, var(--shiki-token-constant, #e36209));\n}\n\n[data-command-text]::highlight(dbh-op) {\n  color: var(--shiki-token-keyword, #d73a49);\n}\n\n[data-command-text]::highlight(dbh-num) {\n  color: var(--shiki-token-constant, #005cc5);\n}\n\n[data-command-text]::highlight(dbh-cmt) {\n  color: var(--shiki-token-comment, #6a737d);\n  font-style: italic;\n}\n\n[data-dbh-out]::highlight(dbo-err) {\n  color: var(--dsw-alias-label-danger, #e5484d);\n}\n\n[data-dbh-out]::highlight(dbo-warn) {\n  color: #d29922;\n}\n\n[data-dbh-out]::highlight(dbo-ok) {\n  color: #3fb950;\n}\n\n[data-dbh-out]::highlight(dbo-num) {\n  color: var(--shiki-token-constant, #005cc5);\n}\n\n[data-dbh-out]::highlight(dbo-str) {\n  color: var(--shiki-token-string, #032f62);\n}\n\n[data-dbh-out]::highlight(dbo-path) {\n  color: var(--shiki-token-function, #6f42c1);\n}\n\n[data-dbh-out]::highlight(dbo-cmt) {\n  color: var(--shiki-token-comment, #6a737d);\n}\n\n[data-dbh-out]::highlight(dbo-add) {\n  color: #3fb950;\n}\n\n[data-dbh-out]::highlight(dbo-del) {\n  color: var(--dsw-alias-label-danger, #e5484d);\n}"

// ===== src/styles/07-render-offscreen.scss
/* compiled from src/styles/07-render-offscreen.scss by build.mjs — edit the .scss, not this file */
const CSS_RENDER_OFFSCREEN = "/*!\n * Styles for render-offscreen (parts/07-render-offscreen.ts): content-visibility:auto on flow\n * rows far from the viewport, with the exceptions that keep paint containment from showing\n * (the live tail, hovered / focused rows, empty rows dsh collapses to height 0).\n */\n[data-conversation-scroll] [data-slot=\"conversation.chat.flow\"] > [data-chat-flow-key]:not(:nth-last-child(-n+8)):not(:empty):not([data-turn-process-hidden]):not(:hover):not(:focus-within):not(:has(> [data-slot=\"conversation.chat.node\"]:empty)) {\n  content-visibility: auto;\n  contain-intrinsic-size: auto 160px;\n}"

// ===== src/styles/08-conversation-flow.scss
/* compiled from src/styles/08-conversation-flow.scss by build.mjs — edit the .scss, not this file */
const CSS_CONVERSATION_FLOW = "/*!\n * Styles for conversation-flow (parts/08-conversation-flow.ts + lib/flow-view.ts): the quiet-style turn list.\n * Turn rhythm, the live line, thought / run / steps heads, thumbnails and the peek viewer.\n * Folding is a grid-row transition (.dcd-flow-fold): a body opens from 0fr to 1fr and closes back,\n * clipped by its first child, so nothing is unmounted to animate and nothing jumps.\n */\n/* Two head shapes: a run/steps head sits inside .dcd-flow-line (the thumbnails are its siblings), a\n   thought head IS the line. Every rule below that talks about “a line's head” means both. */\n.dcd-flow-root {\n  display: contents;\n}\n\n.dcd-flow-turn {\n  display: flex;\n  flex-direction: column;\n  min-width: 0;\n}\n\n/* Off-screen turns skip layout and paint (as render-offscreen does for dsh's own rows).\n   contain-intrinsic-size:auto remembers each turn's size after its first paint, so the scrollbar\n   stays truthful without a forced measuring pass; 400px is only the before-first-paint guess. The\n   four newest turns are never skipped: they are what the eye lands on and what dsh follows. */\n.dcd-flow-turn:not(:nth-last-of-type(-n+4)):not(:empty):not(:hover):not(:focus-within) {\n  content-visibility: auto;\n  contain-intrinsic-size: auto 400px;\n}\n\n.dcd-flow-run, .dcd-flow-thought, .dcd-flow-steps {\n  min-width: 0;\n}\n\n/* The mark is drawn inside a box the size of one line of text, and sits a hair low in it: its ink\n   is ~1px shorter than a CJK glyph's, so with both tops flush the icon read as floating above the\n   words, and half a pixel down puts the two centres on one line.\n   Both numbers are ratios of the reading size, not pixels: `--dsh-content-font-size` drives these\n   rows, so at a larger setting the words grow and the mark has to grow with them — a fixed 16px\n   box with a fixed .5px drop would drift apart. 16/14 and 0.5/14 keep the geometry the same at the\n   default 14px and let it scale (the measured pairs were 16px ink box / .5px drop). */\n/* 16 / 14 */\n/* 0.5 / 14 */\n.dcd-flow-icon {\n  flex: none;\n  display: grid;\n  place-items: center;\n  width: calc(var(--dsh-content-font-size, 14px) * 1.142857);\n  height: calc(var(--dsh-content-font-size, 14px) * 1.142857);\n  margin-right: -1px;\n  opacity: 0.85;\n  transform: translateY(calc(var(--dsh-content-font-size, 14px) * 0.035714));\n}\n\n.dcd-flow-icon svg {\n  display: block;\n  width: 100%;\n  height: 100%;\n}\n\n/* the live line: under the group its work belongs to, indented to the card rows' column so that,\n   opened, the words on it are exactly the row it becomes. One line for as long as the turn runs —\n   the call in flight, the answer streaming, or the model thinking — and it never appears or\n   disappears while a tool runs; only its words change. */\n/* thinking reads apart from tool lines: its own bulb, and a warmer tint */\n.dcd-flow-thought > .dcd-flow-head {\n  color: color-mix(in srgb, var(--dsw-alias-label-tertiary) 85%, #345eba);\n}\n\n.dcd-flow-thought > .dcd-flow-head .dcd-flow-icon {\n  color: #4d6bfe;\n  opacity: 0.8;\n}\n\n/* the head's base block (reset, flex, gap, the hover wash, focus ring) is display-shared's, so a\n   run line, a thought line and a tool-group line feel like the same button under the cursor */\n/* a run or a steps line keeps its head inside .dcd-flow-line (the thumbnails sit beside it); a thought\n   line's head is a direct child — so the state tints and the chevron turn need both shapes */\n:is(.dcd-flow-run, .dcd-flow-steps)[data-busy] > .dcd-flow-line > .dcd-flow-head, .dcd-flow-thought[data-busy] > .dcd-flow-head {\n  color: var(--dsw-alias-label-secondary);\n}\n\n.dcd-flow-label {\n  min-width: 0;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n/* abbreviated thought text on a closed row: the duration keeps its width, the preview takes the\n   rest and ellipsizes, so a long reasoning never pushes the chevron or wraps the line */\n.dcd-flow-thought > .dcd-flow-head .dcd-flow-label {\n  flex: none;\n}\n\n.dcd-flow-preview {\n  flex: 1;\n  min-width: 0;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n  color: var(--dsw-alias-label-tertiary);\n  opacity: 0.8;\n}\n\n.dcd-flow-preview::before {\n  content: \"· \";\n  opacity: 0.7;\n}\n\n/* nothing in front of it: the thought's words stand alone on the line */\n.dcd-flow-live[data-bare] > .dcd-flow-preview::before {\n  content: none;\n}\n\n/* a wordless thought draws no row at all: keeping its height instead left a blank band between the\n   last row and dsh's own running line, which reads as something stuck. The line appears with its\n   first word, in one step */\n.dcd-flow-live[data-quiet] {\n  display: none;\n}\n\n/* words carried over between two steps: still there, not pretending to be the new thought */\n.dcd-flow-live[data-stale] > .dcd-flow-preview {\n  opacity: 0.55;\n}\n\n.dcd-flow-time {\n  flex: none;\n  font-variant-numeric: tabular-nums;\n}\n\n.dcd-flow-err {\n  flex: none;\n  color: var(--dsw-alias-label-danger, #e5484d);\n}\n\n.dcd-flow-errsep {\n  margin-left: -4px;\n}\n\n.dcd-flow-errsep::before {\n  content: \"· \";\n  opacity: 0.7;\n  color: var(--dsw-alias-label-tertiary);\n}\n\n.dcd-flow-stop {\n  flex: none;\n  color: var(--dsw-alias-label-tertiary);\n}\n\n.dcd-flow-line {\n  display: flex;\n  align-items: center;\n  gap: 10px;\n  min-width: 0;\n}\n\n/* A head is only as wide as its own content: the hover wash belongs to 「命令 ×8 ▸」, not to the whole\n   row, and the arrow stays next to the last word instead of drifting off to the far edge. */\n.dcd-flow-line > .dcd-flow-head {\n  min-width: 0;\n  flex: 0 1 auto;\n}\n\n/* One text column, and one left edge. A head opens with its 16px mark and an 8px gap, so it sits\n   flush against the card's left border (no negative margin: the hover wash starts where the card\n   starts) and its words land 24px in. dsh pads a call header 16px, so the rows under the head are\n   given the 8px the mark takes — every word in the group, head and rows alike, starts on one x.\n   The right side is untouched: rows keep their 16px chevron gutter. */\n.dcd-flow-line > .dcd-flow-head, .dcd-flow-thought > .dcd-flow-head {\n  margin-inline-start: 0;\n  padding-inline-start: 0;\n}\n\n/* …and no row carries a leading mark. A shell call holds its mark in a _leading slot (hidden by\n   the tool-groups rules), a plugin tool reports it as an _icon inside its header — hiding only the\n   first left two indents inside one card: 「Locate …」 at 165px and 「工具调用 · compress …」 at 210px\n   in the same list (measured). */\n.dcd-flow-card :is([class*=_icon], [class*=_leading]) {\n  display: none !important;\n}\n\n/* every row's chevron sits at the right edge of the text column, not right after its words:\n   the thought rows (whose head is the line) already end there, and a run row whose chevron\n   hugged its（much shorter）label put two different right edges in the same card */\n/* image previews at the right of a call's line: what it drew or read, at a glance; click opens it.\n   Small enough to keep the line quiet, pushed to the right edge of the column. A fixed set of\n   tiles, so the row never gains and loses them; the label truncates before they do. */\n.dcd-flow-thumbs {\n  display: flex;\n  align-items: center;\n  gap: 6px;\n  flex: none;\n  margin-left: auto;\n}\n\n.dcd-flow-thumb {\n  all: unset;\n  box-sizing: border-box;\n  display: block;\n  width: 44px;\n  height: 30px;\n  border-radius: 6px;\n  overflow: hidden;\n  cursor: zoom-in;\n  border: 1px solid var(--dsw-alias-border-l2);\n  background: var(--dsw-specific-input-major, transparent);\n  transition: transform 0.12s ease, box-shadow 0.12s ease;\n}\n\n.dcd-flow-thumb:hover {\n  transform: translateY(-1px);\n  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);\n}\n\n.dcd-flow-thumb:focus-visible {\n  outline: 2px solid var(--dsw-alias-border-focus, #4d8cff);\n  outline-offset: 2px;\n}\n\n.dcd-flow-peek {\n  position: fixed;\n  inset: 0;\n  z-index: 1000;\n  display: grid;\n  place-items: center;\n  background: rgba(0, 0, 0, 0.28);\n  animation: dcd-flow-fade 0.12s ease;\n}\n\n.dcd-flow-peek-win {\n  display: flex;\n  flex-direction: column;\n  max-width: min(720px, 90vw);\n  max-height: min(620px, 86vh);\n  border-radius: 12px;\n  overflow: hidden;\n  background: var(--dsw-alias-bg-l1, #fff);\n  border: 1px solid var(--dsw-alias-border-l2);\n  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.22);\n  animation: dcd-flow-pop 0.14s ease;\n}\n\n.dcd-flow-peek-bar {\n  display: flex;\n  align-items: center;\n  gap: 6px;\n  padding: 6px 8px 6px 12px;\n  border-bottom: 1px solid var(--dsw-alias-border-l2);\n  font-size: 12px;\n  color: var(--dsw-alias-label-secondary);\n}\n\n.dcd-flow-peek-name {\n  flex: 1;\n  min-width: 0;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.dcd-flow-peek-btn {\n  all: unset;\n  display: grid;\n  place-items: center;\n  width: 24px;\n  height: 24px;\n  border-radius: 6px;\n  cursor: pointer;\n  color: var(--dsw-alias-label-tertiary);\n  font-size: 13px;\n}\n\n.dcd-flow-peek-btn:hover {\n  background: color-mix(in srgb, var(--dsw-alias-label-primary) 8%, transparent);\n  color: var(--dsw-alias-label-primary);\n}\n\n.dcd-flow-peek-body {\n  min-height: 0;\n  overflow: auto;\n  display: grid;\n  place-items: center;\n  padding: 12px;\n  background: repeating-conic-gradient(color-mix(in srgb, var(--dsw-alias-label-primary) 4%, transparent) 0 25%, transparent 0 50%) 0 0/16px 16px;\n}\n\n.dcd-flow-peek-body img {\n  display: block;\n  max-width: 100%;\n  max-height: calc(min(620px, 86vh) - 62px);\n  object-fit: contain;\n  image-rendering: auto;\n}\n\n@keyframes dcd-flow-fade {\n  from {\n    opacity: 0;\n  }\n}\n@keyframes dcd-flow-pop {\n  from {\n    opacity: 0;\n    transform: scale(0.97);\n  }\n}\n@media (prefers-reduced-motion: reduce) {\n  .dcd-flow-peek, .dcd-flow-peek-win {\n    animation: none;\n  }\n}\nhtml[data-dcd-anim=off] :is(.dcd-flow-peek, .dcd-flow-peek-win) {\n  animation: none;\n}\n\n.dcd-flow-thumb img {\n  display: block;\n  width: 100%;\n  height: 100%;\n  object-fit: cover;\n  object-position: top left;\n  opacity: 0;\n  transition: opacity 0.18s ease;\n}\n\n.dcd-flow-more {\n  all: unset;\n  flex: none;\n  padding: 0 2px;\n  cursor: pointer;\n  font-size: var(--dsh-content-font-size, 14px);\n  color: var(--dsw-alias-label-tertiary);\n  font-variant-numeric: tabular-nums;\n}\n\n.dcd-flow-more:hover {\n  color: var(--dsw-alias-label-primary);\n}\n\n.dcd-flow-nav {\n  position: fixed;\n  left: 50%;\n  bottom: 28px;\n  transform: translateX(-50%);\n  z-index: 1001;\n  display: flex;\n  align-items: center;\n  gap: 4px;\n  padding: 4px;\n  border-radius: 999px;\n  corner-shape: round;\n  background: var(--dsw-specific-input-major, #fff);\n  border: 0.5px solid var(--dsw-alias-border-l2);\n  box-shadow: var(--dsw-elevation-prominent, 0 8px 24px rgba(0, 0, 0, 0.18));\n  font-size: 12px;\n  color: var(--dsw-alias-label-secondary);\n}\n\n.dcd-flow-nav button {\n  all: unset;\n  display: grid;\n  place-items: center;\n  width: 28px;\n  height: 28px;\n  border-radius: 999px;\n  corner-shape: round;\n  cursor: pointer;\n  font-size: 18px;\n  line-height: 1;\n  color: var(--dsw-alias-label-primary);\n}\n\n.dcd-flow-nav button:hover {\n  background: color-mix(in srgb, var(--dsw-alias-label-primary) 8%, transparent);\n}\n\n.dcd-flow-nav-text {\n  padding: 0 6px;\n  max-width: 50vw;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n  font-variant-numeric: tabular-nums;\n}\n\n.dcd-flow-chev {\n  flex: none;\n  display: grid;\n  place-items: center;\n  transition: transform 0.15s ease;\n}\n\n.dcd-flow-chev svg {\n  display: block;\n}\n\n:is(.dcd-flow-run, .dcd-flow-steps)[data-open] > .dcd-flow-line > .dcd-flow-head .dcd-flow-chev, .dcd-flow-thought[data-open] > .dcd-flow-head .dcd-flow-chev {\n  transform: rotate(90deg);\n}\n\n/* a folded stretch of steps: 「思考× 3 · 工具× 2 ›」, opened: its lines on a thin rail.\n   flex:none: the counts keep their width, so a snippet after them ellipsizes instead */\n.dcd-flow-counts {\n  display: inline-flex;\n  gap: 6px;\n  flex: 0 1 auto;\n  min-width: 0;\n  overflow: hidden;\n}\n\n.dcd-flow-dot {\n  opacity: 0.7;\n}\n\n.dcd-flow-live {\n  box-sizing: border-box;\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  min-width: 0;\n  height: calc(26px + var(--dsh-content-font-delta, 0px));\n  margin: 2px -6px 2px -6px;\n  padding: 2px 6px;\n  font-size: var(--dsh-content-font-size, 14px);\n  line-height: calc(22px + var(--dsh-content-font-delta, 0px));\n  color: var(--dsw-alias-label-secondary);\n  user-select: none;\n  -webkit-user-select: none;\n}\n\n.dcd-flow-live[data-indent] {\n  margin-left: 18px;\n}\n\n.dcd-flow-live > .dcd-flow-label {\n  flex: none;\n  min-width: 0;\n  max-width: 62%;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n/* one line, always — and always the same height: the row swaps between a call's sentence and the\n   thought being written several times a turn, and a row that grew by a pixel on one of them made\n   everything above it (the counts line) bob as the live line changed. The height is pinned, so no\n   content can move it */\n.dcd-flow-live > .dcd-flow-preview {\n  flex: 1;\n  min-width: 0;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n/* the live line's words keep their end: the newest word sits against the clock, and a thought\n   longer than the row lets its beginning fall off the left edge — no typewriter, no page turning,\n   just text being written, at the speed it is written */\n.dcd-flow-live > .dcd-flow-preview-live {\n  position: relative;\n  display: flex;\n  justify-content: flex-end;\n  align-self: stretch;\n  min-height: 0;\n  overflow: hidden;\n}\n\n/* the outer dot is the live row's separator when the tail is empty and the stationary dot under\n   it when the tail is cut; take it out of the flex flow so it cannot push the right-packed tail */\n.dcd-flow-preview-live::before {\n  position: absolute;\n  left: 0;\n  top: 0;\n  bottom: 0;\n  display: flex;\n  align-items: center;\n  pointer-events: none;\n}\n\n.dcd-flow-tail {\n  display: flex;\n  align-items: center;\n  flex: none;\n  min-width: 100%;\n  width: max-content;\n  white-space: nowrap;\n  pointer-events: none;\n}\n\n.dcd-flow-tail::before {\n  content: \"· \";\n  opacity: 0.7;\n  flex: none;\n}\n\n.dcd-flow-preview-live[data-cut] {\n  mask-image: linear-gradient(to right, transparent 0, #000 26px);\n  -webkit-mask-image: linear-gradient(to right, transparent 0, #000 26px);\n}\n\n.dcd-flow-live .dcd-flow-icon {\n  opacity: 0.85;\n  flex: none;\n}\n\n.dcd-flow-live .dcd-flow-time {\n  flex: none;\n  min-width: 4.2ch;\n  text-align: right;\n  font-variant-numeric: tabular-nums;\n  opacity: 0.7;\n}\n\n.dcd-flow-live .dcd-flow-time[data-empty] {\n  visibility: hidden;\n}\n\n.dcd-flow-live .dcd-flow-time::before {\n  content: \"· \";\n  opacity: 0.7;\n}\n\n/* 「思考中…」 keeps the blue the thought rows have always had: the same voice, so the same colour */\n.dcd-flow-live[data-kind=think] {\n  color: color-mix(in srgb, var(--dsw-alias-label-tertiary) 85%, #345eba);\n}\n\n.dcd-flow-live[data-kind=think] .dcd-flow-icon {\n  color: #4d6bfe;\n  opacity: 0.8;\n}\n\n/* fold: a body opens and closes on a grid-row transition instead of appearing / vanishing. The\n   first child clips (min-height:0 lets the 0fr track actually reach zero); spacing lives inside\n   it, so a closed body takes no room and an opening one grows into its own padding. @starting-style\n   gives a body that mounts open the same rise; browsers without it simply show it at once. */\n.dcd-flow-fold {\n  display: grid;\n  grid-template-rows: 1fr;\n  min-width: 0;\n  transition: grid-template-rows 0.22s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 0.2s ease;\n}\n\n.dcd-flow-fold[data-shut] {\n  grid-template-rows: 0fr;\n  opacity: 0;\n  visibility: hidden;\n  transition: grid-template-rows 0.2s cubic-bezier(0.4, 0, 0.6, 1), opacity 0.16s ease-in, visibility 0s 0.2s;\n}\n\n@starting-style {\n  .dcd-flow-fold:not([data-shut]) {\n    grid-template-rows: 0fr;\n    opacity: 0;\n  }\n}\n.dcd-flow-fold > * {\n  min-height: 0;\n}\n\n.dcd-flow-clip {\n  overflow: hidden;\n}\n\n.dcd-flow-steps-body {\n  display: flex;\n  flex-direction: column;\n  margin: 4px 0 6px 9px;\n  padding-left: 15px;\n  border-left: 1px solid var(--dsw-alias-border-l2);\n  min-width: 0;\n}\n\n.dcd-flow-steps-body > :is(.dcd-flow-run, .dcd-flow-thought, .dcd-flow-steps) {\n  margin: 1px 0;\n}\n\n.dcd-flow-steps-body > [data-open] + * {\n  margin-top: 6px;\n}\n\n/* shut, not unmounted: see the kept ref in Run — a body that is already in the tree reopens at\n   once, and nothing has to be rebuilt to show it again */\n.dcd-flow-body {\n  min-width: 0;\n  overflow: hidden;\n}\n\n/* tool calls share one card, drawn by the tool-groups card rules (rows bordered, first/last rounded) */\n.dcd-flow-card {\n  min-width: 0;\n  padding-block: 6px;\n}\n\n/* thinking: the same quiet line as a command; opened, its text on a thin rule */\n/* A thought can run for pages; opening it must not push the answer off the screen. The block is a\n   reading pane: capped against the viewport (42vh, never more than 520px, never less than 200px) and\n   scrolling inside itself, with overscroll contained so a wheel at its end does not jump the\n   transcript. Same policy as dsh's own tool bodies, one size larger — thinking is what you read. */\n.dcd-flow-thought-text {\n  margin: 4px 0 6px 9px;\n  padding: 0 0 0 15px;\n  border-left: 2px solid var(--dsw-alias-border-l2);\n  border-radius: 0;\n  font-size: calc(var(--dsh-content-font-size, 14px) - 0.5px);\n  line-height: 1.75;\n  color: var(--dsw-alias-label-secondary);\n  overflow-wrap: anywhere;\n  max-height: clamp(200px, 42vh, 520px);\n  overflow-y: auto;\n  overscroll-behavior: contain;\n  scrollbar-width: thin;\n  scrollbar-color: var(--dsw-alias-border-l2) transparent;\n}\n\n.dcd-flow-thought-text p {\n  margin: 0 0 0.6em;\n  white-space: pre-wrap;\n}\n\n.dcd-flow-thought-text p:last-child {\n  margin-bottom: 0;\n}\n\n.dcd-flow-thought-text code {\n  font-family: var(--dsh-font-family-code, ui-monospace, SFMono-Regular, Menlo, monospace);\n  font-size: 0.9em;\n  padding: 1px 5px;\n  border-radius: 5px;\n  background: color-mix(in srgb, var(--dsw-alias-label-primary) 6%, transparent);\n  color: var(--dsw-alias-label-primary);\n}\n\n.dcd-flow-thought-text strong {\n  font-weight: 600;\n  color: var(--dsw-alias-label-primary);\n}\n\n/* live label: the soft shimmer across the text */\n.dcd-flow-shimmer {\n  background: linear-gradient(90deg, var(--dsw-alias-label-tertiary) 0 35%, var(--dsw-alias-label-primary) 50%, var(--dsw-alias-label-tertiary) 65% 100%);\n  background-size: 250% 100%;\n  -webkit-background-clip: text;\n  background-clip: text;\n  color: transparent;\n  animation: dcd-flow-shimmer 2.2s linear infinite;\n}\n\n@keyframes dcd-flow-shimmer {\n  0% {\n    background-position: 100% 0;\n  }\n  100% {\n    background-position: 0 0;\n  }\n}\n@media (prefers-reduced-motion: reduce) {\n  .dcd-flow-shimmer {\n    animation: none;\n    background: none;\n    color: var(--dsw-alias-label-secondary);\n  }\n}\n/* motion: a new turn fades in (opacity only — anything taller would fight the scroll anchoring\n   that keeps the reading position); bodies fold open / shut on .dcd-flow-fold; thumbnails fade in once\n   their image has decoded */\n.dcd-flow-turn {\n  animation: dcd-turn-in 0.22s ease-out;\n}\n\n.dcd-flow-end {\n  animation: dcd-in 0.16s cubic-bezier(0.2, 0.8, 0.2, 1);\n}\n\n.dcd-flow-thumb[data-state=ok] img {\n  opacity: 1;\n}\n\n/* a preview is a picture or it is nothing: while it loads it must not show an empty frame, and one\n   that failed is dropped by Thumbs so the row does not gain and lose a tile between redraws */\n.dcd-flow-thumb[data-state=loading] {\n  opacity: 0;\n  pointer-events: none;\n}\n\n.dcd-flow-thumb[data-state=failed] {\n  display: none;\n}\n\n@media (prefers-reduced-motion: reduce) {\n  .dcd-flow-turn, .dcd-flow-end {\n    animation: none;\n  }\n  .dcd-flow-fold, .dcd-flow-fold[data-shut] {\n    transition: none;\n  }\n  .dcd-flow-thumb img {\n    transition: none;\n    opacity: 1;\n  }\n}\nhtml[data-dcd-anim=off] :is(.dcd-flow-turn, .dcd-flow-end) {\n  animation: none;\n}\n\nhtml[data-dcd-anim=off] :is(.dcd-flow-fold, .dcd-flow-fold[data-shut]) {\n  transition: none;\n}\n\nhtml[data-dcd-anim=off] .dcd-flow-thumb img {\n  transition: none;\n  opacity: 1;\n}\n\n/* rhythm: the process lines of a step sit close together, with air before and after the text */\n.dcd-flow-turn {\n  padding: 6px 0 22px;\n}\n\n/* live, the whale row follows immediately: the live block is the three lines, not a turn that ends\n   and a status row that starts somewhere below it */\n.dcd-flow-turn[data-live] {\n  padding-bottom: 0;\n}\n\n.dcd-flow-turn > :is(.dcd-flow-run, .dcd-flow-thought, .dcd-flow-steps) {\n  margin: 1px 0;\n}\n\n.dcd-flow-turn > [data-chat-flow-kind=user] + :is(.dcd-flow-run, .dcd-flow-thought, .dcd-flow-steps) {\n  margin-top: 10px;\n}\n\n.dcd-flow-turn > :is(.dcd-flow-run, .dcd-flow-thought, .dcd-flow-steps) + [data-chat-flow-kind=assistant-step] {\n  margin-top: 12px;\n}\n\n.dcd-flow-turn > [data-chat-flow-kind=assistant-step] + :is(.dcd-flow-run, .dcd-flow-thought, .dcd-flow-steps) {\n  margin-top: 14px;\n}\n\n.dcd-flow-turn > [data-open] + :is(.dcd-flow-run, .dcd-flow-thought, .dcd-flow-steps) {\n  margin-top: 6px;\n}\n\n.dcd-flow-card > [data-chat-flow-key] {\n  margin: 0 !important;\n}\n\n/* a turn that was stopped or failed ends on a quiet line: dsh's own 「已停止」/「处理失败」 header\n   (which replaces 「已完成，用时」) is one of the rows this view takes over, so say it here */\n.dcd-flow-end {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  margin: 10px 0 0;\n  font-size: var(--dsh-content-font-size, 14px);\n  line-height: calc(22px + var(--dsh-content-font-delta, 0px));\n  color: var(--dsw-alias-label-tertiary);\n}\n\n.dcd-flow-end .dcd-flow-icon {\n  opacity: 0.6;\n}\n\n.dcd-flow-end[data-failed] {\n  color: var(--dsw-alias-label-danger, #e5484d);\n}\n\n/* ---- the rows and cards dsh still draws: a slash command (/goal), an injected document\n   (dsh-doc, a recalled memory), the system prompt, a skill's instructions, the compaction marker,\n   a question's answer card. The flow takes over the thinking lines and the tool runs; everything\n   else stays native, and natively it is a 24px line at 13px beside a 16+6px glyph box, its body\n   laid on the code-block well — a cool blue-white that reads as a different surface from every\n   card around it. These sit in the same column and are read in the same breath as our rows, so\n   they take our rhythm — a 22px line at 14px, 8px after the glyph — and our two surfaces: the\n   quiet grey band a tool body opens into, a hairline and a 12px radius for a card. The tool rows\n   are left alone on purpose: inside an open run they carry a 44px header of their own. */\n:is([data-chat-flow-kind=command], [data-chat-flow-kind=context], [data-chat-flow-kind=system-prompt]) [data-disclosure-row] {\n  height: calc(22px + var(--dsh-content-font-delta, 0px)) !important;\n}\n\n:is([data-chat-flow-kind=command], [data-chat-flow-kind=context], [data-chat-flow-kind=system-prompt]) [data-disclosure-row] :is([class*=_title], [class*=_source], [class*=_summary]) {\n  font-size: var(--dsh-content-font-size, 14px) !important;\n  line-height: calc(22px + var(--dsh-content-font-delta, 0px)) !important;\n}\n\n:is([data-chat-flow-kind=command], [data-chat-flow-kind=context], [data-chat-flow-kind=system-prompt]) [class*=_leading] {\n  margin-right: 8px !important;\n}\n\n/* a skill card keeps a row element of its own instead of a disclosure row: same line, same glyph gap */\n[data-chat-flow] [data-tool=skill] > [class*=_row] {\n  height: calc(22px + var(--dsh-content-font-delta, 0px)) !important;\n}\n\n[data-chat-flow] [data-tool=skill] [class*=_leading] {\n  margin-right: 8px !important;\n}\n\n[data-chat-flow] [data-tool=skill] :is([class*=_title], [class*=_summary]) {\n  font-size: var(--dsh-content-font-size, 14px) !important;\n  line-height: calc(22px + var(--dsh-content-font-delta, 0px)) !important;\n}\n\n/* the compaction marker sizes its own sticky header from this line, so moving the line moves both */\n[data-chat-flow] [class*=_compactionRow] {\n  --dsh-compaction-header-height:calc(22px + var(--dsh-content-font-delta,0px));\n}\n\n/* a question card settles its answers on the reading line, not on dsh's 24px grid */\n[data-chat-flow] [class*=_card]:has(> [class*=_item] > [class*=_question]) {\n  gap: 12px !important;\n  padding: 14px 16px !important;\n  border-radius: 12px !important;\n}\n\n[data-chat-flow] [class*=_card]:has(> [class*=_item] > [class*=_question]) :is([class*=_question], [class*=_answer]) {\n  line-height: calc(22px + var(--dsh-content-font-delta, 0px)) !important;\n}\n\n/* every expanded body takes the grey well the tool rows open into, not dsh's blue-tinted code block */\n[data-chat-flow] :is([data-chat-flow-kind=command], [data-chat-flow-kind=context], [data-chat-flow-kind=system-prompt]) [class*=_body]:not([class*=_bodyWrap]), [data-tool=skill] [class*=_instructionsCard] {\n  background: var(--dcd-band, rgba(15, 23, 42, 0.045)) !important;\n  border-color: var(--dsw-alias-border-l1) !important;\n  border-radius: 12px !important;\n}"

// ===== src/styles/09-auto-older.scss
/* compiled from src/styles/09-auto-older.scss by build.mjs — edit the .scss, not this file */
const CSS_AUTO_OLDER = "/*!\n * Styles for auto-older (parts/09-auto-older.ts): the 「加载更早」 button reads as a quiet status\n * line once the part presses it for the reader — still a real button (keyboard, and a fallback).\n */\n[data-chat-flow] > [class*=_older] > button {\n  all: unset;\n  box-sizing: border-box;\n  display: block;\n  margin: 4px auto 12px;\n  padding: 4px 10px;\n  border-radius: 6px;\n  cursor: pointer;\n  font-size: 12px;\n  line-height: 18px;\n  color: var(--dsw-alias-label-tertiary);\n}\n\n[data-chat-flow] > [class*=_older] > button:hover {\n  color: var(--dsw-alias-label-secondary);\n}\n\n[data-chat-flow] > [class*=_older] > button:focus-visible {\n  outline: 2px solid var(--dsw-alias-border-focus, #4d8cff);\n}\n\n[data-chat-flow] > [class*=_older] > button:disabled {\n  cursor: default;\n}"

// ===== src/styles/10-user-markdown.scss
/* compiled from src/styles/10-user-markdown.scss by build.mjs — edit the .scss, not this file */
const CSS_USER_MARKDOWN = "/*!\n * Styles for user-markdown (parts/10-user-markdown.ts): the user's own bubble drawn with dsh's\n * MarkdownText at the bubble's own size and colour. A single paragraph stays inline so an\n * @session chip mid-sentence still flows; lists / code / tables lay out as blocks.\n */\n.dcd-type-user-md {\n  display: inline;\n}\n\n.dcd-type-user-md [class*=_markdown] {\n  font-size: inherit !important;\n  line-height: 1.65 !important;\n  color: inherit !important;\n  white-space: pre-wrap;\n  max-width: 100%;\n  min-width: 0;\n  overflow-wrap: anywhere;\n}\n\n.dcd-type-user-md [class*=_markdown] > :first-child {\n  margin-top: 0 !important;\n}\n\n.dcd-type-user-md [class*=_markdown] > :last-child {\n  margin-bottom: 0 !important;\n}\n\n.dcd-type-user-md [class*=_markdown] p {\n  margin: 0 0 0.6em !important;\n  white-space: pre-wrap;\n}\n\n.dcd-type-user-md [class*=_markdown] p:last-child {\n  margin-bottom: 0 !important;\n}\n\n/* one paragraph flows inline so an @session chip mid-sentence stays on the line */\n.dcd-type-user-md [class*=_markdown]:has(> p:only-child) {\n  display: inline;\n}\n\n.dcd-type-user-md [class*=_markdown]:has(> p:only-child) > p {\n  display: inline;\n  margin: 0 !important;\n}\n\n.dcd-type-user-md [class*=_markdown] :is(h1, h2, h3, h4) {\n  font-weight: 600 !important;\n  line-height: 1.4 !important;\n  margin: 0.85em 0 0.4em !important;\n  color: inherit !important;\n  letter-spacing: -0.005em;\n}\n\n.dcd-type-user-md [class*=_markdown] h1 {\n  font-size: 1.25em !important;\n}\n\n.dcd-type-user-md [class*=_markdown] h2 {\n  font-size: 1.15em !important;\n}\n\n.dcd-type-user-md [class*=_markdown] h3 {\n  font-size: 1.06em !important;\n}\n\n.dcd-type-user-md [class*=_markdown] h4 {\n  font-size: 1em !important;\n}\n\n.dcd-type-user-md [class*=_markdown] :is(ul, ol) {\n  margin: 0.3em 0 0.6em !important;\n  padding-left: 1.4em !important;\n}\n\n.dcd-type-user-md [class*=_markdown] li {\n  margin: 0.15em 0 !important;\n}\n\n.dcd-type-user-md [class*=_markdown] li::marker {\n  color: var(--dsw-alias-label-tertiary);\n}\n\n.dcd-type-user-md [class*=_markdown] li > :is(ul, ol) {\n  margin: 0.1em 0 !important;\n}\n\n.dcd-type-user-md [class*=_markdown] strong {\n  font-weight: 600;\n}\n\n.dcd-type-user-md [class*=_markdown] :not(pre) > code {\n  font-size: 0.88em !important;\n  padding: 0.1em 0.35em !important;\n  border-radius: 5px !important;\n  border: 0 !important;\n  background: var(--dcd-type-code-bg, rgba(31, 30, 29, 0.055)) !important;\n  color: var(--dcd-type-code-fg, #8a3b22) !important;\n}\n\n.dcd-type-user-md [class*=_markdown] pre {\n  margin: 0.45em 0 !important;\n  white-space: pre !important;\n  max-width: 100%;\n  overflow: auto;\n}\n\n.dcd-type-user-md [class*=_markdown] pre, .dcd-type-user-md [class*=_markdown] pre code {\n  font-size: calc(var(--dsh-code-font-size, 11px) + 1.5px) !important;\n  line-height: 1.6 !important;\n}\n\n.dcd-type-user-md [class*=_markdown] blockquote {\n  border-left: 2px solid var(--dsw-alias-border-l2) !important;\n  padding-left: 0.9em !important;\n  margin: 0.45em 0 !important;\n  color: var(--dcd-type-text-2, inherit) !important;\n}\n\n.dcd-type-user-md [class*=_markdown] [class*=_tableScroll] {\n  margin: 0.45em 0 !important;\n  max-width: 100%;\n  overflow: auto;\n}\n\n.dcd-type-user-md [class*=_markdown] table {\n  font-size: 0.95em !important;\n  border-collapse: collapse;\n  margin: 0 !important;\n}\n\n.dcd-type-user-md [class*=_markdown] :is(th, td) {\n  padding: 5px 16px 5px 0 !important;\n}\n\n.dcd-type-user-md [class*=_markdown] th {\n  font-weight: 600 !important;\n  border-bottom: 1px solid var(--dsw-alias-border-l1) !important;\n}\n\n.dcd-type-user-md [class*=_markdown] td {\n  border-bottom: 1px solid var(--dsw-alias-border-l2) !important;\n}\n\n.dcd-type-user-md [class*=_markdown] tr:last-child > td {\n  border-bottom: 0 !important;\n}\n\n.dcd-type-user-md [class*=_markdown] hr {\n  border: 0 !important;\n  border-top: 1px solid var(--dsw-alias-border-l1) !important;\n  margin: 0.85em 0 !important;\n}\n\n.dcd-type-user-md [class*=_markdown] a {\n  text-underline-offset: 2px;\n  text-decoration-thickness: 1px;\n}\n\n.dcd-type-user-md [class*=_markdown] img {\n  max-width: 100%;\n  height: auto;\n  border-radius: 8px;\n}"

// ===== src/parts/00-dom-hub.js
"use strict";
/*!
 * dom-hub — one shared, frame-coalesced MutationObserver for every DOM-scanning part.
 *
 * Before, five parts each watched document.body with their own observer and timer (16/40/50/50/80 ms),
 * so a single streamed token woke five full-document scans, several of which forced synchronous
 * layout. Here one observer collects mutations and dispatches them once per animation frame to every
 * subscriber. Subscribers stay cheap by testing the mutation records for relevance (kit.dom.touches)
 * instead of re-scanning the whole transcript: pure text streaming no longer wakes the tool-group,
 * plan-card or fork-button passes at all.
 */
part({
    id: 'dom-hub',
    factory(require, kit) {
        const subs = new Set();
        let mo = null;
        let raf = 0;
        let pending = [];
        // the union of what any subscriber cares about; characterData is needed by bash-highlight only,
        // but coalescing it here costs one callback per frame instead of a fifth observer
        const CONFIG = {
            childList: true, subtree: true, characterData: true, attributes: true,
            // `data-dcd-group-hide` is written by tool-groups on every member row on every pass; waking every
            // subscriber for our own bookkeeping cost the plan card a sync() per grouping pass. Nothing
            // watches it, so it is out of the filter.
            attributeFilter: ['data-state', 'aria-expanded', 'src', 'data-status', 'data-turn-process-hidden', 'hidden'],
        };
        function flush() {
            raf = 0;
            const recs = pending;
            pending = [];
            for (const s of [...subs]) {
                try {
                    s.fn(recs);
                }
                catch (e) {
                    console.error('[dsh-conversation-enhancer/dom-hub]', e);
                }
            }
        }
        function schedule() { if (!raf)
            raf = requestAnimationFrame(flush); }
        function ensure() {
            if (mo)
                return;
            // loop, not spread: one huge batch must not hit the argument limit
            mo = new MutationObserver((recs) => { for (const r of recs)
                pending.push(r); schedule(); });
            mo.observe(document.body, CONFIG);
        }
        // <html> attributes several parts read (data-dcd-view view, lang): one observer for them all,
        // instead of a private MutationObserver per part. Subscribers re-read the attributes
        // themselves — there are only these two, and a read is cheaper than dispatching records.
        const attrSubs = new Set();
        let attrMo = null;
        function ensureAttr() {
            if (attrMo)
                return;
            attrMo = new MutationObserver(() => { for (const s of [...attrSubs]) {
                try {
                    s();
                }
                catch (e) {
                    console.error('[dsh-conversation-enhancer/dom-hub]', e);
                }
            } });
            attrMo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-dcd-view', 'lang'] });
        }
        /** Did any record add / remove / touch an element matching sel (or inside one)? O(records), not O(page). */
        function touches(records, sel) {
            for (const r of records) {
                if (r.type === 'childList') {
                    for (const n of r.addedNodes)
                        if (n.nodeType === 1 && (n.matches(sel) || n.querySelector(sel)))
                            return true;
                    for (const n of r.removedNodes)
                        if (n.nodeType === 1 && (n.matches(sel) || n.querySelector(sel)))
                            return true;
                }
                else {
                    let t = r.target;
                    if (t && t.nodeType === 3)
                        t = t.parentElement;
                    if (t && t.nodeType === 1 && (t.matches(sel) || t.closest(sel)))
                        return true;
                }
            }
            return false;
        }
        kit.dom = {
            /** fn(records) runs once per frame while mutations occur; returns an unsubscribe. */
            subscribe(fn) {
                const s = { fn };
                subs.add(s);
                ensure();
                return () => {
                    subs.delete(s);
                    if (!subs.size) {
                        if (mo) {
                            mo.disconnect();
                            mo = null;
                        }
                        if (raf) {
                            cancelAnimationFrame(raf);
                            raf = 0;
                        }
                        pending = [];
                    }
                };
            },
            touches,
            /** fn() runs whenever <html>'s data-dcd-view / lang changes; returns an unsubscribe. */
            attr(fn) {
                attrSubs.add(fn);
                ensureAttr();
                return () => {
                    attrSubs.delete(fn);
                    if (!attrSubs.size && attrMo) {
                        attrMo.disconnect();
                        attrMo = null;
                    }
                };
            },
            /** ask for a dispatch next frame even without a mutation (manual toggles) */
            poke() { schedule(); },
        };
        return { inject: [], apply() { } };
    },
});

// ===== src/parts/00-shared.js
"use strict";
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
        const zh = () => /^zh/i.test(document.documentElement.lang || navigator.language || 'zh');
        /* ---------- tool vocabulary (03 classifies from the DOM, 08 from the node data) ---------- */
        const TOOL_KIND = {
            bash: 'command', pwsh: 'command', bash_persistent: 'command', terminal: 'command', pwsh_persistent: 'command',
            read: 'read', read_image: 'read', view_image: 'read', read_file: 'read',
            grep: 'search', glob: 'search', search: 'search', lsp: 'search', find_definition: 'search', find_references: 'search', find_implementation: 'search',
            write: 'edit', edit: 'edit', str_replace: 'edit', str_replace_editor: 'edit', apply_patch: 'edit', multi_edit: 'edit',
            web_search: 'web', web_fetch: 'web', fetch: 'web',
            todo_write: 'plan', run_code: 'code',
            subagent: 'agent', send_message: 'agent', interrupt_agent: 'agent', list_agents: 'agent',
        };
        const ORDER = ['agent', 'command', 'read', 'search', 'edit', 'web', 'code', 'plan', 'other'];
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
        };
        const words = () => (zh() ? WORDS.zh : WORDS.en);
        /** 「命令 ×3 · 读取 ×2」 from a {kind: count} map, in ORDER order (capitalised in English). */
        const labelOf = (counts) => {
            let s = ORDER.filter((k) => counts[k]).map((k) => words()[k](counts[k])).join(words().join);
            if (!zh())
                s = s.charAt(0).toUpperCase() + s.slice(1);
            return s;
        };
        /** 「13 秒」 / 「1 分 11 秒」 — the unit the rest of the transcript uses. */
        const durSec = (s) => {
            s = Math.max(0, Math.floor(s));
            if (zh())
                return s < 60 ? `${s} 秒` : `${Math.floor(s / 60)} 分 ${s % 60} 秒`;
            return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
        };
        /* ---------- the chevron every fold line shares ---------- */
        const CHEV_D = 'M4.5 2.5 8 6l-3.5 3.5';
        const CHEV_SVG = `<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="${CHEV_D}" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
        const CHEV_MASK = `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'><path d='${CHEV_D}' fill='none' stroke='black' stroke-width='1.4' stroke-linecap='round' stroke-linejoin='round'/></svg>`)}")`;
        /* ---------- attribute helpers (diffed, so repeated passes stay cheap) ---------- */
        /** String attribute: null / false removes, anything else sets. */
        const setAttr = (el, k, v) => {
            if (v === null || v === false) {
                if (el.hasAttribute(k))
                    el.removeAttribute(k);
            }
            else if (el.getAttribute(k) !== String(v))
                el.setAttribute(k, String(v));
        };
        /** Boolean marker attribute. */
        const setFlag = (el, k, on) => { if (on) {
            if (!el.hasAttribute(k))
                el.setAttribute(k, '');
        }
        else if (el.hasAttribute(k))
            el.removeAttribute(k); };
        /* ---------- 动效 / Motion: the bundle's one switch for decorative transitions ---------- */
        const MOTION_KEY = 'dsh-conversation-enhancer.motion';
        /** the key this bundle wrote before it was renamed: read once, so a saved switch survives */
        const MOTION_KEY_OLD = 'dsh-conversation-display.motion';
        const MOTION_KEY_OLDEST = 'dsh-claude-display.motion';
        let motionOn = true;
        try {
            motionOn = (localStorage.getItem(MOTION_KEY) ?? localStorage.getItem(MOTION_KEY_OLD) ?? localStorage.getItem(MOTION_KEY_OLDEST)) !== 'off';
        }
        catch { }
        const motionSubs = new Set();
        const reflectMotion = () => {
            if (motionOn)
                document.documentElement.removeAttribute('data-dcd-anim');
            else
                document.documentElement.setAttribute('data-dcd-anim', 'off');
        };
        const motion = {
            get: () => motionOn,
            subscribe(fn) { motionSubs.add(fn); return () => motionSubs.delete(fn); },
            set(v) {
                motionOn = !!v;
                try {
                    localStorage.setItem(MOTION_KEY, motionOn ? 'on' : 'off');
                }
                catch { }
                reflectMotion();
                for (const f of motionSubs)
                    f();
            },
        };
        /* ---------- styles the summary lines share (styles/00-shared.scss) ---------- */
        const sheet = kit.sheet('display-shared', CSS_SHARED);
        kit.vocab = {
            zh, TOOL_KIND, ORDER, WORDS, words, labelOf, durSec,
            CHEV_D, CHEV_SVG, CHEV_MASK, setAttr, setFlag, motion,
        };
        return {
            inject: [],
            apply() { sheet.ensure(); reflectMotion(); },
        };
    },
});

// ===== src/parts/01-transcript-view.js
"use strict";
/*!
 * dsh-transcript-view — browser half.
 *
 * A quiet transcript view, replacing dsh's own 工作步骤展示 (Settings › 通用设置):
 *   标准 / Normal     replies and one-line command rows, thinking hidden
 *   思考 / Thinking   thinking expanded
 *   详尽 / Verbose    thinking plus every command's input and output
 * dsh's own modes fold finished turns and group steps themselves, which fought this view and
 * dsh-tool-groups. So this part takes the setting over: dsh's value (ui-chat.transcriptView) is held
 * at 完全展开, the only mode where dsh folds nothing, and this part's own row is registered under the
 * same slot id at a lower priority, so it renders in place of dsh's row (and its two collapse rows,
 * which do nothing without folding). Display only: it hides reasoning rows with CSS and opens dsh's
 * own disclosures. `html[data-dcd-view]` carries the view for other parts; `dcd:view:set` (detail = a view)
 * switches it, e.g. from the title menu.
 */
part({
    id: 'dsh-transcript-view',
    factory(require, kit) {
        const TV_MODES = ['normal', 'thinking', 'verbose'];
        const TV_KEY = 'dsh-conversation-enhancer.view';
        /** the key this part wrote before the bundle was renamed */
        const TV_KEY_OLD = 'dsh-conversation-display.view';
        const TV_KEY_OLDEST = 'dsh-transcript-view.mode';
        /** dsh's saved mode → this view, for the first run (before this part owned the setting) */
        const FROM_DSH = { compact: 'normal', standard: 'normal', detailed: 'thinking', verbose: 'verbose', normal: 'thinking', expanded: 'thinking' };
        /** the one native mode with no folding or grouping of its own */
        const NATIVE = 'verbose';
        const ui = kit.settingsUI();
        const { React, h } = kit;
        const OPTIONS = [
            { v: 'normal', zh: '标准', en: 'Normal' },
            { v: 'thinking', zh: '思考', en: 'Thinking' },
            { v: 'verbose', zh: '详尽', en: 'Verbose' },
        ];
        const DESC = {
            normal: ['只显示回复和命令，隐藏思考过程', 'Replies and commands; thinking hidden'],
            thinking: ['同时展开模型的思考过程', 'Also expand the model\'s thinking'],
            verbose: ['展开所有思考，以及每条命令的输入和输出', 'Expand all thinking and every command\'s input and output'],
        };
        const tvSheet = kit.sheet('transcript-view', CSS_TRANSCRIPT_VIEW);
        const ensureTvStyle = tvSheet.ensure;
        /**
         * Process-wide transcript view. The choice is dsh's own 工作步骤展示 setting (ui-chat.transcriptView,
         * Settings › 通用设置), mapped to how this view shows thinking and tool rows (see FROM_DSH);
         * `data-dcd-view` on <html> drives the CSS, and an observer
         * opens dsh's own disclosures (reasoning rows, tool cards) for Thinking / Verbose.
         * Rows it opened are closed again when the view steps back down; rows the user
         * opened or closed by hand are left alone (each row is considered once per view).
         */
        function createTranscriptView() {
            let mode = 'normal';
            const subs = new Set();
            let seen = new WeakSet();
            /** Controls this view opened, by flow key — survives dsh re-mounting the row, so stepping down can close it again. */
            const opened = new Set();
            let un = null;
            let timer = 0;
            const CTRL = '[data-expandable="true"],button[data-turn-process]';
            const itemOf = (el) => el.closest('[data-chat-flow-kind]');
            const keyOf = (el) => {
                const item = itemOf(el);
                const k = item && (item.getAttribute('data-chat-flow-key') || item.getAttribute('data-chat-node-key'));
                return k ? `${k}|${el.hasAttribute('data-turn-process') ? 'tp' : 'row'}` : null;
            };
            const wants = (el, m) => {
                const item = itemOf(el);
                if (!item)
                    return false;
                const kind = item.getAttribute('data-chat-flow-kind');
                if (kind === 'turn-process')
                    return m !== 'normal';
                const reasoning = item.getAttribute('data-chat-group-part') === 'reasoning';
                if (m === 'verbose')
                    return reasoning || kind === 'tool-call';
                if (m === 'thinking')
                    return reasoning;
                return false;
            };
            const pass = () => {
                timer = 0;
                for (const sc of qa('[data-conversation-scroll]')) {
                    for (const el of qa(CTRL, sc)) {
                        const k = keyOf(el);
                        if (!k)
                            continue;
                        const isOpen = el.getAttribute('aria-expanded') === 'true';
                        if (wants(el, mode)) {
                            // open once per view: a row the user closes by hand stays closed
                            if (isOpen || seen.has(el))
                                continue;
                            seen.add(el);
                            opened.add(k);
                            try {
                                el.click();
                            }
                            catch { }
                        }
                        else if (opened.has(k)) {
                            opened.delete(k);
                            if (isOpen) {
                                try {
                                    el.click();
                                }
                                catch { }
                            }
                        }
                    }
                }
            };
            // setTimeout, not rAF: rAF stops in a hidden pane or background window
            const schedule = () => { if (!timer)
                timer = setTimeout(pass, 40); };
            const observe = () => {
                // one shared, rAF-coalesced watcher for the whole bundle; only structural rows can change
                // what we expand, so pure text streaming never wakes this pass
                if (!un)
                    un = kit.dom.subscribe((recs) => {
                        if (mode === 'normal' && !opened.size)
                            return;
                        if (!kit.dom.touches(recs, '[data-expandable],button[data-turn-process],[data-chat-group-part="reasoning"],[data-chat-flow-kind]'))
                            return;
                        schedule();
                    });
                schedule();
            };
            /** Keep the reading position while rows open / close: pin the first item in view (or the bottom) for a moment. */
            function holdScroll() {
                const holds = [];
                for (const sc of document.querySelectorAll('[data-conversation-scroll]')) {
                    if (!sc.clientHeight)
                        continue;
                    const atBottom = sc.scrollHeight - sc.scrollTop - sc.clientHeight < 48;
                    const top = sc.getBoundingClientRect().top;
                    let anchor = null;
                    if (!atBottom) {
                        for (const it of qa('[data-chat-flow-kind]', sc)) {
                            if (it.getAttribute('data-chat-group-part') === 'reasoning' || it.getAttribute('data-chat-flow-kind') === 'turn-process')
                                continue;
                            const r = it.getBoundingClientRect();
                            if (r.height && r.bottom > top + 8) {
                                anchor = { key: it.getAttribute('data-chat-flow-key'), el: it, off: r.top - top };
                                break;
                            }
                        }
                    }
                    holds.push({ sc, atBottom, anchor });
                }
                if (!holds.length)
                    return;
                let stop = false;
                const cancel = () => { stop = true; };
                const until = Date.now() + 900;
                const step = () => {
                    if (stop)
                        return;
                    for (const { sc, atBottom, anchor } of holds) {
                        if (!sc.isConnected)
                            continue;
                        if (atBottom) {
                            sc.scrollTop = sc.scrollHeight;
                            continue;
                        }
                        if (!anchor)
                            continue;
                        let el = anchor.el;
                        if (!el.isConnected && anchor.key)
                            el = sc.querySelector(`[data-chat-flow-key="${CSS.escape(anchor.key)}"]`) || el;
                        if (!el.isConnected)
                            continue;
                        const d = el.getBoundingClientRect().top - sc.getBoundingClientRect().top - anchor.off;
                        if (Math.abs(d) > 1)
                            sc.scrollTop += d;
                    }
                    if (Date.now() < until)
                        setTimeout(step, 16);
                    else
                        for (const { sc } of holds) {
                            sc.removeEventListener('wheel', cancel);
                            sc.removeEventListener('touchstart', cancel);
                        }
                };
                for (const { sc } of holds) {
                    sc.addEventListener('wheel', cancel, { passive: true, once: true });
                    sc.addEventListener('touchstart', cancel, { passive: true, once: true });
                }
                step();
            }
            const applyMode = () => {
                document.documentElement.setAttribute('data-dcd-view', mode);
                // dsh-claude-shell's title menu still reads html[data-dtv]: keep the mirror until it is renamed
                document.documentElement.setAttribute('data-dtv', mode);
                seen = new WeakSet();
                observe();
                pass();
            };
            return {
                get: () => mode,
                subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
                set(next) {
                    if (!TV_MODES.includes(next) || next === mode)
                        return;
                    mode = next;
                    try {
                        localStorage.setItem(TV_KEY, next);
                    }
                    catch { }
                    holdScroll();
                    applyMode();
                    for (const fn of subs)
                        fn();
                },
                /** First value from the setting: no scroll hold, nothing to notify yet. */
                init(next) { if (TV_MODES.includes(next))
                    mode = next; },
                start() { ensureTvStyle(); applyMode(); },
                dispose() {
                    if (un) {
                        un();
                        un = null;
                    }
                    if (timer)
                        clearTimeout(timer);
                    document.documentElement.removeAttribute('data-dcd-view');
                    document.documentElement.removeAttribute('data-dtv');
                    tvSheet.remove();
                },
            };
        }
        // ------------------------------------------------------------------ registration
        /** 工作步骤展示, in place of dsh's row */
        function ViewRow({ tv }) {
            const mode = React.useSyncExternalStore(tv.subscribe, tv.get);
            React.useEffect(() => { ui.sheet.ensure(); }, []);
            const [zh, en] = DESC[mode];
            return h(ui.Row, { label: ui.S('工作步骤展示', 'Work details'), desc: ui.S(zh, en) }, h(ui.Select, { label: ui.S('工作步骤展示', 'Work details'), value: mode, options: OPTIONS, onChange: (v) => tv.set(v) }));
        }
        return {
            inject: ['configForms', 'slots'],
            apply(ctx) {
                const form = ctx.configForms.get('ui-chat');
                const saved = () => form.getSnapshot().value?.transcriptView;
                const tv = createTranscriptView();
                // own choice; on the first run, carry over what dsh's setting showed
                let first = null;
                try {
                    first = localStorage.getItem(TV_KEY) ?? localStorage.getItem(TV_KEY_OLD) ?? localStorage.getItem(TV_KEY_OLDEST);
                }
                catch { }
                tv.init(TV_MODES.includes(first) ? first : FROM_DSH[saved()] || 'normal');
                ctx.effect(() => { tv.start(); return () => tv.dispose(); }, 'transcript-view: mode, styles and observer');
                // hold dsh's own mode at 完全展开 so it never folds or groups underneath this view
                const pin = () => {
                    const v = saved();
                    if (v === undefined)
                        return;
                    // first run: dsh's setting may arrive after start; carry its value over once
                    if (!TV_MODES.includes(first) && FROM_DSH[v]) {
                        first = FROM_DSH[v];
                        tv.set(first);
                    }
                    if (v !== NATIVE)
                        Promise.resolve(form.set('transcriptView', NATIVE)).catch(() => { });
                };
                ctx.effect(() => { pin(); return form.subscribe(pin); }, 'transcript-view: hold dsh\'s work details at 完全展开');
                // dsh's 工作步骤展示 row is id transcript-view at priority 0: same id, lower priority renders instead
                ctx.slots.inject('settings.general.item', () => ctx.slots.register({
                    name: 'settings.general.item', id: 'transcript-view', order: 12, priority: -10,
                }, () => h(ViewRow, { tv })));
                // other parts (the title menu) switch the view with `dcd:view:set`
                ctx.effect(() => {
                    const onSet = (e) => tv.set(e.detail);
                    window.addEventListener('dcd:view:set', onSet);
                    // the old event name, still dispatched by dsh-claude-shell's title menu
                    window.addEventListener('dtv:set', onSet);
                    return () => { window.removeEventListener('dcd:view:set', onSet); window.removeEventListener('dtv:set', onSet); };
                }, 'transcript-view: dcd:view:set bridge');
            },
        };
    },
});

// ===== src/parts/02-transcript-polish.js
"use strict";
/*!
 * dsh-transcript-polish — browser half.
 *
 * Small quiet touches in the transcript: action tooltips (copy, like,
 * dislike, branch…) open above their button instead of over the input box,
 * the turn header drops its rule, and the assistant action row's display is
 * configurable: each known button can be shown, collapsed behind a single ⋯
 * overflow, or hidden, and reordered — managed on the bundle's own plugin page
 * (侧边栏 › 插件 › 已安装 › 对话显示), which also explains that this
 * plugin's 工作步骤展示 takes over the system setting.
 *
 * Display-only: buttons keep whatever registration / DOM the plugins gave them.
 * We add marker attributes + a stylesheet (visibility and flex order); we never
 * reparent, restyle inline, or discover buttons at runtime.
 */
part({
    id: 'dsh-transcript-polish',
    factory(require, kit) {
        const { React, h } = kit;
        const ui = kit.settingsUI();
        const V = kit.vocab;
        const { ensure: ensureStyle, remove: removeStyle } = kit.sheet('transcript-polish', CSS_TRANSCRIPT_POLISH);
        // ---- fork-and-edit from the user message (bridges message-edit's turn-tail trigger)
        const TRIGGER_TEXT = /^(编辑并重发|Edit and resend)$/i;
        const BRANCH = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="4.5" cy="3.5" r="1.6" stroke="currentColor" stroke-width="1.3"/><circle cx="4.5" cy="12.5" r="1.6" stroke="currentColor" stroke-width="1.3"/><circle cx="11.5" cy="5.5" r="1.6" stroke="currentColor" stroke-width="1.3"/><path d="M4.5 5.1v5.8M11.5 7.1c0 2.4-2.2 2.9-4.6 3.4-.9.2-1.6.6-2 1" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>';
        function tailTrigger(turn) {
            for (const b of qa(`[data-chat-flow-kind="turn-tail"][data-chat-turn="${CSS.escape(String(turn))}"] [data-slot="conversation.chat.turnTail"] button`)) {
                if (b.hasAttribute('data-dcd-act-fork-src') || TRIGGER_TEXT.test(b.textContent.trim()))
                    return b;
            }
            return null;
        }
        function sync() {
            // mark every message-edit trigger so CSS can hide it
            for (const b of document.querySelectorAll('[data-slot="conversation.chat.turnTail"] button')) {
                if (!b.hasAttribute('data-dcd-act-fork-src') && TRIGGER_TEXT.test(b.textContent.trim()))
                    b.setAttribute('data-dcd-act-fork-src', '');
            }
            for (const item of qa('[data-chat-flow-kind="user"][data-chat-turn]')) {
                const turn = item.dataset.chatTurn;
                const actions = item.querySelector('[class*="_actions"]');
                if (!actions)
                    continue;
                const have = actions.querySelector('.dcd-act-fork');
                const src = tailTrigger(turn);
                if (!src) {
                    if (have)
                        have.remove();
                    continue;
                }
                if (have)
                    continue;
                const copy = actions.querySelector('button');
                const zh = /编辑/.test(src.textContent);
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = ((copy && copy.className) || '') + ' dcd-act-fork';
                btn.setAttribute('aria-label', zh ? '从这里分叉并编辑' : 'Fork here and edit');
                btn.title = zh ? '从这里分叉到新对话并编辑（原对话不变）' : 'Fork into a new conversation and edit (original stays)';
                btn.innerHTML = BRANCH;
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const t = tailTrigger(turn);
                    if (!t)
                        return;
                    t.click();
                    requestAnimationFrame(() => requestAnimationFrame(() => {
                        const area = t.closest('[data-chat-flow-kind="turn-tail"]');
                        const ta = area && area.querySelector('textarea');
                        if (ta) {
                            ta.scrollIntoView({ block: 'center', behavior: 'smooth' });
                            ta.focus();
                        }
                    }));
                });
                actions.appendChild(btn);
            }
            applyActions();
        }
        // ---- configurable reply-action display (show / fold / hide + order), persisted.
        // Fixed list of the buttons dsh and the known plugins register; no runtime discovery.
        const LS_KEY = 'dsh-conversation-enhancer.actions.v1';
        /** the key this page wrote before the bundle was renamed: a reader's own button order survives */
        const LS_KEY_OLD = 'dsh-conversation-display.actions.v1';
        const LS_KEY_OLDEST = 'dsh-transcript-actions.v1';
        const BAR = '[data-chat-flow-kind="turn-tail"] [class*="_actions"] ';
        const KNOWN = [
            { key: 'copy', zh: '复制', en: 'Copy', sel: '[data-icon="dsw-icon-copy-outline-regular"],[aria-label="复制"],[aria-label="Copy"]' },
            { key: 'branch', zh: '在新对话中分支', en: 'Branch in new chat', sel: '[data-icon="dsw-icon-branch-outline-regular"],[aria-label="在新对话中分支"],[aria-label="Branch in new conversation"]' },
            { key: 'like', zh: '好的回答', en: 'Good response', sel: '[data-icon="dsw-icon-like-outline-regular"],[aria-label="好的回答"],[aria-label="Good response"]' },
            { key: 'dislike', zh: '有问题的回答', en: 'Bad response', sel: '[data-icon="dsw-icon-dislike-outline-regular"],[aria-label="有问题的回答"],[aria-label="Bad response"]' },
            { key: 'jump', zh: '在上下文视图中查看此轮', en: 'View turn in context', sel: '.lc-jump,[aria-label="在上下文视图中查看此轮"],[aria-label="View this turn in context view"]' },
            { key: 'memory', zh: '存入记忆', en: 'Save to memory', sel: '[aria-label="存入记忆"],[aria-label="Save to memory"]' },
        ];
        const MODES = [
            { v: 'show', zh: '显示', en: 'Show' },
            { v: 'fold', zh: '收起', en: 'Collapse' },
            { v: 'hide', zh: '隐藏', en: 'Hide' },
        ];
        const NEXT_MODE = { show: 'fold', fold: 'hide', hide: 'show' };
        const MODE_ICON = {
            show: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1.7 8S4.1 3.9 8 3.9 14.3 8 14.3 8 11.9 12.1 8 12.1 1.7 8 1.7 8Z"/><circle cx="8" cy="8" r="1.9"/></svg>',
            fold: '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><circle cx="3.5" cy="8" r="1.1"/><circle cx="8" cy="8" r="1.1"/><circle cx="12.5" cy="8" r="1.1"/></svg>',
            hide: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6.3 4.2A6.7 6.7 0 0 1 8 4c3.9 0 6.3 4 6.3 4a12 12 0 0 1-1.8 2.3M4.2 5.4A11.6 11.6 0 0 0 1.7 8s2.4 4 6.3 4c.8 0 1.5-.1 2.2-.4"/><path d="m2.6 2.6 10.8 10.8"/></svg>',
        };
        /** the grip dsh's own 调整模型顺序 dialog uses (IconDragHandleOutlineRegular, size 14) */
        const GRIP = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><use href="#dsw-icon-drag-handle-outline-regular"/></svg>';
        const ICON_FALLBACK = { copy: 'copy', branch: 'branch', like: 'like', dislike: 'dislike', jump: 'flat-list', memory: 'think' };
        /** the row's own icon, taken from the live button so third-party icons match too */
        function rowIcon(key) {
            const k = KNOWN.find((x) => x.key === key);
            const sel = k.sel.split(',').map((s) => BAR + s.trim()).join(',');
            const svg = document.querySelector(sel)?.querySelector('svg');
            if (svg)
                return svg.outerHTML;
            return `<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><use href="#dsw-icon-${ICON_FALLBACK[key]}-outline-regular"/></svg>`;
        }
        const DEFAULT_ORDER = ['copy', 'branch', 'like', 'dislike', 'jump', 'memory'];
        const defaultMode = (key) => (key === 'copy' || key === 'branch' ? 'show' : 'fold');
        let cfg = { order: DEFAULT_ORDER.slice(), mode: {} };
        try {
            const raw = localStorage.getItem(LS_KEY) ?? localStorage.getItem(LS_KEY_OLD) ?? localStorage.getItem(LS_KEY_OLDEST);
            if (raw) {
                const p = JSON.parse(raw);
                const order = (p.order || []).filter((k) => DEFAULT_ORDER.includes(k));
                for (const k of DEFAULT_ORDER)
                    if (!order.includes(k))
                        order.push(k);
                cfg = { order, mode: p.mode || {} };
            }
        }
        catch { }
        const subs = new Set();
        let snap = { cfg };
        const save = () => { try {
            localStorage.setItem(LS_KEY, JSON.stringify(cfg));
        }
        catch { } };
        const notify = () => { snap = { cfg }; for (const f of subs)
            f(); };
        const modeOf = (key) => cfg.mode[key] || defaultMode(key);
        const store = {
            subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
            get: () => snap,
            setMode(k, v) { cfg.mode[k] = v; save(); notify(); applyActions(); },
            move(k, d) {
                const i = cfg.order.indexOf(k), j = i + d;
                if (i < 0 || j < 0 || j >= cfg.order.length)
                    return;
                const o = cfg.order.slice();
                const [x] = o.splice(i, 1);
                o.splice(j, 0, x);
                cfg.order = o;
                save();
                notify();
                applyActions();
            },
        };
        // order is pure CSS (flex `order`), so plugin DOM / registration stays untouched
        let layoutTag = null;
        function layoutCSS() {
            const rules = [];
            cfg.order.forEach((key, i) => {
                const k = KNOWN.find((x) => x.key === key);
                if (!k)
                    return;
                rules.push(`${BAR}button:is(${k.sel}){order:${i}}`);
                // a plugin wrapper that owns a flex box moves with its button
                rules.push(`${BAR}div:has(> button:is(${k.sel})){order:${i}}`);
            });
            return rules.join('\n');
        }
        function ensureLayout() {
            if (!layoutTag) {
                layoutTag = document.createElement('style');
                layoutTag.dataset.plugin = 'display/transcript-actions-layout';
                document.head.appendChild(layoutTag);
            }
            layoutTag.textContent = layoutCSS();
        }
        function removeLayout() { if (layoutTag) {
            layoutTag.remove();
            layoutTag = null;
        } }
        // ---- the ⋯ overflow menu (re-dispatches to the hidden originals)
        const MORE = '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><circle cx="3.5" cy="8" r="1.1"/><circle cx="8" cy="8" r="1.1"/><circle cx="12.5" cy="8" r="1.1"/></svg>';
        let menuEl = null;
        let menuOwner = null; // the ⋯ button the open menu belongs to (a dataset/expando-free handle)
        let closingMenu = null; // a menu mid exit-fade
        function closeMenu() {
            if (!menuEl)
                return;
            const el = menuEl;
            const owner = menuOwner;
            menuEl = null;
            menuOwner = null;
            if (owner)
                owner.setAttribute('aria-expanded', 'false');
            // keyboard readers were inside the menu: hand focus back to the ⋯ button that opened it
            if (owner && el.contains(document.activeElement))
                owner.focus();
            // fade out one beat, then leave the page; a newer menu or a faster close replaces it
            const still = matchMedia('(prefers-reduced-motion: reduce)').matches
                || document.documentElement.getAttribute('data-dcd-anim') === 'off';
            if (still) {
                el.remove();
                return;
            }
            if (closingMenu)
                closingMenu.remove();
            el.setAttribute('data-closing', '');
            closingMenu = el;
            setTimeout(() => { if (closingMenu === el) {
                el.remove();
                closingMenu = null;
            } }, 130);
        }
        function openMenu(more, bar) {
            closeMenu();
            const zh = V.zh();
            const folded = cfg.order
                .map((key) => KNOWN.find((x) => x.key === key))
                .filter((k) => k && modeOf(k.key) === 'fold' && bar.querySelector(k.sel));
            if (!folded.length)
                return;
            menuEl = document.createElement('div');
            menuEl.className = 'dcd-act-menu';
            menuEl.setAttribute('role', 'menu');
            menuOwner = more;
            for (const k of folded) {
                const src = bar.querySelector(k.sel);
                const item = document.createElement('button');
                item.type = 'button';
                item.setAttribute('role', 'menuitem');
                const svg = src.querySelector('svg');
                if (svg)
                    item.appendChild(svg.cloneNode(true));
                const lab = document.createElement('span');
                lab.textContent = zh ? k.zh : k.en;
                item.appendChild(lab);
                item.addEventListener('click', (e) => { e.stopPropagation(); closeMenu(); src.click(); });
                menuEl.appendChild(item);
            }
            // arrow keys walk the items (Home / End jump), so the menu is usable without a pointer
            menuEl.addEventListener('keydown', (e) => {
                const list = qa('button', e.currentTarget);
                if (!list.length)
                    return;
                const i = list.indexOf(document.activeElement);
                let j = -1;
                if (e.key === 'ArrowDown')
                    j = i < 0 ? 0 : (i + 1) % list.length;
                else if (e.key === 'ArrowUp')
                    j = i < 0 ? list.length - 1 : (i - 1 + list.length) % list.length;
                else if (e.key === 'Home')
                    j = 0;
                else if (e.key === 'End')
                    j = list.length - 1;
                else
                    return;
                e.preventDefault();
                list[j].focus();
            });
            document.body.appendChild(menuEl);
            const r = more.getBoundingClientRect();
            const mh = menuEl.offsetHeight, mw = menuEl.offsetWidth;
            const left = Math.min(Math.max(8, r.left), window.innerWidth - mw - 8);
            let top = r.top - mh - 6;
            if (top < 8)
                top = r.bottom + 6;
            menuEl.style.left = left + 'px';
            menuEl.style.top = top + 'px';
            more.setAttribute('aria-expanded', 'true');
            const first = qa('button', menuEl)[0];
            if (first)
                first.focus();
        }
        function applyActions() {
            ensureLayout();
            const zh = V.zh();
            for (const bar of document.querySelectorAll('[data-chat-flow-kind="turn-tail"] [class*="_actions"]')) {
                let folded = 0;
                for (const k of KNOWN) {
                    const b = bar.querySelector(k.sel);
                    if (!b)
                        continue;
                    const mode = modeOf(k.key);
                    if (mode === 'hide') {
                        b.setAttribute('data-dcd-act-hide', '');
                        b.removeAttribute('data-dcd-act-fold');
                    }
                    else if (mode === 'fold') {
                        b.setAttribute('data-dcd-act-fold', '');
                        b.removeAttribute('data-dcd-act-hide');
                        folded++;
                    }
                    else {
                        b.removeAttribute('data-dcd-act-fold');
                        b.removeAttribute('data-dcd-act-hide');
                    }
                }
                let more = bar.querySelector('.dcd-act-more');
                if (folded === 0) {
                    if (more)
                        more.remove();
                    continue;
                }
                if (!more) {
                    more = document.createElement('button');
                    more.type = 'button';
                    const sib = bar.querySelector('button:not(.dcd-act-more)');
                    more.className = ((sib && sib.className) || '') + ' dcd-act-more';
                    more.setAttribute('aria-label', zh ? '更多操作' : 'More actions');
                    more.setAttribute('aria-haspopup', 'menu');
                    more.setAttribute('aria-expanded', 'false');
                    more.title = zh ? '更多操作' : 'More actions';
                    more.innerHTML = MORE;
                    more.addEventListener('click', (e) => { e.stopPropagation(); if (menuEl && menuOwner === more)
                        closeMenu();
                    else
                        openMenu(more, bar); });
                    bar.appendChild(more);
                }
            }
        }
        // ---- the bundle's plugin page: 回复操作按钮, plus a note on the 工作步骤展示 takeover
        function ActionsList() {
            const { cfg: c } = React.useSyncExternalStore(store.subscribe, store.get);
            const keys = c.order;
            const listRef = React.useRef(null);
            const dragRef = React.useRef(null);
            const [drag, setDrag] = React.useState(null);
            const icons = React.useMemo(() => Object.fromEntries(KNOWN.map((k) => [k.key, rowIcon(k.key)])), []);
            // one step per crossed midpoint, so the row follows the pointer and the order stays live.
            // offsetTop ignores the FLIP transforms, so animating rows cannot feed back into the hit-test
            const drop = (key, y) => {
                const list = listRef.current;
                const items = list ? qa('.dta-item', list) : [];
                if (!list || !items.length)
                    return;
                const top = y - list.getBoundingClientRect().top;
                let target = items.length - 1;
                for (let i = 0; i < items.length; i++) {
                    const off = items[i].offsetTop - list.offsetTop;
                    if (top < off + items[i].offsetHeight / 2) {
                        target = i;
                        break;
                    }
                }
                const cur = store.get().cfg.order.indexOf(key);
                if (cur >= 0 && target !== cur)
                    store.move(key, target > cur ? 1 : -1);
            };
            const endDrag = () => { dragRef.current = null; setDrag(null); };
            // FLIP: slide rows between their old and new slots whenever the order changes
            const posRef = React.useRef(null);
            React.useLayoutEffect(() => {
                const list = listRef.current;
                if (!list)
                    return;
                const items = qa('.dta-item', list);
                // relative to the list: layout shifts above it (async README, fonts) must not read as moves
                const now = new Map(items.map((el) => [el.getAttribute('data-key'), el.offsetTop - list.offsetTop]));
                const prev = posRef.current;
                posRef.current = now;
                if (!prev || matchMedia('(prefers-reduced-motion: reduce)').matches)
                    return;
                for (const el of items) {
                    const from = prev.get(el.getAttribute('data-key'));
                    const to = now.get(el.getAttribute('data-key'));
                    if (from == null || from === to)
                        continue;
                    el.style.transition = 'none';
                    el.style.transform = `translateY(${from - to}px)`;
                    requestAnimationFrame(() => requestAnimationFrame(() => {
                        el.style.transition = 'transform .16s cubic-bezier(.2,.8,.2,1)';
                        el.style.transform = '';
                        el.addEventListener('transitionend', () => { el.style.transition = ''; }, { once: true });
                    }));
                }
            });
            return h('div', { className: 'dta-list', ref: listRef }, keys.map((key) => {
                const k = KNOWN.find((x) => x.key === key);
                const mode = modeOf(key);
                const m = MODES.find((x) => x.v === mode);
                const label = ui.S(k.zh, k.en);
                const modeLabel = ui.S(m.zh, m.en);
                return h('div', { className: 'dta-item', key, 'data-key': key, 'data-dragging': drag === key ? '' : undefined }, h('span', { className: 'dta-ico', dangerouslySetInnerHTML: { __html: icons[key] } }), h('span', { className: 'dta-lbl' }, label), h('button', {
                    type: 'button', className: 'dta-mode', 'aria-label': `${label}：${modeLabel}`,
                    title: `${modeLabel} · ${ui.S('点击切换', 'Click to cycle')}`,
                    onClick: () => store.setMode(key, NEXT_MODE[mode]),
                    dangerouslySetInnerHTML: { __html: MODE_ICON[mode] },
                }), h('button', {
                    type: 'button', className: 'dta-grip', 'aria-label': `${ui.S('调整顺序', 'Reorder')} ${label}`,
                    'aria-keyshortcuts': 'ArrowUp ArrowDown', title: ui.S('拖动排序，或用上下方向键', 'Drag to reorder, or use the arrow keys'),
                    dangerouslySetInnerHTML: { __html: GRIP },
                    onPointerDown: (e) => { dragRef.current = key; setDrag(key); try {
                        e.currentTarget.setPointerCapture(e.pointerId);
                    }
                    catch { } },
                    onPointerMove: (e) => { if (dragRef.current === key)
                        drop(key, e.clientY); },
                    onPointerUp: endDrag,
                    onPointerCancel: endDrag,
                    onLostPointerCapture: endDrag,
                    onKeyDown: (e) => {
                        if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')
                            return;
                        e.preventDefault();
                        store.move(key, e.key === 'ArrowUp' ? -1 : 1);
                    },
                }));
            }));
        }
        const INFO = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" aria-hidden="true"><circle cx="8" cy="8" r="6.2"/><path d="M8 7.4v3.4"/><path d="M8 5.2v.2"/></svg>';
        // the bundle's one motion switch (display-shared): decorative transitions on or off at once
        function MotionRow() {
            const on = React.useSyncExternalStore(V.motion.subscribe, V.motion.get);
            return h(ui.Row, { label: ui.S('动效', 'Motion'), desc: ui.S('展开、收起与弹出的小动画；运行中的指示（脉冲、旋转、流光）不受影响', 'Small transitions for opens, closes and pop-ups; liveness markers (pulse, spin, shimmer) keep going') }, h(ui.Switch, { checked: on, onChange: (v) => V.motion.set(v), label: ui.S('动效', 'Motion') }));
        }
        function PluginPage() {
            React.useEffect(() => { ui.sheet.ensure(); }, []);
            return h('div', { className: 'dcd-act-page' }, h('div', { className: 'dcd-act-note' }, h('span', { dangerouslySetInnerHTML: { __html: INFO } }), h('span', null, ui.S('「工作步骤展示」由本插件覆盖系统默认：系统「通用设置 › 工作步骤展示」被固定为「完全展开」，其自身的折叠与分组不再生效，实际按插件的 标准 / 思考 / 详尽 显示。可在 通用设置 或标题菜单中切换。', 'Work details is taken over by this plugin: the system setting (Settings › General) is pinned to Fully expanded so its own folding and grouping stay off, and the plugin’s Normal / Thinking / Verbose decides what shows. Switch it in General settings or the title menu.'))), h(MotionRow), h('div', { className: 'dcd-act-head' }, ui.S('回复操作按钮', 'Reply actions')), h('div', { className: 'dcd-act-desc' }, ui.S('选择每个按钮显示、收起或隐藏，并调整顺序', 'Show, collapse or hide each button, and reorder them')), h(ActionsList), h('div', { className: 'dta-foot' }, ui.S('点图标切换 显示 → 收起 → 隐藏；拖动右侧手柄调整顺序', 'Click the icon to cycle show → collapse → hide; drag the handle to reorder')));
        }
        function startForkBridge() {
            // only a new / removed user message or turn-tail can change the fork / fold buttons; pure text
            // streaming must not wake this pass (it used to run every 16 ms over the whole document)
            const SEL = '[data-chat-flow-kind="user"],[data-chat-flow-kind="turn-tail"],[data-slot="conversation.chat.turnTail"]';
            const un = kit.dom.subscribe((recs) => { if (kit.dom.touches(recs, SEL))
                sync(); });
            const onDown = (e) => { if (menuEl && !menuEl.contains(e.target) && !(e.target.closest && e.target.closest('.dcd-act-more')))
                closeMenu(); };
            const onKey = (e) => { if (e.key === 'Escape')
                closeMenu(); };
            const onScroll = (e) => { if (menuEl && !menuEl.contains(e.target))
                closeMenu(); };
            document.addEventListener('pointerdown', onDown, true);
            document.addEventListener('keydown', onKey, true);
            document.addEventListener('scroll', onScroll, true);
            window.addEventListener('resize', closeMenu);
            sync();
            return () => {
                un();
                document.removeEventListener('pointerdown', onDown, true);
                document.removeEventListener('keydown', onKey, true);
                document.removeEventListener('scroll', onScroll, true);
                window.removeEventListener('resize', closeMenu);
                // teardown removes at once; no exit fade on the way out
                if (menuEl)
                    menuEl.remove();
                if (closingMenu)
                    closingMenu.remove();
                menuEl = null;
                menuOwner = null;
                closingMenu = null;
                removeLayout();
                document.querySelectorAll('.dcd-act-fork').forEach((b) => b.remove());
                document.querySelectorAll('[data-dcd-act-fork-src]').forEach((b) => b.removeAttribute('data-dcd-act-fork-src'));
                document.querySelectorAll('.dcd-act-more').forEach((b) => b.remove());
                document.querySelectorAll('[data-dcd-act-fold]').forEach((b) => b.removeAttribute('data-dcd-act-fold'));
                document.querySelectorAll('[data-dcd-act-hide]').forEach((b) => b.removeAttribute('data-dcd-act-hide'));
            };
        }
        return {
            inject: ['slots'],
            apply(ctx) {
                ensureStyle();
                ctx.effect(() => () => removeStyle(), 'transcript-polish: styles');
                ctx.effect(() => startForkBridge(), 'transcript-polish: fork-and-edit button');
                // the bundle's own page (侧边栏 › 插件 › 已安装 › this bundle), like dsh-context's card
                ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register({
                    name: 'plugins.bundle.config', key: 'dsh-conversation-enhancer',
                }, () => h(PluginPage)));
            },
        };
    },
});

// ===== src/parts/03-tool-groups.js
"use strict";
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
        const V = kit.vocab; // words, chevron, attribute helpers (display-shared)
        const NODE = '> [data-slot="conversation.chat.node"]';
        // the node slot is display:contents (no box), so the card is drawn on the call row inside it
        const CALL = '> [data-slot="conversation.chat.node"] > [data-chat-call-id]';
        const ROW = ':is([data-disclosure-row],[data-expandable][role="button"])';
        // a member of an open group here, or a tool row in a conversation-flow (08) card: the same card look
        const OPEN = ':is([data-dcd-group-member]:not([data-dcd-group-hide]),.dcd-flow-card > [data-chat-flow-key])';
        const CHEV_MASK = V.CHEV_MASK;
        const CHEVRON = V.CHEV_SVG;
        /* Kind of a call: dsh's data-tool / data-variant first, the row title (any locale) as fallback.
           The kind table itself is display-shared's (kit.vocab.TOOL_KIND), so both modes agree. */
        const KINDS = [
            ['command', /^(运行命令|bash|pwsh|run command|コマンドを実行)$/i],
            ['read', /^(读取|读取图片|读取文件|read|read image|read file|読み取り|画像を読み取り)$/i],
            ['search', /^(搜索|搜索文件内容|查找文件|查找定义|查找引用|查找实现|查询代码符号|search|grep|glob|find definition|find references|find implementation|query code symbols|検索)$/i],
            ['edit', /^(写入|编辑|应用补丁|write|edit|apply patch|書き込み|編集|パッチを適用)$/i],
            ['web', /^(网页搜索|网页获取|fetch|取得)$/i],
            ['plan', /^(更新任务清单|更新任务|更新计划|update to-do list|update todo list|update plan|ToDoリストを更新)$/i],
        ];
        // conversation-flow (08) renders and groups the transcript itself when present; this part then only
        // keeps dsh's running line in sync and lets its CSS style conversation-flow's cards
        const flowActive = () => document.documentElement.hasAttribute('data-dcf');
        const TITLE_SEL = '[class$="_title"],[class*="_title "]';
        const titleOf = (item) => {
            const t = item.querySelector(TITLE_SEL);
            return (t ? t.textContent : '').trim();
        };
        function kindOf(item) {
            const tagged = item.querySelector('[data-tool]');
            const tool = tagged ? tagged.dataset.tool : '';
            if (tool && V.TOOL_KIND[tool])
                return V.TOOL_KIND[tool];
            const v = item.querySelector('[data-variant="bash"],[data-sample="bash"]');
            if (v)
                return 'command';
            const title = titleOf(item);
            for (const [k, re] of KINDS)
                if (re.test(title))
                    return k;
            return 'other';
        }
        /** What the call is doing, for the live line: a command's description, else 「标题 · 摘要」. */
        function actionOf(item) {
            const sum = item.querySelector('[class*="_summary"],[class*="_fileLink"]');
            const s = (sum ? sum.textContent : '').trim();
            if (kindOf(item) === 'command' && s)
                return s;
            const named = item.querySelector('[data-dcd-group-title]');
            if (named)
                return named.getAttribute('data-dcd-group-title');
            const t = titleOf(item);
            return t && s ? `${t} · ${s}` : (t || s || item.textContent.trim().slice(0, 60));
        }
        const failed = (item) => !!item.querySelector('[data-state="error"],[data-state="failed"],[data-state="rejected"]');
        const running = (item) => !!item.querySelector('[data-state="running"],[data-state="preparing"],[data-state="pending"],[aria-busy="true"]');
        /* ---- failed / never-ran call presentation ----
           A call dsh could not even start (bad arguments) has the raw error as its title and, for bash, no
           terminal — dsh dumps its args as escaped JSON in the generic viewer. Both are restated here in the
           plugin's own voice: a tool-name title, and a real terminal built from the command + error. */
        const TOOL_NAME = {
            zh: { command: '运行命令', read: '读取', search: '搜索', edit: '编辑', web: '网页', plan: '更新计划' },
            en: { command: 'Run command', read: 'Read', search: 'Search', edit: 'Edit', web: 'Web', plan: 'Update plan' },
        };
        /** A row's own title element, with its text (the two label passes shared this lookup). */
        const titleCell = (item) => {
            const el = item.querySelector(TITLE_SEL);
            return el ? { el, text: (el.textContent || '').trim() } : null;
        };
        /** The word to show when a row's own title is unusable: its tool, else a bare 「工具调用」. */
        const toolWordOf = (item) => {
            const lang = V.zh() ? 'zh' : 'en';
            const tagged = item.querySelector('[data-tool]');
            return TOOL_NAME[lang][kindOf(item)] || (tagged && tagged.dataset.tool) || (lang === 'zh' ? '工具调用' : 'Tool call');
        };
        // A call that has only just started has no arguments yet: dsh draws the row with nothing but the
        // terminal's prompt glyph, so the card ends in a bare 「>_」 until the command arrives.
        const PROMPT_ONLY = /^[>›❯$>_|·\s-]*$/;
        /** One row, one label: an error restated in our voice, or a call that has not said what it runs yet. */
        function labelRow(item) {
            const t = titleCell(item);
            if (!t)
                return;
            if (/^(error|错误)\s*[:：]/i.test(t.text)) {
                const lang = V.zh() ? 'zh' : 'en';
                const why = /invalid arguments|INVALID_ARGS|参数/i.test(t.text) ? (lang === 'zh' ? '参数无效' : 'invalid arguments') : (lang === 'zh' ? '未能执行' : 'could not run');
                setAttr(t.el, 'data-dcd-group-title', `${toolWordOf(item)} · ${why}`);
                setAttr(t.el, 'title', t.text);
                return;
            }
            setAttr(t.el, 'data-dcd-group-title', null);
            // a normal row keeps the title dsh gave it; only a prompt-only one gets a word of ours
            if (!PROMPT_ONLY.test(t.text) || item.querySelector('[class*="_summary"]'))
                return;
            setAttr(t.el, 'data-dcd-group-title', toolWordOf(item));
        }
        // conversation-flow (08) renders the rows itself, so the grouping pass never reaches them; rename
        // never-ran calls here too or their row title stays dsh's raw error string
        /* One picture, one row: the tile for a row comes from the path the row itself prints (it is in
           the row's own text), so no node lookup is needed here — the flow part owns the node, this part
           owns the DOM. kit.picUrl (written by the flow part) turns that path into a file URL, expanding
           `~` and resolving a relative path against the run's cwd. */
        const IMGP = /(?:~\/|\/|[A-Za-z]:\\)[^\s"'`<>|$*?%{}\u2026]*?\.(?:png|jpe?g|gif|webp|svg|bmp|avif)(?![A-Za-z0-9])/i;
        const rowPicUrl = (row) => {
            // the picture its own call named, by the key dsh puts on the row: a bash row's text is the
            // description it was given (「Upscale screenshot regions」), not the file it read or wrote
            // the call id is printed on the row itself; the flow key lives on an item above it and moves
            // when dsh re-nests the line, so ask by the id first
            const byCall = kit.picForCall;
            const callId = row.getAttribute('data-chat-call-id');
            if (typeof byCall === 'function' && callId) {
                let url = '';
                try {
                    url = byCall(callId) || '';
                }
                catch (e) {
                    url = '';
                }
                if (url)
                    return url;
            }
            const byRow = kit.picForRow;
            // dsh marks the node it rendered with `data-chat-node-key` (its own key) and the *position* it
            // occupies with `data-chat-flow-key` (a group key when the line sits inside a collapsed group,
            // or a JSON pair when it belongs to a group part). The picture map is keyed by the node key, so
            // read that one — nearest first, and a group wrapper above it has none.
            const pick = (sel) => {
                const held = (row.hasAttribute(sel) ? row : row.closest(`[${sel}]`));
                return held ? held.getAttribute(sel) : '';
            };
            const flowKey = pick('data-chat-node-key') || pick('data-chat-flow-key');
            if (typeof byRow === 'function' && flowKey) {
                let url = '';
                try {
                    url = byRow(flowKey) || '';
                }
                catch (e) {
                    url = '';
                }
                if (url)
                    return url;
            }
            // last resort: the row says what it did ("Simplify the call-id test", "读取 dsh-claude-shared/build.mjs"),
            // and conversation-flow indexed its pictures by exactly that line — the one key that does not move
            const byText = kit.picForText;
            if (typeof byText === 'function') {
                const title = titleOf(row);
                const summary = (row.querySelector('[class*="_summary"]') || {}).textContent || '';
                for (const t of [title, summary]) {
                    if (!String(t || '').trim())
                        continue;
                    let url = '';
                    try {
                        url = byText(String(t)) || '';
                    }
                    catch (e) {
                        url = '';
                    }
                    if (url)
                        return url;
                }
            }
            // fallback: a path printed on the row itself (「读取图片 · /tmp/z5.png」)
            const url = kit.picUrl;
            if (typeof url !== 'function')
                return '';
            const m = String(row.textContent || '').match(IMGP);
            // a glob or a fragment is not a picture: `ls src/parts/*.png` is a command, not a file
            if (!m || /[*?%]/.test(m[0]) || m[0].split('/').length < 3)
                return '';
            try {
                return url(m[0]) || '';
            }
            catch (e) {
                return '';
            }
        };
        // a name that did not load is not a picture (`a.png` in a test command, `/tmp/p${i}.png` in a
        // glob): remember the verdict, or every pass probes it again
        const picState = new Map();
        const clearRowPic = (host) => {
            const tile = tileOf(host);
            if (tile)
                tile.remove();
            if (!host.hasAttribute('data-dcd-group-pic'))
                return;
            host.removeAttribute('data-dcd-group-pic');
            host.removeAttribute('data-dcd-group-pic-src');
        };
        /* ---- the lightbox a row thumb opens ---- */
        let peekEl = null;
        const onPeekKey = (e) => {
            if (e.key !== 'Escape')
                return;
            e.preventDefault();
            e.stopPropagation();
            closePeek();
        };
        function closePeek() {
            if (!peekEl)
                return;
            peekEl.remove();
            peekEl = null;
            document.removeEventListener('keydown', onPeekKey, true);
        }
        const openPeek = (src) => {
            if (!src)
                return;
            closePeek();
            const box = document.createElement('div');
            box.className = 'dcd-group-peek';
            const img = document.createElement('img');
            img.src = src;
            img.alt = '';
            box.appendChild(img);
            box.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); closePeek(); }, true);
            document.body.appendChild(box);
            peekEl = box;
            document.addEventListener('keydown', onPeekKey, true);
        };
        /* one tile per row line, right before the chevron; the src only ever moves forward (a row keeps
           showing the first picture its own call named) so a re-render does not re-request the file */
        const tileOf = (host) => {
            for (const c of Array.from(host.childNodes)) {
                if (c && String(c.className || '').split(/\s+/).includes('dcd-group-rowthumb'))
                    return c;
            }
            return null;
        };
        const setRowPic = (host, want) => {
            host.setAttribute('data-dcd-group-pic', '');
            host.setAttribute('data-dcd-group-pic-src', want);
            let tile = tileOf(host);
            if (!tile) {
                tile = document.createElement('img');
                tile.className = 'dcd-group-rowthumb';
                tile.setAttribute('data-state', 'loading');
                tile.setAttribute('loading', 'eager');
                tile.setAttribute('decoding', 'async');
                tile.setAttribute('alt', '');
                // click opens it full size, and must not toggle the row open (dsh listens on the line)
                tile.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    openPeek(tile.src);
                }, true);
                host.appendChild(tile);
            }
            if (tile.getAttribute('src') !== want) {
                tile.setAttribute('data-state', 'loading');
                tile.setAttribute('src', want);
            }
        };
        const markRowThumb = (row) => {
            const want = rowPicUrl(row);
            // the row's own line — the flex box the chevron is drawn on (see ROW) — so the picture can be
            // pushed to the right edge with it. A node appended here would be a child React does not know
            // about: any re-render of the row (opening it, a status change) reconciles the children list
            // and drops it, which is why the tile used to survive only while the row was open. An attribute
            // and a pseudo-element are ours alone and outlive React.
            const line = row.querySelector('[data-disclosure-row],[data-expandable][role="button"]');
            const title = row.querySelector(TITLE_SEL);
            const host = (line || (title && title.parentElement) || row);
            // a leftover node from the previous build
            const stale = row.querySelector('.dcd-group-rowthumb');
            if (stale && stale.parentElement !== host)
                stale.remove();
            if (!want) {
                clearRowPic(host);
                return;
            }
            if (host.getAttribute('data-dcd-group-pic-src') === want && host.hasAttribute('data-dcd-group-pic')) {
                // React reconciles the row's children on a re-render and drops a node it did not create, so
                // the marker can outlive the tile; putting it back is idempotent and costs one lookup
                if (!tileOf(host))
                    setRowPic(host, want);
                return;
            }
            const known = picState.get(want);
            if (known === 'dead') {
                clearRowPic(host);
                return;
            }
            if (known === 'ok') {
                setRowPic(host, want);
                return;
            }
            // first sight of this path: show it only once it has decoded. A path scraped from a command's
            // text may name nothing, and a broken frame in the middle of a row is worse than no picture.
            clearRowPic(host);
            const tag = want;
            const probe = new Image();
            probe.onload = () => {
                picState.set(tag, 'ok');
                if (rowPicUrl(row) === tag)
                    setRowPic(host, tag);
            };
            probe.onerror = () => {
                picState.set(tag, 'dead');
                if (picState.size > 300)
                    picState.clear();
                if (host.getAttribute('data-dcd-group-pic-src') === tag)
                    clearRowPic(host);
            };
            probe.src = want;
        };
        /* One pass over the rows the flow part draws: they are outside the grouping pass below, so their
           labels, their rewritten viewer and their picture tile are all fixed up here. */
        const flowTitles = () => {
            for (const row of document.querySelectorAll('.dcd-flow-card [data-chat-call-id]')) {
                labelRow(row);
                fixCommandInput(row);
                markRowThumb(row);
            }
        };
        /* A bash call that failed argument validation never runs, so dsh has no terminal for it and falls
           back to the generic viewer (ioCard > ioSection[输入] + ioSection[输出]) dumping the args as escaped
           JSON. Replace that viewer with a terminal built the way normal mode builds one: sample the class
           contract off a live native terminal (block / header / promptLine / command / output / line) and reuse
           those exact classes, so dsh's own terminal CSS — output scrolling, fonts, line heights, $ gutter —
           applies unchanged. Falls back to our own dcd-group-fb_* hooks when no native terminal is mounted yet.
           Idempotent without a marker: the block matches [class*="_terminal"], so later passes skip it; if
           React restores the ioCard the block is gone and the next pass rebuilds it. */
        const el = (tag, cls) => { const e = document.createElement(tag); e.className = cls; return e; };
        let TERM_CLS = null;
        function terminalClasses() {
            if (TERM_CLS)
                return TERM_CLS;
            const prompt = [...document.querySelectorAll('[class*="_promptLine_"]')].find((p) => !p.className.startsWith('dcd-group-fb_'));
            const term = prompt && prompt.closest('[class*="_terminal"]');
            const head = term && term.querySelector(':scope > [class*="_header_"]');
            const out = term && term.querySelector(':scope > [class*="_output_"]');
            if (!term || !head || !out)
                return null;
            TERM_CLS = {
                term: term.className,
                head: head.className,
                promptLine: prompt.className,
                command: (prompt.querySelector('[class*="_command_"]') || {}).className || 'dcd-group-fb_command_',
                output: out.className,
                line: (out.querySelector('[class*="_line_"]') || {}).className || 'dcd-group-fb_line_',
            };
            return TERM_CLS;
        }
        function terminalView(command, output) {
            const c = terminalClasses() || {
                term: 'dcd-group-fb_terminal', head: 'dcd-group-fb_header_', promptLine: 'dcd-group-fb_promptLine_',
                command: 'dcd-group-fb_command_', output: 'dcd-group-fb_output_', line: 'dcd-group-fb_line_',
            };
            const term = el('div', c.term);
            term.setAttribute('data-dcd-group-fb', '');
            const head = el('div', c.head);
            const pl = el('div', c.promptLine);
            const cmd = el('span', c.command);
            cmd.setAttribute('data-command-text', '');
            cmd.textContent = command;
            pl.appendChild(cmd);
            head.appendChild(pl);
            term.appendChild(head);
            if (output) {
                const out = el('div', c.output);
                for (const t of output.split('\n')) {
                    const l = el('div', c.line);
                    l.textContent = t;
                    out.appendChild(l);
                }
                term.appendChild(out);
            }
            return term;
        }
        function fixCommandInput(item) {
            if (!failed(item) || item.querySelector('[class*="_terminal"]'))
                return;
            const card = item.querySelector('[class*="_bodyWrap"] > [class*="_ioCard"]');
            if (!card)
                return;
            const input = card.querySelector('[class*="_ioSection"] [class*="_ioText"]:not([data-error])');
            let args = null;
            try {
                args = JSON.parse((input ? input.textContent : '').trim());
            }
            catch {
                return;
            }
            if (!args || typeof args.command !== 'string')
                return;
            const err = card.querySelector('[class*="_ioText"][data-error]');
            setAttr(card, 'data-dcd-group-fb-src', '');
            card.after(terminalView(args.command, (err ? err.textContent : '').trim()));
        }
        /** 「命令 ×3 · 读取 ×2」 for a run of calls, in display-shared's words. */
        function label(members) {
            const counts = {};
            for (const m of members) {
                const k = kindOf(m);
                counts[k] = (counts[k] || 0) + 1;
            }
            return V.labelOf(counts);
        }
        /** Per-group state the user set by hand, keyed by the first call's flow key. */
        const manual = new Map();
        /** When each call was first seen while its turn was running (for the live timer). */
        const firstSeen = new Map();
        /** Groups mid close-fade: head button → the timer that lands data-dcd-group-hide after the fade. */
        const pendingClose = new Map();
        function cancelClose(btn) {
            const t = pendingClose.get(btn);
            if (t !== undefined) {
                clearTimeout(t);
                pendingClose.delete(btn);
            }
        }
        function makeHead(key) {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'dcd-group-head';
            b.dataset.dcgKey = key;
            b.innerHTML = '<span class="dcd-group-live" aria-hidden="true"><i></i><i></i><i></i><i></i></span><span class="dcd-group-label"></span><span class="dcd-group-time"></span><span class="dcd-group-err"></span><span class="dcd-group-chev">' + CHEVRON + '</span><span class="dcd-group-thumbs"></span>';
            b.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                manual.set(b.dataset.dcgKey, b.getAttribute('aria-expanded') !== 'true');
                schedule();
            });
            return b;
        }
        const setText = (el, s) => { if (el.textContent !== s)
            el.textContent = s; };
        const setAttr = V.setAttr;
        const setFlag = V.setFlag;
        const zh = V.zh;
        /* ---- images (read_image) ---- */
        const isImageCall = (item) => !!item.querySelector('[data-tool="read_image"],[data-tool="view_image"]');
        // per read_image call: how many times we opened it so its image mounts, or 'user' once the user took over.
        // dsh re-mounts the row when the result settles (closed again), so keep reopening until the image is in.
        const autoOpened = new Map();
        /** Make sure a read_image row's body is mounted (dsh renders it only when open). */
        function mountImage(item) {
            const key = item.dataset.chatFlowKey || '';
            const row = item.querySelector(ROW);
            const n = autoOpened.get(key) || 0;
            if (!row || n === 'user' || failed(item) || running(item))
                return;
            if (item.querySelector('[class*="_bodyWrap"] img')) {
                setAttr(item, 'data-dcd-group-imgauto', row.getAttribute('aria-expanded') === 'true' && n > 0 ? '' : null);
                return;
            }
            if (n >= 20)
                return;
            if (row.getAttribute('aria-expanded') !== 'true') {
                autoOpened.set(key, n + 1);
                setAttr(item, 'data-dcd-group-imgauto', '');
                row.click();
            }
        }
        const imagesOf = (item) => [...item.querySelectorAll('[class*="_bodyWrap"] img')].filter((im) => im.currentSrc || im.src);
        const MAX_THUMBS = 3;
        function syncThumbs(btn, members) {
            const box = btn.querySelector('.dcd-group-thumbs');
            const imgs = members.flatMap(imagesOf);
            const sig = imgs.map((im) => im.currentSrc || im.src).join('|');
            if (box.dataset.sig === sig)
                return;
            box.dataset.sig = sig;
            box.textContent = '';
            imgs.slice(0, MAX_THUMBS).forEach((im, i) => {
                const t = document.createElement('button');
                t.type = 'button';
                t.className = 'dcd-group-thumb';
                t.title = im.alt || (zh() ? `查看图片 ${i + 1}` : `View image ${i + 1}`);
                const copy = document.createElement('img');
                copy.src = im.currentSrc || im.src;
                copy.alt = '';
                copy.draggable = false;
                // the tile fades its image in once it decodes; a cached image is complete already
                if (copy.complete)
                    t.dataset.ok = '';
                else {
                    const ok = () => { t.dataset.ok = ''; };
                    copy.addEventListener('load', ok, { once: true });
                    copy.addEventListener('error', ok, { once: true });
                }
                t.appendChild(copy);
                t.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    // dsh's gallery opens its viewer from the image (or its button wrapper)
                    const target = im.closest('button,[role="button"]') || im;
                    target.click();
                });
                box.appendChild(t);
            });
            if (imgs.length > MAX_THUMBS) {
                const more = document.createElement('span');
                more.className = 'dcd-group-more';
                more.textContent = `+${imgs.length - MAX_THUMBS}`;
                box.appendChild(more);
            }
        }
        // the user opening a row we opened silently: show its body instead of closing it
        function onRowClick(e) {
            const row = e.target.closest && e.target.closest(ROW);
            const item = row && row.closest('[data-dcd-group-imgauto]');
            if (!item || !e.isTrusted)
                return;
            e.preventDefault();
            e.stopPropagation();
            item.removeAttribute('data-dcd-group-imgauto');
            autoOpened.set(item.dataset.chatFlowKey || '', 'user');
        }
        function collectRuns() {
            const runs = [];
            let run = [];
            let turn = null;
            const flush = () => { if (run.length)
                runs.push(run); run = []; };
            const planShown = !!document.querySelector('[data-testid="todo-panel"],.dcd-plan-card');
            for (const item of qa('[data-chat-flow-kind]')) {
                // rows inside conversation-flow (08) are already grouped into its runs and cards
                if (item.closest('.dcd-flow-root'))
                    continue;
                const kind = item.dataset.chatFlowKind;
                if (item.dataset.chatTurn !== turn) {
                    flush();
                    turn = item.dataset.chatTurn;
                }
                if (kind === 'tool-call') {
                    // plan updates live in the plan card (dsh-plan-checklist / the To-dos dock), as in the quiet style
                    if (planShown && kindOf(item) === 'plan') {
                        setAttr(item, 'data-dcd-group-plan', '');
                        continue;
                    }
                    // rows dsh itself hides (folded turn process) are not ours to group. Read the hiding
                    // attributes, not getClientRects(): measuring here forced a synchronous layout of the
                    // whole transcript on every mutation batch.
                    if (item.hasAttribute('hidden') || item.hasAttribute('data-turn-process-hidden') || item.closest('[data-turn-process-hidden],[hidden]'))
                        continue;
                    run.push(item);
                    continue;
                }
                // hidden thinking (dsh-transcript-view 标准) takes no space and does not split a run;
                // detected from the view + group part, not offsetHeight (another forced layout)
                if (kind === 'assistant-step' && item.getAttribute('data-chat-group-part') === 'reasoning' && document.documentElement.getAttribute('data-dcd-view') === 'normal')
                    continue;
                flush();
            }
            flush();
            return runs;
        }
        /* dsh's running line keeps its own words (「深度求索中，用时 1分11秒」, shimmer and all): it is the
           status half of the live block and conversation-flow's line above it says what, not how long. Two lines
           both naming the state was the thing that read as a glitch. */
        let anyLive = false;
        /** One run of consecutive calls: its head line, live preview, thumbs and member markers. */
        function syncRun(members, verbose, keep) {
            const w = V.words();
            const head = members[0];
            const key = head.dataset.chatFlowKey || head.dataset.chatNodeKey || '';
            // live only while a call in the group is actually running. Once every call has returned the
            // line is the summary again, even though the turn goes on (the model is writing its next step;
            // dsh's own line at the bottom of the turn shows that)
            for (const m of members) {
                labelRow(m);
                fixCommandInput(m);
            }
            const current = members.filter(running).pop();
            const live = !!current;
            if (live)
                anyLive = true;
            const open = manual.has(key) ? manual.get(key) : verbose;
            let btn = head.querySelector(':scope > .dcd-group-head');
            const wasOpen = btn ? btn.getAttribute('aria-expanded') === 'true' : false;
            if (!btn || btn.dataset.dcgKey !== key) {
                if (btn) {
                    cancelClose(btn);
                    btn.remove();
                }
                btn = makeHead(key);
                head.insertBefore(btn, head.firstChild);
            }
            // a close fades the rows out first: data-dcd-group-closing holds them one beat (the summary line
            // stays put — only the rows it stands for fade), then a later pass lands data-dcd-group-hide.
            // Reopening inside the beat drops the marker, which cancels the fade mid-flight.
            if (wasOpen && !open && !pendingClose.has(btn)) {
                pendingClose.set(btn, setTimeout(() => { pendingClose.delete(btn); schedule(); }, 150));
            }
            else if (open)
                cancelClose(btn);
            const closing = !open && pendingClose.has(btn);
            const curKey = current ? (current.dataset.chatFlowKey || '') : '';
            if (live && !firstSeen.has(curKey))
                firstSeen.set(curKey, Date.now());
            // several calls: the line keeps the counts and the running call previews below it;
            // a single call keeps the live label on the line itself
            const multi = members.length > 1;
            const summaryText = label(members);
            const dur = V.durSec((Date.now() - (firstSeen.get(curKey) || Date.now())) / 1000);
            setText(btn.querySelector('.dcd-group-label'), live && !multi ? actionOf(current) : summaryText);
            setText(btn.querySelector('.dcd-group-time'), live && !multi ? dur : '');
            let now = head.querySelector(':scope > .dcd-group-now');
            if (live && multi && !open) {
                if (!now) {
                    now = document.createElement('button');
                    now.type = 'button';
                    now.className = 'dcd-group-now';
                    now.innerHTML = '<span class="dcd-group-live" aria-hidden="true"><i></i><i></i><i></i><i></i></span><span class="dcd-group-label"></span><span class="dcd-group-time"></span>';
                    now.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); manual.set(key, true); schedule(); });
                    head.insertBefore(now, btn.nextSibling);
                }
                setText(now.querySelector('.dcd-group-label'), actionOf(current));
                setText(now.querySelector('.dcd-group-time'), dur);
            }
            else if (now)
                now.remove();
            // failures show as soon as they happen, not only when the turn ends
            const nFail = members.filter(failed).length;
            setText(btn.querySelector('.dcd-group-err'), nFail ? `· ${w.failed(nFail)}` : '');
            setAttr(btn, 'aria-expanded', open ? 'true' : 'false');
            setAttr(btn, 'title', live ? summaryText : (open ? w.hide : w.show));
            setAttr(btn, 'data-live', live ? '' : null);
            for (const m of members)
                if (isImageCall(m))
                    mountImage(m);
            syncThumbs(btn, members);
            members.forEach((m, i) => {
                keep.add(m);
                // a row that headed a group before a regroup (思考 → 标准 merges runs across hidden thinking) drops its old head
                if (i > 0) {
                    const old = m.querySelector(':scope > .dcd-group-head');
                    if (old)
                        old.remove();
                    const nw = m.querySelector(':scope > .dcd-group-now');
                    if (nw)
                        nw.remove();
                }
                setAttr(m, 'data-dcd-group-member', '');
                // the attribute name dsh-claude-theme's glass still queries: drop it when that bundle is renamed
                setAttr(m, 'data-dcg-member', '');
                setAttr(m, 'data-dcd-group-head', i === 0 ? '' : null);
                setAttr(m, 'data-dcd-group-first', i === 0 ? '' : null);
                setAttr(m, 'data-dcd-group-last', i === members.length - 1 ? '' : null);
                setAttr(m, 'data-dcd-group-hide', closing ? null : (open ? null : ''));
                // the first member's call content lives beside the summary button, so it fades on its own
                // (the button must stay); every later member fades as a whole row
                if (i === 0) {
                    const n0 = m.querySelector(NODE);
                    if (n0)
                        setFlag(n0, 'data-dcd-group-closing', closing);
                }
                else
                    setFlag(m, 'data-dcd-group-closing', closing);
            });
        }
        function sync() {
            // conversation-flow owns grouping in its mode; skip the whole DOM pass (and its layout reads)
            if (flowActive()) {
                anyLive = false;
                flowTitles();
                hideContextRows();
                return;
            }
            const verbose = document.documentElement.getAttribute('data-dcd-view') === 'verbose';
            const keep = new Set();
            anyLive = false;
            for (const members of collectRuns())
                syncRun(members, verbose, keep);
            // finished turns drop their 「已完成，用时」 line; running ones keep it as the progress cue
            const doneTurns = new Set(qa('[data-chat-flow-kind="turn-tail"]').map((t) => t.dataset.chatTurn || ''));
            for (const tp of qa('[data-chat-flow-kind="turn-process"]')) {
                setAttr(tp, 'data-dcd-group-done', doneTurns.has(tp.dataset.chatTurn || '') ? '' : null);
            }
            // undo rows that are no longer in a group
            for (const m of document.querySelectorAll('[data-dcd-group-member]')) {
                if (keep.has(m))
                    continue;
                for (const a of ['data-dcd-group-member', 'data-dcd-group-head', 'data-dcd-group-first', 'data-dcd-group-last', 'data-dcd-group-hide', 'data-dcd-group-closing'])
                    m.removeAttribute(a);
                const n0 = m.querySelector(NODE);
                if (n0)
                    n0.removeAttribute('data-dcd-group-closing');
                const b = m.querySelector(':scope > .dcd-group-head');
                if (b) {
                    cancelClose(b);
                    b.remove();
                }
                const nw = m.querySelector(':scope > .dcd-group-now');
                if (nw)
                    nw.remove();
            }
            for (const b of document.querySelectorAll('.dcd-group-head')) {
                if (!b.parentElement || !keep.has(b.parentElement)) {
                    cancelClose(b);
                    b.remove();
                }
            }
            // these two are keyed by rows that stay in the transcript for the whole session: drop the keys
            // of rows this pass no longer sees instead of growing for as long as the conversation lives
            if (firstSeen.size > 256 || autoOpened.size > 512) {
                const keepKeys = new Set([...keep].map((m) => m.dataset.chatFlowKey || ''));
                for (const k of [...firstSeen.keys()])
                    if (!keepKeys.has(k))
                        firstSeen.delete(k);
                for (const k of [...autoOpened.keys()])
                    if (!keepKeys.has(k))
                        autoOpened.delete(k);
            }
        }
        /* dsh draws injected context as its own row (`ContextInjectionRow`, the 「上下文注入 · dsh-mnemon」
           line) and hides it once the turn is prepared — the row that flashed on every new turn. The flow
           no longer hands those entries over, so normally nothing is drawn; if one is drawn anyway, the
           row is dropped here as well as in the stylesheet, so it can never show for a frame. */
        function hideContextRows() {
            for (const b of qa('[data-context-injection-body],[data-context-source]')) {
                if (b.hasAttribute('data-dcd-group-gone'))
                    continue;
                b.setAttribute('data-dcd-group-gone', '');
                const row = b.closest('[class$="_root"]') || b.parentElement;
                if (row)
                    row.style.display = 'none';
            }
        }
        let timer = 0;
        function schedule() {
            if (timer)
                return;
            timer = setTimeout(() => { timer = 0; try {
                sync();
            }
            catch (e) {
                console.error('[dsh-tool-groups]', e);
            } }, 50);
        }
        const sheet = kit.sheet('tool-groups', styleToolGroups({ ROW, OPEN, CALL, NODE, CHEV_MASK }));
        function start() {
            sheet.ensure();
            document.addEventListener('click', onRowClick, true);
            // one shared, frame-coalesced observer; in conversation-flow mode only the running line is kept in
            // sync, otherwise the grouping pass runs only when a tool row / state actually changed
            const un = kit.dom.subscribe((recs) => {
                if (flowActive()) {
                    // context rows are already dropped by the flow's roleOf; this is the DOM safety net, so only
                    // look when a record could be one (a full-document scan on every frame while a reply streams
                    // is what this pass used to cost)
                    if (kit.dom.touches(recs, '[data-context-injection-body],[data-context-source],[data-chat-flow-kind="context"]'))
                        hideContextRows();
                    if (kit.dom.touches(recs, '[data-state],[class*="_title"],[data-chat-call-id],[aria-expanded]'))
                        flowTitles();
                    return;
                }
                if (!kit.dom.touches(recs, '[data-chat-flow-kind],[data-state],[aria-expanded],[src]'))
                    return;
                schedule();
            });
            // a new transcript view (标准 / 思考 / 详尽) wins over groups opened or closed by hand
            let lastView = document.documentElement.getAttribute('data-dcd-view');
            const unAttr = kit.dom.attr(() => {
                const v = document.documentElement.getAttribute('data-dcd-view');
                if (v !== lastView) {
                    lastView = v;
                    manual.clear();
                }
                schedule();
            });
            // the live timer ticks once a second, only while a group is running
            const tick = setInterval(() => { if (anyLive)
                schedule(); }, 1000);
            // a row's picture is an attribute on an element dsh re-creates whenever it re-renders that row
            // (opening or closing it, a status change): the mutation pass usually catches the new element,
            // but not always — and a card that is closed is exactly where nothing else nudges us. This
            // sweep only re-applies pictures, and markRowThumb returns at once when one is already right.
            const sweep = setInterval(() => {
                if (!flowActive())
                    return;
                for (const row of document.querySelectorAll('.dcd-flow-card [data-chat-call-id]'))
                    markRowThumb(row);
            }, 600);
            schedule();
            return () => {
                un();
                unAttr();
                clearInterval(tick);
                clearInterval(sweep);
                document.removeEventListener('click', onRowClick, true);
                for (const t of pendingClose.values())
                    clearTimeout(t);
                pendingClose.clear();
                manual.clear();
                firstSeen.clear();
                autoOpened.clear();
                document.querySelectorAll('[data-dcd-group-imgauto]').forEach((m) => m.removeAttribute('data-dcd-group-imgauto'));
                if (timer)
                    clearTimeout(timer);
                sheet.remove();
                document.querySelectorAll('[data-dcd-group-plan]').forEach((m) => m.removeAttribute('data-dcd-group-plan'));
                document.querySelectorAll('[data-dcd-group-done]').forEach((m) => m.removeAttribute('data-dcd-group-done'));
                document.querySelectorAll('[data-dcd-group-title]').forEach((m) => m.removeAttribute('data-dcd-group-title'));
                document.querySelectorAll('.dcd-group-head').forEach((b) => b.remove());
                document.querySelectorAll('.dcd-group-now').forEach((b) => b.remove());
                document.querySelectorAll('[data-dcd-group-member]').forEach((m) => {
                    for (const a of ['data-dcd-group-member', 'data-dcd-group-head', 'data-dcd-group-first', 'data-dcd-group-last', 'data-dcd-group-hide', 'data-dcd-group-closing'])
                        m.removeAttribute(a);
                    const n0 = m.querySelector(NODE);
                    if (n0)
                        n0.removeAttribute('data-dcd-group-closing');
                });
                // undo what hideContextRows / fixCommandInput did with inline styles and foreign nodes
                document.querySelectorAll('[data-dcd-group-gone]').forEach((b) => {
                    b.removeAttribute('data-dcd-group-gone');
                    const row = b.closest('[class$="_root"]') || b.parentElement;
                    if (row)
                        row.style.display = '';
                });
                document.querySelectorAll('[data-dcd-group-fb-src]').forEach((m) => m.removeAttribute('data-dcd-group-fb-src'));
                document.querySelectorAll('[data-dcd-group-fb]').forEach((m) => m.remove());
                closePeek();
                document.querySelectorAll('.dcd-group-rowthumb').forEach((m) => m.remove());
                document.querySelectorAll('[data-dcd-group-pic]').forEach((m) => {
                    m.removeAttribute('data-dcd-group-pic');
                    m.removeAttribute('data-dcd-group-pic-src');
                });
                picState.clear();
            };
        }
        return {
            inject: [],
            apply(ctx) {
                ctx.effect(() => start(), 'tool-groups: fold consecutive tool calls');
            },
        };
    },
});

// ===== src/parts/04-plan-checklist.js
"use strict";
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
        const P = '[data-testid="todo-panel"]';
        /** Read the plan from the native dock: [{status, text}], in model order. */
        function readPlan() {
            const panel = document.querySelector(P);
            if (!panel)
                return [];
            const btn = q('button[aria-expanded]', panel);
            // the list is only rendered while the dock is open; click once per panel element, not on every
            // pass — a rejected click must not become a 50 ms click loop that fights the user's own toggle
            if (btn && btn.getAttribute('aria-expanded') !== 'true' && !clickedPanels.has(btn)) {
                clickedPanels.add(btn);
                btn.click();
            }
            return qa('li[data-status]', panel).map((li) => {
                const c = li.querySelector('[class$="_content"],[class*="_content "]');
                return { status: li.dataset.status, text: (c || li).textContent.trim() };
            });
        }
        const items = (turn) => qa(`[data-chat-flow-kind][data-chat-turn="${CSS.escape(String(turn))}"]`);
        // attribute-based visibility (no forced layout): mirrors the CSS that hides grouped / folded /
        // reasoning rows, so anchoring the card never reads geometry mid-stream
        const visible = (el) => {
            if (el.querySelector('.dcd-plan-card'))
                return true;
            if (el.hasAttribute('hidden') || el.hasAttribute('data-turn-process-hidden'))
                return false;
            if (el.closest('[data-turn-process-hidden],[hidden]'))
                return false;
            if (el.hasAttribute('data-dcd-group-done') || el.hasAttribute('data-dcd-group-plan'))
                return false;
            if (el.hasAttribute('data-dcd-group-hide') && el.hasAttribute('data-dcd-group-member') && !el.hasAttribute('data-dcd-group-head'))
                return false;
            if (el.dataset.chatGroupPart === 'reasoning' && document.documentElement.getAttribute('data-dcd-view') === 'normal')
                return false;
            return true;
        };
        /**
         * Where the card goes: always after the turn's last item, running or not — the plan is the last
         * thing in the turn, right above dsh's own running row while the turn runs and above the action
         * bar once it is over. It used to stand *above* the current activity, which cut the live line
         * away from the group whose work it describes and then moved the card again when the turn ended.
         * Returns [node, 'before' | 'after', turnDone].
         */
        function anchor() {
            // conversation-flow folds the live tool group into a .dcd-flow-run line (not a data-chat-flow-kind row),
            // so anchor inside the newest .dcd-flow-turn: above its current activity while live, after the last
            // reply once done. Without this the card has no anchor during the tool-running phase.
            if (document.documentElement.hasAttribute('data-dcf')) {
                // scope to the main conversation: the right sidebar mounts a second flow instance, and a
                // document-wide `.dcd-flow-turn` would anchor the card into that transcript instead
                const turns = qa('.dcd-flow-turn', document.querySelector('[data-slot="main.conversation"]') || document);
                if (!turns.length)
                    return null;
                const sec = turns[turns.length - 1];
                const done = !sec.hasAttribute('data-live');
                const kids = Array.from(sec.children).filter((el) => el !== card && !el.classList.contains('dcd-plan-card')
                    && !el.classList.contains('dcd-flow-end') && el.getAttribute('data-chat-flow-kind') !== 'turn-tail');
                const act = kids.filter((el) => el.getAttribute('data-chat-flow-kind') !== 'user');
                if (act.length)
                    return [act[act.length - 1], 'after', done];
                const u = kids.find((el) => el.getAttribute('data-chat-flow-kind') === 'user');
                return u ? [u, 'after', false] : null;
            }
            const all = qa('[data-chat-flow-kind]');
            if (!all.length)
                return null;
            const turn = all[all.length - 1].dataset.chatTurn;
            const list = items(turn).filter((it) => it.dataset.chatFlowKind !== 'user');
            const done = list.some((it) => it.dataset.chatFlowKind === 'turn-tail');
            const body = list.filter((it) => it.dataset.chatFlowKind !== 'turn-tail' && visible(it) && !it.contains(card));
            if (!body.length)
                return null;
            let last = body[body.length - 1];
            if (done)
                return [last, 'after', true];
            // a tool group (dsh-tool-groups) is one block: stand before its first row
            if (last.hasAttribute('data-dcd-group-member') && !last.hasAttribute('data-dcd-group-first')) {
                let i = list.indexOf(last);
                while (i > 0 && !list[i].hasAttribute('data-dcd-group-first'))
                    i--;
                last = list[i];
            }
            return [last, 'before', false];
        }
        let card = null;
        let lastJson = '';
        let userOpen = false;
        /** Panels whose dock toggle we already clicked, so a refused click cannot become a click loop. */
        const clickedPanels = new WeakSet();
        /** The one-shot `data-pop` timers, kept so teardown can cancel them. */
        const pops = new Set();
        const V = kit.vocab;
        const zh = V.zh;
        const setFlag = V.setFlag;
        const CHEV = V.CHEV_SVG;
        function render(plan) {
            if (!card) {
                card = document.createElement('section');
                // `dpc-card` / `dpc-list` are the names dsh-claude-theme's glass rules still use
                card.className = 'dcd-plan-card dpc-card';
                card.setAttribute('aria-label', zh() ? '任务计划' : 'Plan');
                card.innerHTML = '<button type="button" class="dcd-plan-sum"><span class="dcd-plan-glyph" aria-hidden="true"></span><span class="dcd-plan-sum-text"></span>' + CHEV + '</button><ul class="dcd-plan-list dpc-list"></ul>';
                card.firstChild.addEventListener('click', (e) => { e.preventDefault(); userOpen = !userOpen; schedule(); });
            }
            const json = JSON.stringify(plan);
            if (json === lastJson)
                return;
            lastJson = json;
            userOpen = false;
            const n = plan.length;
            card.querySelector('.dcd-plan-sum-text').textContent = zh() ? `已完成全部 ${n} 项任务` : `All ${n} tasks done`;
            const ul = card.querySelector('.dcd-plan-list');
            // diff per item, keyed by its text: a todo_write update reuses the <li> whose task still
            // stands, so the card never rebuilds (which would replay the entrance) and a freshly
            // completed task pops its check in place
            const pool = new Map();
            for (const li of [...ul.children]) {
                const k = li.dataset.text || '';
                if (!pool.has(k))
                    pool.set(k, []);
                pool.get(k).push(li);
            }
            const take = (k) => {
                const l = pool.get(k);
                if (!l || !l.length)
                    return null;
                return l.shift();
            };
            for (const t of plan) {
                let li = take(t.text);
                if (!li) {
                    li = document.createElement('li');
                    li.className = 'dcd-plan-item';
                    li.dataset.text = t.text;
                    li.innerHTML = '<span class="dcd-plan-glyph" aria-hidden="true"></span><span class="dcd-plan-text"></span>';
                    li.lastChild.textContent = t.text;
                }
                if (li.dataset.status !== t.status) {
                    const was = li.dataset.status;
                    li.dataset.status = t.status;
                    // the pop marker is one-shot: dropped once the animation has had its moment
                    if (t.status === 'completed' && was) {
                        setFlag(li, 'data-pop', true);
                        const id = setTimeout(() => { pops.delete(id); setFlag(li, 'data-pop', false); }, 260);
                        pops.add(id);
                    }
                }
                ul.appendChild(li);
            }
            for (const l of pool.values())
                for (const li of l)
                    li.remove();
        }
        function sync() {
            const plan = readPlan();
            const at = plan.length ? anchor() : null;
            if (!at) {
                if (card)
                    card.remove();
                return;
            }
            render(plan);
            const [node, where, turnDone] = at;
            const allDone = plan.every((t) => t.status === 'completed');
            setFlag(card, 'data-done', turnDone && allDone);
            setFlag(card, 'data-folded', turnDone && allDone && !userOpen);
            if (where === 'before') {
                if (node.previousElementSibling !== card)
                    node.before(card);
            }
            else if (node.nextElementSibling !== card)
                node.after(card);
        }
        let timer = 0;
        const schedule = () => { if (!timer)
            timer = setTimeout(() => { timer = 0; try {
                sync();
            }
            catch (e) {
                console.error('[dsh-plan-checklist]', e);
            } }, 50); };
        const sheet = kit.sheet('plan-checklist', stylePlanChecklist({ P }));
        function start() {
            sheet.ensure();
            // shared watcher; only the native dock or new flow rows can move the card. Our own .dcd-plan-item
            // edits match none of these selectors, so rendering the card never re-triggers this pass.
            const un = kit.dom.subscribe((recs) => {
                if (!kit.dom.touches(recs, '[data-testid="todo-panel"],[data-chat-flow-kind],[data-testid="todo-panel"] [data-status],.dcd-flow-turn,.dcd-flow-run,.dcd-flow-thought,.dcd-flow-steps'))
                    return;
                schedule();
            });
            schedule();
            return () => {
                un();
                if (timer)
                    clearTimeout(timer);
                for (const id of pops)
                    clearTimeout(id);
                pops.clear();
                sheet.remove();
                if (card)
                    card.remove();
                card = null;
                lastJson = '';
            };
        }
        return {
            inject: [],
            apply(ctx) {
                ctx.effect(() => start(), 'plan-checklist: quiet plan card in the transcript');
            },
        };
    },
});

// ===== src/parts/05-typography.js
"use strict";
/*!
 * dsh-typography — browser half.
 *
 * The reading column sets everything in one sans (Anthropic Sans; proprietary, so not bundled here) with the
 * system UI font as fallback, reads replies at ~15px with generous leading, and keeps Markdown
 * quiet: modest headings, small inline code. This plugin does the same with fonts every Mac already has
 * (SF Pro for Latin, PingFang SC for Chinese, SF Mono for code).
 *
 * Sizes follow 外观 › 对话文字大小 / 代码字号 (dsh's --dsh-content-font-size / --dsh-code-font-size):
 * replies, the bubble and the input sit 1px above the chosen size (the quiet style's 15px at dsh's default
 * 14px), code blocks 1.5px above the code size (12.5px at the default 11px).
 *
 * Text colours too, per theme: a warm near-black instead of dsh's cool blue-black, softer quotes and
 * terracotta inline code (moved here from dsh-claude-theme's glass part). Tokens can be overridden: --dcd-type-sans, --dcd-type-mono, --dcd-type-leading on :root;
 * --dcd-type-size, --dcd-type-code-size on body.
 */
part({
    id: 'dsh-typography',
    factory(require, kit) {
        // the reading voice itself lives in styles/05-typography.scss (CSS_TYPOGRAPHY)
        return {
            inject: [],
            apply(ctx) {
                const sheet = kit.sheet('typography', CSS_TYPOGRAPHY);
                ctx.effect(() => { sheet.ensure(); return sheet.remove; }, 'typography: quiet type');
            },
        };
    },
});

// ===== src/parts/06-bash-highlight.js
"use strict";
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
        const KINDS = ['cmd', 'kw', 'flag', 'str', 'var', 'op', 'num', 'cmt'];
        const OUT_KINDS = ['err', 'warn', 'ok', 'num', 'str', 'path', 'cmt', 'add', 'del'];
        // the second half also has to match conversation-flow's cards: `data-dcd-group-member` is written only by the
        // native grouping pass, which the flow mode never runs
        const OUTPUT = '[class*="_terminal"] [class*="_output_"], [data-dcd-group-member] [class*="_root"] > pre[class*="_output"], .dcd-flow-card [class*="_root"] > pre[class*="_output"]';
        const OUT_CAP = 20000;
        const ERR = /\b(error|errors|failed|failure|fatal|exception|traceback|panic|denied|refused|not found|no such file or directory|cannot|can't|unable)\b|错误|失败/gi;
        const WARN = /\b(warn|warning|warnings|deprecated)\b|警告/gi;
        const OK = /\b(ok|done|success|successful|succeeded|passed|pass|stopped|started|ready|created|✓|✔)\b|成功|完成/gi;
        /** [start, end, kind][] for a block of output text. */
        function lexOut(s) {
            const out = [];
            s = s.slice(0, OUT_CAP);
            let lineStart = 0;
            for (const line of s.split('\n')) {
                const L = lineStart;
                lineStart += line.length + 1;
                if (!line.trim())
                    continue;
                if (/^\s*#/.test(line)) {
                    out.push([L, L + line.length, 'cmt']);
                    continue;
                }
                if (/^\+(?!\+\+ )/.test(line)) {
                    out.push([L, L + line.length, 'add']);
                    continue;
                }
                if (/^-(?!-- )/.test(line) && !/^-[rwx-]{9}/.test(line)) {
                    out.push([L, L + line.length, 'del']);
                    continue;
                }
                const marks = [];
                const add = (re, kind, group = 0) => { re.lastIndex = 0; for (let m; (m = re.exec(line));) {
                    if (!m[0]) {
                        re.lastIndex++;
                        continue;
                    }
                    const a = m.index + (group ? m[0].indexOf(m[group]) : 0);
                    marks.push([L + a, L + a + (group ? m[group] : m[0]).length, kind]);
                } };
                add(/^[dlcbps-][rwxsStT-]{9}[@+.]?/g, 'cmt');
                add(/"[^"\n]*"|'[^'\n]*'/g, 'str');
                add(/(?:^|[\s(=:])((?:~|\.{1,2})?\/[\w.@%+~\/-]+)/g, 'path', 1);
                add(ERR, 'err');
                add(WARN, 'warn');
                add(OK, 'ok');
                add(/(?<![\w.\/-])-?\d+(?:[.:]\d+)*(?:[KMGT]i?B?|%|ms|s)?(?![\w\/])/g, 'num');
                // earlier kinds win where they overlap (a number inside a path stays a path)
                marks.sort((x, y) => x[0] - y[0] || (y[1] - y[0]) - (x[1] - x[0]));
                let end = -1;
                for (const m of marks)
                    if (m[0] >= end) {
                        out.push(m);
                        end = m[1];
                    }
            }
            return out;
        }
        // Rules are scoped to the elements that carry highlights (inner spans inherit them): a bare
        // ::highlight() makes the browser work out highlight styles for every element on the page on
        // every style pass, which on a long conversation cost ~80 ms per DOM change. (styles/06)
        const sheet = kit.sheet('bash-highlight', CSS_BASH_HIGHLIGHT);
        // words that keep the next word in "command" position
        const PREFIX = new Set(['sudo', 'env', 'time', 'nohup', 'exec', 'command', 'builtin', 'xargs', 'nice', 'timeout']);
        const KEYWORDS = new Set(['if', 'then', 'else', 'elif', 'fi', 'for', 'while', 'until', 'do', 'done', 'case', 'esac', 'in', 'function', 'export', 'local', 'return', 'set', 'unset', 'source', '.', 'cd', 'echo', 'exit', 'true', 'false']);
        const CMD_AFTER = new Set(['|', '||', '&&', ';', '&', '(', '$(', '`', 'then', 'else', 'do', '{']);
        /** [start, end, kind][] for one command string. */
        function lex(s) {
            const out = [];
            let i = 0;
            let expectCmd = true;
            const n = s.length;
            while (i < n) {
                const c = s[i];
                if (c === ' ' || c === '\t' || c === '\n') {
                    if (c === '\n')
                        expectCmd = true;
                    i++;
                    continue;
                }
                if (c === '#' && (i === 0 || /\s/.test(s[i - 1]))) {
                    const e = s.indexOf('\n', i);
                    const end = e < 0 ? n : e;
                    out.push([i, end, 'cmt']);
                    i = end;
                    continue;
                }
                if (c === "'" || c === '"') {
                    let j = i + 1;
                    while (j < n && s[j] !== c) {
                        if (c === '"' && s[j] === '\\')
                            j++;
                        j++;
                    }
                    j = Math.min(n, j + 1);
                    out.push([i, j, 'str']);
                    i = j;
                    expectCmd = false;
                    continue;
                }
                if (c === '$') {
                    let j = i + 1;
                    if (s[j] === '(') {
                        out.push([i, i + 2, 'op']);
                        i += 2;
                        expectCmd = true;
                        continue;
                    }
                    if (s[j] === '{') {
                        const e = s.indexOf('}', j);
                        j = e < 0 ? n : e + 1;
                    }
                    else {
                        while (j < n && /[\w?#@*!$-]/.test(s[j]) && (j === i + 1 || /\w/.test(s[j])))
                            j++;
                    }
                    out.push([i, j, 'var']);
                    i = j;
                    expectCmd = false;
                    continue;
                }
                const op = /^(\d?>>?&?\d?|<<?|\|\||\||&&|;;?|&|\(|\)|\{|\}|`)/.exec(s.slice(i, i + 4));
                if (op && !(op[0][0] >= '0' && op[0][0] <= '9' && !/[<>]/.test(op[0]))) {
                    out.push([i, i + op[0].length, 'op']);
                    i += op[0].length;
                    expectCmd = CMD_AFTER.has(op[0]);
                    continue;
                }
                // a word
                let j = i;
                while (j < n && !/[\s'"|&;()<>`$]/.test(s[j]))
                    j++;
                if (j === i) {
                    i++;
                    continue;
                }
                const w = s.slice(i, j);
                if (expectCmd && /^[A-Za-z_]\w*=/.test(w)) {
                    const eq = w.indexOf('=');
                    out.push([i, i + eq, 'var']);
                    // the value: plain text up to the next space or operator, quoted parts still strings;
                    // the word after the assignment is still in command position
                    i += eq + 1;
                    while (i < n && !/[\s|&;()<>`]/.test(s[i])) {
                        if (s[i] === "'" || s[i] === '"') {
                            const q = s[i];
                            let k = i + 1;
                            while (k < n && s[k] !== q)
                                k++;
                            out.push([i, Math.min(n, k + 1), 'str']);
                            i = k + 1;
                        }
                        else
                            i++;
                    }
                    continue;
                }
                if (expectCmd) {
                    out.push([i, j, KEYWORDS.has(w) ? 'kw' : 'cmd']);
                    expectCmd = PREFIX.has(w) || CMD_AFTER.has(w) || w === 'export';
                }
                else if (/^--?[\w-]/.test(w))
                    out.push([i, j, 'flag']);
                else if (/^\d+(\.\d+)?$/.test(w))
                    out.push([i, j, 'num']);
                else if (KEYWORDS.has(w) && CMD_AFTER.has(w)) {
                    out.push([i, j, 'kw']);
                    expectCmd = true;
                }
                i = j;
            }
            return out;
        }
        /** Map string offsets onto the element's text nodes. */
        function ranges(el, spans) {
            const nodes = [];
            const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
            let off = 0;
            for (let t = walker.nextNode(); t; t = walker.nextNode()) {
                nodes.push([t, off]);
                off += t.data.length;
            }
            const at = (pos) => {
                for (let k = nodes.length - 1; k >= 0; k--)
                    if (pos >= nodes[k][1])
                        return [nodes[k][0], Math.min(pos - nodes[k][1], nodes[k][0].data.length)];
                return null;
            };
            const res = [];
            for (const [a, b, kind] of spans) {
                const s = at(a), e = at(b);
                if (!s || !e)
                    continue;
                // StaticRange: a live Range is updated by the browser on every DOM change anywhere in the
                // page, and there are thousands of these. The cache below re-lexes when the text changes.
                let r;
                try {
                    if (typeof StaticRange === 'function')
                        r = new StaticRange({ startContainer: s[0], startOffset: s[1], endContainer: e[0], endOffset: e[1] });
                    else {
                        r = new Range();
                        r.setStart(s[0], s[1]);
                        r.setEnd(e[0], e[1]);
                    }
                }
                catch {
                    continue;
                }
                res.push([kind, r]);
            }
            return res;
        }
        function start() {
            if (!(window.CSS && CSS.highlights && window.Highlight))
                return () => { };
            sheet.ensure();
            const cache = new WeakMap(); // element → text it was lexed for
            let timer = 0;
            let last = []; // the cache entries painted last time, in order
            const marked = new Set();
            function paint() {
                timer = 0;
                const used = [];
                const groups = Object.fromEntries(KINDS.map((k) => [k, []]));
                for (const el of document.querySelectorAll('[data-command-text]')) {
                    const text = el.textContent || '';
                    let hit = cache.get(el);
                    if (!hit || hit.text !== text || !hit.ranges.every(([, r]) => el.contains(r.startContainer))) {
                        hit = { text, ranges: ranges(el, lex(text)) };
                        cache.set(el, hit);
                    }
                    used.push(hit);
                    for (const [kind, r] of hit.ranges)
                        groups[kind].push(r);
                }
                const outs = Object.fromEntries(OUT_KINDS.map((k) => [k, []]));
                // dsh renders terminal output one element per line; lex each line on its own
                const units = [];
                for (const box of qa(OUTPUT)) {
                    // the scope for the dbo-* rules goes on the box, not each line: lines inherit it, and every
                    // element the rules match costs a highlight style on each style pass
                    if (!box.hasAttribute('data-dbh-out')) {
                        box.setAttribute('data-dbh-out', '');
                        marked.add(box);
                    }
                    const lines = qa('[class*="_line_"]', box);
                    if (lines.length) {
                        let budget = OUT_CAP;
                        for (const l of lines) {
                            if ((budget -= l.textContent.length) < 0)
                                break;
                            units.push(l);
                        }
                    }
                    else
                        units.push(box);
                }
                for (const el of units) {
                    const text = el.textContent || '';
                    let hit = cache.get(el);
                    if (!hit || hit.text !== text || !hit.ranges.every(([, r]) => el.contains(r.startContainer))) {
                        hit = { text, ranges: ranges(el, lexOut(text)) };
                        cache.set(el, hit);
                    }
                    used.push(hit);
                    for (const [kind, r] of hit.ranges)
                        outs[kind].push(r);
                }
                for (const el of marked)
                    if (!el.isConnected)
                        marked.delete(el);
                // nothing new or changed (the usual case while a reply streams elsewhere): keep the highlights,
                // re-setting them makes the browser repaint every one
                if (used.length === last.length && used.every((h, i) => h === last[i]))
                    return;
                last = used;
                // add() in a loop, not a spread: one range per token across the whole document easily reaches
                // tens of thousands, and a spread that large throws RangeError and kills the paint
                const setHL = (name, ranges) => { const hl = new Highlight(); for (const r of ranges)
                    hl.add(r); CSS.highlights.set(name, hl); };
                for (const k of KINDS)
                    setHL('dbh-' + k, groups[k]);
                for (const k of OUT_KINDS)
                    setHL('dbo-' + k, outs[k]);
            }
            const schedule = () => { if (!timer)
                timer = setTimeout(paint, 80); };
            // shared watcher; only command / output text can change the highlights, so a reply streaming
            // elsewhere never wakes the lexer. data-dbh-out (set by paint) is outside the hub's attribute
            // filter, so marking a box does not re-trigger this pass.
            const un = kit.dom.subscribe((recs) => {
                if (!kit.dom.touches(recs, '[data-command-text],[class*="_output_"],[class*="_line_"],[data-dbh-out]'))
                    return;
                schedule();
            });
            paint();
            return () => {
                un();
                if (timer)
                    clearTimeout(timer);
                for (const k of KINDS)
                    CSS.highlights.delete('dbh-' + k);
                for (const k of OUT_KINDS)
                    CSS.highlights.delete('dbo-' + k);
                for (const el of marked)
                    el.removeAttribute('data-dbh-out');
                marked.clear();
                last = [];
                sheet.remove();
            };
        }
        return {
            inject: [],
            apply(ctx) {
                ctx.effect(() => start(), 'bash-highlight: shell command colours');
            },
        };
    },
});

// ===== src/parts/07-render-offscreen.js
"use strict";
/*!
 * render-offscreen — skip layout and paint for conversation items that are off screen.
 *
 * dsh renders the whole transcript (no virtual list), so a long session is ~17k nodes and every
 * width change (window resize, sidebar toggle) re-lays out all of it on every frame. With
 * `content-visibility:auto` the browser only lays out items near the viewport; the rest keep the
 * size they last had (`contain-intrinsic-size:auto`) and are laid out once they scroll back in.
 *
 * content-visibility also turns on paint containment (overflow is clipped and the item becomes the
 * containing block for fixed descendants), so it is left off where that could show:
 *   - the last items of the flow (the live turn: streaming text, plan card, running row);
 *   - an item under the pointer or holding focus (hover menus, open disclosures, edits);
 *   - empty items, which dsh collapses to height 0 (a placeholder size would open a gap).
 * Off-screen items are still found by Cmd+F and still exist for dsh's own anchors.
 */
part({
    id: 'render-offscreen',
    factory(require, kit) {
        const { ensure, remove } = kit.sheet('render-offscreen', CSS_RENDER_OFFSCREEN);
        return {
            inject: [],
            apply(ctx) {
                ensure();
                ctx.effect(() => () => remove(), 'render-offscreen: styles');
            },
        };
    },
});

// ===== src/parts/08-conversation-flow.js
"use strict";
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
        const { React, h } = kit;
        const V = kit.vocab; // words, kinds, duration (display-shared)
        const SLOT = 'conversation.chat.flow';
        const zh = V.zh;
        /* ---------- classification ----------
           The kind table, the 「名词 ×N」 word lists and the duration wording are display-shared's
           (kit.vocab), so this mode and the native mode (dsh-tool-groups) speak exactly the same words. */
        const ORDER = V.ORDER;
        const words = V.words;
        const turnAt = (node) => {
            const loc = node && node.location;
            if (!loc || (loc.kind !== 'turn' && loc.kind !== 'step'))
                return null;
            return loc.turn || null;
        };
        const turnOf = (node) => {
            const t = turnAt(node);
            return t ? t.turn ?? null : null;
        };
        const turnOpen = (node) => {
            const t = turnAt(node);
            return !!t && t.status === 'open';
        };
        /** The call of a tool-call node: `data.root`, a `tool-result` once settled. */
        const callOf = (node) => (node && node.data && node.data.root) || {};
        const toolName = (node) => { const c = callOf(node); return c.name || (c.call && c.call.name) || ''; };
        const toolKind = (node) => V.TOOL_KIND[toolName(node)] || 'other';
        // settled calls keep one root object, so its state is computed once (the structural signature
        // reads this for every node on every store tick; re-scanning a large output each time would cost)
        const stateCache = new WeakMap();
        const toolState = (node) => {
            const c = callOf(node);
            if (c.kind !== 'tool-result')
                return 'running';
            const hit = stateCache.get(c);
            if (hit !== undefined)
                return hit;
            let state = 'ok';
            if (c.error && c.error.code === 'interrupted')
                state = 'stopped'; // stopped by the user, not a failure
            else if (c.isError)
                state = 'error';
            else {
                // shells report a failing command in the output, as dsh's own tool row reads it
                const out = Array.isArray(c.content) ? c.content.map((b) => (b && b.type === 'text' ? b.text : '')).join('') : '';
                const exit = /\n\[exit code: (-?\d+|null)\]\s*$/.exec(out);
                if ((exit && exit[1] !== '0') || /\n\[killed by signal: [^\]\n]+\]\s*$/.test(out))
                    state = 'error';
            }
            stateCache.set(c, state);
            return state;
        };
        /**
         * The arguments a streaming call has written so far. Its fields arrive as JSON text, so while
         * the body is still incomplete JSON.parse throws and the line would know nothing (and fall back
         * to the bare tool name — 「bash」 tells nobody what is running). Read the strings a line names
         * straight out of the partial body instead.
         */
        const PEEK = /"(command|description|file_path|path|filePath|pattern|query|url|prompt|symbol)"\s*:\s*"((?:[^"\\]|\\.)*)/g;
        const unjson = (s) => { try {
            return JSON.parse(`"${s}"`);
        }
        catch {
            return s.replace(/\\(.)/g, '$1');
        } };
        function partialArgs(raw) {
            const out = {};
            if (!raw)
                return out;
            PEEK.lastIndex = 0;
            let m;
            while ((m = PEEK.exec(raw)))
                if (out[m[1]] === undefined)
                    out[m[1]] = unjson(m[2]);
            return out;
        }
        // parsed once per call: the raw string is the key, so a streaming call re-parses only when its
        // arguments actually grew. Keyed by the (mutable) call object, so it dies with the node.
        const argsCache = new WeakMap();
        /** The arguments as dsh keeps them, still JSON text: settled calls on `call.argsRaw`, a call
            that is still running at the root, a streaming one as its chunk list. */
        const rawArgsOf = (node) => {
            const c = callOf(node);
            return (c.call && c.call.argsRaw) || (typeof c.argsRaw === 'string' ? c.argsRaw : '')
                || (c.args && Array.isArray(c.args.chunks) ? c.args.chunks.join('') : '')
                || '';
        };
        const argsOf = (node) => {
            const c = callOf(node);
            const raw = rawArgsOf(node);
            const hit = argsCache.get(c);
            if (hit && hit.raw === raw)
                return hit.args;
            let args;
            try {
                args = JSON.parse(raw) || {};
            }
            catch {
                args = partialArgs(raw);
            }
            argsCache.set(c, { raw, args });
            return args;
        };
        const blocksOf = (node) => (node && node.data && Array.isArray(node.data.blocks) ? node.data.blocks : []);
        const hasText = (node) => blocksOf(node).some((b) => (b.kind === 'text' && b.text && b.text.trim()) || b.kind === 'image' || b.kind === 'other');
        const firstText = (node) => { for (const b of blocksOf(node))
            if (b.kind === 'text' && b.text && b.text.trim())
                return b.text.trim(); return ''; };
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
        const INJECTED = /^(\[dsh-|<system-reminder>|<post-edit-diagnostics>|MNEMON RUNTIME MEMORY|MNEMON VIEW TOOLS|Time sampled while preparing|This is a new user request|dsh-task-ledger:|A skill is a reusable set of task-specific instructions|任务台账工具\[)/;
        const sourceOf = (node) => {
            const src = node && node.data && node.data.source;
            return src && typeof src === 'object' ? src : null;
        };
        const isInjected = (node) => {
            const src = sourceOf(node);
            if (src && typeof src.kind === 'string') {
                if (src.kind !== 'user')
                    return true;
                if (src.rpcId)
                    return false;
                // user-shaped but not created by a send in this window: the harness writes those, and so do
                // replayed/attached messages. Let the text decide, never hide a row for a missing field.
            }
            const text = firstText(node);
            // No provenance and nothing to show yet: hold the row back instead of drawing it. Drawing on
            // one frame and removing it on the next is the flash itself; a row that never gains text or a
            // source was never a message the user wrote.
            if (!text)
                return true;
            return INJECTED.test(text);
        };
        const reasoningOf = (node) => blocksOf(node).filter((b) => b.kind === 'reasoning' && b.text).map((b) => b.text).join('\n\n').trim();
        const hasReasoning = (node) => blocksOf(node).some((b) => b.kind === 'reasoning' && b.text && b.text.trim());
        /**
         * Row role of a flow entry: user | think | tool | text | other.
         * An assistant step that carries both thinking and text is split by dsh (groupPart) only in its
         * grouped modes; in 完全展开 it is one row, so it counts as text (its thinking stays inside it).
         */
        function roleOf(entry, node) {
            if (!entry || entry.kind !== 'node' || !node)
                return 'other'; // a seat may hand us neither
            switch (node.kind) {
                case 'turn-process': return 'skip'; // dsh's per-turn "已完成，用时" header: our run lines replace it
                // dsh's own `ContextMessageNodeView`: the injected-context row. Its visibility flips to
                // hidden once the turn is prepared, and until then it is the row that flashed.
                case 'context': return 'skip';
                case 'user':
                case 'steering': return 'user';
                case 'tool-call': return 'tool';
                case 'assistant-step':
                    if (entry.groupPart === 'reasoning')
                        return 'think';
                    if (entry.groupPart === 'response')
                        return hasText(node) ? 'text' : 'think';
                    // a step with neither text nor reasoning yet says nothing: it is drawn when it does
                    return hasText(node) ? 'text' : hasReasoning(node) ? 'think' : 'skip';
                // dsh's own node views that are part of the conversation and keep their place: the bar at the
                // end of a turn (copy / fork / retry — that whole row is dsh's), a turn that failed or hit its
                // token limit, a model retry, the compaction dividers, a question the user answered, a
                // workflow run, an approval command.
                case 'turn-tail':
                case 'turn-error':
                case 'turn-max-tokens':
                case 'model-retry':
                case 'manual-compaction':
                case 'compaction':
                case 'question-reply':
                case 'workflow-run':
                case 'command':
                case 'command-input':
                    return 'other';
                // dsh's chrome around the conversation — the injected-context rows (`context`), the turn
                // trigger, the system-prompt rows. Drawn by hand they showed as rows nobody asked for, and
                // the ones dsh hides later flashed in and out.
                case 'turn-trigger':
                case 'system-prompt':
                // a node view dsh itself does not know how to draw: nothing here knows better
                case 'unknown':
                // Kinds dsh adds in a future version are not guessed at either: a row appears here when it
                // is named, not because it fell through.
                default: return 'skip';
            }
        }
        const isGroup = (entry) => entry.kind === 'group' && /^\["process"/.test(entry.key);
        const seqOf = (node) => (node && typeof node.anchorSeq === 'number' ? node.anchorSeq : 0);
        /**
         * dsh folds each process span (thinking + tool calls) into one `group` entry. Put the member
         * nodes back: the thinking and tool-call nodes of that turn whose sequence falls between the
         * row before the group and the row after it, plus the thinking half of the row after it.
         */
        function expand(entries, nodes, all) {
            if (!entries.some(isGroup))
                return entries;
            const shown = new Set(entries.filter((e) => e.kind === 'node').map((e) => e.key));
            const byTurn = new Map();
            for (const node of all) {
                if (node.visibility === 'hidden')
                    continue;
                const t = turnOf(node);
                if (t === null)
                    continue;
                const isTool = node.kind === 'tool-call';
                const isThink = node.kind === 'assistant-step' && hasReasoning(node);
                if (!isTool && !isThink)
                    continue;
                if (isThink && hasText(node) && !shown.has(node.key))
                    continue; // its own text row carries it
                if (!byTurn.has(t))
                    byTurn.set(t, []);
                byTurn.get(t).push(node);
            }
            for (const list of byTurn.values())
                list.sort((a, b) => seqOf(a) - seqOf(b));
            const used = new Set();
            // nodes this pass already emitted as members of a group: their own entry must not be pushed
            // again (that drew one call twice and counted it twice in 「命令 ×N」)
            const absorbed = new Set();
            const out = [];
            for (let i = 0; i < entries.length; i += 1) {
                const entry = entries[i];
                if (!isGroup(entry)) {
                    if (entry.kind === 'node' && !entry.groupPart && absorbed.has(entry.key))
                        continue;
                    out.push(entry);
                    continue;
                }
                let prev, next;
                for (let j = i - 1; j >= 0 && !prev; j -= 1)
                    if (entries[j].kind === 'node')
                        prev = nodes.get(entries[j].key);
                for (let j = i + 1; j < entries.length && !next; j += 1)
                    if (entries[j].kind === 'node')
                        next = nodes.get(entries[j].key);
                const t = (next && turnOf(next)) ?? (prev && turnOf(prev));
                const lo = prev && turnOf(prev) === t ? seqOf(prev) : -Infinity;
                const hi = next && turnOf(next) === t ? seqOf(next) : Infinity;
                // `next` is pulled in only when it is a tool call, i.e. when it has no entry of its own to be
                // drawn by (its entry is dropped by `absorbed` below). Pulling an assistant-step in as well
                // emitted that node twice — once as the group's reasoning part, once as its own row.
                const members = (byTurn.get(t) || []).filter((n) => !used.has(n.key) && ((seqOf(n) > lo && seqOf(n) < hi) || (next && n.key === next.key && n.kind === 'tool-call')));
                if (!members.length) {
                    out.push(entry);
                    continue;
                } // unknown shape: let dsh draw it
                for (const n of members) {
                    used.add(n.key);
                    absorbed.add(n.key);
                    out.push(n.kind === 'assistant-step' && shown.has(n.key)
                        ? { kind: 'node', key: n.key, groupPart: 'reasoning' }
                        : { kind: 'node', key: n.key });
                }
            }
            return out;
        }
        /**
         * One row's share of its turn's signature: what it is, the entry dsh draws it from (an entry can
         * be re-cut into a process group without its node changing) and everything `nodeContrib` tracks.
         */
        const inTurn = (entry, node, tag) => mix(mix(mix(sigId(tag), sigId(entry.key)), sigId(entry.groupPart || '')), node ? nodeContrib(node) : 0);
        /** Cut the entries into turns, and each turn into user rows, process runs and text rows. */
        function layout(entries, nodes, all, view) {
            const turns = [];
            let cur = null;
            for (const entry of expand(entries, nodes, all)) {
                const node = entry.kind === 'node' ? nodes.get(entry.key) : undefined;
                const t = node ? turnOf(node) : cur ? cur.turn : null;
                if (!cur || (t !== null && t !== cur.turn)) {
                    // Keyed on the turn number alone. Carrying the first entry's key meant that every row dsh
                    // spliced in or took away (the injected context) remounted the whole turn: its timers went
                    // back to zero and the fade-in replayed. A turn is the same turn whatever row leads it.
                    // `sig` is what lets an untouched turn skip its re-render: layout builds new turn and
                    // item objects on every pass, so object identity can never answer that question.
                    cur = { turn: t, key: t !== null ? `t:${t}` : `t:none:${turns.length}`, items: [], open: false, sig: 2166136261 };
                    turns.push(cur);
                }
                if (node && turnOpen(node))
                    cur.open = true;
                // How the turn ended, and whether a message was delivered into it while it ran. dsh never
                // folds those two (its 「已停止」/「处理失败」 header takes the place of 「已完成，用时」), so
                // neither do we: folding hides the work that was cut off.
                const loc = node && node.location;
                const reasonLoc = loc && (loc.kind === 'turn' || loc.kind === 'step') ? loc.turn && loc.turn.end : null;
                const reason = reasonLoc && reasonLoc.data && reasonLoc.data.reason && reasonLoc.data.reason.kind;
                if (reason)
                    cur.reason = reason;
                if (node && node.kind === 'steering')
                    cur.interleaved = true;
                const role = roleOf(entry, node);
                if (role === 'skip')
                    continue;
                if (node && node.visibility === 'hidden')
                    continue;
                // injected context (mnemon reviews, reminders, the task-ledger rules) is not the user
                // talking and is not the assistant either: it is left out of the transcript entirely.
                // A steering row is the user interrupting a running turn, so it is never judged by source.
                if (role === 'user' && node && node.kind !== 'steering' && isInjected(node))
                    continue;
                if (role === 'think') {
                    if (view === 'normal')
                        continue; // 标准: no thinking at all
                    if (!reasoningOf(node))
                        continue;
                    cur.items.push({ type: 'think', key: `think:${entry.key}`, entry, node, role });
                    cur.sig = mix(cur.sig, inTurn(entry, node, 'think'));
                }
                else if (role === 'tool') {
                    const last = cur.items[cur.items.length - 1];
                    // a subagent launch is its own line, always in view: it is work handed off, not a detail
                    const spawn = toolName(node) === 'subagent';
                    if (spawn)
                        cur.items.push({ type: 'run', key: `run:${entry.key}`, agent: true, rows: [{ entry, node, role }] });
                    else if (last && last.type === 'run' && !last.agent)
                        last.rows.push({ entry, node, role });
                    else
                        cur.items.push({ type: 'run', key: `run:${entry.key}`, rows: [{ entry, node, role }] });
                    cur.sig = mix(cur.sig, inTurn(entry, node, spawn ? 'agent' : 'run'));
                }
                else {
                    cur.items.push({ type: 'row', key: entry.key, entry, node, role });
                    cur.sig = mix(cur.sig, inTurn(entry, node, 'row'));
                }
            }
            return turns;
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
        const SIG_IDS = new Map();
        let sigNext = 1;
        function sigId(v) {
            if (typeof v !== 'string')
                return typeof v === 'number' ? (v | 0) : 0;
            let id = SIG_IDS.get(v);
            if (id === undefined) {
                id = sigNext++;
                // a session switch builds a new transcript: thousands of new keys, and the old ones are dead
                if (SIG_IDS.size > 60000) {
                    SIG_IDS.clear();
                    sigNext = 1;
                    id = sigNext++;
                }
                SIG_IDS.set(v, id);
            }
            return id;
        }
        /** FNV-1a's multiplier over a mixed number (avalanche enough for one equality test). */
        const mix = (h, v) => Math.imul(h ^ (v | 0), 16777619);
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
        const SIG_ENTRY = new WeakMap();
        const SIG_NODE = new WeakMap();
        /** The length of a call's text output, without building the string `outText` would. */
        function outLen(node) {
            const list = callOf(node).content;
            if (!Array.isArray(list))
                return 0;
            let n = 0;
            for (let i = 0; i < list.length; i += 1) {
                const b = list[i];
                if (b && b.type === 'text' && b.text)
                    n += b.text.length + 1;
            }
            return n;
        }
        const b0Len = (blocks) => (blocks && blocks.length && blocks[0] && typeof blocks[0].text === 'string' ? blocks[0].text.length : -1);
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
            const data = n.data;
            const blocks = data && Array.isArray(data.blocks) ? data.blocks : null;
            const loc = n.location;
            const turn = loc && (loc.kind === 'turn' || loc.kind === 'step') ? loc.turn : null;
            const end = turn ? turn.end : null;
            const seq = n.anchorSeq | 0;
            const b0 = b0Len(blocks);
            let c = SIG_NODE.get(n);
            // fast path: nothing this row's contribution is made of has been replaced
            if (c !== undefined && c.data === data && c.loc === loc && c.turn === turn && c.end === end
                && c.seq === seq && c.b0 === b0)
                return c.contrib;
            if (c === undefined) {
                c = { key: sigId(n.key), kind: sigId(n.kind), vis: '\u0000', visId: 0, data: undefined, loc: undefined,
                    turn: undefined, end: undefined, seq: 0, b0: 0, contrib: 0 };
                SIG_NODE.set(n, c);
            }
            const vis = n.visibility || '';
            if (c.vis !== vis) {
                c.vis = vis;
                c.visId = sigId(vis);
            }
            let x = 2166136261;
            x = mix(x, c.key);
            x = mix(x, c.kind);
            x = mix(x, c.visId);
            x = mix(x, seq);
            // the turn this row belongs to: which one, whether it is still open, and how it ended
            x = mix(x, turn ? (turn.turn ?? -1) : 0);
            x = mix(x, turn && turn.status === 'open' ? 1 : 0);
            x = mix(x, end && end.data && end.data.reason ? sigId(end.data.reason.kind) : 0);
            // the two bits layout reads off the row's blocks: a text to draw, a thought to fold. A text
            // that is only whitespace counts as drawn here — over-sensitive is safe, the layout above
            // still decides with trim(); under-sensitive would leave a row out.
            let bits = 0;
            if (blocks) {
                for (let i = 0; i < blocks.length; i += 1) {
                    const b = blocks[i];
                    if (!b)
                        continue;
                    if (b.kind === 'text') {
                        if (b.text && b.text.length)
                            bits |= 1;
                    }
                    else if (b.kind === 'image' || b.kind === 'other')
                        bits |= 1;
                    else if (b.kind === 'reasoning' && b.text && b.text.length)
                        bits |= 2;
                }
            }
            x = mix(x, bits);
            x = mix(x, sigId(toolName(n)));
            const state = toolState(n);
            x = mix(x, sigId(state));
            x = mix(x, sigId((data && data.status) || ''));
            // a call in flight fills up without any structural change, and its args and its output are
            // what decide whether it can be drawn (blankCall) and which pictures its run shows (imagesOf)
            if (state === 'running') {
                x = mix(x, rawArgsOf(n).length);
                x = mix(x, outLen(n));
            }
            c.data = data;
            c.loc = loc;
            c.turn = turn;
            c.end = end;
            c.seq = seq;
            c.b0 = b0;
            c.contrib = x;
            return x;
        }
        function structSig(nodes, entries, view, cwd, lang) {
            if (!nodes || !entries)
                return '';
            let h = 2166136261;
            h = mix(h, sigId(view));
            h = mix(h, sigId(lang || ''));
            h = mix(h, sigId(cwd || ''));
            h = mix(h, entries.length);
            h = mix(h, nodes.size);
            for (let i = 0; i < entries.length; i += 1) {
                const e = entries[i];
                // the entry objects dsh hands out repeat across notifications too: three interned ids per
                // entry were over half of this pass, one cached mix does the same job
                let c = SIG_ENTRY.get(e);
                if (c === undefined) {
                    c = { kind: '\u0000', key: '\u0000', part: '\u0000', id: 0 };
                    SIG_ENTRY.set(e, c);
                }
                const part = e.groupPart || '';
                if (c.kind !== e.kind || c.key !== e.key || c.part !== part) {
                    c.kind = e.kind;
                    c.key = e.key;
                    c.part = part;
                    c.id = mix(mix(sigId(e.kind), sigId(e.key)), sigId(part));
                }
                h = mix(h, c.id);
            }
            for (const n of nodes.values())
                h = mix(h, nodeContrib(n));
            return `${h >>> 0}`;
        }
        function summary(rows) {
            const counts = {};
            let failed = 0;
            for (const r of rows) {
                const k = toolKind(r.node);
                counts[k] = (counts[k] || 0) + 1;
                if (toolState(r.node) === 'error')
                    failed += 1;
            }
            // the same 「命令 ×3 · 读取 ×2」 builder the native mode uses, order and capitalisation included
            return { text: V.labelOf(counts), failed };
        }
        /* ---------- line icons ---------- */
        /** Tools whose on-screen name differs from the raw tool name. */
        const ALIAS = { compress: 'compact' };
        const svg = (...kids) => h('svg', { width: 16, height: 16, viewBox: '0 0 16 16', 'aria-hidden': true, fill: 'none', stroke: 'currentColor',
            strokeWidth: 1.3, strokeLinecap: 'round', strokeLinejoin: 'round' }, ...kids);
        const P = (d) => h('path', { d });
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
        };
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
        };
        const icon = (k) => {
            const f = FIT[k] || FIT.other;
            const mark = MARKS[k] || MARKS.other;
            return h('span', { className: 'dcd-flow-icon' }, svg(h('g', { transform: f.t, strokeWidth: f.w }, ...mark)));
        };
        /** The glyph's kind: a renamed tool (`compress` reads as compact) keeps its own mark. */
        const iconKind = (node) => ALIAS[toolName(node)] || toolKind(node);
        const mainKind = (rows) => { const ks = new Set(rows.map((r) => iconKind(r.node))); return ORDER.find((k) => ks.has(k)) || (ks.size === 1 ? [...ks][0] : 'other'); };
        /** A tool's name, as the transcript should read it. Only the word on screen changes. */
        const toolLabel = (node) => ALIAS[toolName(node)] || toolName(node);
        const base = (p) => String(p).replace(/\/+$/, '').split('/').pop();
        const clip = (t, n = 72) => { t = String(t).replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
        /** The line for a single settled call, in the words of its kind. */
        function oneLine(node) {
            const a = argsOf(node);
            const z = zh();
            const path = a.file_path || a.path || a.filePath;
            switch (toolKind(node)) {
                case 'command':
                case 'code': return a.description ? clip(a.description) : a.command ? clip(a.command, 60) : '';
                case 'read': return path ? `${z ? '读取' : 'Read'} ${base(path)}` : '';
                case 'edit': return path ? `${z ? '编辑' : 'Edited'} ${base(path)}` : '';
                case 'agent': {
                    const q = a.description || (typeof a.prompt === 'string' ? a.prompt.split('\n')[0] : '');
                    return q ? `${z ? '子智能体' : 'Subagent'} · ${clip(q, 60)}` : '';
                }
                case 'search': {
                    const q = a.pattern || a.query || a.symbol;
                    return q ? `${z ? '搜索' : 'Searched'} ${clip(q, 48)}` : '';
                }
                case 'web': {
                    const q = a.query || a.url;
                    return q ? `${z ? '查询' : 'Fetched'} ${clip(q, 56)}` : '';
                }
                default: return '';
            }
        }
        /**
         * What a call is doing, for the live line. A call whose arguments are still empty says the kind
         * of thing it is (「命令」/「command」), never the bare tool name — 「bash」 is a name, not a
         * description. An unknown tool has no kind to fall back on, so there the name is the only word
         * that says anything.
         */
        const describe = (node) => {
            const one = oneLine(node);
            if (one)
                return one;
            const kind = toolKind(node);
            return kind === 'other' ? toolLabel(node) : words()[kind](1);
        };
        /* ---------- images a call made or read: small previews at the right of its line ---------- */
        /* What a row says about itself, in the form both dsh's row and our own head use for it: the one
           line a person reads. Rows are looked up by this when their keys have moved. */
        const rowText = (node) => clip(oneLine(node), 120).replace(/\s+/g, ' ').trim();
        const IMG = /(?:^|[\s'"`=(:,])((?:~|\.{0,2})?\/?[^\s'"`;|&<>()*?$%{}\u2026]*?\.(?:png|jpe?g|gif|webp|bmp|svg))(?=$|[\s'"`;|&<>),:])/gi;
        const outText = (node) => { const c = callOf(node); return Array.isArray(c.content) ? c.content.map((b) => (b && b.type === 'text' ? b.text : '')).join('\n') : ''; };
        /**
         * A call that has started but has not said a byte yet: no arguments, no output. dsh draws such a
         * row as a lone prompt glyph at the bottom of the card — an empty row, and one that makes the card
         * taller than what is in it. Nothing is known about it to draw, and the live line under the group
         * already says what is running, so the card leaves it out until it has something to show.
         */
        const blankCall = (node) => toolState(node) === 'running' && !rawArgsOf(node).trim() && !outText(node);
        /**
         * The calls an open card may list. Two kinds are left out because something else already speaks
         * for them:
         *  - the call in flight, which the live line under the card is reporting right now. dsh draws a
         *    running call as its icon and no words, so drawing it here too leaves a bare 「>_」 stub at
         *    the bottom of the card, directly above the live line saying the same command.
         *  - a call that has neither arguments nor output yet (blankCall), the first frame of every call.
         * Counts still come from the full row list: the card's header may promise more than it lists.
         */
        const bodyRows = (rows, current) => rows.filter((r) => !(current && current.node && r.node === current.node) && !blankCall(r.node));
        const joinPath = (dir, p) => {
            if (p.startsWith('/'))
                return p;
            const parts = `${dir.replace(/\/+$/, '')}/${p}`.split('/');
            const out = [];
            for (const x of parts) {
                if (x === '..')
                    out.pop();
                else if (x !== '.' && x !== '')
                    out.push(x);
            }
            return `/${out.join('/')}`;
        };
        /** Image files named by the calls of a run (paths in args, the command, or its output), in order. */
        const picCache = new Map(); // node key -> { sig, list }: a call is scanned again only when what it says changes
        // run key -> Map(path -> v): every picture the run has ever named. A run that is still growing
        // appends calls to its own fold, and the fold is redrawn from its rows; without this the tiles
        // would be rebuilt from scratch on each append and blink out of the line and back.
        const runPics = new Map();
        function imagesOf(rows, cwd) {
            const found = [];
            for (const r of rows) {
                const a = argsOf(r.node);
                const cmd = typeof a.command === 'string' ? a.command : '';
                const direct = [a.file_path, a.path, a.filePath, a.image_path].filter((t) => typeof t === 'string' && t);
                // The output is read whether or not the call has landed: a command that is still running has
                // already printed the files it touched, and a run must not wait for it to settle before it can
                // show them. Growth only appends to `runPics` (below), so nothing that was shown disappears.
                const out = outText(r.node) || '';
                const sig = `${cwd || ''}|${cmd}|${direct.join('|')}|${out.length}`;
                const hit = picCache.get(r.node.key);
                let list;
                if (hit && hit.sig === sig)
                    list = hit.list;
                else {
                    list = [];
                    // a command that starts with `cd DIR &&` names files relative to DIR
                    const cd = /^\s*cd\s+(?:"([^"]+)"|'([^']+)'|(\S+))\s*(?:&&|;)/.exec(cmd);
                    const dir = (cd && (cd[1] || cd[2] || cd[3])) || cwd || '';
                    for (const t of [...direct, cmd, out]) {
                        IMG.lastIndex = 0;
                        let m;
                        while ((m = IMG.exec(t))) {
                            let q = m[1];
                            if (q.startsWith('~'))
                                continue;
                            if (!q.startsWith('/')) {
                                if (!dir || !dir.startsWith('/'))
                                    continue;
                                q = joinPath(dir, q);
                            }
                            list.push({ path: q, v: r.node.key });
                        }
                    }
                    picCache.set(r.node.key, { sig, list });
                    // long sessions: drop the oldest rather than rescanning everything at a stroke
                    while (picCache.size > 300) {
                        const oldest = picCache.keys().next();
                        if (oldest.done)
                            break;
                        picCache.delete(oldest.value);
                    }
                }
                found.push(...list);
            }
            const seen = new Set();
            return found.filter((f) => (seen.has(f.path) ? false : (seen.add(f.path), true))).slice(0, 24);
        }
        /* The newest cwd, for the tile a card ROW shows for the file it names: the tool-groups part has
           the DOM but not the node, so it hands its path back here and gets a URL. */
        let cwdNow = '';
        /* flow key of a row -> the picture that row's OWN call named. The run's thumbnails answer “what did
           this group touch”; a row that printed or read one picture needs to say which — and its own text
           does not always name it (`python plot.py` writes out/fig.png without saying so). The key is the
           same one dsh puts on the rendered row (`data-chat-flow-key`), which is what the DOM side reads. */
        const rowPics = new Map();
        // the same picture, keyed by the call id dsh writes on the row (`data-chat-call-id`). The flow key
        // lives on an item *above* the row and moves when dsh re-nests the line (closed groups, sub-calls),
        // so the row asks by the id first and only falls back to the flow key.
        const rowPicsById = new Map();
        /* dsh keeps `data-chat-call-id` on the row, but the id inside the phase object has moved shape
           between releases; a row also always says what it did. Both are used to find a row's picture. */
        const rowPicsByText = new Map();
        /* dsh prints `data-chat-call-id` (the id of the tool-call block) on the row, and that line keeps
           it in every state — folded, open, re-nested. Where the id sits inside the phase object differs
           between the streaming and the settled shape (a normalised block carries `callId`, a live one
           `block.id`), so look for it instead of guessing one path. */
        const callIdOf = (node) => {
            const seen = new Set();
            const walk = (v, depth) => {
                if (!v || typeof v !== 'object' || depth > 3 || seen.has(v))
                    return '';
                seen.add(v);
                for (const k of ['callId', 'callID']) {
                    const raw = v[k];
                    if (typeof raw === 'string' && raw)
                        return raw;
                    if (typeof raw === 'number')
                        return String(raw);
                }
                for (const k of ['call', 'block', 'root']) {
                    const found = walk(v[k], depth + 1);
                    if (found)
                        return found;
                }
                for (const k of ['id', 'index', 'key']) {
                    const raw = v[k];
                    if (typeof raw === 'number')
                        return String(raw);
                    if (typeof raw === 'string' && raw)
                        return raw;
                }
                return '';
            };
            return walk(callOf(node), 0);
        };
        const mediaUrl = (path, v) => {
            try {
                return new URL(`api/file?path=${encodeURIComponent(path)}&v=${encodeURIComponent(v)}`, document.baseURI).href;
            }
            catch {
                return '';
            }
        };
        /* ---------- thinking: the words a thought row says ---------- */
        const thinkMs = (node) => {
            const d = (node && node.data) || {};
            const t = d.timing || (d.finalNode && d.finalNode.timing); // settled steps keep it on finalNode
            return t && t.stepStartTime && t.completedTime ? t.completedTime - t.stepStartTime : 0;
        };
        /**
         * What a thought row says. Live it says 「思考中…」 (with a shimmer); on its own it may say how
         * long it took (「思考 4 秒」); inside an opened group of steps it says only 「思考」 — the rail
         * there is the sequence of work, and a duration next to every line turns it into a report nobody
         * reads. Opened by default in 详尽 only.
         */
        const thoughtLabel = (node, isLive, plain) => {
            const w = words();
            if (isLive)
                return w.thinking;
            const ms = thinkMs(node);
            return !plain && ms >= 1000 ? w.thoughtFor(V.durSec(Math.round(ms / 1000))) : w.thought;
        };
        /* ---------- the caches the view reads, and the clocks it keeps ---------- */
        // first sight of a row / turn, for the live line's seconds; OPENED is the hand-toggle memory
        const firstSeen = new Map();
        const OPENED = new Map();
        /** Stand-in for a store that is momentarily empty (a session switch); must be one stable object. */
        const EMPTY_NODES = new Map();
        const readView = () => document.documentElement.getAttribute('data-dcd-view') || 'normal';
        const readLang = () => document.documentElement.lang || '';
        // the view and the language both live on <html>; the bundle's shared watcher (dom-hub) observes
        // them once for every part, so a language switch re-renders the run / thought labels (they are
        // memoized, so the store alone would not wake them)
        const subscribeHtml = (fn) => kit.dom.attr(fn);
        /** path shown in a row's text → the file URL for its row tile.
           joinPath takes (dir, path) — the other way round silently returned the cwd, which is why every
           tile pointed at the project folder. `~` is expanded from the cwd's own prefix: the browser has
           no HOME, but a session that runs in /Users/me/proj is running as /Users/me. */
        const homeOf = (cwd) => {
            const m = /^(\/Users\/[^/]+|\/home\/[^/]+)/.exec(String(cwd || ''));
            return m ? m[1] : '';
        };
        /** The tile for one rendered row: its own call's first picture, as a file URL. */
        kit.picForRow = (flowKey) => {
            const p = rowPics.get(flowKey);
            return p ? mediaUrl(p.path, p.v) : '';
        };
        kit.picForCall = (callId) => {
            const p = callId ? rowPicsById.get(String(callId)) : undefined;
            return p ? mediaUrl(p.path, p.v) : '';
        };
        kit.picForText = (text) => {
            const key = String(text || '').replace(/\s+/g, ' ').trim();
            if (!key)
                return '';
            const p = rowPicsByText.get(key);
            return p ? mediaUrl(p.path, p.v) : '';
        };
        kit.picUrl = (raw) => {
            let path = String(raw || '').trim();
            if (path.startsWith('~/')) {
                const home = homeOf(cwdNow);
                if (!home)
                    return '';
                path = home + path.slice(1);
            }
            else if (!path.startsWith('/')) {
                path = joinPath(cwdNow, path);
            }
            return path ? mediaUrl(path, 'row') : '';
        };
        /* ---------- compose the view ---------- */
        const { useQuiet, Turn, Tail } = makeFlowView(kit, require, {
            toolKind, toolState, oneLine, describe, clip, base, rowText, summary, bodyRows, imagesOf,
            reasoningOf, hasText, thoughtLabel, icon, iconKind, mainKind, callIdOf, mediaUrl,
            firstSeen, OPENED, runPics, rowPics, rowPicsById, rowPicsByText,
        });
        function makeFlow(Native) {
            return React.memo(function ConversationFlow(props) {
                // the row tiles below resolve a relative path against this turn's cwd
                cwdNow = props.cwd || cwdNow;
                // the mutable Map, one stable reference; the fallback keeps a session switch (the store is
                // momentarily empty) from throwing inside the selector, which would blank the transcript
                const nodes = props.useChat((s) => s.nodes) || EMPTY_NODES;
                // the live-timer and image caches die with the flow
                React.useEffect(() => () => { firstSeen.clear(); picCache.clear(); runPics.clear(); rowPics.clear(); rowPicsById.clear(); rowPicsByText.clear(); OPENED.clear(); }, []);
                const quiet = useQuiet(props);
                // tool runs start folded, except in 详尽 (transcript-view then also opens each call's output)
                const view = React.useSyncExternalStore(subscribeHtml, readView);
                const lang = React.useSyncExternalStore(subscribeHtml, readLang);
                const openRuns = view === 'verbose';
                // Re-render the list only when the transcript's shape changes, not on every streamed token:
                // the signature ignores prose, so a growing reply (or thought) leaves it — and the turn list —
                // unchanged. The streaming row still redraws through dsh's own per-node seat, and Thought
                // through its own subscription. Off-screen turns skip layout via content-visibility (below),
                // whose `auto` intrinsic size remembers each turn after its first paint — no forced measuring.
                const sig = props.useChat((s) => structSig(s.nodes, props.entries || [], view, props.cwd, lang));
                // a turn that only carried injected context has nothing to draw: no empty section, no gap
                const turns = React.useMemo(() => layout(props.entries || [], nodes, nodes.values(), view).filter((t) => t.items.length), [sig]);
                // The caches are keyed by transcript rows and only ever grew: a long session kept a timer
                // start and an image list per row it had ever drawn. Drop the keys whose
                // row is gone, once there are enough of them for it to matter.
                React.useEffect(() => {
                    if (firstSeen.size > 256) {
                        for (const k of [...firstSeen.keys()]) {
                            // `turn:` clocks belong to turns, not to rows: pruning them restarted a running turn's
                            // timer from zero the moment the map passed its cap
                            if (!k.startsWith('turn:') && !nodes.has(k))
                                firstSeen.delete(k);
                        }
                    }
                    if (picCache.size > 300)
                        for (const k of [...picCache.keys()])
                            if (!nodes.has(k))
                                picCache.delete(k);
                    if (runPics.size > 256) {
                        const live = new Set(turns.flatMap((t) => t.items).filter((it) => it.type === 'run').map((it) => it.key));
                        for (const k of [...runPics.keys()])
                            if (!live.has(k))
                                runPics.delete(k);
                    }
                }, [turns]);
                return h('div', { className: 'dcd-flow-root', 'data-dcf': '' }, turns.map((t, i) => h(Turn, { key: t.key, turn: t, last: i === turns.length - 1, openRuns, view, Native, props, quiet, lang })), h(Tail, { Native, props, lang }));
            });
        }
        const sheet = kit.sheet('conversation-flow', CSS_CONVERSATION_FLOW);
        return {
            inject: ['slots'],
            apply(ctx) {
                // dsh hands renderSlot (how nodes get drawn) only to the entry that declared the node slot,
                // and that slot cannot be declared twice. So instead of registering a rival entry, wrap the
                // component of dsh's own entry in place, and put it back on dispose. dsh's entry registers
                // after us and is re-registered on reload, so follow it.
                const OURS = Symbol.for('dsh-conversation-enhancer/conversation-flow');
                let patched; // { entry, original }
                const restore = () => {
                    if (patched && patched.entry.component && patched.entry.component[OURS])
                        patched.entry.component = patched.original;
                    patched = undefined;
                    document.documentElement.removeAttribute('data-dcf');
                    sheet.remove();
                };
                const sync = () => {
                    const native = ctx.slots.entries(SLOT).find((e) => !(e.options && e.options.id) && e.children);
                    if (!native) {
                        restore();
                        return;
                    }
                    if (patched && patched.entry === native && native.component && native.component[OURS])
                        return;
                    restore();
                    const original = native.component;
                    const Flow = makeFlow(original);
                    Flow[OURS] = true;
                    native.component = Flow;
                    patched = { entry: native, original };
                    sheet.ensure();
                    document.documentElement.setAttribute('data-dcf', '');
                };
                let timer;
                ctx.effect(() => {
                    const unsub = ctx.slots.subscribe(SLOT, () => { clearTimeout(timer); timer = setTimeout(sync, 0); });
                    sync();
                    return () => { clearTimeout(timer); unsub(); restore(); };
                }, 'conversation-flow: wrap the native flow');
            },
        };
    },
});

// ===== src/parts/09-auto-older.js
"use strict";
/*!
 * auto-older — load earlier history as you scroll up, instead of pressing 「加载更早」.
 *
 * dsh pages a long transcript: the top of the list has a 「加载更早」 button whose handler
 * (scroll.loadEarlier) fetches one older page and keeps the reader's position while it lands.
 * We press that same button for the reader once they have actually reached the top, so history
 * streams in ahead of them, the way the quiet list does.
 *
 * Deliberately one page per reader gesture, and only at the top:
 *   - the 「加载更早」 line has to be within AHEAD viewport heights of the top edge;
 *   - after a page lands nothing else loads: the reader has to move again (and the shift the page
 *     itself caused does not count), so a small scroll up can never pull in half the history and
 *     leave a long way back down;
 *   - a disabled button or a page already in flight is left alone.
 * Cheap by design: no observers on the list itself (it mutates on every streamed token), at most
 * one look per frame, and nothing at all unless the reader moves.
 */
part({
    id: 'auto-older',
    factory(require, kit) {
        const SCROLL = '[data-conversation-scroll]';
        const BUTTON = '[data-chat-flow] > [class*="_older"] > button';
        const AHEAD = 0.6; // how close (in viewport heights) the 加载更早 line must be to the top edge
        const SETTLE = 600; // ms after a page lands in which scroll movement is dsh keeping the position
        const sheet = kit.sheet('auto-older', CSS_AUTO_OLDER);
        return {
            inject: [],
            apply(ctx) {
                sheet.ensure();
                let frame = 0;
                let armed = true; // a page may load: reset by a reader gesture, cleared by loading one
                let landedAt = 0;
                function check(scroller) {
                    if (!armed)
                        return;
                    const button = scroller.querySelector(BUTTON);
                    if (!button || button.disabled)
                        return;
                    const box = scroller.getBoundingClientRect();
                    const at = button.getBoundingClientRect();
                    if (at.bottom < box.top - box.height * AHEAD)
                        return;
                    armed = false;
                    landedAt = performance.now();
                    button.click();
                }
                // only the reader's own movement arms a page; the shift dsh makes to keep the position
                // while a page lands changes scrollTop too, and must not count as "scrolled up again"
                function onReaderMove(e) {
                    if (e.type === 'wheel' && e.deltaY >= 0)
                        return;
                    // a wheel event targets the innermost element under the pointer, never the scroll container
                    // itself, so the identity test only makes sense for scroll events
                    const scroller = e.target instanceof Element ? e.target.closest(SCROLL) : null;
                    if (!scroller || (e.type !== 'wheel' && e.target !== scroller))
                        return;
                    if (performance.now() - landedAt < SETTLE)
                        return;
                    armed = true;
                    if (frame)
                        return;
                    frame = requestAnimationFrame(() => { frame = 0; check(scroller); });
                }
                ctx.effect(() => {
                    document.addEventListener('scroll', onReaderMove, { capture: true, passive: true });
                    document.addEventListener('wheel', onReaderMove, { capture: true, passive: true });
                    return () => {
                        document.removeEventListener('scroll', onReaderMove, { capture: true });
                        document.removeEventListener('wheel', onReaderMove, { capture: true });
                        cancelAnimationFrame(frame);
                        sheet.remove();
                    };
                }, 'auto-older: page in history at the top, one page per gesture');
            },
        };
    },
});

// ===== src/parts/10-user-markdown.js
"use strict";
/*!
 * dsh-user-markdown — browser half.
 *
 * dsh shows the user's own messages as plain text (PlainUserText); the quiet style shows them formatted.
 * This shadows the keyed `conversation.user.text.node` "text" cell at a priority below dsh's 100
 * (lowest priority renders) and draws the transcript bubble with dsh's own MarkdownText, so the
 * formatting matches the assistant's. Only the live transcript passes interactive:true — the queue
 * strip and the goal command (interactive:false) keep their plain one-line preview, and @session
 * chips / quoted text keep their own cells untouched.
 *
 * A fragment that is a single paragraph stays inline, so a chip in the middle of a sentence still
 * flows; lists / code / tables lay out as blocks. Soft line breaks are kept (pre-wrap) so a plain
 * multi-line message keeps its lines instead of collapsing them the way the assistant arm does.
 */
part({
    id: 'dsh-user-markdown',
    factory(require, kit) {
        const { React, h } = kit;
        const { useSyncExternalStore, useCallback } = React;
        let UI = null;
        try {
            UI = require('@deepseek-ai/dsh-client-ui-primitives');
        }
        catch {
            UI = null;
        }
        const NS = 'user-markdown';
        const zh = { copy: '复制', copied: '已复制', footnotes: '脚注' };
        const en = { copy: 'Copy', copied: 'Copied', footnotes: 'Footnotes' };
        const mdLabels = (t) => ({ code: { copyLabel: t('copy'), copiedLabel: t('copied') }, footnotes: t('footnotes') });
        class RenderBoundary extends React.Component {
            constructor(props) { super(props); this.state = { failed: false }; }
            static getDerivedStateFromError() { return { failed: true }; }
            render() { return this.state.failed ? this.props.fallback : this.props.children; }
        }
        const sheet = kit.sheet('user-markdown', CSS_USER_MARKDOWN);
        function UserMarkdown({ node, interactive, ctx, t }) {
            useSyncExternalStore(useCallback((fn) => ctx.locale.subscribe(fn), [ctx]), () => ctx.locale.getSnapshot());
            const text = String(node.data.display ?? node.data.text ?? '');
            // UI is null when the primitives module is missing, and this fallback is also what the guard
            // below returns — so it has to be built defensively or the fallback path is the crash path
            const plain = UI?.UserTextRun ? h(UI.UserTextRun, { text }) : h('span', null, text);
            // queue strip / goal command (interactive:false) and a missing renderer keep dsh's plain run
            if (interactive !== true || !UI?.MarkdownText)
                return plain;
            return h('span', { className: 'dcd-type-user-md' }, h(RenderBoundary, { fallback: plain }, h(UI.MarkdownText, { text, labels: mdLabels(t) })));
        }
        return {
            inject: ['slots', 'locale'],
            apply(ctx) {
                ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'user-markdown: dictionaries');
                const t = ctx.locale.bind(NS);
                ctx.effect(() => { sheet.ensure(); return sheet.remove; }, 'user-markdown: styles');
                function Slot(props) { return h(UserMarkdown, { ...props, ctx, t }); }
                ctx.slots.inject('conversation.user.text.node', () => ctx.slots.register({
                    name: 'conversation.user.text.node',
                    key: 'text',
                    priority: 0,
                }, Slot));
            },
        };
    },
});

// ===== src/parts/11-native-probe.js
"use strict";
/*!
 * native-probe — say it in the console when a dsh upgrade moves something we style.
 *
 * dsh sets no contract for its own DOM: `data-chat-flow-kind`, `data-disclosure-row` and the
 * CSS-Modules fragments (`_bubble`, `_actions`, …) are internal. When one is renamed, nothing
 * throws — our selectors just stop matching and the page quietly falls back to dsh's look, which
 * reads as "the plugin stopped working" weeks later. This part checks the list in
 * src/lib/native.ts a couple of times per page load (the transcript fills in after mount) and
 * reports a missing row once, naming what the reader would notice.
 *
 * Quiet on purpose:
 *   - only in a chat page (no `[data-chat-flow]`, nothing to judge);
 *   - a row whose `signal` is absent is simply not on screen yet, not broken;
 *   - one report per page load, and only after the flow has had time to render;
 *   - nothing runs while the page sits idle after that.
 */
part({
    id: 'native-probe',
    factory(require, kit) {
        const FIRST = 5000; // ms after mount: the transcript has painted
        const SECOND = 20000; // ms: a session that was still loading its first page now has rows
        return {
            inject: [],
            apply(ctx) {
                const timers = [];
                let reported = false;
                const look = () => {
                    if (reported)
                        return;
                    const missing = probeNative(document);
                    document.documentElement.dataset.dchrMissing = String(missing.length);
                    if (!missing.length)
                        return;
                    reported = true;
                    console.warn(`[dsh-conversation-enhancer] dsh moved ${missing.length} thing(s) this bundle styles — ` +
                        'these rows have fallen back to dsh’s own look:', missing.map((row) => `${row.what} — ${row.sel}`));
                };
                timers.push(setTimeout(look, FIRST), setTimeout(look, SECOND));
                ctx.effect(() => () => {
                    for (const t of timers)
                        clearTimeout(t);
                }, 'native-probe: timers');
            },
        };
    },
});

window.__ModuleLoader__.load({
  id: BUNDLE,
  factory(require) {
    const kit = makeKit(require, BUNDLE)
    const store = featureStore()
    const mods = []
    for (const p of parts) {
      try {
        store.declare(BUNDLE, p.id, p.feature)
        mods.push({ id: p.id, feature: p.feature, ...p.factory(require, kit) })
      } catch (e) { console.error(`[${BUNDLE}] ${p.id} failed to load`, e) }
    }
    return {
      inject: [...new Set(mods.flatMap((m) => m.inject || []))],
      apply(ctx) {
        // one part failing must not take the others down
        for (const m of mods) {
          try {
            if (m.feature) gateFeature(ctx, store, m)
            else m.apply(ctx)
          } catch (e) { console.error(`[${BUNDLE}] ${m.id}`, e) }
        }
      },
    }
  },
})
})()
