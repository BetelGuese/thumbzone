import { useImperativeHandle, useRef, useState } from 'react'
import type { Ref } from 'react'
import {
  ActionIcon,
  Box,
  List,
  MantineProvider,
  NavLink,
  Overlay,
  Paper,
  getDefaultZIndex,
} from '@mantine/core'
import { DESKTOP_BREAKPOINT, MAX_TRIGGER_BOTTOM_GAP, MIN_HIT_TARGET } from '../../../core/index.js'
import type { ThumbzoneHandle } from './thumbzone'
import { useThumbzone } from './useThumbzone'

/** Target of the trigger's `aria-controls`, and the sheet's own `id`. */
const SHEET_ID = 'tz-mantine-sheet'

/**
 * Where the pattern stops applying, written from `core/index.js`'s own
 * constant rather than from a Mantine breakpoint.
 *
 * Mantine states its breakpoints in `em` — `sm` is `48em` — which resolves
 * against a font size the application controls, so `hiddenFrom="sm"` agrees
 * with `DESKTOP_BREAKPOINT` only while the root size is 16px and drifts
 * silently the moment either value moves. Every other port declines its own
 * system's breakpoint token for the same reason.
 */
const DESKTOP_QUERY = `@media (min-width: ${DESKTOP_BREAKPOINT}px)`

/**
 * How much of the viewport the open sheet may occupy.
 *
 * A sheet that filled the screen would be a page: leaving a strip of scrim
 * above it is what keeps "tap outside to dismiss" discoverable and what says
 * the page is still there behind it. The dynamic viewport unit, never the
 * static one — iOS Safari resolves the static one against the expanded
 * viewport, so the sheet's top edge would end up under the collapsing URL bar.
 * Mantine's `sizes` scale has no viewport-relative step to take this from.
 */
const SHEET_MAX_BLOCK_SIZE = '85dvh'

/**
 * The trigger's footprint, and the gap that lifts it off the bottom edge.
 *
 * Both are read twice — the trigger is sized and placed by them, and the sheet
 * reserves exactly this much space at its bottom edge so the menu's last row
 * never ends up under a trigger that floats above it. One constant each, so a
 * change cannot move one of the two rules and leave the other behind.
 *
 * 56 is not taken from `ActionIcon`'s `size` scale, because that scale cannot
 * reach it: its own rule declares `--ai-size-xs` through `--ai-size-xl` as
 * 1.125rem, 1.375rem, 1.75rem, 2.125rem and 2.75rem — 18px to 44px at the
 * default root size, every step of it under the pattern's 48px floor. (The
 * `input-*` steps do clear the floor, but they are the input-height scale, for
 * an icon button sitting beside a text field.) So the size is this port's own,
 * and it matches the footprint the reference implementation and the Material
 * UI and Chakra ports give their triggers.
 */
const TRIGGER_SIZE = 56
const TRIGGER_GAP = 'var(--mantine-spacing-md)'

/**
 * How far the trigger travels when the pattern tucks it away on a downward
 * scroll: its own height plus a gap, so it clears the bottom edge completely.
 * `spacing.xl` is 2rem, the largest step on Mantine's spacing scale.
 */
const TUCK_TRAVEL = 'var(--mantine-spacing-xl)'

/**
 * The sheet's travel, stated as this port's own values.
 *
 * **Mantine publishes no motion scale.** Measured: no `--mantine-*` custom
 * property matches transition, duration, easing or timing, and the default
 * theme carries no such key — Mantine's motion lives entirely in
 * `Transition`'s props. So there is no token to reach for here, and this
 * comment is not implying one exists.
 *
 * There is exactly one Mantine-sourced motion reference, and these two values
 * are it: `Transition`'s defaults, 250ms and `ease`, which are what Mantine's
 * own `Drawer` moves on. Both are usable as they stand — 250ms sits inside the
 * pattern's 120–400ms bounds (`e2e/support/motion.ts`: under the floor the
 * sheet reads as already-arrived and stops saying it came up from the trigger
 * the thumb just touched, over the ceiling the user is waiting on a menu), and
 * `ease` satisfies the non-linearity requirement, which rejects only `linear`
 * and the stepped functions. Chakra's own drawer recipe had to be declined at
 * 500ms; Mantine's number needed no adjustment.
 */
