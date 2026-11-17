import test from 'node:test';
import assert from 'node:assert/strict';

import { loadVocab, runPart } from './lib/harness.mjs';
import { makeDocument, h } from './lib/minidom.mjs';

/**
 * The row thumbnail, exercised the way dsh builds the row: a `[data-chat-call-id]` wrapper, a
 * `[data-disclosure-row]` line inside it, and the title / summary cells. The bug this guards
 * against is state-dependent — the picture showed while the row was open and disappeared when it
 * was folded — so the same pass is run against both shapes, and against a row whose style was
 * rewritten behind our back.
 */

function load (lang = 'zh-CN') {
  const vocab = loadVocab(lang);
  const doc = makeDocument(lang);
  const sheets = [];
  const kit = {
    vocab,
    h,
    sheet: (id, css) => { sheets.push({ id, css }); return { remove() {} } },
    portal: () => null,
    settingsUI: () => null,
    dom: { subscribe: () => () => {}, touches: () => false, attr: () => {}, poke: () => {} },
    picForCall: () => '',
    picForRow: () => '',
    picForText: () => '',
    picUrl: () => '',
  };
  // a picture that decodes at once: the pass only paints after the file has loaded
  class Image {
    set src (v) { this._src = v; if (this.onload) this.onload() }
    get src () { return this._src }
  }
  const fns = runPart('03-tool-groups.js', kit, lang, [
    'markRowThumb', 'rowPicUrl', 'clearRowPic', 'setRowPic', 'picState', 'titleOf', 'flowTitles',
  ], { document: doc, Image });
  return { ...fns, kit, doc, sheets };
}

/** `<div data-chat-call-id><div class="header"><div data-disclosure-row data-expandable role=button>
 *     <span class="x_title">t</span><span class="x_summary">s</span></div></div></div>` */
function rowDom ({ callId = 'call-1', title = '', summary = '', folded = false } = {}) {
  const titleEl = h('span', { class: 'X_title' }, title);
  const summaryEl = h('span', { class: 'X_summary' }, summary);
  const line = h('div', folded
    ? { 'data-disclosure-row': '' }
    : { 'data-disclosure-row': '', 'data-expandable': '', role: 'button' }, titleEl, summaryEl);
  const header = h('div', { 'data-disclosure-header': '', 'data-has-accessory': '' }, line);
  const card = h('div', { 'data-chat-call-id': callId }, header);
  return { card, line, titleEl, summaryEl };
}

test('a row whose call id is known gets its picture, open or folded', () => {
  for (const folded of [false, true]) {
    const { markRowThumb, kit } = load();
    kit.picForCall = (id) => (id === 'call-1' ? 'api/file?path=/tmp/shot.png&v=1' : '');
    const { card, line } = rowDom({ folded });
    markRowThumb(card);
    assert.equal(line.getAttribute('data-dcd-group-pic-src'), 'api/file?path=/tmp/shot.png&v=1', `folded=${folded}: the marker is set`);
    const tile = line.querySelector('.dcd-group-rowthumb');
    assert.equal(tile && tile.getAttribute('src'), 'api/file?path=/tmp/shot.png&v=1', `folded=${folded}: the tile is in the row`);
  }
});

test('a row is still recognised by its own words when every key moved', () => {
  // what dsh does when it re-nests a line: the call id and the flow key both change
  const { markRowThumb, kit } = load();
  kit.picForCall = () => '';
  kit.picForRow = () => '';
  kit.picForText = (text) => (text === 'Simplify the call-id test' ? 'api/file?path=/tmp/b.png&v=2' : '');
  const { card, line } = rowDom({ title: 'Simplify the call-id test' });
  markRowThumb(card);
  assert.equal(line.getAttribute('data-dcd-group-pic-src'), 'api/file?path=/tmp/b.png&v=2');
  assert.equal(line.querySelector('.dcd-group-rowthumb').getAttribute('src'), 'api/file?path=/tmp/b.png&v=2');
});

