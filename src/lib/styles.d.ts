/**
 * Globals the build prepends to the bundle scope from `src/styles/*.scss` (see build.mjs).
 * Edit the .scss — this file only tells tsc what the generated CSS constants look like.
 */
declare const CSS_SHARED: string
declare const CSS_TRANSCRIPT_VIEW: string
declare const CSS_TRANSCRIPT_POLISH: string
declare const CSS_TOOL_GROUPS: string
declare const CSS_PLAN_CHECKLIST: string
declare const CSS_TYPOGRAPHY: string
declare const CSS_BASH_HIGHLIGHT: string
declare const CSS_RENDER_OFFSCREEN: string
declare const CSS_CONVERSATION_FLOW: string
declare const CSS_AUTO_OLDER: string
declare const CSS_USER_MARKDOWN: string
declare const CSS_ERROR_NOTES: string

/** Substitutes the `__DCG_*__` placeholders in 03-tool-groups.scss with the part's selectors. */
declare function styleToolGroups(s: { ROW: string; OPEN: string; CALL: string; NODE: string; CHEV_MASK: string }): string
/** Substitutes the `__DCG_P__` placeholder in 04-plan-checklist.scss with the native dock selector. */
declare function stylePlanChecklist(s: { P: string }): string
