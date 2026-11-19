/*
 * Unit tests for the pure half of conversation-flow: argument reading, line wording, row roles, the
 * transcript layout and the structural signature. No browser, no dsh — see test/lib/harness.mjs.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadFlow, runPart, settled, running, streaming, callNode, textNode, transcript } from './lib/harness.mjs';

const zh = loadFlow('zh-CN');
const en = loadFlow('en-US');

/** Arrays that come out of the vm sandbox have another realm's Array prototype: copy them. */
const arr = (v) => Array.from(v);

/* ---------- arguments ---------- */

test('argsOf reads a settled call from call.argsRaw', () => {
  const n = callNode(settled('bash', { command: 'ls -a', description: 'list' }));
  assert.deepEqual(zh.argsOf(n), { command: 'ls -a', description: 'list' });
});

test('argsOf reads a running call, whose arguments sit at the root', () => {
  const n = callNode(running('bash', { command: 'sleep 3' }));
  assert.deepEqual(zh.argsOf(n), { command: 'sleep 3' });
});

test('argsOf reads a streaming call from its chunks', () => {
  const n = callNode(streaming('bash', ['{"command":"ec', 'ho hi"}']));
  assert.deepEqual(zh.argsOf(n), { command: 'echo hi' });
});

test('argsOf gives the fields it can read from an unfinished JSON body', () => {
  const n = callNode(streaming('bash', ['{"description":"list the sou', 'rce dir","command":"ls -la sr']));
  const a = zh.argsOf(n);
  assert.equal(a.description, 'list the source dir');
  assert.equal(a.command, 'ls -la sr');
});

test('argsOf never throws on nonsense and returns an object', () => {
  for (const raw of ['', 'not json', '{"a":', 'null', '[1,2]']) {
    const n = callNode({ phase: 'start', name: 'bash', argsRaw: raw });
    assert.equal(typeof zh.argsOf(n), 'object');
  }
});

test('partialArgs keeps the first value seen for a field', () => {
  const a = zh.partialArgs('{"path":"/a.png","path":"/b.png"}');
  assert.equal(a.path, '/a.png');
});

test('partialArgs unescapes what it reads', () => {
  assert.equal(zh.partialArgs('{"command":"echo \\"hi\\"\\n"}').command, 'echo "hi"\n');
});

test('rawArgsOf prefers call.argsRaw, then the root, then the chunks', () => {
  assert.equal(zh.rawArgsOf(callNode(settled('bash', { a: 1 }))), '{"a":1}');
  assert.equal(zh.rawArgsOf(callNode(running('bash', { a: 1 }))), '{"a":1}');
  assert.equal(zh.rawArgsOf(callNode(streaming('bash', ['{"a"', ':1}']))), '{"a":1}');
  assert.equal(zh.rawArgsOf(callNode({ phase: 'start', name: 'bash' })), '');
});

/* ---------- wording ---------- */

test('a command line shows its description, else the command itself', () => {
  assert.equal(zh.oneLine(callNode(settled('bash', { command: 'ls -la', description: 'list files' }))), 'list files');
  assert.equal(zh.oneLine(callNode(settled('bash', { command: 'ls -la' }))), 'ls -la');
  assert.equal(zh.oneLine(callNode(settled('bash', {}))), '');
});

test('file and search lines name the file and the query, not the path', () => {
  assert.equal(zh.oneLine(callNode(settled('read', { file_path: '/Users/x/project/src/a.ts' }))), '读取 a.ts');
  assert.equal(zh.oneLine(callNode(settled('edit', { file_path: '/a/b/c.md' }))), '编辑 c.md');
  assert.equal(zh.oneLine(callNode(settled('grep', { pattern: 'TODO' }))), '搜索 TODO');
  assert.equal(zh.oneLine(callNode(settled('web_fetch', { url: 'https://example.com' }))), '查询 https://example.com');
  assert.equal(zh.oneLine(callNode(settled('subagent', { prompt: 'audit the flow\nsecond line' }))), '子智能体 · audit the flow');
});

test('English wording is English', () => {
  assert.equal(en.oneLine(callNode(settled('read', { file_path: '/a/b/c.ts' }))), 'Read c.ts');
  assert.equal(en.oneLine(callNode(settled('grep', { pattern: 'x' }))), 'Searched x');
});

