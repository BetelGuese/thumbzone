import { useImperativeHandle, useRef, useState } from 'react'
import type { Ref } from 'react'
import { Box, Button, ChakraProvider, Icon, IconButton, List, defaultSystem } from '@chakra-ui/react'
import { DESKTOP_BREAKPOINT, MAX_TRIGGER_BOTTOM_GAP, MIN_HIT_TARGET } from '../../../core/index.js'
import type { ThumbzoneHandle } from './thumbzone'
import { useThumbzone } from './useThumbzone'

/** Target of the trigger's `aria-controls`, and the sheet's own `id`. */
const SHEET_ID = 'tz-chakra-sheet'

/**
 * Where the pattern stops applying, written from `core/index.js`'s own constant.
 *
 * Chakra states its `md` breakpoint as `48rem`, which resolves to 768px at the
 * default root size and so agrees with `DESKTOP_BREAKPOINT` today — but it is a
 * different unit, resolved against a font size the application controls, and
 * free to move on a major release. `hideFrom="md"` would drift silently the
 * moment either value changed. Chakra has no equivalent of Material UI's
 * `breakpoints.up(768)` — its breakpoint props take token names only — so the
 * query is stated from the constant instead and handed to the `css` prop, which
 * accepts a raw at-rule as a key. The Tailwind port declines Tailwind's own
 * `md:` for exactly this reason.
 */
const DESKTOP_QUERY = `@media (min-width: ${DESKTOP_BREAKPOINT}px)`

/**
 * How much of the viewport the open sheet may occupy.
 *
 * A sheet that filled the screen would be a page: leaving a strip of scrim above
 * it is what keeps "tap outside to dismiss" discoverable and what says the page
 * is still there behind it. `dvh`, never `vh` — iOS Safari resolves `vh` against
 * the expanded viewport, so the sheet's top edge would end up under the
 * collapsing URL bar. Chakra's own `sizes` scale offers `dvh` (100dvh) but no
 * fraction of it, so this is a plain value rather than a token.
 */
const SHEET_MAX_BLOCK_SIZE = '85dvh'

/**
 * The trigger's footprint, as Chakra `sizes` and `spacing` token names.
 *
 * `sizes.14` is 3.5rem — 56px at the default root size, comfortably past the
 * pattern's 48px floor, and the same footprint the reference implementation and
 * the Material UI port give their triggers. `spacing.4` (1rem) is what lifts it
 * off the viewport's bottom edge.
 *
 * Kept as token *names* rather than resolved values because both are needed in
 * two places that read them differently: as a Chakra style prop, and inside a
 * `calc()` where Chakra resolves `{sizes.14}` to the custom property it emitted.
 * The sheet reserves exactly this much space at its bottom edge, so a change to
 * either has to move both.
 */
const TRIGGER_SIZE_TOKEN = '14'
const TRIGGER_GAP_TOKEN = '4'

/**
 * The sheet's travel, as two tokens off Chakra's own motion scale rather than a
 * duration tuned by hand.
 *
 * `durations.moderate` is 200ms. The pattern's bounds are 120–400ms
 * (`e2e/support/motion.ts`): under the floor the sheet reads as
 * already-arrived and stops saying it came up from the trigger the thumb just
 * touched; over the ceiling the user is waiting on a menu. Chakra's scale runs
 * 50ms to 500ms, so picking the semantically right token is the whole exercise —
 * with one caveat worth recording, since it is the case `motion.ts` anticipates:
 * Chakra's own `Drawer` content recipe enters on `durations.slowest` (500ms)
 * and exits on `durations.slower` (400ms), both past the bound this pattern
 * allows, so the port takes `moderate` from the same scale instead — one of
 * its faster tokens rather than either of its slowest two. (That same
 * recipe's backdrop fades out on `moderate` too, which is corroboration, but
 * belongs to the backdrop, not to the content the Drawer actually moves.)
 *
 * `easings.ease-in-smooth` is `cubic-bezier(0.32, 0.72, 0, 1)`, the curve
 * Chakra's `Drawer` animates both directions with. Despite the name it
 * decelerates — the first control point sits high and early — which is what
 * gives the sheet weight; a linear ramp would fail the pattern's non-linearity
 * requirement as well as looking mechanical.
 */
