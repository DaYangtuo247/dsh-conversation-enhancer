/*!
 * DOM helpers the parts share.
 *
 * `document.querySelector` answers an `Element`, but every row these parts touch is an HTMLElement
 * (they read `dataset`, set attributes, click buttons). These two wrappers keep the element type
 * instead of casting at every call site, and they are the one place that decides the default root.
 */

/** The first match, typed. */
const q = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document): T | null =>
  root.querySelector(sel) as T | null

/** Every match, as a real array (the parts map/filter it). */
const qa = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document): T[] =>
  Array.from(root.querySelectorAll(sel)) as T[]