test('the tile comes back after a re-render dropped it', () => {
  // React reconciles the row's children on a re-render and removes a node it did not create; the
  // marker stays behind, which used to leave an empty frame for good because the pass trusted it
  const { markRowThumb, kit } = load();
  kit.picForCall = () => 'api/file?path=/tmp/shot.png&v=1';
  const { card, line } = rowDom();
  markRowThumb(card);
  assert.ok(line.querySelector('.dcd-group-rowthumb'));
  line.querySelector('.dcd-group-rowthumb').remove(); // what React's children diff does to our node
  assert.equal(line.querySelector('.dcd-group-rowthumb'), null);
  markRowThumb(card);
  assert.equal(line.querySelector('.dcd-group-rowthumb').getAttribute('src'), 'api/file?path=/tmp/shot.png&v=1', 'the next pass puts it back');
});

test('a row with no picture carries no frame at all', () => {
  const { markRowThumb, kit } = load();
  const { card, line } = rowDom({ callId: 'call-9' });
  markRowThumb(card);
  assert.equal(line.hasAttribute('data-dcd-group-pic'), false, 'no marker, so no empty box');
  assert.equal(line.style.getPropertyValue('--dcd-group-pic'), '');
  kit.picForCall = () => 'api/file?path=/tmp/a.png&v=1';
  markRowThumb(card);
  assert.equal(line.hasAttribute('data-dcd-group-pic'), true);
  kit.picForCall = () => '';
  markRowThumb(card);
  assert.equal(line.hasAttribute('data-dcd-group-pic'), false, 'a picture that goes away takes its frame');
});

test('the tile is styled by a rule that does not depend on the row selector', () => {
  // the frame used to be scoped to ROW: when dsh nests the folded line differently the marker was
  // there but nothing painted. The stylesheet is checked here because that is where the bug lived.
  const { sheets } = load();
  const css = sheets.map((s) => s.css).join('\n');
  assert.match(css, /\.dcd-group-rowthumb\s*\{[^}]*flex:\s*none;\s*order:\s*8/, 'the tile rule is class-scoped');
  assert.match(css, /\[data-dcd-group-pic\]::after\s*\{[^}]*order:\s*9/, 'and the chevron order keys off the marker');
  assert.doesNotMatch(css, /\[data-disclosure-row\][^{]*\.dcd-group-rowthumb/, 'no ROW-scoped copy left');
});

test('a path that does not decode never leaves a broken frame', async () => {
  const vocab = loadVocab('zh-CN');
  const doc = makeDocument('zh-CN');
  let fail = false;
  class FakeImage {
    set src (v) { this._src = v; queueMicrotask(() => (fail ? this.onerror() : this.onload())) }
    get src () { return this._src }
  }
  const kit = {
    vocab, h,
    sheet: () => ({ remove() {} }), portal: () => null, settingsUI: () => null,
    dom: { subscribe: () => () => {}, touches: () => false, attr: () => {}, poke: () => {} },
    picForCall: () => 'api/file?path=/tmp/missing.png&v=1',
    picForRow: () => '', picForText: () => '', picUrl: () => '',
  };
  const fns = runPart('03-tool-groups.js', kit, 'zh-CN', ['markRowThumb', 'picState'], { document: doc, Image: FakeImage });
  const { card, line } = rowDom();
  fail = true;
  fns.markRowThumb(card);
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(line.hasAttribute('data-dcd-group-pic'), false, 'a 404 leaves the row as if it never had one');
  assert.equal(fns.picState.get('api/file?path=/tmp/missing.png&v=1'), 'dead', 'and it is not probed again');
});

test('one sweep over a card marks every row it holds', () => {
  // the entry point the 600ms sweep uses; it walks the document, so the fake DOM has to find the
  // card the way dsh nests it: `.dcd-flow-card` (ours) holding `[data-chat-call-id]` rows from dsh
  const { flowTitles, kit, doc } = load();
  kit.picForCall = (id) => `api/file?path=/tmp/${id}.png&v=1`;
  const a = rowDom({ callId: 'call-a', folded: true });
  const b = rowDom({ callId: 'call-b' });
  const card = h('div', { class: 'dcd-flow-card' }, a.card, b.card);
  doc.body.appendChild(card);
  flowTitles();
  assert.match(a.line.getAttribute('data-dcd-group-pic-src') || '', /call-a\.png/, 'the folded row');
  assert.match(b.line.getAttribute('data-dcd-group-pic-src') || '', /call-b\.png/, 'the open row');
});
