/**
 * The parts of dsh this bundle reaches into, in one list.
 *
 * Everything here is dsh's own DOM: `data-` attributes it sets and the CSS-Modules class fragments
 * (`_bubble`, `_actions`, …) that survive minification. A dsh upgrade can rename any of them, and
 * nothing throws when it does — the styles simply stop matching, and the page quietly goes back to
 * dsh's default look. That silent failure is the reason for this list: each entry names what we
 * lean on and what proves it should be there (its `signal`). A row that should exist but does not
 * is reported once per page load, so a release that moves something reads as one console line
 * instead of weeks of "样式没生效".
 *
 * Keep this table in step with the selectors the parts and stylesheets actually use: the probe is
 * only worth its noise if it covers the ones that would break the view.
 */
type NativeContractRow = {
  /** what breaks when this is gone, in the reader's words */
  what: string
  /** the selector we lean on */
  sel: string
  /** proof the page should contain it: without this, a missing row is simply not on screen yet */
  signal?: string
}

const NATIVE_CONTRACT: NativeContractRow[] = [
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
]

/**
 * Check the list against the document and report what is missing. `document` is a parameter so a
 * test can hand in a stand-in. Returns the rows that are missing without any excuse for it.
 */
function probeNative(doc: Document): NativeContractRow[] {
  const missing: NativeContractRow[] = []
  // not a chat page (settings, an empty session): nothing to judge
  if (!doc.querySelector('[data-chat-flow]')) return missing
  for (const row of NATIVE_CONTRACT) {
    if (doc.querySelector(row.sel)) continue
    if (row.signal && !doc.querySelector(row.signal)) continue
    missing.push(row)
  }
  return missing
}