const SHEET_DURATION = 'moderate'
const SHEET_EASING = 'ease-in-smooth'

/**
 * How the port cancels its own transitions under `prefers-reduced-motion`.
 *
 * Chakra's fastest duration token is `durations.fastest` at 50ms, and the
 * pattern treats anything over one 60Hz frame as perceptible movement
 * (`INSTANT_MOTION_MAX_MS` is 20ms). No token on Chakra's scale gets under that
 * bar, so the preference is honoured by cancelling the transition outright
 * rather than by reaching for a token that cannot reach it.
 */
const REDUCED_MOTION_RESET = { transition: 'none' } as const

/**
 * Whether the menu already stands reordered in the DOM, exactly reversed against
 * `items`.
 *
 * The pattern owns the menu's order, and on a server-rendered page it takes it
 * before this component renders on the client at all: the page wires the
 * behaviour during load, so the thumb-first reorder is already in the served DOM
 * by the time React comes to hydrate it. Rendering the authored order into that
 * would leave React holding every item's label against the wrong node, off by
 * the length of the list.
 *
 * Reordering moves text between nodes without moving any element React expects,
 * so it surfaces as a text mismatch — and React *throws* on an unannounced one:
 * it discards the tree and renders a fresh one, replacing the very elements the
 * page's handle is holding.
 *
 * So the render asks. One boolean, read once, trusted only when the answer is
 * unambiguous — an exact reversal of the items this render was given. Anything
 * else (a menu that opted out with `data-tz-order="dom"`, a consumer's own
 * order, markup this component did not produce, or a client render with no
 * server markup to consult) reads as false and renders the authored order, which
 * is what the server rendered too.
 *
 * (A client-only render has no DOM to consult and initialises from an effect
 * instead, so the reorder lands after the commit and React's idea of the order
 * stays the authored one for the rest of the tree's life. That is the pattern
 * owning the DOM, which is the arrangement everywhere else too, and no hydration
 * is involved for it to break.)
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
 * The pattern's markup in Chakra UI's primitives, wired to the shared behaviour.
 *
 * Not built on Chakra's `Drawer`, and the reason is measured rather than
 * stylistic: that component wraps Ark UI's Dialog, which server-renders no
 * content at all while closed — with `unmountOnExit` at its mounted default, a
 * closed render emitted zero menu anchors against an open render's two. The
 * contract needs the sheet fully rendered while closed, so there is nothing to
 * reach for there. `systems/chakra/src/thumbzone.ts` records the measurement in
 * full. The same shape as the Material UI and shadcn/ui ports, and for the same
 * reason: a design system's drawer owns open/close, focus and motion, and this
 * pattern already owns those, so a port reaches past the component to the
 * surface underneath.
 *
 * Every contract attribute is authored as a literal rather than derived from a
 * styling API — Emotion generates the class names, so nothing the contract is
 * expressed in may ride on one — and none of them is driven from a prop or from
 * React state. The shared behaviour's `destroy()` has to hand back the DOM as
 * this markup authored it, and both consumers and the conformance suite edit
 * that DOM while no instance exists: a render driven from props would overwrite
 * those edits on its next commit, and one driven from state could not see them at
 * all. `shared/react/adapter.ts`'s header explains that in full. Everything in
 * the JSX therefore renders the sheet's **closed** state, which is also what a
 * reader gets before hydration and with the bundle blocked entirely; the
 * behaviour takes those same attributes over from there.
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
   * The pattern is driven from the DOM — a tap, a swipe, a key — so nothing here
   * needs this; it is for the application around it, which may have its own
   * reason to open or dismiss the menu and no element of the pattern's to
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
    /* Chakra v3 reads its tokens, recipes and conditions from a system in
       context, and there is no falling back to defaults: `useChakraContext` is
       declared strict, so a Chakra component rendered with no provider above it
       throws rather than styling itself from the built-in scale. That is the
       difference from the Material UI port, which resolves the outer theme with
       `useTheme()` and extends it. The consequence is stated rather than hidden:
       a consumer who already provides their own system would get Chakra's
       default one inside this subtree. Providing it here rather than requiring
       the page to is what keeps the component renderable on its own, which is
       what a demo route wants; serving an application that has its own system
       means taking the system as a prop, and this port has no such prop
       today. */
    <ChakraProvider value={defaultSystem}>
      {/* Chakra's `Drawer` fades its backdrop through Ark's presence machinery,
          which needs the Dialog this port cannot use. The scrim is a `Box` in
          the same colour Chakra's own `drawer` and `dialog` recipes give their
          backdrop, driven by `data-tz-open` on the element itself. */}
      <Box
        ref={scrim}
        // The state attributes below are the pattern's from load onward, and by
        // the time this island hydrates the sheet may well have been opened
        // already. React would report that as a mismatch on attributes it does
        // not in fact own; this says so, for this element only.
        suppressHydrationWarning
        data-tz-scrim=""
        data-tz-open="false"
        position="fixed"
        inset="0"
        // One layer under the sheet, so the scrim covers the page and nothing
        // else. Chakra's own `drawer` and `dialog` recipes derive their
        // backdrop's z-index from `zIndex.popover`, not from `overlay` — but
        // `overlay` sits on the same scale, one layer under `modal`, which is
        // exactly the relationship this scrim needs to the sheet, so it is
        // reached for on its own name rather than borrowed from a recipe that
        // names a different token.
        zIndex="overlay"
        bg="blackAlpha.500"
        opacity="0"
        pointerEvents="none"
        css={{
          // The scrim scrolls nothing of its own but sits over a page that does,
          // and `pointer-events` alone does not stop a touch pan reaching it.
          // pinch-zoom, never `none`: this covers the whole viewport while open,
          // so blocking zoom here is a screen-wide regression (WCAG 1.4.4).
          touchAction: 'pinch-zoom',
          transitionProperty: 'opacity',
          transitionDuration: SHEET_DURATION,
          transitionTimingFunction: SHEET_EASING,
          '&[data-tz-open="true"]': { opacity: 1, pointerEvents: 'auto' },
          [DESKTOP_QUERY]: { display: 'none' },
          _motionReduce: REDUCED_MOTION_RESET,
        }}
      />

      <Box
        ref={sheet}
        id={SHEET_ID}
        role="dialog"
        aria-modal="true"
        // The dialog names itself in the port's own words; the trigger's name
        // below is separate and stays put in both states.
        aria-label="Site navigation"
        // Authored closed and inert, and rendered either way — never `hidden`
        // and never `display: none`, which would leave the open transition
        // nothing to animate and make `inert` decorative.
        inert
        // Focusable only as the fallback a menu with nothing focusable in it
        // needs, and never a stop in the tab sequence. Authored rather than left
        // to the behaviour so that a served page already matches what React
        // renders.
        tabIndex={-1}
        suppressHydrationWarning
        data-tz-sheet=""
        data-tz-open="false"
        position="fixed"
        insetInline="0"
        insetBlockEnd="0"
        zIndex="modal"
        display="flex"
        flexDirection="column"
        maxBlockSize={SHEET_MAX_BLOCK_SIZE}
        // The menu below owns the sheet's scrolling, so that a menu taller than
        // the sheet keeps scrolling by touch while the sheet's own chrome stays
        // a drag surface.
        overflow="hidden"
        // The surface tokens Chakra's own `drawer` recipe gives its content, so
        // this sheet reads as a Chakra sheet: the panel background rather than
        // the page background, and an elevation off the same shadow scale.
        bg="bg.panel"
        color="fg"
        boxShadow="lg"
        // `l3` is the largest of Chakra's three semantic radii, which is what a
        // panel-sized surface takes. Top corners only: the bottom edge is flush
        // with the viewport's.
        borderTopRadius="l3"
        css={{
          // Declared on the element itself, not inherited: an ancestor's
          // `touch-action` does not change this element's own computed value,
          // which is what a pan starting on the sheet's own chrome is
          // arbitrated against. pinch-zoom rather than `none` so a pinch that
          // lands here still zooms the page — panning is what has to stay ours.
          touchAction: 'pinch-zoom',
          // Reserves the trigger's own vertical footprint — its size plus the
          // gap that lifts it off the bottom edge — so the menu's last row never
          // ends up underneath it. The trigger floats *above* the sheet because
          // tapping it is a close path, which makes "floating above" and
          // "covering the last row" the same arrangement unless the sheet
          // reserves the space. The safe-area inset is added outright rather
          // than folded into the trigger's (clamped) offset: this only has to be
          // at least as large as the trigger's real clearance, and adding the
          // inset can only make that truer.
          paddingBlockEnd: `calc({sizes.${TRIGGER_SIZE_TOKEN}} + {spacing.${TRIGGER_GAP_TOKEN}} + env(safe-area-inset-bottom, 0px))`,
          transform: 'translateY(100%)',
          transitionProperty: 'transform',
          transitionDuration: SHEET_DURATION,
          transitionTimingFunction: SHEET_EASING,
          '&[data-tz-open="true"]': { transform: 'none' },
          // A drag is direct manipulation: the sheet has to sit under the
          // finger, not chase it a transition-duration behind.
          '&[data-tz-dragging="true"]': { transition: 'none' },
          [DESKTOP_QUERY]: { display: 'none' },
          _motionReduce: {
            // No travel at all under the preference — the sheet stays where it
            // rests and only its opacity changes, instantly.
            ...REDUCED_MOTION_RESET,
            transform: 'none',
            opacity: 0,
            pointerEvents: 'none',
            '&[data-tz-open="true"]': { opacity: 1, pointerEvents: 'auto' },
          },
        }}
      >
        {/* A sibling of the menu and authored above it: the menu owns the
            sheet's scrolling, so this is the one place a dismiss drag can
            start. aria-hidden because it says nothing the dialog's own name has
            not already said. */}
        <Box
          data-tz-handle=""
          aria-hidden="true"
          flexShrink="0"
          display="flex"
          alignItems="center"
          justifyContent="center"
          // The whole drag target clears the pattern's minimum, not just the
          // pill drawn inside it — declared from the constant rather than from a
          // spacing token that could be tidied under it.
          blockSize={`${MIN_HIT_TARGET}px`}
          cursor="grab"
          css={{
            // Declared on the element itself, not inherited, for the same reason
            // as the sheet's. The contract sanctions `none` here, since the
            // handle genuinely needs to own the gesture and the impairment is
            // confined to one 48px control — but refusing the vertical pan is all
            // that ownership requires, and a pinch landing on a real control
            // should still zoom the page (WCAG 1.4.4). Every shipped port makes
            // the same call.
            touchAction: 'pinch-zoom',
            '[data-tz-dragging="true"] &': { cursor: 'grabbing' },
          }}
        >
          <Box
            inlineSize="10"
            blockSize="1.5"
            borderRadius="full"
            // A non-text UI component, so WCAG 1.4.11 puts a 3:1 floor on it —
            // and axe does not check non-text contrast, so neither the
            // conformance suite nor the accessibility gate would catch a pill
            // that fell under it. This comment is the only guard. `fg.muted`
            // over `bg.panel` resolves to gray.600 on white (7.73:1) and
            // gray.400 on gray.950 (7.37:1) — both computed from Chakra's own
            // token values, not eyeballed. Reread if either token moves.
            bg="fg.muted"
          />
        </Box>

        {/* Chakra's own list primitive: `List.Root` renders the `<ul>` the
            contract asks for, and `List.Item` the `<li>`s. `variant="plain"` is
            the step that leaves Chakra's reset in place — it is the default
            `marker` variant that opts the bullet back in, with
            `listStyle: revert`. */}
        <List.Root
          ref={menu}
          variant="plain"
          // The order opt-out the pattern honours is read from this element's own
          // attributes rather than passed as a prop, so a consumer who sets it
          // before the island hydrates has not created a mismatch for React to
          // report. This covers the `<ul>`'s own attributes and nothing below it
          // — React consults the flag on the fiber a mismatch is found at, so the
          // reordered items each carry their own.
          suppressHydrationWarning
          data-tz-menu=""
          flex="1"
          // Without this a flex child's automatic minimum is its content's
          // height, so a long menu would push the sheet past its own
          // max-block-size instead of scrolling inside it.
          minBlockSize="0"
          overflowY="auto"
          // Keeps a scroll that reaches the boundary from chaining into the page
          // behind the sheet on iOS.
          overscrollBehavior="contain"
          padding="2"
          gap="1"
          css={{
            // Unconditional, unlike every other surface here: this region must
            // stay pannable by touch at every scroll position and on every
            // engine. A value that changed with `scrollTop` is what deadlocks —
            // it blocks the very scroll that would move `scrollTop` off zero.
            touchAction: 'pan-y pinch-zoom',
          }}
        >
          {order.map((item) => (
            <List.Item key={item}>
              {/* A ghost `Button` over the port's own anchor, which is how
                  Chakra v3 authors a navigation row: `asChild` hands the
                  recipe's styling — its resting and hover states, its radius,
                  its focus indicator — to a real `<a href>`, which is what the
                  contract's menu items have to be and what the focus trap looks
                  for.

                  `size="xl"` is not a taste. Chakra's own height token for that
                  step is `sizes.12` (3rem, 48px), and it is the first step whose
                  token reaches the pattern's floor: the default `md` is
                  `sizes.10` (40px) and `lg` is `sizes.11` (44px), both under it —
                  the same finding the Bootstrap port recorded about
                  `.nav-link`. So `size="xl"` asks for the right step in
                  Chakra's own vocabulary.

                  But recipes are layered and style props are not: the port's
                  own `blockSize="auto"` below outranks the recipe's `height`,
                  so that token never reaches the rendered row at all. The 48px
                  comes entirely from the explicit `min-block-size` derived from
                  MIN_HIT_TARGET below — and *nothing in the conformance suite
                  asserts a menu row's height*, only the trigger and the drag
                  handle are checked against the constant. That literal is
                  therefore load-bearing and must not be removed: delete it and
                  the row renders 42px, measured — the line-height, plus this
                  padding, plus the 1px the button recipe puts on each edge,
                  which counts because the box is sized border-box. Six pixels
                  under the floor, with no test to catch the drop.

                  `blockSize="auto"` is what hands the row's height to its
                  content instead of the recipe, so it can also be *taller*
                  than the floor — with `whiteSpace="normal"` restoring
                  wrapping, a label too long for one line expands the row
                  instead of running out of it. */}
              <Button
                asChild
                variant="ghost"
                size="xl"
                // Chakra's `Button` authors `type="button"` before spreading the
                // caller's props, which is right for the `<button>` it normally
                // renders and meaningless on an anchor, where HTML gives `type`
                // a MIME-type meaning. Passing it through as undefined is what
                // drops the attribute.
                type={undefined}
                width="full"
                justifyContent="flex-start"
                textAlign="start"
                whiteSpace="normal"
                blockSize="auto"
                minBlockSize={`${MIN_HIT_TARGET}px`}
                paddingBlock="2"
              >
                <a href="#">
                  {/* Annotated on the node whose text moves. React consults the
                      flag at the fiber the mismatch is found at and nowhere
                      else, so putting it on the `<ul>` several levels up would
                      do nothing for this text.

                      What it is *not* is a licence to disagree with the DOM: on
                      its own it would leave React binding every label to the
                      wrong node, which is silent rather than safe.
                      `menuIsReversed` above resolves the ordinary case by
                      rendering the order the DOM already has, and this covers
                      only what that cannot — a served menu whose order is
                      neither the authored one nor an exact reversal of it, where
                      the render falls back to the authored order and some text
                      genuinely differs. Suppressed, because the order was never
                      React's to arbitrate. */}
                  <span suppressHydrationWarning>{item}</span>
                </a>
              </Button>
            </List.Item>
          ))}
        </List.Root>
      </Box>

      {/* Chakra's `IconButton` is a real `<button>`, which the trigger has to
          be, and it is the `Button` with its own padding zeroed — so a fixed
          square is not fighting a recipe's horizontal padding for the glyph's
          room. Its name is the port's own and describes the menu rather than the
          state: `aria-expanded` reports open or closed, so a name that changed
          with it would say the same thing twice, and the pattern's own fallback
          string is not a name a port is entitled to ship with.

          No `colorPalette`: Chakra drives that through custom properties that
          inherit, so leaving it unset is what lets the trigger take whichever
          palette the application sets around it rather than a colour this port
          invented.

          One thing the recipe does for free, worth naming because it is not
          obvious from this file: Chakra's `_expanded` condition matches
          `[aria-expanded=true]`, and the button recipe gives that state the same
          background it gives a hover. The pattern already writes
          `aria-expanded` on the trigger, so the trigger reads as active for
          exactly as long as the sheet is up, in Chakra's own colours and with no
          styling of the port's. */}
      <IconButton
        ref={trigger}
        type="button"
        suppressHydrationWarning
        data-tz-trigger=""
        aria-label="Browse the site menu"
        aria-expanded="false"
        aria-controls={SHEET_ID}
        position="fixed"
        insetInlineStart="50%"
        boxSize={TRIGGER_SIZE_TOKEN}
        // Chakra's `sizes.14` is already 56px, comfortably past the floor. The
        // floor is still declared from the constant, so a change to Chakra's own
        // scale cannot drop the trigger under it unnoticed.
        minInlineSize={`${MIN_HIT_TARGET}px`}
        minBlockSize={`${MIN_HIT_TARGET}px`}
        borderRadius="full"
        boxShadow="lg"
        css={{
          // Placed on Chakra's spacing scale, then clamped by the pattern's own
          // ceiling on how far a thumb-reachable trigger may sit from the bottom
          // edge — so neither a larger spacing token nor a tall home-indicator
          // inset can quietly push it out of the thumb zone.
          insetBlockEnd: `min(calc({spacing.${TRIGGER_GAP_TOKEN}} + env(safe-area-inset-bottom, 0px)), ${MAX_TRIGGER_BOTTOM_GAP}px)`,
          // Above the sheet rather than at Chakra's `overlay` level below it:
          // tapping the trigger while the sheet is up is a close path, so it has
          // to stay hit-testable over it. Written as a reference to the token
          // the sheet uses, so the two cannot drift apart.
          zIndex: 'calc({zIndex.modal} + 1)',
          // The trigger scrolls nothing, so this can be declared once and left:
          // without it a real swipe-to-open is read as an attempt to pan the
          // page and the pointer stream is cancelled before the gesture
          // completes. pinch-zoom rather than `none` — refusing the vertical pan
          // is all the swipe needs, and a 56px control is a real thing to zoom
          // over (WCAG 1.4.4).
          touchAction: 'pinch-zoom',
          transform: 'translateX(-50%)',
          // Composed, not replaced. The button recipe declares
          // `transitionProperty: 'common'`, which Chakra expands to
          // `background-color, border-color, color, fill, stroke, opacity,
          // box-shadow, translate, transform` — `transform` among them, so the
          // tuck already rides on the recipe's own list. One element has a single
          // transition list, so restating the property here would have dropped
          // the button's colour and elevation transitions with it. Left alone.
          //
          // The recipe also already sets `moderate`; it is restated so the tuck's
          // timing is pinned to the sheet's rather than tracking whatever the
          // recipe retunes to, and the curve is added, which the recipe leaves
          // at the CSS default.
          transitionDuration: SHEET_DURATION,
          transitionTimingFunction: SHEET_EASING,
          '&[data-tz-tucked="true"]': {
            transform: `translateX(-50%) translateY(calc(100% + {spacing.8} + env(safe-area-inset-bottom, 0px)))`,
          },
          [DESKTOP_QUERY]: { display: 'none' },
          _motionReduce: REDUCED_MOTION_RESET,
        }}
      >
        {/* Chakra's `Icon` sizes and centres the glyph off its own scale —
            `lg` is `sizes.6`, 24px, rather than the 20px the button recipe
            sizes an icon inside a text button to. Drawn inline rather than
            pulled from an icon package, which this project does not depend
            on. */}
        <Icon size="lg">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z" />
          </svg>
        </Icon>
      </IconButton>
    </ChakraProvider>
  )
}
