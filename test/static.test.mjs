/*
 * Static checks: the things that break quietly when a file is edited by hand — a node kind that
 * loses its decision, a translation that only exists in one language, a CSS class nothing draws, a
 * README that describes files that no longer exist.
 *
 * These read the sources, not the build, and need no browser.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { root, loadFlow } from './lib/harness.mjs';

const flowApi = loadFlow('zh-CN');

const src = (p) => readFileSync(join(root, p), 'utf8');
const parts = readdirSync(join(root, 'src/parts')).filter((f) => f.endsWith('.ts')).sort();
const styleFiles = readdirSync(join(root, 'src/styles')).filter((f) => f.endsWith('.scss') && !f.startsWith('_')).sort();
const flow = src('src/parts/08-conversation-flow.ts');
const view = src('src/lib/flow-view.ts');
const allParts = parts.map((f) => src(`src/parts/${f}`)).join('\n');
const allStyles = styleFiles.map((f) => src(`src/styles/${f}`)).join('\n');
// code = parts + the flow view; source = code + the style modules (attributes written in code are
// read by the CSS, so contract checks have to see both halves)
const allCode = allParts + '\n' + view;
const allSource = allCode + '\n' + allStyles;

/* ---------- dsh's node kinds ---------- */

// Every occupant of dsh's `conversation.chat.node` slot (read out of the running app's asar).
const NODE_KINDS = [
  'user', 'steering', 'context', 'turn-trigger', 'system-prompt', 'assistant-step', 'command',
  'manual-compaction', 'compaction', 'model-retry', 'turn-error', 'turn-max-tokens', 'turn-process',
  'turn-tail', 'unknown', 'command-input', 'tool-call', 'question-reply', 'workflow-run',
];

test('every node kind dsh can emit has an explicit decision in roleOf', () => {
  const body = flow.slice(flow.indexOf('function roleOf'), flow.indexOf('const isGroup'));
  const decided = new Set([...body.matchAll(/case '([a-z-]+)'/g)].map((m) => m[1]));
  for (const kind of NODE_KINDS) assert.ok(decided.has(kind), `roleOf has no case for '${kind}'`);
});

test('the kinds we hand back to dsh are the ones that are part of the conversation', () => {
  const role = (kind) => flowApi.roleOf({ kind: 'node', key: 'k' }, { key: 'k', kind, data: { blocks: [] } });
  for (const kind of ['turn-tail', 'turn-error', 'turn-max-tokens', 'model-retry', 'question-reply', 'workflow-run', 'command', 'command-input', 'compaction']) {
    assert.equal(role(kind), 'other', `'${kind}' should be drawn by dsh`);
  }
  for (const kind of ['context', 'system-prompt', 'turn-trigger', 'turn-process', 'unknown']) {
    assert.equal(role(kind), 'skip', `'${kind}' must not be drawn`);
  }
});

/* ---------- words ---------- */

test('both languages carry the same words', () => {
  const { WORDS } = flowApi.vocab;
  const zhKeys = Array.from(Object.keys(WORDS.zh)).sort();
  const enKeys = Array.from(Object.keys(WORDS.en)).sort();
  assert.ok(zhKeys.length > 20, 'parsed no words');
  assert.deepEqual(enKeys, zhKeys);
});

test('every kind in the shared order has a word in both languages', () => {
  const { WORDS, ORDER } = flowApi.vocab;
  for (const kind of Array.from(ORDER)) {
    assert.equal(typeof WORDS.zh[kind], 'function', `zh has no word for '${kind}'`);
    assert.equal(typeof WORDS.en[kind], 'function', `en has no word for '${kind}'`);
  }
});

/* ---------- css ---------- */

const classNames = (text) => new Set([...text.matchAll(/dcd-flow-[a-z0-9-]+/g)].map((m) => m[0]));

// Kept only for the sibling bundles that still name the pre-rename spelling: `dcf-card`, `dpc-card`
// and `dpc-list` are what dsh-claude-theme's glass rules query, `data-dcg-member` is its row marker.
// Nothing in this bundle reads them — drop both sides together when those bundles are renamed.
const LEGACY_NAMES = new Set(['dcf-card', 'dpc-card', 'dpc-list', 'data-dcg-member']);