const SHEET_DURATION = '250ms'
const SHEET_EASING = 'ease'

/**
 * The stacking order, off Mantine's own ladder.
 *
 * `getDefaultZIndex` is the ladder: app 100, modal 200, popover 300, overlay
 * 400, max 9999. Note that `overlay` is *above* `modal` there, so it is not
 * the scrim's level in this pattern — reaching for it on the strength of its
 * name would put the scrim over the sheet it is meant to sit under.
 *
 * Mantine's own `Drawer` puts its overlay and its content at the same `modal`
 * level and lets DOM order stack them, because it owns a root element that
 * wraps both. The pattern's three elements are siblings with nothing wrapping
 * them — the sheet is authored beside the page content it covers — so the
 * order is stated instead: the scrim at Mantine's modal level, the sheet above
 * it, and the trigger above the sheet, because tapping the trigger while the
 * sheet is up is a close path and it has to stay hit-testable there.
 */
const SCRIM_Z_INDEX = getDefaultZIndex('modal')
const SHEET_Z_INDEX = SCRIM_Z_INDEX + 1
const TRIGGER_Z_INDEX = SCRIM_Z_INDEX + 2

/**
 * The scrim's rules.
 *
 * `Overlay` supplies the box itself — its own rule is `inset: 0`, a
 * `position` its `fixed` prop switches to viewport-relative, and a background
 * of `var(--overlay-bg, rgba(0, 0, 0, 0.6))`. That default is what Mantine's
 * own `Drawer` overlay shows, since `ModalBaseOverlay` renders a plain
 * `Overlay` with no opacity of its own, and it resolves with no colour-scheme
 * attribute on the root element because it is a literal rather than one of
 * Mantine's scheme-gated colour variables.
 *
 * What is left is the state, which belongs to the pattern rather than to
 * `Overlay`: it is driven from `data-tz-open` on the element itself, not from
 * a prop, so the shared behaviour's write is what shows the scrim.
 *
 * The `touch-action` is the scrim's own rather than inherited: it scrolls
 * nothing itself but lies over a page that does, and `pointer-events` alone
 * does not stop a touch pan reaching that page. pinch-zoom, never `none` —
 * this covers the whole viewport while the sheet is up, so refusing zoom here
 * is a screen-wide regression rather than a local one (WCAG 1.4.4).
 */
const SCRIM_CSS = `
[data-tz-scrim] {
  opacity: 0;
  pointer-events: none;
  touch-action: pinch-zoom;
  transition: opacity ${SHEET_DURATION} ${SHEET_EASING};
}
[data-tz-scrim][data-tz-open='true'] {
  opacity: 1;
  pointer-events: auto;
}`

/**
 * The sheet's rules.
 *
 * `Paper` supplies the surface — `background: var(--mantine-color-body)`, the
 * elevation its `shadow` prop writes into `--paper-shadow` — and three things
 * this pattern has to take back, each measured off Paper's own rule:
 *
 * - `display: block`, replaced here, because the sheet is a column of handle
 *   and menu with the menu owning the scrolling.
 * - `border-radius: var(--paper-radius)`, which reaches all four corners. The
 *   sheet's bottom edge is flush with the viewport's, so the `radius` prop is
 *   declined and the same token read directly into the two top corners, with
 *   the bottom two zeroed rather than left to a shorthand's ordering.
 * - `touch-action: manipulation`, which permits the vertical pan this surface
 *   must refuse: a pan starting on the sheet's own chrome is a dismiss drag.
 *   pinch-zoom rather than `none`, so a pinch that lands here still zooms the
 *   page (WCAG 1.4.4) — panning is what has to stay ours.
 *
 * The resting position is a CSS rule and not an inline style on purpose. A
 * drag writes `transform` inline on this element and clears it on release, so
 * an inline resting value would be wiped by the first drag and never restored
 * — React does not re-render for an attribute the behaviour owns. Declared
 * here, it is what the element falls back to the moment the inline value goes.
 */