test('describe falls back to the kind, never to the bare tool name', () => {
  assert.equal(zh.describe(callNode(running('bash', {}))), '命令');
  assert.equal(zh.describe(callNode(running('read', {}))), '读取');
  assert.equal(en.describe(callNode(running('bash', {}))), 'command');
});

test('an unknown tool keeps its name, and `compress` reads as compact', () => {
  assert.equal(zh.describe(callNode(settled('compress', { detail: 'full' }))), 'compact');
  assert.equal(zh.describe(callNode(settled('some_mcp_tool', { x: 1 }))), 'some_mcp_tool');
});

test('a run line counts by kind, in the shared order, and counts failures apart', () => {
  const rows = [
    { node: callNode(settled('grep', { pattern: 'a' })) },
    { node: callNode(settled('bash', { command: 'ls' })) },
    { node: callNode(settled('bash', { command: 'false' }, { isError: true })) },
  ];
  const s = zh.summary(rows);
  assert.equal(s.text, '命令 ×2 · 搜索');
  assert.equal(s.failed, 1);
});

test('the English run line is capitalised', () => {
  const s = en.summary([{ node: callNode(settled('bash', { command: 'ls' })) }]);
  assert.equal(s.text, 'Command');
});

test('empty or one-off runs read as a bare noun', () => {
  assert.equal(zh.summary([]).text, '');
  assert.equal(zh.summary([{ node: callNode(settled('bash', { command: 'ls' })) }]).text, '命令');
});

test('clip collapses whitespace and shortens with an ellipsis', () => {
  assert.equal(zh.clip('  a \n b  '), 'a b');
  assert.equal(zh.clip('abcdef', 4), 'abc…');
  assert.equal(zh.clip('abc', 4), 'abc');
});

/* ---------- state ---------- */

test('toolState: running, ok, failed, stopped', () => {
  assert.equal(zh.toolState(callNode(running('bash', {}))), 'running');
  assert.equal(zh.toolState(callNode(settled('bash', { command: 'ls' }))), 'ok');
  assert.equal(zh.toolState(callNode(settled('bash', { command: 'false' }, { isError: true }))), 'error');
  assert.equal(zh.toolState(callNode(settled('bash', { command: 'x' }, { content: [{ type: 'text', text: 'boom\n[exit code: 1]\n' }] }))), 'error');
  assert.equal(zh.toolState(callNode({ kind: 'tool-result', name: 'bash', args: {}, call: { name: 'bash', argsRaw: '{}' }, content: [], error: { code: 'interrupted' } })), 'stopped');
});

test('bodyRows: the call in flight belongs to the live line, not to a bare row in the card', () => {
  const one = callNode(settled('bash', { command: 'ls' }), { key: 'a', seq: 1 })
  const two = callNode(settled('bash', { command: 'pwd' }), { key: 'b', seq: 2 })
  const flying = callNode(running('bash', { command: 'cd /w && npm test' }), { key: 'c', seq: 3 })
  const firstFrame = callNode({ phase: 'start', name: 'bash', argsRaw: '' }, { key: 'd', seq: 4 })
  const rows = [one, two, flying, firstFrame].map((node) => ({ role: 'tool', node }))
  // the in-flight call and the not-yet-blank call are both left to the live line
  assert.deepEqual(zh.bodyRows(rows, { role: 'tool', node: flying }).map((r) => r.node.key), ['a', 'b'])
  // nothing in flight: every call that has said something is listed
  assert.deepEqual(zh.bodyRows(rows, undefined).map((r) => r.node.key), ['a', 'b', 'c'])
  // a live call from another group does not hide a row of this card
  assert.deepEqual(zh.bodyRows(rows, { role: 'tool', node: one }).map((r) => r.node.key), ['b', 'c'])
  // a live row without a node (a stretch, not a call) is not a match
  assert.deepEqual(zh.bodyRows(rows, { role: 'think', node: undefined }).map((r) => r.node.key), ['a', 'b', 'c'])
})

test('blankCall is a call in flight with nothing to show yet', () => {
  assert.equal(zh.blankCall(callNode(running('bash', ''))), true);
  assert.equal(zh.blankCall(callNode(running('bash', { command: 'ls' }))), false);
  assert.equal(zh.blankCall(callNode(settled('bash', {}))), false);
});

