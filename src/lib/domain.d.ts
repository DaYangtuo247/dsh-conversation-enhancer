/*!
 * The data the transcript flow is made of, and the words every part shares.
 *
 * dsh hands `conversation.chat.flow` a flat list of entries plus a keyed node map; a node is either
 * a message-shaped step (its content in `data.blocks`) or a tool call (the call itself spread over
 * the node, or nested under `call` once it settled). Only the members read here are declared — the
 * point is a shared vocabulary between the parts, not a mirror of dsh's schema.
 */

/** One block of a message-shaped node: text, reasoning, an image, … */
interface Block {
  kind: string
  text?: string
  [k: string]: any
}

/** A tool call as dsh stores it: settled calls nest the original under `call`. */
interface ToolCall {
  name?: string
  /** the arguments as JSON text — the settled shape */
  argsRaw?: string
  /** the arguments as a growing chunk list — the streaming shape */
  args?: { chunks?: string[] }
  /** present on a settled call only */
  call?: { name?: string; argsRaw?: string }
  content?: Block[]
  isError?: boolean
  error?: { code?: string }
  [k: string]: any
}

/** The arguments a tool call carries. Tools name the same thing differently; all are listed. */
interface ToolArgs {
  command?: string
  description?: string
  file_path?: string
  path?: string
  filePath?: string
  image_path?: string
  pattern?: string
  query?: string
  url?: string
  prompt?: string
  symbol?: string
  [k: string]: any
}

/** A node in dsh's transcript tree. */
interface FlowNode {
  key: string
  kind: string
  data?: { blocks?: Block[]; status?: string; [k: string]: any }
  /** where the node sits in the turn/step tree; a turn's ending reason lives here */
  location?: {
    kind?: string
    turn?: { end?: { data?: { reason?: { kind?: string } } } }
    [k: string]: any
  }
  visibility?: string
  [k: string]: any
}

/** One entry of the flow's entry list: a node reference, or a group dsh could not expand. */
interface FlowEntry {
  kind: string
  key: string
  /** 'reasoning' when dsh split a step so its thinking could be seated separately */
  groupPart?: string
  [k: string]: any
}

/** What a row's role is, as `roleOf()` reads it. */
type Role = 'user' | 'think' | 'tool' | 'text' | 'other' | 'skip'

/** One drawn row of a turn. */
interface Row {
  entry: FlowEntry
  node: FlowNode
  role: Role
}

/** A run: consecutive tool rows folded into one 「命令 ×3 · 读取 ×2」 line. */
interface RunItem {
  type: 'run'
  key: string
  rows: Row[]
  /** a subagent launch stays its own line */
  agent?: boolean
  pics?: Pic[]
}

/** A turn: the user's message, process runs and text rows, in source order. */
interface TurnData {
  turn: number | null
  key: string
  items: Array<any>
  open: boolean
  reason?: string
  interleaved?: boolean
}

/** An image a run produced or read: its absolute path and the revision that identifies the bytes. */
interface Pic {
  path: string
  v: string
}

/** One language's word list (see display-shared). */
interface WordSet {
  command(n: number): string
  read(n: number): string
  search(n: number): string
  edit(n: number): string
  web(n: number): string
  code(n: number): string
  agent(n: number): string
  plan(): string
  other(n: number): string
  join: string
  failed(n: number): string
  thinking: string
  working: string
  thought: string
  thoughtFor(t: string): string
  thinks(n: number): string
  stopped: string
  turnFailed: string
  show: string
  hide: string
  writing: string
  failedOne: string
  openTab: string
  close: string
  prev: string
  next: string
}

/** The shared vocabulary `display-shared` publishes on `kit.vocab`. */
interface Vocab {
  zh(): boolean
  /** tool name → kind ('command' | 'read' | 'search' | 'edit' | 'web' | 'code' | 'agent' | 'plan' | 'other') */
  TOOL_KIND: Record<string, string>
  ORDER: string[]
  WORDS: { zh: WordSet; en: WordSet }
  words(): WordSet
  /** 「命令 ×3 · 读取 ×2」 from a {kind: count} map, in ORDER order */
  labelOf(counts: Record<string, number>): string
  /** 「13 秒」 / 「1 分 11 秒」 */
  durSec(s: number): string
  CHEV_D: string
  CHEV_SVG: string
  CHEV_MASK: string
  setAttr(el: Element, k: string, v: string | null | undefined): void
  setFlag(el: Element, k: string, on: boolean): void
  motion: { get(): boolean; subscribe(fn: () => void): () => void; set(v: boolean): void }
}