const SHEET_CSS = `
[data-tz-sheet] {
  position: fixed;
  inset-inline: 0;
  inset-block-end: 0;
  z-index: ${SHEET_Z_INDEX};
  display: flex;
  flex-direction: column;
  max-block-size: ${SHEET_MAX_BLOCK_SIZE};
  overflow: hidden;
  padding-block-end: calc(${TRIGGER_SIZE}px + ${TRIGGER_GAP} + env(safe-area-inset-bottom, 0px));
  border-start-start-radius: var(--mantine-radius-lg);
  border-start-end-radius: var(--mantine-radius-lg);
  border-end-start-radius: 0;
  border-end-end-radius: 0;
  touch-action: pinch-zoom;
  transform: translateY(100%);
  transition: transform ${SHEET_DURATION} ${SHEET_EASING};
}
[data-tz-sheet][data-tz-open='true'] {
  transform: translateY(0);
}
[data-tz-sheet][data-tz-dragging='true'] {
  transition: none;
}`

/**
 * The drag handle's rules. The pill inside it is styled at the element, since
 * nothing selector-shaped reaches it.
 *
 * The whole target clears the pattern's minimum, not just the pill drawn
 * inside it, and the height is declared from `MIN_HIT_TARGET` in the
 * constant's own unit. Mantine's `h` style prop would have taken the number
 * too, but it converts one to `calc(3rem * var(--mantine-scale))` — a length
 * that moves with the root font size and with the theme's scale factor, both
 * of which the application owns, where the constant is a count of CSS pixels.
 *
 * `cursor: grabbing` while a drag is in flight is keyed off the sheet's
 * `data-tz-dragging`, because that is where the behaviour writes it.
 *
 * Its `touch-action` is declared on the element itself, not left to the
 * sheet's: an ancestor's value does not change this element's own computed
 * one, which is what a pan starting on the handle is arbitrated against. The
 * contract does sanction `none` here — the handle genuinely needs to own the
 * gesture and the impairment would be confined to one 48px control — but
 * refusing the vertical pan is all that ownership requires, and a pinch
 * landing on a real control should still zoom the page. Every shipped port
 * makes the same call.
 */
const HANDLE_CSS = `
[data-tz-handle] {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  block-size: ${MIN_HIT_TARGET}px;
  cursor: grab;
  touch-action: pinch-zoom;
}
[data-tz-sheet][data-tz-dragging='true'] [data-tz-handle] {
  cursor: grabbing;
}`

/**
 * The menu's rules.
 *
 * `List` supplies the `<ul>` with its margins and padding already zeroed, and
 * `listStyleType="none"` sets its `data-type="none"`, which is what zeroes the
 * marker gap its own rule would otherwise indent the rows by. The scrolling is
 * the pattern's: the menu, not the sheet, is the scroll container, so that a
 * menu taller than the sheet keeps scrolling by touch while the sheet's own
 * chrome stays a drag surface. Its own `touch-action` is unconditional, unlike
 * every other surface here — this region has to stay pannable at every scroll
 * position, because a value that changed with `scrollTop` blocks the very
 * scroll that would move `scrollTop` off zero. The rows inside it need no
 * declaration of their own: the unstyled button underneath `NavLink` already
 * computes `manipulation` there, measured, which permits the pan.
 *
 * The row height is the part nothing in Mantine holds. `NavLink`'s own rule is
 * `display: flex; align-items: center; width: 100%; padding: 8px
 * var(--mantine-spacing-sm)` and declares no height and no minimum of any
 * kind, so a row is exactly its label's line box plus that padding: 24.8px at
 * Mantine's own `md` size and line height, plus 8px above and below, is 41px
 * — seven under the pattern's floor. The `min-block-size` below is therefore
 * the only thing holding it, and **nothing in the conformance suite asserts a
 * menu row's height** — only the trigger and the handle are checked against
 * the constant. Measured both ways on this port's own rows: 48px with that
 * declaration and 41px with it removed and nothing else changed.
 *
 * It is a minimum rather than a height so a label too long for one line grows
 * its row instead of running out of it; `List.Item`'s own rule already leaves
 * `white-space: normal` in place for that.
 */