/* ---------- provenance ---------- */

const userNode = (source, text = 'hello', extra = {}) => textNode('user', text, { key: 'u', source, ...extra }).node;

test('a message the user sent from their client is not injected', () => {
  assert.equal(zh.isInjected(userNode({ kind: 'user', rpcId: 'rpc-1' })), false);
});

test('a user-shaped row with no rpcId is decided by its text, not hidden for the missing field', () => {
  // the harness writes such rows (checkpoints, replayed messages); a missing rpcId alone must never
  // delete a row the user actually typed
  assert.equal(zh.isInjected(userNode({ kind: 'user' }, '[dsh-mnemon: delegated review]')), true);
  assert.equal(zh.isInjected(userNode({ kind: 'user' }, 'please rename this file')), false);
});

test('every non-user source is context', () => {
  for (const kind of ['runtime-context', 'time-context', 'skill-catalog', 'dsh-mnemon', 'plugin:dsh-task-ledger', 'retry']) {
    assert.equal(zh.isInjected(userNode({ kind })), true, kind);
  }
});

test('a row with no provenance and no text yet is held back, not drawn', () => {
  assert.equal(zh.isInjected(userNode(undefined, '')), true);
});

test('text patterns still catch the rows that carry no source at all', () => {
  assert.equal(zh.isInjected(userNode(undefined, '[dsh-mnemon:delegated review] …')), true);
  assert.equal(zh.isInjected(userNode(undefined, '<system-reminder>hi</system-reminder>')), true);
  assert.equal(zh.isInjected(userNode(undefined, 'real words')), false);
});

/* ---------- roles ---------- */

test('roleOf: the conversation, and nothing else', () => {
  const role = (kind, extra = {}) => zh.roleOf({ kind: 'node', key: 'k', ...extra }, { key: 'k', kind, data: { blocks: [] } });
  assert.equal(role('user'), 'user');
  assert.equal(role('steering'), 'user');
  assert.equal(role('tool-call'), 'tool');
  assert.equal(role('context'), 'skip');
  assert.equal(role('turn-process'), 'skip');
  assert.equal(role('system-prompt'), 'skip');
  assert.equal(role('turn-trigger'), 'skip');
  // dsh's own rows that keep their place
  for (const kind of ['turn-tail', 'turn-error', 'turn-max-tokens', 'model-retry', 'manual-compaction', 'compaction', 'question-reply', 'workflow-run', 'command', 'command-input']) {
    assert.equal(role(kind), 'other', kind);
  }
  // a kind dsh adds later is not guessed at
  assert.equal(role('brand-new-node-view'), 'skip');
  assert.equal(zh.roleOf({ kind: 'group', key: '["process"]' }, undefined), 'other');
});

test('roleOf: an assistant step is text or thinking by what it carries', () => {
  const step = (data, groupPart) => zh.roleOf({ kind: 'node', key: 'k', groupPart }, { key: 'k', kind: 'assistant-step', data });
  assert.equal(step({ blocks: [{ kind: 'text', text: 'hi' }] }), 'text');
  assert.equal(step({ blocks: [{ kind: 'reasoning', text: 'hmm' }] }), 'think');
  assert.equal(step({ blocks: [] }), 'skip');
  assert.equal(step({ blocks: [{ kind: 'reasoning', text: 'hmm' }] }, 'reasoning'), 'think');
  assert.equal(step({ blocks: [{ kind: 'text', text: 'hi' }] }, 'response'), 'text');
});

/* ---------- layout ---------- */

const turnsOf = (nodes, view = 'normal') => {
  const { entries, all } = transcript(nodes);
  const map = new Map(nodes.map((n) => [n.key, n]));
  return zh.layout(entries, map, all, view);
};

test('one turn holds the user row, the run and the answer', () => {
  const nodes = [
    textNode('user', '列出目录', { key: 'u1', seq: 1, source: { kind: 'user', rpcId: 'r' } }).node,
    callNode(settled('bash', { description: 'ls' }), { key: 't1', seq: 2 }),
    textNode('assistant-step', 'done', { key: 'a1', seq: 3 }).node,
  ];
  const turns = turnsOf(nodes);
  assert.equal(turns.length, 1);
  assert.equal(turns[0].turn, 1);
  assert.deepEqual(arr(turns[0].items.map((i) => i.type)), ['row', 'run', 'row']);
  assert.equal(turns[0].items[1].rows.length, 1);
});

