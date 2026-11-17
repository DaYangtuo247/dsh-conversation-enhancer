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
    const { ensure, remove } = kit.sheet('render-offscreen', CSS_RENDER_OFFSCREEN)
    return {
      inject: [],
      apply(ctx) {
        ensure()
        ctx.effect(() => () => remove(), 'render-offscreen: styles')
      },
    }
  },
})