const MENU_CSS = `
[data-tz-menu] {
  flex: 1 1 auto;
  min-block-size: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: var(--mantine-spacing-xs);
  touch-action: pan-y pinch-zoom;
}
[data-tz-menu] a {
  min-block-size: ${MIN_HIT_TARGET}px;
  border-radius: var(--mantine-radius-sm);
}`

/**
 * The trigger's rules.
 *
 * **`--ai-size` is declared here rather than through the `size` prop**, and
 * that is a reach past the primitive with a reason. `ActionIcon` sizes itself
 * entirely from that one custom property — its rule sets `width`, `height`,
 * `min-width` and `min-height` to `var(--ai-size)` — and the `size` prop's
 * only job is to write it inline. Handed a number it writes `calc(3.5rem *
 * var(--mantine-scale))`, which makes the control's real footprint depend on
 * the root font size and on the theme's scale factor, while the space the
 * sheet reserves for it above is a count of CSS pixels. Declaring the property
 * directly keeps the control and the reservation in the same unit and derived
 * from the same constant. It is a documented part of `ActionIcon`'s styles
 * API, not an internal.
 *
 * The floor is then composed with `max()` rather than restated bare, which is
 * the second measured detail: Mantine already declares `min-width` and
 * `min-height` as `var(--ai-size)`, so a plain `min-inline-size:
 * ${MIN_HIT_TARGET}px` would *lower* the trigger's minimum from 56px to 48px
 * instead of raising anything. Composed, whichever is larger wins, and the
 * pattern's floor becomes a bottom that a change to `TRIGGER_SIZE` cannot drop
 * below unnoticed.
 *
 * `:active` is restated, and this one is measured rather than defensive.
 * `ActionIcon` carries Mantine's global `mantine-active` class, whose
 * `.mantine-active:active` rule declares `transform: translateY(calc(0.0625rem
 * * var(--mantine-scale)))` — a whole `transform`, at one class and one
 * pseudo-class of specificity, which outranks the centring translate below and
 * replaces it. Pressed with that rule left to win, the trigger's left edge
 * moves from 167px to 195px on a 390px viewport: 28px, half its own width, off
 * centre for as long as the finger is down. Composing Mantine's own value with
 * the centring translate keeps both — the press dips 1px and the trigger stays
 * where it was. The tuck rule follows this one so a tucked trigger stays
 * tucked.
 */
const TRIGGER_CSS = `
[data-tz-trigger] {
  --ai-size: ${TRIGGER_SIZE}px;
  position: fixed;
  inset-inline-start: 50%;
  inset-block-end: min(calc(${TRIGGER_GAP} + env(safe-area-inset-bottom, 0px)), ${MAX_TRIGGER_BOTTOM_GAP}px);
  z-index: ${TRIGGER_Z_INDEX};
  min-inline-size: max(var(--ai-size), ${MIN_HIT_TARGET}px);
  min-block-size: max(var(--ai-size), ${MIN_HIT_TARGET}px);
  touch-action: pinch-zoom;
  transform: translateX(-50%);
  transition: transform ${SHEET_DURATION} ${SHEET_EASING};
}
[data-tz-trigger]:active {
  transform: translateX(-50%) translateY(calc(0.0625rem * var(--mantine-scale)));
}
[data-tz-trigger][data-tz-tucked='true'] {
  transform: translateX(-50%) translateY(calc(100% + ${TUCK_TRAVEL} + env(safe-area-inset-bottom, 0px)));
}`

/**
 * The two queries the pattern is held to.
 *
 * Above the breakpoint the pattern removes itself entirely — the argument it
 * makes is about thumbs on a phone, and a pointer on a desktop has the whole
 * window in reach.
 *
 * Under `prefers-reduced-motion` the sheet does not travel at all: it stays
 * where it rests and only its opacity changes, and every transition collapses
 * to a millisecond, well under the 20ms `e2e/support/motion.ts` treats as
 * imperceptible. A drag is exempt because it is direct manipulation — the
 * sheet has to sit under the finger — and it stays exempt here for free, since
 * the behaviour drives a drag through an inline transform that outranks any of
 * these rules. The release, which is animation rather than manipulation, is
 * what these rules cancel.
 */