test('consecutive tool calls fold into one run; a subagent launch gets its own', () => {
  const nodes = [
    callNode(settled('bash', { description: 'a' }), { key: 't1', seq: 1 }),
    callNode(settled('grep', { pattern: 'b' }), { key: 't2', seq: 2 }),
    callNode(settled('subagent', { prompt: 'c' }), { key: 't3', seq: 3 }),
    callNode(settled('bash', { description: 'd' }), { key: 't4', seq: 4 }),
  ];
  const items = turnsOf(nodes)[0].items;
  assert.deepEqual(arr(items.map((i) => (i.agent ? 'agent' : `run${i.rows.length}`))), ['run2', 'agent', 'run1']);
});

test('injected rows never reach the transcript', () => {
  const nodes = [
    textNode('user', 'MNEMON RUNTIME MEMORY SNAPSHOT …', { key: 'u1', seq: 1, source: { kind: 'runtime-context' } }).node,
    textNode('user', 'mine', { key: 'u2', seq: 2, source: { kind: 'user', rpcId: 'r' } }).node,
  ];
  const turns = turnsOf(nodes);
  assert.equal(turns.length, 1);
  assert.deepEqual(arr(turns[0].items.map((i) => i.node.key)), ['u2']);
});

test('a steering row is the user, whatever its source says', () => {
  const nodes = [textNode('steering', 'and another thing', { key: 's1', seq: 1, source: { kind: 'runtime-context' } }).node];
  const turns = turnsOf(nodes);
  assert.equal(turns[0].items.length, 1);
  assert.equal(turns[0].items[0].role, 'user');
  assert.equal(turns[0].interleaved, true);
});

test('hidden rows are dropped, and thinking only appears outside 标准', () => {
  const nodes = [
    textNode('assistant-step', '', { key: 'a1', seq: 1, reasoning: 'let me think' }).node,
    textNode('assistant-step', 'hidden', { key: 'a2', seq: 2, visibility: 'hidden' }).node,
  ];
  assert.deepEqual(arr(turnsOf(nodes, 'normal')[0].items.map((i) => i.type)), []);
  assert.deepEqual(arr(turnsOf(nodes, 'detailed')[0].items.map((i) => i.type)), ['think']);
});

test('a turn carries how it ended and whether it was interrupted', () => {
  const node = textNode('user', 'go', { key: 'u1', seq: 1, source: { kind: 'user', rpcId: 'r' } }).node;
  node.location.turn.end = { data: { reason: { kind: 'stopped' } } };
  const turn = turnsOf([node])[0];
  assert.equal(turn.reason, 'stopped');
});

test('an open turn is flagged, so the live line knows to draw', () => {
  const node = textNode('user', 'go', { key: 'u1', seq: 1, source: { kind: 'user', rpcId: 'r' }, status: 'open' }).node;
  assert.equal(turnsOf([node])[0].open, true);
});

test('two turns are two turns, keyed by number and not by their first row', () => {
  const nodes = [
    textNode('user', 'one', { key: 'u1', seq: 1, turn: 1, source: { kind: 'user', rpcId: 'r' } }).node,
    textNode('user', 'two', { key: 'u2', seq: 2, turn: 2, source: { kind: 'user', rpcId: 'r' } }).node,
  ];
  const turns = turnsOf(nodes);
  assert.deepEqual(arr(turns.map((t) => t.turn)), [1, 2]);
  assert.deepEqual(arr(turns.map((t) => t.key)), ['t:1', 't:2']);
});

/* ---------- structural signature ---------- */

test('the signature ignores streamed prose and follows structure', () => {
  const base = [textNode('assistant-step', 'a', { key: 'a1', seq: 1 }).node];
  const grown = [textNode('assistant-step', 'a much longer answer', { key: 'a1', seq: 1 }).node];
  const sig = (nodes, view = 'normal', cwd = '/w') => {
    const { entries, all } = transcript(nodes);
    return zh.structSig(new Map(nodes.map((n) => [n.key, n])), entries, view, cwd, 'zh');
  };
  assert.equal(sig(base), sig(grown));
  assert.notEqual(sig(base), sig([...base, callNode(settled('bash', { command: 'ls' }), { key: 't1', seq: 2 })]));
  assert.notEqual(sig(base), sig(base, 'detailed'));
  assert.notEqual(sig(base), sig(base, 'normal', '/other'));
});

