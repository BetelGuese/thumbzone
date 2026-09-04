import { useImperativeHandle, useRef, useState } from 'react'
import type { CSSProperties, Ref } from 'react'
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
import { MAX_TRIGGER_BOTTOM_GAP, MIN_HIT_TARGET } from '../../../core/index.js'
import type { ThumbzoneHandle } from './thumbzone'
import { useThumbzone } from './useThumbzone'

/** Target of the trigger's `aria-controls`, and the sheet's own `id`. */
const SHEET_ID = 'tz-mantine-sheet'

/**
 * The two lengths this component hands to `thumbzone.css`, as custom
 * properties on the elements that read them.
 *
 * Both are the contract's rather than this port's — `MIN_HIT_TARGET` and
 * `MAX_TRIGGER_BOTTOM_GAP` from `core/index.js` — and a stylesheet cannot
 * import a JavaScript module. The reference implementation and the Bootstrap
 * port each restate them in CSS with a comment saying the value is a copy; a
 * custom property lets this port read them instead.
 *
 * They are set on the sheet and on the trigger, which is every subtree that
 * needs them: the handle and the menu rows inherit from the sheet, and the
 * trigger is the pattern's one element outside it. A custom property is safe
 * inline where the sheet's resting `transform` is not — the shared behaviour
 * writes and clears `sheet.style.transform` during a drag and touches nothing
 * else on the attribute, so what it clears is the property it set.
 *
 * Cast once, here: React's `CSSProperties` has no index signature for a custom
 * property, and every alternative is worse than one named function.
 */
function cssVars(vars: Record<`--${string}`, string>): CSSProperties {
  return vars as CSSProperties
}

const SHEET_VARS = cssVars({ '--tz-hit-target': `${MIN_HIT_TARGET}px` })
const TRIGGER_VARS = cssVars({
  '--tz-hit-target': `${MIN_HIT_TARGET}px`,
  '--tz-trigger-max-bottom-gap': `${MAX_TRIGGER_BOTTOM_GAP}px`,
})

/**
 * The scrim's stacking level, off Mantine's own ladder.
 *
 * `getDefaultZIndex` publishes it as app 100, modal 200, popover 300, overlay
 * 400, max 9999 — so `overlay` is *above* `modal` there and is not the scrim's
 * level in this pattern, whatever its name suggests. Mantine's own `Drawer`
 * puts its overlay and its content both at `modal` and lets DOM order stack
 * them, because it owns a root element wrapping both; the pattern's three
 * elements are siblings with nothing wrapping them, so the order is stated. The
 * sheet and the trigger take 201 and 202 in `thumbzone.css`, which cannot call
 * this helper.
 */
const SCRIM_Z_INDEX = getDefaultZIndex('modal')

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
 * stylistic: it offers two ways to stay mounted while closed and neither of
 * them renders a sheet this pattern can drive — one server-renders nothing at
 * all, the other renders the sheet carrying `display: none`.
 * `systems/mantine/src/thumbzone.ts` records both in full, and records why
 * "the first drawer here to offer it" — which an earlier draft of this comment
 * claimed — is not true of it. The same shape as the Material UI, shadcn/ui
 * and Chakra UI ports, and for the same reason: a design system's drawer owns
 * open/close, focus and motion, and this pattern already owns those, so a port
 * reaches past the component to the surface underneath.
 *
 * **The pattern's geometry, motion and touch rules are in
 * `systems/mantine/src/thumbzone.css`**, which the Mantine routes import and
 * which pulls `@mantine/core/styles.css` in at its own top. Mantine has no
 * styling runtime — its classes are CSS-module hashes compiled at build time —
 * so nothing here can be handed a rule keyed off `data-tz-open`, off a media
 * query, or off a descendant, and seven of the port's declarations tie one of
 * Mantine's own class rules on specificity and are decided by order. Keeping
 * the vendor import at the top of that one file is what makes the order a
 * property of the file rather than of whatever a route does with two
 * stylesheets. Only what a selector cannot reach is styled here: Mantine's own
 * component props, its style props for the handle's pill, and the two custom
 * properties above.
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
        // The hit-target floor, for the handle and the menu rows inside this
        // element to inherit.
        style={SHEET_VARS}
        // `shadows.lg` is this port's own pick off Mantine's five-step shadow
        // scale rather than a value borrowed from its `Drawer`: measured, that
        // component passes no shadow at all and leans on the overlay behind it
        // for separation. The sheet takes one because it has to read as a
        // surface above the page from the moment it starts to travel, while
        // the scrim is still fading in.
        shadow="lg"
        /* No `radius` prop: it would reach all four corners, and this sheet's
           bottom edge is flush with the viewport's. `thumbzone.css` declares
           the four logical corners itself, and records which step it takes and
           what taking a step off Paper's default costs. */
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
              and coloured through Mantine's style props rather than from the
              stylesheet: nothing overrides it and no selector reaches it.

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
            `<li>`s, and `listStyleType="none"` is what drops the markers.

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

          No `size`: this control is sized by the `--ai-size` custom property
          its own rule reads, declared in `thumbzone.css` beside the space the
          sheet reserves for it, so that the two are one length in one place.

          `radius="xl"` is the largest of the five steps on Mantine's radius
          scale — `calc(2rem * var(--mantine-scale))`, measured 32px against
          this 56px control, which rounds it to a circle. The sheet takes `lg`
          rather than this one, deliberately and for reasons `thumbzone.css`
          gives at its own corner declarations; the two are different steps
          because a full-width panel edge and a circular control want different
          shapes, not because either is the scale's largest. No `color`:
          Mantine resolves the filled variant's background from the theme's
          primary colour, so leaving it unset is what lets the trigger take
          whichever palette the application sets rather than a colour this port
          invented. */}
      <ActionIcon
        ref={trigger}
        variant="filled"
        radius="xl"
        // The hit-target floor and the ceiling on how far this control may sit
        // from the viewport's bottom edge, both read by `thumbzone.css`.
        style={TRIGGER_VARS}
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