const QUERIES_CSS = `
${DESKTOP_QUERY} {
  [data-tz-scrim],
  [data-tz-sheet],
  [data-tz-trigger] {
    display: none;
  }
}
@media (prefers-reduced-motion: reduce) {
  [data-tz-scrim],
  [data-tz-sheet],
  [data-tz-trigger] {
    transition-duration: 1ms;
  }
  [data-tz-sheet] {
    transform: none;
    opacity: 0;
    pointer-events: none;
  }
  [data-tz-sheet][data-tz-open='true'] {
    opacity: 1;
    pointer-events: auto;
  }
}`

/**
 * The port's own stylesheet, rendered with the component.
 *
 * Mantine has no styling runtime — its classes are static CSS-module hashes
 * compiled at build time, which is exactly why this port passes no pre-init
 * hook — so a Mantine component cannot be handed a rule that depends on a
 * selector, and every rule above depends on one: an attribute the behaviour
 * writes, a media query, or a descendant. Mantine's own answer is a CSS module
 * beside the component, and this port declares the rules here instead for a
 * reason a module cannot meet: they are derived from `core/index.js`'s
 * constants — the hit-target floor, the breakpoint, the ceiling on how far the
 * trigger may sit from the bottom edge — and a stylesheet cannot import a
 * JavaScript module. The reference implementation restates 96px as a custom
 * property with a comment saying it is a copy, and the shadcn port restates it
 * inside a utility class name; here the value is read. It also means the
 * styling travels with the component, so the closed sheet is out of view on
 * any page that renders it, with nothing for a page to remember to import.
 *
 * It is authored as the first child of the provider's subtree, which puts it
 * ahead of every element the pattern owns and outside all of them —
 * `MantineProvider`'s own two style elements are already there, at index 0 of
 * the render. Nothing lands inside the sheet, the menu or an anchor, which is
 * what `systems/mantine/test/served-markup.test.js` holds.
 *
 * Selectors are the contract's own attributes, as in the Bootstrap port's
 * stylesheet: one port renders per page, the attributes are what the behaviour
 * already reads, and it keeps the styling and the contract the same surface.
 * They sit at one attribute of specificity, and every rule that has to outrank
 * one of Mantine's own class-level declarations is noted where it does. One
 * consequence for anyone asserting over the served bytes rather than over the
 * DOM: `data-tz-sheet` now occurs in the markup as a selector before it occurs
 * as an attribute, so such an assertion has to find the element and not the
 * string.
 */
const PORT_CSS = [SCRIM_CSS, SHEET_CSS, HANDLE_CSS, MENU_CSS, TRIGGER_CSS, QUERIES_CSS].join('\n')

/**
 * Whether the menu already stands reordered in the DOM, exactly reversed
 * against `items`.
 *
 * The pattern owns the menu's order, and on a server-rendered page it takes it
 * before this component renders on the client at all: the page wires the
 * behaviour during load, so the thumb-first reorder is already in the served
 * DOM by the time React comes to hydrate it. Rendering the authored order into
 * that would leave React holding every item's label against the wrong node,
 * off by the length of the list.
 *
 * Reordering moves text between nodes without moving any element React
 * expects, so it surfaces as a text mismatch — and React *throws* on an
 * unannounced one: it discards the tree and renders a fresh one, replacing the
 * very elements the page's handle is holding.
 *
 * So the render asks. One boolean, read once, trusted only when the answer is
 * unambiguous — an exact reversal of the items this render was given. Anything
 * else (a menu that opted out with `data-tz-order="dom"`, a consumer's own
 * order, markup this component did not produce, or a client render with no
 * server markup to consult) reads as false and renders the authored order,
 * which is what the server rendered too.
 *
 * (A client-only render has no DOM to consult and initialises from an effect
 * instead, so the reorder lands after the commit and React's idea of the order
 * stays the authored one for the rest of the tree's life. That is the pattern
 * owning the DOM, which is the arrangement everywhere else too, and no
 * hydration is involved for it to break.)
 */
