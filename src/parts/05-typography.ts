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
        const sheet = kit.sheet('typography', CSS_TYPOGRAPHY)
        ctx.effect(() => { sheet.ensure(); return sheet.remove }, 'typography: quiet type')
      },
    }
  },
})