test('a turn is signed by its rows, so untouched turns skip their re-render', () => {
  const mk = (text) => [
    textNode('user', 'go', { key: 'u1', seq: 1, source: { kind: 'user', rpcId: 'r' } }).node,
    callNode(settled('bash', { command: 'ls' }), { key: 't1', seq: 2 }),
    textNode('assistant-step', text, { key: 'a1', seq: 3 }).node,
  ]
  assert.equal(turnsOf(mk('a')).length, 1)
  // the answer grows: same shape, same signature — the streaming row redraws through its own seat
  assert.equal(turnsOf(mk('a'))[0].sig, turnsOf(mk('a much longer answer'))[0].sig)
  // a row lands: the turn's shape changed and it has to be drawn again
  const withCall = [...mk('a'), callNode(settled('grep', { pattern: 'x' }), { key: 't2', seq: 4 })]
  assert.notEqual(turnsOf(mk('a'))[0].sig, turnsOf(withCall)[0].sig)
  // a call settling is a change too: the run line counts failures and the row says what it did
  const failed = [...mk('a'), callNode(settled('bash', { command: 'false' }, { status: 'failed' }), { key: 't2', seq: 4 })]
  assert.notEqual(turnsOf(withCall)[0].sig, turnsOf(failed)[0].sig)
})

/* ---------- pictures ---------- */

test('only a call that looked at a picture has one', () => {
  // the way Claude Code previews an item: an image tool, a read of an image file, or a result that came
  // back with an image. A path that merely appears in a command or in printed output is not one.
  const rows = [
    { node: callNode(settled('read_image', { file_path: '/tmp/shot.png' }), { key: 't1' }) },
    { node: callNode(settled('read', { file_path: '/tmp/logo.svg' }), { key: 't2' }) },
    { node: callNode(settled('read', { file_path: '/tmp/notes.md' }), { key: 't3' }) },
    { node: callNode(settled('bash', { command: 'python plot.py --out /tmp/fig.webp' }), { key: 't4' }) },
    { node: callNode(settled('bash', { command: 'ls' }, { content: [{ type: 'text', text: 'icon.svg\nchart.jpg\n' }] }), { key: 't5' }) },
    { node: callNode(settled('screenshot', { path: '/tmp/s.png' }, { content: [{ type: 'image' }] }), { key: 't6' }) },
  ];
  assert.deepEqual(arr(zh.imagesOf(rows, '/w').map((p) => p.path)), ['/tmp/shot.png', '/tmp/logo.svg', '/tmp/s.png']);
});

test('a picture path the call was given is resolved against the working directory', () => {
  const rows = [
    { node: callNode(settled('read_image', { file_path: 'out/a.png' }), { key: 't1' }) },
    { node: callNode(settled('read_image', { file_path: '~/b.png' }), { key: 't2' }) },
  ];
  assert.deepEqual(arr(zh.imagesOf(rows, '/Users/dev/work').map((p) => p.path)), ['/Users/dev/work/out/a.png', '/Users/dev/b.png']);
  // no directory to resolve against: no guess
  assert.deepEqual(arr(zh.imagesOf(rows.slice(0, 1), '').map((p) => p.path)), []);
});

test('a PTC program\'s inner image reads are its own calls\' pictures', () => {
  // run_code reads nothing itself; the call inside it that read the image keeps the picture, by its id
  const prog = settled('run_code', { code: 'await tools.read_image({ file_path: "/tmp/p.png" })' });
  prog.subCalls = [
    { callId: 'c1:ptc:1', name: 'bash', argsRaw: JSON.stringify({ command: 'shot > /tmp/p.png' }), subCalls: [] },
    { callId: 'c1:ptc:2', name: 'read_image', argsRaw: JSON.stringify({ file_path: '/tmp/p.png' }), subCalls: [] },
  ];
  const pics = arr(zh.imagesOf([{ node: callNode(prog, { key: 't1' }) }], '/w'));
  assert.equal(pics.length, 1);
  assert.equal(pics[0].path, '/tmp/p.png');
  assert.equal(pics[0].call, 'c1:ptc:2', 'the read, not the command that wrote it');
  assert.equal(pics[0].own, false, 'not the program row\'s own picture');
});