function menuIsReversed(items: readonly string[]): boolean {
  if (typeof document === 'undefined') return false
  const menu = document.querySelector('[data-tz-menu]')
  if (!menu) return false
  const rendered = Array.from(menu.querySelectorAll('a')).map((link) => link.textContent?.trim())
  if (rendered.length !== items.length) return false
  return items.every((item, index) => rendered[items.length - 1 - index] === item)
}

/**
 * The pattern's markup in Mantine's primitives, wired to the shared behaviour.
 *
 * Not built on Mantine's `Drawer`, and the reason is measured rather than
 * stylistic: it is the first drawer primitive here that offered to stay
 * mounted while closed, and neither of the two ways it does so renders a sheet
 * this pattern can drive. `systems/mantine/src/thumbzone.ts` records that in
 * full. The same shape as the Material UI, shadcn/ui and Chakra UI ports, and
 * for the same reason: a design system's drawer owns open/close, focus and
 * motion, and this pattern already owns those, so a port reaches past the
 * component to the surface underneath.
 *
 * Every contract attribute is authored as a literal, and none of them is
 * driven from a prop or from React state. The shared behaviour's `destroy()`
 * has to hand back the DOM as this markup authored it, and both consumers and
 * the conformance suite edit that DOM while no instance exists: a render
 * driven from props would overwrite those edits on its next commit, and one
 * driven from state could not see them at all. `shared/react/adapter.ts`'s
 * header explains that in full. Everything in the JSX therefore renders the
 * sheet's **closed** state, which is also what a reader gets before hydration
 * and with the bundle blocked entirely; the behaviour takes those same
 * attributes over from there.
 *
 * Mantine's class names could not have carried a contract attribute anyway —
 * they are static build-time hashes, not names generated per render — but they
 * are still authored as literals here, because the reason is about who owns
 * the DOM rather than about whether a class name is stable.
 */
