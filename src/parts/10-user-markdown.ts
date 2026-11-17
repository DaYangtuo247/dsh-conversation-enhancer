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
    const { React, h } = kit
    const { useSyncExternalStore, useCallback } = React
    let UI = null
    try { UI = require('@deepseek-ai/dsh-client-ui-primitives') } catch { UI = null }

    const NS = 'user-markdown'
    const zh = { copy: '复制', copied: '已复制', footnotes: '脚注' }
    const en = { copy: 'Copy', copied: 'Copied', footnotes: 'Footnotes' }
    const mdLabels = (t) => ({ code: { copyLabel: t('copy'), copiedLabel: t('copied') }, footnotes: t('footnotes') })

    class RenderBoundary extends React.Component {
      constructor(props) { super(props); this.state = { failed: false } }
      static getDerivedStateFromError() { return { failed: true } }
      render() { return this.state.failed ? this.props.fallback : this.props.children }
    }

    const sheet = kit.sheet('user-markdown', CSS_USER_MARKDOWN)

    function UserMarkdown({ node, interactive, ctx, t }) {
      useSyncExternalStore(useCallback((fn) => ctx.locale.subscribe(fn), [ctx]), () => ctx.locale.getSnapshot())
      const text = String(node.data.display ?? node.data.text ?? '')
      // UI is null when the primitives module is missing, and this fallback is also what the guard
      // below returns — so it has to be built defensively or the fallback path is the crash path
      const plain = UI?.UserTextRun ? h(UI.UserTextRun, { text }) : h('span', null, text)
      // queue strip / goal command (interactive:false) and a missing renderer keep dsh's plain run
      if (interactive !== true || !UI?.MarkdownText) return plain
      return h('span', { className: 'dcd-type-user-md' },
        h(RenderBoundary, { fallback: plain }, h(UI.MarkdownText, { text, labels: mdLabels(t) })))
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'user-markdown: dictionaries')
        const t = ctx.locale.bind(NS)
        ctx.effect(() => { sheet.ensure(); return sheet.remove }, 'user-markdown: styles')
        function Slot(props) { return h(UserMarkdown, { ...props, ctx, t }) }
        ctx.slots.inject('conversation.user.text.node', () => ctx.slots.register({
          name: 'conversation.user.text.node',
          key: 'text',
          priority: 0,
        }, Slot))
      },
    }
  },
})