test('imagesOf skips `~` and non-image extensions', () => {
  const rows = [{ node: callNode(settled('bash', { command: 'cp ~/a.png b.txt' }), { key: 't1' }) }];
  assert.deepEqual(arr(zh.imagesOf(rows, '/w')), []);
});

test('joinPath normalises . and ..', () => {
  assert.equal(zh.joinPath('/a/b', 'c.png'), '/a/b/c.png');
  assert.equal(zh.joinPath('/a/b/', '../c.png'), '/a/c.png');
  assert.equal(zh.joinPath('/a/b', '/abs.png'), '/abs.png');
});

/* ---------- the vocabulary both modes share ---------- */

/* ---------- dsh's process groups ---------- */

test('expand puts the work dsh folded into a process group back between its neighbours', () => {
  const user = textNode('user', 'go', { key: 'u1', seq: 1, source: { kind: 'user', rpcId: 'r' } }).node;
  const t2 = callNode(settled('bash', { command: 'ls' }), { key: 't2', seq: 2 });
  const t3 = callNode(settled('grep', { pattern: 'x' }), { key: 't3', seq: 3 });
  const answer = textNode('assistant-step', 'done', { key: 'a1', seq: 5 }).node;
  const nodes = new Map([['u1', user], ['t2', t2], ['t3', t3], ['a1', answer]]);
  const entries = [
    { kind: 'node', key: 'u1' },
    { kind: 'group', key: '["process",1]' },
    { kind: 'node', key: 'a1' },
  ];
  const out = arr(zh.expand(entries, nodes, [...nodes.values()]));
  assert.deepEqual(out.map((e) => e.key), ['u1', 't2', 't3', 'a1']);
});

test('a process group with nothing to put back is left to dsh', () => {
  const entries = [{ kind: 'group', key: '["process",1]' }];
  const out = arr(zh.expand(entries, new Map(), []));
  assert.deepEqual(out.map((e) => e.kind), ['group']);
});

/* ---------- cost ---------- */

test('a long session lays out and signs cheaply', () => {
  const nodes = [];
  for (let i = 0; i < 400; i += 1) {
    nodes.push(callNode(settled('bash', { command: `echo ${i}`, description: `step ${i}` }), { key: `t${i}`, seq: i }));
  }
  const { entries, all } = transcript(nodes);
  const map = new Map(nodes.map((n) => [n.key, n]));
  const t0 = performance.now();
  const turns = zh.layout(entries, map, all, 'detailed');
  const sig = zh.structSig(map, entries, 'detailed', '/w', 'zh');
  const ms = performance.now() - t0;
  assert.equal(turns[0].items.length, 1, '400 calls in one turn are one run');
  assert.equal(turns[0].items[0].rows.length, 400);
  assert.ok(sig.length > 0);
  assert.ok(ms < 100, `layout+sig took ${ms.toFixed(1)}ms`);
});

test('imagesOf keeps at most 24 pictures and its cache stays bounded', () => {
  const rows = [];
  for (let i = 0; i < 40; i += 1) rows.push({ node: callNode(settled('read_image', { file_path: `/tmp/p${i}.png` }), { key: `r${i}` }) });
  assert.equal(arr(zh.imagesOf(rows, '/w')).length, 24);
  assert.ok(zh.picCache.size <= 300);
});

/* ---------- marks ---------- */

test('a renamed tool keeps its own mark, and a group takes the first kind in the shared order', () => {
  const bash = { node: callNode(settled('bash', { command: 'ls' })), role: 'tool' };
  const grep = { node: callNode(settled('grep', { pattern: 'x' })), role: 'tool' };
  const squish = { node: callNode(settled('compress', {})), role: 'tool' };
  assert.equal(zh.iconKind(bash.node), 'command');
  assert.equal(zh.iconKind(squish.node), 'compact');
  assert.equal(zh.mainKind([bash]), 'command');
  assert.equal(zh.mainKind([bash, grep]), 'command');
  assert.equal(zh.mainKind([squish]), 'compact');
  assert.equal(zh.mainKind([squish, bash]), 'command');
});