export default function ThumbzoneMenu({
  items,
  ref,
}: {
  /** The menu's items, authored most-used-first. */
  items: readonly string[]
  /**
   * Receives the sheet's `open`, `close` and `destroy`.
   *
   * The pattern is driven from the DOM — a tap, a swipe, a key — so nothing
   * here needs this; it is for the application around it, which may have its
   * own reason to open or dismiss the menu and no element of the pattern's to
   * dispatch through.
   */
  ref?: Ref<ThumbzoneHandle>
}) {
  const trigger = useRef<HTMLButtonElement>(null)
  const sheet = useRef<HTMLDivElement>(null)
  const scrim = useRef<HTMLDivElement>(null)
  const menu = useRef<HTMLUListElement>(null)

  const thumbzone = useThumbzone({ trigger, sheet, scrim, menu })
  useImperativeHandle(ref, () => thumbzone, [thumbzone])

  // Read once, on the render that has to agree with the page. Recomputing it
  // later would let a re-render write the order back — React deciding the
  // pattern's order, which is the wrong way round. The direction is captured
  // rather than the list itself, so a consumer who does change `items` still
  // gets all of the current items, thumb-first.
  const [reversed] = useState(() => menuIsReversed(items))
  const order = reversed ? [...items].reverse() : items

  return (
    /* Mantine's components read their theme from this provider, and it renders
       no element of its own — two style elements carrying the theme's custom
       properties and its responsive helper classes, then the children.
       Providing it here rather than requiring the page to is what keeps the
       component renderable on its own, which is what a demo route wants; an
       application with a theme of its own would want the provider hoisted, and
       this port has no prop for that today.

       One thing the provider cannot do from in here, stated because its
       absence is invisible in the markup: Mantine's colour variables are
       declared under `:root[data-mantine-color-scheme='light'|'dark']` and the
       matching `:host` form, and under nothing else — so the attribute has to
       be on the document's root element, and the route is what puts it there.
       The provider stamps it from an effect after hydration, which is far too
       late for a pattern that is wired during load. */
    <MantineProvider>
      {/* The port's own rules. First child of the subtree, so it precedes
          every element the pattern owns and sits inside none of them. React
          emits a text child of `<style>` verbatim, without entity-escaping it
          — measured on this render, and load-bearing, since an escaped
          entity in a stylesheet is a broken declaration rather than an
          encoded one. */}
      <style data-tz-styles="">{PORT_CSS}</style>

      {/* `Overlay` is the scrim's box: `inset: 0`, `fixed` switching it to
          viewport-relative, and Mantine's own overlay background. Its
          `zIndex` prop writes `--overlay-z-index`, which its rule reads, so
          the stacking stays in Mantine's vocabulary rather than being
          restated in the stylesheet. */}
      <Overlay
        ref={scrim}
        fixed
        zIndex={SCRIM_Z_INDEX}
        // The state attributes below are the pattern's from load onward, and
        // by the time this island hydrates the sheet may well have been
        // opened already. React would report that as a mismatch on attributes
        // it does not in fact own; this says so, for this element only.
        suppressHydrationWarning
        data-tz-scrim=""
        data-tz-open="false"
      />

      <Paper
        ref={sheet}
        id={SHEET_ID}
        role="dialog"
        aria-modal="true"
        // The dialog names itself in the port's own words; the trigger's name
        // below is separate and stays put in both states.
        aria-label="Site navigation"
        // `shadows.lg` is this port's own pick off Mantine's five-step shadow
        // scale rather than a value borrowed from its `Drawer`: measured, that
        // component passes no shadow at all and leans on the overlay behind it
        // for separation. The sheet takes one because it has to read as a
        // surface above the page from the moment it starts to travel, while
        // the scrim is still fading in. The corner radius is not taken from
        // the matching prop — see SHEET_CSS for why, and for what else Paper's
        // own rule declares that this pattern takes back.
        shadow="lg"
        // Authored closed and inert, and rendered either way — never `hidden`
        // and never `display: none`, which would leave the open transition
        // nothing to animate and make `inert` decorative.
        inert
        // Focusable only as the fallback a menu with nothing focusable in it
        // needs, and never a stop in the tab sequence. Authored rather than
        // left to the behaviour so that a served page already matches what
        // React renders.
        tabIndex={-1}
        suppressHydrationWarning
        data-tz-sheet=""
        data-tz-open="false"
      >
        {/* A sibling of the menu and authored above it: the menu owns the
            sheet's scrolling, so this is the one place a dismiss drag can
            start. aria-hidden because it says nothing the dialog's own name
            has not already said. */}
        <Box data-tz-handle="" aria-hidden="true">
          {/* The pill is the only decoration this port draws, so it is sized
              and coloured through Mantine's style props rather than through
              the stylesheet: nothing overrides it and no selector reaches it.

              A non-text UI component, so WCAG 1.4.11 puts a 3:1 floor on it —
              and axe does not check non-text contrast, so neither the
              conformance suite nor the accessibility gate would catch a pill
              that fell under it. This comment is the only guard.
              `--mantine-color-dimmed` over `--mantine-color-body` is gray.6
              on white (3.32:1) and dark.2 on dark.7 (4.04:1), both computed
              from Mantine's own palette rather than eyeballed. Reread if
              either token moves. */}
          <Box w={40} h={4} bdrs="xl" bg="var(--mantine-color-dimmed)" />
        </Box>

        {/* `List` renders the `<ul>` the contract asks for and `List.Item` the
            `<li>`s. `listStyleType="none"` is the prop that drops the markers
            — and, through the `data-type="none"` it sets, the marker gap
            Mantine's own rule would otherwise indent every row by.

            The `styles` below are a reach, and a measured one. `List.Item`
            renders its content inside two boxes of its own — an `inline-flex`
            wrapper and an inline label span — and `NavLink`'s `width: 100%`
            resolves against the nearer of those rather than against the menu.
            Left alone, the first row measured 62px wide where the menu leaves
            it 370: the wrapper shrank to its content, and its content was a
            row asking to be as wide as its parent. Both boxes are made
            block-level here, which is what makes the whole 370 of the row a
            48px target instead of the label's own few characters. Mantine's
            styles API names the two elements, so this survives a change to
            their class hashes. */}
        <List
          // Mantine derives `List`'s element props from `'ol'` — which is
          // where its `type`, `start` and `reversed` props come from — while
          // its factory's own ref is an `HTMLUListElement`, so the `ref` prop
          // it publishes is the intersection of the two and no single element
          // type satisfies it. The node is the `<ul>` it renders at the
          // default `type`, which is what the ref is declared as above and
          // what the behaviour is handed; the assertion is about that
          // intersection and nothing else.
          ref={menu as Ref<HTMLUListElement & HTMLOListElement>}
          listStyleType="none"
          styles={{ itemWrapper: { display: 'block' }, itemLabel: { display: 'block' } }}
          // The order opt-out the pattern honours is read from this element's
          // own attributes rather than passed as a prop, so a consumer who
          // sets it before the island hydrates has not created a mismatch for
          // React to report. This covers the `<ul>`'s own attributes and
          // nothing below it — React consults the flag on the fiber a
          // mismatch is found at, so the reordered items each carry their own.
          suppressHydrationWarning
          data-tz-menu=""
        >
          {order.map((item) => (
            <List.Item key={item}>
              {/* `NavLink` with `component="a"` renders a real `<a href>`,
                  which is what the contract's menu items have to be and what
                  the focus trap looks for. It also brings the resting and
                  hover states of Mantine's own navigation row, and the focus
                  indicator: the `mantine-focus-auto` class it carries is what
                  draws a 2px focus indicator on `:focus-visible`, which
                  matters here because the trap moves focus into the sheet on
                  open. (Spelled "focus indicator" rather than by the CSS
                  property's own name, deliberately: a utility-first scanner
                  reads every byte of this repository, and that word in a
                  comment compiles a real rule into two other ports' bundles —
                  `site/test/bundle-surface.test.ts` caught exactly that here.)

                  The label is a prop rather than a child, so the annotation
                  below goes on an element passed *into* it. */}
              <NavLink
                component="a"
                href="#"
                label={
                  /* Annotated on the node whose text moves. React consults
                     the flag at the fiber the mismatch is found at and nowhere
                     else, so putting it on the `<ul>` several levels up would
                     do nothing for this text.

                     What it is *not* is a licence to disagree with the DOM: on
                     its own it would leave React binding every label to the
                     wrong node, which is silent rather than safe.
                     `menuIsReversed` above resolves the ordinary case by
                     rendering the order the DOM already has, and this covers
                     only what that cannot — a served menu whose order is
                     neither the authored one nor an exact reversal of it,
                     where the render falls back to the authored order and some
                     text genuinely differs. Suppressed, because the order was
                     never React's to arbitrate. */
                  <span suppressHydrationWarning>{item}</span>
                }
              />
            </List.Item>
          ))}
        </List>
      </Paper>

      {/* `ActionIcon` is a real `<button>`, which the trigger has to be, and
          it already emits `type="button"` through the unstyled button
          underneath it — measured, so nothing is passed for it here. Its name
          is the port's own and names the menu rather than the state:
          `aria-expanded` reports open or closed, so a name that changed with
          it would say the same thing twice, and the pattern's own fallback
          string is not a name a port is entitled to ship with.

          `radius="xl"` is the largest step on Mantine's radius scale, 2rem
          against a 56px control, which rounds it to a circle. No `color`:
          Mantine resolves the filled variant's background from the theme's
          primary colour, so leaving it unset is what lets the trigger take
          whichever palette the application sets rather than a colour this port
          invented. */}
      <ActionIcon
        ref={trigger}
        variant="filled"
        radius="xl"
        suppressHydrationWarning
        data-tz-trigger=""
        aria-label="Site menu"
        aria-expanded="false"
        aria-controls={SHEET_ID}
      >
        {/* Drawn inline rather than pulled from an icon package, which this
            project does not depend on. `ActionIcon` centres it in a box of its
            own, so the glyph needs no styling of the port's. */}
        <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden="true">
          <path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z" />
        </svg>
      </ActionIcon>
    </MantineProvider>
  )
}