test('no CSS rule targets a class nothing draws', () => {
  // classes in style sheets:
  const styled = new Set();
  for (const m of allStyles.matchAll(/^\s*\.(dcd-flow-[a-z0-9-]+)/gm)) styled.add(m[1]);
  for (const m of allStyles.matchAll(/\.(dcd-flow-[a-z0-9-]+)[\s,{:]/g)) styled.add(m[1]);
  // classes drawn somewhere in the client code (className / class: / selector strings):
  const drawn = classNames(allCode);
  const dead = [...styled].filter((c) => !drawn.has(c));
  assert.deepEqual(dead.sort(), [], `styled but never drawn: ${dead.join(', ')}`);
});

test('every class the flow draws is styled', () => {
  const styled = new Set();
  for (const m of allStyles.matchAll(/^\s*\.(dcd-flow-[a-z0-9-]+)/gm)) styled.add(m[1]);
  for (const m of allStyles.matchAll(/\.(dcd-flow-[a-z0-9-]+)[\s,{:]/g)) styled.add(m[1]);
  const drawn = new Set([...(flow + view).matchAll(/'dcd-flow-[a-z0-9- ]+'/g)].flatMap((m) => m[0].slice(1, -1).split(/\s+/)));
  const unstyled = [...drawn].filter((c) => c && !styled.has(c) && !LEGACY_NAMES.has(c));
  assert.deepEqual(unstyled.sort(), [], `drawn but never styled: ${unstyled.join(', ')}`);
});

/* ---------- files and docs ---------- */

test('every part on disk is compiled into the bundle', () => {
  const client = src('client.js');
  for (const file of parts) {
    const text = src(`src/parts/${file}`);
    const id = /part\(\{\s*\n\s*id: '([^']+)'/.exec(text)?.[1];
    assert.ok(id, `${file} declares no part id`);
    assert.ok(client.includes(`id: '${id}'`), `client.js does not contain part '${id}'`);
  }
  assert.equal(new Set(parts).size, parts.length);
});

test('the README lists exactly the parts that exist', () => {
  const readme = src('README.md');
  const listed = new Set([...readme.matchAll(/src\/parts\/(\d\d-[a-z-]+)\.ts/g)].map((m) => m[1]));
  for (const file of parts) {
    const name = file.replace(/\.ts$/, '');
    assert.ok(listed.has(name), `README does not list ${name}`);
  }
  for (const name of listed) assert.ok(existsSync(join(root, `src/parts/${name}.ts`)), `README lists a missing ${name}`);
});

test('no source file still points at the pre-migration .js paths', () => {
  const readme = src('README.md');
  assert.equal(/(src\/\d\d-[a-z-]+\.js)/.test(readme), false, 'README still references src/*.js');
  assert.equal(/src\/0\d-[a-z-]+\.js/.test(flow), false, 'conversation-flow header still references src/*.js');
});

test('the tsconfig is strict enough to keep the migration honest', () => {
  const cfg = JSON.parse(src('tsconfig.json').replace(/^\s*\/\/.*$/gm, ''));
  const o = cfg.compilerOptions;
  assert.equal(o.noEmitOnError, true);
  assert.equal(o.noUnusedLocals, true);
  assert.equal(o.noFallthroughCasesInSwitch, true);
  assert.equal(o.strict, false, 'strict is off on purpose: the sources came from JS');
  assert.equal(o.noImplicitAny, false);
});

/* ---------- regressions found by the 2026-11-16 audit ---------- */

const groups3 = src('src/parts/03-tool-groups.ts');
const group = groups3;
const groupsCss = src('src/styles/03-tool-groups.scss');
const plan = src('src/parts/04-plan-checklist.ts');
const bash = src('src/parts/06-bash-highlight.ts');
const hub = src('src/parts/00-dom-hub.ts');
const older = src('src/parts/09-auto-older.ts');
const markdown = src('src/parts/10-user-markdown.ts');

test('tool-groups never replaces a DOM node React owns', () => {
  // `card.replaceWith(...)` on dsh's ioCard left React a stale child: its next removeChild threw
  assert.equal(/\.replaceWith\(/.test(groups3), false, 'replaceWith on a React-owned node is back');
  assert.match(groups3, /dataset|setAttr\(card, 'data-dcd-group-fb-src'/, 'the ioCard is hidden, not replaced');
  assert.match(groupsCss, /\[data-dcd-group-fb-src\]\{display:none!important\}/, 'the hidden ioCard needs its rule');
});

test('tool-groups reverts everything it wrote when it is torn down', () => {
  for (const flag of ['data-dcd-group-gone', 'data-dcd-group-fb-src', 'data-dcd-group-fb']) {
    const cleanup = groups3.slice(groups3.indexOf('return () => {'));
    assert.ok(cleanup.includes(flag), `teardown leaves ${flag} behind`);
  }
  // and the inline style hideContextRows writes has to be undone as well
  assert.match(groups3, /row\.style\.display = ''/, 'teardown must clear the inline display');
});

test('the one-second live timer cannot stay on after the flow takes over', () => {
  assert.match(groups3, /if \(flowActive\(\)\) \{ anyLive = false;/, 'flowActive branch must clear anyLive');
  assert.match(groups3, /setInterval\(\(\) => \{ if \(anyLive\) schedule\(\) \}/, 'the tick guard is gone');
});

test('the flow-mode subscriber does not scan the document on every frame', () => {
  const branch = groups3.slice(groups3.indexOf('if (flowActive()) {'), groups3.indexOf('if (!kit.dom.touches(recs, \'[data-chat-flow-kind]'));
  assert.match(branch, /touches\(recs, '\[data-context-injection-body\]/, 'hideContextRows must be gated on the records');
});

test('turn-process status is resolved with one query, not one per row', () => {
  assert.match(groups3, /const doneTurns = new Set\(qa\('\[data-chat-flow-kind="turn-tail"\]'\)/, 'the per-row document query is back');
  assert.equal(/querySelector\(`\[data-chat-flow-kind="turn-tail"\]\[data-chat-turn/.test(groups3), false);
});

test('the plan card anchors inside the main conversation and clicks the dock once', () => {
  assert.match(plan, /qa\('\.dcd-flow-turn', document\.querySelector\('\[data-slot="main\.conversation"\]'\) \|\| document\)/,
    'document-wide .dcd-flow-turn picks the sidebar transcript');
  assert.match(plan, /!clickedPanels\.has\(btn\)/, 'the dock toggle can be clicked on every pass again');
  assert.match(plan, /pops\.add\(id\)/, 'the one-shot data-pop timer must be cancellable');
});

test('bash-highlight builds Highlight sets without spreading thousands of ranges', () => {
  assert.equal(/new Highlight\(\.\.\./.test(bash), false, 'the spread that throws RangeError is back');
  assert.match(bash, /const setHL = \(name: string, ranges: StaticRange\[\]\)/, 'ranges must be added in a loop');
  assert.match(bash, /\.dcd-flow-card \[class\*="_root"\] > pre\[class\*="_output"\]/, 'flow-mode output is not lexed');
});

test('the mutation hub does not observe the plugin\'s own grouping marker', () => {
  const filter = hub.slice(hub.indexOf('attributeFilter'), hub.indexOf(']', hub.indexOf('attributeFilter')));
  assert.equal(filter.includes('data-dcd-group-hide'), false, "observing data-dcd-group-hide wakes the plan-card part on every pass");
});

test('auto-older arms on a wheel event, whose target is never the scroller', () => {
  assert.match(older, /e\.type !== 'wheel' && e\.target !== scroller/, 'the wheel half of the gesture is unreachable');
});

test('the plain user-text fallback never dereferences a missing renderer', () => {
  const fn = markdown.slice(markdown.indexOf('function UserMarkdown'), markdown.indexOf('ctx.slots.inject'));
  assert.equal(/const plain = h\(UI\./.test(fn), false, 'UI can be null: the fallback path was the crash path');
  assert.match(fn, /UI\?\.UserTextRun \? h\(UI\.UserTextRun/, 'the fallback has to guard the module as well as the component');
});

test('the live line keeps the turn clock out of the row-key space', () => {
  assert.match(view, /const tkey = `turn:\$\{turnKey\}`/, "turnKey already is t:<n>: the clock lived under t:t:<n>");
  assert.match(flow, /!k\.startsWith\('turn:'\) && !nodes\.has\(k\)/, 'the pruner must not drop turn clocks');
});

test('the live line pins its tail without a layout read per token', () => {
  // the old view measured a Range and wrote `transform` on every render: one forced synchronous
  // layout per streamed token. CSS packs the tail now; JS only marks a row that is actually cut.
  assert.doesNotMatch(view, /createRange|translateX/, 'the per-token transform is back');
  const css = src('src/styles/08-conversation-flow.scss');
  assert.match(css, /\.dcd-flow-live > \.dcd-flow-preview-live\{[^}]*justify-content:flex-end/, 'the row must right-pack its tail');
  assert.match(css, /\.dcd-flow-tail\{[^}]*min-width:100%[^}]*width:max-content/, 'the tail must be at least the row and as wide as its words');
});

test('a hand toggle survives the line being rebuilt', () => {
  // the choice used to live in the component's own state: a line that React rebuilt (a new call
  // arriving, a view switch) came back at its default state, so an opened card closed itself.
  assert.match(flow, /const OPENED = new Map\(\)/, 'the choice has to outlive one render');
  assert.match(view, /const key = `\$\{view\}\|\$\{lineKey\}`/, 'the view is part of the key, so 标准 and 思考 stay separate');
  assert.match(view, /const \[picked, setUserOpen\] = useKeptOpen\(run\.key, view, defaultOpen\)/, 'the run line must read its state from there');
  assert.match(view, /useKeptOpen\(items\[0\] \? items\[0\]\.key : 'steps'/, 'the folded steps line too');
  assert.match(view, /h\(Steps, \{ key: it\.key, items: list, render, view \}\)/, 'the steps line needs the view it was opened in');
});

test('the image viewer cannot stay open past the end of its list', () => {
  assert.match(view, /if \(at >= live\.length\) setAt\(-1\)/, 'a shrinking picture list leaves the viewer on nothing');
});

test('a failed turn is not announced twice', () => {
  assert.match(view, /turn-error' \|\| it\.node\.kind === 'turn-max-tokens'/, 'dsh draws its own failure row');
  assert.match(view, /\(failed && !dshEnded\)/, 'our line has to defer to it');
});

test('a turn the reader typed into still folds its steps', () => {
  // dsh keeps a turn with interleaved input open (`hasInterleavedInput`), and copying that left
  // every turn the reader typed during — several messages in one turn — permanently flat, which
  // is the 「多条消息不收起」 report: the stretch worth folding is exactly the interrupted one
  assert.match(view, /const keepOpen = stopped \|\| failed\b/, 'interleaved input must not hold a stretch open');
  assert.doesNotMatch(view, /keepOpen = [^\n]*turn\.interleaved/, 'the flat interrupted turn is back');
  assert.match(flow, /kind === 'steering'\) cur\.interleaved = true/, 'the flag itself stays for the ending rules');
});

test('a turn that did not change is not drawn again, and the signature is what says so', () => {
  // layout builds new turn objects on every pass, so a memo keyed on identity re-rendered the whole
  // transcript once per tool call — the hitch a long session showed while work advanced
  assert.match(view, /a\.turn\.sig === b\.turn\.sig/, 'the turn memo fell back to object identity');
  assert.match(view, /a\.turn\.open === b\.turn\.open/, 'a turn opening has to re-draw even when its rows stand still');
  assert.match(flow, /items: \[\], open: false, sig: 2166136261/, 'the turn signature starts here');
  assert.match(flow, /cur\.sig = mix\(cur\.sig, inTurn\(entry, node, spawn \? 'agent' : 'run'\)\)/, 'a landed call must move the signature');
  assert.match(flow, /const SIG_NODE = new WeakMap/, 'the per-row contribution is what a pass can afford to re-read');
  assert.match(flow, /if \(c !== undefined && c\.data === data && c\.loc === loc/, 'without the identity fast path the pass costs a frame');
});

test('every mark keeps the same stroke weight after its fit', () => {
  // the fit scales a shape into the common ink box; the stroke is divided by that scale, so a row of
  // icons of different extents weighs the same
  const fits = flow.match(/const FIT = \{[\s\S]*?\n    \}/)[0];
  const rows = [...fits.matchAll(/(\w+): \{ t: 'translate\([-\d.]+ [-\d.]+\) scale\(([\d.]+)\)', w: ([\d.]+) \}/g)];
  assert.ok(rows.length >= 12, `expected a fit per mark, found ${rows.length}`);
  for (const [, name, scale, w] of rows) {
    const weight = Number(scale) * Number(w);
    assert.ok(Math.abs(weight - 1.3) < 0.05, `${name}: stroke ${weight.toFixed(2)} ≠ 1.3`);
  }
});

test('no attribute is written that nothing reads', () => {
  // a `data-*` attribute we set is a contract with something that reads it — a style sheet, a query, a
  // neighbouring part. One that is only ever written is a leftover: it costs a DOM write on every
  // render and documents behaviour that no longer exists (`data-tool-live`, `data-dcd-flow-live` were the
  // remains of handing the live line to dsh's own running row).
  const files = Object.fromEntries([
    ...parts.map((f) => [`parts/${f}`, src(`src/parts/${f}`)]),
    ...styleFiles.map((f) => [`styles/${f}`, src(`src/styles/${f}`)]),
    ['lib/flow-view.ts', view],
  ]);
  const written = new Set();
  for (const text of Object.values(files)) {
    for (const m of text.matchAll(/'(data-[a-z0-9-]+)'\s*:/g)) written.add(m[1]);
    for (const m of text.matchAll(/setAttribute\('(data-[a-z0-9-]+)'/g)) written.add(m[1]);
    for (const m of text.matchAll(/setAttr\([^,]+,\s*'(data-[a-z0-9-]+)'/g)) written.add(m[1]);
  }
  const all = Object.values(files).join('\n');
  const orphans = [...written].filter((a) => all.split(a).length - 1 < 2 && !LEGACY_NAMES.has(a)).sort();
  assert.deepEqual(orphans, [], 'written but never read or styled');
});

test('a path is joined as (dir, path), never the other way round', () => {
  // joinPath(dir, p) returns p untouched when p is absolute, so passing the two arguments the wrong
  // way round does not throw: it silently resolves every picture against the cwd and every tile points
  // at the project folder. The row-tile URL is built in conversation-flow; the run's images in imagesOf.
  const flow = src('src/parts/08-conversation-flow.ts');
  assert.ok(/joinPath\(cwdNow, path\)/.test(flow), 'picUrl must resolve against the cwd');
  assert.ok(!/joinPath\(raw, cwdNow\)/.test(flow), 'picUrl must not pass the path first');
  assert.ok(/joinPath\(cwd, q\)/.test(flow), 'imagesOf must resolve a given path against the cwd');
  // `~` has no meaning to the browser: it is expanded from the session's own cwd
  assert.ok(/homeOf\(cwdNow\)/.test(flow), 'picUrl must expand ~ from the cwd prefix');
});

test('a row shows the picture its own call named, not one parsed out of its text', () => {
  // a bash row's text is the description it was given (「Upscale screenshot regions」) — the file it
  // wrote is only in its arguments. So the DOM side asks the flow side for the row's own picture and
  // keeps the text scan only as a fallback (「读取图片 · /tmp/z5.png」).
  const dom = src('src/parts/03-tool-groups.ts');
  const flow = src('src/parts/08-conversation-flow.ts');
  assert.ok(/kit\.picForRow/.test(dom), 'the row tile must ask for the call\'s own pictures');
  // the flow key is the *position* (a group key inside a collapsed group); the node key is the row's
  // own identity and the one the picture map is keyed by
  assert.ok(/data-chat-node-key/.test(dom), 'the row asks by the node key dsh rendered, not the group key');
  assert.ok(/closest\(`\[\$\{sel\}\]`\)/.test(dom), 'both keys are read from the row or the item above it');
  assert.ok(/kit\.picForCall/.test(dom), 'and by the call id on the row, the most local key of all');
  assert.ok(/kit\.picForRow = \(flowKey\) =>/.test(flow), 'the flow part must publish the per-row lookup');
  assert.ok(/rowPics\.set\(r\.entry\.key/.test(view), 'rows are keyed by their flow entry');
});

test('the row picture is a real tile you can click open', () => {
  // the tile is a node, so it can be clicked and shown full size; React may drop it on a re-render of
  // the row, which is why the sweep re-applies it and setRowPic is idempotent. It is only added after
  // the file decoded and only once per row.
  const dom = src('src/parts/03-tool-groups.ts');
  assert.match(dom, /data-dcd-group-pic/, 'the row carries the picture marker (the chevron margin keys off it)');
  assert.match(groupsCss, /\.dcd-group-rowthumb\{flex:none;order:8/, 'the tile is ordered beside the chevron');
  assert.match(dom, /tile\.className = 'dcd-group-rowthumb'/, 'one tile per row line');
  assert.match(dom, /openPeek\(tile!\.src\)/, 'a click opens the file full size');
  const fn = dom.slice(dom.indexOf('const markRowThumb'), dom.indexOf('/* One pass over the rows'));
  assert.ok(/probe\.onerror/.test(fn), 'a path that does not decode is dropped, never painted as a broken frame');
  assert.match(dom, /if \(tile\.getAttribute\('src'\) !== want\)/, 'the src only moves when it must, so no re-request');
});

test('a row is recognised by its own words when its keys move', () => {
  // the id inside dsh's phase object and the keys on the row have both changed shape; the line the
  // row prints has not, so a picture is found by it as a last resort
  assert.match(flow, /const rowText = \(node\) => clip\(oneLine\(node\), 120\)/, 'one normalised line per row');
  assert.match(flow, /const rowPicsByText = new Map\(\)/, 'the index itself');
  assert.match(flow, /kit\.picForText = \(text\) =>/, 'published to the DOM pass');
  assert.match(group, /const byText = (?:nested \? null : )?kit\.picForText/, 'asked before scraping the text for a path');
  assert.match(view, /for \(const k of was\.texts\) if \(!keep \|\| !keep\.texts\.has\(k\)\) rowPicsByText\.delete\(k\)/, 'and pruned with the rest');
  // pruned per turn: against one turn's rows, the shared maps lost every other turn's pictures
  assert.doesNotMatch(view, /for \(const k of \[\.\.\.rowPics\.keys\(\)\]\) if \(!keys\.has\(k\)\)/, 'no turn prunes another turn\'s rows');
  assert.match(view, /ownedPics\.set\(turn\.key, \{ keys, ids, texts \}\)/, 'each turn tracks what it wrote');
});

test('the tile paints on whatever element ends up holding the marker', () => {
  // when the row is folded dsh nests it differently; a rule scoped to ROW left the marker unpainted
  assert.match(groupsCss, /\.dcd-group-rowthumb\{flex:none;order:8/, 'the tile style must not depend on the row selector');
  assert.match(groupsCss, /\[data-dcd-group-pic\]::after\{order:9/, 'nor the chevron order');
});

test('a picture whose style was wiped is put back, not assumed', () => {
  assert.match(group, /if \(!tileOf\(host\)\) setRowPic\(host, want\)/,
    'the early return trusted a marker React had already orphaned');
});

test('the styles only use design tokens dsh actually defines', () => {
  // `--dsw-alias-surface-l1` does not exist: every use silently fell back, which in a dark theme is
  // a light grey box in the middle of a row. Tokens live in dsh's theme sheet; keep to the ones it has.
  // the families dsh's theme sheet defines (taken from app.asar); anything else falls back silently
  const KNOWN = /^--dsw-alias-(bg|border|brand|button|card|chart|code|file|fill|hovercard|illustration|interactive|json|label|link|markdown|menu|onboarding|scrollbar|separator|settings|state|switch|toast|tooltip|trajectory|turn)[a-z0-9-]*$/
  const used = new Set([...allSource.matchAll(/var\((--dsw-[a-z0-9-]+)/g)].map((m) => m[1]))
  const unknown = [...used].filter((t) => t.startsWith('--dsw-alias-') && !KNOWN.test(t))
  assert.deepEqual(unknown, [], `unknown design tokens: ${unknown.join(', ')}`);
});

test('the action-button label is left exactly as dsh ships it', () => {
  // position and look both belong to dsh: the chip opens below its button, in its own dark fill.
  // (We lifted it above for a while, then tried a frosted chip; both read worse — 2026-11-16.)
  const polish = src('src/parts/02-transcript-polish.ts');
  assert.doesNotMatch(polish, /role="tooltip"/, 'no rule of ours names the label');
  assert.doesNotMatch(polish, /data-tooltip/, 'nor the data-tooltip variant');
  const theme = readFileSync(join(root, '..', 'dsh-whale-theme/src/parts/06-glass.ts'), 'utf8');
  assert.doesNotMatch(theme, /role="tooltip"/, 'the theme leaves it alone');
});

test('the message bubble never swallows the action tooltip', () => {
  // regression: `[class*="_bubble"]` matched dsh's tooltip chip too (`_bubble_<hash>`), and because a
  // message's tooltip is rendered inside the message, your own messages' labels came out as a tinted
  // 18px bubble in reading size — no !important rule of ours could outrank it.
  const typo = src('src/styles/05-typography.scss');
  const bubble = typo.match(/\$bubble-user: '([^']*)'/);
  assert.ok(bubble, 'the bubble selector is one constant');
  assert.match(bubble[1], /:not\(\[class\*="_bubbleWidth"\],\[role="tooltip"\]\)/,
    'the chip is excluded by role, since its class carries the same _bubble word');
  assert.match(typo, /#\{\$bubble-user\}\{font-size:var\(--dcd-type-size\)!important/,
    'and the tinted bubble itself still follows the reading size');
});

test('a message still waiting in the inbox is drawn like a sent one', () => {
  // a message typed while a turn runs waits in the inbox, and dsh draws that echo as a bare row:
  // no [data-chat-flow-kind] seat, only data-pending-steering / data-submission-echo. Scoping the
  // bubble to the seats left those echoes on dsh's blue, so the same message the reader typed came
  // out in a different colour depending on whether the turn had been busy when they sent it.
  const typo = src('src/styles/05-typography.scss');
  const bubble = typo.match(/\$bubble-user: '([^']*)'/);
  for (const root of ['[data-pending-steering]', '[data-submission-echo]', '[data-chat-flow-kind="command-input"]']) {
    assert.ok(bubble[1].includes(root), `the pending echo (${root}) has to reach the same bubble`);
  }
});

test('the row lightbox closes on click and on Escape', () => {
  const dom = src('src/parts/03-tool-groups.ts');
  assert.match(dom, /const onPeekKey[\s\S]{0,140}if \(e\.key !== 'Escape'\) return/, 'Escape closes it');
  assert.match(dom, /box\.addEventListener\('click',[\s\S]{0,120}closePeek\(\)/, 'so does a click anywhere on it');
  assert.match(dom, /closePeek\(\)\n        document\.querySelectorAll\('\.dcd-group-rowthumb'\)/, 'and it never outlives the part');
});

test('a row with a thumbnail keeps the chevron hard against the right edge', () => {
  // the chevron's own rule is `${OPEN} ${ROW}::after{margin-left:auto}` — deeper than an unscoped
  // `[data-dcd-group-pic]::after`, so without !important both auto margins split the slack and the picture
  // lands mid-row instead of beside the chevron
  const css = src('src/styles/03-tool-groups.scss')
  assert.match(css, /\[data-dcd-group-pic\]::after\{[^}]*margin-left:0!important/,
    'the thumbnail row must take the chevron auto margin away from it')
})

test('the mark and its nudge follow the reading size, not a fixed pixel', () => {
  const flowCss = src('src/styles/08-conversation-flow.scss');
  // a fixed 16px box and a fixed .5px drop drift apart the moment the reader changes the text size
  assert.equal(/translateY\(\.5px\)/.test(flowCss), false, 'the drop went back to a fixed pixel');
  assert.ok(flowCss.includes('@include icon-box($mark-size)'), 'the mark box lost its ratio');
  assert.ok(flowCss.includes('transform:translateY(#{$mark-drop})'), 'the drop lost its ratio');
  assert.ok(flowCss.includes('$mark-size: calc(var(--dsh-content-font-size, 14px) * 1.142857)'), 'box ratio changed');
  assert.ok(flowCss.includes('$mark-drop: calc(var(--dsh-content-font-size, 14px) * 0.035714)'), 'drop ratio changed');
  // the svg has to fill the box, or the em-sized box scales while the glyph inside stays 16px
  assert.ok(/\.dcd-flow-icon svg\{[^}]*width:100%;height:100%\}/.test(flowCss), 'the svg stopped filling its box');
});

test('the fork button matches the other reply icons', () => {
  const polish = src('src/parts/02-transcript-polish.ts');
  const branch = polish.match(/const BRANCH = '<svg width="(\d+)" height="(\d+)"/);
  assert.ok(branch, 'the fork icon is gone');
  assert.equal(branch[1], '16', 'the fork icon is not on the 16px grid dsh draws its icons on');
  assert.equal(branch[2], '16', 'the fork icon is not square');
});

test('the probe list still names the dsh internals the bundle leans on', () => {
  const native = src('src/lib/native.ts');
  // the table is the contract: a dsh release that renames one of these silently returns the page
  // to dsh's own look, so the list has to carry the rows the styles and parts actually read
  for (const sel of ['[data-chat-flow]', '[data-conversation-scroll]', '[data-chat-flow-kind]', '[data-disclosure-row]']) {
    assert.ok(native.includes(`'${sel}'`), `the probe no longer checks ${sel}`);
  }
  assert.ok(native.includes('function probeNative(doc: Document)'), 'the probe lost its function');
  // a row with no signal on screen yet is not a breakage: the report must skip it
  assert.ok(native.includes('if (row.signal && !doc.querySelector(row.signal)) continue'), 'the probe stopped honouring signals');
  const part = src('src/parts/11-native-probe.ts');
  assert.ok(part.includes('probeNative(document)'), 'nothing calls the probe');
  assert.ok(part.includes("console.warn("), 'a missing row would be silent');
  assert.ok(part.includes('data.chrMissing') || part.includes('dchrMissing'), 'the page carries no record of the check');
});

test('a finished turn folds a two-line stretch, a running one still shows it', () => {
  const flow = src('src/lib/flow-view.ts');
  // the thresholds are what decide how much work a turn keeps flat: a running turn keeps three
  // lines (the rows are the only sign of what is moving), a closed one folds from two
  assert.ok(flow.includes('const FOLD_OPEN = 3'), 'a running turn folds too early');
  assert.ok(flow.includes('const FOLD_CLOSED = 2'), 'a finished turn keeps a two-line stretch flat');
  assert.ok(
    flow.includes('list.length < (turn.open ? FOLD_OPEN : FOLD_CLOSED)'),
    'the fold decision stopped reading the turn state',
  );
});

test('the rows dsh still draws keep our reading rhythm', () => {
  const css = src('src/styles/08-conversation-flow.scss');
  // dsh sizes a disclosure row at 24px with a 13px title; ours is a 22px line at the reading size,
  // so the native rows that are not tool rows have to take that line or they read a size apart
  assert.ok(css.includes('$native-kind: '), 'the native rows lost their shared kind list');
  assert.ok(css.includes('#{$native-kind} [data-disclosure-row]{height:calc(22px + var(--dsh-content-font-delta,0px))!important}'), "a native row went back to dsh's 24px line");
  assert.ok(css.includes('#{$native-kind} [class*="_leading"]{margin-right:8px!important}'), 'the glyph gap fell back to 6px');
  // the tool rows stay out of it: an open run's header is 44px tall and this rule would crush it
  assert.equal(/\[data-chat-flow\] \[data-disclosure-row\]/.test(css), false, 'the row rule swallowed the 44px tool header');
  // the compaction marker derives its sticky header height from the line it sits on
  assert.ok(css.includes('--dsh-compaction-header-height:calc(22px + var(--dsh-content-font-delta,0px))'), 'the compaction header would drift off its own line');
  // an expanded native body is the grey well a tool body opens into, not the blue-tinted code block
  assert.ok(/#\{\$native-well-scope\}\{background:var\(--dcd-band/.test(css), "a native body kept dsh's cool code-block fill");
});

test('a PTC program\'s inner calls show their own picture, not the program\'s', () => {
  // the node / flow key and the words index above an inner call are the program's: asking by them
  // gave every inner call the program's picture
  assert.match(group, /const nested = !!row\.closest\('\[data-subcalls\]'\)/, 'an inner call is told apart');
  assert.match(group, /const byRow = nested \? null : kit\.picForRow/, 'no lookup by the program\'s key');
  assert.match(group, /const byText = nested \? null : kit\.picForText/, 'nor by the program\'s words');
  // and the program does not show the same file a second time
  assert.match(group, /inner\.some\(\(e\) => fileOf\(e\.getAttribute\('data-dcd-group-pic-src'\)\) === fileOf\(want\)\)/, 'one picture, one row');
});

test('a row tile becomes visible once its own copy has loaded', () => {
  // it is created at data-state=loading (opacity 0); without a load handler it never showed
  assert.match(group, /tile\.addEventListener\('load', \(\) => tile!\.setAttribute\('data-state', 'ok'\)\)/);
  assert.match(group, /tile\.complete && tile\.naturalWidth > 0/, 'a cached picture too');
});

test('an opened run moves its pictures from the line to the rows', () => {
  const flowCss = src('src/styles/08-conversation-flow.scss');
  assert.match(flowCss, /\.dcd-flow-run\[data-open\] > \.dcd-flow-line > \.dcd-flow-thumbs\{display:none\}/);
});

test('an opened picture is centred, its path opens the file, and the row tile steps aside', () => {
  const groupsCss = src('src/styles/03-tool-groups.scss');
  const groups = src('src/parts/03-tool-groups.ts');
  assert.match(groupsCss, /\[class\*="_imageBody"\]\{display:flex!important;flex-direction:column;align-items:center;/);
  assert.match(groupsCss, /\[aria-expanded="true"\] > \.dcd-group-rowthumb\{display:none\}/);
  // and the chevron the tile used to push to the edge goes back there on its own
  assert.match(groupsCss, /\[aria-expanded="true"\]\[data-dcd-group-pic\]::after\{margin-left:auto!important\}/);
  // the caption's first line is marked only when it is an absolute path and the row has its own file link
  assert.match(groups, /ABS_PATH\.test\(text\) \|\| !meta\.closest\('\[data-chat-call-id\]'\)\?\.querySelector\('\[class\*="_fileLink"\]'\)/);
  // a click (or Enter) hands over to that link, and teardown takes both listeners and the marks back
  assert.match(groups, /link\.click\(\)/);
  assert.match(groups, /addEventListener\('click', openPicPath, true\)/);
  assert.match(groups, /removeEventListener\('keydown', openPicPath, true\)/);
  assert.match(groups, /querySelectorAll\('\[data-dcd-pic-path\]'\)\.forEach/);
});

test('a PTC program does not sweep away its inner calls\' tiles as leftovers', () => {
  const groups = src('src/parts/03-tool-groups.ts');
  // the leftover sweep only takes a tile whose nearest call row is the row being marked
  assert.match(groups, /stale\.parentElement !== host && stale\.closest\('\[data-chat-call-id\]'\) === row\) stale\.remove\(\)/);
  assert.doesNotMatch(groups, /const stale = row\.querySelector\('\.dcd-group-rowthumb'\)/);
});