test('every mark the flow can ask for exists, including the two that mean something else', () => {
  for (const k of [...zh.vocab.ORDER, 'think', 'compact', 'steps', 'stop', 'other']) {
    assert.ok(k in zh.MARKS, `no mark for ${k}`); // the mark itself is a React element: only its name is checked here
    assert.ok(k in zh.FIT, `no fit for ${k}`) // drawn on one grid, fitted into one ink box
  }
});

/* ---------- thoughts ---------- */

test('a thought row says how long it took, unless it sits in an opened group of steps', () => {
  const node = textNode('assistant-step', 'thinking', { key: 'k1', seq: 1 }).node;
  node.data.timing = { stepStartTime: 1000, completedTime: 5000 };
  assert.equal(zh.thinkMs(node), 4000);
  assert.match(zh.thoughtLabel(node, false, false), /4/);
  assert.equal(zh.thoughtLabel(node, false, true), zh.vocab.words().thought);
  assert.equal(zh.thoughtLabel(node, true, true), zh.vocab.words().thinking);
});

test('a thought with no timing, or one under a second, is just 「思考」', () => {
  const bare = textNode('assistant-step', 'x', { key: 'k2', seq: 1 }).node;
  assert.equal(zh.thinkMs(bare), 0);
  assert.equal(zh.thoughtLabel(bare, false, false), zh.vocab.words().thought);
  const quick = textNode('assistant-step', 'x', { key: 'k3', seq: 1 }).node;
  quick.data.timing = { stepStartTime: 0, completedTime: 400 };
  assert.equal(zh.thoughtLabel(quick, false, false), zh.vocab.words().thought);
});

/* ---------- regressions found by the 2026-11-16 flow audit ---------- */

test('a tool call right after a process group is drawn once, inside the group', () => {
  const user = textNode('user', 'go', { key: 'u1', seq: 1, source: { kind: 'user', rpcId: 'r' } }).node;
  const t2 = callNode(settled('bash', { command: 'ls' }), { key: 't2', seq: 2 });
  const t3 = callNode(settled('grep', { pattern: 'x' }), { key: 't3', seq: 5 });
  const nodes = new Map([['u1', user], ['t2', t2], ['t3', t3]]);
  const entries = [
    { kind: 'node', key: 'u1' },
    { kind: 'group', key: '["process",1]' },
    { kind: 'node', key: 't3' },
  ];
  const keys = arr(zh.expand(entries, nodes, [...nodes.values()])).map((e) => e.key);
  assert.deepEqual(keys, ['u1', 't2', 't3'], 'one entry per call, no duplicate');
  assert.equal(new Set(keys).size, keys.length);
});

test('an assistant-step after a group keeps its own row and is not taken as a member', () => {
  const t1 = textNode('assistant-step', 'thinking', { key: 's1', seq: 1, reasoning: 'why', status: 'open' }).node;
  const t2 = callNode(settled('bash', { command: 'ls' }), { key: 't2', seq: 2 });
  const t3 = textNode('assistant-step', 'answer', { key: 's3', seq: 5 }).node;
  const nodes = new Map([['s1', t1], ['t2', t2], ['s3', t3]]);
  const entries = [
    { kind: 'node', key: 's3' },
    { kind: 'group', key: '["process",1]' },
  ];
  const keys = arr(zh.expand(entries, nodes, [...nodes.values()])).map((e) => e.key);
  assert.equal(new Set(keys).size, keys.length, `duplicate entries: ${keys.join(',')}`);
});

test('the transcript signature notices an in-flight call filling up', () => {
  // a call that has not settled: `phase: 'start'` plus whatever it has printed so far
  const at = (args, output) => {
    const call = { phase: 'start', name: 'bash', argsRaw: args || '' };
    if (output !== undefined) call.content = [{ type: 'text', text: output }];
    const node = callNode(call, { key: 'n1', seq: 1, status: 'open' });
    return zh.structSig(new Map([['n1', node]]), [{ kind: 'node', key: 'n1' }], 'normal', '/w', 'zh-CN');
  };
  const empty = at('');
  const half = at('{"command":"ls');
  const full = at('{"command":"ls -la"}');
  assert.notEqual(empty, half, 'streamed args must change the signature');
  assert.notEqual(half, full);
  const out1 = at(undefined, 'line 1');
  const out2 = at(undefined, 'line 1\nline 2');
  assert.notEqual(out1, out2, 'growing output must change the signature');
});

test('the signature survives a store that has not loaded yet', () => {
  assert.equal(zh.structSig(undefined, undefined, 'normal', '/w', 'zh-CN'), '');
  assert.equal(typeof zh.structSig(new Map(), [], 'normal', '', ''), 'string');
});

test('turnOf survives a location with no turn object', () => {
  assert.equal(zh.turnOf({ location: { kind: 'step' } }), null);
  assert.equal(zh.turnOpen({ location: { kind: 'step' } }), false);
  assert.equal(zh.turnOf({ location: { kind: 'turn', turn: { turn: 3 } } }), 3);
});

test('~ is expanded from the session cwd, and unknown homes resolve to nothing', () => {
  const f = loadFlow('zh-CN');
  // the browser has no HOME: a session running in /Users/me/proj runs as /Users/me
  assert.equal(f.homeOf('/Users/dev/Desktop/workspace'), '/Users/dev');
  assert.equal(f.homeOf('/home/ci/src'), '/home/ci');
  assert.equal(f.homeOf('/tmp/x'), '');
  assert.equal(f.homeOf(''), '');
});

test('a glob, a template or an ellipsis is not a file', () => {
  const f = loadFlow('zh-CN');
  const img = (command) => f.imagesOf([{ node: callNode(settled('bash', { command, description: 'x' }), { key: 'k' }), role: 'tool' }], '/tmp');
  // the arrays come out of the sandbox realm, so compare by length, not by prototype
  assert.equal(img('ls src/parts/*.png').length, 0, 'a glob lists files, it does not name one');
  assert.equal(img('echo "/tmp/p${i}.png"').length, 0, 'a template is not a path yet');
  assert.equal(img('cp assets/running-whale@2x-….png /tmp/').length, 0, 'an ellipsis names a family, not a file');
  assert.equal(img('cat /tmp/z5.png').length, 0, 'a command that prints a file has not looked at a picture');
});

test('row pictures are keyed by the call id the row itself carries', () => {
  // the flow key is a position: inside a closed group dsh writes a group key there and the picture
  // disappears when the row is folded away. The call id is on the row in both states.
  const f = loadFlow('zh-CN');
  const node = callNode(settled('read_image', { file_path: '/tmp/a.png' }), { key: 'ck1' });
  node.data.root = { ...node.data.root, block: { id: 'call-42' } };
  assert.equal(f.callIdOf(node), 'call-42', 'the id dsh prints on the row is readable from the node');
  assert.equal(typeof f.kit.picForCall, 'function', 'the flow part publishes the per-call lookup');
  assert.equal(f.kit.picForCall('call-42'), '', 'an unknown call has no picture and does not throw');
  assert.equal(f.callIdOf(callNode(settled('bash', { command: 'ls' }), { key: 'x' })), '');
  // the id sits in different places in the two shapes dsh hands us: a normalised block carries
  // `callId`, a live one only id-like fields on the block itself
  const norm = { key: 'n1', kind: 'tool-call', anchorSeq: 1, visibility: 'visible', location: { kind: 'turn', turn: { end: null } } };
  norm.data = { root: { phase: 'result', block: { kind: 'tool-call', callId: 'call-7', name: 'bash', argsRaw: '{}' } }, status: 'done' };
  assert.equal(f.callIdOf(norm), 'call-7');
  const live = { key: 'n2', kind: 'tool-call', anchorSeq: 2, visibility: 'visible', location: { kind: 'turn', turn: { end: null } } };
  live.data = { root: { phase: 'preparing', block: { type: 'tool-call', id: 31, name: 'bash' } }, status: 'running' };
  assert.equal(f.callIdOf(live), '31', 'a numeric id is printed as a string, like dsh does');
  const cyc = { key: 'n3', kind: 'tool-call', anchorSeq: 3, visibility: 'visible', location: { kind: 'turn', turn: { end: null } } };
  cyc.data = { root: { phase: 'start' }, status: 'running' };
  cyc.data.root.self = cyc.data.root;
  assert.equal(f.callIdOf(cyc), '', 'a node without an id and with a cycle must not hang');
});
